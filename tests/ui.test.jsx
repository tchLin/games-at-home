// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
  renderHook,
  act as reactAct,
} from "@testing-library/react";
vi.mock("../src/firebase.js", () => ({
  identity: vi.fn(async () => null),
  login: vi.fn(),
  guestLogin: vi.fn(async () => ({ uid: "anonymous-player", isAnonymous: true })),
  logout: vi.fn(),
  priorityAccess: vi.fn(async () => false),
  createRoom: vi.fn(),
  joinRoom: vi.fn(async () => {}),
  friendlyError: (e) => e.message,
  db: {},
  connect: vi.fn(),
  disconnect: vi.fn(),
  ref: vi.fn((_, path) => path),
  set: vi.fn(async () => {}),
  get: vi.fn(),
  update: vi.fn(async () => {}),
  remove: vi.fn(),
  onValue: vi.fn(() => () => {}),
  runTransaction: vi.fn(),
  presence: vi.fn(() => () => {}),
  serverClock: vi.fn(() => () => {}),
  roomPath: (code) => `rooms/${code[0]}`,
  slotOf: (code) => code[0],
}));
import App, { Lobby } from "../src/App.jsx";
import Game from "../src/Game.jsx";
import { GameChangeControls } from "../src/GameChangeControls.jsx";
import { useRoom } from "../src/useRoom.js";
import * as reverseAudio from '../src/reverse-audio.js';
import * as gameChangeActions from "../src/game-change.js";
import { newGame, chainMasks } from "../src/engine.js";
import { DEFAULT_SETTINGS } from "../src/content.js";
import { set, get, identity, guestLogin, createRoom, joinRoom, login, update, onValue, presence, runTransaction } from "../src/firebase.js";
beforeEach(() => {
  identity.mockResolvedValue(null);
  createRoom.mockResolvedValue("1ABCDEFG");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
  history.replaceState({}, "", "/");
});
const props = (game, overrides = {}) => ({
  room: {
    state: newGame(
      { ...DEFAULT_SETTINGS, game },
      ["host", "guest"],
      "ui-match",
    ),
  },
  uid: "host",
  name: (id) => (id === "host" ? "Alex" : "Sam"),
  secret: null,
  isHost: true,
  bothOnline: true,
  connected: true,
  now: Date.now(),
  mutate: vi.fn(async () => true),
  act: async (fn) => fn(),
  busy: false,
  base: "rooms/1",
  secretPath: "secrets/1/host",
  ...overrides,
});
describe("cozy home and game forms", () => {
  it("shows the four games with guest play and optional Google sign-in", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /Good company/ })).toBeTruthy();
    for (const name of ["Blind Wheel", "Word by Word", "Three Little Clues", "Backwards & Forwards"])
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Google sign-in for reserved access/ }).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Join a room" }));
    expect(screen.getByLabelText("Room code")).toBeTruthy();
  });
  it("creates a public room with an anonymous identity and no Google popup", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("What should we call you?"), { target: { value: "Alex" } });
    const button = screen.getByRole("button", { name: /Create room as guest/ });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(createRoom).toHaveBeenCalledWith("anonymous-player", "Alex", false, "wheel"));
    expect(guestLogin).toHaveBeenCalledOnce();
    expect(login).not.toHaveBeenCalled();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("gah-room")).uid).toBe("anonymous-player"));
  });
  it("joins a public invitation as a guest", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Join a room" }));
    fireEvent.change(screen.getByLabelText("What should we call you?"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "1ABCDEFG" } });
    const button = screen.getByRole("button", { name: /Join room as guest/ });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith("1ABCDEFG", "anonymous-player", "Sam"));
    expect(login).not.toHaveBeenCalled();
  });
  it("restores a guest seat using the persisted browser identity", async () => {
    identity.mockResolvedValue({ uid: "returning-guest", isAnonymous: true });
    localStorage.setItem("gah-room", JSON.stringify({ uid: "returning-guest", name: "Sam", code: "1ABCDEFG" }));
    render(<App />);
    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith("1ABCDEFG", "returning-guest", "Sam"));
    expect(guestLogin).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });
  it("directs reserved invitations to Google sign-in without creating a guest identity", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Join a room" }));
    fireEvent.change(screen.getByLabelText("What should we call you?"), { target: { value: "Sam" } });
    fireEvent.change(screen.getByLabelText("Room code"), { target: { value: "0ABCDEFG" } });
    const button = screen.getByRole("button", { name: /Join room as guest/ });
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("This is a reserved room"));
    expect(guestLogin).not.toHaveBeenCalled();
    expect(joinRoom).not.toHaveBeenCalled();
  });
  it("keeps a wheel target off the guesser screen and submits the chosen position", async () => {
    const p = props("wheel", { uid: "guest", isHost: false });
    p.room.state = { ...p.room.state, phase: "guess", clue: "Pikachu" };
    render(<Game {...p} />);
    expect(screen.queryByText(/Secret 4-point center:/)).toBeNull();
    expect(screen.getByRole("img", { name: "The scoring band is hidden" })).toBeTruthy();
    expect(document.querySelectorAll(".dial text").length).toBe(2);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "73" } });
    fireEvent.click(screen.getByRole("button", { name: /Lock in my guess/ }));
    await waitFor(() => expect(p.mutate).toHaveBeenCalled());
    const next = p.mutate.mock.calls[0][0](p.room.state);
    expect(next.pending.value).toBe(73);
    expect(next.pending.actor).toBe("guest");
  });
  it("suggests connected words live and stores only their first letters in shared state", async () => {
    const p = props("chain");
    render(<Game {...p} />);
    expect(screen.getByLabelText("Word 2").disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Word 1"), { target: { value: "coffee" } });
    expect(screen.getByText("After “coffee”, try…")).toBeTruthy();
    for (const next of ["shop", "window", "shopping", "cart"])
      fireEvent.click(screen.getByRole("button", { name: next, exact: true }));
    const words = screen.getAllByRole("textbox").map((e) => e.value);
    expect(words).toEqual(["coffee", "shop", "window", "shopping", "cart"]);
    fireEvent.click(screen.getByRole("button", { name: /Tuck these away/ }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(set.mock.calls[0][0]).toBe("secrets/1/host");
    expect(set.mock.calls[0][1].words).toEqual(words);
    const state = p.mutate.mock.calls[0][0](p.room.state);
    expect(state.boards.host.masks).toEqual(["c·····", "····", "······", "········", "····"]);
  });
  it("allows custom connections without dictionary approval or explanations", async () => {
    const p = props("chain");
    render(<Game {...p} />);
    const words = ["starlight", "campfire", "stories", "adventures", "memories"];
    words.forEach((word, i) => fireEvent.change(screen.getByLabelText(`Word ${i + 1}`), { target: { value: word } }));
    fireEvent.click(screen.getByRole("button", { name: /Tuck these away/ }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(set.mock.calls[0][1].words).toEqual(words);
  });
  it("updates suggestions immediately when a previous word is edited", () => {
    render(<Game {...props("chain")} />);
    fireEvent.change(screen.getByLabelText("Word 1"), { target: { value: "coffee" } });
    expect(screen.getByRole("button", { name: "bean", exact: true })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Word 1"), { target: { value: "dog" } });
    expect(screen.queryByRole("button", { name: "bean", exact: true })).toBeNull();
    expect(screen.getByRole("button", { name: "walker", exact: true })).toBeTruthy();
  });
  it("labels fuzzy suggestions without rewriting the player's word", () => {
    render(<Game {...props("chain")} />);
    fireEvent.change(screen.getByLabelText("Word 1"), { target: { value: "cofee" } });
    expect(screen.getByText(/Ideas based on “coffee”/)).toBeTruthy();
    expect(screen.getByLabelText("Word 1").value).toBe("cofee");
    fireEvent.click(screen.getByRole("button", { name: "shop", exact: true }));
    expect(screen.getByLabelText("Word 1").value).toBe("cofee");
    expect(screen.getByLabelText("Word 2").value).toBe("shop");
  });
  it("shows all seven scoring wedges to the giver and reveals them with the guess", () => {
    const p = props("wheel", { secret: { gameId: "ui-match", round: 1, target: 60 } });
    p.room.state = { ...p.room.state, topicLabel: "Pokémon", phase: "clue" };
    const { rerender } = render(<Game {...p} />);
    expect(screen.getByText("Pokémon")).toBeTruthy();
    expect([...document.querySelectorAll(".dial g text")].map((node) => node.textContent)).toEqual(["1", "2", "3", "4", "3", "2", "1"]);
    p.room.state = { ...p.room.state, phase: "reveal", result: { target: 60, guess: 62, points: 4 } };
    rerender(<Game {...p} uid="guest" isHost={false} />);
    expect(screen.getByRole("img", { name: /Four-point center: 60 out of 100. Guess: 62/ })).toBeTruthy();
  });
  it("offers wheel topics and no topic or mood picker for word chains", () => {
    const room = { meta: { host: "host", guest: "guest" }, ready: {} };
    const lobby = { room, uid: "host", isHost: true, base: "rooms/1", act: (fn) => fn(), bothOnline: true };
    render(<Lobby {...lobby} settings={DEFAULT_SETTINGS} />);
    expect(screen.getByLabelText("Topic")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Word by Word/ }));
    expect(screen.queryByLabelText("Topic")).toBeNull();
    expect(screen.queryByLabelText("Word suggestion mood")).toBeNull();
    expect(screen.getByLabelText("Words per player")).toBeTruthy();
  });
  it("shows the configured guesses per hint and does not expose the secret word", () => {
    const p = props("clues", { uid: "guest", isHost: false });
    p.room.state = {
      ...p.room.state,
      phase: "guess",
      hintIndex: 1,
      hints: ["warm"],
      used: 1,
      config: { ...p.room.state.config, guessesPerHint: 3 },
    };
    render(<Game {...p} />);
    expect(screen.getByLabelText("2 guesses left for this hint")).toBeTruthy();
    expect(screen.getByText("warm")).toBeTruthy();
    expect(screen.queryByText(/Your secret word:/)).toBeNull();
  });
  it("disables guessing and explains the pause when the other person disconnects", () => {
    const p = props("wheel", {
      uid: "guest",
      isHost: false,
      bothOnline: false,
    });
    p.room.state = { ...p.room.state, phase: "guess", clue: "Pikachu" };
    render(<Game {...p} />);
    expect(
      screen.getByRole("button", { name: /Lock in my guess/ }).disabled,
    ).toBe(true);
    expect(screen.getByText(/Your game is saved/)).toBeTruthy();
  });
  it("reveals the word and offers the host a next-round action", () => {
    const p = props("clues");
    p.room.state = {
      ...p.room.state,
      phase: "reveal",
      hints: ["warm"],
      result: { word: "coffee", correct: true, points: 3 },
    };
    render(<Game {...p} />);
    expect(screen.getByText(/The secret word was “coffee”/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /One more round/ })).toBeTruthy();
  });
});

describe("game review and readable round information", () => {
  it("keeps wheel clues prominent during the reveal and clips scoring bands at either edge", () => {
    const p = props("wheel");
    p.room.state = { ...p.room.state, phase: "reveal", clue: "Pikachu", result: { target: 0, guess: 0, points: 4 } };
    const { rerender } = render(<Game {...p} />);
    expect(within(screen.getByLabelText("The clue")).getByText("Pikachu")).toBeTruthy();
    expect([...document.querySelectorAll(".dial g text")].map((node) => node.textContent)).toEqual(["4", "3", "2", "1"]);
    p.room.state.result = { target: 100, guess: 100, points: 4 };
    rerender(<Game {...p} />);
    expect([...document.querySelectorAll(".dial g text")].map((node) => node.textContent)).toEqual(["1", "2", "3", "4"]);
  });
  it("shows guess trails under both the opponent's words and the player's own chain", () => {
    const p = props("chain", { secret: { gameId: "ui-match", round: 1, words: ["coffee", "shop", "window"] } });
    p.room.state = { ...p.room.state, phase: "guess", turn: "host", boards: {
      host: { masks: chainMasks(["coffee", "shop", "window"]), guesses: { 0: [{ guess: "cocoa", correct: false }] } },
      guest: { masks: chainMasks(["rain", "bow", "tie"]), guesses: { 1: [{ guess: "boot", correct: false }] } },
    } };
    render(<Game {...p} />);
    expect(screen.getByText("Your guesses for word 2 · 1")).toBeTruthy();
    expect(screen.getByText("Sam’s guesses for word 1 · 1")).toBeTruthy();
    expect(screen.getByText("cocoa")).toBeTruthy();
    expect(screen.getByText("boot")).toBeTruthy();
    expect(screen.queryByText("rain")).toBeNull();
  });
  it("reveals both complete chains and their guesses when the game ends", () => {
    const p = props("chain");
    p.room.state = { ...p.room.state, phase: "finished", winner: "guest", boards: {
      host: { masks: chainMasks(["coffee", "shop", "window"]), answers: ["coffee", "shop", "window"], guesses: { 0: [{ guess: "cocoa", correct: false }] } },
      guest: { masks: chainMasks(["rain", "bow", "tie"]), answers: ["rain", "bow", "tie"] },
    } };
    render(<Game {...p} />);
    expect(within(screen.getByLabelText("Alex’s answers")).getByText("window")).toBeTruthy();
    expect(within(screen.getByLabelText("Sam’s answers")).getByText("tie")).toBeTruthy();
    expect(screen.getByText("cocoa")).toBeTruthy();
  });
  it("lets the giver tailor hint two using both previous guesses, then resets the guess allowance", async () => {
    const p = props("clues", { secret: { gameId: "ui-match", round: 1, word: "coffee" } });
    p.room.state = { ...p.room.state, topicLabel: "Food", phase: "hint", hintIndex: 1, used: 2, hints: ["warm"], attempts: [
      { guess: "tea", correct: false, hint: 1 }, { guess: "cocoa", correct: false, hint: 1 },
    ] };
    const { rerender } = render(<Game {...p} />);
    expect(screen.getByText("Food")).toBeTruthy();
    const history = screen.getByLabelText("Guesses so far");
    expect(within(history).getByText("tea")).toBeTruthy();
    expect(within(history).getByText("cocoa")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Hint 2 · one word only"), { target: { value: "roasted" } });
    fireEvent.click(screen.getByRole("button", { name: /Share this hint/ }));
    await waitFor(() => expect(p.mutate).toHaveBeenCalled());
    const next = p.mutate.mock.calls[0][0](p.room.state);
    expect(next.hints).toEqual(["warm", "roasted"]);
    expect(next.used).toBe(0);
    expect(next.phase).toBe("guess");
    p.room.state = next;
    rerender(<Game {...p} uid="guest" isHost={false} secret={null} />);
    expect(screen.getByLabelText("2 guesses left for this hint")).toBeTruthy();
    expect(screen.queryByLabelText("Hint 3 · one word only")).toBeNull();
    expect(screen.getByLabelText("Guesses so far")).toBeTruthy();
    expect(screen.queryByText("coffee")).toBeNull();
  });
});

describe("flexible lobby readiness", () => {
  const room = { meta: { host: "host", guest: "guest" }, ready: {} };
  const base = { room, uid: "guest", isHost: false, base: "rooms/1", act: async (fn) => fn(), bothOnline: true };
  it("lets the guest toggle ready before settings are final and stay ready after changes", async () => {
    const { rerender } = render(<Lobby {...base} settings={DEFAULT_SETTINGS} />);
    fireEvent.click(screen.getByRole("button", { name: "I’m ready" }));
    await waitFor(() => expect(set).toHaveBeenCalledWith("rooms/1/ready/guest", 1));
    rerender(<Lobby {...base} room={{ ...room, ready: { guest: 1 } }} settings={{ ...DEFAULT_SETTINGS, version: 12, rounds: 8 }} />);
    const unready = screen.getByRole("button", { name: "Unready" });
    expect(unready.disabled).toBe(false);
    fireEvent.click(unready);
    await waitFor(() => expect(set).toHaveBeenCalledWith("rooms/1/ready/guest", 0));
  });
  it("lets the host start with unsaved changes and saves that exact configuration", async () => {
    render(<Lobby {...base} uid="host" isHost room={{ ...room, ready: { guest: 1 } }} settings={DEFAULT_SETTINGS} />);
    fireEvent.change(screen.getByLabelText("Rounds"), { target: { value: "12" } });
    const start = screen.getByRole("button", { name: "Start game" });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    await waitFor(() => expect(update).toHaveBeenCalled());
    const payload = update.mock.calls[0][1];
    expect(payload["rooms/1/settings"].rounds).toBe(12);
    expect(payload["rooms/1/state"].config.rounds).toBe(12);
    expect(payload["rooms/1/settings"].version).toBe(2);
    expect(payload["rooms/1/ready"]).toBeNull();
  });
  it("prevents Start while the guest is unready or disconnected", () => {
    const { rerender } = render(<Lobby {...base} uid="host" isHost settings={DEFAULT_SETTINGS} />);
    expect(screen.getByRole("button", { name: /Waiting for guest/ }).disabled).toBe(true);
    rerender(<Lobby {...base} uid="host" isHost room={{ ...room, ready: { guest: 1 } }} settings={DEFAULT_SETTINGS} bothOnline={false} />);
    expect(screen.getByRole("button", { name: /Waiting for both/ }).disabled).toBe(true);
  });
});

describe("shared game-change request controls", () => {
  const base = { gameId: "match", uid: "host", connected: true, hostOnline: true, name: (uid) => uid === "host" ? "Alex" : "Sam", onRequest: vi.fn(), onRespond: vi.fn() };
  const request = { gameId: "match", requestId: "request", requestedBy: "host", accepted: false, completed: false };
  it("lets either player ask and only offers cancellation to the requester", () => {
    const { rerender } = render(<GameChangeControls {...base} />);
    fireEvent.click(screen.getByRole("button", { name: "Change game" }));
    expect(base.onRequest).toHaveBeenCalledOnce();
    rerender(<GameChangeControls {...base} request={request} />);
    expect(screen.queryByRole("button", { name: /Agree/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(base.onRespond).toHaveBeenCalledWith(false);
  });
  it("offers the other player both agreement and keep-playing choices", () => {
    render(<GameChangeControls {...base} uid="guest" request={request} />);
    expect(screen.getByText("Alex wants to change games.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Agree · change game" }));
    expect(base.onRespond).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(base.onRespond).toHaveBeenCalledWith(false);
  });
  it("explains an accepted request while waiting for an offline host and ignores old requests", () => {
    const { rerender } = render(<GameChangeControls {...base} uid="guest" hostOnline={false} request={{ ...request, accepted: true }} />);
    expect(screen.getByText(/Waiting for the host to reconnect/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<GameChangeControls {...base} request={{ ...request, gameId: "old-match" }} />);
    expect(screen.getByRole("button", { name: "Change game" })).toBeTruthy();
  });
});

it("the host automatically completes an accepted request and receives the lobby state", async () => {
  const listeners = new Map();
  const completion = vi.spyOn(gameChangeActions, "completeGameChange").mockResolvedValue();
  onValue.mockImplementation((path, callback) => { listeners.set(path, callback); return () => {}; });
  presence.mockImplementation((code, uid, callback) => { callback(true); return () => {}; });
  try {
    const { result, unmount } = renderHook(() => useRoom("1ABCDEFG", "host", vi.fn()));
    const state = newGame(DEFAULT_SETTINGS, ["host", "guest"], "hook-match");
    const request = { gameId: state.id, requestId: "hook-request", requestedBy: "guest", accepted: false, completed: false };
    reactAct(() => {
      listeners.get("rooms/1/meta")({ val: () => ({ host: "host", guest: "guest", code: "1ABCDEFG", open: true, leaseEnd: Date.now() + 60000 }) });
      listeners.get("rooms/1/presence")({ val: () => ({ host: { 0: true }, guest: { 0: true } }) });
      listeners.get("rooms/1/state")({ val: () => state });
      listeners.get("rooms/1/gameChange")({ val: () => request });
    });
    expect(completion).not.toHaveBeenCalled();
    const accepted = { ...request, accepted: true };
    reactAct(() => listeners.get("rooms/1/gameChange")({ val: () => accepted }));
    await waitFor(() => expect(completion).toHaveBeenCalledWith({}, "rooms/1", accepted));
    reactAct(() => listeners.get("rooms/1/state")({ val: () => null }));
    expect(result.current.room.state).toBeNull();
    expect(completion).toHaveBeenCalledOnce();
    unmount();
  } finally {
    completion.mockRestore();
    onValue.mockImplementation(() => () => {});
    presence.mockImplementation(() => () => {});
  }
});

describe('Backwards & Forwards', () => {
  const make = (phase = 'prepare', overrides = {}) => {
    const p = props('reverse', overrides);
    p.room = { ...p.room, meta: { code: '1ABCDEFG' }, state: { ...p.room.state, phase } };
    return p;
  };
  it('shows the secret only to its holder and offers a single take', () => {
    const p = make();
    p.secret = { gameId: p.room.state.id, round: 1, word: 'banana' };
    const { rerender } = render(<Game {...p} />);
    expect(screen.getByText('banana')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hear it backwards/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Record my one take/ })).toBeTruthy();
    rerender(<Game {...p} uid="guest" secret={null} />);
    expect(screen.queryByText('banana')).toBeNull();
    expect(screen.queryByRole('button', { name: /Record my one take/ })).toBeNull();
  });
  it('keeps a spent recording spent after rejoining and offers recovery or skip', () => {
    const p = make('recording');
    p.room.state.recorded = true;
    p.secret = { gameId: p.room.state.id, round: 1, word: 'banana' };
    render(<Game {...p} />);
    expect(screen.queryByRole('button', { name: /Record my one take/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Recover saved recording/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Skip round/ })).toBeTruthy();
  });
  it('disables a fourth playback and locks the one guess for manual judgement', async () => {
    const p = make('guess', { uid: 'guest', isHost: false });
    p.room.state.plays = 3;
    p.room.state.recorded = true;
    const { rerender } = render(<Game {...p} />);
    expect(screen.getByRole('button', { name: /Listen · 0 left/ }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Your one guess'), { target: { value: 'bananna' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit my guess' }));
    await waitFor(() => expect(p.mutate).toHaveBeenCalled());
    const pending = p.mutate.mock.calls[0][0](p.room.state);
    expect(pending.phase).toBe('pending');
    expect(pending.pending.value).toBe('bananna');
    p.room.state = pending;
    rerender(<Game {...p} />);
    expect(screen.queryByLabelText('Your one guess')).toBeNull();
    expect(screen.getByText(/Checking your guess. Exact answers pass automatically/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pass' })).toBeNull();
    rerender(<Game {...p} uid="host" secret={{ gameId: pending.id, round: 1, word: 'banana' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    const result = p.mutate.mock.calls.at(-1)[0](pending);
    expect(result.result.correct).toBe(true);
    expect(result.scores.guest).toBe(1);
  });
  it('decodes a clip before claiming playback, and the counter survives rerender', async () => {
    const ctx = { resume: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    vi.spyOn(reverseAudio, 'audioContext').mockReturnValue(ctx);
    vi.spyOn(reverseAudio, 'decode').mockResolvedValue({ duration: 1 });
    const play = vi.spyOn(reverseAudio, 'playBuffer').mockImplementation((c, b, ended) => { ended(); return vi.fn(); });
    const p = make('guess', { uid: 'guest', isHost: false });
    get.mockResolvedValue({ val: () => ({ gameId: p.room.state.id, round: 1, data: 'AAAA' }) });
    const { rerender } = render(<Game {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Listen · 3 left/ }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    p.room.state = p.mutate.mock.calls[0][0](p.room.state);
    expect(p.room.state.plays).toBe(1);
    rerender(<Game {...p} />);
    expect(screen.getByRole('button', { name: /Listen · 2 left/ })).toBeTruthy();
  });
  it('claims one take, stops the mic, reverses samples and uploads a room-bound clip', async () => {
    const ctx = { resume: vi.fn(async () => {}), close: vi.fn(async () => {}) };
    vi.spyOn(reverseAudio, 'audioContext').mockReturnValue(ctx);
    vi.spyOn(reverseAudio, 'decode').mockResolvedValue({ numberOfChannels: 1, sampleRate: 12000, getChannelData: () => new Float32Array([.1,.2,.3]) });
    let finish;
    const mic = { start: vi.fn(() => new Promise((resolve) => { finish = resolve; })), stop: vi.fn(() => finish({ arrayBuffer: async () => new ArrayBuffer(8) })), cancel: vi.fn() };
    vi.spyOn(reverseAudio, 'microphone').mockResolvedValue(mic);
    const p = make();
    p.secret = { gameId: p.room.state.id, round: 1, word: 'banana' };
    const { rerender } = render(<Game {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Record my one take/ }));
    await waitFor(() => expect(mic.start).toHaveBeenCalledTimes(1));
    p.room.state = p.mutate.mock.calls[0][0](p.room.state);
    expect(p.room.state.recorded).toBe(true);
    rerender(<Game {...p} busy />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop and send' }));
    await waitFor(() => expect(set).toHaveBeenCalledWith('roundAudio/1', expect.objectContaining({ roomCode: '1ABCDEFG', owner: 'host', round: 1, data: expect.stringMatching(/^UklGR/) })));
    expect(mic.cancel).toHaveBeenCalled();
    expect(p.mutate.mock.calls.at(-1)[0](p.room.state).phase).toBe('guess');
  });
});

it('uses the shared responsive illustration sizing for the new game card', () => {
  render(<App />);
  const card = screen.getByRole('heading', { name: 'Backwards & Forwards' }).closest('button');
  expect(card.querySelector('svg.art')).toBeTruthy();
});

it('shows an automatic loading state without a word-reveal button, and hides manual judging for exact answers', () => {
  const p = props('reverse');
  const { rerender } = render(<Game {...p} />);
  expect(screen.getByText('Getting your word ready…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Get my word|Reveal my word/ })).toBeNull();
  p.secret = { gameId: p.room.state.id, round: 1, word: 'banana' };
  p.room.state = { ...p.room.state, phase: 'pending', pending: { actor: 'guest', kind: 'guess', value: 'BANANA' } };
  rerender(<Game {...p} />);
  expect(screen.getByText(/That’s an exact match/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Pass' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'No pass' })).toBeNull();
});

it('assigns a private word on entering the round, then automatically resolves an exact guess', async () => {
  const listeners = new Map();
  let storedSecret = null;
  let state = newGame({ ...DEFAULT_SETTINGS, game: 'reverse', reverseSyllables: 3 }, ['host', 'guest'], 'auto-match');
  const report = vi.fn();
  onValue.mockImplementation((path, callback) => { listeners.set(path, callback); return () => {}; });
  presence.mockImplementation((code, uid, callback) => { callback(true); return () => {}; });
  runTransaction.mockImplementation(async (path, fn) => {
    if (path === 'secrets/1/host') {
      storedSecret = fn(storedSecret) || storedSecret;
      listeners.get(path)({ val: () => storedSecret });
    } else if (path === 'rooms/1/state') {
      state = fn(state) || state;
      listeners.get(path)({ val: () => state });
    }
    return { committed: true };
  });
  try {
    const { unmount } = renderHook(() => useRoom('1ABCDEFG', 'host', report));
    reactAct(() => {
      listeners.get('rooms/1/meta')({ val: () => ({ host: 'host', guest: 'guest', code: '1ABCDEFG', open: true, leaseEnd: Date.now() + 60000 }) });
      listeners.get('rooms/1/presence')({ val: () => ({ host: { 0: true }, guest: { 0: true } }) });
      listeners.get('rooms/1/state')({ val: () => state });
    });
    await waitFor(() => expect(storedSecret?.word).toBeTruthy());
    await reactAct(async () => {});
    expect(runTransaction.mock.calls[0][0]).toBe('secrets/1/host');
    state = { ...state, phase: 'pending', pending: { actor: 'guest', kind: 'guess', value: storedSecret.word.toUpperCase() } };
    reactAct(() => listeners.get('rooms/1/state')({ val: () => state }));
    await waitFor(() => expect(state.phase).toBe('reveal'));
    expect(state.scores.guest).toBe(1);
    expect(report).not.toHaveBeenCalled();
    unmount();
  } finally {
    onValue.mockImplementation(() => () => {});
    presence.mockImplementation(() => () => {});
    runTransaction.mockReset();
  }
});
