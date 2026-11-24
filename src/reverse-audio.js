import { RECORD_SECONDS, SAMPLE_RATE, MAX_AUDIO_BASE64 } from './audio-limits.js';
export { RECORD_SECONDS, SAMPLE_RATE, MAX_AUDIO_BASE64, MAX_LISTENS } from './audio-limits.js';

// Band-limited resampling, with cached fractional-phase kernels. A short clip
// needs only a few million multiply-adds, without a model or another download.
export function resampleMono(channels, sourceRate) {
  if (!channels.length || !channels[0].length || !Number.isFinite(sourceRate) || sourceRate <= 0)
    throw Error('No audio was captured. Record another take.');
  const sourceLength = Math.min(channels[0].length, Math.floor(RECORD_SECONDS * sourceRate));
  const mono = new Float32Array(sourceLength);
  for (const channel of channels) for (let i = 0; i < sourceLength; i++) mono[i] += (channel[i] || 0) / channels.length;
  const length = Math.floor(sourceLength * SAMPLE_RATE / sourceRate);
  if (!length) throw Error('The recording was too short.');
  if (sourceRate === SAMPLE_RATE) return mono;
  const output = new Float32Array(length);
  const radius = 24, phases = 128, cutoff = Math.min(1, SAMPLE_RATE / sourceRate) * .94;
  const kernels = new Map();
  for (let i = 0; i < length; i++) {
    const at = i * sourceRate / SAMPLE_RATE, center = Math.floor(at);
    const phase = Math.round((at - center) * phases);
    let weights = kernels.get(phase);
    if (!weights) {
      weights = new Float64Array(radius * 2);
      let total = 0;
      for (let j = 0; j < weights.length; j++) {
        const distance = j - radius + 1 - phase / phases;
        const x = Math.PI * distance * cutoff;
        const weight = (Math.abs(x) < 1e-9 ? cutoff : Math.sin(x) / (Math.PI * distance)) *
          (.5 + .5 * Math.cos(Math.PI * distance / radius));
        weights[j] = weight; total += weight;
      }
      for (let j = 0; j < weights.length; j++) weights[j] /= total;
      kernels.set(phase, weights);
    }
    let sample = 0;
    for (let j = 0; j < weights.length; j++) sample += mono[Math.max(0, Math.min(sourceLength - 1, center + j - radius + 1))] * weights[j];
    output[i] = sample;
  }
  return output;
}
export function reverseWav(channels, sampleRate, { polish = false } = {}) {
  const samples = resampleMono(channels, sampleRate);
  let peak = 0;
  if (polish) for (const value of samples) peak = Math.max(peak, Math.abs(value));
  // Modest gain only: never turn near-silence into loud room noise.
  const gain = polish && peak > .015 ? Math.min(2, .92 / peak) : 1;
  const fade = polish ? Math.min(Math.round(SAMPLE_RATE * .002), Math.floor(samples.length / 2)) : 0;
  const bytes = new Uint8Array(44 + samples.length * 2), view = new DataView(bytes.buffer);
  const text = (at, value) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const edge = fade ? Math.min(1, i / fade, (samples.length - 1 - i) / fade) : 1;
    const value = Math.max(-1, Math.min(1, samples[i] * gain * edge));
    view.setInt16(44 + (samples.length - 1 - i) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
export function reversedBuffer(context, source) {
  const reversed = context.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
  for (let channel = 0; channel < source.numberOfChannels; channel++)
    reversed.getChannelData(channel).set(source.getChannelData(channel).slice().reverse());
  return reversed;
}
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function fromBase64(value) {
  if (typeof value !== 'string' || value.length > MAX_AUDIO_BASE64) throw Error('Invalid recording.');
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0)).buffer;
}
export function audioContext() {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw Error('Audio is unavailable in this browser. Try an updated Safari or Chrome.');
  return new Audio();
}
// Web Audio defaults to an ambient session on iOS, which the Silent switch
// can mute. Game speech is media playback. Feature detection keeps this optional.
export function audioSession(type) {
  const session = globalThis.navigator?.audioSession;
  if (!session) return () => {};
  try {
    const previous = session.type;
    session.type = type;
    return () => { try { session.type = previous; } catch {} };
  } catch { return () => {}; }
}
const PLAYBACK_BLOCKED = 'Audio couldn’t start. Check media volume and headphones; if you’re on a call, pause it and tap Play again.';
export function requireRunning(context) {
  if (context.state !== 'running') throw Error(PLAYBACK_BLOCKED);
}
export async function resumeAudio(context, timeoutMs = 4000) {
  // Invoke resume synchronously from the tap, before any download/database await.
  // Safari can leave this promise pending during a call or after backgrounding.
  let timer;
  try {
    await Promise.race([
      context.resume(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error(PLAYBACK_BLOCKED)), timeoutMs); }),
    ]);
    requireRunning(context);
  } catch { throw Error(PLAYBACK_BLOCKED); }
  finally { clearTimeout(timer); }
}
export async function decode(context, bytes, reverse = false) {
  const buffer = await context.decodeAudioData(bytes);
  if (reverse) for (let i = 0; i < buffer.numberOfChannels; i++) buffer.getChannelData(i).reverse();
  return buffer;
}
export function playBuffer(context, buffer, ended) {
  requireRunning(context);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => { source.disconnect(); ended?.(); };
  source.start();
  return () => { source.onended = null; try { source.stop(); } catch {} source.disconnect(); };
}

// A muted stream is reused only while this game remains open and visible.
// No MediaRecorder runs between takes. Game owns release on leave/background.
let sharedStream, pendingStream, streamEpoch = 0, activeCapture;
const micListeners = new Set();
const notifyMic = () => micListeners.forEach((listener) => listener());
export const subscribeMicrophone = (listener) => { micListeners.add(listener); return () => micListeners.delete(listener); };
export const microphoneReady = () => Boolean(sharedStream?.getTracks().some((track) => track.readyState === 'live'));
export function releaseMicrophone() {
  streamEpoch++;
  const capture = activeCapture; activeCapture = null;
  capture?.cancel();
  sharedStream?.getTracks().forEach((track) => track.stop()); sharedStream = null;
  pendingStream = null;
  notifyMic();
}
async function acquireMicrophone() {
  if (microphoneReady()) return sharedStream;
  if (!pendingStream) {
    const epoch = streamEpoch;
    const request = navigator.mediaDevices.getUserMedia({ audio: {
      channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 },
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    } }).then((stream) => {
      if (epoch !== streamEpoch) { stream.getTracks().forEach((t) => t.stop()); throw Error('Microphone request cancelled. Tap Record to try again.'); }
      stream.getTracks().forEach((track) => { track.enabled = false; track.addEventListener?.('ended', notifyMic); });
      sharedStream = stream; notifyMic(); return stream;
    }).finally(() => { if (pendingStream === request) pendingStream = null; });
    pendingStream = request;
  }
  return pendingStream;
}
export async function microphone() {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder)
    throw Error('Recording is unavailable here. Open this HTTPS site in an updated Safari or Chrome.');
  if (activeCapture) throw Error('Finish the current recording first.');
  const restoreSession = audioSession('auto');
  let stream;
  try {
    stream = await acquireMicrophone();
    if (activeCapture) throw Error('Finish the current recording first.');
    if (!microphoneReady()) throw Error('Microphone was released. Record another take.');
  }
  catch (error) { restoreSession(); throw error; }
  let recorder;
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 });
  } catch (error) { restoreSession(); throw error; }
  let timer, cancelled = false, settled = false;
  const mute = () => {
    if (settled) return;
    settled = true;
    stream.getTracks().forEach((track) => { track.enabled = false; });
    if (activeCapture === capture) activeCapture = null;
    restoreSession();
  };
  const stop = () => { if (recorder.state === 'recording') recorder.stop(); };
  const cancel = () => { cancelled = true; clearTimeout(timer); stop(); mute(); };
  const start = () => new Promise((resolve, reject) => {
    if (cancelled || settled || stream.getTracks().some((track) => track.readyState !== 'live')) {
      mute(); reject(Error('Microphone was released. Record another take.')); return;
    }
    const chunks = [];
    let size = 0;
    recorder.ondataavailable = (event) => {
      size += event.data.size;
      if (size > 2 * 1024 * 1024) { cancelled = true; stop(); return; }
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => { cancelled = true; clearTimeout(timer); mute(); reject(Error('Recording was interrupted. Record another take.')); try { stop(); } catch {} };
    recorder.onstop = () => {
      clearTimeout(timer); mute();
      if (cancelled) reject(Error('Recording was interrupted. Record another take.'));
      else resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
    try {
      stream.getTracks().forEach((track) => { track.enabled = true; });
      recorder.start(250);
      timer = setTimeout(stop, RECORD_SECONDS * 1000);
    } catch (error) { mute(); reject(error); }
  });
  const capture = { start, stop, cancel };
  activeCapture = capture;
  return capture;
}
