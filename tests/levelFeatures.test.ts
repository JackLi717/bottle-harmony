import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFeatureDistribution, featureSimilarity, recommendFeatureCoverage, summarizeFeatureRows } from '../src/game/featureDistribution.ts';
import { evaluateHumanDifficulty } from '../src/game/humanDifficulty.ts';
import { analyzeLevelFeatures, inspectFeatureRoute, inspectFeatureStructure, probeEarlyChoices, probeLateChoices } from '../src/game/levelFeatures.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { applyPour, getLegalPours, getPour } from '../src/game/rules.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';

const calibration = JSON.parse(readFileSync(new URL('../assets/levels/calibration.json', import.meta.url), 'utf8')).records;
const level = parseLevel(calibration[6].level);
const result = solveBoard(initialBoard(level), { maxStates: 100000, maxMilliseconds: 60000 });
if (result.status !== 'solved') throw new Error('Missing calibration route');
const route = result.route;
const human = evaluateHumanDifficulty(level, route, 5);

test('features distinguish stored branch evidence from reference-route observations', () => {
  const report = analyzeLevelFeatures(level, route, human, 5, { lateProbe: false });
  assert.equal(report.late.status, 'not-requested');
  assert.ok(report.tags.includes('small-board-planning'));
  assert.ok(report.tags.includes('space-tight-route'));
  assert.equal(report.evidence.find(item => item.tag === 'space-tight-route')!.scope, 'reference-route');
  assert.deepEqual(report.humanSamples, human.decisions);
  assert.equal(report.tags.length, new Set(report.tags).size);
  for (const item of report.route.reuse) assert.ok(item.colors.length > 1);
});

test('structure and corresponding route tags survive bottle and color renaming', () => {
  const rename = (color: string) => `c${level.colors.indexOf(color)}`;
  const renamed = parseLevel({ ...level, id: 'feature-renamed', colors: level.colors.map(rename),
    bottles: [...level.bottles].reverse().map(bottle => ({ ...bottle, layers: bottle.layers.map(rename) })) });
  const mapped = route.map(pour => ({ ...pour, source: level.bottles.length - 1 - pour.source,
    target: level.bottles.length - 1 - pour.target, color: rename(pour.color) }));
  assert.deepEqual(inspectFeatureStructure(renamed), inspectFeatureStructure(level));
  const original = analyzeLevelFeatures(level, route, human, 5, { lateProbe: false });
  const transformed = analyzeLevelFeatures(renamed, mapped, human, 5, { lateProbe: false });
  assert.deepEqual(transformed.tags, original.tags);
  assert.deepEqual(transformed.evidence, original.evidence);
  assert.equal(transformed.primary, original.primary);
});

test('late outcomes have independently matching shortest distances and full witnesses', () => {
  const late = probeLateChoices(level, route, { maxStates: 100000, maxMilliseconds: 60000 });
  assert.equal(late.status, 'complete');
  const root = solveBoard(late.board, { maxStates: 100000, maxMilliseconds: 60000, algorithm: 'astar' });
  assert.equal(root.status, 'solved');
  if (root.status !== 'solved') throw new Error('Missing late root');
  assert.equal(late.remainingShortest, root.route.length);
  assert.ok(late.choices.length > 0);
  for (const choice of late.choices) {
    const next = applyPour(late.board, choice.pour, level.capacity);
    const independently = solveBoard(next, { maxStates: 100000, maxMilliseconds: 60000, algorithm: 'astar' });
    assert.equal(independently.status, choice.outcome);
    if (independently.status === 'solved') {
      assert.equal(choice.regret, 1 + independently.route.length - root.route.length);
      replaySolution(next, choice.continuation!, level.capacity);
    }
  }
});

test('early merge observation begins after opening full bottles into spare space', () => {
  const start = initialBoard(level);
  assert.ok(getLegalPours(start).every(pour => !start[pour.target].length));
  const early = probeEarlyChoices(level, route, { maxStates: 100000, maxMilliseconds: 60000 });
  assert.equal(early.status, 'complete');
  assert.ok(early.moveIndex > 0);
  assert.ok(early.moveIndex <= Math.ceil(route.length / 3));
  assert.ok(early.choices.some(choice => choice.merges));
  for (const choice of early.choices) {
    const next = applyPour(early.board, choice.pour);
    const independent = solveBoard(next, { algorithm: 'astar', maxStates: 100000, maxMilliseconds: 60000 });
    assert.equal(independent.status, choice.outcome);
    if (independent.status === 'solved') assert.equal(choice.regret, 1 + independent.route.length - early.remainingShortest!);
  }
});

test('partial transfers are measured from actual capacity, even outside full-bottle mainline starts', () => {
  const partial = parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'partial-feature', capacity: 4,
    colors: ['A', 'B'], bottles: [
      { id: 'one', layers: ['A', 'A'] }, { id: 'two', layers: ['B', 'B', 'A'] },
      { id: 'three', layers: ['B', 'B', 'A'] }, { id: 'spare', layers: [] },
    ] });
  let board = initialBoard(partial);
  const moves = [[0, 1], [0, 2], [1, 3], [2, 3], [1, 2]].map(([source, target]) => {
    const pour = getPour(board, source, target)!;
    board = applyPour(board, pour);
    return pour;
  });
  const measured = inspectFeatureRoute(partial, moves);
  assert.deepEqual(measured.partialTransferMoves, [0]);
  assert.equal(measured.firstCompletionMove, 3);
});

test('budget exhaustion is missing coverage, never a negative late-risk finding', () => {
  const complete = analyzeLevelFeatures(level, route, human, 5);
  const unknown = analyzeLevelFeatures(level, route, human, 5, { lateProbe: { maxStates: 1 } });
  assert.equal(unknown.late.status, 'unknown');
  assert.equal(unknown.primary, 'incomplete-observation');
  assert.ok(!unknown.tags.includes('late-risk'));
  const summary = summarizeFeatureRows([{ number: 1, report: unknown }]);
  assert.equal(summary.lateCoverage.unknown, 1);
  assert.equal(summary.tags.find(tag => tag.tag === 'late-risk')!.denominator, 0);
  assert.equal(featureSimilarity(unknown, complete), featureSimilarity(complete, unknown));
  const unknownEarly = analyzeLevelFeatures(level, route, human, 5, { earlyProbe: { maxStates: 1 }, lateProbe: false });
  assert.equal(unknownEarly.early.status, 'unknown');
  assert.ok(!unknownEarly.tags.includes('early-deception'));
  const earlySummary = summarizeFeatureRows([{ number: 1, report: unknownEarly }]);
  assert.equal(earlySummary.tags.find(tag => tag.tag === 'early-deception')!.denominator, 0);
});

test('coverage suggestions exclude teaching and never turn unknown probes into a confirmed deficit', () => {
  const unknown = analyzeLevelFeatures(level, route, human, 5, { earlyProbe: { maxStates: 1 }, lateProbe: false });
  const rows = Array.from({ length: 53 }, (_, index) => ({ number: index + 1, report: unknown }));
  const targets = recommendFeatureCoverage(rows);
  const early = targets.find(target => target.tag === 'early-deception')!;
  assert.equal(early.eligible, 50);
  assert.equal(early.unknown, 50);
  assert.equal(early.count, 0);
  assert.equal(early.confirmedShortfall, 0);
  assert.equal(early.possibleShortfall, 2);
  assert.equal(early.status, 'incomplete');
  const alternating = targets.find(target => target.tag === 'alternating-start')!;
  assert.equal(alternating.eligible, 0); // C07's proxy score is outside D1/D2.
});

test('feature input rejects stale evidence, illegal routes, and changed capacity', () => {
  assert.throws(() => analyzeLevelFeatures(level, route, { ...human, structureKey: 'stale' }, 5));
  assert.throws(() => inspectFeatureRoute(level, route.slice(0, -1)));
  assert.throws(() => analyzeLevelFeatures(level, [{ ...route[0], amount: 99 }, ...route.slice(1)], human, 5));
  assert.throws(() => probeLateChoices(level, route, { maxMilliseconds: 0 }));
});

test('distribution uses exclusive primary counts and preserves overlapping tags', () => {
  const report = analyzeLevelFeatures(level, route, human, 5, { lateProbe: false });
  const distribution = buildFeatureDistribution([{ number: 57, report }]);
  assert.equal(distribution.whole.primary.reduce((sum, type) => sum + type.count, 0), 1);
  assert.ok(distribution.whole.tags.reduce((sum, tag) => sum + tag.count, 0) > 1);
  assert.equal(distribution.stages[0].stage, 2);
  assert.equal(distribution.waves[0].wave, 6);
  assert.equal(distribution.adjacency.pairs, 0);
  assert.throws(() => buildFeatureDistribution([{ number: 1, report }, { number: 2, report }]));
  assert.throws(() => buildFeatureDistribution([{ number: 1.5, report }]));
});
