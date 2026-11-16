import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getDatabase, ref, get, set, update, runTransaction, onValue, onDisconnect, push, remove, goOnline, goOffline } from 'firebase/database';
import { firebaseConfig } from './config.js';
import { DEFAULT_SETTINGS } from './content.js';
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export { ref, get, set, update, runTransaction, onValue, onDisconnect, push, remove };
export const connect = () => goOnline(db);
export const disconnect = () => goOffline(db);
export async function identity() {
  await setPersistence(auth, browserLocalPersistence);
  await auth.authStateReady();
  return auth.currentUser;
}
export async function login() {return (await signInWithPopup(auth, new GoogleAuthProvider())).user;}
export async function logout() {disconnect();await signOut(auth);}
export const emailKey = email => email.toLowerCase().replaceAll('.', '%2E');
export async function priorityAccess(user) {
  return (await get(ref(db, `priority/${emailKey(user.email)}`))).val() === true;
}
export const slotOf = code => String(code)[0];
export const roomPath = code => `rooms/${slotOf(code)}`;
export function roomCode(slot) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return String(slot) + Array.from(crypto.getRandomValues(new Uint8Array(7)), x => chars[x % chars.length]).join('');
}
export async function createRoom(uid, name, reserved = false, game = 'wheel') {
  for (const slot of reserved ? [0] : [1, 2, 3, 4]) {
    const code = roomCode(slot);
    const now = Date.now();
    try {await set(ref(db, `${roomPath(code)}/meta`), {host: uid, code, open: true, createdAt: now, leaseEnd: now + 86400000});}
    catch(error) {if(String(error.code).toLowerCase().includes('permission'))continue;throw error;}
    const base = roomPath(code);
    await update(ref(db), {[`${base}/settings`]: {...DEFAULT_SETTINGS, game}, [`${base}/players`]: {[uid]: {name}}, [`${base}/ready`]: {[uid]: 1}, [`${base}/state`]: null, [`${base}/presence`]: null, [`secrets/${slot}`]: null});
    return code;
  }
  throw Error(reserved ? 'Your reserved room is already open. Rejoin it below, or ask its host for the room code.' : 'All four public rooms are occupied. Please try again later.');
}
export async function joinRoom(code, uid, name) {
  if (!/^[0-4][A-Z2-9]{7}$/.test(code)) throw Error('Enter the eight-character room code, starting with 0–4.');
  const base = roomPath(code);
  let meta;
  try {meta = (await get(ref(db, `${base}/meta`))).val();} catch(error) {
    if(!String(error.code).toLowerCase().includes('permission'))throw error;
    try {await update(ref(db, `${base}/meta`), {guest:uid,joinCode:code});}
    catch {throw Error('That room is full, closed, or the code is incorrect. Check the code and your Google account.');}
    meta = (await get(ref(db, `${base}/meta`))).val();
  }
  if (!meta || meta.code !== code) throw Error('That room wasn’t found. Check the eight-character code.');
  if (!meta.open || meta.leaseEnd < Date.now()) throw Error('The host has ended this room. Create a new one to play again.');
  if (meta.host !== uid) {
    if (meta.guest && meta.guest !== uid) throw Error('This room already has two players. To rejoin, sign in with the same Google account.');
    await update(ref(db, `${base}/meta`), {guest:uid,joinCode:code});
  }
  await set(ref(db, `${base}/players/${uid}`), {name});
}
export function presence(code, uid, onConnection) {
  let connection;
  const unsubscribe = onValue(ref(db, '.info/connected'), async snap => {
    onConnection(snap.val() === true);
    if (!snap.val()) return;
    try {
      for (const index of [0,1,2]) {
        const candidate = ref(db, `${roomPath(code)}/presence/${uid}/${index}`);
        const claimed = await runTransaction(candidate, value => value ? undefined : true, {applyLocally:false});
        if(claimed.committed) {connection=candidate;await onDisconnect(connection).remove();return;}
      }
      onConnection(false);
    } catch {onConnection(false);}
  });
  return () => {unsubscribe(); if (connection) remove(connection).catch(() => {});};
}
export function serverClock(callback) {return onValue(ref(db, '.info/serverTimeOffset'), s => callback(s.val() || 0));}
export function friendlyError(error) {
  const code = error?.code || '';
  if (code.includes('network')) return 'Connection interrupted. Check your internet and try again.';
  if (code.includes('permission') || code.includes('PERMISSION')) return 'This room is unavailable or has ended. Return home and try joining again.';
  if (code.includes('too-many')) return 'Too many requests. Give it a moment, then try again.';
  return error?.message || 'Something went wrong. Please try again.';
}
