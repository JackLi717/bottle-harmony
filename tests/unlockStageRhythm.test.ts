import assert from 'node:assert/strict';
import test from 'node:test';
import { engineFixture } from '../src/game/engineExamples.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { analyzeStageDifficulty } from '../scripts/lib/unlockStageDifficulty.ts';
import { analyzeStageRhythm, classifyStageWork, STAGE_RHYTHM_METHOD, STAGE_RHYTHM_POLICY } from '../scripts/lib/unlockStageRhythm.ts';
import { extractUnlockRating, ratingComparisonSet, sha256 } from '../scripts/lib/unlockRatingEvidence.ts';
import type { SortingPuzzle } from '../src/game/engineModel.ts';

const key = (id: string, board: string[][], locked: number) => engineFixture(id, board, {
  locked: [locked], triggers: [{ id: 'key', when: { type: 'empty', container: 'b0' }, unlock: [`b${locked}`] }],
});
const balanced = key('rhythm-balanced', [['a', 'a'], ['a'], ['a'], []], 2);
const front = key('rhythm-front', [['a', 'b', 'a', 'b'], ['b', 'b'], ['a', 'a'], []], 2);
const back = key('rhythm-back', [['a', 'a'], ['a', 'a'], []], 1);
function measure(puzzle: SortingPuzzle) {
  const graph = buildRatingGraph(puzzle), stage = analyzeStageDifficulty(graph);
  return { graph, stage, rhythm: analyzeStageRhythm(graph, stage) };
}

test('one exact workload rule supports balanced and front-loaded, rejecting back-loaded and zero work', () => {
  for (const [before, after, structure] of [[4, 6, 'balanced'], [6, 4, 'balanced'], [7, 3, 'front-loaded'], [1, 0, 'front-loaded']] as const) {
    assert.deepEqual(classifyStageWork(before, after), { status: 'pass', structure, reason: null });
  }
  for (const [before, after] of [[3, 7], [0, 1]]) assert.deepEqual(classifyStageWork(before, after), { status: 'fail', structure: null, reason: 'back-loaded' });
  assert.deepEqual(classifyStageWork(0, 0), { status: 'fail', structure: null, reason: 'no-sorting-work' });
  for (const invalid of [-1, 0.5, NaN, Infinity]) assert.throws(() => classifyStageWork(invalid, 1));
  assert.throws(() => classifyStageWork(Number.MAX_SAFE_INTEGER, 1));
  assert.equal(classifyStageWork(3600000000000000, 5400000000000000).structure, 'balanced');
});

test('actual mandatory-key certificates count locked runs throughout and include the triggering merge before', () => {
  for (const [puzzle, before, after, structure] of [[balanced, 1, 1, 'balanced'], [front, 3, 1, 'front-loaded'], [back, 0, 1, null]] as const) {
    const { stage, rhythm } = measure(puzzle);
    assert.equal(stage.status, 'rated'); assert.equal(stage.rank, 1);
    assert.equal(rhythm.before, before); assert.equal(rhythm.after, after);
    assert.equal(rhythm.total, before + after); assert.equal(rhythm.structure, structure);
    assert.equal(rhythm.status, structure ? 'pass' : 'fail');
    assert.equal(rhythm.witness?.splitPour, stage.witness?.splitPour);
    assert.equal(rhythm.witness?.finalRuns, puzzle.colors.length);
  }
  // 4 pours before vs 1 after, but one pour merely relocates a run: work is 3/1.
  assert.equal(measure(front).stage.witness?.splitPour, 4);
  assert.equal(measure(back).rhythm.reason, 'back-loaded');
});

test('neutral detours do not inflate work; wrong split, mismatched frames and incomplete routes are rejected', () => {
  const { graph, stage, rhythm } = measure(balanced);
  assert.equal(stage.status, 'rated'); if (stage.status !== 'rated') throw new Error('Missing certificate');
  const transfer = (source: string, target: string) => ({ type: 'transfer' as const, source, target });
  const detour = { ...stage, witness: { ...stage.witness,
    route: [transfer('b1', 'b3'), transfer('b3', 'b1'), ...stage.witness.route], splitPour: stage.witness.splitPour! + 2 } };
  const longer = analyzeStageRhythm(graph, detour);
  assert.equal(longer.before, rhythm.before); assert.equal(longer.after, rhythm.after); assert.equal(longer.structure, rhythm.structure);
  assert.throws(() => analyzeStageRhythm(graph, { ...stage, witness: { ...stage.witness, splitPour: 2 } }), /first key firing/);
  assert.throws(() => analyzeStageRhythm(graph, { ...stage, witness: { ...stage.witness,
    unlockedFrame: graph.status === 'complete' ? graph.nodes[0].frame : null } }), /actual paired unlocked frame/);
  assert.throws(() => analyzeStageRhythm(graph, { ...stage, witness: { ...stage.witness, route: stage.witness.route.slice(0, 1) } }), /Incomplete/);
});

test('ordinary controls, unsupported mechanisms, unsolvable boards and budget limits cannot acquire a passing rhythm', () => {
  assert.equal(measure(engineFixture('rhythm-ordinary', [['a', 'a'], ['a', 'a'], []])).rhythm.status, 'not-applicable');
  assert.equal(measure(engineFixture('rhythm-finished', [['a', 'a', 'a', 'a'], []])).rhythm.status, 'not-applicable');
  const hidden = { ...balanced, hidden: [balanced.units[0].id] };
  assert.equal(measure(hidden).rhythm.status, 'unsupported');
  const cover = engineFixture('rhythm-cover', [['a', 'a'], ['a', 'a'], []], {
    locked: [2], triggers: [{ id: 'cover', when: { type: 'color-full', color: 'a', count: 4 }, unlock: ['b2'] }],
  });
  assert.equal(measure(cover).rhythm.status, 'unsupported');
  assert.equal(measure(engineFixture('rhythm-stuck', [['a', 'b', 'a', 'b'], ['b', 'a', 'b', 'a']])).rhythm.status, 'blocked');
  const graph = buildRatingGraph(front);
  const limited = analyzeStageRhythm(graph, analyzeStageDifficulty(graph, 1));
  assert.equal(limited.status, 'unknown'); assert.equal(limited.before, null); assert.equal(limited.reason, 'policy-work');
  const unknown = buildRatingGraph(front, 1);
  assert.equal(analyzeStageRhythm(unknown, analyzeStageDifficulty(unknown)).reason, 'graph-states');
});

test('report binds the rhythm rule and raw counts to the same evidence as difficulty, without changing ranks', () => {
  const input = { puzzle: front, design: { role: 'challenge' as const, family: 'test', purpose: { event: 'key' as const, description: 'Empty the key bottle.' } } };
  const report = extractUnlockRating(input, ratingComparisonSet([input]));
  assert.equal(report.status, 'complete'); if (report.status !== 'complete') throw new Error('Missing evidence');
  assert.deepEqual(report.evidence.stageDifficulty, measure(front).stage);
  const rhythm = report.evidence.stageRhythm;
  assert.equal(rhythm.method, STAGE_RHYTHM_METHOD); assert.deepEqual(rhythm.policy, STAGE_RHYTHM_POLICY);
  assert.equal(rhythm.witness?.splitPour, report.evidence.stageDifficulty.witness?.splitPour);
  assert.equal(report.evidence.ablations.classicBase.status, 'complete');
  if (report.evidence.ablations.classicBase.status === 'complete') assert.equal(report.evidence.ablations.classicBase.stageRhythm.status, 'not-applicable');
  const { status: _status, evidenceSha256, limits: _limits, evidence, ...binding } = report;
  assert.equal(evidenceSha256, sha256({ binding, evidence }));
  assert.notEqual(evidenceSha256, sha256({ binding, evidence: { ...evidence, stageRhythm: { ...rhythm, before: 99 } } }));
  assert.notEqual(evidenceSha256, sha256({ binding, evidence: { ...evidence, stageRhythm: { ...rhythm, policy: { balancedBeforePercent: { min: 30, max: 70 } } } } }));
});
