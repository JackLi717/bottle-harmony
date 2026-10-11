import assert from 'node:assert/strict';
import { transitionEngine } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import { colorRuns, type RatingGraph, type GraphUnknown } from './unlockRatingGraph.ts';
import { classifyStageWork, STAGE_RHYTHM_POLICY } from './unlockStageRhythm.ts';
import type { analyzeDoubleKeyDifficulty } from './unlockDoubleKeyDifficulty.ts';
import { validateDoubleKeyWitness } from './unlockSequentialKeys.ts';

/** Preserve the existing before/after rule at the final key boundary. Keep all
 * three raw quantities; no invented adjacent-stage thresholds or weights. */
export function analyzeDoubleKeyRhythm(graph: RatingGraph | GraphUnknown, stage: ReturnType<typeof analyzeDoubleKeyDifficulty>) {
  const binding = { method: 'sequential-two-key-merge-rhythm-v1', policy: STAGE_RHYTHM_POLICY, unit: 'color-run-merges', grouping: 'all-key-preparation-versus-final-sort' };
  const empty = { stageWork: null, before: null, after: null, total: null, structure: null, witness: null };
  if (graph.status === 'unknown') return { ...binding, ...empty, status: 'unknown' as const, reason: `graph-${graph.reason}` };
  if (stage.status !== 'rated') return { ...binding, ...empty, status: stage.status, reason: stage.reason };
  const initial = graph.nodes[0].frame, w = stage.witness;
  validateDoubleKeyWitness(graph.runtime.puzzle, w);
  let frame = initial;
  const runs = [colorRuns(graph.runtime, initial)];
  for (const [i, action] of w.route.entries()) {
    const next = transitionEngine(graph.runtime, frame.state, frame.known, action); assert.ok(next.accepted);
    frame = { state: next.state, known: next.known };
    for (const [j, split] of w.splitPours.entries()) if (i + 1 === split) {
      assert.deepEqual(frame, w.openedFrames[j]); assert.ok(frame.state.fired.includes(w.keys[j]));
      assert.ok(j || !frame.state.fired.includes(w.keys[1])); runs.push(colorRuns(graph.runtime, frame));
    }
  }
  replayEngineRoute(graph.runtime, initial, w.route);
  runs.push(colorRuns(graph.runtime, frame)); assert.equal(runs.length, 4); assert.equal(runs[3], graph.runtime.puzzle.colors.length);
  const stageWork = runs.slice(0, 3).map((n, i) => n - runs[i + 1]);
  const before = stageWork[0] + stageWork[1], after = stageWork[2];
  return { ...binding, ...classifyStageWork(before, after), stageWork, before, after, total: before + after, witness: { splitPours: w.splitPours, runs } };
}
