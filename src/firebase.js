import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  runTransaction,
  onValue,
  onDisconnect,
  push,
  remove,
  goOnline,
  goOffline,
} from "firebase/database";
import { firebaseConfig } from "./config.js";
import { DEFAULT_SETTINGS } from "./content.js";
import {
  roomPath,
  isPermissionDenied,
  joinRoom as joinRoomInDatabase,
} from "./rooms.js";
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export {
  ref,
  get,
  set,
  update,
  runTransaction,
  onValue,
  onDisconnect,
  push,
  remove,
};
export const connect = () => goOnline(db);
export const disconnect = () => goOffline(db);
export async function identity() {
  await setPersistence(auth, browserLocalPersistence);
  await auth.authStateReady();
  return auth.currentUser;
}
export async function login() {
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}
export async function guestLogin() {
  await auth.authStateReady();
  return auth.currentUser || (await signInAnonymously(auth)).user;
}
export async function logout() {
  disconnect();
  await signOut(auth);
}
export const emailKey = (email) => email.toLowerCase().replaceAll(".", "%2E");
export async function priorityAccess(user) {
  if (user.isAnonymous || !user.email) return false;
  return (
    (await get(ref(db, `priority/${emailKey(user.email)}`))).val() === true
  );
}
export { slotOf, roomPath } from "./rooms.js";
export function roomCode(slot) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return (
    String(slot) +
    Array.from(
      crypto.getRandomValues(new Uint8Array(7)),
      (x) => chars[x % chars.length],
    ).join("")
  );
}
export async function createRoom(uid, name, reserved = false, game = "wheel") {
  for (const slot of reserved ? [0] : [1, 2, 3, 4]) {
    const code = roomCode(slot);
    const now = Date.now();
    try {
      await set(ref(db, `${roomPath(code)}/meta`), {
        host: uid,
        code,
        open: true,
        createdAt: now,
        leaseEnd: now + 86400000,
      });
    } catch (error) {
      if (isPermissionDenied(error)) continue;
      throw error;
    }
    const base = roomPath(code);
    await update(ref(db), {
      [`${base}/settings`]: { ...DEFAULT_SETTINGS, game },
      [`${base}/players`]: { [uid]: { name } },
      [`${base}/ready`]: { [uid]: 1 },
      [`${base}/state`]: null,
      [`${base}/gameChange`]: null,
      [`${base}/presence`]: null,
      [`secrets/${slot}`]: null,
    });
    return code;
  }
  throw Error(
    reserved
      ? "Your reserved room is already open. Rejoin it below, or ask its host for the room code."
      : "All four public rooms are occupied. Please try again later.",
  );
}
export const joinRoom = (code, uid, name) =>
  joinRoomInDatabase(db, code, uid, name);
export function presence(code, uid, onConnection) {
  let connection;
  const unsubscribe = onValue(ref(db, ".info/connected"), async (snap) => {
    onConnection(snap.val() === true);
    if (!snap.val()) return;
    try {
      for (const index of [0, 1, 2]) {
        const candidate = ref(db, `${roomPath(code)}/presence/${uid}/${index}`);
        const claimed = await runTransaction(
          candidate,
          (value) => (value ? undefined : true),
          { applyLocally: false },
        );
        if (claimed.committed) {
          connection = candidate;
          await onDisconnect(connection).remove();
          return;
        }
      }
      onConnection(false);
    } catch {
      onConnection(false);
    }
  });
  return () => {
    unsubscribe();
    if (connection) remove(connection).catch(() => {});
  };
}
export function serverClock(callback) {
  return onValue(ref(db, ".info/serverTimeOffset"), (s) =>
    callback(s.val() || 0),
  );
}
export function friendlyError(error) {
  const code = error?.code || "";
  if (code.includes("network"))
    return "Connection interrupted. Check your internet and try again.";
  if (isPermissionDenied(error))
    return "This room is unavailable or has ended. Return home and try joining again.";
  if (code.includes("too-many"))
    return "Too many requests. Give it a moment, then try again.";
  return error?.message || "Something went wrong. Please try again.";
}
