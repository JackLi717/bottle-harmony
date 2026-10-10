import { createEngineRestoreTask, createEngineSession, listEngineActions, moveEngineSession, saveEngineSession, transitionEngine, undoEngineSession } from './engine.ts';
import { ENGINE_EXAMPLES, engineFixture } from './engineExamples.ts';
import { createEngineHintTask, createEngineProofSearch, replayEngineRoute } from './engineSearch.ts';
import { createSolver, replaySolution } from './solver.ts';

const now = () => performance.now();
export function measurement(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return { count: sorted.length, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) ?? 0 };
}
export async function benchmarkEngineHints(yieldControl: () => Promise<void>, cancelled: () => boolean = () => false) {
  const reports = [];
  for (const example of ENGINE_EXAMPLES) {
    const samples = [];
    for (let repeat = 0; repeat < 4; repeat++) {
      if (cancelled()) throw new Error('Hint benchmark cancelled');
      const session = createEngineSession(example, 'benchmark-hint'), start = now();
      const task = createEngineHintTask(session);
      const setupMilliseconds = now() - start, slices: number[] = [];
      let outcome;
      do {
        if (cancelled()) { task.cancel(); throw new Error('Hint benchmark cancelled'); }
        const begin = now(); outcome = task.step(); slices.push(now() - begin);
        if (!outcome) await yieldControl();
      } while (!outcome);
      if (outcome.status === 'hint' && !moveEngineSession(session, outcome.action, outcome.revision)) throw new Error('Device hint is stale or illegal');
      if (repeat) samples.push({ status: outcome.status, reason: outcome.status === 'unknown' ? outcome.reason : null,
        setupMilliseconds, wallMilliseconds: now() - start, slices: measurement(slices) });
      await yieldControl();
    }
    reports.push({ id: example.id, samples });
  }
  return reports;
}
/** Balanced diagnostic boards, including the public maximum of twelve bottles. */
export async function benchmarkClassicSolver(yieldControl: () => Promise<void>, cancelled: () => boolean = () => false) {
  const reports = [];
  for (const colors of [4, 6, 8, 10]) {
    const board = [...Array.from({ length: colors }, (_, i) => Array.from({ length: 4 }, (_, j) => `c${(i + j) % colors}`)), [], []];
    const samples = [];
    for (let repeat = 0; repeat < 4; repeat++) {
      const start = now(), task = createSolver(board, { maxStates: 30000, maxMilliseconds: 250 });
      const slices: number[] = []; let outcome;
      do {
        if (cancelled()) { task.cancel(); throw new Error('Classic benchmark cancelled'); }
        const begin = now(); outcome = task.step(32, 4); slices.push(now() - begin);
        if (!outcome) await yieldControl();
      } while (!outcome);
      if (outcome.status === 'invalid') throw new Error('Invalid classic benchmark board');
      if (outcome.status === 'solved') replaySolution(board, outcome.route);
      if (repeat) samples.push({ status: outcome.status, reason: outcome.status === 'limitReached' ? outcome.reason : null,
        stats: outcome.stats, wallMilliseconds: now() - start, slices: measurement(slices) });
      await yieldControl();
    }
    reports.push({ colors, bottles: board.length, samples });
  }
  return reports;
}
/** Same workload on Node and Hermes. Wall timings include GC; budgets are cooperative. */
export async function benchmarkEngine(yieldControl: () => Promise<void>, cancelled: () => boolean = () => false) {
  const check = () => { if (cancelled()) throw new Error('Benchmark cancelled'); };
  const puzzle = engineFixture('benchmark-history', [['coral'], [], ['jade', 'jade', 'jade', 'jade']], {
    goal: { type: 'collect', container: 'b1', color: 'jade', count: 4, exact: true, exclusive: true },
  });
  let current = createEngineSession(puzzle, 'benchmark');
  const moveTimes: number[] = [], undoTimes: number[] = [], kernelTimes: number[] = [];
  for (let i = 0; i < 4200; i++) {
    check(); const action = { type: 'transfer' as const, source: `b${i % 2}`, target: `b${1 - i % 2}` };
    let begin = now(); const result = transitionEngine(current.runtime, current.state, current.known, action); kernelTimes.push(now() - begin);
    if (!result.accepted) throw new Error('Benchmark kernel rejected route');
    begin = now(); const moved = moveEngineSession(current, action); moveTimes.push(now() - begin);
    if (!moved) throw new Error('Benchmark session rejected route'); current = moved.session;
    begin = now(); undoEngineSession(current); undoTimes.push(now() - begin);
    if (i % 64 === 63) await yieldControl();
  }
  const saved = saveEngineSession(current), restore = createEngineRestoreTask(puzzle, saved), restoreSlices: number[] = [];
  let restored; const restoreBegin = now();
  do { check(); const begin = now(); restored = restore.step(64, 4); restoreSlices.push(now() - begin); if (!restored) await yieldControl(); } while (!restored);
  const restoreWall = now() - restoreBegin;
  if (JSON.stringify(saveEngineSession(restored)) !== JSON.stringify(saved)) throw new Error('Benchmark restore mismatch');
  const searches = [], proofSliceMilliseconds: number[] = [];
  for (const example of ENGINE_EXAMPLES) {
    const samples = [];
    for (let repeat = 0; repeat < 4; repeat++) {
      check(); const session = createEngineSession(example, 'benchmark-search');
      const task = createEngineProofSearch(session.runtime, session, { maxMilliseconds: 250 });
      const sliceTimes: number[] = [], begin = now(); let outcome;
      do { check(); const slice = now(); outcome = task.step(32, 4); sliceTimes.push(now() - slice); if (!outcome) await yieldControl(); } while (!outcome);
      const wallMilliseconds = now() - begin;
      if (outcome.status === 'solved') replayEngineRoute(session.runtime, session, outcome.route);
      if (repeat) {
        proofSliceMilliseconds.push(...sliceTimes);
        samples.push({ status: outcome.status, stats: outcome.stats, wallMilliseconds, slices: measurement(sliceTimes),
          sliceMilliseconds: sliceTimes, moves: outcome.status === 'solved' ? outcome.route.length : null });
      }
      await yieldControl();
    }
    searches.push({ id: example.id, samples });
  }
  // Independent action enumeration is useful when comparing runtimes and budget regressions.
  const legalActions = listEngineActions(current.runtime, current.state, current.known).length;
  return { format: 'engine-benchmark-v1', note: 'Milliseconds. Cooperative slices can exceed targets during GC/runtime pauses. Search memory is an accounting estimate, not measured heap. JS frame timing and native rendering/storage require separate device measurements.',
    operations: { kernel: measurement(kernelTimes.slice(100)), move: measurement(moveTimes.slice(100)), undo: measurement(undoTimes.slice(100)) },
    history: { depth: current.history.length, offset: current.offset, characters: current.historyBytes, legalActions, restoreWallMilliseconds: restoreWall, restoreSlices: measurement(restoreSlices) }, proofSlices: measurement(proofSliceMilliseconds), searches };
}
