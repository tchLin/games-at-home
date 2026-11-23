import { REVERSE_WORDS } from './reverse-words.js';

export function reverseWordAssignment(current, state, word) {
  if (state.game !== 'reverse' || state.phase !== 'prepare') return;
  if (current?.gameId === state.id && current.round === state.round && current.word) return;
  return { gameId: state.id, round: state.round, word };
}

export function chooseReverseWord(syllables, random = Math.random()) {
  const pool = REVERSE_WORDS[syllables] || REVERSE_WORDS[1];
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))];
}

export function isExactReverseGuess(state, secret) {
  return state.game === 'reverse' && state.phase === 'pending' && state.pending?.kind === 'guess' &&
    secret?.gameId === state.id && secret.round === state.round && Boolean(secret.word) &&
    String(state.pending.value).trim().toLowerCase() === secret.word.trim().toLowerCase();
}
