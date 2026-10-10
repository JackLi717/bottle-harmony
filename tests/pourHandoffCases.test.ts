import assert from 'node:assert/strict';
import test from 'node:test';
import { POUR_HANDOFF_CASES } from '../src/game/pourHandoffCases.ts';
import { createEngineSession, moveEngineSession } from '../src/game/engine.ts';

test('small handoff controls cover empty, one/two remaining, receiver fills and three-layer control', () => {
  const expected = [[0, 1], [1, 4], [2, 4], [1, 1], [2, 2], [3, 3], [0, 2], [0, 3]];
  POUR_HANDOFF_CASES.forEach(({ puzzle }, i) => {
    const before = createEngineSession(puzzle, `handoff-${i}`);
    const result = moveEngineSession(before, { type: 'transfer', source: 'b0', target: 'b1' });
    assert.ok(result);
    assert.deepEqual(result.session.state.contents.slice(0, 2).map(c => c.length), expected[i]);
    assert.ok(result.session.runtime.puzzle.containers.every(c => c.capacity === 4));
  });
});
