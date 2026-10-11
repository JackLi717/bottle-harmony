import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectPostKeyIntegration } from '../scripts/lib/unlockPostKeyIntegration.ts';

test('whole-board generation rejects a separate two-color box and a token cross-link', () => {
  const split = [['a','b'], ['a','b'], ['c','d'], ['c','d']];
  assert.equal(inspectPostKeyIntegration(split, [0,1]).reason, 'too-few-shared-colors');
  const token = [['a','b'], ['a','b'], ['a','c'], ['c','d'], ['b','d']];
  assert.equal(inspectPostKeyIntegration(token, [0,1]).status, 'fail');
  const isolatedBottle = [['a','b'], ['c','c'], ['a','b','c'], ['a','b','c']];
  assert.equal(inspectPostKeyIntegration(isolatedBottle, [0,1]).reason, 'isolated-locked-bottle');
});

test('three shared colors must remain connected to the rest of the unfinished puzzle', () => {
  const joined = [['a','b'], ['b','c'], ['a','c'], ['a','b','c'], ['d','d','d','d']];
  const check = inspectPostKeyIntegration(joined, [0,1,2]);
  assert.equal(inspectPostKeyIntegration([...joined, []], [0,1,5]).status, 'pass', 'An empty locked vessel shares working space without creating a color component');
  assert.equal(check.status, 'pass'); assert.deepEqual(check.sharedColors, ['a','b','c']); assert.deepEqual(check.linksPerBottle, [2,2,2]);
  assert.equal(inspectPostKeyIntegration([...joined, ['e','f'], ['e','f']], [0,1,2]).reason, 'separate-color-component');
  const renamed = joined.map(s=>s.map(c=>'color-'+c)).reverse();
  assert.equal(inspectPostKeyIntegration(renamed, [4,3,2]).status, 'pass');
});
