import { useEffect, useState, useCallback, useRef } from "react";
import {
  db,
  ref,
  onValue,
  set,
  update,
  remove,
  runTransaction,
  presence,
  serverClock,
  roomPath,
  slotOf,
} from "./firebase.js";
import { resolve, other, deadline, revealChain } from "./engine.js";
export function useRoom(code, uid, onError) {
  const [room, setRoom] = useState({});
  const [secret, setSecret] = useState(null);
  const [connected, setConnected] = useState(false);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(Date.now());
  const working = useRef(false);
  const base = roomPath(code);
  const secretPath = `secrets/${slotOf(code)}/${uid}`;
  useEffect(() => {
    const subscriptions = [
      "meta",
      "settings",
      "state",
      "players",
      "ready",
      "presence",
    ].map((key) =>
      onValue(
        ref(db, `${base}/${key}`),
        (snapshot) => setRoom((r) => ({ ...r, [key]: snapshot.val() })),
        onError,
      ),
    );
    subscriptions.push(
      onValue(
        ref(db, secretPath),
        (snapshot) => setSecret(snapshot.val()),
        onError,
      ),
    );
    subscriptions.push(
      presence(code, uid, setConnected),
      serverClock(setOffset),
    );
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => {
      subscriptions.forEach((f) => f());
      clearInterval(timer);
    };
  }, [code, uid]);
  const now = tick + offset;
  const isHost = room.meta?.host === uid;
  const valid = room.meta?.code === code && room.meta?.open;
  const bothOnline = Boolean(
    room.meta?.guest &&
    room.presence?.[room.meta.host] &&
    room.presence?.[room.meta.guest],
  );
  const mutate = useCallback(
    async (fn, expected) => {
      const result = await runTransaction(
        ref(db, `${base}/state`),
        (current) => {
          // A cold transaction receives null before the server value. Returning
          // null forces a server comparison/retry instead of silently aborting.
          if (!current) return null;
          if (
            expected &&
            (current.id !== expected.id ||
              current.revision !== expected.revision)
          )
            return;
          const next = fn(structuredClone(current));
          if (!next) return;
          return { ...next, revision: (current.revision || 0) + 1 };
        },
        { applyLocally: false },
      );
      return result.committed;
    },
    [base],
  );
  // A one-day lease frees abandoned public seats; an active host refreshes it.
  useEffect(() => {
    if (!isHost || !valid || !connected) return;
    const renew = () =>
      set(
        ref(db, `${base}/meta/leaseEnd`),
        Date.now() + offset + 86400000,
      ).catch(onError);
    renew();
    const interval = setInterval(renew, 60000);
    return () => clearInterval(interval);
  }, [isHost, valid, connected, base, offset]);
  useEffect(() => {
    const s = room.state;
    if (!s || !valid || !connected || working.current) return;
    const mySecret =
      secret?.gameId === s.id && secret.round === s.round ? secret : null;
    const run = async () => {
      if (s.game === "chain" && s.phase === "finished" && mySecret?.words && !s.boards?.[uid]?.answers) {
        await mutate((v) => revealChain(v, mySecret, uid), s);
        return;
      }
      if (
        !bothOnline &&
        !s.pausedAt &&
        !["finished", "reveal"].includes(s.phase)
      ) {
        await mutate((v) => ({ ...v, pausedAt: now }), s);
        return;
      }
      if (isHost && bothOnline && s.pausedAt) {
        await mutate((v) => {
          if (v.deadline) v.deadline += now - v.pausedAt;
          delete v.pausedAt;
          return v;
        }, s);
        return;
      }
      if (!bothOnline || s.pausedAt) return;
      if (
        s.game === "chain" &&
        s.phase === "setup" &&
        isHost &&
        s.players.every((p) => s.boards?.[p]?.masks)
      ) {
        await mutate(
          (v) => ({ ...v, phase: "guess", deadline: deadline(v, now) }),
          s,
        );
        return;
      }
      const judge = s.game === "chain" ? other(s, s.pending?.actor) : s.giver;
      if (s.phase === "pending" && judge === uid && mySecret) {
        await mutate((v) => resolve(v, mySecret, now), s);
        return;
      }
      if (s.phase === "guess" && isHost && s.deadline && now >= s.deadline) {
        const actor = s.game === "chain" ? s.turn : other(s, s.giver);
        const index =
          s.game === "chain"
            ? s.boards[other(s, actor)].masks.findIndex(
                (_, i) => !s.boards[other(s, actor)].solved?.[i],
              )
            : 0;
        await mutate(
          (v) => ({
            ...v,
            phase: "pending",
            deadline: 0,
            pending: { actor, kind: "timeout", index },
          }),
          s,
        );
      }
    };
    working.current = true;
    run()
      .catch(onError)
      .finally(() => {
        working.current = false;
      });
  }, [
    room.state,
    secret,
    valid,
    connected,
    bothOnline,
    now,
    isHost,
    uid,
    mutate,
  ]);
  return {
    room,
    secret,
    now,
    isHost,
    valid,
    bothOnline,
    connected,
    mutate,
    base,
    secretPath,
  };
}
