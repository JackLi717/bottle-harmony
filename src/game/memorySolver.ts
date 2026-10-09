import { createSolver, type SolverTask, type SolverOptions, type SolveResult, type SearchStats } from './solver.ts';
import { initialBoard } from './model.ts';
import { isSolved, type Pour } from './rules.ts';
import { initialUnits, memoryPour, memoryReadyToReveal, transferUnits, unitColors, type MemorySession, type UnitBoard } from './memory.ts';

/** A stored route helps only if its exact liquid identities match the current position. */
export function memoryReferenceHint(current: MemorySession): Pour | null {
  if (current.judgement !== 'hidden') return null;
  const colors = unitColors(current.puzzle), knowledge = colors.map((_, id) => current.puzzle.masks.includes(id) ? -1 : 0);
  let units = initialUnits(current.puzzle);
  for (const p of current.puzzle.solution) {
    const actual = memoryPour(units, colors, knowledge, p.source, p.target);
    if (!actual || actual.amount !== p.amount || actual.color !== p.color) return null;
    if (JSON.stringify(units) === JSON.stringify(current.units)) return p;
    units = transferUnits(units, p);
  }
  return null;
}

/** Requested assistance searches black-unit rules; ordinary impossibility cannot condemn a hidden board. */
export function createMemorySolver(current: MemorySession, options: SolverOptions = {}): SolverTask {
  if (current.judgement !== 'hidden') return createSolver(current.game.board, options);
  const colors = unitColors(current.puzzle), maxStates = options.maxStates ?? 100000, maxMs = options.maxMilliseconds ?? 700;
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 1000000 || !Number.isFinite(maxMs) || maxMs <= 0 || maxMs > 60000) throw new Error('Invalid memory search budget');
  type Node = { units: UnitBoard; parent: number; pour: Pour | null; pair: number };
  const nodes: Node[] = [{ units: current.units, parent: -1, pour: null, pair: 0 }];
  const codes = new Map(initialBoard(current.puzzle.level).flat().map(c => [c, '']));
  [...codes.keys()].forEach((c, i) => codes.set(c, String.fromCharCode(65 + i)));
  const key = (u: UnitBoard) => u.map(b => b.map(id => codes.get(colors[id])! + (current.revealed[id] < 0 ? '?' : '.')).join('')).sort().join('|');
  const seen = new Set([key(current.units)]);
  let cursor = 0, elapsed = 0, expanded = 0, generated = 0, peak = 1, visited = 1, result: SolveResult | null = null;
  const stats = (): SearchStats => ({ visitedStates: visited, expandedStates: expanded, generatedMoves: generated, peakFrontier: peak, elapsedMilliseconds: elapsed });
  function finish(value: SolveResult): SolveResult { result = value; nodes.length = 0; seen.clear(); return value; }
  return {
    cancel() { return result ?? finish({ status: 'limitReached', reason: 'cancelled', stats: stats() }); },
    step(maxExpansions = 64, sliceMilliseconds = 4) {
      if (result) return result;
      if (!Number.isInteger(maxExpansions) || maxExpansions < 1 || !Number.isFinite(sliceMilliseconds) || sliceMilliseconds <= 0) throw new Error('Invalid memory search slice');
      const started = performance.now(), stop = expanded + maxExpansions;
      const end = (outcome: 'time' | 'states' | 'unsolvable' | null): SolveResult | null => {
        elapsed += performance.now() - started;
        return outcome === null ? null : outcome === 'unsolvable' ? finish({ status: outcome, stats: stats() }) : finish({ status: 'limitReached', reason: outcome, stats: stats() });
      };
      while (cursor < nodes.length) {
        if (elapsed + performance.now() - started >= maxMs) return end('time');
        if (expanded >= stop || performance.now() - started >= sliceMilliseconds) return end(null);
        const node = nodes[cursor], n = node.units.length;
        if (node.pair === 0 && isSolved(node.units.map(b => b.map(id => colors[id])))) {
          const route: Pour[] = [];
          for (let k = cursor; nodes[k].parent >= 0; k = nodes[k].parent) route.push(nodes[k].pour!);
          elapsed += performance.now() - started;
          return finish({ status: 'solved', route: route.reverse(), shortest: true, stats: stats() });
        }
        // An incorrect automatic answer ends black play; a hint cannot route through it.
        if (node.pair === 0 && memoryReadyToReveal(node.units, colors, current.revealed)) { expanded++; cursor++; continue; }
        while (node.pair < n * n) {
          if (elapsed + performance.now() - started >= maxMs) return end('time');
          if (performance.now() - started >= sliceMilliseconds) return end(null);
          const pair = node.pair++, p = memoryPour(node.units, colors, current.revealed, Math.floor(pair / n), pair % n);
          if (!p) continue;
          generated++;
          const units = transferUnits(node.units, p), code = key(units);
          if (seen.has(code)) continue;
          if (visited >= maxStates) return end('states');
          seen.add(code); nodes.push({ units, parent: cursor, pour: p, pair: 0 }); visited++;
          peak = Math.max(peak, nodes.length - cursor);
        }
        expanded++; cursor++;
      }
      return end('unsolvable');
    },
  };
}
