import assert from 'node:assert/strict';
import type { EngineAction } from '../../src/game/engine.ts';
import { compileSortingPuzzle, initialEngineState } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import { engineFixture } from '../../src/game/engineExamples.ts';
import { initialBoard } from '../../src/game/model.ts';
import { structureKey } from '../../src/game/generation.ts';
import { generatedUnlockTrials } from '../../src/game/unlockGenerated.ts';
import { batchRootKey, reconstructBatchClassic, UNLOCK_BATCH_RECIPE, type BatchOrigin } from './unlockBatchGeneration.ts';
import { sha256 } from './unlockRatingEvidence.ts';
import { buildRatingGraph } from './unlockRatingGraph.ts';
import { analyzeStageDifficulty, STAGE_DIFFICULTY_METHOD } from './unlockStageDifficulty.ts';
import { analyzeStageRhythm, STAGE_RHYTHM_METHOD } from './unlockStageRhythm.ts';

export const LOCK_WIDTH_METHOD = 'same-classic-lock-width-v1';
export const LOCK_WIDTH_RECIPE = Object.freeze({ method: LOCK_WIDTH_METHOD,
  cohort: 'all-frozen-internal-100-bases', keys: 'original-key-fixed', positions: 'original-classic-order-fixed',
  locks: 'all-nonempty-nonkey-subsets-of-size-1-2-3',
  graph: UNLOCK_BATCH_RECIPE.graph, maxStageWork: UNLOCK_BATCH_RECIPE.maxStageWork,
  difficultyMethod: STAGE_DIFFICULTY_METHOD, rhythmMethod: STAGE_RHYTHM_METHOD,
  diagnosticTarget: UNLOCK_BATCH_RECIPE.target,
  publicInformation: 'not-evaluated', visualTemplates: 'not-evaluated', productionAcceptance: 'not-evaluated',
});

type FrozenEntry = { number: number; origin: BatchOrigin; overlay: { key: number; locked: number[]; order: number[] };
  puzzle: ReturnType<typeof engineFixture>; route: EngineAction[]; classicStructureKey: string; sourceSha256: string;
  rank: number; beforeRank: number; afterRank: number; classicScore: number | null };
export type LockStudyBase = { number: number; origin: BatchOrigin; root: string; isRoot: boolean; key: number;
  board: string[][]; classicScore: number | null; classicRoute: EngineAction[]; structureKey: string;
  frozen: { width: number; rank: number; beforeRank: number; afterRank: number }; sourceSha256: string };

/** Reconstruct every source, including low classic scores. No difficulty selection.
 * Replay the frozen route with locks removed and IDs mapped back to the classic
 * positions: this proves the exact reconstructed base, without relying on seeds alone. */
export function lockStudyBases(input: unknown): LockStudyBase[] {
  generatedUnlockTrials(input);
  const { evidenceSha256, ...payload } = input as { evidenceSha256: string; entries: FrozenEntry[] };
  assert.equal(evidenceSha256, sha256(payload), 'Frozen bank hash differs');
  const bases = payload.entries.map(row => {
    const classic = reconstructBatchClassic(row.origin), board = initialBoard(classic).map(b => [...b]);
    assert.equal(row.classicStructureKey, structureKey(classic));
    assert.ok(Number.isSafeInteger(row.overlay.key) && board[row.overlay.key]?.length === 4);
    assert.deepEqual([...row.overlay.order].sort((a, b) => a - b), board.map((_, i) => i));
    const colors = new Map(row.puzzle.units.map(u => [u.id, u.color]));
    assert.deepEqual(row.puzzle.containers.map(c => c.units.map(u => colors.get(u))), row.overlay.order.map(i => board[i]));
    const ids = new Map(row.puzzle.containers.map((c, i) => [c.id, `b${row.overlay.order[i]}`]));
    const classicRoute = row.route.map(a => {
      assert.equal(a.type, 'transfer'); assert.ok(ids.has(a.source) && ids.has(a.target));
      return { type: 'transfer' as const, source: ids.get(a.source)!, target: ids.get(a.target)! };
    });
    const runtime = compileSortingPuzzle(engineFixture(`study-classic-${row.number}`, board));
    replayEngineRoute(runtime, initialEngineState(runtime), classicRoute);
    const source = { number: row.number, origin: row.origin, root: batchRootKey(row.origin), isRoot: !row.origin.mutation,
      key: row.overlay.key, board, classicScore: row.classicScore, classicRoute, structureKey: row.classicStructureKey,
      frozen: { width: row.origin.template, rank: row.rank, beforeRank: row.beforeRank, afterRank: row.afterRank } };
    return { ...source, sourceSha256: sha256(source) };
  });
  assert.equal(new Set(bases.map(b => b.structureKey)).size, bases.length, 'Duplicate study base');
  return bases;
}

function* combinations(values: number[], count: number, head: number[] = []): Generator<number[]> {
  if (!count) { yield head; return; }
  for (let i = 0; i <= values.length - count; i++) yield* combinations(values.slice(i + 1), count - 1, [...head, values[i]]);
}

/** These are rule probes: fixed positions may not form a contiguous visual box.
 * Empty bottles are excluded for every width, with no width-specific fill/color filter. */
export function lockStudyOverlays(base: LockStudyBase) {
  const eligible = base.board.flatMap((stack, i) => stack.length && i !== base.key ? [i] : []);
  return ([1, 2, 3] as const).flatMap(width => [...combinations(eligible, width)].map(locked => ({ width, locked,
    puzzle: engineFixture(`lock-study-${base.number}-${locked.join('-')}`, base.board, { locked,
      triggers: [{ id: 'key-a', when: { type: 'empty', container: `b${base.key}` }, unlock: locked.map(i => `b${i}`) }] }),
  })));
}
export type LockStudyOverlay = ReturnType<typeof lockStudyOverlays>[number];
export type LockStudyLimits = { graph: { maxStates: number; maxEdges: number }; maxStageWork: number };
export function evaluateLockStudyOverlay(base: LockStudyBase, overlay: LockStudyOverlay, limits: LockStudyLimits = LOCK_WIDTH_RECIPE) {
  const graph = buildRatingGraph(overlay.puzzle, limits.graph.maxStates, limits.graph.maxEdges);
  const stage = analyzeStageDifficulty(graph, limits.maxStageWork), rhythm = analyzeStageRhythm(graph, stage);
  const solvability = graph.status === 'unknown' ? 'unknown' : graph.shortestMoves === null ? 'unsolvable' : 'solvable';
  const target = stage.status !== 'rated' ? 'unknown' : stage.rank >= LOCK_WIDTH_RECIPE.diagnosticTarget.min
    && stage.rank <= LOCK_WIDTH_RECIPE.diagnosticTarget.max ? 'pass' : 'fail';
  // Only the old rank+rhythm prefilters, never a complete acceptance result.
  const prefilter = solvability === 'unsolvable' || target === 'fail' || rhythm.status === 'fail' ? 'fail'
    : target === 'pass' && rhythm.status === 'pass' ? 'pass' : 'unknown';
  const binding = { method: LOCK_WIDTH_METHOD, baseSha256: base.sourceSha256, width: overlay.width,
    locked: overlay.locked, definitionSha256: sha256(overlay.puzzle), limits };
  const evidence = { solvability, graph: graph.status === 'complete'
    ? { status: graph.status, states: graph.nodes.length, edges: graph.edges, shortestMoves: graph.shortestMoves, route: graph.route }
    : graph, stage, rhythm, prefilter };
  return { ...binding, ...evidence, evidenceSha256: sha256({ binding, evidence }) };
}
export type LockStudyResult = ReturnType<typeof evaluateLockStudyOverlay>;
export type LockStudyRecord = { base: LockStudyBase; results: LockStudyResult[] };

const ranks = () => ({ before: {} as Record<string, number>, after: {} as Record<string, number>, whole: {} as Record<string, number> });
const increment = (counts: Record<string, number>, key: string | number) => { counts[key] = (counts[key] ?? 0) + 1; };
function summarizeCohort(records: LockStudyRecord[]) {
  const widths = ([1, 2, 3] as const).map(width => {
    const rows = records.flatMap(r => r.results.filter(s => s.width === width));
    const histogram = ranks(), prefiltered = ranks();
    for (const row of rows) if (row.stage.status === 'rated') {
      for (const counts of row.prefilter === 'pass' ? [histogram, prefiltered] : [histogram]) {
        increment(counts.before, row.stage.beforeRank!); increment(counts.after, row.stage.afterRank!); increment(counts.whole, row.stage.rank);
      }
    }
    return { width, probes: rows.length, rated: rows.filter(r => r.stage.status === 'rated').length,
      unsolvable: rows.filter(r => r.solvability === 'unsolvable').length, unknown: rows.filter(r => r.stage.status === 'unknown').length,
      other: rows.filter(r => r.stage.status !== 'rated' && r.stage.status !== 'unknown' && r.solvability !== 'unsolvable').length,
      histogram, prefilterPass: rows.filter(r => r.prefilter === 'pass').length, prefiltered };
  });
  const pairs = ([1, 2] as const).map(width => {
    const changes = { before: { lower: 0, same: 0, higher: 0 }, after: { lower: 0, same: 0, higher: 0 }, whole: { lower: 0, same: 0, higher: 0 } };
    const statusPairs: Record<string, number> = {};
    let total = 0, rated = 0;
    const examples: { base: number; smaller: number[]; larger: number[]; before: number[]; after: number[]; whole: number[] }[] = [];
    for (const { base, results } of records) {
      for (const small of results.filter(r => r.width === width)) for (const large of results.filter(r => r.width === width + 1)) {
        if (!small.locked.every(i => large.locked.includes(i))) continue;
        total++;
        const status = (r: LockStudyResult) => r.stage.status === 'rated' ? 'rated' : r.solvability === 'unsolvable' ? 'unsolvable' : r.stage.status;
        increment(statusPairs, `${status(small)}→${status(large)}`);
        assert.ok(!(small.solvability === 'unsolvable' && large.solvability === 'solvable'), 'More locks cannot restore a proven unsolvable board with the same key');
        if (small.stage.status !== 'rated' || large.stage.status !== 'rated') continue;
        rated++;
        for (const [name, field] of [['before', 'beforeRank'], ['after', 'afterRank'], ['whole', 'rank']] as const) {
          const a = small.stage[field]!, b = large.stage[field]!;
          changes[name][b < a ? 'lower' : b === a ? 'same' : 'higher']++;
        }
        // One deterministic counterexample of each after-stage direction, not hand-picked.
        const direction = large.stage.afterRank < small.stage.afterRank ? 'lower' : large.stage.afterRank > small.stage.afterRank ? 'higher' : 'same';
        if (direction !== 'same' && !examples.some(e => (e.after[1] < e.after[0] ? 'lower' : 'higher') === direction)) examples.push({
          base: base.number, smaller: small.locked, larger: large.locked,
          before: [small.stage.beforeRank!, large.stage.beforeRank!], after: [small.stage.afterRank, large.stage.afterRank], whole: [small.stage.rank, large.stage.rank],
        });
      }
    }
    return { from: width, to: width + 1, total, rated, excluded: total - rated, changes, statusPairs, examples };
  });
  return { bases: records.length, widths, pairs };
}

/** Unfiltered results first. Root-only and source-profile strata expose repeated
 * variants and recipe confounding; pair signs are descriptive, not independent trials. */
export function summarizeLockStudy(records: LockStudyRecord[]) {
  return { all: summarizeCohort(records), roots: summarizeCohort(records.filter(r => r.base.isRoot)),
    profiles: [1, 2, 3].map(profile => ({ profile, ...summarizeCohort(records.filter(r => r.base.origin.template === profile)) })) };
}
