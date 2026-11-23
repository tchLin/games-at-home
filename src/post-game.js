import { encore, gameEnded } from './engine.js';

// The decision and transition are one atomic write. Rules bind the decision to
// the completed match, so a delayed button click cannot discard a newer match.
export function postGameUpdate(base, state, choice, nextId) {
  if (!gameEnded(state) || !['again', 'lobby'].includes(choice)) throw Error('This game has not ended yet.');
  const decision = { gameId: state.id, choice };
  if (choice === 'again') decision.nextId = nextId;
  return {
    [`${base}/postGame`]: decision,
    [`${base}/state`]: choice === 'again' ? encore(state, nextId) : null,
    [`${base}/ready`]: null,
    [`${base}/gameChange`]: null,
    [`roundAudio/${base.split('/')[1]}`]: null,
  };
}
