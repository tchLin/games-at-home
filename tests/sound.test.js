import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPlayer } from '../src/sound.js';
function setup(initial = 'on') {
  let saved = initial, constructions = 0;
  const nodes = [];
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const context = {
    state: 'suspended', currentTime: 1, destination: {},
    async resume() { this.state = 'running'; },
    createGain() { const node = { gain: parameter(), connect() {}, disconnect() { this.disconnected = true; } }; nodes.push(node); return node; },
    createOscillator() { const node = { frequency: parameter(), connect() {}, start() { this.started = true; }, stop() {}, disconnect() { this.disconnected = true; } }; nodes.push(node); return node; },
  };
  const player = createSoundPlayer({ createContext: () => { constructions++; return context; }, storage: () => ({ getItem: () => saved, setItem: (_, value) => { saved = value; } }) });
  return { player, context, nodes, constructions: () => constructions, saved: () => saved };
}
test('sounds only initialize on user unlock, persist mute, and silence active audio', async () => {
  const s = setup();
  assert.equal(s.player.play('tap'), false);
  assert.equal(s.constructions(), 0);
  await s.player.unlock();
  assert.equal(s.player.play('tap'), true);
  s.player.setEnabled(false);
  assert.equal(s.saved(), 'off');
  assert.equal(s.nodes[0].gain.value, 0);
  assert.equal(s.player.play('finish'), false);
  s.player.setEnabled(true);
  assert.equal(s.saved(), 'on');
  s.context.currentTime += 1;
  assert.equal(s.player.play('success'), true);
  assert.equal(s.constructions(), 1);
  for (const node of s.nodes.filter((node) => node.started)) { node.onended(); assert.equal(node.disconnected, true); }
});
test('saved mute avoids even creating an audio context', async () => {
  const s = setup('off');
  await s.player.unlock();
  assert.equal(s.constructions(), 0);
  assert.equal(s.player.isEnabled(), false);
});
test('sound failures and blocked storage do not interrupt play', async () => {
  const player = createSoundPlayer({ createContext: () => { throw Error('Unsupported'); }, storage: () => { throw Error('Blocked'); } });
  await player.unlock();
  assert.equal(player.play('tap'), false);
  assert.doesNotThrow(() => player.setEnabled(false));
});
test('duplicate taps are throttled without suppressing game feedback', async () => {
  const s = setup();
  await s.player.unlock();
  assert.equal(s.player.play('tap'), true);
  assert.equal(s.player.play('tap'), false);
  assert.equal(s.player.play('start'), true);
  assert.equal(s.player.play('start'), false);
});
