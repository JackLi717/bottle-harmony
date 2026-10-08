import test from 'node:test';
import assert from 'node:assert/strict';
import { boardLayout } from '../src/ui/boardLayout.ts';
import { nextBottleFocus } from '../src/ui/boardNavigation.ts';
import { deviceLayout } from '../src/ui/deviceLayout.ts';

test('keyboard navigation respects row edges and aligns unequal rows spatially', () => {
  const positions = boardLayout(7).positions;
  assert.equal(nextBottleFocus(positions, 0, 'ArrowLeft'), 0);
  assert.equal(nextBottleFocus(positions, 3, 'ArrowRight'), 3);
  assert.equal(nextBottleFocus(positions, 0, 'ArrowDown'), 4);
  assert.equal(nextBottleFocus(positions, 3, 'ArrowDown'), 6);
  assert.equal(nextBottleFocus(positions, 6, 'ArrowUp'), 3);
  assert.equal(nextBottleFocus(positions, 6, 'ArrowDown'), 6);
  assert.equal(nextBottleFocus(positions, -1, 'ArrowRight'), 0);
});

test('every current board can be traversed horizontally and between rows', () => {
  for (let count = 4; count <= 12; count++) {
    const { positions } = boardLayout(count);
    const columns = Math.ceil(count / 2);
    for (let index = 0; index < count; index++) {
      const row = index < columns ? 0 : 1;
      const vertical = nextBottleFocus(positions, index, row ? 'ArrowUp' : 'ArrowDown');
      assert.equal(positions[vertical].y, row ? 14 : 210);
      if (index + 1 < count && positions[index + 1].y === positions[index].y) {
        assert.equal(nextBottleFocus(positions, index, 'ArrowRight'), index + 1);
        assert.equal(nextBottleFocus(positions, index + 1, 'ArrowLeft'), index);
      }
    }
  }
});

test('phone baseline remains vertical, wide windows use a rail, TV reserves safe edges', () => {
  assert.deepEqual(deviceLayout(390, 844, false), { rail: false, compact: false, horizontalInset: 22, verticalInset: 0 });
  assert.equal(deviceLayout(360, 640, false).compact, true);
  assert.equal(deviceLayout(820, 1180, false).rail, false);
  assert.equal(deviceLayout(1180, 820, false).rail, true);
  assert.equal(deviceLayout(600, 400, false).rail, true);
  assert.equal(deviceLayout(540, 720, false).rail, false);
  assert.deepEqual(deviceLayout(1280, 720, true), { rail: true, compact: false, horizontalInset: 64, verticalInset: 36 });
});
