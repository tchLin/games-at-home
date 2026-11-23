// Audio stays on the device until a single, bounded WAV is shared with the room.
export const RECORD_SECONDS = 8;
export const SAMPLE_RATE = 12000;
export const MAX_AUDIO_BASE64 = 256060; // 44-byte header + 8s of mono PCM16

export function reverseWav(channels, sampleRate) {
  if (!channels.length || !channels[0].length || !Number.isFinite(sampleRate) || sampleRate <= 0)
    throw Error('No audio was captured. Skip this round and try again next round.');
  const length = Math.min(Math.floor(channels[0].length * SAMPLE_RATE / sampleRate), RECORD_SECONDS * SAMPLE_RATE);
  if (!length) throw Error('The recording was too short.');
  const bytes = new Uint8Array(44 + length * 2), view = new DataView(bytes.buffer);
  const text = (at, value) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, length * 2, true);
  // Average each source interval while downsampling, then reverse sample order.
  for (let i = 0; i < length; i++) {
    const from = Math.floor(i * sampleRate / SAMPLE_RATE);
    const to = Math.min(channels[0].length, Math.max(from + 1, Math.floor((i + 1) * sampleRate / SAMPLE_RATE)));
    let value = 0;
    for (const channel of channels) for (let j = from; j < to; j++) value += channel[j];
    value = Math.max(-1, Math.min(1, value / ((to - from) * channels.length)));
    view.setInt16(44 + (length - 1 - i) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
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
export async function decode(context, bytes, reverse = false) {
  const buffer = await context.decodeAudioData(bytes);
  if (reverse) for (let i = 0; i < buffer.numberOfChannels; i++) buffer.getChannelData(i).reverse();
  return buffer;
}
export function playBuffer(context, buffer, ended) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => { source.disconnect(); ended?.(); };
  source.start();
  return () => { source.onended = null; try { source.stop(); } catch {} source.disconnect(); };
}

// Permission is requested before consuming the take. Call start only after the
// room transaction claims it. The caller owns cleanup even if that claim fails.
export async function microphone() {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder)
    throw Error('Recording is unavailable here. Open this HTTPS site in an updated Safari or Chrome.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  let recorder;
  try {
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch (error) { stream.getTracks().forEach((track) => track.stop()); throw error; }
  let timer, cancelled = false;
  const tracksOff = () => stream.getTracks().forEach((track) => track.stop());
  const stop = () => { if (recorder.state === 'recording') recorder.stop(); };
  const cancel = () => { cancelled = true; clearTimeout(timer); stop(); tracksOff(); };
  const start = () => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    recorder.ondataavailable = (event) => {
      size += event.data.size;
      if (size > 2 * 1024 * 1024) { cancelled = true; stop(); return; }
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => { clearTimeout(timer); tracksOff(); reject(Error('Recording was interrupted. Skip this round.')); };
    recorder.onstop = () => {
      clearTimeout(timer); tracksOff();
      if (cancelled) reject(Error('Recording was interrupted. Skip this round.'));
      else resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorder.start(250);
    timer = setTimeout(stop, RECORD_SECONDS * 1000);
  });
  return { start, stop, cancel };
}
