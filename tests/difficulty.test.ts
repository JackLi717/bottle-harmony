import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadCalibrationSamples } from '../src/game/calibration.ts';
import { DEMO_LEVEL } from '../src/game/demo.ts';
import { colorRuns, evaluateDifficulty } from '../src/game/difficulty.ts';
import { decodeDifficultyPool, encodeDifficultyPool } from '../src/game/difficultyCodec.ts';
import { makeCandidate } from '../src/game/generation.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { applyPour, isSolved } from '../src/game/rules.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';

const samples = loadCalibrationSamples(readFileSync(new URL('../assets/levels/calibration.json', import.meta.url), 'utf8'));
const levels = [...samples.map(sample => sample.content.level), DEMO_LEVEL];
const reports = levels.map(level => evaluateDifficulty(level));

test('all four planning layers have replayable pass and lower-policy counterexample evidence', () => {
  assert.deepEqual(reports.slice(0, 8).map(report => report.tier), ['D1', 'D1', 'D1', 'D1', 'D3', 'D1', 'D4', 'D2']);
  for (const [index, report] of reports.entries()) {
    const level = levels[index], start = initialBoard(level);
    assert.equal(report.status, 'rated');
    replaySolution(start, report.referenceSolution, level.capacity);
    assert.equal(report.metrics.shortestMoves, samples[index]?.content.solution.length ?? 7);
    for (const policy of report.policies) {
      let board = start;
      for (const pour of policy.witness) {
        const next = applyPour(board, pour, level.capacity);
        assert.ok(colorRuns(next) <= colorRuns(board));
        board = next;
      }
      assert.equal(isSolved(board, level.capacity), policy.status === 'passed');
      assert.equal(policy.stallReason === null, policy.status === 'passed');
    }
    assert.ok(report.policies.slice(0, -1).every(policy => policy.status === 'failed'));
    assert.equal(report.policies.at(-1)!.status, 'passed');
  }
  assert.equal(reports[4].policies.at(-1)!.lookahead, 3);
  assert.equal(reports[6].policies.at(-1)!.tier, 'P4');
});

test('operation count is distinct from planning, and adding spare space preserves a valid completion', () => {
  const c06 = reports[5], c07 = reports[6];
  assert.equal(c06.metrics.shortestMoves, c07.metrics.shortestMoves);
  assert.equal(c06.tier, 'D1'); assert.equal(c07.tier, 'D4');
  assert.equal(c06.metrics.spareColorRatio, 0.5); assert.equal(c07.metrics.spareColorRatio, 0.25);
  const level = parseLevel({ ...levels[6], bottles: [...levels[6].bottles, { id: 'extra-spare', layers: [] }] });
  const report = evaluateDifficulty(level);
  assert.equal(report.status, 'rated'); assert.equal(report.tier, 'D2');
  assert.equal(report.metrics.spareColorRatio, 0.5);
  replaySolution(initialBoard(level), report.referenceSolution);
  assert.notEqual(report.structureKey, c07.structureKey);
});

test('ratings are deterministic, input isolated, and invariant to bottle order and color names', () => {
  for (const index of [0, 4, 6, 7]) {
    const level = levels[index], before = JSON.stringify(level);
    assert.deepEqual(evaluateDifficulty(level), reports[index]);
    assert.equal(JSON.stringify(level), before);
    const renamed = new Map(level.colors.map((color, i) => [color, `test-color-${i}`]));
    const equivalent = parseLevel({ ...level, colors: level.colors.map(color => renamed.get(color)), bottles: [...level.bottles].reverse().map(bottle => ({ ...bottle, layers: bottle.layers.map(color => renamed.get(color)) })) });
    const other = evaluateDifficulty(equivalent);
    assert.equal(other.tier, reports[index].tier);
    assert.equal(other.structureKey, reports[index].structureKey);
    assert.deepEqual(other.policies.map(p => [p.tier, p.status, p.lookahead]), reports[index].policies.map(p => [p.tier, p.status, p.lookahead]));
    replaySolution(initialBoard(equivalent), other.policies.at(-1)!.witness);
  }
});

test('budget exhaustion is unknown, while exhaustive unsolvability receives no difficulty tier', () => {
  for (const options of [{ maxSolveStates: 1 }, { maxWork: 1 }, { maxMilliseconds: 0.000001 }]) {
    const report = evaluateDifficulty(levels[6], options);
    assert.equal(report.status, 'unknown'); assert.equal(report.tier, null);
    assert.ok(report.reason);
    decodeDifficultyPool(encodeDifficultyPool([report], [levels[6]]), [levels[6]]);
  }
  const level = makeCandidate(0, 0, { colors: ['jade', 'coral', 'amber', 'sky'], emptyBottles: 1, minSolutionMoves: 1, maxSolutionMoves: 256 });
  assert.equal(solveBoard(initialBoard(level)).status, 'unsolvable');
  const report = evaluateDifficulty(level);
  assert.equal(report.status, 'unsolvable'); assert.equal(report.tier, null);
  assert.equal(report.metrics.shortestMoves, null);
  decodeDifficultyPool(encodeDifficultyPool([report], [level]), [level]);
  for (const options of [{ maxWork: 0 }, { maxSolveStates: 0 }, { maxMilliseconds: Infinity }]) assert.throws(() => evaluateDifficulty(level, options));
});

test('bundled evidence matches recomputation and rejects stale layouts, false tiers, routes and metrics', () => {
  const json = readFileSync(new URL('../assets/levels/calibration-difficulty.json', import.meta.url), 'utf8');
  const loaded = decodeDifficultyPool(json, levels);
  assert.deepEqual(loaded, reports);
  assert.ok(Object.isFrozen(loaded[6].policies[0].witness));
  for (const mutate of [
    (pool: any) => { pool.records[6].tier = 'D1'; },
    (pool: any) => { pool.records[6].structureKey = 'stale'; },
    (pool: any) => { pool.records[6].referenceSolution[0].amount = 8; },
    (pool: any) => { pool.records[6].metrics.minimumLegalChoicesOnRoute++; },
    (pool: any) => { pool.records[6].policies.splice(1, 1); },
    (pool: any) => { pool.records[6].policies[0].status = 'passed'; },
    (pool: any) => { pool.records[6].levelId = pool.records[0].levelId; },
    (pool: any) => { pool.records.pop(); },
  ]) {
    const pool = JSON.parse(json); mutate(pool);
    assert.throws(() => decodeDifficultyPool(JSON.stringify(pool), levels));
  }
});

test('offline command verifies evidence, preserves output on failure and never overwrites source levels', () => {
  const folder = mkdtempSync(join(tmpdir(), 'bottle-difficulty-'));
  const output = join(folder, 'report.json');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/difficulty.ts', '--include-demo', ...args], { encoding: 'utf8' });
  try {
    assert.equal(run('--require-rated', '--output', output).status, 0);
    const before = readFileSync(output, 'utf8');
    assert.equal(run('--output', output).status, 0);
    assert.equal(readFileSync(output, 'utf8'), before);
    assert.equal(run('--verify', output).status, 0);
    assert.notEqual(run('--require-rated', '--max-work', '1', '--output', output).status, 0);
    assert.equal(readFileSync(output, 'utf8'), before);
    // An otherwise well-formed statistic must also match offline recomputation.
    const pool = JSON.parse(before); pool.records[6].policies[0].checkedStates++;
    writeFileSync(output, JSON.stringify(pool));
    assert.notEqual(run('--verify', output).status, 0);
    assert.notEqual(run('--output', 'assets/levels/calibration.json').status, 0);
    assert.notEqual(run('--max-work', 'NaN', '--output', output).status, 0);
    assert.equal(run('--max-work', '1', '--output', output).status, 0);
    assert.ok(decodeDifficultyPool(readFileSync(output, 'utf8'), levels).every(report => report.status === 'unknown' && report.tier === null));
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
