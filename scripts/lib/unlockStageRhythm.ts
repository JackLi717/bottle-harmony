import assert from 'node:assert/strict';
import { transitionEngine, type EngineFrame } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import { colorRuns, type RatingGraph, type GraphUnknown } from './unlockRatingGraph.ts';
import type { analyzeStageDifficulty } from './unlockStageDifficulty.ts';

export const STAGE_RHYTHM_METHOD = 'stage-merge-rhythm-v1';
export const STAGE_RHYTHM_POLICY = Object.freeze({ balancedBeforePercent: Object.freeze({ min: 40, max: 60 }) });

/** One workload measure, no weights: neutral transfers do not complete merges.
 * Integer comparisons keep the inclusive 40/60 boundaries exact. */
export function classifyStageWork(before: number, after: number) {
  if (![before, after, before + after].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid stage merge work');
  const total = before + after;
  if (!total) return { status: 'fail' as const, structure: null, reason: 'no-sorting-work' };
  const { min, max } = STAGE_RHYTHM_POLICY.balancedBeforePercent;
  // BigInt also preserves exact boundaries for any accepted safe-integer input.
  const share = BigInt(before) * 100n, quantity = BigInt(total);
  if (share < quantity * BigInt(min)) return { status: 'fail' as const, structure: null, reason: 'back-loaded' };
  return { status: 'pass' as const, structure: share <= quantity * BigInt(max) ? 'balanced' as const : 'front-loaded' as const, reason: null };
}

/** Use the already selected difficulty witness, never optimize a second route
 * for rhythm or combine unrelated before/after endpoints. Locked liquid counts
 * throughout, so opening a group alone cannot create sorting work. */
export function analyzeStageRhythm(graph: RatingGraph | GraphUnknown, stage: ReturnType<typeof analyzeStageDifficulty>) {
  const binding = { method: STAGE_RHYTHM_METHOD, policy: STAGE_RHYTHM_POLICY, unit: 'color-run-merges' as const };
  const empty = { structure: null, before: null, after: null, total: null, witness: null };
  if (graph.status === 'unknown') return { ...binding, ...empty, status: 'unknown' as const, reason: `graph-${graph.reason}` };
  if (stage.status !== 'rated') return { ...binding, ...empty, status: stage.status, reason: stage.reason };
  const trigger = graph.runtime.puzzle.triggers[0];
  if (!trigger) return { ...binding, ...empty, status: 'not-applicable' as const, reason: 'no-key-stage' };
  const { route, splitPour, unlockedFrame } = stage.witness;
  assert.ok(splitPour !== null && Number.isSafeInteger(splitPour) && splitPour >= 0 && splitPour <= route.length && unlockedFrame, 'Missing paired stage witness');
  const initial = graph.nodes[0].frame;
  const final = replayEngineRoute(graph.runtime, initial, route);
  let frame: EngineFrame = initial;
  let firstFiring: number | null = initial.state.fired.includes(trigger.id) ? 0 : null;
  for (const [i, action] of route.slice(0, splitPour).entries()) {
    const next = transitionEngine(graph.runtime, frame.state, frame.known, action);
    assert.ok(next.accepted, 'Illegal rhythm prefix');
    frame = { state: next.state, known: next.known };
    if (firstFiring === null && frame.state.fired.includes(trigger.id)) firstFiring = i + 1;
  }
  assert.equal(firstFiring, splitPour, 'Rhythm split must be the first key firing');
  assert.deepEqual(frame, unlockedFrame, 'Rhythm must use the actual paired unlocked frame');
  const initialRuns = colorRuns(graph.runtime, initial), unlockedRuns = colorRuns(graph.runtime, frame), finalRuns = colorRuns(graph.runtime, final);
  assert.equal(finalRuns, graph.runtime.puzzle.colors.length, 'Expected complete classic color groups');
  const before = initialRuns - unlockedRuns, after = unlockedRuns - finalRuns;
  return { ...binding, ...classifyStageWork(before, after), before, after, total: before + after,
    witness: { splitPour, initialRuns, unlockedRuns, finalRuns } };
}
