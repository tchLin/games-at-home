import { useEffect, useState } from "react";
import {
  House,
  Heart,
  ArrowRight,
  Users,
  ShieldCheck,
  LogOut,
  Copy,
  Check,
  Wifi,
  WifiOff,
  X,
  Sparkles,
  Clock3,
} from "lucide-react";
import {
  identity,
  login,
  guestLogin,
  logout,
  priorityAccess,
  createRoom,
  joinRoom,
  friendlyError,
  db,
  ref,
  get,
  set,
  update,
  roomPath,
  connect,
  disconnect,
} from "./firebase.js";
import { GAMES, DEFAULT_SETTINGS, WORDS, WHEEL_TOPICS } from "./content.js";
import { GameArt } from "./art.jsx";
import { lobbyStartUpdate } from "./lobby.js";
import { isPermissionDenied } from "./rooms.js";
import { GameChangeControls } from "./GameChangeControls.jsx";
import { requestGameChange, respondToGameChange } from "./game-change.js";
import { SoundControls } from "./SoundControls.jsx";
import { soundInteraction } from "./sound.js";
import { useRoom } from "./useRoom.js";
import Game from "./Game.jsx";
const saved = () => {
  try {
    return JSON.parse(localStorage.getItem("gah-room") || "null");
  } catch {
    return null;
  }
};
const remember = (data) => {
  try {
    localStorage.setItem("gah-room", JSON.stringify(data));
  } catch {}
};
export function Button({
  children,
  secondary = false,
  className = "",
  ...props
}) {
  return (
    <button
      className={`button ${secondary ? "secondary" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Tag({ children }) {
  return <span className="tag">{children}</span>;
}
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Notice({ children }) {
  return (
    <div className="notice">
      <Sparkles size={17} />
      <span>{children}</span>
    </div>
  );
}
function Brand({ onClick }) {
  return (
    <button
      className="brand"
      onClick={onClick}
      aria-label="Games at Home, home"
    >
      <span className="brand-icon">
        <House size={23} />
        <Heart size={8} />
      </span>
      <span>
        games at home<span className="brand-dot">.</span>
      </span>
    </button>
  );
}
export default function App() {
  const [user, setUser] = useState(null),
    [authReady, setAuthReady] = useState(false),
    [priority, setPriority] = useState(false);
  const [code, setCode] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [last, setLast] = useState(saved());
  const [reservedCode, setReservedCode] = useState("");
  const report = (e) => setError(friendlyError(e));
  async function establish(u) {
    setReservedCode("");
    if (u && !u.isAnonymous) {
      connect();
      try {
        const preferred = await priorityAccess(u);
        setPriority(preferred);
        if (preferred) {
          const m = (await get(ref(db, "rooms/0/meta"))).val();
          setReservedCode(m?.open && m.leaseEnd > Date.now() ? m.code : "");
        }
      } finally {
        disconnect();
      }
    } else setPriority(false);
    setUser(u);
    setAuthReady(true);
  }
  useEffect(() => {
    identity()
      .then(establish)
      .catch((e) => {
        report(e);
        setAuthReady(true);
      });
  }, []);
  useEffect(() => {
    if (!user || code) return;
    const stored = saved(),
      incoming = new URLSearchParams(location.search).get("room");
    if (stored?.uid === user.uid && (!incoming || incoming === stored.code)) {
      connect();
      joinRoom(stored.code, user.uid, stored.name)
        .then(() => setCode(stored.code))
        .catch(() => disconnect());
    }
  }, [user?.uid]);
  const act = async (fn) => {
    setError("");
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const enter = async (mode, name, input, reserved, game) =>
    act(async () => {
      if (mode === "join" && input.trim().startsWith("0") && !priority) {
        throw Error(
          "This is a reserved room. Use Google sign-in with one of the two approved accounts.",
        );
      }
      const player = user || (await guestLogin());
      if (!user) {
        setUser(player);
        setPriority(false);
      }
      connect();
      try {
        const value =
          mode === "create"
            ? await createRoom(player.uid, name, reserved && priority, game)
            : input.trim().toUpperCase();
        if (mode === "join") await joinRoom(value, player.uid, name);
        const data = { code: value, name, uid: player.uid };
        remember(data);
        setLast(data);
        setCode(value);
        history.replaceState({}, "", `${location.pathname}?room=${value}`);
      } catch (error) {
        disconnect();
        throw error;
      }
    });
  const home = () => {
    setCode(null);
    disconnect();
    setError("");
    history.replaceState({}, "", location.pathname);
  };
  return (
    <>
      <div className="page-shell" onClickCapture={soundInteraction} onSubmitCapture={soundInteraction}>
        <header className="site-header">
          <Brand
            onClick={() => {
              if (!code) home();
            }}
          />
          <span className="header-note">
            <Heart size={14} /> a little closer, wherever you are
          </span>
          <SoundControls />
          {!code && user && !user.isAnonymous && (
            <button
              className="text-button"
              onClick={() =>
                act(async () => {
                  await logout();
                  setUser(null);
                  setPriority(false);
                  setReservedCode("");
                })
              }
            >
              <LogOut size={15} /> Sign out
            </button>
          )}
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {code && user ? (
          <Room
            key={code}
            code={code}
            user={user}
            onHome={home}
            report={report}
            act={act}
            busy={busy}
          />
        ) : (
          <Home
            user={user}
            ready={authReady}
            priority={priority}
            reservedCode={reservedCode}
            busy={busy}
            last={last}
            onLogin={() => act(async () => establish(await login()))}
            onEnter={enter}
          />
        )}
        <footer>
          <span>
            <House size={13} /> A little place for quality time.
          </span>
          <span>Made for two. Always free to play.</span>
        </footer>
      </div>
    </>
  );
}
function Home({
  user,
  ready,
  priority,
  reservedCode,
  busy,
  last,
  onLogin,
  onEnter,
}) {
  const incoming = new URLSearchParams(location.search).get("room") || "";
  const [mode, setMode] = useState(incoming ? "join" : "create"),
    [name, setName] = useState(last?.name || ""),
    [input, setInput] = useState(incoming),
    [game, setGame] = useState("wheel"),
    [reserved, setReserved] = useState(true);
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <Tag>
            <span className="live-dot" /> TWO PLAYERS. ONE GOOD EVENING.
          </Tag>
          <h1>
            Good company.
            <br />
            Great little <em>games.</em>
            <svg className="title-spark" viewBox="0 0 50 55" aria-hidden="true">
              <path
                d="m20 25 8-20m-3 28 21-6M20 40l17 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </h1>
          <p>
            Put the world on pause. Pick a game, invite your favorite person,
            and make a little time for each other.
          </p>
          <div className="hero-benefits">
            <span>
              <Users size={17} /> Just the two of you
            </span>
            <span>
              <Heart size={17} /> A few minutes, a little closer
            </span>
          </div>
          <div className="handwritten">
            Your next “one more round?” starts here <span>↗</span>
          </div>
        </div>
        <div className="entry-card">
          <div className="card-kicker">
            <span className="tiny-house">
              <House size={21} />
            </span>
            <span>COME ON IN</span>
            <span className="tiny-star">✧</span>
          </div>
          <h2>Pull up a chair.</h2>
          <p className="muted">A cozy little room for your next game.</p>
          <div className="tabs" aria-label="Room action">
            <button
              className={mode === "create" ? "active" : ""}
              onClick={() => setMode("create")}
            >
              Create a room
            </button>
            <button
              className={mode === "join" ? "active" : ""}
              onClick={() => setMode("join")}
            >
              Join a room
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onEnter(mode, name.trim(), input, priority && reserved, game);
            }}
          >
            <Field label="What should we call you?">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={24}
                required
                placeholder="Your nickname"
                autoComplete="nickname"
              />
            </Field>
            {mode === "join" && (
              <Field label="Room code">
                <input
                  value={input}
                  onChange={(e) =>
                    setInput(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                    )
                  }
                  placeholder="e.g. 1H7K2M9P"
                  maxLength={8}
                  minLength={8}
                  required
                  className="code-input"
                />
              </Field>
            )}
            {mode === "create" && priority && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={reserved}
                  onChange={(e) => setReserved(e.target.checked)}
                />
                <span>
                  Use our reserved room
                  <small>Always saved for your two accounts.</small>
                </span>
                <ShieldCheck size={18} />
              </label>
            )}
            <Button type="submit" disabled={!ready || busy || !name.trim()}>
              {busy
                ? "Getting your room ready…"
                : mode === "create"
                  ? !user || user.isAnonymous
                    ? "Create room as guest"
                    : "Make room for two"
                  : !user || user.isAnonymous
                    ? "Join room as guest"
                    : "Join your person"}
              <ArrowRight size={18} />
            </Button>
            {(!user || user.isAnonymous) && (
              <Button
                secondary
                type="button"
                onClick={onLogin}
                disabled={!ready || busy}
                className="google-entry"
              >
                <span className="google-g">G</span>
                Google sign-in for reserved access
              </Button>
            )}
            <p className="entry-footnote">
              <ShieldCheck size={13} />
              {user && !user.isAnonymous
                ? "Private room codes. No downloads. No fuss."
                : "No signup needed. Guests rejoin in the same browser."}
            </p>
          </form>
          {user && (reservedCode || last?.uid === user.uid) && (
            <button
              className="resume-link"
              onClick={() => {
                setMode("join");
                setInput(reservedCode || last.code);
              }}
            >
              Rejoin {reservedCode ? "your reserved room" : "your last room"}{" "}
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </section>
      <section className="game-library" id="games">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE LITTLE GAME COLLECTION</span>
            <h2>What are we playing tonight?</h2>
          </div>
          <span className="subtle">Three ways to spend time together.</span>
        </div>
        <div className="game-cards">
          {Object.entries(GAMES).map(([id, g], i) => (
            <button
              key={id}
              className={`game-card ${g.color} ${game === id ? "selected" : ""}`}
              aria-pressed={game === id}
              onClick={() => setGame(id)}
            >
              <div className="game-card-top">
                <span>0{i + 1}</span>
                <span>
                  {game === id ? "FIRST UP" : "2 PLAYERS"}{" "}
                  {game === id && <Check size={12} />}
                </span>
              </div>
              <GameArt game={id} />
              <div className="game-card-copy">
                <span className="game-tag">{g.tag}</span>
                <h3>{g.name}</h3>
                <p>{g.description}</p>
                <div className="game-card-bottom">
                  <span>
                    <Clock3 size={13} />
                    {g.time}
                  </span>
                  <span className="round-arrow">
                    <ArrowRight size={18} />
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="how-it-works">
        <span className="eyebrow">LESS SETUP, MORE TOGETHER</span>
        <div>
          <p>
            <b>01</b>
            <span>
              <strong>Make a little room</strong>Create a room and choose your
              game.
            </span>
          </p>
          <p>
            <b>02</b>
            <span>
              <strong>Send a little invite</strong>Share the code with your
              favorite person.
            </span>
          </p>
          <p>
            <b>03</b>
            <span>
              <strong>Stay a little longer</strong>Settle in. There’s always
              another round.
            </span>
          </p>
        </div>
      </section>
      <details className="public-info">
        <summary>How public rooms and privacy work</summary>
        <p>
          Four public rooms hold two players each, with no signup required. One additional room
          is reserved for the owners. A room code is an invitation: share it
          only with the person you want to play with. Your Google email is not
          shown to other players. Secret words stay private until the game
          reveals them.
        </p>
        <p>
          Rooms remain available for rejoining until the host ends them.
          Abandoned rooms expire after 24 hours without an active host. Game
          seats are limited; free service availability is not guaranteed.
        </p>
      </details>
    </main>
  );
}
function Room({ code, user, onHome, report, act, busy }) {
  const session = useRoom(code, user.uid, report);
  const { room, isHost, valid, connected, bothOnline, base, now } = session;
  const [copied, setCopied] = useState(false),
    [leaving, setLeaving] = useState(false);
  const settings = room.settings || DEFAULT_SETTINGS;
  const name = (uid) => room.players?.[uid]?.name || "Your person";
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}${location.pathname}?room=${code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      report(Error(`Copy this room code: ${code}`));
    }
  }
  async function leave() {
    await act(async () => {
      if (isHost) await set(ref(db, `${base}/meta/open`), false);
      onHome();
    });
  }
  if (room.meta && (!valid || room.meta.leaseEnd < now))
    return (
      <main className="empty-room">
        <House size={40} />
        <h1>This evening has ended.</h1>
        <p>
          The room is closed. There’s always another game to look forward to.
        </p>
        <Button onClick={onHome}>
          Back home
          <ArrowRight size={18} />
        </Button>
      </main>
    );
  if (!room.meta || !room.settings)
    return (
      <main className="empty-room">
        <span className="loading-dot" />
        <h2>Making things cozy…</h2>
      </main>
    );
  return (
    <main className="room">
      <div className="room-topline">
        <div>
          <span className="eyebrow">
            {code[0] === "0" ? "YOUR RESERVED ROOM" : "YOUR LITTLE ROOM"}
          </span>
          <button
            className="room-code"
            onClick={copy}
            title="Copy invitation link"
          >
            {code} {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        <div className="room-actions">
          <span className={`connection ${connected ? "" : "offline"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}{" "}
            {connected ? "Connected" : "Reconnecting…"}
          </span>
          <button className="text-button" onClick={() => setLeaving(true)}>
            <LogOut size={15} />
            {isHost ? "End room" : "Leave room"}
          </button>
        </div>
      </div>
      <div className="players-strip">
        {[room.meta.host, room.meta.guest].map((uid, i) => (
          <div className="player-chip" key={i}>
            <span className={`avatar avatar-${i}`}>
              {uid ? name(uid).slice(0, 1).toUpperCase() : <Users size={20} />}
            </span>
            <span>
              <strong>
                {uid ? name(uid) : "A seat for your person"}
                {uid === user.uid && <small> (you)</small>}
              </strong>
              <span className="player-status">
                <i
                  className={room.presence?.[uid] ? "online-dot" : "away-dot"}
                />
                {uid
                  ? room.presence?.[uid]
                    ? i === 0
                      ? "Host · here with you"
                      : "Here with you"
                    : "Away · seat saved"
                  : "Waiting for an invitation"}
              </span>
            </span>
            {room.state && uid && (
              <span className="score">
                {room.state.scores?.[uid] || 0}
                <small>points</small>
              </span>
            )}
          </div>
        ))}
        {!room.meta.guest && (
          <Button secondary onClick={copy}>
            {copied ? "Copied!" : "Invite your person"}
            <Copy size={15} />
          </Button>
        )}
      </div>
      {room.state ? (
        <>
          <GameChangeControls request={room.gameChange} gameId={room.state.id} uid={user.uid} name={name}
            connected={connected} hostOnline={Boolean(room.presence?.[room.meta.host])} busy={busy}
            onRequest={() => act(() => requestGameChange(db, base, room.state.id, user.uid))}
            onRespond={(accept) => act(() => respondToGameChange(db, base, room.gameChange, user.uid, accept))} />
          <Game {...session} uid={user.uid} name={name} act={act} busy={busy} />
        </>
      ) : (
        <Lobby
          room={room}
          settings={settings}
          uid={user.uid}
          isHost={isHost}
          base={base}
          act={act}
          busy={busy}
          bothOnline={bothOnline}
        />
      )}
      {leaving && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-heading"
          >
            <House size={30} />
            <h2 id="leave-heading">
              {isHost ? "Call it an evening?" : "Stepping away?"}
            </h2>
            <p>
              {isHost
                ? "Ending the room closes it for both players. You can create a new room whenever you like."
                : user.isAnonymous
                  ? "Your seat and progress are saved. Use this room code in the same browser to rejoin. Clearing browser data or changing your sign-in loses your guest seat."
                  : "Your seat and progress are saved. Sign in with the same Google account and use this room code to rejoin."}
            </p>
            <div className="modal-buttons">
              <Button secondary onClick={() => setLeaving(false)}>
                Stay a little longer
              </Button>
              <Button onClick={leave} disabled={busy}>
                {isHost ? "End room" : "Leave for now"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
export function Lobby({ room, settings, uid, isHost, base, act, busy, bothOnline }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings.version]);
  const change = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const ready = (room.ready?.[uid] || 0) > 0;
  const guestReady =
    room.meta.guest && (room.ready?.[room.meta.guest] || 0) > 0;
  const save = () =>
    act(async () => {
      const version = settings.version + 1;
      await update(ref(db), {
        [`${base}/settings`]: { ...draft, version },
      });
    });
  const start = () =>
    act(async () => {
      try {
        await update(ref(db), lobbyStartUpdate(
          base,
          { ...draft, version: dirty ? settings.version + 1 : settings.version },
          [room.meta.host, room.meta.guest],
          crypto.randomUUID(),
        ));
      } catch (error) {
        if (isPermissionDenied(error)) throw Error("Couldn’t start. Check that your room is open and your guest is still ready, then try again.");
        throw error;
      }
    });
  const cfg = isHost ? draft : settings;
  return (
    <>
      <div className="lobby-heading">
        <Tag>
          <Heart size={13} /> MAKE YOURSELVES AT HOME
        </Tag>
        <h1>A good evening starts here.</h1>
        <p>
          {isHost
            ? "Pick a game and set the mood. Start when your person is ready; your latest settings save automatically."
            : "You can get ready while your host sets things up, or unready at any time before they start."}
        </p>
      </div>
      <div className="lobby-layout">
        <div className="lobby-games">
          {Object.entries(GAMES).map(([id, g]) => (
            <button
              disabled={!isHost}
              key={id}
              className={`lobby-game ${g.color} ${cfg.game === id ? "selected" : ""}`}
              onClick={() => change("game", id)}
            >
              <GameArt game={id} />
              <span>
                <strong>{g.name}</strong>
                <small>{g.tag}</small>
              </span>
              <span className="radio-mark">
                {cfg.game === id && <Check size={14} />}
              </span>
            </button>
          ))}
        </div>
        <section className="settings-card">
          <div className="section-heading">
            <h2>A few little details</h2>
            <Tag>{isHost ? "HOST SETTINGS" : "REVIEW SETTINGS"}</Tag>
          </div>
          <fieldset disabled={!isHost || busy}>
            <div className="settings-grid">
              {cfg.game !== "chain" && (
                <Field label="Rounds">
                  <select
                    value={cfg.rounds}
                    onChange={(e) => change("rounds", +e.target.value)}
                  >
                    {[2, 4, 6, 8, 10, 12, 20].map((n) => (
                      <option key={n} value={n}>
                        {n} rounds
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Time for guessing">
                <select
                  value={cfg.timer}
                  onChange={(e) => change("timer", +e.target.value)}
                >
                  {[0, 30, 60, 90, 120, 180, 300].map((n) => (
                    <option key={n} value={n}>
                      {n ? `${n} seconds` : "No rush · untimed"}
                    </option>
                  ))}
                </select>
              </Field>
              {cfg.game === "chain" && (
                <Field label="Words per player">
                  <select
                    value={cfg.wordCount}
                    onChange={(e) => change("wordCount", +e.target.value)}
                  >
                    {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
              )}
              {cfg.game === "clues" && (
                <Field label="Guesses per hint">
                  <select
                    value={cfg.guessesPerHint}
                    onChange={(e) => change("guessesPerHint", +e.target.value)}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </Field>
              )}
              {cfg.game === "clues" && (
                <Field label="Clue topic">
                  <select
                    value={cfg.category}
                    onChange={(e) => change("category", e.target.value)}
                  >
                    <option value="surprise">Surprise us each round</option>
                    {Object.keys(WORDS).map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {cfg.game === "wheel" && (
              <>
                <Field label="Topic">
                  <select value={cfg.topic} onChange={(e) => change("topic", e.target.value)}>
                    <option value="surprise">Surprise us each round</option>
                    {Object.entries(WHEEL_TOPICS).map(([id, topic]) => (
                      <option key={id} value={id}>{topic.name}</option>
                    ))}
                    {cfg.topic === "custom" && <option value="custom">Previous custom scale</option>}
                  </select>
                </Field>
                <p className="muted">Each round comes with a pair of opposites for this topic.</p>
              </>
            )}
          </fieldset>
          <div className="rules-note">
            <strong>How this one works</strong>
            <p>
              {cfg.game === "wheel"
                ? "The system gives a topic and a pair of opposites. Spin to see a hidden 1–2–3–4–3–2–1 scoring band. Name something in that topic that would lead your partner to the 4-point zone. They place the needle, then you reveal and score. Swap roles each round."
                : cfg.game === "chain"
                  ? "Build a secret chain: every neighboring pair must form a meaningful connection, like coffee → shop → window → shopping → cart. Suggestions follow the word you type. Only the first word starts with a visible initial. All other letters require a hint. Correct guesses keep your turn; wrong guesses or letter hints pass it. Both chains and each word’s guess history are shown at the end. First to solve the other chain wins."
                  : "Choose a word that fits the topic, then give the first single-word hint. Your partner gets two guesses by default (adjustable above). Review their guesses before tailoring each next hint. Up to three hints; a correct guess ends the round. Swap roles each round."}
            </p>
            <small>
              Timers apply to guessing. Preparation is untimed. The clock pauses
              while a player is away.
            </small>
          </div>
          {isHost ? (
            <div className="form-buttons">
              {dirty && <Button secondary onClick={save} disabled={busy || !draft.left.trim() || !draft.right.trim()}>
                Save settings <Check size={17} />
              </Button>}
              <Button onClick={start} disabled={busy || !guestReady || !bothOnline || !draft.left.trim() || !draft.right.trim()}>
                {!room.meta.guest ? "Waiting for your person…"
                  : !guestReady ? "Waiting for guest to be ready…"
                  : !bothOnline ? "Waiting for both players…" : "Start game"}
                <ArrowRight size={18} />
              </Button>
            </div>
          ) : (
            <Button onClick={() => act(() => set(ref(db, `${base}/ready/${uid}`), ready ? 0 : 1))}
              disabled={busy} secondary={ready} aria-pressed={ready}>
              {ready ? "Unready" : "I’m ready"}<Check size={17} />
            </Button>
          )}
          <p className="entry-footnote">
            {isHost ? guestReady ? "Guest is ready. Start with the settings above whenever you are." : "Your guest can get ready while you choose the settings."
              : ready ? "You’re ready. Your host can keep adjusting settings, then start." : "Ready is independent of settings. You can change your mind before the game starts."}
          </p>
        </section>
      </div>
    </>
  );
}
