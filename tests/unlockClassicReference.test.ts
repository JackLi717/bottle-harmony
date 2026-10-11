import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { compileSortingPuzzle, initialEngineState } from '../src/game/engine.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { UNLOCK_BASELINE } from '../src/game/unlockBaseline.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { analyzeStageDifficulty } from '../scripts/lib/unlockStageDifficulty.ts';
import { classicFrameReference, unlockClassicReferences, CLASSIC_REFERENCE_BUDGET } from '../scripts/lib/unlockClassicReference.ts';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ordinary = engineFixture('reference-small', [['coral', 'jade', 'coral', 'jade'], ['jade', 'coral', 'jade', 'coral'], [], []]);

test('retained classic base scores independently reproduce the original 49/50/51 scale', () => {
  for (const entry of UNLOCK_BASELINE.filter(e => e.variant === 'classic')) {
    const reference = unlockClassicReferences(entry.puzzle, null, 'stage-evidence');
    assert.equal(reference.base.status, 'rated');
    assert.equal(reference.base.model, 'human-decision-v1');
    assert.equal(reference.base.planning?.policy, 'planning-depth-v1');
    assert.equal(reference.base.human?.planningRank, reference.base.planning?.rank);
    assert.equal(reference.base.human?.score?.total, entry.classicScore);
    assert.deepEqual(reference.stages[0].reference, reference.base);
  }
});

test('key reference uses the selected actual unlocked frame and never substitutes a whole-sort score for acquiring the key', () => {
  const puzzle = UNLOCK_BASELINE[5].puzzle;
  const stage = analyzeStageDifficulty(buildRatingGraph(puzzle));
  assert.equal(stage.status, 'rated'); if (stage.status !== 'rated' || !stage.witness.unlockedFrame) throw new Error('Expected paired frame');
  const reference = unlockClassicReferences(puzzle, stage, 'paired-evidence');
  assert.equal(reference.base.human?.score?.total, 51);
  const [before, after] = reference.stages;
  assert.equal(before.goal, 'empty-key'); assert.equal(before.reference.status, 'not-applicable');
  assert.equal(before.reference.human, null);
  assert.match(before.reference.reason!, /different goal/);
  assert.equal(after.reference.status, 'rated');
  assert.equal(after.frameSha256, hash(stage.witness.unlockedFrame));
  assert.deepEqual(after.reference, classicFrameReference(compileSortingPuzzle(puzzle), stage.witness.unlockedFrame));
  assert.deepEqual(after.reference.level?.bottles.map(b => b.layers), stage.witness.unlockedFrame.state.contents.map(stack =>
    stack.map(u => puzzle.units.find(unit => unit.id === u)!.color)));
  assert.equal(after.reference.human?.planningRank, after.reference.planning?.rank);
});

test('classic companion hash binds definitions, budgets, original components and the selected stage evidence', () => {
  const report = unlockClassicReferences(ordinary, null, 'first');
  const { method, definitionSha256, stageEvidenceSha256, model, planningModel, budget, base, stages, evidenceSha256 } = report;
  assert.equal(evidenceSha256, hash({ binding: { method, definitionSha256, stageEvidenceSha256, model, planningModel, budget }, evidence: { base, stages } }));
  assert.notEqual(unlockClassicReferences(ordinary, null, 'second').evidenceSha256, evidenceSha256);
  const limited = unlockClassicReferences(ordinary, null, 'first', { ...CLASSIC_REFERENCE_BUDGET, maxSolveStates: 1 });
  assert.notEqual(limited.evidenceSha256, evidenceSha256);
  assert.equal(limited.base.status, 'unknown'); assert.equal(limited.base.human, null);
  assert.equal(limited.stages[0].reference.status, 'unknown');
});

test('unknown selected stages and incompatible classic tasks retain no invented scores', () => {
  const key = UNLOCK_BASELINE[1].puzzle;
  const unknown = analyzeStageDifficulty(buildRatingGraph(key), 1);
  const reference = unlockClassicReferences(key, unknown, 'unknown-stage');
  assert.equal(reference.stages[1].reference.status, 'unknown'); assert.equal(reference.stages[1].frameSha256, null);
  const runtime = compileSortingPuzzle(key);
  assert.equal(classicFrameReference(runtime, initialEngineState(runtime)).status, 'not-applicable');
  for (const puzzle of [engineFixture('reference-complete', [['coral', 'coral', 'coral', 'coral'], []]),
    engineFixture('reference-inventory', [['coral', 'coral'], []]),
    { ...ordinary, amount: 'one' as const }]) {
    const r = compileSortingPuzzle(puzzle), score = classicFrameReference(r, initialEngineState(r));
    assert.equal(score.status, 'not-applicable'); assert.equal(score.human, null);
  }
});
