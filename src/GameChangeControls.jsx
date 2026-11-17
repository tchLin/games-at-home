export function GameChangeControls({ request, gameId, uid, name, connected, hostOnline, busy, onRequest, onRespond }) {
  const pending = request?.gameId === gameId && !request.completed ? request : null;
  if (!pending) return <div className="game-change-controls">
    <button className="button secondary" disabled={busy || !connected} onClick={onRequest}>Change game</button>
    <small>Ask your person to return to game selection together.</small>
  </div>;
  const mine = pending.requestedBy === uid;
  return <section className="game-change-request" aria-label="Change game request" aria-live="polite">
    <h2>{pending.accepted ? 'You both agreed to change games.' : mine ? 'Change-game request sent.' : `${name(pending.requestedBy)} wants to change games.`}</h2>
    <p>{pending.accepted ? hostOnline ? 'Returning to game selection…' : 'Waiting for the host to reconnect, then returning together.'
      : mine ? 'Waiting for your person to agree. You can keep playing or cancel.'
      : 'Agree to end this match and return together to game selection in this room. Decline to keep playing.'}</p>
    {!pending.accepted && <div className="form-buttons">
      {!mine && <button className="button" disabled={busy || !connected} onClick={() => onRespond(true)}>Agree · change game</button>}
      <button className="button secondary" disabled={busy || !connected} onClick={() => onRespond(false)}>{mine ? 'Cancel request' : 'Keep playing'}</button>
    </div>}
  </section>;
}
