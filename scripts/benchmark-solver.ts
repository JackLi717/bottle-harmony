import assert from 'node:assert/strict';
import { cpus, platform } from 'node:os';
import { DEMO_BOARD } from '../src/game/demo.ts';
import { createSolver, replaySolution, type SolveResult } from '../src/game/solver.ts';
import type { Board } from '../src/game/rules.ts';

// Fixed balanced synthetic fixtures, not a generator or published playable content.
function cyclicBoard(count: number): Board {
  const colors = Array.from({ length: count }, (_, i) => `color-${i}`);
  return [...colors.map((_, i) => Array.from({ length: 4 }, (_, j) => colors[(i + j) % count])), [], []];
}
const options = { maxStates: 30000, maxMilliseconds: 250 };
const fixtures = [
  { name: 'two-colors-four-bottles', board: DEMO_BOARD },
  { name: 'four-colors-six-bottles', board: cyclicBoard(4) },
  { name: 'five-colors-seven-bottles', board: cyclicBoard(5) },
  { name: 'eight-colors-ten-bottles-budget-stress', board: cyclicBoard(8) },
];
function run(board: Board) {
  global.gc?.();
  const heapStart = process.memoryUsage().heapUsed;
  let peakSampledHeapDeltaBytes = 0, maxSliceMilliseconds = 0, slices = 0;
  const start = performance.now();
  const task = createSolver(board, options);
  let result: SolveResult | null = null;
  do {
    const sliceStart = performance.now();
    result = task.step(32, 4);
    maxSliceMilliseconds = Math.max(maxSliceMilliseconds, performance.now() - sliceStart);
    peakSampledHeapDeltaBytes = Math.max(peakSampledHeapDeltaBytes, process.memoryUsage().heapUsed - heapStart);
    slices++;
  } while (!result);
  const wallMilliseconds = performance.now() - start;
  if (result.status === 'solved') replaySolution(board, result.route);
  assert.notEqual(result.status, 'invalid');
  return { status: result.status, reason: result.status === 'limitReached' ? result.reason : undefined,
    moves: result.status === 'solved' ? result.route.length : undefined,
    ...result.stats, wallMilliseconds, slices, maxSliceMilliseconds, peakSampledHeapDeltaBytes };
}

const reports = fixtures.map(({ name, board }) => {
  run(board); // Warm the runtime before measuring repeated runs.
  const samples = Array.from({ length: 5 }, () => run(board));
  const times = samples.map(sample => sample.elapsedMilliseconds).sort((a, b) => a - b);
  return { name, medianActiveMilliseconds: times[2], maxActiveMilliseconds: times[4], samples };
});
console.log(JSON.stringify({
  environment: { runtime: process.version, platform: platform(), arch: process.arch, cpu: cpus()[0]?.model },
  note: 'Desktop Node measurements only. Heap is sampled between slices, not native peak memory. Slice times include GC/runtime pauses and are cooperative, not hard deadlines.',
  options, reports,
}, null, 2));
