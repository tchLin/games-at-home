import { ref, get, set, update } from "firebase/database";

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
  try {
    meta = (await get(ref(db, `${base}/meta`))).val();
  } catch (error) {
    if (!isPermissionDenied(error)) throw error;
    try {
      await update(ref(db, `${base}/meta`), { guest: uid, joinCode: code });
    } catch (error) {
      if (!isPermissionDenied(error)) throw error;
      throw Error(
        "That room is full, closed, or the code is incorrect. To rejoin, use your original guest browser or Google account.",
      );
    }
    meta = (await get(ref(db, `${base}/meta`))).val();
  }
  if (!meta || meta.code !== code)
    throw Error("That room wasn’t found. Check the eight-character code.");
  if (!meta.open || meta.leaseEnd < Date.now())
    throw Error(
      "The host has ended this room. Create a new one to play again.",
    );
  if (meta.host !== uid) {
    if (meta.guest && meta.guest !== uid)
      throw Error(
        "This room already has two players. To rejoin as a guest, use the same browser; otherwise use the same Google account.",
      );
    await update(ref(db, `${base}/meta`), { guest: uid, joinCode: code });
  }
  await set(ref(db, `${base}/players/${uid}`), { name });
}
