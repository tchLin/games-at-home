import { MAX_LISTENS } from './audio-limits.js';
import { normalize, wheelPoints } from './engine.js';
export const guessers = (s) => s.players.filter((p) => p !== s.giver);
export const submissionPath = (base, s, uid) => `submissions/${base.split('/')[1]}/${s.id}/${s.round}/${uid}`;
export const ownEntry = (s, records, uid) => records?.[uid]?.entries?.[s.progress?.[uid]?.count || 0];
export const exactAudio = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
export function nextSubmission(current, s, uid, value) {
  const progress = s.progress?.[uid];
  if (s.phase !== 'guess' || s.pausedAt || !progress || progress.done ||
      (s.game === 'clues' && progress.used >= s.config.guessesPerHint)) return;
  const index = progress.count;
  if (current?.entries?.[index]) return;
  return { ...current, entries: { ...current?.entries, [index]: { value, hint: s.game === 'clues' ? s.hintIndex : 0 } } };
}
export function nextListen(current) {
  const plays = current?.plays || 0;
  if (plays >= MAX_LISTENS) return;
  return { ...current, plays: plays + 1 };
}
function finish(s, secret, records) {
  if (!guessers(s).every((uid) => s.progress[uid].done)) return s;
  const results = {};
  for (const uid of guessers(s)) {
    const progress = s.progress[uid];
    const entries = Object.values(records?.[uid]?.entries || {});
    results[uid] = {
      points: progress.points, correct: progress.correct, timedOut: !entries.length,
      ...(s.game === 'wheel' ? { guess: entries[0]?.value ?? -1 } : {
        attempts: entries.map((entry) => ({ guess: entry.value, hint: entry.hint,
          correct: s.game === 'reverse' ? progress.correct : normalize(entry.value) === normalize(secret.word) })),
      }),
    };
  }
  return { ...s, phase: 'reveal', deadline: 0, results,
    result: { ...(s.game === 'wheel' ? { target: secret.target } : { word: secret.word }),
      points: Math.max(0, ...Object.values(results).map((r) => r.points)), correct: Object.values(results).some((r) => r.correct) } };
}
function award(next, uid, correct, points) {
  next.progress[uid] = { ...next.progress[uid], done: true, correct, points };
  next.scores[uid] += points;
}
export function settleParty(s, secret, records, now = Date.now()) {
  if (s.phase !== 'guess' || s.pausedAt || secret?.gameId !== s.id || secret.round !== s.round) return null;
  const next = structuredClone(s);
  const expired = Boolean(s.deadline && now >= s.deadline);
  let changed = false;
  if (s.game === 'wheel') {
    if (!expired && !guessers(s).every((uid) => records?.[uid]?.entries?.[0])) return null;
    for (const uid of guessers(s)) {
      const entry = records?.[uid]?.entries?.[0];
      const points = entry ? wheelPoints(secret.target, entry.value) : 0;
      award(next, uid, points > 0, points);
    }
    return finish(next, secret, records);
  }
  for (const uid of guessers(s)) {
    const p = next.progress[uid];
    if (p.done) continue;
    const entry = records?.[uid]?.entries?.[p.count];
    if (s.game === 'clues') {
      if (entry && entry.hint === s.hintIndex && p.used < s.config.guessesPerHint) {
        p.count++; p.used++; changed = true;
        if (normalize(entry.value) === normalize(secret.word)) award(next, uid, true, 4 - s.hintIndex);
      }
      if (!next.progress[uid].done && expired && p.used < s.config.guessesPerHint) { p.used = s.config.guessesPerHint; changed = true; }
      if (!next.progress[uid].done && p.used >= s.config.guessesPerHint && s.hintIndex === 3) { award(next, uid, false, 0); changed = true; }
    } else if (s.game === 'reverse') {
      if (entry && exactAudio(entry.value, secret.word)) { p.count++; award(next, uid, true, 1); changed = true; }
      else if (!entry && expired) { award(next, uid, false, 0); changed = true; }
    }
  }
  if (!changed) return null;
  const final = finish(next, secret, records);
  if (final.phase === 'reveal') return final;
  if (s.game === 'clues' && guessers(next).every((uid) => next.progress[uid].done || next.progress[uid].used >= s.config.guessesPerHint))
    return { ...next, phase: 'hint', deadline: 0 };
  return next;
}
export function judgePartyReverse(s, secret, records, uid, pass, skip = false) {
  if (s.game !== 'reverse' || secret?.gameId !== s.id || secret.round !== s.round ||
      (skip ? s.phase !== 'recording' : s.phase !== 'guess') || s.pausedAt) return null;
  if (!skip && !guessers(s).every((player) => Object.hasOwn(records || {}, player))) return null;
  const next = structuredClone(s);
  if (skip) for (const player of guessers(s)) award(next, player, false, 0);
  else {
    if (!s.progress[uid] || s.progress[uid].done || !records?.[uid]?.entries?.[0]) return null;
    next.progress[uid].count = 1;
    award(next, uid, pass, pass ? 1 : 0);
  }
  return finish(next, secret, records);
}
export function partyHint(s, hint, now = Date.now()) {
  if (s.phase !== 'hint' || s.hintIndex >= 3) return null;
  return { ...s, hints: [...(s.hints || []), hint], hintIndex: s.hintIndex + 1, phase: 'guess',
    progress: Object.fromEntries(Object.entries(s.progress).map(([uid, p]) => [uid, { ...p, used: 0 }])),
    deadline: s.config.timer ? now + s.config.timer * 1000 : 0 };
}
