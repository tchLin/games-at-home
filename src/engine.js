import { TOPICS } from './content.js';
export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const other = (s, uid) => s.players.find(p => p !== uid);
export const deadline = (s, now) => s.config.timer ? now + s.config.timer * 1000 : 0;
export const maskWord = (word, count = 1) => [...word].map((c, i) => i < count ? c : '·').join('');
export function newRound(s, now = Date.now()) {
  const giver = s.players[(s.round - 1) % 2];
  const common = {id: s.id, game: s.game, round: s.round, config: s.config, players: s.players, scores: s.scores, giver, phase: 'prepare', deadline: 0, revision: (s.revision || 0) + 1};
  if (s.game === 'wheel') {
    const labels = s.config.topic === 'custom' ? [s.config.left, s.config.right] : TOPICS[(s.round + s.topicSeed) % TOPICS.length];
    return {...common, topicSeed: s.topicSeed, left: labels[0], right: labels[1]};
  }
  if (s.game === 'chain') return {...common, phase: 'setup', turn: s.players[0], boards: {}};
  return {...common, hints: [], attempts: [], hintIndex: 0, used: 0};
}
export function newGame(config, players, id, now = Date.now()) {
  return newRound({id, game: config.game, config: {...config}, players, scores: Object.fromEntries(players.map(p => [p, 0])), round: 1, topicSeed: Math.floor(Math.random() * TOPICS.length)}, now);
}
export function nextRound(s, now = Date.now()) {
  if (s.round >= s.config.rounds || s.game === 'chain') return {...s, phase: 'finished', deadline: 0};
  return newRound({...s, round: s.round + 1}, now);
}
export function wheelPoints(target, guess) {
  const gap = Math.abs(target - guess);
  return gap <= 4 ? 4 : gap <= 10 ? 3 : gap <= 18 ? 2 : gap <= 26 ? 1 : 0;
}
export function resolve(s, secret, now = Date.now()) {
  if (s.phase !== 'pending' || !s.pending || !secret) return null;
  const p = s.pending;
  const next = structuredClone(s);
  delete next.pending;
  next.deadline = 0;
  if (s.game === 'wheel') {
    const points = p.kind === 'timeout' ? 0 : wheelPoints(secret.target, p.value);
    next.result = {target: secret.target, guess: p.kind === 'timeout' ? -1 : p.value, points, timedOut: p.kind === 'timeout'};
    next.scores[s.giver] += points;
    next.scores[other(s, s.giver)] += points;
    next.phase = 'reveal';
  } else if (s.game === 'chain') {
    const owner = other(s, p.actor);
    const board = next.boards[owner];
    const word = secret.words[p.index];
    if (!word || board.solved?.[p.index]) return null;
    board.solved ||= {};
    board.letters ||= {};
    if (p.kind === 'guess' && normalize(p.value) === normalize(word)) {
      board.solved[p.index] = true;
      board.masks[p.index] = word;
      next.scores[p.actor] += 1;
      next.feedback = {actor: p.actor, text: `“${word}” — you got it! Keep going.`, kind: 'correct'};
    } else {
      if (p.kind === 'hint') {
        board.letters[p.index] = Math.min((board.letters[p.index] || 1) + 1, word.length);
        board.masks[p.index] = maskWord(word, board.letters[p.index]);
      }
      next.feedback = {actor: p.actor, text: p.kind === 'hint' ? 'One more letter revealed. Time to swap turns.' : p.kind === 'timeout' ? 'Time’s up. The turn passes over.' : `“${p.value}” wasn’t it. The turn passes over.`, kind: 'neutral'};
      next.turn = owner;
    }
    const complete = Object.keys(board.solved).length === secret.words.length;
    next.phase = complete ? 'finished' : 'guess';
    if (complete) next.winner = p.actor;
    else next.deadline = deadline(s, now);
  } else {
    const correct = p.kind !== 'timeout' && normalize(p.value) === normalize(secret.word);
    const attempts = [...(s.attempts || []), {guess: p.kind === 'timeout' ? 'Time’s up' : p.value, correct, hint: s.hintIndex}];
    const used = p.kind === 'timeout' ? s.config.guessesPerHint : s.used + 1;
    next.attempts = attempts;
    next.used = used;
    if (correct || (used >= s.config.guessesPerHint && s.hintIndex >= 3)) {
      const points = correct ? 4 - s.hintIndex : 0;
      next.result = {word: secret.word, points, correct};
      next.scores[p.actor] += points;
      next.phase = 'reveal';
    } else if (used >= s.config.guessesPerHint) {
      next.phase = 'hint';
    } else {next.phase = 'guess'; next.deadline = deadline(s, now);}
  }
  return next;
}
