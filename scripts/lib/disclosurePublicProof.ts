import { compileSortingPuzzle, evaluateEngineGoal, initialEngineState, listEngineActions, transitionEngine, visibleEngineState,
  type EngineAction, type EngineFrame, type EngineRuntime } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { concealedInventoryWorlds } from './unlockPublicDisclosure.ts';
import { revealWorlds } from './progressiveRevealAcceptance.ts';
import { sha256 } from './unlockRatingEvidence.ts';
import { solveBoard } from '../../src/game/solver.ts';
import type { DisclosureKind } from './disclosureStageDifficulty.ts';
import { combinedInventoryWorlds } from './combinedInventoryWorlds.ts';

export const DISCLOSURE_PROOF_BUDGET = Object.freeze({ maxWorlds: 2048, maxPhaseStates: 15000, maxTotalStates: 250000, maxEdges: 2000000, maxMilliseconds: 180000 });
export type DisclosureProofBudget = { readonly [K in keyof typeof DISCLOSURE_PROOF_BUDGET]: number };
class Limit extends Error {}
export function validateDisclosureProofBudget(b: DisclosureProofBudget) {
  if (Object.values(b).some(n => !Number.isFinite(n) || n <= 0) || Object.entries(b).some(([k, n]) => k !== 'maxMilliseconds' && !Number.isSafeInteger(n))) throw Error('Invalid disclosure proof budget');
}
type World = { id: number; runtime: EngineRuntime; frame: EngineFrame };

/** A finite adaptive public policy pinned to the actual rating route. All
 * hidden counts/orders (cloth), or all unseen color assignments (reveal), are
 * enumerated from public inventory. A branch may use observed colors/history,
 * never the secret true world. This proof does not rate hypothetical worlds. */
export function proveDisclosureRoute(puzzle: SortingPuzzle, kind: DisclosureKind, route: readonly EngineAction[], budget: DisclosureProofBudget = DISCLOSURE_PROOF_BUDGET) {
  validateDisclosureProofBudget(budget);
  const binding = { method: `${kind}-coupled-public-proof-v1`, definitionSha256: sha256(puzzle), routeSha256: sha256(route), budget };
  const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime);
  replayEngineRoute(runtime, initial, route);
  const started = performance.now(); let totalStates = 0, edges = 0, peakWorlds = 0, worldCount = 0;
  const time = () => { if (performance.now() - started >= budget.maxMilliseconds) throw new Limit('public-time-budget'); };
  type Move = readonly [number, number];
  // Open bottles with equal physical permissions are interchangeable. Locked
  // positions retain their exact roles; unknown unit identities remain distinct
  // for progressive disclosure. Map canonical actions back for EVERY world.
  const layout = (w: World) => {
    const known = new Set(w.frame.known), visible = visibleEngineState(w.runtime, w.frame.state, w.frame.known);
    const rows = visible.map((v, i) => ({ i, code: JSON.stringify([
      v.locked ? ['locked', i] : ['open', v.capacity, v.fixed, v.canSource, v.canReceive,
        ...puzzle.triggers.filter(t => t.when.type === 'empty' && t.when.container === puzzle.containers[i].id && !w.frame.state.fired.includes(t.id)).map(t => t.id)],
      v.count, v.colors, kind.endsWith('reveal') && !v.locked ? w.frame.state.contents[i].map(id => known.has(id) ? w.runtime.unitColors.get(id) : ['unknown', id]) : null,
    ]) }));
    rows.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.i - b.i);
    return { order: rows.map(r => r.i), key: JSON.stringify([rows.map(r => r.code), w.frame.state.fired]) };
  };
  const observation = (w: World) => layout(w).key;
  const encode = (w: World, a: EngineAction): Move => {
    const order = layout(w).order;
    return [order.indexOf(w.runtime.containerIndex.get(a.source)!), order.indexOf(w.runtime.containerIndex.get(a.target)!)];
  };
  const decode = (w: World, move: Move): EngineAction => {
    const order = layout(w).order;
    return { type: 'transfer', source: puzzle.containers[order[move[0]]].id, target: puzzle.containers[order[move[1]]].id };
  };
  const address = (worlds: World[]) => JSON.stringify([worlds.map(w => w.id), observation(worlds[0])]);
  const groups = (worlds: World[]) => {
    const map = new Map<string, World[]>();
    for (const w of worlds) {
      if (evaluateEngineGoal(w.runtime, w.frame.state)) continue;
      const key = observation(w), group = map.get(key) ?? []; group.push(w); map.set(key, group);
    }
    return [...map.values()];
  };
  const pins = new Map<string, Move>();
  let actualFrame = initial;
  for (const action of route) {
    const key = observation({ id: -1, runtime, frame: actualFrame });
    const old = pins.get(key);
    const move = encode({ id: -1, runtime, frame: actualFrame }, action);
    if (old && JSON.stringify(old) !== JSON.stringify(move)) throw Error('Rating route repeats a public observation with conflicting actions');
    pins.set(key, move);
    const next = transitionEngine(runtime, actualFrame.state, actualFrame.known, action); if (!next.accepted) throw Error('Invalid pinned route'); actualFrame = next;
  }
  let actualId = -1;
  const policy = new Map<string, Move | null>(), failed = new Set<string>();
  function solve(worlds: World[]): boolean {
    time();
    if (!worlds.length) return true;
    peakWorlds = Math.max(peakWorlds, worlds.length);
    const startKey = address(worlds);
    if (policy.has(startKey)) return true;
    if (failed.has(startKey)) return false;
    // Once every portion is public, this is ordinary sorting. Use the existing
    // bounded classic solver instead of enumerating physical bottle permutations.
    // The actual observed branch still follows the pinned rating route exactly.
    if (worlds.every(w => w.frame.state.open.every(Boolean) && w.frame.known.length === puzzle.units.length)) {
      const first = worlds[0];
      let actions: readonly EngineAction[] | null = null;
      if (!worlds.some(w => w.id === actualId)) {
        const remaining = budget.maxTotalStates - totalStates;
        if (remaining <= 0) throw new Limit('public-state-budget');
        const found = solveBoard(first.frame.state.contents.map(s => s.map(id => first.runtime.unitColors.get(id)!)), {
          maxStates: Math.min(budget.maxPhaseStates, remaining), maxMilliseconds: Math.min(60000, budget.maxMilliseconds - (performance.now() - started)),
        });
        totalStates += found.stats.visitedStates;
        edges += found.stats.generatedMoves;
        if (edges > budget.maxEdges) throw new Limit('public-edge-budget');
        if (found.status === 'unsolvable') { failed.add(startKey); return false; }
        if (found.status !== 'solved') throw new Limit('public-visible-search-budget');
        actions = found.route.map(p => ({ type: 'transfer', source: puzzle.containers[p.source].id, target: puzzle.containers[p.target].id }));
      }
      let current = worlds, cursor = 0;
      const pending: { key: string; action: Move }[] = [], seen = new Set<string>();
      while (current.length) {
        time(); const key = address(current), action = actions ? encode(current[0], actions[cursor++]) : pins.get(observation(current[0]));
        if (!action || seen.has(key)) throw Error('Missing or cyclic visible continuation');
        if (++edges > budget.maxEdges) throw new Limit('public-edge-budget');
        seen.add(key); pending.push({ key, action });
        current = current.flatMap(w => {
          const next = transitionEngine(w.runtime, w.frame.state, w.frame.known, decode(w, action)); if (!next.accepted) throw Error('Invalid public visible continuation');
          return evaluateEngineGoal(w.runtime, next.state) ? [] : [{ ...w, frame: { state: next.state, known: next.known } }];
        });
      }
      for (const p of pending) policy.set(p.key, p.action);
      return true;
    }
    type Node = { worlds: World[]; key: string; predecessors: { from: number; action: Move }[]; win: boolean; action: Move | null };
    const nodes: Node[] = [], indices = new Map<string, number>();
    const add = (ws: World[]) => {
      const key = address(ws), old = indices.get(key); if (old !== undefined) return old;
      if (nodes.length >= budget.maxPhaseStates || ++totalStates > budget.maxTotalStates) throw new Limit('public-state-budget');
      const i = nodes.length; indices.set(key, i); nodes.push({ worlds: ws, key, predecessors: [], win: false, action: null }); return i;
    };
    add(worlds);
    for (let i = 0; i < nodes.length; i++) {
      time(); const node = nodes[i], first = node.worlds[0];
      const forced = node.worlds.some(w => w.id === actualId) ? pins.get(observation(first)) : undefined;
      for (const action of forced ? [forced] : listEngineActions(first.runtime, first.frame.state, first.frame.known).map(a => encode(first, a))) {
        if (++edges > budget.maxEdges) throw new Limit('public-edge-budget');
        const nextWorlds: World[] = []; let changed = false, legal = true;
        for (const w of node.worlds) {
          time(); const next = transitionEngine(w.runtime, w.frame.state, w.frame.known, decode(w, action));
          if (!next.accepted) { legal = false; break; }
          changed ||= next.known.length > w.frame.known.length || next.state.fired.length > w.frame.state.fired.length || evaluateEngineGoal(w.runtime, next.state);
          nextWorlds.push({ ...w, frame: { state: next.state, known: next.known } });
        }
        if (!legal) continue;
        if (changed) {
          // New knowledge/conditions or an observed completion strictly reduces
          // the remaining information task. Neutral cycles never recurse.
          if (groups(nextWorlds).every(solve)) { node.win = true; node.action = action; break; }
        } else {
          const key = address(nextWorlds);
          if (policy.has(key)) { node.win = true; node.action = action; break; }
          if (!failed.has(key)) nodes[add(nextWorlds)].predecessors.push({ from: i, action });
        }
      }
    }
    const queue = nodes.flatMap((n, i) => n.win ? [i] : []);
    for (let q = 0; q < queue.length; q++) for (const p of nodes[queue[q]].predecessors) {
      const from = nodes[p.from]; if (!from.win) { from.win = true; from.action = p.action; queue.push(p.from); }
    }
    for (const n of nodes) if (n.win) policy.set(n.key, n.action); else failed.add(n.key);
    return nodes[0].win;
  }
  const finish = (status: 'pass' | 'fail' | 'unknown', reason: string, certificates: { world: number; route: EngineAction[] }[] = []) => ({ ...binding, status, reason,
    worlds: worldCount, stats: { totalStates, edges, peakWorlds }, certificates, certificatesSha256: sha256(certificates) });
  try {
    const worlds: World[] = [];
    if (kind !== 'cloth' && kind !== 'reveal') {
      for (const world of combinedInventoryWorlds(puzzle)) {
        time(); if (worlds.length >= budget.maxWorlds) throw new Limit('public-world-budget');
        const id = worlds.length;
        if (puzzle.hidden.every(unit => world.runtime.unitColors.get(unit) === runtime.unitColors.get(unit))
          && world.frame.state.contents.every((s, i) => s.length === initial.state.contents[i].length
            && s.every((u, j) => world.runtime.unitColors.get(u) === runtime.unitColors.get(initial.state.contents[i][j])))) actualId = id;
        worlds.push({ id, ...world });
      }
    } else if (kind === 'cloth') {
      const locked = puzzle.containers.filter(c => puzzle.locked.includes(c.id));
      for (const w of concealedInventoryWorlds(puzzle)) {
        time(); if (worlds.length >= budget.maxWorlds) throw new Limit('public-world-budget');
        const contents = initial.state.contents.map((s, i) => { const j = locked.findIndex(c => c.id === puzzle.containers[i].id); return j < 0 ? s : w.units[j]; });
        const frame = { state: { ...initial.state, contents }, known: initial.known };
        const id = worlds.length;
        if (JSON.stringify(contents) === JSON.stringify(initial.state.contents)) actualId = id;
        worlds.push({ id, runtime, frame });
      }
      // Equal-color stable IDs are irrelevant to forward play; identify true
      // contents by colors when inventory enumeration assigns equivalent IDs.
      if (actualId < 0) actualId = worlds.find(w => w.frame.state.contents.every((s, i) => s.length === initial.state.contents[i].length
        && s.every((u, j) => runtime.unitColors.get(u) === runtime.unitColors.get(initial.state.contents[i][j]))))!.id;
    } else {
      // The old enumerator is bounded; request one extra world to turn its
      // private limit into this proof's own explicit unknown result.
      for (const rt of revealWorlds(runtime, initial, budget.maxWorlds + 1)) {
        time(); if (worlds.length >= budget.maxWorlds) throw new Limit('public-world-budget');
        const id = worlds.length;
        if (rt.puzzle.units.every((u, i) => u.color === puzzle.units[i].color)) actualId = id;
        worlds.push({ id, runtime: rt, frame: initial });
      }
    }
    worldCount = worlds.length;
    if (actualId < 0) throw Error('True world missing from public inventory');
    if (!groups(worlds).every(solve)) return finish('fail', 'no-public-policy-for-coupled-route');
    const certificates = worlds.map(w => {
      let belief = groups(worlds).find(g => g.some(x => x.id === w.id)) ?? [], current = w.frame;
      const moves: EngineAction[] = [], visited = new Set<string>();
      while (!evaluateEngineGoal(w.runtime, current.state)) {
        time(); const key = address(belief), action = policy.get(key);
        if (visited.has(key) || !action) throw Error('Cyclic or incomplete disclosure certificate');
        visited.add(key); moves.push(decode({ ...w, frame: current }, action));
        const nextBelief = belief.map(x => {
          const next = transitionEngine(x.runtime, x.frame.state, x.frame.known, decode(x, action)); if (!next.accepted) throw Error('Illegal common preparation');
          return { ...x, frame: { state: next.state, known: next.known } };
        });
        current = nextBelief.find(x => x.id === w.id)!.frame;
        belief = groups(nextBelief).find(g => g.some(x => x.id === w.id)) ?? [];
      }
      replayEngineRoute(w.runtime, w.frame, moves); return { world: w.id, route: moves };
    });
    if (JSON.stringify(certificates[actualId].route) !== JSON.stringify(route)) throw Error('Public proof departed from actual rating route');
    return finish('pass', 'coupled-route-and-all-observed-branches-complete', certificates);
  } catch (e) {
    if (e instanceof Limit || e instanceof Error && e.message === 'world-budget') return finish('unknown', e.message);
    throw e;
  }
}
