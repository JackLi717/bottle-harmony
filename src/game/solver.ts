import { validateBoard } from './model.ts';
import { applyPour, CAPACITY, getPour, isSolved, type Board, type Pour } from './rules.ts';

export type SolverOptions = { capacity?: number; maxStates?: number; maxMilliseconds?: number };
export type SearchStats = {
  readonly visitedStates: number;
  readonly expandedStates: number;
  readonly generatedMoves: number;
  readonly peakFrontier: number;
  /** Active search time; excludes pauses between incremental steps. */
  readonly elapsedMilliseconds: number;
};
export type SolveResult =
  | { status: 'solved'; route: readonly Pour[]; shortest: true; stats: SearchStats }
  | { status: 'unsolvable'; stats: SearchStats }
  | { status: 'limitReached'; reason: 'states' | 'time' | 'cancelled'; stats: SearchStats }
  | { status: 'invalid'; issues: readonly string[]; stats: SearchStats };

/** A native implementation can replace this interface without changing game/session data. */
export interface SolverTask {
  step(maxExpansions?: number, sliceMilliseconds?: number): SolveResult | null;
  cancel(): SolveResult;
}
type SearchNode = { board: Board | null; parent: number; pour: Pour | null; nextPair: number };
const now = () => performance.now();

/** BFS with uniform-bottle symmetry. Keep actual boards/predecessors for real-index replay. */
export function createSolver(input: Board, options: SolverOptions = {}): SolverTask {
  const capacity = options.capacity ?? CAPACITY;
  const maxStates = options.maxStates ?? 30000;
  const maxMilliseconds = options.maxMilliseconds ?? 250;
  const issues = validateBoard(input, capacity);
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 1000000) issues.push('maxStates must be an integer from 1 to 1000000');
  if (!Number.isFinite(maxMilliseconds) || maxMilliseconds <= 0 || maxMilliseconds > 60000) issues.push('maxMilliseconds must be positive and at most 60000');
  let visitedStates = 0, expandedStates = 0, generatedMoves = 0, peakFrontier = 0, elapsed = 0;
  let cursor = 0;
  let result: SolveResult | null = null;
  const nodes: SearchNode[] = [];
  const seen = new Set<string>();
  const colorCodes = new Map<string, string>();
  const stats = (): SearchStats => ({ visitedStates, expandedStates, generatedMoves, peakFrontier, elapsedMilliseconds: elapsed });
  // Only ordinary, movable, equal-capacity bottles are interchangeable.
  const key = (board: Board) => board.map(bottle => bottle.map(color => colorCodes.get(color)!).join('')).sort().join('|');
  if (issues.length) result = { status: 'invalid', issues, stats: stats() };
  else {
    const board = input.map(bottle => [...bottle]);
    for (const color of board.flat()) if (!colorCodes.has(color)) colorCodes.set(color, String.fromCharCode(65 + colorCodes.size));
    nodes.push({ board, parent: -1, pour: null, nextPair: 0 });
    seen.add(key(board));
    visitedStates = peakFrontier = 1;
  }
  function release() { nodes.length = 0; seen.clear(); colorCodes.clear(); }
  function cancel(): SolveResult {
    if (!result) { result = { status: 'limitReached', reason: 'cancelled', stats: stats() }; release(); }
    return result;
  }
  return {
    cancel,
    step(maxExpansions = 64, sliceMilliseconds = 4) {
      if (result) return result;
      if (!Number.isInteger(maxExpansions) || maxExpansions < 1 || !Number.isFinite(sliceMilliseconds) || sliceMilliseconds <= 0) throw new Error('Invalid search slice');
      const start = now();
      const targetExpanded = expandedStates + maxExpansions;
      const endSlice = () => { elapsed += now() - start; return null; };
      const finish = (outcome: Omit<Extract<SolveResult, { status: 'solved' }>, 'stats'> | { status: 'unsolvable' } | { status: 'limitReached'; reason: 'states' | 'time' }): SolveResult => {
        elapsed += now() - start;
        result = { ...outcome, stats: stats() };
        release();
        return result;
      };
      while (cursor < nodes.length) {
        if (elapsed + now() - start >= maxMilliseconds) return finish({ status: 'limitReached', reason: 'time' });
        if (expandedStates >= targetExpanded || now() - start >= sliceMilliseconds) return endSlice();
        const current = nodes[cursor];
        const board = current.board!;
        if (current.nextPair === 0 && isSolved(board, capacity)) {
          const route: Pour[] = [];
          for (let index = cursor; nodes[index].parent >= 0; index = nodes[index].parent) route.push(nodes[index].pour!);
          route.reverse();
          return finish({ status: 'solved', route, shortest: true });
        }
        while (current.nextPair < board.length * board.length) {
          if (elapsed + now() - start >= maxMilliseconds) return finish({ status: 'limitReached', reason: 'time' });
          if (now() - start >= sliceMilliseconds) return endSlice();
          const pair = current.nextPair++;
          const pour = getPour(board, Math.floor(pair / board.length), pair % board.length, capacity);
          if (!pour) continue;
          generatedMoves++;
          const next = applyPour(board, pour, capacity);
          const stateKey = key(next);
          if (seen.has(stateKey)) continue;
          if (visitedStates >= maxStates) return finish({ status: 'limitReached', reason: 'states' });
          seen.add(stateKey);
          visitedStates++;
          nodes.push({ board: next, parent: cursor, pour, nextPair: 0 });
          peakFrontier = Math.max(peakFrontier, nodes.length - cursor - 1);
        }
        // Expanded liquid arrays can be released; predecessor records remain for replay.
        current.board = null;
        cursor++;
        expandedStates++;
      }
      return finish({ status: 'unsolvable' });
    },
  };
}

/** Synchronous tool entry point. Mobile callers should yield between task.step() calls. */
export function solveBoard(board: Board, options: SolverOptions = {}): SolveResult {
  const task = createSolver(board, options);
  let result: SolveResult | null;
  do { result = task.step(1000, 8); } while (!result);
  return result;
}

/** Trust neither imported routes nor solver backends without checking every maximal pour. */
export function replaySolution(board: Board, route: readonly Pour[], capacity = CAPACITY): Board {
  const issues = validateBoard(board, capacity);
  if (issues.length) throw new Error(issues.join('; '));
  let current = board;
  for (const pour of route) {
    if (isSolved(current, capacity)) throw new Error('Route continues after completion');
    current = applyPour(current, pour, capacity);
  }
  if (!isSolved(current, capacity)) throw new Error('Route does not complete the board');
  return current;
}
