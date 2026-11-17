import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  EyeOff,
  Lightbulb,
  RefreshCw,
  Send,
  Sparkles,
  Trophy,
  Heart,
} from "lucide-react";
import { db, ref, set } from "./firebase.js";
import { GAMES, suggestions } from "./content.js";
import { other, deadline, nextRound, chainMasks, normalize } from "./engine.js";
import { Dial } from "./art.jsx";
import { spinTarget } from "./wheel.js";
import { wordSuggestions } from "./word-links.js";
import { playGameSound } from "./sound.js";
import { Button, Field, Tag, Notice } from "./App.jsx";
export default function Game(props) {
  const {
    room,
    uid,
    secret,
    isHost,
    bothOnline,
    connected,
    now,
    mutate,
    act,
    busy,
    base,
  } = props;
  const s = room.state;
  const previousState = useRef(null);
  useEffect(() => {
    const before = previousState.current;
    previousState.current = s;
    if (!before || before.id !== s.id) {
      if (["prepare", "setup"].includes(s.phase)) playGameSound("start");
      return;
    }
    if (s.phase === "finished" && before.phase !== "finished") playGameSound("finish");
    else if (s.phase === "reveal" && before.phase !== "reveal") playGameSound(s.result?.points ? "success" : "reveal");
    else if (s.players.some((player) => s.scores[player] > before.scores[player])) playGameSound("success");
    else if (s.game === "wheel" && before.phase === "prepare" && s.phase === "clue") playGameSound("spin");
    else if (s.phase === "guess" && (before.phase !== "guess" || before.turn !== s.turn) &&
      (s.game === "chain" ? s.turn === uid : s.giver !== uid)) playGameSound("turn");
    else if (s.phase === "hint" && before.phase !== "hint" && s.giver === uid) playGameSound("turn");
  }, [s, uid]);
  const mine =
    secret?.gameId === s.id && secret.round === s.round ? secret : null;
  const disabled = busy || !bothOnline || !connected || Boolean(s.pausedAt);
  const seconds = Math.max(
    0,
    Math.ceil(((s.deadline || 0) - (s.pausedAt || now)) / 1000),
  );
  const send = (kind, value, index = 0) =>
    act(() =>
      mutate(
        (v) =>
          v.phase === "guess"
            ? {
                ...v,
                phase: "pending",
                deadline: 0,
                pending: { actor: uid, kind, value, index },
              }
            : null,
        s,
      ),
    );
  return (
    <section className={`play-area ${GAMES[s.game].color}`}>
      <div className="game-heading">
        <div>
          <span className="eyebrow">
            {s.game === "chain"
              ? "YOUR WORD RACE"
              : `ROUND ${s.round} OF ${s.config.rounds}`}
          </span>
          <h1>{GAMES[s.game].name}</h1>
        </div>
        <Tag>
          <Clock3 size={14} />
          {s.phase === "guess" && s.config.timer
            ? `${seconds}s ${s.pausedAt ? "· paused" : ""}`
            : s.config.timer
              ? `${s.config.timer}s per guessing turn`
              : "No rush"}
        </Tag>
      </div>
      {(!bothOnline || s.pausedAt) && s.phase !== "finished" && (
        <Notice>
          Your game is saved. Waiting for both players to be here before
          continuing.
        </Notice>
      )}
      {s.phase === "finished" ? (
        <div className="game-stage end-stage">
          <div className="trophy">
            <Trophy size={34} />
          </div>
          <Tag>THAT WAS A GOOD ONE</Tag>
          <h2>
            {s.game === "wheel"
              ? "On the same wavelength."
              : s.game === "chain"
                ? `${props.name(s.winner)} found every word!`
                : s.scores[s.players[0]] === s.scores[s.players[1]]
                  ? "A perfectly matched pair."
                  : `${props.name(s.players.reduce((a, b) => (s.scores[a] > s.scores[b] ? a : b)))} takes this one!`}
          </h2>
          <p>
            {s.game === "wheel"
              ? `You earned ${s.scores[uid]} points together.`
              : "The best part? There’s always another round."}
          </p>
          <div className="final-scores">
            {s.players.map((p) => (
              <div key={p}>
                <strong>{s.scores[p]}</strong>
                <span>{props.name(p)}</span>
              </div>
            ))}
          </div>
          {s.game === "chain" && <ChainAnswers s={s} uid={uid} secret={mine} name={props.name} />}
          {isHost ? (
            <Button
              onClick={() => act(() => set(ref(db, `${base}/state`), null))}
            >
              What shall we play next?
              <ArrowRight size={17} />
            </Button>
          ) : (
            <Notice>Your host can choose the next game.</Notice>
          )}
        </div>
      ) : (
        <div className="game-stage" key={`${s.id}-${s.round}`}>
          {s.game === "wheel" ? (
            <Wheel
              {...props}
              s={s}
              secret={mine}
              disabled={disabled}
              send={send}
            />
          ) : s.game === "chain" ? (
            <Chain
              {...props}
              s={s}
              secret={mine}
              disabled={disabled}
              send={send}
            />
          ) : (
            <Clues
              {...props}
              s={s}
              secret={mine}
              disabled={disabled}
              send={send}
            />
          )}
        </div>
      )}
      {s.phase === "reveal" && (
        <div className="round-footer">
          {isHost ? (
            <Button
              disabled={busy || !bothOnline}
              onClick={() => act(() => mutate((v) => nextRound(v, now), s))}
            >
              {s.round >= s.config.rounds
                ? "See how you did"
                : "One more round"}
              <ArrowRight size={18} />
            </Button>
          ) : (
            <span>Your host will start the next round.</span>
          )}
        </div>
      )}
    </section>
  );
}
function Wheel({
  s,
  secret,
  uid,
  name,
  disabled,
  send,
  mutate,
  act,
  now,
  secretPath,
}) {
  const [clue, setClue] = useState(""),
    [guess, setGuess] = useState(50);
  const giver = s.giver === uid,
    reveal = s.phase === "reveal";
  const target = reveal ? s.result.target : giver ? secret?.target : null;
  const submit = (e) => {
    e.preventDefault();
    act(() =>
      mutate(
        (v) => ({
          ...v,
          clue: clue.trim(),
          phase: "guess",
          deadline: deadline(v, now),
        }),
        s,
      ),
    );
  };
  const spin = () =>
    act(async () => {
      await set(ref(db, secretPath), {
        gameId: s.id,
        round: s.round,
        target: spinTarget(),
      });
      await mutate((v) => ({ ...v, phase: "clue" }), s);
    });
  return (
    <>
      <div className="stage-title">
        <Tag>
          {reveal
            ? "THE BIG REVEAL"
            : giver
              ? "YOU’RE THE CLUE GIVER"
              : "YOU’RE THE MIND READER"}
        </Tag>
        <h2>
          {reveal
            ? s.result.points >= 3
              ? "You two get each other."
              : "A little closer next time."
            : s.phase === "clue" && giver
              ? "What belongs right here?"
              : s.clue
                ? "Where does this belong?"
                : `${name(s.giver)} is finding the perfect clue.`}
        </h2>
        <p>
          {reveal
            ? "The band scores 1–2–3–4–3–2–1. The dark needle is your guess; outside the band scores 0."
            : giver
              ? "Spin to reveal your secret scoring band. Name something in the topic that leads your partner to the 4-point zone."
              : s.clue
                ? "Place the needle where this clue belongs between the two opposites. Aim for the hidden 4-point zone."
                : "The target stays hidden. Your clue is on its way."}
        </p>
      </div>
      {s.clue && <div className="wheel-clue" aria-label="The clue">
        <span>YOUR CLUE</span><strong>{s.clue}</strong>
      </div>}
      <p className="wheel-topic"><span>TOPIC</span> {s.topicLabel || "Your topic"}</p>
      <div className="wheel-panel">
        <Dial
          target={target}
          guess={reveal && s.result.guess >= 0 ? s.result.guess : guess}
          showGuess={
            reveal ? s.result.guess >= 0 : !giver && s.phase === "guess"
          }
        />
        <div className="scale-labels">
          <span>{s.left}</span>
          <span>{s.right}</span>
        </div>
        {giver && !reveal && secret && (
          <div className="secret-target">
            <EyeOff size={14} /> Secret 4-point center:{" "}
            <strong>{secret.target}/100</strong>
          </div>
        )}
        {reveal && (
          <div className="reveal-points">
            <strong>+{s.result.points}</strong>
            <span>
              points together{" "}
              {s.result.timedOut
                ? "· time ran out"
                : `· ${Math.abs(s.result.target - s.result.guess)} apart`}
            </span>
          </div>
        )}
      </div>
      {giver && s.phase === "prepare" && (
        <div className="action-form">
          <Button onClick={spin} disabled={disabled}>
            <RefreshCw size={17} /> Spin the wheel
          </Button>
        </div>
      )}
      {giver && s.phase === "clue" && (
        <form onSubmit={submit} className="action-form">
          <Field label="Your clue">
            <input
              autoFocus
              value={clue}
              onChange={(e) => setClue(e.target.value)}
              placeholder={s.topicLabel === "Pokémon" ? "Name a Pokémon…" : `Name something in ${s.topicLabel || "this topic"}…`}
              maxLength={80}
              required
              disabled={disabled}
            />
          </Field>
          <Button disabled={disabled || !clue.trim()}>
            Send your clue
            <Send size={16} />
          </Button>
        </form>
      )}
      {!giver && s.phase === "guess" && (
        <form
          className="action-form"
          onSubmit={(e) => {
            e.preventDefault();
            send("guess", guess);
          }}
        >
          <label className="range-label" htmlFor="wheel-guess">
            Your instinct <strong>{guess}/100</strong>
          </label>
          <input
            id="wheel-guess"
            className="range"
            type="range"
            min="0"
            max="100"
            value={guess}
            onChange={(e) => setGuess(+e.target.value)}
            disabled={disabled}
          />
          <Button disabled={disabled}>
            Lock in my guess
            <Check size={17} />
          </Button>
        </form>
      )}
      {giver && s.phase === "guess" && (
        <Notice>
          You sent “{s.clue}”. Let’s see where your person places it.
        </Notice>
      )}
      {s.phase === "pending" && (
        <Notice>Bringing your guesses together…</Notice>
      )}
    </>
  );
}
function WordIdeas({ category, onPick, exclude = [] }) {
  const [ideas, setIdeas] = useState(() => suggestions(category, 6, exclude));
  return (
    <div className="word-ideas">
      <div>
        <span>
          <Lightbulb size={15} /> A little inspiration
        </span>
        <button
          className="text-button"
          type="button"
          onClick={() => setIdeas(suggestions(category, 6, exclude))}
        >
          <RefreshCw size={13} /> More ideas
        </button>
      </div>
      <div className="suggestion-chips">
        {ideas.map((w) => (
          <button type="button" key={w} onClick={() => onPick(w)}>
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}
function Chain({
  s,
  secret,
  uid,
  name,
  disabled,
  send,
  mutate,
  act,
  secretPath,
  now,
}) {
  const [words, setWords] = useState(Array(s.config.wordCount).fill("")),
    [guess, setGuess] = useState(""),
    [selected, setSelected] = useState(0),
    [editing, setEditing] = useState(0);
  const opponent = other(s, uid),
    board = s.boards?.[opponent],
    myBoard = s.boards?.[uid];
  useEffect(() => {
    if (board?.solved?.[selected])
      setSelected(board.masks.findIndex((_, i) => !board.solved?.[i]));
  }, [board]);
  if (s.phase === "setup") {
    const suggestionIndex = words[editing].trim() ? editing + 1 : editing;
    const previous = suggestionIndex > 0 ? words[suggestionIndex - 1].trim() : "";
    const { ideas, matches } = wordSuggestions(previous, words.filter((_, i) => i !== suggestionIndex));
    const save = (e) => {
      e.preventDefault();
      act(async () => {
        const clean = words.map((w) => w.trim());
        if (clean.some((w) => !normalize(w)))
          throw Error("Each word needs at least one letter or number.");
        if (new Set(clean.map(normalize)).size !== clean.length)
          throw Error("Give each spot a different word.");
        await set(ref(db, secretPath), {
          gameId: s.id,
          round: s.round,
          words: clean,
        });
        await mutate((v) => {
          if (v.phase !== "setup" || v.boards?.[uid]) return null;
          return {
            ...v,
            boards: {
              ...v.boards,
              [uid]: { masks: chainMasks(clean) },
            },
          };
        });
      });
    };
    return (
      <>
        <div className="stage-title">
          <Tag>YOUR SECRET WORD CHAIN</Tag>
          <h2>
            {myBoard
              ? "Your words are tucked away."
              : "One word leads to another."}
          </h2>
          <p>
            {myBoard
              ? `Waiting for ${name(opponent)} to finish their chain.`
              : `Build ${s.config.wordCount} connected words, one at a time. Each neighboring pair should make sense together. Only word 1 starts with a letter; the others stay hidden until a letter hint.`}
          </p>
        </div>
        {myBoard ? (
          <div className="saved-word-list">
            {secret?.words.map((w, i) => (
              <span key={i}>
                <Check size={14} />
                {w}
              </span>
            ))}
          </div>
        ) : (
          <form onSubmit={save} className="word-setup">
            <div className="word-inputs">
              {words.map((w, i) => (
                <Field key={i} label={`Word ${i + 1}`}>
                  <input
                    value={w}
                    id={`chain-word-${i}`}
                    onFocus={() => setEditing(i)}
                    onChange={(e) => {
                      setEditing(i);
                      setWords((list) => list.map((x, j) => i === j ? e.target.value : x));
                    }}
                    maxLength={40}
                    required
                    pattern="[^\s]+"
                    title="One word without spaces"
                    disabled={disabled || (i > 0 && !words[i - 1].trim())}
                    placeholder={i === 0 ? "Start anywhere, e.g. coffee" : `Connect to word ${i}`}
                  />
                </Field>
              ))}
            </div>
            <div className="word-ideas" aria-live="polite">
              <div><span><Lightbulb size={15} />
                {!previous ? "Choose your first word to see connected ideas."
                  : suggestionIndex >= words.length ? "Your chain is complete. Read it through together after the game."
                  : `After “${previous}”, try…`}
              </span></div>
              {suggestionIndex < words.length && matches.some((match) => match.kind !== "exact") && (
                <p className="muted">Ideas based on {matches.map((match) => `“${match.word}”`).join(", ")}. Your word stays as you typed it.</p>
              )}
              {suggestionIndex < words.length && previous && (
                ideas.length ? <div className="suggestion-chips">
                  {ideas.map((word) => <button type="button" key={word} disabled={disabled}
                    onClick={() => {
                      setWords((list) => list.map((value, i) => i === suggestionIndex ? word : value));
                      setEditing(suggestionIndex);
                      document.getElementById(`chain-word-${suggestionIndex}`)?.focus();
                    }}>{word}</button>)}
                </div> : <p className="muted">No close matches yet. Type your own connection in word {suggestionIndex + 1}.</p>
              )}
              <small>Ideas are optional. Any meaningful connection works—talk it through on your call. Example: coffee → shop → window → shopping → cart.</small>
            </div>
            <div className="form-buttons">
              <Button disabled={disabled || words.some((w) => !w.trim())}>
                Tuck these away
                <EyeOff size={16} />
              </Button>
            </div>
          </form>
        )}
      </>
    );
  }
  const myTurn = s.turn === uid && s.phase === "guess";
  return (
    <>
      <div className="stage-title">
        <Tag>{myTurn ? "YOUR TURN" : "THEIR TURN"}</Tag>
        <h2>{myTurn ? "Follow the letters." : "A little thinking time."}</h2>
        <p>
          {myTurn
            ? "Use the connections to guess. Later words stay hidden until you spend a turn revealing a letter."
            : `${name(s.turn)} is working on your words.`}
        </p>
      </div>
      {s.feedback && (
        <div className={`feedback ${s.feedback.kind}`}>
          <span>{name(s.feedback.actor)}:</span> {s.feedback.text}
        </div>
      )}
      <div className="word-boards">
        <section>
          <h3>
            {name(opponent)}’s secret words{" "}
            <span>
              {s.scores[uid]}/{s.config.wordCount}
            </span>
          </h3>
          <div className="word-rows">
            {board?.masks.map((word, i) => (
              <div key={i}>
                <button
                  className={`word-row ${selected === i ? "chosen" : ""} ${board.solved?.[i] ? "solved" : ""}`}
                  onClick={() => setSelected(i)}
                  disabled={!!board.solved?.[i] || !myTurn || disabled}
                >
                  <span className="word-number">{String(i + 1).padStart(2, "0")}</span>
                  <span className="letter-mask">{word}</span>
                  {board.solved?.[i] ? <Check size={17} /> : <span className="word-length">{[...word].length} letters</span>}
                </button>
                <GuessTrail board={board} index={i} label={`Your guesses for word ${i + 1}`} expanded={selected === i} />
              </div>
            ))}
          </div>
        </section>
        <section className="my-list">
          <h3>
            Your secret chain
            <EyeOff size={15} />
          </h3>
          {secret?.words.map((word, i) => (
            <div key={i} className="own-chain-word">
              <div className={myBoard?.solved?.[i] ? "crossed" : ""}>
                <span>{word}</span>
                <small>{myBoard?.solved?.[i] ? "found" : "still a mystery"}</small>
              </div>
              <GuessTrail board={myBoard} index={i} label={`${name(opponent)}’s guesses for word ${i + 1}`} />
            </div>
          ))}
        </section>
      </div>
      {myTurn && (
        <form
          className="action-form wide"
          onSubmit={(e) => {
            e.preventDefault();
            send("guess", guess.trim(), selected);
            setGuess("");
          }}
        >
          <Field label={`Your guess for word ${selected + 1}`}>
            <input
              autoFocus
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              maxLength={80}
              required
              placeholder="I think it’s…"
              disabled={disabled}
            />
          </Field>
          <div className="form-buttons">
            <Button
              secondary
              type="button"
              disabled={disabled || !board.masks[selected]?.includes("·")}
              onClick={() => send("hint", "", selected)}
            >
              <Lightbulb size={16} /> Reveal a letter · end turn
            </Button>
            <Button disabled={disabled || !guess.trim()}>
              Take a guess
              <ArrowRight size={17} />
            </Button>
          </div>
        </form>
      )}
      {s.phase === "pending" && <Notice>Checking that little guess…</Notice>}
    </>
  );
}
function GuessTrail({ board, index, label, expanded = false }) {
  const guesses = board?.guesses?.[index] || [];
  const count = board?.guessCounts?.[index] || guesses.length;
  return <details className="word-guess-trail" open={expanded}>
    <summary>{label} · {count}</summary>
    {count > guesses.length && <small>Showing the latest {guesses.length} guesses.</small>}
    {guesses.length ? <ol>{guesses.map((attempt, i) =>
      <li key={i} className={attempt.correct ? "correct" : ""}>
        <span>{attempt.guess}</span><span aria-label={attempt.correct ? "Correct" : "Incorrect"}>{attempt.correct ? "✓" : "×"}</span>
      </li>)}</ol> : <p>No guesses yet.</p>}
  </details>;
}
function ChainAnswers({ s, uid, secret, name }) {
  return <div className="chain-answers">
    <h3>Both chains, revealed</h3>
    <div className="word-boards">{s.players.map((owner) => {
      const board = s.boards?.[owner];
      const answers = board?.answers || (owner === uid ? secret?.words : null);
      return <section key={owner} aria-label={`${name(owner)}’s answers`}>
        <h4>{name(owner)}’s chain</h4>
        {answers ? <ol className="answer-list">{answers.map((word, i) => <li key={i}>
          <strong>{word}</strong><span>{board.solved?.[i] ? "Guessed" : "Revealed at the end"}</span>
          <GuessTrail board={board} index={i} label={`${name(other(s, owner))}’s guesses for word ${i + 1}`} />
        </li>)}</ol> : <p>Waiting for {name(owner)} to reconnect and share their answers.</p>}
      </section>;
    })}</div>
  </div>;
}
function Clues({
  s,
  secret,
  uid,
  name,
  disabled,
  send,
  mutate,
  act,
  secretPath,
  now,
}) {
  const [word, setWord] = useState(""),
    [hint, setHint] = useState(""),
    [guess, setGuess] = useState("");
  const topic = s.topicLabel || s.config.category;
  const giver = s.giver === uid,
    reveal = s.phase === "reveal";
  const prepare = (e) => {
    e.preventDefault();
    act(async () => {
      if (!normalize(word))
        throw Error("Choose a word with letters or numbers.");
      await set(ref(db, secretPath), {
        gameId: s.id,
        round: s.round,
        word: word.trim(),
      });
      await mutate((v) => ({ ...v, phase: "hint" }), s);
    });
  };
  const sendHint = (e) => {
    e.preventDefault();
    act(() => {
      if (normalize(hint) === normalize(secret?.word))
        throw Error("Keep the answer a secret. Try a different hint.");
      return mutate(
        (v) => ({
          ...v,
          hints: [...(v.hints || []), hint.trim()],
          hintIndex: v.hintIndex + 1,
          used: 0,
          phase: "guess",
          deadline: deadline(v, now),
        }),
        s,
      );
    }).then(() => setHint(""));
  };
  return (
    <>
      <div className="stage-title">
        <Tag>
          {reveal
            ? "THE LITTLE REVEAL"
            : giver
              ? "YOU’RE THE CLUE GIVER"
              : "YOU’RE THE WORD FINDER"}
        </Tag>
        <h2>
          {reveal
            ? s.result.correct
              ? "That’s the word!"
              : "A good little mystery."
            : s.phase === "prepare"
              ? giver
                ? "What’s your secret word?"
                : `${name(s.giver)} is choosing a word.`
              : giver
                ? "A little hint goes a long way."
                : "Three hints. One little lightbulb."}
        </h2>
        <p>
          {reveal ? (
            `The secret word was “${s.result.word}”.`
          ) : giver && secret ? (
            <>
              Your secret word: <strong>{secret.word}</strong> · only you can
              see this.
            </>
          ) : (
            `${s.config.guessesPerHint} ${s.config.guessesPerHint === 1 ? "guess" : "guesses"} per hint. Make them count.`
          )}
        </p>
      </div>
      <p className="wheel-topic"><span>THIS ROUND’S TOPIC</span>{topic}</p>
      <p className="clue-flow">Choose a word → Hint → {s.config.guessesPerHint} guesses → Adapt the next hint</p>
      {s.phase === "prepare" && giver && (
        <form className="action-form wide" onSubmit={prepare}>
          <Field label="Your secret word">
            <input
              autoFocus
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={`Choose a word about ${topic}…`}
              maxLength={40}
              pattern="[^\s]+"
              title="One word without spaces"
              required
              disabled={disabled}
            />
          </Field>
          <WordIdeas category={topic} onPick={setWord} />
          <Button disabled={disabled || !word.trim()}>
            Keep this word a secret
            <EyeOff size={17} />
          </Button>
        </form>
      )}
      {s.phase !== "prepare" && (
        <>
          <div className="hint-cards">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`hint-card ${s.hints?.[i] ? "revealed" : ""}`}
              >
                <span>HINT {i + 1}</span>
                <strong>{s.hints?.[i] || "?"}</strong>
                <small>
                  {s.hints?.[i]
                    ? "a little piece of the puzzle"
                    : "a little mystery"}
                </small>
              </div>
            ))}
          </div>
          {!!s.attempts?.length && <ClueHistory s={s} />}
          {giver && s.phase === "hint" && s.hintIndex > 0 && (
            <Notice>Review {name(other(s, uid))}’s guesses above, then tailor hint {s.hintIndex + 1} to guide them closer.</Notice>
          )}
          {giver && s.phase === "hint" && (
            <form onSubmit={sendHint} className="action-form">
              <Field
                label={`Hint ${(s.hints?.length || 0) + 1} · one word only`}
              >
                <input
                  autoFocus
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  maxLength={40}
                  pattern="[^\s]+"
                  title="Use one word for your hint"
                  required
                  placeholder="Your little hint…"
                  disabled={disabled}
                />
              </Field>
              <Button disabled={disabled || !hint.trim()}>
                Share this hint
                <Send size={16} />
              </Button>
            </form>
          )}
          {!giver && s.phase === "guess" && (
            <form
              className="action-form"
              onSubmit={(e) => {
                e.preventDefault();
                send("guess", guess.trim());
                setGuess("");
              }}
            >
              <Field
                label={`${s.config.guessesPerHint - s.used} ${s.config.guessesPerHint - s.used === 1 ? "guess" : "guesses"} left for this hint`}
              >
                <input
                  autoFocus
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="Could it be…"
                  disabled={disabled}
                />
              </Field>
              <Button disabled={disabled || !guess.trim()}>
                Take a guess
                <ArrowRight size={17} />
              </Button>
            </form>
          )}
          {reveal && (
            <div className="reveal-points">
              <strong>+{s.result.points}</strong>
              <span>
                {s.result.points
                  ? "A little victory for the word finder."
                  : "Some words like to stay mysterious."}
              </span>
            </div>
          )}
          {giver && s.phase === "guess" && (
            <Notice>Let’s see what {name(other(s, uid))} makes of that.</Notice>
          )}
          {!giver && s.phase === "hint" && (
            <Notice>The next hint is on its way.</Notice>
          )}
          {s.phase === "pending" && <Notice>Checking your guess…</Notice>}
        </>
      )}
    </>
  );
}

function ClueHistory({ s }) {
  return <section className="clue-history" aria-label="Guesses so far">
    <h3>Guesses so far</h3>
    {[1, 2, 3].map((hintNumber) => {
      const guesses = s.attempts.filter((attempt) => attempt.hint === hintNumber);
      if (!guesses.length) return null;
      return <div key={hintNumber}>
        <h4>Hint {hintNumber}: {s.hints?.[hintNumber - 1]}</h4>
        <ol>{guesses.map((attempt, index) => <li key={index}>
          <span>{attempt.guess}</span><strong>{attempt.correct ? "Correct ✓" : "Not it ×"}</strong>
        </li>)}</ol>
      </div>;
    })}
  </section>;
}
