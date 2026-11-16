// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
vi.mock("../src/firebase.js", () => ({
  identity: vi.fn(async () => null),
  login: vi.fn(),
  logout: vi.fn(),
  priorityAccess: vi.fn(async () => false),
  createRoom: vi.fn(),
  joinRoom: vi.fn(),
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
import App from "../src/App.jsx";
import Game from "../src/Game.jsx";
import { newGame } from "../src/engine.js";
import { DEFAULT_SETTINGS } from "../src/content.js";
import { set } from "../src/firebase.js";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
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
  it("shows the three games and requires sign-in before room creation", async () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /Good company/ })).toBeTruthy();
    for (const name of ["Blind Wheel", "Word by Word", "Three Little Clues"])
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Continue with Google/ }).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Join a room" }));
    expect(screen.getByLabelText("Room code")).toBeTruthy();
  });
  it("keeps a wheel target off the guesser screen and submits the chosen position", async () => {
    const p = props("wheel", { uid: "guest", isHost: false });
    p.room.state = { ...p.room.state, phase: "guess", clue: "Pikachu" };
    render(<Game {...p} />);
    expect(screen.queryByText(/Secret target:/)).toBeNull();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "73" } });
    fireEvent.click(screen.getByRole("button", { name: /Lock in my guess/ }));
    await waitFor(() => expect(p.mutate).toHaveBeenCalled());
    const next = p.mutate.mock.calls[0][0](p.room.state);
    expect(next.pending.value).toBe(73);
    expect(next.pending.actor).toBe("guest");
  });
  it("fills a complete word list with distinct suggestions and keeps it private", async () => {
    const p = props("chain");
    render(<Game {...p} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Suggest a whole list/ }),
    );
    const words = screen.getAllByRole("textbox").map((e) => e.value);
    expect(words.length).toBe(5);
    expect(new Set(words).size).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: /Tuck these away/ }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    expect(set.mock.calls[0][0]).toBe("secrets/1/host");
    expect(set.mock.calls[0][1].words).toEqual(words);
    const state = p.mutate.mock.calls[0][0](p.room.state);
    expect(state.boards.host.masks.every((w) => w.includes("·"))).toBe(true);
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
