import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BURST_SECONDS, emberGroups, emberPosition, fireworkCount, fireworkDuration, FIREWORKS, LAUNCH_SECONDS, rocketPosition } from '../src/art/fireworkPhysics.ts';

test('difficulty chooses two to five shells without changing game progression', () => {
  assert.deepEqual(['D1', 'D2', 'D3', 'D4'].map(tier => fireworkCount(tier as 'D1' | 'D2' | 'D3' | 'D4')), [2, 3, 4, 5]);
});
test('rockets decelerate to the burst point and all embers eventually fall', () => {
  for (const shell of FIREWORKS) {
    const start = rocketPosition(shell.x, shell.y * 600, 0), mid = rocketPosition(shell.x, shell.y * 600, LAUNCH_SECONDS / 2), end = rocketPosition(shell.x, shell.y * 600, LAUNCH_SECONDS);
    assert.ok(start.y - mid.y > mid.y - end.y);
    assert.ok(Math.abs(end.x - shell.x) < 1e-9 && Math.abs(end.y - shell.y * 600) < 1e-9);
  }
  for (const group of emberGroups(0)) {
    for (const ember of group.embers) {
      assert.ok(emberPosition(ember, BURST_SECONDS).y > emberPosition(ember, BURST_SECONDS - .1).y);
      assert.ok(Number.isFinite(emberPosition(ember, 0).x));
    }
  }
});
test('bundled original audio matches the visual timeline and avoids clipping', () => {
  for (const count of [2, 3, 4, 5]) {
    const wav = readFileSync(new URL(`../assets/audio/fireworks-${count}.wav`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 22050);
    assert.ok(Math.abs((wav.length - 44) / (22050 * 2) - fireworkDuration(count)) < .001);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 2000 && peak < 22000);
  }
});

test('each shell has broad multicolor petals, staggered inner layers and delayed glitter', () => {
  for (let shell = 0; shell < FIREWORKS.length; shell++) {
    const groups = emberGroups(shell);
    assert.equal(new Set(groups.map(group => group.color)).size, 6);
    assert.ok(groups.flatMap(group => group.embers).length >= 150);
    for (let layer = 0; layer < 4; layer++) assert.ok(groups.flatMap(group => group.embers).some(ember => ember.layer === layer));
    assert.ok(groups.flatMap(group => group.embers).filter(ember => ember.layer === 3).every(ember => ember.delay >= .4));
    assert.ok(groups.flatMap(group => group.embers).filter(ember => ember.layer === 0).some(ember => Math.abs(emberPosition(ember, 1).x) > 100));
  }
});
