import assert from 'node:assert/strict';
import test from 'node:test';
import { rowStructure } from '../scripts/lib/unlockPostKeyDiversity.ts';

test('row structure rejects cosmetic color and bottle rearrangements', () => {
  const source = [['a', 'b', 'a', 'c'], ['b', 'c', 'b', 'c'], ['a', 'a'], ['c', 'b'], []];
  const names: Record<string, string> = { a: 'green', b: 'blue', c: 'pink' };
  const cosmetic = [source[3], source[0], source[4], source[2], source[1]].map(stack => stack.map(c => names[c]));
  assert.equal(rowStructure(source), rowStructure(cosmetic));
  const localSwap = structuredClone(source);
  [localSwap[0][0], localSwap[0][1]] = [localSwap[0][1], localSwap[0][0]];
  assert.notEqual(rowStructure(source), rowStructure(localSwap));
});

test('row structure retains fill, layer order and color relationships', () => {
  const a = [['a','a','b','b'], ['b','b','c','c'], ['a','a','c','c'], []];
  const b = [['a','b','c','a'], ['b','c','a','b'], ['c','a'], ['b','c']];
  assert.notEqual(rowStructure(a), rowStructure(b));
  assert.notEqual(rowStructure([['a','b'],['a','b']]), rowStructure([['a','b'],['c','d']]));
  assert.notEqual(rowStructure([[],[]]), rowStructure([[]]));
});
