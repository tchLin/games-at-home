import { Button, Notice } from './App.jsx';
import { guessers, judgePartyReverse, exactAudio } from './party.js';
export function PartyStatus({ s, uid, name, secret, submissions = {}, disabled, mutate, act }) {
  const reveal = s.phase === 'reveal';
  const giver = uid === s.giver;
  const loaded = guessers(s).every((p) => Object.hasOwn(submissions, p));
  const verdict = (player, pass) => act(() => mutate((v) => judgePartyReverse(v, secret, submissions, player, pass), s));
  return <section className="party-status" aria-label={reveal ? 'Round results' : 'Players this round'}>
    {!giver && !reveal && <Notice>{s.progress[uid]?.done
      ? s.progress[uid].correct ? 'You found it! Waiting for the other players.' : 'Your guesses are finished. Waiting for the reveal.'
      : submissions[uid]?.entries?.[s.progress[uid]?.count || 0] ? 'Your answer is in. Waiting for the clue giver.'
      : 'Your guesses stay private from the other guessers until the reveal.'}</Notice>}
    {giver && !loaded && !reveal && <p>Syncing guesses…</p>}
    <div className="party-players">{guessers(s).map((player) => {
      const progress = s.progress[player];
      const entries = reveal ? s.results?.[player]?.attempts || []
        : giver || player === uid ? Object.values(submissions[player]?.entries || {}).map((entry, i) => ({ guess: entry.value, hint: entry.hint, ...(i < progress.count ? { correct: progress.correct && i === progress.count - 1 } : {}) })) : [];
      const pending = s.game === 'reverse' && s.phase === 'guess' && giver && !progress.done && submissions[player]?.entries?.[0];
      return <section className="party-player" key={player}>
        <h3>{name(player)}{player === uid ? ' (you)' : ''}</h3>
        {reveal ? <p><strong>+{s.results?.[player]?.points || 0} points</strong>
          {s.game === 'wheel' && <> · {s.results?.[player]?.guess < 0 ? 'No guess' : `Guess: ${s.results[player].guess}/100`}</>}</p>
          : <p>{progress.done ? progress.correct ? 'Solved ✓' : 'Finished' : s.game === 'clues' ? `${progress.used}/${s.config.guessesPerHint} guesses this hint` : submissions[player]?.entries?.[0] ? 'Answer received' : 'Thinking…'}</p>}
        {s.game !== 'wheel' && entries.length > 0 && <ol aria-label={`${name(player)}’s guesses`}>{entries.map((entry, i) => <li key={i}>
          {entry.hint > 0 && <small>Hint {entry.hint}: </small>}{entry.guess}
          {entry.correct !== undefined && (entry.correct ? ' ✓' : ' ×')}
        </li>)}</ol>}
        {pending && (exactAudio(pending.value, secret?.word) ? <p>Exact match · adding a point…</p> : <div className="form-buttons">
          <Button disabled={disabled || !loaded} onClick={() => verdict(player, true)}>Pass · {name(player)}</Button>
          <Button secondary disabled={disabled || !loaded} onClick={() => verdict(player, false)}>No pass · {name(player)}</Button>
        </div>)}
      </section>;
    })}</div>
  </section>;
}
