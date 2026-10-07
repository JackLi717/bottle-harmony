import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { FLOW_END, FLOW_START, POUR_DURATION_MS, STREAM_FADE_FRACTION, streamOpacity } from '../src/art/pourGeometry.ts';
import { createPourSoundGate } from '../src/ui/pourSoundGate.ts';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('pour audio plays once per flow and rewinds for the next pour', async () => {
  const events: string[] = [];
  const gate = createPourSoundGate({ prepare: async () => {}, rewind: async () => { events.push('rewind'); }, play: () => events.push('play'), stop: () => events.push('stop') });
  gate.setFlow(true); gate.setFlow(true); await flush();
  assert.deepEqual(events, ['rewind', 'play']);
  gate.setFlow(false); gate.setFlow(false);
  assert.deepEqual(events, ['rewind', 'play', 'stop']);
  gate.setFlow(true); await flush();
  assert.deepEqual(events, ['rewind', 'play', 'stop', 'rewind', 'play']);
});
test('flow end or mute prevents a pending seek from starting late', async () => {
  const seek = deferred(), events: string[] = [];
  const gate = createPourSoundGate({ prepare: async () => {}, rewind: () => seek.promise, play: () => events.push('play'), stop: () => events.push('stop') });
  gate.setFlow(true); await flush(); gate.setFlow(false); seek.resolve(); await flush();
  assert.deepEqual(events, ['stop']);
});
test('unmount invalidates preparation and queued callbacks without touching a released player', async () => {
  const prepare = deferred(), events: string[] = [];
  const gate = createPourSoundGate({ prepare: () => prepare.promise, rewind: async () => { events.push('rewind'); }, play: () => events.push('play'), stop: () => events.push('stop') });
  gate.setFlow(true); gate.dispose(); prepare.resolve(); await flush(); gate.setFlow(false); gate.setFlow(true);
  assert.deepEqual(events, []);
});
test('a cancelled old seek cannot play over a newer pour', async () => {
  const first = deferred(), second = deferred(), events: string[] = [];
  let seeks = 0;
  const gate = createPourSoundGate({ prepare: async () => {}, rewind: () => (++seeks === 1 ? first : second).promise, play: () => events.push('play'), stop: () => events.push('stop') });
  gate.setFlow(true); await flush(); gate.setFlow(false); gate.setFlow(true); await flush();
  first.resolve(); await flush(); assert.deepEqual(events, ['stop']);
  second.resolve(); await flush(); assert.deepEqual(events, ['stop', 'play']);
});
test('recorded water is bounded by the visible stream and has smooth, unclipped ends', () => {
  const wav = readFileSync(new URL('../assets/audio/water-pour.wav', import.meta.url));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt16LE(22), 1);
  const rate = wav.readUInt32LE(24);
  const expected = POUR_DURATION_MS / 1000 * (FLOW_END + STREAM_FADE_FRACTION - FLOW_START);
  assert.ok(Math.abs((wav.length - 44) / (2 * rate) - expected) < 1 / rate);
  assert.equal(wav.readInt16LE(44), 0);
  assert.equal(wav.readInt16LE(wav.length - 2), 0);
  let peak = 0, energy = 0;
  for (let i = 44; i < wav.length; i += 2) { const v = wav.readInt16LE(i); peak = Math.max(peak, Math.abs(v)); energy += v * v; }
  assert.ok(peak > 3000 && peak < 25000);
  assert.ok(Math.sqrt(energy / ((wav.length - 44) / 2)) > 1000);
  for (let ms = 0; ms <= POUR_DURATION_MS; ms++) {
    const progress = ms / POUR_DURATION_MS;
    assert.equal(streamOpacity(progress) > 0, progress > FLOW_START && progress < FLOW_END + STREAM_FADE_FRACTION);
  }
});

test('lifting prepares and rewinds silently so visible flow can play immediately', async () => {
  const events: string[] = [];
  const gate = createPourSoundGate({ prepare: async () => { events.push('prepare'); }, rewind: async () => { events.push('rewind'); }, play: () => events.push('play'), stop: () => events.push('stop') });
  gate.arm(); gate.arm(); await flush();
  assert.deepEqual(events, ['prepare', 'rewind']);
  gate.setFlow(true); await flush();
  assert.deepEqual(events, ['prepare', 'rewind', 'play']);
});
test('cancelling during lift prevents a pending preparation from touching the player', async () => {
  const prepare = deferred(), events: string[] = [];
  const gate = createPourSoundGate({ prepare: () => prepare.promise, rewind: async () => { events.push('rewind'); }, play: () => events.push('play'), stop: () => events.push('stop') });
  gate.arm(); gate.setFlow(false); prepare.resolve(); await flush();
  assert.deepEqual(events, []);
});
