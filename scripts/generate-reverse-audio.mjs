// Offline neural speech build tool; never imported by the website.
// Setup and licenses: public/licenses/reverse-audio.txt.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { REVERSE_WORDS } from '../src/reverse-words.js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const VOICE = 'af_heart';
const SPEED = 0.95;
const args = process.argv.slice(2);
const option = (key) => args[args.indexOf(key) + 1];
if (!args.includes('--tools') || !args.includes('--dictionary')) {
  throw new Error('Usage: node scripts/generate-reverse-audio.mjs --tools /tmp/reverse-neural-tools --dictionary /path/to/cmudict.dict');
}
const tools = resolve(option('--tools'));
const { KokoroTTS } = await import(pathToFileURL(join(tools, 'node_modules/kokoro-js/dist/kokoro.js')));
const { env, StyleTextToSpeech2Model, AutoTokenizer } = await import(pathToFileURL(join(tools, 'node_modules/@huggingface/transformers/dist/transformers.node.mjs')));
env.cacheDir = join(tools, 'cache');
const dictionaryBytes = await readFile(resolve(option('--dictionary')));
const syllables = new Map();
for (const line of dictionaryBytes.toString().split('\n')) {
  const [entry, ...phones] = line.trim().split(/\s+/);
  if (!entry || entry.startsWith(';')) continue;
  const word = entry.replace(/\(\d+\)$/, '');
  const counts = syllables.get(word) || new Set();
  counts.add(phones.filter((phone) => /[012]$/.test(phone)).length);
  syllables.set(word, counts);
}
const seen = new Set();
for (const [count, words] of Object.entries(REVERSE_WORDS)) {
  for (const word of words) {
    const counts = syllables.get(word);
    if (!/^[a-z]+$/.test(word) || seen.has(word) || !counts || counts.size !== 1 || !counts.has(Number(count))) {
      throw new Error(`Invalid, duplicate or syllabically ambiguous word: ${word} (${count})`);
    }
    seen.add(word);
  }
}

function encodeWav(samples, sampleRate) {
  if (sampleRate !== 24000 || !samples.length || samples.some((x) => !Number.isFinite(x))) {
    throw new Error('Neural model returned invalid audio.');
  }
  let start = 0, end = samples.length;
  // Keep quiet consonants: trim only silence below -60 dB, with 40 ms padding.
  while (start < end && Math.abs(samples[start]) < 0.001) start++;
  while (end > start && Math.abs(samples[end - 1]) < 0.001) end--;
  const pad = Math.round(sampleRate * 0.04);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length, end + pad);
  if (end - start < sampleRate * 0.15 || end - start > sampleRate * 4) {
    throw new Error('Neural model returned unexpected speech duration.');
  }
  const wav = Buffer.alloc(44 + (end - start) * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(wav.length - 44, 40);
  for (let i = start; i < end; i++) {
    wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + (i - start) * 2);
  }
  return wav;
}

const out = fileURLToPath(new URL('../public/reverse-words/', import.meta.url));
await mkdir(out, { recursive: true });
const [model, tokenizer] = await Promise.all([
  StyleTextToSpeech2Model.from_pretrained(MODEL, { revision: REVISION, dtype: 'fp32', device: 'cpu' }),
  AutoTokenizer.from_pretrained(MODEL, { revision: REVISION }),
]);
const tts = new KokoroTTS(model, tokenizer);
const manifest = {
  model: MODEL, revision: REVISION, dtype: 'fp32', voice: VOICE, speed: SPEED,
  sampleRate: 24000, channels: 1, bitsPerSample: 16,
  dictionarySha256: createHash('sha256').update(dictionaryBytes).digest('hex'),
  clips: {},
};
let bytes = 0, completed = 0;
for (const word of seen) {
  // Sentence punctuation improves isolated-word prosody without adding words.
  // This must complete neural model inference; there is no robotic TTS fallback.
  const result = await tts.generate(`${word}.`, { voice: VOICE, speed: SPEED });
  const wav = encodeWav(result.audio, result.sampling_rate);
  await writeFile(join(out, `${word}.wav`), wav);
  manifest.clips[word] = {
    bytes: wav.length,
    seconds: (wav.length - 44) / 48000,
    sha256: createHash('sha256').update(wav).digest('hex'),
  };
  bytes += wav.length;
  if (++completed % 50 === 0) console.log(`Generated ${completed}/${seen.size} neural clips.`);
}
const manifestPath = fileURLToPath(new URL('../public/licenses/reverse-audio-manifest.json', import.meta.url));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  counts: Object.fromEntries(Object.entries(REVERSE_WORDS).map(([n, words]) => [n, words.length])),
  clips: seen.size, bytes, sampleRate: 24000, channels: 1, bitsPerSample: 16,
}, null, 2));
