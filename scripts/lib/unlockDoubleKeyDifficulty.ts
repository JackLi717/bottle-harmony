import assert from 'node:assert/strict';
import { transitionEngine } from '../../src/game/engine.ts';
import { colorRuns, type RatingGraph, type GraphUnknown } from './unlockRatingGraph.ts';
import { STAGE_DIFFICULTY_METHOD, STAGE_POLICIES, STAGE_LIMITS, replayRatingPath, stagePolicyPhase, stageProgress } from './unlockStageDifficulty.ts';
import { sequentialKeys } from './unlockSequentialKeys.ts';

export const DOUBLE_KEY_DIFFICULTY_METHOD = 'sequential-two-key-planning-v1';
type Check = { rank: number; status: 'passed' | 'failed' };
type End = { rank: number; path: number[] };
class WorkLimit extends Error {}

/** Minimize the maximum of three COUPLED tasks. Every admitted boundary comes
 * from the same public progress policy as single-key evaluation, not shortest
 * complete routes or later grades. Every lower policy is checked before rating. */
export function analyzeDoubleKeyDifficulty(graph: RatingGraph | GraphUnknown, maxWork = 2000000) {
  if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > 50000000) throw new Error('Invalid stage work budget');
  const binding = { method: DOUBLE_KEY_DIFFICULTY_METHOD, stageMethod: STAGE_DIFFICULTY_METHOD, policies: STAGE_POLICIES, budget: { maxWork }, limits: STAGE_LIMITS };
  const empty = { rank: null, stageRanks: null, witness: null };
  if (graph.status === 'unknown') return { ...binding, ...empty, status: 'unknown' as const, reason: `graph-${graph.reason}`, work: 0 };
  const scope = sequentialKeys(graph.runtime.puzzle);
  if (scope.status !== 'supported') return { ...binding, ...empty, status: 'unsupported' as const, reason: scope.reason, work: 0 };
  const keys = scope.keys;
  if (graph.shortestMoves === null) return { ...binding, ...empty, status: 'blocked' as const, reason: 'unsolvable', work: 0 };
  if (graph.nodes.some(n => n.solved && keys.some(t => !n.frame.state.fired.includes(t.id)))) return { ...binding, ...empty, status: 'unsupported' as const, reason: 'optional-key', work: 0 };
  let work = 0;
  const charge = () => { if (work >= maxWork) throw new WorkLimit(); work++; };
  const phases = keys.map(t => stagePolicyPhase(graph, i => graph.nodes[i].frame.state.fired.includes(t.id),
    graph.nodes.map((_, i) => stageProgress(graph, i, graph.runtime.containerIndex.get(t.when.type === 'empty' ? t.when.container : '')!)), charge));
  const sort = stagePolicyPhase(graph, i => graph.nodes[i].solved, graph.nodes.map((_, i) => colorRuns(graph.runtime, graph.nodes[i].frame)), charge);
  const firstPolicies = STAGE_POLICIES.map(p => phases[0].policy(p)), secondPolicies = STAGE_POLICIES.map(p => phases[1].policy(p)), sortPolicies = STAGE_POLICIES.map(p => sort.policy(p));
  const firstChecks: Check[] = [];
  const firstEnds = new Map<number, End & { checks: Check[]; ends: Map<number, End> }>();
  const finalChecks = new Map<number, { checks: Check[]; end: End | null }>();
  const diagnostics = () => ({ firstChecks, boundaries: [...firstEnds].map(([state, e]) => ({ state, rank: e.rank, secondChecks: e.checks, secondStates: [...e.ends.keys()] })), finalChecks: [...finalChecks].map(([state, e]) => ({ state, checks: e.checks })) });
  try {
    for (const [p, config] of STAGE_POLICIES.entries()) {
      const passed = firstPolicies[p].verify(0); firstChecks.push({ rank: config.rank, status: passed ? 'passed' : 'failed' });
      if (passed) for (const [a, path] of firstPolicies[p].witnesses(0, true)) {
        if (Number.isFinite(graph.distances[a]) && !firstEnds.has(a)) firstEnds.set(a, { rank: config.rank, path, checks: [], ends: new Map() });
      }
      for (const [a, first] of firstEnds) {
        for (let q = first.checks.length; q <= p; q++) {
          const passed = secondPolicies[q].verify(a); first.checks.push({ rank: q + 1, status: passed ? 'passed' : 'failed' });
          if (passed) for (const [b, path] of secondPolicies[q].witnesses(a, true)) {
            if (Number.isFinite(graph.distances[b]) && !first.ends.has(b)) first.ends.set(b, { rank: q + 1, path });
          }
        }
        for (const [b, middle] of first.ends) {
          let tail = finalChecks.get(b);
          if (!tail) { tail = { checks: [], end: graph.nodes[b].solved ? { rank: 0, path: [] } : null }; finalChecks.set(b, tail); }
          for (let q = tail.checks.length; !tail.end && q <= p; q++) {
            const passed = sortPolicies[q].verify(b); tail.checks.push({ rank: q + 1, status: passed ? 'passed' : 'failed' });
            if (passed) tail.end = { rank: q + 1, path: sortPolicies[q].witnesses(b, false).values().next().value! };
          }
          if (!tail.end) continue;
          const stageRanks = [first.rank, middle.rank, tail.end.rank] as const, rank = Math.max(...stageRanks);
          if (rank > config.rank) continue;
          const route = replayRatingPath(graph, [0, ...first.path, ...middle.path, ...tail.end.path]);
          const splitPours = [first.path.length, first.path.length + middle.path.length] as const;
          let frame = graph.nodes[0].frame;
          const openedFrames = [];
          for (const [i, action] of route.entries()) {
            const next = transitionEngine(graph.runtime, frame.state, frame.known, action); assert.ok(next.accepted); frame = { state: next.state, known: next.known };
            if (splitPours.includes(i + 1)) openedFrames.push(frame);
          }
          assert.equal(openedFrames.length, 2); assert.ok(splitPours[0] > 0 && splitPours[1] > splitPours[0]);
          return { ...binding, status: 'rated' as const, reason: null, rank, stageRanks, work, ...diagnostics(),
            witness: { route, keys: keys.map(t => t.id), splitPours, unlockStates: [a, b], openedFrames } };
        }
      }
    }
    return { ...binding, ...empty, status: 'unknown' as const, reason: 'outside-policy-range', work, ...diagnostics() };
  } catch (error) {
    if (!(error instanceof WorkLimit)) throw error;
    return { ...binding, ...empty, status: 'unknown' as const, reason: 'policy-work', work, ...diagnostics() };
  }
}
