import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reverseWav, toBase64, fromBase64, SAMPLE_RATE, MAX_AUDIO_BASE64 } from '../src/reverse-audio.js';
import { newGame, nextRound, resolve, judgeReverse } from '../src/engine.js';
import { DEFAULT_SETTINGS } from '../src/content.js';
import { REVERSE_WORDS } from '../src/reverse-words.js';
import { chooseReverseWord, reverseWordAssignment } from '../src/reverse-game.js';

test('exact answers pass automatically while spelling variants stay for manual review', () => {
  const s = { ...newGame({ ...DEFAULT_SETTINGS, game: 'reverse' }, ['a','b'], 'exact'), phase: 'pending',
    pending: { actor: 'b', kind: 'guess', value: '  BaNaNa  ' } };
  const secret = { gameId: s.id, round: s.round, word: 'banana' };
  assert.equal(resolve(s, secret).result.correct, true);
  assert.equal(resolve(s, secret).scores.b, 1);
  assert.equal(resolve(s, { ...secret, round: 2 }), null);
  for (const value of ['bananna', 'b a n a n a', 'banana!', 'apple'])
    assert.equal(resolve({ ...s, pending: { ...s.pending, value } }, secret), null);
});

test('automatic word assignment preserves a reconnecting player’s word and renews each round', () => {
  const s = newGame({ ...DEFAULT_SETTINGS, game: 'reverse' }, ['a','b'], 'assign');
  const assigned = reverseWordAssignment(null, s, chooseReverseWord(3, 0));
  assert.ok(REVERSE_WORDS[3].includes(assigned.word));
  assert.equal(reverseWordAssignment(assigned, s, 'different'), undefined);
  assert.equal(reverseWordAssignment(assigned, { ...s, round: 2 }, 'coffee').word, 'coffee');
  assert.equal(reverseWordAssignment(null, { ...s, phase: 'recording' }, 'coffee'), undefined);
});

test('reversed audio is mono PCM WAV with reversed samples and correct header', () => {
  const bytes = reverseWav([new Float32Array([-.75, 0, .5, 1])], SAMPLE_RATE);
  const v = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'RIFF');
  assert.equal(v.getUint32(24, true), SAMPLE_RATE);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(40, true), 8);
  assert.deepEqual([0,1,2,3].map((i) => v.getInt16(44 + i * 2, true)), [32767,16384,0,-24576]);
  assert.deepEqual(new Uint8Array(fromBase64(toBase64(bytes))), bytes);
});
test('stereo is mixed, downsampled, and capped to eight seconds within database bound', () => {
  const full = reverseWav([new Float32Array(48000 * 12).fill(.5), new Float32Array(48000 * 12).fill(-.5)], 48000);
  assert.equal(full.length, 44 + 8 * SAMPLE_RATE * 2);
  assert.equal(toBase64(full).length, MAX_AUDIO_BASE64);
  assert.ok(full.slice(44).every((b) => b === 0));
  assert.throws(() => reverseWav([], 48000), /No audio/);
  assert.throws(() => fromBase64('a'.repeat(MAX_AUDIO_BASE64 + 1)), /Invalid/);
});
test('reverse has one manual verdict, preserves the typed guess, and swaps roles', () => {
  const s = { ...newGame({ ...DEFAULT_SETTINGS, game: 'reverse' }, ['a','b'], 'audio'), phase: 'pending', recorded: true, plays: 3,
    pending: { actor: 'b', kind: 'guess', value: 'bananna', index: 0 } };
  const secret = { gameId: 'audio', round: 1, word: 'banana' };
  assert.equal(resolve(s, secret), null, 'spelling never automatically fails the guess');
  const pass = judgeReverse(s, secret, true);
  assert.equal(pass.scores.b, 1);
  assert.equal(pass.pending.value, 'bananna');
  assert.equal(pass.result.word, 'banana');
  assert.equal(judgeReverse(pass, secret, true), null, 'cannot award twice');
  assert.equal(judgeReverse(s, { ...secret, round: 2 }, true), null);
  assert.equal(judgeReverse(s, secret, false).scores.b, 0);
  const next = nextRound(pass);
  assert.equal(next.giver, 'b'); assert.equal(next.plays, 0); assert.equal(next.recorded, false);
  assert.equal(next.pending, undefined);
});
test('timeout and interrupted take reveal for zero points', () => {
  const s = newGame({ ...DEFAULT_SETTINGS, game: 'reverse' }, ['a','b'], 'audio');
  const secret = { gameId: 'audio', round: 1, word: 'cat' };
  const timed = resolve({ ...s, phase: 'pending', pending: { actor: 'b', kind: 'timeout' } }, secret);
  assert.equal(timed.result.timedOut, true); assert.equal(timed.result.points, 0);
  const skip = judgeReverse({ ...s, phase: 'recording', recorded: true }, secret, true, true);
  assert.equal(skip.result.correct, false); assert.equal(skip.scores.b, 0);
});
test('every syllable level has a large unique bank of playable bundled WAVs', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/licenses/reverse-audio-manifest.json', import.meta.url)));
  const words = Object.values(REVERSE_WORDS).flat();
  assert.equal(manifest.model, 'onnx-community/Kokoro-82M-v1.0-ONNX');
  assert.equal(manifest.voice, 'af_heart');
  assert.equal(Object.keys(manifest.clips).length, words.length);
  assert.equal(new Set(words).size, words.length);
  for (const bank of Object.values(REVERSE_WORDS)) {
    assert.ok(bank.length >= 100);
    for (const word of bank) {
      const bytes = readFileSync(new URL(`../public/reverse-words/${word}.wav`, import.meta.url));
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.readUInt32LE(24), 24000);
      assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
      assert.ok(bytes.length > 1000 && bytes.length < 200000);
      assert.equal(bytes.length, manifest.clips[word].bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.clips[word].sha256);
    }
  }
});

test('microphone capture stops all tracks and resolves a short blob without retaining the mic', async (t) => {
  const { microphone } = await import('../src/reverse-audio.js');
  const beforeRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
  const beforeNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => {
    if (beforeRecorder) Object.defineProperty(globalThis, 'MediaRecorder', beforeRecorder); else delete globalThis.MediaRecorder;
    if (beforeNavigator) Object.defineProperty(globalThis, 'navigator', beforeNavigator); else delete globalThis.navigator;
  });
  let tracksStopped = 0;
  const stream = { getTracks: () => [{ stop: () => tracksStopped++ }] };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => stream } } });
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/mp4'; }
    state = 'inactive';
    constructor(s, options) { assert.equal(s, stream); this.mimeType = options.mimeType; }
    start(timeslice) { assert.equal(timeslice, 250); this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob(['sample'], { type: this.mimeType }) });
      this.onstop();
    }
  }
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: Recorder });
  const mic = await microphone();
  const captured = mic.start();
  mic.stop();
  assert.equal((await captured).type, 'audio/mp4');
  assert.equal(tracksStopped, 1);
  const interrupted = await microphone();
  const failed = interrupted.start();
  interrupted.cancel();
  await assert.rejects(failed, /interrupted/);
  assert.ok(tracksStopped >= 2);
  navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(Error('Denied'), { name: 'NotAllowedError' }); };
  await assert.rejects(microphone(), { name: 'NotAllowedError' });
});
