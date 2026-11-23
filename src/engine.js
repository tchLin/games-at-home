import { wheelPrompt, clueTopic } from "./content.js";
import { wheelPoints } from "./wheel.js";
export { wheelPoints } from "./wheel.js";
export const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export const other = (s, uid) => s.players.find((p) => p !== uid);
export const deadline = (s, now) =>
  s.config.timer ? now + s.config.timer * 1000 : 0;
export const maskWord = (word, count = 1) =>
  [...word].map((c, i) => (i < count ? c : "·")).join("");
export const chainMasks = (words) => words.map((word, index) => maskWord(word, index === 0 ? 1 : 0));
export const CHAIN_HISTORY_LIMIT = 50;
export function revealChain(s, secret, uid) {
  if (s.game !== "chain" || s.phase !== "finished" || !s.boards?.[uid] ||
      s.boards[uid].answers || secret?.gameId !== s.id || secret.round !== s.round || !secret.words)
    return null;
  return { ...s, boards: { ...s.boards, [uid]: { ...s.boards[uid], answers: [...secret.words] } } };
}
export function newRound(s, now = Date.now()) {
  const giver = s.players[(s.round - 1) % 2];
  const common = {
    id: s.id,
    game: s.game,
    round: s.round,
    config: s.config,
    players: s.players,
    scores: s.scores,
    giver,
    phase: "prepare",
    deadline: 0,
    revision: (s.revision || 0) + 1,
  };
  if (s.game === "wheel") {
    return {
      ...common,
      topicSeed: s.topicSeed,
      ...wheelPrompt(s.config, s.topicSeed, s.round),
    };
  }
  if (s.game === "chain")
    return { ...common, phase: "setup", turn: s.players[0], boards: {} };
  if (s.game === "reverse") return { ...common, recorded: false, plays: 0 };
  return { ...common, topicSeed: s.topicSeed, topicLabel: clueTopic(s.config, s.topicSeed, s.round), hints: [], attempts: [], hintIndex: 0, used: 0 };
}
export function newGame(config, players, id, now = Date.now()) {
  return newRound(
    {
      id,
      game: config.game,
      config: { ...config },
      players,
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      round: 1,
      topicSeed: Math.floor(Math.random() * 100),
    },
    now,
  );
}
export function nextRound(s, now = Date.now()) {
  if (s.round >= s.config.rounds || s.game === "chain")
    return { ...s, phase: "finished", deadline: 0 };
  return newRound({ ...s, round: s.round + 1 }, now);
}
export function resolve(s, secret, now = Date.now()) {
  if (s.phase !== "pending" || !s.pending || !secret) return null;
  if (s.game === "reverse") return s.pending.kind === "timeout" ? judgeReverse(s, secret, false) : null;
  const p = s.pending;
  const next = structuredClone(s);
  delete next.pending;
  next.deadline = 0;
  if (s.game === "wheel") {
    const points =
      p.kind === "timeout" ? 0 : wheelPoints(secret.target, p.value);
    next.result = {
      target: secret.target,
      guess: p.kind === "timeout" ? -1 : p.value,
      points,
      timedOut: p.kind === "timeout",
    };
    next.scores[s.giver] += points;
    next.scores[other(s, s.giver)] += points;
    next.phase = "reveal";
  } else if (s.game === "chain") {
    const owner = other(s, p.actor);
    const board = next.boards[owner];
    const word = secret.words[p.index];
    if (!word || board.solved?.[p.index]) return null;
    board.solved ||= {};
    board.letters ||= {};
    if (p.kind === "guess") {
      board.guesses ||= {};
      board.guessCounts ||= {};
      board.guesses[p.index] = [
        ...(board.guesses[p.index] || []),
        { guess: p.value, correct: normalize(p.value) === normalize(word) },
      ].slice(-CHAIN_HISTORY_LIMIT);
      board.guessCounts[p.index] = (board.guessCounts[p.index] || 0) + 1;
    }
    if (p.kind === "guess" && normalize(p.value) === normalize(word)) {
      board.solved[p.index] = true;
      board.masks[p.index] = word;
      next.scores[p.actor] += 1;
      next.feedback = {
        actor: p.actor,
        text: `“${word}” — you got it! Keep going.`,
        kind: "correct",
      };
    } else {
      if (p.kind === "hint") {
        board.letters[p.index] = Math.min(
          (board.letters[p.index] ?? [...board.masks[p.index]].filter((c) => c !== "·").length) + 1,
          [...word].length,
        );
        board.masks[p.index] = maskWord(word, board.letters[p.index]);
      }
      next.feedback = {
        actor: p.actor,
        text:
          p.kind === "hint"
            ? "One more letter revealed. Time to swap turns."
            : p.kind === "timeout"
              ? "Time’s up. The turn passes over."
              : `“${p.value}” wasn’t it. The turn passes over.`,
        kind: "neutral",
      };
      next.turn = owner;
    }
    const complete = Object.keys(board.solved).length === secret.words.length;
    next.phase = complete ? "finished" : "guess";
    if (complete) next.winner = p.actor;
    else next.deadline = deadline(s, now);
  } else {
    const correct =
      p.kind !== "timeout" && normalize(p.value) === normalize(secret.word);
    const attempts = [
      ...(s.attempts || []),
      {
        guess: p.kind === "timeout" ? "Time’s up" : p.value,
        correct,
        hint: s.hintIndex,
      },
    ];
    const used = p.kind === "timeout" ? s.config.guessesPerHint : s.used + 1;
    next.attempts = attempts;
    next.used = used;
    if (correct || (used >= s.config.guessesPerHint && s.hintIndex >= 3)) {
      const points = correct ? 4 - s.hintIndex : 0;
      next.result = { word: secret.word, points, correct };
      next.scores[p.actor] += points;
      next.phase = "reveal";
    } else if (used >= s.config.guessesPerHint) {
      next.phase = "hint";
    } else {
      next.phase = "guess";
      next.deadline = deadline(s, now);
    }
  }
  return next;
}

export function judgeReverse(s, secret, pass, skip = false) {
  if (s.game !== 'reverse' || secret?.gameId !== s.id || secret.round !== s.round || !secret.word ||
      (!skip && s.phase !== 'pending') || (skip && s.phase !== 'recording')) return null;
  const correct = !skip && s.pending?.kind === 'guess' && Boolean(pass);
  const points = correct ? 1 : 0;
  return { ...s, phase: 'reveal', deadline: 0,
    result: { word: secret.word, correct, points, timedOut: s.pending?.kind === 'timeout' },
    scores: { ...s.scores, [other(s, s.giver)]: s.scores[other(s, s.giver)] + points } };
}
