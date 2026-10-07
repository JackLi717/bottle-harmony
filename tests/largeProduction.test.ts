import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeContentPool } from '../src/game/contentCodec.ts';
import { makeCandidate, parseGenerationConfig, parseGeneratedContent, PRODUCTION_COLORS } from '../src/game/generation.ts';
import { evaluateLoad, type LoadReport } from '../src/game/difficultyLoad.ts';
import { initialBoard } from '../src/game/model.ts';
import { DEMO_BOARD } from '../src/game/demo.ts';
import { createSolver, solveBoard, replaySolution, type SolveResult } from '../src/game/solver.ts';
import { applyPour, isSolved } from '../src/game/rules.ts';

test('production starts conserve four layers per color across all supported large configurations', () => {
  for (let count = 6; count <= 11; count++) for (const emptyBottles of [1, 2] as const) {
    const config = { colors: PRODUCTION_COLORS.slice(0, count), emptyBottles, minSolutionMoves: 1, maxSolutionMoves: 80 };
    if (count + emptyBottles > 12) { assert.throws(() => parseGenerationConfig(config)); continue; }
    for (let seed = 717; seed <= 724; seed++) {
      const a = makeCandidate(seed, 0, config), b = makeCandidate(seed, 0, config);
      assert.deepEqual(a, b);
      assert.equal(a.bottles.length, count + emptyBottles);
      assert.equal(a.bottles.filter(bottle => !bottle.layers.length).length, emptyBottles);
      for (const color of a.colors) assert.equal(initialBoard(a).flat().filter(c => c === color).length, 4);
    }
  }
});

test('A* agrees with BFS shortest distances on four-layer shuffled starts and a proven impossible board', () => {
  const boards = [initialBoard(makeCandidate(0, 0, { colors: PRODUCTION_COLORS.slice(0, 4), emptyBottles: 1, minSolutionMoves: 1, maxSolutionMoves: 80 }))];
  for (let seed = 717; seed < 725; seed++) boards.push(initialBoard(makeCandidate(seed, 0, { colors: PRODUCTION_COLORS.slice(0, 4), emptyBottles: 2, minSolutionMoves: 1, maxSolutionMoves: 80 })));
  for (const board of boards) {
    const a = solveBoard(board, { algorithm: 'astar', maxStates: 100000, maxMilliseconds: 5000 });
    const b = solveBoard(board, { algorithm: 'bfs', maxStates: 100000, maxMilliseconds: 5000 });
    assert.equal(a.status, b.status);
    assert.notEqual(a.status, 'limitReached');
    if (a.status === 'solved' && b.status === 'solved') {
      assert.equal(a.route.length, b.route.length);
      assert.equal(a.shortest, true);
      replaySolution(board, a.route);
    }
  }
});

test('A* slices resume deterministically, detach caller input and keep limits unknown', () => {
  const original = DEMO_BOARD.map(bottle => [...bottle]);
  const task = createSolver(original, { algorithm: 'astar', maxMilliseconds: 5000 });
  original[0][0] = 'mutated';
  let result: SolveResult | null = null, slices = 0;
  do { result = task.step(1, 0.05); slices++; } while (!result && slices < 10000);
  assert.ok(result?.status === 'solved');
  const sync = solveBoard(DEMO_BOARD, { algorithm: 'astar' });
  assert.ok(sync.status === 'solved');
  assert.deepEqual(result.route, sync.route);
  assert.ok(slices > 1);
  replaySolution(DEMO_BOARD, result.route);
  for (const [options, reason] of [[{ maxStates: 1 }, 'states'], [{ maxMilliseconds: Number.MIN_VALUE }, 'time']] as const) {
    const limited = solveBoard(DEMO_BOARD, { algorithm: 'astar', ...options });
    assert.ok(limited.status === 'limitReached'); assert.equal(limited.reason, reason);
    assert.equal('route' in limited, false);
  }
  const cancelled = createSolver(DEMO_BOARD, { algorithm: 'astar' });
  cancelled.step(1);
  assert.equal(cancelled.cancel().status, 'limitReached');
  assert.equal(cancelled.step(), cancelled.cancel());
  assert.equal(solveBoard([[], []], { algorithm: 'astar' }).status, 'invalid');
  assert.equal(solveBoard(DEMO_BOARD, { algorithm: 'astar', maxStates: 0 }).status, 'invalid');
});

test('large-board search returns a fully replayable shortest route through twelve bottles', () => {
  // Cyclic diagnostic fixture, not an accepted content record.
  const colors = PRODUCTION_COLORS.slice(0, 10);
  const board = [...colors.map((_, i) => Array.from({ length: 4 }, (_, j) => colors[(i + j) % colors.length])), [], []];
  const result = solveBoard(board, { maxStates: 100000, maxMilliseconds: 5000 });
  assert.ok(result.status === 'solved');
  assert.ok(isSolved(replaySolution(board, result.route)));
  assert.equal(result.shortest, true);
});

test('six-color fixture evidence independently recomputes light, thinking and true rank-eight planning', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/production-depth.json', import.meta.url), 'utf8'));
  const ranks: number[] = [];
  for (const record of fixture.records) {
    const content = parseGeneratedContent(record.content), expected = record.rating as LoadReport;
    const report = evaluateLoad(content.level);
    assert.deepEqual(report, expected);
    ranks.push(report.evidence.rank!);
    replaySolution(initialBoard(content.level), report.evidence.referenceSolution);
    for (const policy of report.evidence.policies) {
      let board = initialBoard(content.level);
      for (const move of policy.witness) board = applyPour(board, move);
      assert.equal(isSolved(board), policy.status === 'passed');
    }
    if (report.evidence.rank === 8) {
      assert.equal(content.origin.config.mixing, 'diverse');
      assert.equal(report.evidence.policies.length, 8);
      assert.ok(report.evidence.policies.slice(0, 7).every(p => p.status === 'failed'));
      assert.equal(report.evidence.metrics.shortestMoves, 20);
      assert.equal(report.score!.total, 7020);
      const unknown = evaluateLoad(content.level, { maxWork: 1000 });
      assert.equal(unknown.evidence.status, 'unknown');
      assert.equal(unknown.evidence.rank, null);
      assert.equal(unknown.score, null);
    }
  }
  assert.deepEqual(ranks, [1, 3, 8]);
});

test('CLI produces verified large-color content and rejects thirteen bottles before replacing output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bottle-harmony-large-'));
  const output = join(directory, 'pool.json');
  const run = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/levels.ts', 'generate', ...args, '--output', output], { encoding: 'utf8' });
  try {
    writeFileSync(output, 'keep existing output');
    const invalid = run('--colors', '11', '--empty-bottles', '2', '--count', '1');
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /must not exceed 12/);
    assert.equal(readFileSync(output, 'utf8'), 'keep existing output');
    const generated = run('--seed', '718', '--colors', '6', '--count', '1', '--min-moves', '1');
    assert.equal(generated.status, 0, generated.stderr);
    const contents = decodeContentPool(readFileSync(output, 'utf8'));
    assert.equal(contents[0].level.colors.length, 6);
    replaySolution(initialBoard(contents[0].level), contents[0].solution);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
