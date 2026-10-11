import { listEngineActions, transitionEngine, type EngineAction } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import { colorRuns, type RatingGraph, type GraphUnknown } from './unlockRatingGraph.ts';

export const STAGE_DIFFICULTY_METHOD = 'goal-stage-planning-v1';
/** Same preparation/lookahead ladder for the key task and ordinary sorting.
 * There is deliberately no full-solver fallback advertised as a high grade. */
export const STAGE_POLICIES = Object.freeze([
  { chainLimit: 2, lookahead: 0 }, { chainLimit: 4, lookahead: 1 },
  { chainLimit: 6, lookahead: 2 }, { chainLimit: 6, lookahead: 3 },
  { chainLimit: 8, lookahead: 4 }, { chainLimit: 10, lookahead: 6 },
  { chainLimit: 12, lookahead: 8 },
].map((p, i) => Object.freeze({ rank: i + 1, ...p })));
export const STAGE_LIMITS = 'Offline planning proxy, not a human-calibrated percentile or the shipped human-decision-v1 score. Fixed hidden layouts only; no alternative-world fairness proof. All tied shortest retained progress segments must pass a policy; arbitrary legal moves may still fail.';
type Macro = { to: number; path: number[] };
type PolicyCheck = { rank: number; status: 'passed' | 'failed' };
class WorkLimit extends Error {}

/** Public progress before the key is lexicographic: fewer portions in the key
 * bottle, then fewer color runs in OPEN bottles. Once fired, the key task ends;
 * newly exposed contents do not retroactively influence its progress policy. */
export function stageProgress(graph: RatingGraph, index: number, keyContainer: number | null) {
  const frame = graph.nodes[index].frame;
  if (keyContainer === null) return colorRuns(graph.runtime, frame);
  const openRuns = frame.state.contents.reduce((sum, stack, i) => sum + (frame.state.open[i]
    ? stack.filter((u, d) => !d || graph.runtime.unitColors.get(u) !== graph.runtime.unitColors.get(stack[d - 1])).length : 0), 0);
  return frame.state.contents[keyContainer].length * (graph.runtime.puzzle.units.length + 1) + openRuns;
}

/** Re-map quotient state paths onto the actual live frame, keeping stable IDs.
 * A representative's action IDs must never be concatenated across states. */
export function replayRatingPath(graph: RatingGraph, path: readonly number[]) {
  let frame = graph.nodes[0].frame;
  const route: EngineAction[] = [];
  if (path[0] !== 0) throw new Error('Stage witness must start at the initial state');
  for (const index of path.slice(1)) {
    const target = graph.key(graph.nodes[index].frame);
    let found = false;
    for (const action of listEngineActions(graph.runtime, frame.state, frame.known)) {
      const next = transitionEngine(graph.runtime, frame.state, frame.known, action);
      if (next.accepted && graph.key(next) === target) {
        route.push(action); frame = next; found = true; break;
      }
    }
    if (!found) throw new Error('Stage quotient witness is not replayable');
  }
  replayEngineRoute(graph.runtime, graph.nodes[0].frame, route);
  return route;
}

/** Shared unchanged strategy kernel for ordinary, single-key and sequential-key tasks. */
export function stagePolicyPhase(graph: RatingGraph, done: (index: number) => boolean,
  progress: readonly number[], charge: () => void) {
  const cache = new Map<string, Macro[]>();
  // Endpoint selection uses only legal moves and public progress, never exact
  // solution distances, after-key grades, or the reference shortest route.
  const macros = (root: number, limit: number): Macro[] => {
    charge();
    const cacheKey = `${limit}:${root}`, prior = cache.get(cacheKey);
    if (prior) return prior;
    const queue: Macro[] = [{ to: root, path: [] }], seen = new Set([root]), ends = new Map<number, Macro>();
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor]; charge();
      for (const edge of graph.nodes[current.to].edges) {
        charge();
        if (edge.to === current.to) continue;
        const path = [...current.path, edge.to];
        if (done(edge.to) || progress[edge.to] < progress[root]) {
          if (!ends.has(edge.to)) ends.set(edge.to, { to: edge.to, path });
        } else if (path.length < limit && !seen.has(edge.to)) {
          seen.add(edge.to); queue.push({ to: edge.to, path });
        }
      }
    }
    const result = [...ends.values()].sort((a, b) => a.path.length - b.path.length || a.to - b.to);
    cache.set(cacheKey, result); return result;
  };
  const policy = (config: typeof STAGE_POLICIES[number]) => {
    const viability = new Map<string, boolean>(), checked = new Map<number, boolean>(), fronts = new Map<number, Macro[]>();
    const viable = (i: number, depth: number): boolean => {
      charge();
      if (done(i) || depth === 0) return true;
      const key = `${depth}:${i}`, prior = viability.get(key);
      if (prior !== undefined) return prior;
      const result = macros(i, config.chainLimit).some(m => viable(m.to, depth - 1));
      viability.set(key, result); return result;
    };
    const frontier = (i: number) => {
      const prior = fronts.get(i); if (prior) return prior;
      const retained = macros(i, config.chainLimit).filter(m => viable(m.to, config.lookahead));
      const best = retained[0]?.path.length;
      const result = retained.filter(m => m.path.length === best);
      fronts.set(i, result); return result;
    };
    const verify = (i: number): boolean => {
      charge();
      if (done(i)) return true;
      const prior = checked.get(i); if (prior !== undefined) return prior;
      const next = frontier(i);
      // Every nonterminal macro strictly decreases a nonnegative public rank.
      const result = next.length > 0 && next.every(m => verify(m.to));
      checked.set(i, result); return result;
    };
    const witnesses = (root: number, all: boolean) => {
      const queue: { i: number; path: number[] }[] = [{ i: root, path: [] }], seen = new Set([root]), result = new Map<number, number[]>();
      for (let cursor = 0; cursor < queue.length; cursor++) {
        charge(); const row = queue[cursor];
        if (done(row.i)) { result.set(row.i, row.path); if (!all) break; continue; }
        for (const m of frontier(row.i)) if (!seen.has(m.to)) {
          seen.add(m.to); queue.push({ i: m.to, path: [...row.path, ...m.path] });
        }
      }
      return result;
    };
    return { verify, witnesses };
  };
  return { policy };
}

export function analyzeStageDifficulty(graph: RatingGraph | GraphUnknown, maxWork = 2000000) {
  if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > 50000000) throw new Error('Invalid stage work budget');
  const binding = { method: STAGE_DIFFICULTY_METHOD, policies: STAGE_POLICIES, budget: { maxWork }, limits: STAGE_LIMITS };
  const empty = { rank: null, beforeRank: null, afterRank: null, witness: null };
  if (graph.status === 'unknown') return { ...binding, ...empty, status: 'unknown' as const, reason: `graph-${graph.reason}`, work: 0 };
  if (graph.shortestMoves === null) return { ...binding, ...empty, status: 'blocked' as const, reason: 'unsolvable', work: 0 };
  const puzzle = graph.runtime.puzzle;
  const trigger = puzzle.triggers[0];
  if (puzzle.hidden.length || puzzle.triggers.length > 1 || (trigger && trigger.when.type !== 'empty')
    || (trigger && puzzle.locked.some(c => !trigger.unlock.includes(c)))) {
    return { ...binding, ...empty, status: 'unsupported' as const, reason: 'Only visible ordinary sorting or one bottom-key trigger is supported.', work: 0 };
  }
  if (trigger && graph.nodes.some(n => n.solved && !n.frame.state.fired.includes(trigger.id))) {
    return { ...binding, ...empty, status: 'unsupported' as const, reason: 'The key is not mandatory for completion.', work: 0 };
  }
  const keyContainer = trigger?.when.type === 'empty' ? graph.runtime.containerIndex.get(trigger.when.container)! : null;
  let work = 0;
  const charge = () => { if (work >= maxWork) throw new WorkLimit(); work++; };
  const prefixChecks: PolicyCheck[] = [], ordinaryChecks: PolicyCheck[] = [];
  const phase = (key: boolean) => stagePolicyPhase(graph,
    i => key ? graph.nodes[i].frame.state.fired.includes(trigger!.id) : graph.nodes[i].solved,
    graph.nodes.map((_, i) => stageProgress(graph, i, key ? keyContainer : null)), charge);
  const sort = phase(false), before = trigger ? phase(true) : null;
  const afterPolicies = STAGE_POLICIES.map(config => sort.policy(config));
  const candidates = new Map<number, { beforeRank: number; prefix: number[]; afterRank: number | null; afterChecks: PolicyCheck[]; suffix: number[] | null }>();
  const result = (rank: number, beforeRank: number | null, afterRank: number, path: number[], split: number | null, state: number | null) => {
    const route = replayRatingPath(graph, path);
    let unlocked = graph.nodes[0].frame;
    for (const action of route.slice(0, split ?? 0)) {
      const next = transitionEngine(graph.runtime, unlocked.state, unlocked.known, action);
      if (!next.accepted) throw new Error('Stage split witness rejected');
      unlocked = next;
    }
    return { ...binding, status: 'rated' as const, reason: null, rank, beforeRank, afterRank, work,
      prefixChecks, ordinaryChecks, consideredUnlockStates: candidates.size,
      witness: { route, splitPour: split, unlockState: state,
        unlockedFrame: split === null ? null : { state: unlocked.state, known: unlocked.known } },
    };
  };
  try {
    if (graph.nodes[0].solved) return result(0, trigger ? 0 : null, 0, [0], trigger ? 0 : null, trigger ? 0 : null);
    for (const [p, config] of STAGE_POLICIES.entries()) {
      if (!before) {
        const passed = afterPolicies[p].verify(0);
        ordinaryChecks.push({ rank: config.rank, status: passed ? 'passed' : 'failed' });
        if (passed) return result(config.rank, null, config.rank, [0, ...afterPolicies[p].witnesses(0, false).values().next().value!], null, null);
        continue;
      }
      const prefix = before.policy(config), passed = prefix.verify(0);
      prefixChecks.push({ rank: config.rank, status: passed ? 'passed' : 'failed' });
      if (passed) for (const [state, path] of prefix.witnesses(0, true)) {
        // Only admission/coupling consults complete solvability. The key policy
        // itself stops at acquisition and does not inspect the opened contents.
        if (Number.isFinite(graph.distances[state]) && !candidates.has(state)) candidates.set(state,
          { beforeRank: path.length ? config.rank : 0, prefix: path, afterRank: graph.nodes[state].solved ? 0 : null, afterChecks: [], suffix: graph.nodes[state].solved ? [] : null });
      }
      for (const [state, pair] of candidates) {
        for (let q = pair.afterChecks.length; pair.afterRank === null && q <= p; q++) {
          const passed = afterPolicies[q].verify(state);
          pair.afterChecks.push({ rank: STAGE_POLICIES[q].rank, status: passed ? 'passed' : 'failed' });
          if (passed) {
            pair.afterRank = STAGE_POLICIES[q].rank;
            pair.suffix = afterPolicies[q].witnesses(state, false).values().next().value!;
          }
        }
        if (pair.afterRank !== null && Math.max(pair.beforeRank, pair.afterRank) <= config.rank) {
          return { ...result(Math.max(pair.beforeRank, pair.afterRank), pair.beforeRank, pair.afterRank,
            [0, ...pair.prefix, ...pair.suffix!], pair.prefix.length, state), afterChecks: pair.afterChecks };
        }
      }
    }
    return { ...binding, ...empty, status: 'unknown' as const, reason: 'outside-policy-range', work, prefixChecks, ordinaryChecks, consideredUnlockStates: candidates.size };
  } catch (error) {
    if (!(error instanceof WorkLimit)) throw error;
    return { ...binding, ...empty, status: 'unknown' as const, reason: 'policy-work', work, prefixChecks, ordinaryChecks, consideredUnlockStates: candidates.size };
  }
}
