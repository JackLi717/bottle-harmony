import { createSolver, type SolveResult, type SolverOptions, type SearchStats } from './solver.ts';
import { memoryPour, memoryReadyToReveal, transferUnits, type MemorySession, type UnitBoard } from './memory.ts';
import { isSolved, type Pour } from './rules.ts';
import { mappedMemoryRoute, memoryEncoding, memoryReferenceAnchors, rememberMemoryRoute, verifiedMemoryRoute, type MemoryRouteAnchor } from './memoryRoutes.ts';

export type MemoryHintResult = Exclude<SolveResult, { status: 'solved' }> | { status: 'solved'; route: readonly Pour[]; shortest: boolean; stats: SearchStats };
export type MemoryHintTask = { step(maxExpansions?: number, sliceMilliseconds?: number): MemoryHintResult | null; cancel(): MemoryHintResult };
export type MemoryHintReason = 'memoryHintUncover' | 'memoryHintBridge' | 'memoryHintSpace' | 'memoryHintMerge';
/** Explanations use public knowledge only, even though search may use true colors. */
export function memoryHintReason(current: MemorySession, pour: Pour): MemoryHintReason {
  const source = current.units[pour.source], target = current.units[pour.target];
  const black = current.revealed[source.at(-1)!] < 0;
  if (black && source.length > 1) return 'memoryHintUncover';
  if (!target.length) return 'memoryHintSpace';
  if (black || current.revealed[target.at(-1)!] < 0) return 'memoryHintBridge';
  return 'memoryHintMerge';
}
/** Request-only weighted search: find any verified completion, not a shortest-path proof.
 * All legal black bridges remain available. Equivalent reference/cache states end
 * search early, and a found suffix is reused on the next request. */
export function createMemoryHintPlanner() {
  let puzzle: MemorySession['puzzle'] | null = null, anchors = new Map<string, MemoryRouteAnchor>();
  return { create(current: MemorySession, options: SolverOptions = {}): MemoryHintTask {
    if (current.judgement !== 'hidden') return createSolver(current.game.board, { ...options, algorithm: 'astar' });
    const maxStates = options.maxStates ?? 100000, maxMs = options.maxMilliseconds ?? 700;
    if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 1000000 || !Number.isFinite(maxMs) || maxMs <= 0 || maxMs > 60000) throw new Error('Invalid memory hint budget');
    const started = performance.now();
    if (puzzle !== current.puzzle) { puzzle = current.puzzle; anchors = memoryReferenceAnchors(current); }
    const known = anchors, encode = memoryEncoding(current), { colors } = encode;
    type Node = { units: UnitBoard; key: string; parent: number; pour: Pour | null; g: number; h: number; pair: number };
    function estimate(units: UnitBoard) {
      let groups = 0; const savings = new Map<string, number>();
      for (const b of units) {
        let bottom = 0, bottomGroups = 0;
        for (let i = 0; i < b.length; i++) {
          const id = b[i], group = i === 0 || current.revealed[id] < 0 || current.revealed[b[i - 1]] < 0 || colors[id] !== colors[b[i - 1]];
          if (group) groups++;
          if (i === bottom && colors[id] === colors[b[0]]) { bottom++; if (group) bottomGroups++; }
        }
        if (b.length) savings.set(colors[b[0]], Math.max(savings.get(colors[b[0]]) ?? 0, bottomGroups));
      }
      return groups - [...savings.values()].reduce((a, b) => a + b, 0);
    }
    const key = encode.key(current.units), nodes: Node[] = [{ units: current.units, key, parent: -1, pour: null, g: 0, h: estimate(current.units), pair: 0 }];
    const best = new Map([[key, 0]]), heap: number[] = [];
    let active = -1, elapsed = performance.now() - started, expanded = 0, generated = 0, visited = 1, peak = 1, result: MemoryHintResult | null = null;
    const stats = (): SearchStats => ({ visitedStates: visited, expandedStates: expanded, generatedMoves: generated, peakFrontier: peak, elapsedMilliseconds: elapsed });
    const less = (a: number, b: number) => {
      const x = nodes[a], y = nodes[b], f = x.g + 2 * x.h - y.g - 2 * y.h;
      return f < 0 || f === 0 && (x.h < y.h || x.h === y.h && a < b);
    };
    function push(index: number) {
      heap.push(index); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
      peak = Math.max(peak, heap.length);
    }
    function pop() {
      const first = heap[0], last = heap.pop()!;
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) { let c = i * 2 + 1; if (c >= heap.length) break; if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++; if (!less(heap[c], heap[i])) break; [heap[i], heap[c]] = [heap[c], heap[i]]; i = c; }
      }
      return first;
    }
    push(0);
    function finish(value: MemoryHintResult) { result = value; nodes.length = 0; best.clear(); heap.length = 0; return value; }
    return {
      cancel() { return result ?? finish({ status: 'limitReached', reason: 'cancelled', stats: stats() }); },
      step(maxExpansions = 32, sliceMilliseconds = 4) {
        if (result) return result;
        if (!Number.isInteger(maxExpansions) || maxExpansions < 1 || !Number.isFinite(sliceMilliseconds) || sliceMilliseconds <= 0) throw new Error('Invalid memory hint slice');
        const start = performance.now(), stop = expanded + maxExpansions;
        const end = (reason: 'time' | 'states' | 'unsolvable' | null) => {
          elapsed += performance.now() - start;
          return reason === null ? null : finish(reason === 'unsolvable' ? { status: reason, stats: stats() } : { status: 'limitReached', reason, stats: stats() });
        };
        while (active >= 0 || heap.length) {
          if (elapsed + performance.now() - start >= maxMs) return end('time');
          if (expanded >= stop || performance.now() - start >= sliceMilliseconds) return end(null);
          if (active < 0) {
            active = pop(); const node = nodes[active];
            if (best.get(node.key) !== active) { active = -1; continue; }
            const anchor = known.get(node.key), suffix = anchor ? mappedMemoryRoute(current, node.units, anchor) : null;
            const solved = isSolved(node.units.map(b => b.map(id => colors[id])));
            if (suffix || solved) {
              const route: Pour[] = [];
              for (let i = active; nodes[i].parent >= 0; i = nodes[i].parent) route.push(nodes[i].pour!);
              route.reverse(); route.push(...(suffix ?? []));
              if (!verifiedMemoryRoute(current, route)) throw new Error('Memory hint failed full replay');
              rememberMemoryRoute(known, current, route);
              elapsed += performance.now() - start;
              return finish({ status: 'solved', route, shortest: false, stats: stats() });
            }
            // Wrong public answers end black play; never route through one.
            if (memoryReadyToReveal(node.units, colors, current.revealed)) { active = -1; expanded++; continue; }
          }
          const node = nodes[active], n = node.units.length;
          while (node.pair < n * n) {
            if (elapsed + performance.now() - start >= maxMs) return end('time');
            if (performance.now() - start >= sliceMilliseconds) return end(null);
            const pair = node.pair++, pour = memoryPour(node.units, colors, current.revealed, Math.floor(pair / n), pair % n);
            if (!pour) continue;
            generated++;
            const units = transferUnits(node.units, pour), key = encode.key(units), g = node.g + 1, old = best.get(key);
            if (old !== undefined && nodes[old].g <= g) continue;
            if (visited >= maxStates) return end('states');
            const i = nodes.length; nodes.push({ units, key, parent: active, pour, g, h: estimate(units), pair: 0 }); best.set(key, i); visited++; push(i);
          }
          active = -1; expanded++;
        }
        return end('unsolvable');
      },
    };
  } };
}
