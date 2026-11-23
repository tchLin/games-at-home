import { ref, runTransaction, update } from 'firebase/database';

export async function requestGameChange(db, base, gameId, uid, players) {
  const requestId = crypto.randomUUID();
  const result = await runTransaction(ref(db, `${base}/gameChange`), (current) => {
    if (current?.gameId === gameId && !current.completed) return;
    return { gameId, requestId, requestedBy: uid, accepted: false, completed: false, ...(players ? { votes: { [uid]: true } } : {}) };
  }, { applyLocally: false });
  if (!result.committed) throw Error('There is already a change-game request. Respond to it or cancel it first.');
}
export async function respondToGameChange(db, base, request, uid, accept, players) {
  if (accept && request.requestedBy === uid) throw Error('The other player needs to agree.');
  const result = await runTransaction(ref(db, `${base}/gameChange`), (current) => {
    // Force a server comparison on a cold cache, then reject stale responses.
    if (!current) return null;
    if (current.requestId !== request.requestId || current.gameId !== request.gameId || current.accepted || current.completed) return;
    if (!accept) return null;
    if (!players) return { ...current, accepted: true };
    const votes = { ...current.votes, [uid]: true };
    return { ...current, votes, accepted: players.every((p) => votes[p]) };
  }, { applyLocally: false });
  if (!result.committed || (accept && (players ? !result.snapshot.val()?.votes?.[uid] : result.snapshot.val()?.accepted !== true))) throw Error('That request has changed. Please use the latest request.');
}
export const completeGameChange = (db, base, request) => update(ref(db), {
  [`${base}/state`]: null,
  [`${base}/ready`]: null,
  [`roundAudio/${base.split('/')[1]}`]: null,
  [`submissions/${base.split('/')[1]}`]: null,
  // Retain the request ID in this atomic write so the server can reject an
  // outdated completion instead of accidentally ending a newer game.
  [`${base}/gameChange`]: { ...request, completed: true },
});
