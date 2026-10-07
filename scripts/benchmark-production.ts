import assert from 'node:assert/strict';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { cpus, platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { evaluateLoad, type LoadReport } from '../src/game/difficultyLoad.ts';
import { makeCandidate, PRODUCTION_COLORS, hasDiverseStart } from '../src/game/generation.ts';
import { initialBoard } from '../src/game/model.ts';
import { createSolver, replaySolution, type SolveResult } from '../src/game/solver.ts';

const values = new Map<string, string>();
const allowed = ['algorithm', 'max-states', 'max-ms', 'max-work', 'rating-ms', 'output'];
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i].slice(2), value = process.argv[i + 1];
  if (!process.argv[i].startsWith('--') || !allowed.includes(name) || !value || values.has(name)) throw new Error('Invalid benchmark argument');
  values.set(name, value);
}
function integer(name: string, fallback: number, maximum: number) {
  const text = values.get(name) ?? String(fallback);
  if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > maximum) throw new Error(`Invalid --${name}`);
  return Number(text);
}
const algorithm = values.get('algorithm') ?? 'astar';
if (algorithm !== 'bfs' && algorithm !== 'astar') throw new Error('Algorithm must be bfs or astar');
const options = { algorithm: algorithm as 'bfs' | 'astar', maxStates: integer('max-states', 30000, 1000000), maxMilliseconds: integer('max-ms', 750, 60000) };
const ratingOptions = { maxSolveStates: options.maxStates, maxWork: integer('max-work', 50000, 10000000), maxMilliseconds: integer('rating-ms', 750, 60000) };
const output = resolve(values.get('output') ?? `builds/production-benchmark-${algorithm}.json`);
if (!output.startsWith(`${resolve('builds')}/`) || !output.endsWith('.json')) throw new Error('Benchmark output must be a JSON file inside builds/');
const seeds = [717, 718, 719, 720, 721, 722, 723, 724];
const records: { seed: number; candidateIndex: number; colors: number; emptyBottles: number; bottles: number; levelId: string; diverseStart: boolean;
  solve: SolveResult & { replayVerified: boolean; wallMilliseconds: number; peakSampledHeapDeltaBytes: number; maximumSliceMilliseconds: number };
  rating: (LoadReport & { wallMilliseconds: number }) | null }[] = [];
// Fixed balanced shuffled starts are diagnostics, not accepted playable levels.
for (let count = 6; count <= 11; count++) for (const empty of [1, 2] as const) {
  if (count + empty > 12) continue;
  for (const seed of seeds) {
    const level = makeCandidate(seed, 0, { colors: PRODUCTION_COLORS.slice(0, count), emptyBottles: empty, minSolutionMoves: 1, maxSolutionMoves: 256 });
    const board = initialBoard(level);
    global.gc?.();
    const heapStart = process.memoryUsage().heapUsed, start = performance.now();
    let peakSampledHeapDeltaBytes = 0, maximumSliceMilliseconds = 0;
    const task = createSolver(board, options);
    let result: SolveResult | null = null;
    do {
      const sliceStart = performance.now();
      result = task.step(64, 4);
      maximumSliceMilliseconds = Math.max(maximumSliceMilliseconds, performance.now() - sliceStart);
      peakSampledHeapDeltaBytes = Math.max(peakSampledHeapDeltaBytes, process.memoryUsage().heapUsed - heapStart);
    } while (!result);
    assert.notEqual(result.status, 'invalid');
    const solveWallMilliseconds = performance.now() - start;
    if (result.status === 'solved') replaySolution(board, result.route);
    const ratingStart = performance.now();
    const rating = result.status === 'solved' ? evaluateLoad(level, ratingOptions) : null;
    if (rating?.evidence.referenceSolution) replaySolution(board, rating.evidence.referenceSolution);
    records.push({ seed, candidateIndex: 0, colors: count, emptyBottles: empty, bottles: board.length, levelId: level.id,
      diverseStart: hasDiverseStart(level), solve: { ...result, replayVerified: result.status === 'solved', wallMilliseconds: solveWallMilliseconds, peakSampledHeapDeltaBytes, maximumSliceMilliseconds },
      rating: rating ? { ...rating, wallMilliseconds: performance.now() - ratingStart } : null });
  }
  console.log(`${algorithm}: ${count} colors / ${empty} spare(s), ${records.length}/88 complete`);
}
const summary = { fixtures: records.length, solved: records.filter(r => r.solve.status === 'solved').length,
  unsolvable: records.filter(r => r.solve.status === 'unsolvable').length,
  unknown: records.filter(r => r.solve.status === 'limitReached').length,
  rated: records.filter(r => r.rating?.score !== null && r.rating !== null).length,
  rankCounts: Array.from({ length: 8 }, (_, i) => records.filter(r => r.rating?.evidence.rank === i + 1).length),
  solveActiveMilliseconds: records.reduce((sum, r) => sum + r.solve.stats.elapsedMilliseconds, 0),
  maximumSampledHeapDeltaBytes: Math.max(...records.map(r => r.solve.peakSampledHeapDeltaBytes)) };
const report = { format: 'bottle-harmony-production-benchmark', version: 1, environment: { runtime: process.version, platform: platform(), arch: process.arch, cpu: cpus()[0]?.model },
  note: 'Desktop diagnostic fixtures only, never content acceptance or mobile measurements. Heap sampled between slices. Reopened A* labels count toward the state allocation budget. Rating uses the default solver (A* above five colors), independently replays its route and may remain unknown.',
  options, ratingOptions, summary, records };
await mkdir(dirname(output), { recursive: true });
const temporary = `${output}.${process.pid}.tmp`;
try {
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  assert.equal(JSON.parse(await readFile(temporary, 'utf8')).records.length, 88);
  await rename(temporary, output);
} finally { await unlink(temporary).catch(() => {}); }
console.log(JSON.stringify({ output, ...summary }, null, 2));
