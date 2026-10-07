import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCleanStart, inspectStartQuality } from '../src/game/startQuality.ts';

const bottle = (id: string, layers: string[]) => ({ id, layers });
test('initial-board screen accepts two copies including nonadjacent pairs', () => {
  const level = { capacity: 4, bottles: [bottle('one', ['A', 'B', 'A', 'B']), bottle('spare', [])] };
  assert.equal(hasCleanStart(level), true);
  assert.deepEqual(inspectStartQuality(level), []);
});
test('initial-board screen names triple and already complete bottles', () => {
  const level = { capacity: 4, bottles: [bottle('triple', ['A', 'B', 'A', 'A']), bottle('complete', ['C', 'C', 'C', 'C'])] };
  assert.equal(hasCleanStart(level), false);
  assert.deepEqual(inspectStartQuality(level), [
    { bottleId: 'triple', color: 'A', copies: 3, completed: false },
    { bottleId: 'complete', color: 'C', copies: 4, completed: true },
  ]);
});
