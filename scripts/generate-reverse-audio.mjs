// Offline-only build tool. See public/licenses/reverse-audio.txt for setup.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { REVERSE_WORDS } from '../src/reverse-words.js';

const args = process.argv.slice(2);
const option = (key) => args[args.indexOf(key) + 1];
if (!args.includes('--engine') || !args.includes('--dictionary')) {
  throw new Error('Usage: node scripts/generate-reverse-audio.mjs --engine /path/to/spellophone/dist/node.js --dictionary /path/to/cmudict.dict');
}
const { createEspeak, encodeWav } = await import(pathToFileURL(resolve(option('--engine'))));
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

// Short mono PCM WAVs work with decodeAudioData on mobile Safari and Chromium.
// Trim only near-silence with 25 ms padding. A windowed sinc low-pass resampler
// prevents high frequencies aliasing when converting eSpeak's 22,050 Hz output.
function compact(samples, sourceRate, targetRate = 16000) {
  let start = 0, end = samples.length;
  while (start < end && Math.abs(samples[start]) < 48) start++;
  while (end > start && Math.abs(samples[end - 1]) < 48) end--;
  const pad = Math.round(sourceRate * 0.025);
  start = Math.max(0, start - pad);
  end = Math.min(samples.length, end + pad);
  if (end - start < sourceRate * 0.1) throw new Error('Synthesizer returned empty speech.');
  const output = new Int16Array(Math.ceil((end - start) * targetRate / sourceRate));
  const cutoff = Math.min(1, targetRate / sourceRate) * 0.94;
  const radius = 16;
  for (let i = 0; i < output.length; i++) {
    const position = start + i * sourceRate / targetRate;
    let sum = 0, weight = 0;
    for (let j = Math.ceil(position - radius); j <= Math.floor(position + radius); j++) {
      if (j < start || j >= end) continue;
      const delta = position - j;
      const x = Math.PI * cutoff * delta;
      const sinc = Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x;
      const window = 0.5 + 0.5 * Math.cos(Math.PI * delta / radius);
      const w = cutoff * sinc * window;
      sum += samples[j] * w;
      weight += w;
    }
    output[i] = Math.max(-32768, Math.min(32767, Math.round(sum / weight)));
  }
  return output;
}

const out = fileURLToPath(new URL('../public/reverse-words/', import.meta.url));
await mkdir(out, { recursive: true });
const engine = await createEspeak({ languages: ['en'] });
let bytes = 0;
for (const word of seen) {
  const result = engine.synthesize(word, { voice: 'en-us', rate: 150, pitch: 50, endPause: false });
  const wav = encodeWav(compact(result.samples, result.sampleRate), 16000);
  await writeFile(join(out, `${word}.wav`), wav);
  bytes += wav.byteLength;
}
console.log(JSON.stringify({
  counts: Object.fromEntries(Object.entries(REVERSE_WORDS).map(([n, words]) => [n, words.length])),
  clips: seen.size, bytes, sampleRate: 16000, channels: 1, bitsPerSample: 16,
  dictionarySha256: createHash('sha256').update(dictionaryBytes).digest('hex'),
}, null, 2));
