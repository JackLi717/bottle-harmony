import { compileSortingPuzzle, evaluateEngineGoal, initialEngineState, listEngineActions, transitionEngine,
  type EngineAction, type EngineFrame, type EngineRuntime } from '../../src/game/engine.ts';
import { assertRevealScope, revealAddress, type RevealHintTable, type RevealPolicyStep } from '../../src/game/progressiveRevealHints.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { sha256 } from './unlockRatingEvidence.ts';

export const REVEAL_BUDGET = Object.freeze({ maxWorlds: 720, maxPhaseStates: 15000, maxTotalStates: 250000, maxEdges: 2000000, maxMilliseconds: 180000 });
export type RevealBudget = { readonly [K in keyof typeof REVEAL_BUDGET]: number };
class RevealLimit extends Error {}

/** Every unseen assignment follows only the public four-of-each inventory. No
 * actual hidden color is consulted to pick a shared preparation or an action. */
export function revealWorlds(runtime: EngineRuntime, frame: EngineFrame, maxWorlds: number): EngineRuntime[] {
  const known = new Set(frame.known), unknown = runtime.puzzle.units.filter(u => !known.has(u.id));
  const counts = runtime.puzzle.colors.map(c => 4 - runtime.puzzle.units.filter(u => known.has(u.id) && u.color === c).length);
  const assignment = new Map<string, string>(), worlds: EngineRuntime[] = [];
  function visit(index: number) {
    if (index === unknown.length) {
      if (worlds.length >= maxWorlds) throw new RevealLimit('world-budget');
      worlds.push(compileSortingPuzzle({ ...runtime.puzzle, units: runtime.puzzle.units.map(u => ({ ...u, color: assignment.get(u.id) ?? u.color })) }));
      return;
    }
    for (let c = 0; c < counts.length; c++) if (counts[c]) {
      counts[c]--; assignment.set(unknown[index].id, runtime.puzzle.colors[c]); visit(index + 1); counts[c]++;
    }
  }
  visit(0); return worlds;
}

/** A finite adaptive policy. Within an information phase, exhaust the public
 * preparation graph. A reveal exit wins only when EVERY visible outcome has a
 * winning continuation. Recursion strictly decreases the number of unknowns.
 * At each reveal we conservatively reconstruct all inventory-compatible worlds;
 * no inference from secret source-generation filters or past non-completion. */
export function createRevealPolicy(puzzle: SortingPuzzle, budget: RevealBudget = REVEAL_BUDGET) {
  const runtime = compileSortingPuzzle(puzzle); assertRevealScope(runtime);
  if (Object.values(budget).some(n => !Number.isFinite(n) || n <= 0)
    || ['maxWorlds', 'maxPhaseStates', 'maxTotalStates', 'maxEdges'].some(k => !Number.isSafeInteger(budget[k as keyof RevealBudget]))) throw Error('Invalid reveal proof budget');
  const states: Record<string, RevealPolicyStep> = Object.create(null), begin = performance.now();
  let totalStates = 0, edges = 0, phases = 0, peakWorlds = 0;
  const check = () => { if (performance.now() - begin > budget.maxMilliseconds) throw new RevealLimit('time-budget'); };
  function solve(rt: EngineRuntime, start: EngineFrame): RevealPolicyStep {
    check();
    const address = revealAddress(rt, start), cached = states[address.key]; if (cached) return cached;
    phases++;
    const worlds = revealWorlds(rt, start, budget.maxWorlds); peakWorlds = Math.max(peakWorlds, worlds.length);
    type Edge = { to: number; move: readonly [number, number] };
    type Node = { key: string; frame: EngineFrame; predecessors: { from: number; move: readonly [number, number] }[];
      distance: number; move: readonly [number, number] | null };
    const nodes: Node[] = [], indices = new Map<string, number>();
    const add = (frame: EngineFrame) => {
      const key = revealAddress(rt, frame).key, existing = indices.get(key); if (existing !== undefined) return existing;
      if (nodes.length >= budget.maxPhaseStates || ++totalStates > budget.maxTotalStates) throw new RevealLimit('state-budget');
      const i = nodes.length; indices.set(key, i); nodes.push({ key, frame, predecessors: [], distance: -1, move: null }); return i;
    };
    add(start);
    for (let i = 0; i < nodes.length; i++) {
      check(); const node = nodes[i], frame = node.frame;
      if (worlds.every(w => evaluateEngineGoal(w, frame.state))) { node.distance = 0; continue; }
      const order = revealAddress(rt, frame).order;
      for (const action of listEngineActions(rt, frame.state, frame.known)) {
        if (++edges > budget.maxEdges) throw new RevealLimit('edge-budget');
        const move = [order.indexOf(rt.containerIndex.get(action.source)!), order.indexOf(rt.containerIndex.get(action.target)!)] as const;
        const next = transitionEngine(rt, frame.state, frame.known, action); if (!next.accepted) throw Error('Reveal action enumeration mismatch');
        if (next.known.length === frame.known.length) {
          const child = states[revealAddress(rt, next).key];
          if (child) {
            if (child.distance >= 0 && (node.distance < 0 || child.distance + 1 < node.distance)) { node.distance = child.distance + 1; node.move = move; }
          } else {
            const edge: Edge = { to: add(next), move }; nodes[edge.to].predecessors.push({ from: i, move: edge.move });
          }
        } else {
          const branches = new Map<string, { runtime: EngineRuntime; frame: EngineFrame }>();
          for (const w of worlds) {
            check();
            // Completed worlds stop; other worlds see the same legal action.
            if (evaluateEngineGoal(w, frame.state)) continue;
            const outcome = transitionEngine(w, frame.state, frame.known, action);
            if (!outcome.accepted || outcome.known.length <= frame.known.length) throw Error('Reveal preparation leaked hidden truth');
            if (!evaluateEngineGoal(w, outcome.state)) branches.set(revealAddress(w, outcome).key, { runtime: w, frame: outcome });
          }
          let safe = true;
          for (const branch of branches.values()) if (solve(branch.runtime, branch.frame).distance < 0) { safe = false; break; }
          if (safe && (node.distance < 0 || node.distance > 1)) { node.distance = 1; node.move = move; }
        }
      }
    }
    // Unit-cost reverse propagation: cycles with no winning exit stay losing.
    const queue = nodes.flatMap((n, i) => n.distance >= 0 ? [i] : []);
    for (let q = 0; q < queue.length; q++) {
      const to = nodes[queue[q]];
      for (const p of to.predecessors) {
        const from = nodes[p.from];
        if (from.distance < 0 || from.distance > to.distance + 1) { from.distance = to.distance + 1; from.move = p.move; queue.push(p.from); }
      }
    }
    for (const n of nodes) states[n.key] = { distance: n.distance, move: n.move };
    return states[address.key];
  }
  return { runtime, solve, states, stats: () => ({ totalStates, edges, phases, peakWorlds }),
    table: (): RevealHintTable => ({ binding: runtime.binding, states }) };
}

export function replayRevealPolicy(runtime: EngineRuntime, start: EngineFrame, table: RevealHintTable) {
  let frame = start; const route: EngineAction[] = [], visited = new Set<string>();
  while (!evaluateEngineGoal(runtime, frame.state)) {
    const { key, order } = revealAddress(runtime, frame), step = table.states[key];
    if (visited.has(key) || !step || step.distance < 1 || !step.move) throw Error('Incomplete or cyclic public reveal policy');
    visited.add(key);
    const action: EngineAction = { type: 'transfer', source: runtime.puzzle.containers[order[step.move[0]]].id, target: runtime.puzzle.containers[order[step.move[1]]].id };
    const next = transitionEngine(runtime, frame.state, frame.known, action); if (!next.accepted) throw Error('Illegal public reveal policy');
    if (!evaluateEngineGoal(runtime, next.state) && next.known.length === frame.known.length
      && (table.states[revealAddress(runtime, next).key]?.distance ?? Infinity) >= step.distance) throw Error('Reveal policy does not progress');
    route.push(action); frame = next;
  }
  return { route, frame };
}

export function acceptProgressiveReveal(puzzle: SortingPuzzle, budget: RevealBudget = REVEAL_BUDGET) {
  const method = 'independent-progressive-reveal-acceptance-v1', binding = sha256({ puzzle, budget, method });
  try {
    const policy = createRevealPolicy(puzzle, budget), initial = initialEngineState(policy.runtime);
    if (policy.solve(policy.runtime, initial).distance < 1) return { method, binding, status: 'fail' as const, label: '不通过', reason: 'no-common-public-policy', stats: policy.stats() };
    const worlds = revealWorlds(policy.runtime, initial, budget.maxWorlds), table = policy.table();
    const certificates = worlds.map(w => ({ colors: w.puzzle.units.filter(u => puzzle.hidden.includes(u.id)).map(u => u.color),
      route: replayRevealPolicy(w, initial, table).route }));
    const actual = replayRevealPolicy(policy.runtime, initial, table);
    return { method, binding, status: 'pass' as const, label: '通过', reason: 'all-public-worlds-have-finite-adaptive-completion',
      worlds: worlds.length, certificatesSha256: sha256(certificates), route: actual.route, stats: policy.stats(), policy };
  } catch (e) {
    if (e instanceof RevealLimit) return { method, binding, status: 'unknown' as const, label: '未知', reason: e.message };
    if (e instanceof Error && e.message === 'Unsupported independent progressive reveal scope') return { method, binding, status: 'unknown' as const, label: '未知', reason: 'unsupported-independent-reveal-scope' };
    throw e;
  }
}

/** Cover arbitrary legal choices AND every stronger knowledge set retained by
 * undo. Knowledge upgrades are offline closure edges, never gameplay actions. */
export function completeRevealHints(policy: ReturnType<typeof createRevealPolicy>, budget: RevealBudget = REVEAL_BUDGET) {
  const runtime = policy.runtime, frames: EngineFrame[] = [], seen = new Set<string>();
  const add = (frame: EngineFrame) => {
    const key = revealAddress(runtime, frame).key; if (seen.has(key)) return;
    if (frames.length >= budget.maxTotalStates) throw new RevealLimit('hint-closure-budget');
    seen.add(key); frames.push(frame);
  };
  add(initialEngineState(runtime));
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    policy.solve(runtime, frame);
    if (!evaluateEngineGoal(runtime, frame.state)) for (const action of listEngineActions(runtime, frame.state, frame.known)) {
      const next = transitionEngine(runtime, frame.state, frame.known, action); if (!next.accepted) throw Error('Invalid closure action'); add(next);
    }
    for (const id of runtime.puzzle.hidden) if (!frame.known.includes(id)) add({ state: frame.state,
      known: runtime.puzzle.units.filter(u => frame.known.includes(u.id) || u.id === id).map(u => u.id) });
  }
  const table = policy.table();
  for (const frame of frames) {
    if (evaluateEngineGoal(runtime, frame.state)) continue;
    const address = revealAddress(runtime, frame), step = table.states[address.key];
    if (!step) throw Error('Incomplete hint closure');
    if (step.distance > 0) {
      const action: EngineAction = { type: 'transfer', source: runtime.puzzle.containers[address.order[step.move![0]]].id, target: runtime.puzzle.containers[address.order[step.move![1]]].id };
      const next = transitionEngine(runtime, frame.state, frame.known, action); if (!next.accepted) throw Error('Invalid closure hint');
      if (!evaluateEngineGoal(runtime, next.state)) {
        const child = table.states[revealAddress(runtime, next).key];
        if (!child || child.distance < 0 || next.known.length === frame.known.length && child.distance >= step.distance) throw Error('Unsafe or cyclic closure hint');
      }
    }
  }
  return { table, closureStates: frames.length, stats: policy.stats() };
}
