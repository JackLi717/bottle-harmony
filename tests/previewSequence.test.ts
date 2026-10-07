import assert from 'node:assert/strict';
import test from 'node:test';
import { adjacentPreview, type PreviewPosition } from '../src/game/previewSequence.ts';

const sides = Array.from({ length: 50 }, (_, index) => (index + 1) * 20);

test('preview arrows traverse all 1000 main and 50 side levels in playable order', () => {
  const visited: PreviewPosition[] = [];
  let position: PreviewPosition | null = { kind: 'main', number: 1 };
  while (position) {
    visited.push(position);
    position = adjacentPreview(position, 1, 1000, sides);
  }
  assert.equal(visited.length, 1050);
  assert.deepEqual(visited.slice(18, 23), [
    { kind: 'main', number: 19 }, { kind: 'main', number: 20 },
    { kind: 'side', number: 1 }, { kind: 'main', number: 21 }, { kind: 'main', number: 22 },
  ]);
  assert.deepEqual(visited.at(-1), { kind: 'side', number: 50 });
  for (let index = 1; index < visited.length; index++) {
    assert.deepEqual(adjacentPreview(visited[index], -1, 1000, sides), visited[index - 1]);
  }
  assert.equal(adjacentPreview(visited[0], -1, 1000, sides), null);
});
