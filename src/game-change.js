import { ref, runTransaction, update } from 'firebase/database';

export async function requestGameChange(db, base, gameId, uid) {
  const requestId = crypto.randomUUID();
  const result = await runTransaction(ref(db, `${base}/gameChange`), (current) => {
    if (current?.gameId === gameId && !current.completed) return;
    return { gameId, requestId, requestedBy: uid, accepted: false, completed: false };
  }, { applyLocally: false });
  if (!result.committed) throw Error('There is already a change-game request. Respond to it or cancel it first.');
}
export async function respondToGameChange(db, base, request, uid, accept) {
  if (accept && request.requestedBy === uid) throw Error('The other player needs to agree.');
  const result = await runTransaction(ref(db, `${base}/gameChange`), (current) => {
    // Force a server comparison on a cold cache, then reject stale responses.
    if (!current) return null;
    if (current.requestId !== request.requestId || current.gameId !== request.gameId || current.accepted || current.completed) return;
    return accept ? { ...current, accepted: true } : null;
  }, { applyLocally: false });
  if (!result.committed || (accept && result.snapshot.val()?.accepted !== true)) throw Error('That request has changed. Please use the latest request.');
}
export const completeGameChange = (db, base, request) => update(ref(db), {
  [`${base}/state`]: null,
  [`${base}/ready`]: null,
  // Retain the request ID in this atomic write so the server can reject an
  // outdated completion instead of accidentally ending a newer game.
  [`${base}/gameChange`]: { ...request, completed: true },
});
