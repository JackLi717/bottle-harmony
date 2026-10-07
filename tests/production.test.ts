import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadCalibrationSamples } from '../src/game/calibration.ts';
import { decodeCatalog } from '../src/game/catalog.ts';
import { evaluateDifficulty, DEPTH_POLICIES } from '../src/game/difficulty.ts';
import { evaluateLoad, INTERNAL_GRADES } from '../src/game/difficultyLoad.ts';
import { makeCandidate, structureKey } from '../src/game/generation.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { createProductionPlan, productionSummary } from '../src/game/productionPlan.ts';
import { applyPour, isSolved } from '../src/game/rules.ts';
import { replaySolution } from '../src/game/solver.ts';

const samples = loadCalibrationSamples(readFileSync(new URL('../assets/levels/calibration.json', import.meta.url), 'utf8'));

test('fine grading retains the existing tiers, checks lower policies, and distinguishes equal-operation samples', () => {
  for (const sample of samples) {
    const report = evaluateLoad(sample.content.level), evidence = report.evidence;
    assert.equal(evidence.status, 'rated');
    assert.equal(evidence.tier, evaluateDifficulty(sample.content.level).tier);
    assert.equal(evidence.rank, evidence.policies.length);
    assert.equal(evidence.tier, INTERNAL_GRADES[evidence.rank! - 1].tier);
    assert.ok(evidence.policies.slice(0, -1).every(policy => policy.status === 'failed'));
    for (const policy of evidence.policies) {
      let board = initialBoard(sample.content.level);
      for (const move of policy.witness) board = applyPour(board, move);
      assert.equal(isSolved(board), policy.status === 'passed');
    }
    replaySolution(initialBoard(sample.content.level), evidence.referenceSolution);
    assert.ok(report.score!.total >= (evidence.rank! - 1) * 1000 && report.score!.total < evidence.rank! * 1000);
  }
  const c06 = evaluateLoad(samples[5].content.level), c07 = evaluateLoad(samples[6].content.level);
  assert.equal(c06.evidence.metrics.shortestMoves, c07.evidence.metrics.shortestMoves);
  assert.equal(c06.evidence.rank, 1); assert.equal(c07.evidence.rank, 5);
  assert.ok(c06.score!.total < c07.score!.total);
  assert.equal(c07.evidence.policies.at(-1)!.lookahead, 4);
});

test('decision load is deterministic and invariant to bottle order, color renaming and color-list ordering', () => {
  for (const index of [0, 4, 6, 7]) {
    const level = samples[index].content.level, before = JSON.stringify(level);
    const original = evaluateLoad(level);
    assert.deepEqual(evaluateLoad(level), original);
    const names = new Map(level.colors.map((color, i) => [color, `renamed-${i}`]));
    const equivalent = parseLevel({ ...level, colors: [...level.colors].reverse().map(color => names.get(color)),
      bottles: [...level.bottles].reverse().map(bottle => ({ ...bottle, layers: bottle.layers.map(color => names.get(color)) })) });
    const renamed = evaluateLoad(equivalent);
    assert.equal(renamed.evidence.rank, original.evidence.rank);
    assert.deepEqual(renamed.evidence.decisionLoad, original.evidence.decisionLoad);
    assert.deepEqual(renamed.score, original.score);
    assert.equal(JSON.stringify(level), before);
  }
});

test('unknown fine depth has no rank or score even when the original D4 classification is proven', () => {
  const level = samples[6].content.level, baseline = evaluateDifficulty(level);
  const report = evaluateLoad(level, { maxWork: baseline.work });
  assert.equal(report.evidence.status, 'unknown'); assert.equal(report.evidence.rank, null); assert.equal(report.score, null);
  assert.equal(report.evidence.policies.at(-1)!.status, 'unknown');
  assert.equal(report.evidence.policies.at(-1)!.tier, 'P4');
  const unsolvable = makeCandidate(0, 0, { colors: ['a', 'b', 'c', 'd'], emptyBottles: 1, minSolutionMoves: 1, maxSolutionMoves: 256 });
  assert.equal(evaluateLoad(unsolvable).evidence.status, 'unsolvable');
  assert.equal(evaluateLoad(unsolvable).score, null);
  assert.equal(DEPTH_POLICIES.length + 1, INTERNAL_GRADES.length);
});

test('D4 six- and eight-stage grades retain replayable lower-policy counterexamples and ordinal score separation', () => {
  const catalog = decodeCatalog(readFileSync(new URL('../assets/levels/starter-catalog.json', import.meta.url), 'utf8'));
  const results = ['g-v1-013528bb-3-4c-1e', 'g-v1-013528fa-0-4c-1e'].map(id => {
    const level = catalog.entries.find(entry => entry.content.level.id === id)!.content.level;
    const report = evaluateLoad(level);
    for (const policy of report.evidence.policies) {
      let board = initialBoard(level);
      for (const move of policy.witness) board = applyPour(board, move);
      assert.equal(isSolved(board), policy.status === 'passed');
    }
    assert.ok(report.evidence.policies.slice(0, -1).every(policy => policy.status === 'failed'));
    return report;
  });
  assert.deepEqual(results.map(report => report.evidence.rank), [6, 7]);
  assert.deepEqual(results.map(report => report.evidence.policies.at(-1)!.lookahead), [6, 8]);
  assert.ok(results[0].score!.total < results[1].score!.total);
});

test('the 1000-slot ramp has 100 local challenges and soft size guidance', () => {
  const slots = createProductionPlan(), summary = productionSummary(slots);
  assert.equal(slots.length, 1000);
  assert.equal(summary.total, 1000);
  assert.equal(summary.ordinary, 900);
  assert.equal(summary.challenges, 100);
  assert.equal(summary.stages.length, 20);
  for (const [index, slot] of slots.entries()) {
    assert.equal(slot.number, index + 1);
    assert.equal(slot.stage, Math.floor(index / 50) + 1);
    assert.equal(slot.wave, Math.floor(index / 10) + 1);
    assert.equal(slot.role, index % 10 === 9 ? 'challenge' : 'ordinary');
    assert.equal(slot.maxSolutionMoves, 60);
    if (slot.role === 'challenge') {
      assert.equal(slot.preferredColorsMinimum, null);
      assert.equal(slot.preferredColorsMaximum, null);
    } else {
      assert.ok(slot.preferredColorsMinimum! >= 2);
      assert.ok(slot.preferredColorsMaximum! <= 11);
      assert.ok(slot.preferredColorsMinimum! <= slot.preferredColorsMaximum!);
    }
  }
  assert.deepEqual(createProductionPlan(), slots);
  assert.ok(Object.isFrozen(slots[999]));
});

test('canonical labeling exactly matches the previous permutation definition on small boards', () => {
  function brute(level: ReturnType<typeof parseLevel>): string {
    let best: string | null = null;
    function permutations(prefix: number[], remaining: number[]) {
      if (remaining.length) { for (const color of remaining) permutations([...prefix, color], remaining.filter(c => c !== color)); return; }
      const key = level.bottles.map(bottle => bottle.layers.map(color => String.fromCharCode(65 + prefix[level.colors.indexOf(color)])).join('')).sort().join('/');
      if (best === null || key < best) best = key;
    }
    permutations([], level.colors.map((_, i) => i));
    return `water-sort:4:${level.colors.length}:${level.bottles.length}:${best}`;
  }
  for (let colors = 2; colors <= 5; colors++) for (let seed = 0; seed < 30; seed++) {
    const level = makeCandidate(seed, seed % 7, { colors: Array.from({ length: colors }, (_, i) => `c-${i}`), emptyBottles: seed % 2 ? 1 : 2, minSolutionMoves: 1, maxSolutionMoves: 256 });
    assert.equal(structureKey(level), brute(level));
  }
});

test('eleven-color structural deduplication handles symmetric and mixed boards under renamed/reordered input', () => {
  const colors = Array.from({ length: 11 }, (_, i) => `c-${i}`);
  const layers = colors.flatMap(color => Array<string>(4).fill(color));
  const boards = [layers, layers.map((_, i) => layers[(i * 17 + 3) % 44]),
    colors.flatMap((_, i) => [colors[i], colors[(i + 1) % 11], colors[(i + 2) % 11], colors[(i + 3) % 11]])];
  for (const board of boards) {
    const level = parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'large', capacity: 4, colors,
      bottles: [...colors.map((_, i) => ({ id: `b-${i}`, layers: board.slice(i * 4, i * 4 + 4) })), { id: 'spare', layers: [] }] });
    const names = new Map(colors.map((color, i) => [color, `new-${10 - i}`]));
    const equivalent = parseLevel({ ...level, colors: [...colors].reverse().map(color => names.get(color)),
      bottles: [...level.bottles].reverse().map(bottle => ({ ...bottle, layers: bottle.layers.map(color => names.get(color)) })) });
    assert.equal(structureKey(level), structureKey(equivalent));
  }
});

test('production CLI recomputes fine evidence, rejects tampering and preserves output on unsuccessful rating', () => {
  const folder = mkdtempSync(join(tmpdir(), 'bottle-production-'));
  const output = join(folder, 'ratings.json'), plan = join(folder, 'plan.json');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/production.ts', ...args], { encoding: 'utf8' });
  try {
    assert.equal(run('plan', '--output', plan).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(plan, 'utf8')).slots, createProductionPlan());
    assert.equal(run('rate', '--require-rated', 'true', '--output', output).status, 0);
    const before = readFileSync(output, 'utf8');
    assert.equal(JSON.parse(before).records.length, 89);
    assert.equal(run('verify', '--report', output).status, 0);
    assert.notEqual(run('rate', '--require-rated', 'true', '--max-work', '1', '--output', output).status, 0);
    assert.equal(readFileSync(output, 'utf8'), before);
    const altered = JSON.parse(before); altered.records[0].score.total++;
    writeFileSync(output, JSON.stringify(altered));
    assert.notEqual(run('verify', '--report', output).status, 0);
    assert.notEqual(run('rate', '--output', 'assets/levels/starter-catalog.json').status, 0);
    assert.notEqual(run('rate', '--max-states', '0', '--output', output).status, 0);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
