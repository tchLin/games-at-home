import test from "node:test";
import { WHEEL_ZONES, spinTarget } from "../src/wheel.js";
import { nextWordIdeas, wordSuggestions } from "../src/word-links.js";
import assert from "node:assert/strict";
import {
  newGame,
  nextRound,
  normalize,
  resolve,
  maskWord,
  wheelPoints,
  chainMasks,
  revealChain,
  CHAIN_HISTORY_LIMIT,
} from "../src/engine.js";
import { WHEEL_TOPICS, wheelPrompt, WORDS, DEFAULT_SETTINGS } from "../src/content.js";
const create = (game, extra = {}) =>
  newGame(
    { ...DEFAULT_SETTINGS, game, ...extra },
    ["host", "guest"],
    "game-test",
    1000,
  );
test("wheel scores exact and nearby guesses, alternates roles, finishes at round limit", () => {
  let s = create("wheel", { rounds: 2 });
  assert.equal(s.giver, "host");
  s = {
    ...s,
    phase: "pending",
    pending: { actor: "guest", kind: "guess", value: 50 },
  };
  s = resolve(s, { target: 50 }, 2000);
  assert.equal(s.scores.host, 4);
  assert.equal(s.scores.guest, 4);
  assert.equal(s.phase, "reveal");
  s = nextRound(s);
  assert.equal(s.giver, "guest");
  assert.equal(s.round, 2);
  assert.equal(nextRound(s).phase, "finished");
  assert.equal(wheelPoints(50, 60), 2);
  assert.equal(wheelPoints(50, 64), 1);
  assert.equal(wheelPoints(50, 90), 0);
});
test("wheel timeout reveals the target without awarding points", () => {
  const s = {
    ...create("wheel"),
    phase: "pending",
    pending: { actor: "guest", kind: "timeout" },
  };
  const next = resolve(s, { target: 65 });
  assert.equal(next.result.guess, -1);
  assert.equal(next.result.points, 0);
});
test("word race: correct guesses retain the turn, wrong guesses and hints switch it", () => {
  let s = {
    ...create("chain"),
    phase: "pending",
    turn: "host",
    boards: {
      guest: { masks: ["c·····", "p··", "b··"] },
      host: { masks: ["a··", "s··", "m··"] },
    },
  };
  const secret = { words: ["coffee", "pie", "bed"] };
  s.pending = { actor: "host", kind: "guess", value: "COFFEE", index: 0 };
  s = resolve(s, secret);
  assert.equal(s.turn, "host");
  assert.equal(s.scores.host, 1);
  assert.equal(s.boards.guest.masks[0], "coffee");
  s = {
    ...s,
    phase: "pending",
    pending: { actor: "host", kind: "hint", index: 1 },
  };
  s = resolve(s, secret);
  assert.equal(s.turn, "guest");
  assert.equal(s.boards.guest.masks[1], "pi·");
  s = {
    ...s,
    turn: "host",
    phase: "pending",
    pending: { actor: "host", kind: "guess", value: "wrong", index: 1 },
  };
  s = resolve(s, secret);
  assert.equal(s.turn, "guest");
  assert.equal(s.scores.host, 1);
});
test("last solved word ends the race; duplicate resolution is ignored", () => {
  let s = {
    ...create("chain"),
    phase: "pending",
    turn: "host",
    scores: { host: 2, guest: 0 },
    boards: {
      guest: { masks: ["one", "two", "t····"], solved: { 0: true, 1: true } },
    },
    pending: { actor: "host", kind: "guess", value: "three", index: 2 },
  };
  s = resolve(s, { words: ["one", "two", "three"] });
  assert.equal(s.phase, "finished");
  assert.equal(s.winner, "host");
  assert.equal(resolve(s, { words: ["one", "two", "three"] }), null);
});
test("three clues allows configured guesses, advances hints, and reveals after the final miss", () => {
  let s = {
    ...create("clues", { guessesPerHint: 2 }),
    phase: "pending",
    hintIndex: 1,
    used: 0,
    pending: { actor: "guest", kind: "guess", value: "wrong" },
  };
  s = resolve(s, { word: "coffee" });
  assert.equal(s.phase, "guess");
  assert.equal(s.used, 1);
  s = resolve(
    {
      ...s,
      phase: "pending",
      pending: { actor: "guest", kind: "guess", value: "still wrong" },
    },
    { word: "coffee" },
  );
  assert.equal(s.phase, "hint");
  s = resolve(
    {
      ...s,
      phase: "pending",
      hintIndex: 3,
      pending: { actor: "guest", kind: "timeout" },
    },
    { word: "coffee" },
  );
  assert.equal(s.phase, "reveal");
  assert.equal(s.result.word, "coffee");
  assert.equal(s.result.points, 0);
});
test("three clues rewards early guesses and uses an authoritative next deadline", () => {
  const s = {
    ...create("clues", { timer: 30 }),
    phase: "pending",
    hintIndex: 2,
    used: 0,
    pending: { actor: "guest", kind: "guess", value: "Café" },
  };
  const won = resolve(s, { word: "cafe" }, 10000);
  assert.equal(won.scores.guest, 2);
  const missed = resolve(s, { word: "tea" }, 10000);
  assert.equal(missed.deadline, 40000);
});
test("normalization and masking reveal only requested letters", () => {
  assert.equal(normalize("  CAFÉ! "), "cafe");
  assert.equal(maskWord("coffee"), "c·····");
  assert.equal(maskWord("coffee", 2), "co····");
});

test("the seven scoring zones match the engine and allow edge spins", () => {
  assert.deepEqual(WHEEL_ZONES.map((zone) => zone.points), [1, 2, 3, 4, 3, 2, 1]);
  for (const zone of WHEEL_ZONES)
    assert.equal(wheelPoints(50, 50 + (zone.from + zone.to) / 2), zone.points);
  for (const [gap, points] of [[2, 4], [3, 3], [6, 3], [7, 2], [10, 2], [11, 1], [14, 1], [15, 0]]) {
    assert.equal(wheelPoints(50, 50 + gap), points);
    assert.equal(wheelPoints(50, 50 - gap), points);
  }
  for (let i = 0; i < 100; i++) {
    const target = spinTarget();
    assert.ok(target >= 0 && target <= 100);
  }
});
test("a selected topic supplies matching opposites and changes them across rounds", () => {
  const config = { ...DEFAULT_SETTINGS, topic: "pokemon" };
  const first = wheelPrompt(config, 0, 1);
  assert.deepEqual(first, { topicLabel: "Pokémon", left: "Ugly Pokémon", right: "Pretty Pokémon" });
  for (let round = 1; round <= 12; round++) {
    const prompt = wheelPrompt(config, 0, round);
    assert.equal(prompt.topicLabel, "Pokémon");
    assert.ok(WHEEL_TOPICS.pokemon.pairs.some(([left, right]) => left === prompt.left && right === prompt.right));
  }
  assert.notEqual(wheelPrompt(config, 0, 2).left, first.left);
  const game = create("wheel", { topic: "pokemon" });
  assert.equal(game.topicLabel, "Pokémon");
  assert.equal(nextRound(game).topicLabel, "Pokémon");
});
test("chain suggestions follow the previous word, exclude used words, and allow unknowns", () => {
  assert.ok(nextWordIdeas(" COFFEE ").includes("shop"));
  assert.ok(nextWordIdeas("shop").includes("lifting"));
  assert.ok(nextWordIdeas("lifting").includes("truck"));
  assert.ok(nextWordIdeas("shop").includes("window"));
  assert.ok(nextWordIdeas("window").includes("shopping"));
  assert.ok(nextWordIdeas("shopping").includes("cart"));
  assert.ok(!nextWordIdeas("coffee", ["shop"]).includes("shop"));
  assert.deepEqual(nextWordIdeas("inventedword"), []);
  assert.deepEqual(nextWordIdeas("constructor"), []);
  assert.deepEqual(nextWordIdeas("__proto__"), []);
});

test("fuzzy suggestions handle typing, transpositions, plurals, and accents", () => {
  for (const [typed, matched, kind, suggestion] of [
    ["cof", "coffee", "partial", "shop"],
    ["cofee", "coffee", "typo", "shop"],
    ["cofefe", "coffee", "typo", "shop"],
    ["shpo", "shop", "typo", "window"],
    ["shops", "shop", "plural", "window"],
    ["phones", "phone", "plural", "book"],
    ["mice", "mouse", "plural", "pad"],
    ["CAFÉ", "cafe", "exact", "coffee"],
  ]) {
    const result = wordSuggestions(typed);
    assert.ok(result.matches.some((match) => match.word === matched && match.kind === kind), typed);
    assert.ok(result.ideas.includes(suggestion), typed);
  }
});
test("reverse associations broaden coverage while exact phrase continuations rank first", () => {
  assert.ok(nextWordIdeas("bean").includes("coffee"));
  const ideas = nextWordIdeas("shop");
  assert.ok(ideas.indexOf("window") < ideas.indexOf("coffee"));
  assert.deepEqual(wordSuggestions("car").matches.map((match) => match.word), ["car"]);
  assert.ok(!nextWordIdeas("cofee", ["shops"]).includes("shop"));
  assert.ok(nextWordIdeas("coffee", [], "sh").every((word) => word.startsWith("sh")));
});
test("uncertain or invalid words produce no noisy fuzzy fallback", () => {
  for (const word of ["", "co", "zzzzzz", "x".repeat(41), "__proto__", "constructor", "coffee<script>"])
    assert.deepEqual(wordSuggestions(word), { matches: [], ideas: [] });
});

test("only the first chain initial is shown and hints reveal one letter from zero", () => {
  const words = ["coffee", "shop", "window"];
  const masks = chainMasks(words);
  assert.deepEqual(masks, ["c·····", "····", "······"]);
  const game = { ...create("chain"), phase: "pending", turn: "host", boards: { guest: { masks } }, pending: { actor: "host", kind: "guess", value: "coffee", index: 0 } };
  const correct = resolve(game, { words });
  assert.equal(correct.boards.guest.masks[1], "····");
  const hint = resolve({ ...correct, phase: "pending", pending: { actor: "host", kind: "hint", index: 1 } }, { words });
  assert.equal(hint.boards.guest.masks[1], "s···");
  assert.equal(hint.turn, "guest");
  assert.equal(hint.boards.guest.letters[1], 1);
});
test("guess history is per word, records successes, and keeps bounded recent attempts", () => {
  const words = ["coffee", "shop", "window"];
  let game = { ...create("chain"), boards: { guest: { masks: chainMasks(words) } } };
  for (let i = 0; i < 60; i++)
    game = resolve({ ...game, phase: "pending", pending: { actor: "host", kind: "guess", value: `miss${i}`, index: 1 } }, { words });
  game = resolve({ ...game, phase: "pending", pending: { actor: "host", kind: "guess", value: "shop", index: 1 } }, { words });
  assert.equal(game.boards.guest.guessCounts[1], 61);
  assert.equal(game.boards.guest.guesses[1].length, CHAIN_HISTORY_LIMIT);
  assert.deepEqual(game.boards.guest.guesses[1].at(-1), { guess: "shop", correct: true });
  assert.equal(game.boards.guest.guesses[0], undefined);
});
test("chain answers are published only after the game and only for a matching secret", () => {
  const game = { ...create("chain"), boards: { host: { masks: chainMasks(["coffee", "shop", "window"]) } } };
  const secret = { gameId: game.id, round: game.round, words: ["coffee", "shop", "window"] };
  assert.equal(revealChain(game, secret, "host"), null);
  const finished = { ...game, phase: "finished" };
  assert.equal(revealChain(finished, { ...secret, gameId: "old-game" }, "host"), null);
  const revealed = revealChain(finished, secret, "host");
  assert.deepEqual(revealed.boards.host.answers, secret.words);
  assert.equal(revealChain(revealed, secret, "host"), null);
});
test("each wheel topic has 16 distinct pairs and edge centers score correctly", () => {
  for (const topic of Object.values(WHEEL_TOPICS)) {
    assert.equal(topic.pairs.length, 16);
    assert.equal(new Set(topic.pairs.map((pair) => pair.join("|"))).size, 16);
  }
  assert.equal(wheelPoints(0, 0), 4);
  assert.equal(wheelPoints(100, 100), 4);
  assert.equal(wheelPoints(0, 10), 2);
  assert.equal(wheelPoints(100, 90), 2);
});
test("clue topics support fixed choices and change each round in surprise mode", () => {
  assert.ok(Object.keys(WORDS).length >= 24);
  const fixed = create("clues", { category: "Space" });
  assert.equal(fixed.topicLabel, "Space");
  assert.equal(nextRound(fixed).topicLabel, "Space");
  const surprise = create("clues", { category: "surprise" });
  assert.ok(WORDS[surprise.topicLabel]);
  assert.notEqual(nextRound(surprise).topicLabel, surprise.topicLabel);
});
