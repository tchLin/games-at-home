// Tiny synthesized effects: no audio files, network requests, or timers running
// between interactions. A context is created only after a user gesture.
const patterns = {
  tap: [[480, 0, .045]],
  spin: [[700, 0, .04], [580, .055, .04], [460, .12, .05], [350, .20, .07]],
  start: [[523, 0, .10], [659, .10, .10], [784, .20, .16]],
  turn: [[659, 0, .09], [784, .11, .12]],
  success: [[523, 0, .10], [659, .10, .10], [1047, .20, .18]],
  reveal: [[440, 0, .12], [330, .13, .14]],
  finish: [[523, 0, .10], [659, .10, .10], [784, .20, .10], [1047, .32, .22]],
};
export function createSoundPlayer({
  createContext = () => {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Audio ? new Audio() : null;
  },
  storage = () => globalThis.localStorage,
} = {}) {
  let enabled = true;
  try { enabled = storage()?.getItem('gah-sound') !== 'off'; } catch {}
  let context, master, lastPlay = -Infinity, lastKind;
  const isEnabled = () => enabled;
  const setEnabled = (value) => {
    enabled = Boolean(value);
    try { storage()?.setItem('gah-sound', enabled ? 'on' : 'off'); } catch {}
    if (master) master.gain.value = enabled ? .2 : 0;
  };
  const unlock = async () => {
    if (!enabled) return;
    try {
      if (!context) {
        context = createContext();
        if (!context) return;
        master = context.createGain();
        master.gain.value = .2;
        master.connect(context.destination);
      }
      if (context.state !== 'running' && context.state !== 'closed') await context.resume();
    } catch { /* Audio support must never interrupt a game. */ }
  };
  const play = (kind = 'tap') => {
    if (!enabled || context?.state !== 'running' || !master || !patterns[kind]) return false;
    const now = context.currentTime;
    if (now - lastPlay < .07 && (kind === 'tap' || kind === lastKind)) return false;
    lastPlay = now;
    lastKind = kind;
    try {
      for (const [frequency, delay, duration] of patterns[kind]) {
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const start = now + delay;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(.12, start + .008);
        envelope.gain.exponentialRampToValueAtTime(.001, start + duration);
        oscillator.connect(envelope);
        envelope.connect(master);
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + duration + .015);
      }
      return true;
    } catch { return false; }
  };
  return { isEnabled, setEnabled, unlock, play };
}
export const sounds = createSoundPlayer();
export function soundInteraction(event) {
  const button = event.target.closest?.('button');
  if (event.type !== 'submit' && (!button || button.disabled || button.dataset.sound === 'off')) return;
  void sounds.unlock().then(() => sounds.play('tap'));
}
export function playGameSound(kind) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  sounds.play(kind);
}
