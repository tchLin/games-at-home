import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import "firebase/compat/database";
import {
  ref,
  set,
  get,
  update,
  runTransaction,
  remove,
} from "firebase/database";
import { newGame, nextRound, resolve, maskWord, chainMasks, revealChain, judgeReverse } from "../src/engine.js";
import { DEFAULT_SETTINGS } from "../src/content.js";
import { requestGameChange, respondToGameChange, completeGameChange } from "../src/game-change.js";
import { lobbyStartUpdate } from "../src/lobby.js";
import { joinRoom } from "../src/rooms.js";
import { reverseWav, toBase64, MAX_AUDIO_BASE64 } from '../src/reverse-audio.js';
import { reverseWordAssignment } from '../src/reverse-game.js';
import { postGameUpdate } from '../src/post-game.js';
let env;
const token = (email) => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
});
const context = (uid, email = `${uid}@example.test`) =>
  env.authenticatedContext(uid, token(email)).database();
const anonymous = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).database();
const h = () => anonymous("host"),
  g = () => anonymous("guest"),
  outsider = () => anonymous("stranger");
const meta = (host = "host", slot = "1") => ({
  host,
  code: `${slot}ABCDEFG`,
  open: true,
  createdAt: Date.now(),
  leaseEnd: Date.now() + 86400000,
});
async function seed() {
  await env.withSecurityRulesDisabled(async (c) => {
    await set(ref(c.database()), {
      priority: {
        "owner@example%2Etest": true,
        "partner@example%2Etest": true,
      },
      rooms: {
        1: {
          meta: { ...meta(), guest: "guest" },
          settings: DEFAULT_SETTINGS,
          ready: { host: 1, guest: 1 },
          players: { host: { name: "Host" }, guest: { name: "Guest" } },
        },
      },
    });
  });
}
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-games-at-home",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync(
        new URL("../database.rules.json", import.meta.url),
        "utf8",
      ),
    },
  });
});
beforeEach(async () => {
  await env.clearDatabase();
  await seed();
});
after(async () => {
  await env.cleanup();
});
test("unauthenticated and unverified accounts cannot read or create rooms", async () => {
  for (const database of [
    env.unauthenticatedContext().database(),
    env
      .authenticatedContext("unverified", {
        email: "x@example.test",
        email_verified: false,
        firebase: { sign_in_provider: "google.com" },
      })
      .database(),
  ]) {
    await assertFails(get(ref(database, "rooms/1/meta")));
    await assertFails(set(ref(database, "rooms/2/meta"), meta("anon", "2")));
  }
});
test("anonymous and verified Google players can each host and join public rooms", async () => {
  for (const [slot, hostDb, guestDb] of [["2", h(), g()], ["3", context("host"), context("guest")]]) {
    await assertSucceeds(set(ref(hostDb, `rooms/${slot}/meta`), meta("host", slot)));
    await assertSucceeds(update(ref(guestDb, `rooms/${slot}/meta`), { guest: "guest", joinCode: `${slot}ABCDEFG` }));
    await assertSucceeds(get(ref(guestDb, `rooms/${slot}/meta`)));
  }
});
test("an anonymous identity cannot impersonate a priority email", async () => {
  const spoof = env.authenticatedContext("owner", { email: "owner@example.test", email_verified: true, firebase: { sign_in_provider: "anonymous" } }).database();
  await assertFails(set(ref(spoof, "rooms/0/meta"), meta("owner", "0")));
  await assertFails(get(ref(spoof, "priority/owner@example%2Etest")));
});
test("only fixed room slots exist and only priority accounts can use slot zero", async () => {
  await assertFails(set(ref(h(), "rooms/5/meta"), meta("host", "5")));
  await assertFails(set(ref(h(), "rooms/0/meta"), meta("host", "0")));
  await assertSucceeds(
    set(
      ref(context("owner", "owner@example.test"), "rooms/0/meta"),
      meta("owner", "0"),
    ),
  );
  await assertFails(get(ref(outsider(), "rooms/0/meta")));
  await assertFails(update(ref(outsider(), "rooms/0/meta"), { guest: "stranger", joinCode: "0ABCDEFG" }));
  await assertFails(set(ref(context("regular"), "rooms/0/meta"), meta("regular", "0")));
  await assertSucceeds(
    update(ref(context("partner", "partner@example.test"), "rooms/0/meta"), {
      guest: "partner",
      joinCode: "0ABCDEFG",
    }),
  );
});
test("priority allowlist is private, immutable, and cannot be claimed with an unverified email", async () => {
  await assertSucceeds(
    get(
      ref(
        context("owner", "owner@example.test"),
        "priority/owner@example%2Etest",
      ),
    ),
  );
  await assertFails(get(ref(outsider(), "priority/owner@example%2Etest")));
  await assertFails(get(ref(h(), "priority")));
  await assertFails(set(ref(h(), "priority/host@example%2Etest"), true));
});
test("third player cannot claim an occupied guest seat or read room state", async () => {
  await assertFails(set(ref(outsider(), "rooms/1/meta/guest"), "stranger"));
  await assertFails(get(ref(outsider(), "rooms/1/players")));
  await assertFails(get(ref(outsider(), "rooms/1/state")));
  await assertSucceeds(set(ref(g(), "rooms/1/meta/guest"), "guest"));
  await assertFails(set(ref(g(), "rooms/1/meta/host"), "guest"));
});
test("room codes cannot be enumerated and joining requires the correct invitation", async () => {
  await set(ref(h(), "rooms/2/meta"), meta("host", "2"));
  await assertFails(get(ref(outsider(), "rooms/2/meta")));
  await assertFails(
    update(ref(outsider(), "rooms/2/meta"), {
      guest: "stranger",
      joinCode: "2WRONGXX",
    }),
  );
  await assertFails(set(ref(outsider(), "rooms/2/meta/guest"), "stranger"));
  await assertSucceeds(
    update(ref(outsider(), "rooms/2/meta"), {
      guest: "stranger",
      joinCode: "2ABCDEFG",
    }),
  );
  await assertSucceeds(get(ref(outsider(), "rooms/2/meta")));
});
test("host controls settings; a guest can acknowledge only their own readiness", async () => {
  await assertSucceeds(set(ref(h(), "rooms/1/settings"), DEFAULT_SETTINGS));
  await assertFails(
    set(ref(g(), "rooms/1/settings"), { ...DEFAULT_SETTINGS, timer: 300 }),
  );
  await assertSucceeds(set(ref(g(), "rooms/1/ready/guest"), 1));
  await assertFails(set(ref(g(), "rooms/1/ready/host"), 1));
  await assertFails(set(ref(h(), "rooms/1/settings/extra"), "unbounded data"));
});
test("secret answers are owner-only, with bounded word lengths and list sizes", async () => {
  const secret = {
    gameId: "match",
    round: 1,
    words: ["coffee", "shop", "truck"],
  };
  await assertSucceeds(set(ref(h(), "secrets/1/host"), secret));
  await assertSucceeds(get(ref(h(), "secrets/1/host")));
  await assertFails(get(ref(g(), "secrets/1/host")));
  await assertFails(get(ref(h(), "secrets/1")));
  await assertFails(set(ref(g(), "secrets/1/host"), secret));
  await assertFails(set(ref(h(), "secrets/1/host/words/12"), "extra"));
  await assertFails(set(ref(h(), "secrets/1/host/words/0"), "a".repeat(41)));
  await assertFails(set(ref(h(), "secrets/1/host/unexpected"), "secret"));
});
test("two clients complete a wheel round without exposing the target early", async () => {
  let state = newGame(DEFAULT_SETTINGS, ["host", "guest"], "wheel-match");
  await assertSucceeds(set(ref(h(), "rooms/1/state"), state));
  await assertSucceeds(
    set(ref(h(), "secrets/1/host"), { gameId: state.id, round: 1, target: 70 }),
  );
  state = { ...state, phase: "guess", clue: "Pikachu" };
  await assertSucceeds(set(ref(h(), "rooms/1/state"), state));
  const guestView = (await get(ref(g(), "rooms/1/state"))).val();
  assert.equal(guestView.target, undefined);
  const pending = {
    ...guestView,
    phase: "pending",
    pending: { actor: "guest", kind: "guess", value: 72 },
  };
  await assertSucceeds(set(ref(g(), "rooms/1/state"), pending));
  const result = resolve(pending, { target: 70 });
  await assertSucceeds(set(ref(h(), "rooms/1/state"), result));
  const revealed = (await get(ref(g(), "rooms/1/state"))).val();
  assert.equal(revealed.result.points, 4);
  assert.equal(revealed.result.target, 70);
});
test("word-list preparation can commit concurrently without losing either list", async () => {
  const state = newGame(
    { ...DEFAULT_SETTINGS, game: "chain", wordCount: 3 },
    ["host", "guest"],
    "words-match",
  );
  await set(ref(h(), "rooms/1/state"), state);
  await Promise.all(
    ["host", "guest"].map(async (uid) => {
      const db = anonymous(uid);
      await get(ref(db, "rooms/1/state"));
      const result = await runTransaction(
        ref(db, "rooms/1/state"),
        (current) =>
          current
            ? {
                ...current,
                boards: {
                  ...current.boards,
                  [uid]: {
                    masks: ["coffee", "truck", "shop"].map((w) => maskWord(w)),
                  },
                },
              }
            : null,
        { applyLocally: false },
      );
      assert.equal(result.committed, true);
    }),
  );
  const result = (await get(ref(h(), "rooms/1/state"))).val();
  assert.ok(result.boards.host);
  assert.ok(result.boards.guest);
});
test("all three game state shapes pass validation and large extra payloads fail", async () => {
  for (const game of ["wheel", "chain", "clues"]) {
    const state = newGame(
      { ...DEFAULT_SETTINGS, game },
      ["host", "guest"],
      `${game}-match`,
    );
    await assertSucceeds(set(ref(h(), "rooms/1/state"), state));
    await assertFails(set(ref(h(), "rooms/1/state/garbage"), "x".repeat(1000)));
  }
});
test("guest rejoining the same anonymous identity preserves state; strangers cannot take over an active host", async () => {
  const state = newGame(DEFAULT_SETTINGS, ["host", "guest"], "saved-match");
  await set(ref(h(), "rooms/1/state"), state);
  await assertSucceeds(set(ref(g(), "rooms/1/meta/guest"), "guest"));
  assert.equal(
    (await get(ref(anonymous("guest"), "rooms/1/state"))).val().id,
    "saved-match",
  );
  await assertFails(set(ref(outsider(), "rooms/1/meta"), meta("stranger")));
});
test("presence is bounded to three browser tabs per seat and only writable by its owner", async () => {
  await assertSucceeds(set(ref(g(), "rooms/1/presence/guest/0"), true));
  await assertFails(set(ref(g(), "rooms/1/presence/guest/3"), true));
  await assertFails(set(ref(g(), "rooms/1/presence/host/0"), true));
});
test("closed rooms reject gameplay and allow a new host to reclaim the slot", async () => {
  await assertSucceeds(set(ref(h(), "rooms/1/meta/open"), false));
  await assertFails(set(ref(g(), "rooms/1/meta/guest"), "guest"));
  await assertFails(
    set(ref(g(), "secrets/1/guest"), { gameId: "x", round: 1, word: "coffee" }),
  );
  await assertSucceeds(set(ref(outsider(), "rooms/1/meta"), meta("stranger")));
});

test("actual invite flow admits a fresh anonymous client, saves its nickname, and reconnects", async () => {
  const hostDb = anonymous("invite-host");
  const guestDb = anonymous("fresh-guest");
  await set(ref(hostDb, "rooms/2/meta"), meta("invite-host", "2"));
  await assertSucceeds(joinRoom(guestDb, "2ABCDEFG", "fresh-guest", "Sam"));
  assert.equal(
    (await get(ref(hostDb, "rooms/2/players/fresh-guest/name"))).val(),
    "Sam",
  );
  await assertSucceeds(
    joinRoom(anonymous("fresh-guest"), "2ABCDEFG", "fresh-guest", "Sam again"),
  );
  await assertSucceeds(joinRoom(hostDb, "2ABCDEFG", "invite-host", "Host"));
  for (const uid of ['third-guest', 'fourth-guest', 'fifth-guest'])
    await assertSucceeds(joinRoom(anonymous(uid), '2ABCDEFG', uid, uid));
  await assert.rejects(joinRoom(anonymous('sixth-guest'), '2ABCDEFG', 'sixth-guest', 'Sixth'), /full/);
});
test("actual invite flow rejects wrong codes and anonymous reserved-room entry", async () => {
  await set(ref(h(), "rooms/2/meta"), meta("host", "2"));
  await assert.rejects(
    joinRoom(anonymous("wrong-code"), "2ZZZZZZZ", "wrong-code", "Sam"),
    /full, playing a game, closed, or the code is incorrect/,
  );
  assert.equal((await get(ref(h(), "rooms/2/meta/guest"))).val(), null);
  await set(
    ref(context("owner", "owner@example.test"), "rooms/0/meta"),
    meta("owner", "0"),
  );
  await assert.rejects(
    joinRoom(anonymous("public-guest"), "0ABCDEFG", "public-guest", "Sam"),
    /full, playing a game, closed, or the code is incorrect/,
  );
});

test("chain guesses sync per word and full answers are shared only at game end", async () => {
  let state = newGame({ ...DEFAULT_SETTINGS, game: "chain", wordCount: 3 }, ["host", "guest"], "chain-review");
  const hostSecret = { gameId: state.id, round: 1, words: ["coffee", "shop", "window"] };
  const guestSecret = { gameId: state.id, round: 1, words: ["rain", "bow", "tie"] };
  state = { ...state, phase: "guess", boards: { host: { masks: chainMasks(hostSecret.words) }, guest: { masks: chainMasks(guestSecret.words) } } };
  await set(ref(h(), "rooms/1/state"), state);
  await set(ref(h(), "secrets/1/host"), hostSecret);
  await set(ref(g(), "secrets/1/guest"), guestSecret);
  await assertFails(set(ref(h(), "rooms/1/state/boards/host/answers"), hostSecret.words));
  await assertFails(get(ref(g(), "secrets/1/host")));
  state = resolve({ ...state, phase: "pending", pending: { actor: "guest", kind: "guess", value: "tea", index: 0 } }, hostSecret);
  await assertSucceeds(set(ref(h(), "rooms/1/state"), state));
  assert.equal((await get(ref(g(), "rooms/1/state/boards/host/guesses/0/0/guess"))).val(), "tea");
  await assertFails(set(ref(h(), "rooms/1/state/boards/host/guesses/0/50"), { guess: "extra", correct: false }));
  await assertFails(set(ref(h(), "rooms/1/state/boards/host/guesses/12/0"), { guess: "extra", correct: false }));
  state = { ...state, phase: "finished", winner: "guest" };
  await set(ref(h(), "rooms/1/state"), state);
  await assertFails(set(ref(g(), "rooms/1/state/boards/host/answers"), hostSecret.words));
  await assertFails(set(ref(h(), "rooms/1/state/boards/host/answers"), ["fake", "shop", "window"]));
  state = revealChain(state, hostSecret, "host");
  await assertSucceeds(set(ref(h(), "rooms/1/state"), state));
  state = revealChain(state, guestSecret, "guest");
  await assertSucceeds(set(ref(g(), "rooms/1/state"), state));
  assert.deepEqual((await get(ref(h(), "rooms/1/state/boards/guest/answers"))).val(), guestSecret.words);
  assert.deepEqual((await get(ref(g(), "rooms/1/state/boards/host/answers"))).val(), hostSecret.words);
  await assertFails(get(ref(outsider(), "rooms/1/state")));
});

test("readiness survives settings changes and an unready guest blocks atomic start", async () => {
  await assertSucceeds(set(ref(g(), "rooms/1/ready/guest"), 0));
  const config = { ...DEFAULT_SETTINGS, version: 4, rounds: 12 };
  await assertFails(update(ref(h()), lobbyStartUpdate("rooms/1", config, ["host", "guest"], "ready-match")));
  assert.equal((await get(ref(h(), "rooms/1/settings/version"))).val(), 1);
  await set(ref(g(), "rooms/1/ready/guest"), 1);
  await set(ref(h(), "rooms/1/settings"), { ...DEFAULT_SETTINGS, version: 3 });
  assert.equal((await get(ref(h(), "rooms/1/ready/guest"))).val(), 1);
  await assertSucceeds(update(ref(h()), lobbyStartUpdate("rooms/1", config, ["host", "guest"], "ready-match")));
  assert.equal((await get(ref(g(), "rooms/1/state/config/rounds"))).val(), 12);
  assert.equal((await get(ref(g(), "rooms/1/ready"))).val(), null);
  // Gameplay remains writable after readiness resets, and a later match needs Ready again.
  await assertSucceeds(set(ref(g(), "rooms/1/state/phase"), "clue"));
  await assertFails(update(ref(h()), lobbyStartUpdate("rooms/1", config, ["host", "guest"], "next-match")));
});

test("either player can request a game change and the other agrees before returning together", async () => {
  for (const requester of ["host", "guest"]) {
    const state = newGame(DEFAULT_SETTINGS, ["host", "guest"], `vote-${requester}`);
    await set(ref(g(), "rooms/1/ready/guest"), 1);
    await set(ref(h(), "rooms/1/state"), state);
    const requesterDb = requester === "host" ? h() : g();
    const responder = requester === "host" ? "guest" : "host";
    const responderDb = requester === "host" ? g() : h();
    await requestGameChange(requesterDb, "rooms/1", state.id, requester);
    const request = (await get(ref(responderDb, "rooms/1/gameChange"))).val();
    await assert.rejects(respondToGameChange(requesterDb, "rooms/1", request, requester, true), /other player/);
    await assertFails(set(ref(requesterDb, "rooms/1/gameChange/accepted"), true));
    await assertFails(completeGameChange(h(), "rooms/1", request));
    await respondToGameChange(responderDb, "rooms/1", request, responder, true);
    const accepted = (await get(ref(h(), "rooms/1/gameChange"))).val();
    await assertFails(completeGameChange(g(), "rooms/1", accepted));
    await assertSucceeds(completeGameChange(h(), "rooms/1", accepted));
    for (const client of [h(), g()]) {
      assert.equal((await get(ref(client, "rooms/1/state"))).val(), null);
      assert.equal((await get(ref(client, "rooms/1/ready"))).val(), null);
      assert.equal((await get(ref(client, "rooms/1/meta/code"))).val(), "1ABCDEFG");
      assert.equal((await get(ref(client, "rooms/1/settings/game"))).val(), "wheel");
    }
  }
});
test("declining and cancelling keep the match; stale requests cannot end a newer game", async () => {
  const state = newGame(DEFAULT_SETTINGS, ["host", "guest"], "original-game");
  await set(ref(h(), "rooms/1/state"), state);
  await requestGameChange(g(), "rooms/1", state.id, "guest");
  const first = (await get(ref(h(), "rooms/1/gameChange"))).val();
  await respondToGameChange(h(), "rooms/1", first, "host", false);
  assert.equal((await get(ref(g(), "rooms/1/state/id"))).val(), state.id);
  await requestGameChange(g(), "rooms/1", state.id, "guest");
  const second = (await get(ref(g(), "rooms/1/gameChange"))).val();
  await assert.rejects(respondToGameChange(h(), "rooms/1", first, "host", true), /request has changed/);
  await respondToGameChange(g(), "rooms/1", second, "guest", false);
  assert.equal((await get(ref(h(), "rooms/1/state/id"))).val(), state.id);
  await requestGameChange(h(), "rooms/1", state.id, "host");
  const third = (await get(ref(g(), "rooms/1/gameChange"))).val();
  await respondToGameChange(g(), "rooms/1", third, "guest", true);
  const approved = (await get(ref(h(), "rooms/1/gameChange"))).val();
  await completeGameChange(h(), "rooms/1", approved);
  await set(ref(g(), "rooms/1/ready/guest"), 1);
  await update(ref(h()), lobbyStartUpdate("rooms/1", DEFAULT_SETTINGS, ["host", "guest"], "new-game"));
  await assertFails(completeGameChange(h(), "rooms/1", approved));
  assert.equal((await get(ref(g(), "rooms/1/state/id"))).val(), "new-game");
});
test("change-game requests cannot be forged by outsiders or tied to another match", async () => {
  const state = newGame(DEFAULT_SETTINGS, ["host", "guest"], "private-vote");
  await set(ref(h(), "rooms/1/state"), state);
  await assertFails(requestGameChange(outsider(), "rooms/1", state.id, "stranger"));
  await assertFails(requestGameChange(g(), "rooms/1", state.id, "host"));
  await assertFails(requestGameChange(g(), "rooms/1", "wrong-game", "guest"));
  await requestGameChange(g(), "rooms/1", state.id, "guest");
  await assertFails(get(ref(outsider(), "rooms/1/gameChange")));
  await assertFails(set(ref(g(), "rooms/1/gameChange/extra"), "unbounded"));
  await assert.rejects(requestGameChange(h(), "rooms/1", state.id, "host"), /already a change-game request/);
});

async function reverseFixture() {
  const state = newGame({ ...DEFAULT_SETTINGS, game: 'reverse', reverseSyllables: 2 }, ['host','guest'], 'reverse-match');
  const secret = { gameId: state.id, round: 1, word: 'banana' };
  const clip = { roomCode: '1ABCDEFG', gameId: state.id, round: 1, owner: 'host',
    data: toBase64(reverseWav([new Float32Array(1200).fill(.2)], 12000)) };
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), state));
  await assertSucceeds(set(ref(h(), 'secrets/1/host'), secret));
  return { state, secret, clip };
}
test('reverse audio is private, bounded, and uploadable once by the recording player', async () => {
  const { state, clip } = await reverseFixture();
  clip.data = toBase64(reverseWav([new Float32Array(12000 * 8).fill(.2)], 12000));
  await assertFails(set(ref(h(), 'roundAudio/1'), clip));
  await assertFails(set(ref(g(), 'rooms/1/state'), { ...state, recorded: true, phase: 'recording' }));
  const recording = { ...state, recorded: true, phase: 'recording' };
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), recording));
  await assertFails(set(ref(g(), 'roundAudio/1'), { ...clip, owner: 'guest' }));
  await assertFails(set(ref(h(), 'roundAudio/1'), { ...clip, roomCode: '1WRONGGG' }));
  await assertFails(set(ref(h(), 'roundAudio/1'), { ...clip, round: 2 }));
  await assertFails(set(ref(h(), 'roundAudio/1'), { ...clip, data: 'UklGR' + 'a'.repeat(MAX_AUDIO_BASE64) }));
  await assertFails(set(ref(h(), 'roundAudio/1'), { ...clip, data: 'https://attacker.example/audio.wav' }));
  await assertSucceeds(set(ref(h(), 'roundAudio/1'), clip));
  await assertFails(set(ref(h(), 'roundAudio/1'), clip));
  await assertFails(remove(ref(h(), 'roundAudio/1')));
  await assertFails(set(ref(h(), 'rooms/1/state'), state));
  assert.equal((await assertSucceeds(get(ref(g(), 'roundAudio/1')))).val().data, clip.data);
  await assertFails(get(ref(outsider(), 'roundAudio/1')));
  await assertFails(get(ref(g(), 'roundAudio')));
  await assertFails(get(ref(g(), 'secrets/1/host')));
});
test('reverse permits five listens and one guess; only giver can pass and roles alternate', async () => {
  let { state, secret, clip } = await reverseFixture();
  state = { ...state, phase: 'recording', recorded: true };
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), state));
  await assertFails(set(ref(h(), 'rooms/1/state'), { ...state, phase: 'guess' }));
  await assertSucceeds(set(ref(h(), 'roundAudio/1'), clip));
  state = { ...state, phase: 'guess' };
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), state));
  await assertFails(set(ref(h(), 'rooms/1/state'), { ...state, plays: 1 }));
  for (let i = 1; i <= 5; i++) {
    state = { ...state, plays: i };
    await assertSucceeds(set(ref(g(), 'rooms/1/state'), state));
  }
  await assertFails(set(ref(g(), 'rooms/1/state'), { ...state, plays: 6 }));
  await assertFails(set(ref(g(), 'rooms/1/state'), { ...state, plays: 0 }));
  await assertFails(set(ref(h(), 'rooms/1/state'), { ...state, phase: 'pending', pending: { actor: 'guest', kind: 'guess', value: 'banana' } }));
  state = { ...state, phase: 'pending', pending: { actor: 'guest', kind: 'guess', value: 'bananna' } };
  await assertSucceeds(set(ref(g(), 'rooms/1/state'), state));
  await assertFails(set(ref(g(), 'rooms/1/state'), { ...state, pending: { ...state.pending, value: 'apple' } }));
  await assertFails(set(ref(g(), 'rooms/1/state'), { ...state, phase: 'guess' }));
  const passed = judgeReverse(state, secret, true);
  await assertFails(set(ref(g(), 'rooms/1/state'), passed));
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), passed));
  const next = nextRound(passed);
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), next));
  await assertFails(get(ref(g(), 'roundAudio/1')));
  await assertSucceeds(remove(ref(h(), 'roundAudio/1')));
  assert.equal(next.giver, 'guest');
  await assertSucceeds(set(ref(g(), 'secrets/1/guest'), { gameId: state.id, round: 2, word: 'coffee' }));
  await assertSucceeds(set(ref(g(), 'rooms/1/state'), { ...next, recorded: true, phase: 'recording' }));
  await assertSucceeds(set(ref(g(), 'roundAudio/1'), { ...clip, owner: 'guest', round: 2 }));
});
test('reverse timeout and skip reveal for zero; game change deletes the recording', async () => {
  let { state, secret, clip } = await reverseFixture();
  state = { ...state, recorded: true, phase: 'recording' };
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), state));
  await assertSucceeds(set(ref(h(), 'roundAudio/1'), clip));
  state = { ...state, phase: 'guess', deadline: Date.now() - 1000 };
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), state));
  state = { ...state, phase: 'pending', deadline: 0, pending: { actor: 'guest', kind: 'timeout' } };
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), state));
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), resolve(state, secret)));
  await requestGameChange(g(), 'rooms/1', state.id, 'guest');
  const request = (await get(ref(h(), 'rooms/1/gameChange'))).val();
  await respondToGameChange(h(), 'rooms/1', request, 'host', true);
  await assertSucceeds(completeGameChange(h(), 'rooms/1', { ...request, accepted: true }));
  await env.withSecurityRulesDisabled(async (c) => assert.equal((await get(ref(c.database(), 'roundAudio/1'))).val(), null));
  await assertSucceeds(set(ref(g(), 'rooms/1/ready/guest'), 1));
  const match = newGame({ ...DEFAULT_SETTINGS, game: 'reverse' }, ['host','guest'], 'skip-match');
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), match));
  const recording = { ...match, recorded: true, phase: 'recording' };
  const target = { gameId: match.id, round: 1, word: 'cat' };
  await assertSucceeds(set(ref(h(), 'secrets/1/host'), target));
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), recording));
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), judgeReverse(recording, target, false, true)));
});

test('automatic secret assignment survives concurrent tabs and exact guesses resolve privately', async () => {
  let { state, secret, clip } = await reverseFixture();
  const first = h(), second = h();
  await Promise.all([
    runTransaction(ref(first, 'secrets/1/host'), (current) => reverseWordAssignment(current, state, 'apple'), { applyLocally: false }),
    runTransaction(ref(second, 'secrets/1/host'), (current) => reverseWordAssignment(current, state, 'coffee'), { applyLocally: false }),
  ]);
  assert.equal((await get(ref(h(), 'secrets/1/host'))).val().word, 'banana');
  state = { ...state, phase: 'recording', recorded: true };
  await set(ref(h(), 'rooms/1/state'), state);
  await set(ref(h(), 'roundAudio/1'), clip);
  state = { ...state, phase: 'guess' };
  await set(ref(h(), 'rooms/1/state'), state);
  state = { ...state, phase: 'pending', pending: { actor: 'guest', kind: 'guess', value: 'BANANA' } };
  await set(ref(g(), 'rooms/1/state'), state);
  const resolved = resolve(state, secret);
  assert.equal(resolved.phase, 'reveal');
  assert.equal(resolved.scores.guest, 1);
  await assertSucceeds(set(ref(h(), 'rooms/1/state'), resolved));
  assert.equal((await get(ref(g(), 'rooms/1/state/result/word'))).val(), 'banana');
  await assertFails(get(ref(g(), 'secrets/1/host')));
});

async function endedFixture(game = 'reverse') {
  const state = { ...newGame({ ...DEFAULT_SETTINGS, game, rounds: 2 }, ['host', 'guest'], `ended-${game}`),
    phase: game === 'chain' ? 'finished' : 'reveal', round: 2, giver: 'guest', winner: 'host', scores: { host: 2, guest: 3 } };
  await env.withSecurityRulesDisabled(async (c) => update(ref(c.database()), {
    'rooms/1/state': state,
    'rooms/1/ready': null,
    'roundAudio/1': { roomCode: '1ABCDEFG', gameId: state.id, round: 2, owner: 'guest', data: toBase64(reverseWav([new Float32Array(1200)], 12000)) },
  }));
  return state;
}
test('only the host can choose an extra round after the game; no new readiness is required', async () => {
  for (const game of ['wheel', 'clues', 'reverse', 'chain']) {
    const state = await endedFixture(game);
    const payload = postGameUpdate('rooms/1', state, 'again', `encore-${game}`);
    await assertFails(update(ref(g()), payload));
    await assertFails(update(ref(outsider()), payload));
    await assertSucceeds(update(ref(h()), payload));
    const shared = (await get(ref(g(), 'rooms/1/state'))).val();
    assert.equal(shared.id, `encore-${game}`);
    assert.equal(shared.config.rounds, 1);
    assert.equal(shared.scores.host, game === 'chain' ? 0 : 2);
    if (game !== 'chain') assert.equal(shared.giver, 'host');
    assert.equal((await get(ref(h(), 'rooms/1/ready'))).val(), null);
    await env.withSecurityRulesDisabled(async (c) => assert.equal((await get(ref(c.database(), 'roundAudio/1'))).val(), null));
    await assertFails(update(ref(h()), postGameUpdate('rooms/1', state, 'lobby')));
    assert.equal((await get(ref(g(), 'rooms/1/state/id'))).val(), `encore-${game}`);
  }
});
test('host can return both players to game selection after the game and preserve their room', async () => {
  const state = await endedFixture();
  const payload = postGameUpdate('rooms/1', state, 'lobby');
  await assertFails(update(ref(g()), payload));
  await assertSucceeds(update(ref(h()), payload));
  for (const client of [h(), g()]) {
    assert.equal((await get(ref(client, 'rooms/1/state'))).val(), null);
    assert.equal((await get(ref(client, 'rooms/1/meta/code'))).val(), '1ABCDEFG');
    assert.equal((await get(ref(client, 'rooms/1/meta/guest'))).val(), 'guest');
    assert.equal((await get(ref(client, 'rooms/1/ready'))).val(), null);
  }
  await set(ref(g(), 'rooms/1/ready/guest'), 1);
  await assertSucceeds(update(ref(h()), lobbyStartUpdate('rooms/1', DEFAULT_SETTINGS, ['host', 'guest'], 'fresh-lobby-game')));
  await assertFails(update(ref(h()), payload));
  assert.equal((await get(ref(g(), 'rooms/1/state/id'))).val(), 'fresh-lobby-game');
});
test('post-game actions cannot be used mid-game or to silently switch game type', async () => {
  const state = await endedFixture();
  const payload = postGameUpdate('rooms/1', state, 'again', 'forged-game');
  payload['rooms/1/state'] = newGame({ ...DEFAULT_SETTINGS, game: 'chain' }, ['host', 'guest'], 'forged-game');
  await assertFails(update(ref(h()), payload));
  await env.withSecurityRulesDisabled(async (c) => set(ref(c.database(), 'rooms/1/state/phase'), 'guess'));
  await assertFails(update(ref(h()), postGameUpdate('rooms/1', state, 'lobby')));
  await assertFails(update(ref(h()), postGameUpdate('rooms/1', state, 'again', 'too-early')));
});

async function groupStart(game = 'wheel', count = 5, rounds = 5) {
  const players = ['host','guest','third','fourth','fifth'].slice(0,count);
  for(const uid of players.slice(2)) {
    await joinRoom(anonymous(uid), '1ABCDEFG', uid, uid);
    await set(ref(anonymous(uid), `rooms/1/ready/${uid}`),1);
  }
  const settings={...DEFAULT_SETTINGS,game,rounds,wordCount:3};
  await update(ref(h()),lobbyStartUpdate('rooms/1',settings,players,'party-match'));
  return (await get(ref(h(),'rooms/1/state'))).val();
}
async function groupPhase(s, phase, extra = {}) {
  const next={...s,...extra,phase,revision:s.revision+1};
  await set(ref(anonymous(s.giver),'rooms/1/state'),next);
  return next;
}
const partyRecordPath=(s,uid)=>`submissions/1/${s.id}/${s.round}/${uid}`;
const partyRecord=(value,hint=0)=>({entries:{0:{value,hint}}});

test('five seats are unique, concurrent invite joins are safe, and a sixth is denied', async () => {
  await Promise.all(['third','fourth','fifth'].map((uid)=>joinRoom(anonymous(uid),'1ABCDEFG',uid,uid)));
  const saved=(await get(ref(h(),'rooms/1/meta'))).val();
  assert.equal(new Set([saved.host,saved.guest,saved.guest2,saved.guest3,saved.guest4]).size,5);
  await assert.rejects(joinRoom(outsider(),'1ABCDEFG','stranger','Sixth'),/full/);
  await assertFails(update(ref(g(),'rooms/1/meta'),{guest2:'guest',joinCode:'1ABCDEFG'}));
  await assertFails(set(ref(h(),'rooms/1/meta/guest5'),'sixth'));
  await assertFails(set(ref(h(),'rooms/1/players/stranger'),{name:'Sixth'}));
  const newcomer=anonymous(saved.guest4);
  await assertSucceeds(set(ref(newcomer,`rooms/1/presence/${saved.guest4}/2`),true));
  await assertFails(set(ref(newcomer,`rooms/1/presence/${saved.guest4}/3`),true));
});
test('all occupied guests must be ready; mid-game joining is blocked but rejoining works', async () => {
  await joinRoom(anonymous('third'),'1ABCDEFG','third','Third');
  const config={...DEFAULT_SETTINGS};
  await assertFails(update(ref(h()),lobbyStartUpdate('rooms/1',config,['host','guest','third'],'start')));
  await set(ref(anonymous('third'),'rooms/1/ready/third'),1);
  await assertSucceeds(update(ref(h()),lobbyStartUpdate('rooms/1',config,['host','guest','third'],'start')));
  await assert.rejects(joinRoom(anonymous('fourth'),'1ABCDEFG','fourth','Fourth'),/playing a game/);
  await assertSucceeds(joinRoom(anonymous('third'),'1ABCDEFG','third','Third again'));
  assert.equal((await get(ref(anonymous('third'),'rooms/1/state'))).val().id,'start');
});
test('party wheel guesses are private and immutable until reveal; role forgery and stale reads fail', async () => {
  const {settleParty}=await import('../src/party.js');
  let s=await groupStart();
  const secret={gameId:s.id,round:1,target:50};
  await set(ref(h(),'secrets/1/host'),secret);
  s=await groupPhase(s,'clue');s=await groupPhase(s,'guess',{clue:'Pikachu'});
  const records={};
  for(const [index,uid] of s.players.slice(1).entries()) {
    records[uid]=partyRecord(50+index*3);
    await assertSucceeds(set(ref(anonymous(uid),partyRecordPath(s,uid)),records[uid]));
  }
  await assertFails(remove(ref(h(),'submissions/1')));
  await assertSucceeds(get(ref(h(),partyRecordPath(s,'third'))));
  await assertFails(get(ref(g(),partyRecordPath(s,'third'))));
  await assertFails(get(ref(g(),`submissions/1/${s.id}/${s.round}`)));
  await assertFails(set(ref(g(),partyRecordPath(s,'guest')),partyRecord(30)));
  await assertFails(remove(ref(g(),partyRecordPath(s,'guest'))));
  await assertFails(set(ref(g(),partyRecordPath(s,'third')),partyRecord(30)));
  await assertFails(set(ref(g(),'rooms/1/state'),{...s,giver:'guest'}));
  await assertFails(set(ref(h(),'rooms/1/state'),{...s,giver:'guest'}));
  await assertFails(set(ref(g(),'rooms/1/state'),{...s,phase:'reveal'}));
  await assertFails(set(ref(h(),'rooms/1/state'),{...s,game:'chain'}));
  assert.equal(JSON.stringify((await get(ref(g(),'rooms/1/state'))).val()).includes('results'),false);
  s=settleParty(s,secret,records);
  await assertSucceeds(set(ref(h(),'rooms/1/state'),s));
  assert.equal((await get(ref(g(),'rooms/1/state/results/third/guess'))).val(),53);
  const old=s; s=nextRound(s);
  await assertFails(set(ref(h(),'rooms/1/state'),s)); // Must clear private records atomically.
  await assertSucceeds(update(ref(h()),{'rooms/1/state':s,'submissions/1':null,'roundAudio/1':null}));
  assert.equal(s.giver,'guest');
  await assertFails(get(ref(g(),partyRecordPath(old,'third'))));
  await assertFails(set(ref(anonymous('third'),partyRecordPath(old,'third')),partyRecord(22)));
});
test('five-player clue guesses enforce per-hint bounds and reveal only when all players finish', async () => {
  const {settleParty,partyHint}=await import('../src/party.js');
  let s=await groupStart('clues');
  const secret={gameId:s.id,round:1,word:'banana'};
  await set(ref(h(),'secrets/1/host'),secret);
  s=await groupPhase(s,'hint');s=partyHint(s,'yellow');
  await assertSucceeds(set(ref(h(),'rooms/1/state'),s));
  const records={};
  for(const uid of s.players.slice(1)) {
    records[uid]=partyRecord(uid==='guest'?'banana':'lemon',1);
    await assertSucceeds(set(ref(anonymous(uid),partyRecordPath(s,uid)),records[uid]));
    await assertFails(set(ref(anonymous(uid),`${partyRecordPath(s,uid)}/entries/1`),{value:'apple',hint:1}));
  }
  s=settleParty(s,secret,records);await set(ref(h(),'rooms/1/state'),s);
  assert.equal(s.progress.guest.done,true);
  await assertFails(set(ref(g(),`${partyRecordPath(s,'guest')}/entries/1`),{value:'banana',hint:1}));
  for(const uid of s.players.slice(2)) {
    records[uid].entries[1]={value:'apple',hint:1};
    await assertSucceeds(set(ref(anonymous(uid),partyRecordPath(s,uid)),records[uid]));
  }
  s=settleParty(s,secret,records);await set(ref(h(),'rooms/1/state'),s);assert.equal(s.phase,'hint');
  s=partyHint(s,'peel');await set(ref(h(),'rooms/1/state'),s);
  for(const uid of s.players.slice(2)) {
    records[uid].entries[2]={value:'banana',hint:2};
    await assertSucceeds(set(ref(anonymous(uid),partyRecordPath(s,uid)),records[uid]));
  }
  s=settleParty(s,secret,records);await assertSucceeds(set(ref(h(),'rooms/1/state'),s));
  assert.equal(s.phase,'reveal');assert.equal(s.scores.guest,3);assert.equal(s.scores.fifth,2);
});
test('group audio permits five listens per person, one private guess, and separate verdicts', async () => {
  const {settleParty,judgePartyReverse,nextListen}=await import('../src/party.js');
  let s=await groupStart('reverse',5,1);
  const secret={gameId:s.id,round:1,word:'banana'};
  await set(ref(h(),'secrets/1/host'),secret);
  s=await groupPhase(s,'recording',{recorded:true});
  const data=toBase64(reverseWav([new Float32Array(1200).fill(.1)],12000));
  await set(ref(h(),'roundAudio/1'),{roomCode:'1ABCDEFG',gameId:s.id,round:1,owner:'host',data});
  s=await groupPhase(s,'guess');
  const records={};
  for(const uid of s.players.slice(1)) {
    records[uid]=null;
    for(let play=0;play<5;play++){
      records[uid]=nextListen(records[uid]);
      await assertSucceeds(set(ref(anonymous(uid),partyRecordPath(s,uid)),records[uid]));
    }
    await assertFails(set(ref(anonymous(uid),`${partyRecordPath(s,uid)}/plays`),6));
    await assertFails(set(ref(anonymous(uid),`${partyRecordPath(s,uid)}/plays`),0));
    records[uid]={...records[uid],...partyRecord(uid==='guest'?' BANANA ':'bananna')};
    await assertSucceeds(set(ref(anonymous(uid),partyRecordPath(s,uid)),records[uid]));
    await assertFails(set(ref(anonymous(uid),`${partyRecordPath(s,uid)}/entries/1`),{value:'banana',hint:0}));
  }
  s=settleParty(s,secret,records);await set(ref(h(),'rooms/1/state'),s);
  assert.equal(s.scores.guest,1);
  for(const uid of s.players.slice(2)){
    s=judgePartyReverse(s,secret,records,uid,true);
    await assertSucceeds(set(ref(h(),'rooms/1/state'),s));
  }
  assert.equal(s.phase,'reveal');assert.equal(s.scores.fifth,1);
  await assertSucceeds(update(ref(h()),postGameUpdate('rooms/1',s,'again','encore')));
});
test('group game-change requires unanimous votes and rejects forged consent', async () => {
  const s=await groupStart();
  await requestGameChange(g(),'rooms/1',s.id,'guest',s.players);
  let request=(await get(ref(h(),'rooms/1/gameChange'))).val();
  await assertFails(set(ref(g(),'rooms/1/gameChange/votes/third'),true));
  await assertFails(update(ref(g(),'rooms/1/gameChange'),{accepted:true}));
  for(const uid of ['host','third','fourth']) {
    await respondToGameChange(anonymous(uid),'rooms/1',request,uid,true,s.players);
    request=(await get(ref(h(),'rooms/1/gameChange'))).val();
    assert.equal(request.accepted,false);
  }
  await assertFails(completeGameChange(h(),'rooms/1',request));
  await respondToGameChange(anonymous('fifth'),'rooms/1',request,'fifth',true,s.players);
  request=(await get(ref(h(),'rooms/1/gameChange'))).val();assert.equal(request.accepted,true);
  await assertSucceeds(completeGameChange(h(),'rooms/1',request));
  assert.equal((await get(ref(g(),'rooms/1/state'))).val(),null);
});
test('five concurrent word chains remain private, then race around the room and reveal at the end', async () => {
  let s=await groupStart('chain');
  const words=['coffee','shop','window'];
  await Promise.all(s.players.map(async(uid)=>{
    await set(ref(anonymous(uid),`secrets/1/${uid}`),{gameId:s.id,round:1,words});
    await assertSucceeds(runTransaction(ref(anonymous(uid),'rooms/1/state'),(current)=>current?{
      ...current,boards:{...current.boards,[uid]:{masks:chainMasks(words)}},revision:current.revision+1,
    }:null,{applyLocally:false}));
  }));
  s=(await get(ref(h(),'rooms/1/state'))).val();
  assert.equal(Object.keys(s.boards).length,5);
  await assertFails(get(ref(anonymous('third'),'secrets/1/fourth')));
  s={...s,phase:'guess'};await set(ref(h(),'rooms/1/state'),s);
  for(const uid of s.players){
    const owner=s.players[(s.players.indexOf(uid)+1)%5];
    s={...s,phase:'pending',pending:{actor:uid,kind:'guess',index:0,value:'wrong'}};
    await set(ref(anonymous(uid),'rooms/1/state'),s);
    s=resolve(s,{gameId:s.id,round:1,words});await assertSucceeds(set(ref(anonymous(owner),'rooms/1/state'),s));
  }
  assert.equal(s.turn,'host');
  for(let index=0;index<words.length;index++){
    s={...s,phase:'pending',pending:{actor:'host',kind:'guess',index,value:words[index]}};
    await set(ref(h(),'rooms/1/state'),s);
    s=resolve(s,{gameId:s.id,round:1,words});await set(ref(g(),'rooms/1/state'),s);
  }
  assert.equal(s.phase,'finished');
  for(const uid of s.players){
    s=revealChain(s,{gameId:s.id,round:1,words},uid);
    await assertSucceeds(set(ref(anonymous(uid),'rooms/1/state'),s));
  }
  assert.deepEqual((await get(ref(anonymous('fifth'),'rooms/1/state/boards/third/answers'))).val(),words);
});
test('any group member can pause safely while host and giver are away, without changing progress', async () => {
  let s=await groupStart('clues');s=await groupPhase(s,'hint');
  const {partyHint}=await import('../src/party.js');s=partyHint(s,'yellow');await set(ref(h(),'rooms/1/state'),s);
  const paused={...s,pausedAt:Date.now(),revision:s.revision+1};
  await assertFails(set(ref(anonymous('fifth'),'rooms/1/state'),{...paused,progress:{...paused.progress,guest:{...paused.progress.guest,correct:true,points:3,done:true}}}));
  await assertFails(set(ref(anonymous('fifth'),'rooms/1/state'),{...paused,hints:['banana']}));
  await assertSucceeds(set(ref(anonymous('fifth'),'rooms/1/state'),paused));
  const resumed={...paused,deadline:Date.now()+30000};delete resumed.pausedAt;
  await assertFails(set(ref(anonymous('fifth'),'rooms/1/state'),resumed));
  await assertSucceeds(set(ref(h(),'rooms/1/state'),resumed));
});
