import { ref, get, set, update } from "firebase/database";
import { SEATS, members } from "./players.js";

export const slotOf = (code) => String(code)[0];
export const roomPath = (code) => `rooms/${slotOf(code)}`;

// RTDB get() wraps server failures in a plain Error, without a code. Writes
// and listeners use coded errors instead; recognize both SDK representations.
export const isPermissionDenied = (error) =>
  /^(?:database\/)?permission[-_ ]denied$/i.test(error?.code || "") ||
  /^permission denied$/i.test(error?.message || "");

export async function joinRoom(db, code, uid, name) {
  if (!/^[0-4][A-Z2-9]{7}$/.test(code))
    throw Error("Enter the eight-character room code, starting with 0–4.");
  const base = roomPath(code);
  let meta;
  try { meta = (await get(ref(db, `${base}/meta`))).val(); }
  catch (error) { if (!isPermissionDenied(error)) throw error; }
  if (!members(meta).includes(uid)) {
    let joined = false;
    for (const seat of SEATS.slice(1, code[0] === '0' ? 2 : 5)) {
      try {
        await update(ref(db, `${base}/meta`), { [seat]: uid, joinCode: code });
        joined = true; break;
      } catch (error) { if (!isPermissionDenied(error)) throw error; }
    }
    if (!joined) throw Error('That room is full, playing a game, closed, or the code is incorrect. New players can join in the lobby. To rejoin, use your original browser or Google account.');
    meta = (await get(ref(db, `${base}/meta`))).val();
  }
  if (!meta || meta.code !== code) throw Error('That room wasn’t found. Check the eight-character code.');
  if (!meta.open || meta.leaseEnd < Date.now()) throw Error('The host has ended this room. Create a new one to play again.');
  await set(ref(db, `${base}/players/${uid}`), { name });
}
