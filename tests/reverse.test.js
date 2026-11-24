import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reverseWav, toBase64, fromBase64, audioSession, resumeAudio, playBuffer, reversedBuffer, resampleMono, releaseMicrophone, microphoneReady, SAMPLE_RATE, MAX_AUDIO_BASE64 } from '../src/reverse-audio.js';
import { newGame, nextRound, resolve, judgeReverse } from '../src/engine.js';
import { DEFAULT_SETTINGS } from '../src/content.js';
import { REVERSE_WORDS } from '../src/reverse-words.js';
import { chooseReverseWord, reverseWordAssignment } from '../src/reverse-game.js';

test('speech opts into media playback and restores the prior session; unsupported browsers still work', (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => original ? Object.defineProperty(globalThis, 'navigator', original) : delete globalThis.navigator);
  const session = { type: 'auto' };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { audioSession: session } });
  const restore = audioSession('playback');
  assert.equal(session.type, 'playback');
  const afterMic = audioSession('auto');
  assert.equal(session.type, 'auto');
  afterMic(); assert.equal(session.type, 'playback');
  restore(); assert.equal(session.type, 'auto');
  delete navigator.audioSession;
  assert.doesNotThrow(() => audioSession('playback')());
  navigator.audioSession = { get type() { return 'auto'; }, set type(_) { throw Error('Unsupported'); } };
  assert.doesNotThrow(() => audioSession('playback')());
});

test('resume happens inside the tap and rejects interrupted or stalled audio', async () => {
  let resumed = false;
  const ctx = { state: 'suspended', resume() { resumed = true; this.state = 'running'; return Promise.resolve(); } };
  const ready = resumeAudio(ctx);
  assert.equal(resumed, true, 'resume must happen before returning to the event loop');
  await ready;
  await assert.rejects(resumeAudio({ state: 'interrupted', resume: async () => {} }), /Audio couldn’t start/);
  await assert.rejects(resumeAudio({ state: 'suspended', resume: () => new Promise(() => {}) }, 5), /Audio couldn’t start/);
  assert.throws(() => playBuffer({ state: 'interrupted' }, {}), /Audio couldn’t start/);
});

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

test('microphone access is reused with tracks muted between takes, and released explicitly', async (t) => {
  const { microphone } = await import('../src/reverse-audio.js');
  const beforeRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder');
  const beforeNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  t.after(() => {
    releaseMicrophone();
    if (beforeRecorder) Object.defineProperty(globalThis, 'MediaRecorder', beforeRecorder); else delete globalThis.MediaRecorder;
    if (beforeNavigator) Object.defineProperty(globalThis, 'navigator', beforeNavigator); else delete globalThis.navigator;
  });
  let tracksStopped = 0, requests = 0;
  const track = { enabled: true, readyState: 'live', stop() { tracksStopped++; this.readyState = 'ended'; } };
  const stream = { getTracks: () => [track] };
  const session = { type: 'playback' };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { audioSession: session, mediaDevices: { getUserMedia: async (constraints) => {
    requests++; assert.equal(constraints.audio.noiseSuppression,false); assert.equal(constraints.audio.sampleRate.ideal,48000); return stream;
  } } } });
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/mp4'; }
    state = 'inactive';
    constructor(s, options) { assert.equal(s, stream); this.mimeType = options.mimeType; assert.equal(options.audioBitsPerSecond,128000); }
    start(timeslice) { assert.equal(timeslice,250); assert.equal(track.enabled,true); this.state='recording'; }
    stop() { this.state='inactive'; this.ondataavailable({data:new Blob(['sample'],{type:this.mimeType})});this.onstop(); }
  }
  Object.defineProperty(globalThis,'MediaRecorder',{configurable:true,value:Recorder});
  const mic=await microphone();assert.equal(track.enabled,false);assert.equal(microphoneReady(),true);
  const captured=mic.start();mic.stop();assert.equal((await captured).type,'audio/mp4');
  assert.equal(track.enabled,false);assert.equal(tracksStopped,0);assert.equal(session.type,'playback');
  const retry=await microphone();const second=retry.start();retry.stop();await second;
  assert.equal(requests,1,'retakes reuse the permitted stream');
  const interrupted=await microphone();const failed=interrupted.start();interrupted.cancel();await assert.rejects(failed,/interrupted/);
  assert.equal(track.enabled,false);
  releaseMicrophone();assert.equal(tracksStopped,1);assert.equal(microphoneReady(),false);
  navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(Error('Denied'),{name:'NotAllowedError'});};
  await assert.rejects(microphone(),{name:'NotAllowedError'});assert.equal(session.type,'playback');
});

test('late microphone permission cannot leave capture alive after leaving the game', async (t) => {
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldRecorder=globalThis.MediaRecorder;
  let grant,stops=0;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise((resolve)=>{grant=resolve;})}}});
  globalThis.MediaRecorder=class {};
  t.after(()=>{releaseMicrophone();if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;if(oldRecorder)globalThis.MediaRecorder=oldRecorder;else delete globalThis.MediaRecorder;});
  const {microphone}=await import('../src/reverse-audio.js');
  const waiting=microphone();releaseMicrophone();
  grant({getTracks:()=>[{stop(){stops++;}}]});
  await assert.rejects(waiting,/cancelled/);assert.equal(stops,1);assert.equal(microphoneReady(),false);
});

test('24kHz resampling preserves speech detail and suppresses out-of-band aliasing', () => {
  const tone=(frequency)=>Float32Array.from({length:48000/2},(_,i)=>.5*Math.sin(2*Math.PI*frequency*i/48000));
  const rms=(samples)=>Math.sqrt(samples.slice(100,-100).reduce((sum,x)=>sum+x*x,0)/(samples.length-200));
  const voice=resampleMono([tone(8000)],48000),ultrasonic=resampleMono([tone(15000)],48000);
  assert.ok(rms(voice)>.3,'8kHz detail is retained instead of discarded at the old 6kHz bandwidth');
  assert.ok(rms(ultrasonic)<.01,'high frequencies are filtered before downsampling');
  const polished=reverseWav([tone(8000)],48000,{polish:true});
  const view=new DataView(polished.buffer);
  assert.equal(view.getUint32(24,true),24000);
  assert.equal(view.getInt16(44,true),0);assert.equal(view.getInt16(polished.length-2,true),0,'short edge fades prevent clicks');
});


test('original-take replay reverses a copy without changing the shared listener buffer', () => {
  const samples = new Float32Array([.2, -.4, .8]);
  const source = { numberOfChannels: 1, length: samples.length, sampleRate: SAMPLE_RATE, getChannelData: () => samples };
  const copy = new Float32Array(samples.length);
  const context = { createBuffer(channels, length, rate) {
    assert.equal(channels, 1); assert.equal(length, samples.length); assert.equal(rate, SAMPLE_RATE);
    return { getChannelData: () => copy };
  } };
  reversedBuffer(context, source);
  assert.deepEqual(copy, new Float32Array([.8, -.4, .2]));
  assert.deepEqual(samples, new Float32Array([.2, -.4, .8]));
});
