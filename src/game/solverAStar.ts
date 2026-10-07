import { validateBoard } from './model.ts';
import { applyPour, CAPACITY, getPour, isSolved, type Board, type Pour } from './rules.ts';
import type { SearchStats, SolveResult, SolverOptions, SolverTask } from './solver.ts';

type Node = { key: string; g: number; h: number; parent: number; pour: Pour | null };

/** Each maximal legal pour reduces the number of color runs by at most one.
 * A solved board has exactly one run per color, so runs - colors is an
 * admissible, consistent lower bound on remaining pours. No legal edges are
 * pruned. Goal removal from the minimum-f queue therefore proves shortestness.
 * Canonical strings save liquid arrays; immutable predecessors retain real
 * replay evidence even when a shorter path reopens a state. */
export function createAStarSolver(input: Board, options: SolverOptions = {}): SolverTask {
  const capacity = options.capacity ?? CAPACITY;
  const maxStates = options.maxStates ?? 30000, maxMilliseconds = options.maxMilliseconds ?? 250;
  const issues = validateBoard(input, capacity);
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 1000000) issues.push('maxStates must be an integer from 1 to 1000000');
  if (!Number.isFinite(maxMilliseconds) || maxMilliseconds <= 0 || maxMilliseconds > 60000) issues.push('maxMilliseconds must be positive and at most 60000');
  if (options.algorithm !== undefined && options.algorithm !== 'astar') issues.push('Unsupported solver algorithm');
  const initialBoard = issues.length ? [] : input.map(bottle => [...bottle]);
  const colors = [...new Set(initialBoard.flat())];
  const codes = new Map(colors.map((color, index) => [color, String.fromCharCode(65 + index)]));
  const encode = (board: Board) => board.map(bottle => bottle.map(color => codes.get(color)!).join(''));
  const key = (board: Board) => encode(board).sort().join('|');
  const decode = (state: string): Board => state.split('|').map(bottle => [...bottle].map(code => colors[code.charCodeAt(0) - 65]));
  const heuristic = (state: string) => {
    let runs = 0;
    for (const bottle of state.split('|')) for (let i = 0; i < bottle.length; i++) if (i === 0 || bottle[i] !== bottle[i - 1]) runs++;
    return runs - colors.length;
  };
  const nodes: Node[] = [], heap: number[] = [], best = new Map<string, number>();
  let expandedStates = 0, generatedMoves = 0, visitedStates = 0, peakFrontier = 0, elapsed = 0;
  let active = -1, board: Board | null = null, nextPair = 0;
  let result: SolveResult | null = null;
  const stats = (): SearchStats => ({ visitedStates, expandedStates, generatedMoves, peakFrontier, elapsedMilliseconds: elapsed });
  const less = (a: number, b: number) => {
    const x = nodes[a], y = nodes[b], f = x.g + x.h - y.g - y.h;
    return f < 0 || (f === 0 && (x.h < y.h || (x.h === y.h && a < b)));
  };
  function push(index: number) {
    heap.push(index);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!less(heap[i], heap[parent])) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]]; i = parent;
    }
    peakFrontier = Math.max(peakFrontier, heap.length);
  }
  function pop(): number {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      while (2 * i + 1 < heap.length) {
        let child = 2 * i + 1;
        if (child + 1 < heap.length && less(heap[child + 1], heap[child])) child++;
        if (!less(heap[child], heap[i])) break;
        [heap[i], heap[child]] = [heap[child], heap[i]]; i = child;
      }
    }
    return first;
  }
  if (issues.length) result = { status: 'invalid', issues, stats: stats() };
  else {
    const initial = key(initialBoard);
    nodes.push({ key: initial, g: 0, h: heuristic(initial), parent: -1, pour: null });
    best.set(initial, 0); visitedStates = 1; push(0);
  }
  function route(goal: number): Pour[] {
    const path: number[] = [];
    for (let i = goal; nodes[i].parent >= 0; i = nodes[i].parent) path.push(i);
    let current: Board = initialBoard;
    const moves: Pour[] = [];
    for (const index of path.reverse()) {
      const node = nodes[index], canonical = nodes[node.parent].key.split('|'), actual = encode(current);
      const used = new Set<number>();
      const mapping = canonical.map(bottle => {
        const i = actual.findIndex((value, j) => value === bottle && !used.has(j));
        if (i < 0) throw new Error('Solver predecessor cannot map to actual bottles');
        used.add(i); return i;
      });
      const move = getPour(current, mapping[node.pour!.source], mapping[node.pour!.target], capacity);
      if (!move || move.color !== node.pour!.color || move.amount !== node.pour!.amount) throw new Error('Solver predecessor is not a legal maximal pour');
      moves.push(move); current = applyPour(current, move, capacity);
    }
    if (!isSolved(current, capacity)) throw new Error('Solver route did not complete');
    return moves;
  }
  function release() { nodes.length = 0; heap.length = 0; best.clear(); board = null; }
  function cancel(): SolveResult {
    if (!result) { result = { status: 'limitReached', reason: 'cancelled', stats: stats() }; release(); }
    return result;
  }
  return { cancel, step(maxExpansions = 64, sliceMilliseconds = 4) {
    if (result) return result;
    if (!Number.isInteger(maxExpansions) || maxExpansions < 1 || !Number.isFinite(sliceMilliseconds) || sliceMilliseconds <= 0) throw new Error('Invalid search slice');
    const start = performance.now(), target = expandedStates + maxExpansions;
    const finish = (outcome: { status: 'solved'; route: readonly Pour[]; shortest: true } | { status: 'unsolvable' } | { status: 'limitReached'; reason: 'time' | 'states' }): SolveResult => {
      elapsed += performance.now() - start;
      result = { ...outcome, stats: stats() }; release(); return result;
    };
    while (active >= 0 || heap.length) {
      const spent = performance.now() - start;
      if (elapsed + spent >= maxMilliseconds) return finish({ status: 'limitReached', reason: 'time' });
      if (expandedStates >= target || spent >= sliceMilliseconds) { elapsed += spent; return null; }
      if (active < 0) {
        active = pop();
        if (best.get(nodes[active].key) !== active) { active = -1; continue; }
        board = decode(nodes[active].key); nextPair = 0;
        if (isSolved(board, capacity)) return finish({ status: 'solved', route: route(active), shortest: true });
      }
      const current = nodes[active], liquid = board!;
      while (nextPair < liquid.length * liquid.length) {
        const spent = performance.now() - start;
        if (elapsed + spent >= maxMilliseconds) return finish({ status: 'limitReached', reason: 'time' });
        if (spent >= sliceMilliseconds) { elapsed += spent; return null; }
        const pair = nextPair++;
        const pour = getPour(liquid, Math.floor(pair / liquid.length), pair % liquid.length, capacity);
        if (!pour) continue;
        generatedMoves++;
        const state = key(applyPour(liquid, pour, capacity)), g = current.g + 1;
        const previous = best.get(state);
        if (previous !== undefined && nodes[previous].g <= g) continue;
        // Count reopened labels too: the cap bounds all predecessor allocations.
        if (visitedStates >= maxStates) return finish({ status: 'limitReached', reason: 'states' });
        const index = nodes.length;
        nodes.push({ key: state, g, h: heuristic(state), parent: active, pour });
        best.set(state, index); visitedStates++; push(index);
      }
      active = -1; board = null; expandedStates++;
    }
    return finish({ status: 'unsolvable' });
  } };
}
