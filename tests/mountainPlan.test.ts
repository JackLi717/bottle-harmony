import assert from 'node:assert/strict';
import test from 'node:test';
import { challengeTarget, createProductionPlan, cycleTargets, validateRamp } from '../src/game/productionPlan.ts';
import { assignDistinctCandidates, selectMountainLevels } from '../src/game/waveSelection.ts';

const ideal = () => createProductionPlan().map(slot => ({ number: slot.number, score: slot.targetScore }));
test('mountain targets support early challenge, twenty-level summits and genuine recovery without global ordinary monotonicity', () => {
  const rows = ideal();
  assert.doesNotThrow(() => validateRamp(rows));
  assert.deepEqual(cycleTargets(1), { valley: 18, subpeak: 40, peak: 45 });
  assert.deepEqual(cycleTargets(50), { valley: 41, subpeak: 69, peak: 74 });
  assert.equal(challengeTarget(2), 45);
  assert.ok(rows[20].score < rows[18].score);
  assert.throws(() => cycleTargets(0)); assert.throws(() => challengeTarget(101));
});
test('mountain verification rejects flattening, a missing recovery, declining summits and malformed score rows', () => {
  const noPeak = ideal(); noPeak[9].score = noPeak[8].score;
  assert.throws(() => validateRamp(noPeak));
  const noRelief = ideal(); noRelief[20].score = noRelief[19].score - 5;
  assert.throws(() => validateRamp(noRelief));
  const decline = ideal(); decline[39].score = decline[19].score - 1;
  assert.throws(() => validateRamp(decline));
  const malformed = ideal(); malformed[123].score = NaN;
  assert.throws(() => validateRamp(malformed));
  assert.throws(() => validateRamp(ideal().slice(0, 999)));
});
test('selection fails explicitly on missing teaching supply rather than producing an unverified fallback', () => {
  assert.throws(() => selectMountainLevels([], ['a', 'b', 'c']), /Missing teaching/);
  assert.throws(() => selectMountainLevels([], ['a', 'a', 'b']), /Invalid candidate/);
});
test('distinct assignment rearranges earlier choices when scarce candidates are shared and rejects a genuine shortage', () => {
  const choices = new Map([[1, ['a', 'b']], [2, ['b', 'c']], [3, ['a', 'b']]]);
  const assigned = assignDistinctCandidates(choices, c => c);
  assert.equal(new Set(assigned.values()).size, 3);
  for (const [number, candidate] of assigned) assert.ok(choices.get(number)!.includes(candidate));
  assert.throws(() => assignDistinctCandidates(new Map([[1, ['a']], [2, ['a']]]), c => c), /supply cannot cover/);
});
