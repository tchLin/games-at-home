import { newGame } from './engine.js';

// One atomic write saves the host's latest choices, starts the match, and
// clears readiness so the next game needs a fresh guest confirmation.
export const lobbyStartUpdate = (base, settings, players, id) => ({
  [`${base}/settings`]: settings,
  [`${base}/state`]: newGame(settings, players, id),
  [`${base}/ready`]: null,
  [`${base}/gameChange`]: null,
});
