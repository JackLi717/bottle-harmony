import assert from 'node:assert/strict';
import { makeCandidate, makeAnchoredCandidate, PRODUCTION_COLORS, parseGenerationConfig, structureKey } from '../../src/game/generation.ts';
import { parseLevel, initialBoard } from '../../src/game/model.ts';
import { engineFixture } from '../../src/game/engineExamples.ts';
import { solveBoard, replaySolution } from '../../src/game/solver.ts';
import { hasCleanStart } from '../../src/game/startQuality.ts';
import { buildRatingGraph } from './unlockRatingGraph.ts';
import { analyzeStageDifficulty } from './unlockStageDifficulty.ts';
import { analyzeStageRhythm } from './unlockStageRhythm.ts';
import { auditUnlockVisualTemplates } from './unlockVisualTemplates.ts';
import { proveSingleKeyDisclosure } from './unlockPublicDisclosure.ts';
import { acceptSingleKey } from './unlockSingleKeyAcceptance.ts';
import { extractUnlockRating, ratingComparisonSet, sha256, type RatingInput } from './unlockRatingEvidence.ts';
import { unlockClassicReferences } from './unlockClassicReference.ts';

export const UNLOCK_BATCH_METHOD = 'classic-key-batch-v1';
export const UNLOCK_BATCH_RECIPE = Object.freeze({ method: UNLOCK_BATCH_METHOD, seed: 20300000, addressing: 'contiguous-per-template-v1', count: 100,
  target: { min: 4, max: 6 }, exploration: 'bounded-open-layer-swaps-v1', maxPerRoot: 8, templates: [1, 2, 3] as const, maxCandidates: 50000,
  profiles: { single: 'six-colors-one-spare', double: 'five-or-six-colors-spread-spares', triple: 'five-colors-spread-spares-three-hidden-colors' },
  graph: { maxStates: 60000, maxEdges: 1000000 }, maxStageWork: 2000000,
  disclosure: { maxWorlds: 10000, maxStatesPerWorld: 100000, maxTotalStates: 10000000, maxMilliseconds: 30000 },
});
export type BatchOrigin = { seed: number; colors: number; template: 1 | 2 | 3; generator: 'balanced-shuffle-v1' | 'anchored-shuffle-v1'; mutation?: { bottle: number; first: number; second: number } };
/** Internal classic source profile: distribute spare capacity without adding
 * bottles or claiming solvability from the construction. Solver validation follows. */
export function reconstructBatchClassic(origin: BatchOrigin) {
  assert.ok(Number.isSafeInteger(origin.seed) && origin.seed >= 0 && origin.seed <= 0xffffffff);
  assert.ok(origin.colors === 5 || origin.colors === 6); assert.ok([1, 2, 3].includes(origin.template));
  assert.ok(origin.generator === 'balanced-shuffle-v1' || origin.generator === 'anchored-shuffle-v1');
  const config = parseGenerationConfig({ colors: PRODUCTION_COLORS.slice(0, origin.colors), emptyBottles: origin.template === 1 ? 1 : 2,
    minSolutionMoves: 1, maxSolutionMoves: 80, mixing: 'relaxed' });
  const raw = (origin.generator === 'balanced-shuffle-v1' ? makeCandidate : makeAnchoredCandidate)(origin.seed, 0, config);
  const board = raw.bottles.map(b => [...b.layers]);
  if (origin.template !== 1) for (let i = 0; i < 2; i++) board[origin.colors + i] = board[i].splice(2);
  const mutation = origin.mutation;
  if (mutation) {
    assert.ok(Number.isSafeInteger(mutation.bottle) && mutation.bottle >= 0 && mutation.bottle < board.length);
    const stack = board[mutation.bottle];
    assert.ok(Number.isSafeInteger(mutation.first) && Number.isSafeInteger(mutation.second) && mutation.first >= 0 && mutation.first < mutation.second && mutation.second < stack.length);
    assert.notEqual(stack[mutation.first], stack[mutation.second]);
    [stack[mutation.first], stack[mutation.second]] = [stack[mutation.second], stack[mutation.first]];
  }
  return parseLevel({ ...raw, id: `${raw.id}-${origin.template === 1 ? 'whole' : 'spread'}${mutation ? `-m-${mutation.bottle}-${mutation.first}-${mutation.second}` : ''}`, bottles: raw.bottles.map((b, i) => ({ ...b, layers: board[i] })) });
}
function* combinations(values: readonly number[], count: number, head: number[] = []): Generator<number[]> {
  if (!count) { yield head; return; }
  for (let i = 0; i <= values.length - count; i++) yield* combinations(values.slice(i + 1), count - 1, [...head, values[i]]);
}
export function batchOverlays(origin: BatchOrigin) {
  const classic = reconstructBatchClassic(origin), board = initialBoard(classic);
  const eligible = board.flatMap((b, i) => (origin.template === 1 ? b.length === 4 : b.length === 2) ? [i] : []);
  const groups = origin.template === 3
    ? board.flatMap((b, i) => b.length === 4 ? [...combinations(eligible, 2)].map(pair => [i, ...pair]) : [])
      .filter(group => new Set(group.flatMap(i => board[i])).size <= 3)
    : [...combinations(eligible, origin.template)];
  return groups.flatMap(locked => board.flatMap((b, key) => {
    if (b.length !== 4 || locked.includes(key)) return [];
    // Put the chosen group in consecutive bottom-row slots. This is a display
    // permutation of the same classic board, not a new inventory or easier task.
    const order = board.map((_, i) => i).filter(i => !locked.includes(i)); order.push(...locked);
    const keyIndex = order.indexOf(key), targets = locked.map(i => order.indexOf(i));
    const puzzle = engineFixture(`internal-key-${origin.seed}-${origin.template}-${key}-${locked.join('-')}${origin.mutation ? `-m-${origin.mutation.bottle}-${origin.mutation.first}-${origin.mutation.second}` : ''}`, order.map(i => board[i]), {
      locked: targets, triggers: [{ id: 'key-a', when: { type: 'empty', container: `b${keyIndex}` }, unlock: targets.map(i => `b${i}`) }],
    });
    return [{ key, locked, order, puzzle }];
  }));
}
export function batchRootKey(origin: BatchOrigin) {
  const { mutation: _mutation, ...root } = origin; return sha256(root);
}
export function neighborOrigins(record: BatchCandidateResult): BatchOrigin[] {
  if (record.source.origin.mutation) return [];
  return record.source.classic.bottles.flatMap((bottle, i) => {
    if (record.source.overlay.locked.includes(i)) return [];
    return bottle.layers.flatMap((color, first) => bottle.layers.flatMap((other, second) => first < second && color !== other
      ? [{ ...record.source.origin, mutation: { bottle: i, first, second } }] : []));
  });
}
export type BatchCandidateResult = NonNullable<ReturnType<typeof evaluateBatchCandidate>>;
export function batchOrigin(template: 1 | 2 | 3, index: number): BatchOrigin {
  assert.ok(Number.isSafeInteger(index) && index >= 0 && index < UNLOCK_BATCH_RECIPE.maxCandidates);
  return { seed: UNLOCK_BATCH_RECIPE.seed + index, colors: template === 1 ? 6 : template === 3 ? 5 : index % 2 ? 6 : 5, template,
    generator: index % 4 < 2 ? 'anchored-shuffle-v1' : 'balanced-shuffle-v1' };
}

export function evaluateBatchCandidate(origin: BatchOrigin, onAttempt: (stage: string, status: string, reason: string | null) => void = () => {}) {
  const classic = reconstructBatchClassic(origin);
  if (!hasCleanStart(classic)) { onAttempt('classic-start', 'fail', 'more-than-two-same-color'); return null; }
  const solved = solveBoard(initialBoard(classic), { maxStates: 100000, maxMilliseconds: 30000 });
  onAttempt('classic-solution', solved.status === 'solved' ? 'pass' : solved.status === 'unsolvable' ? 'fail' : 'unknown', solved.status);
  if (solved.status !== 'solved') return null;
  replaySolution(initialBoard(classic), solved.route, 4);
  for (const overlay of batchOverlays(origin)) {
    const { puzzle } = overlay;
    const visual = auditUnlockVisualTemplates(puzzle);
    if (visual.status !== 'pass') { onAttempt('template', visual.status, visual.issues.map(i => i.code).join(',')); continue; }
    const graph = buildRatingGraph(puzzle, UNLOCK_BATCH_RECIPE.graph.maxStates, UNLOCK_BATCH_RECIPE.graph.maxEdges);
    if (graph.status !== 'complete') { onAttempt('graph', 'unknown', graph.reason); continue; }
    if (graph.shortestMoves === null) { onAttempt('solvability', 'fail', 'unsolvable'); continue; }
    const stage = analyzeStageDifficulty(graph, UNLOCK_BATCH_RECIPE.maxStageWork);
    if (stage.status !== 'rated') { onAttempt('difficulty', 'unknown', stage.reason); continue; }
    if (stage.rank < UNLOCK_BATCH_RECIPE.target.min || stage.rank > UNLOCK_BATCH_RECIPE.target.max) { onAttempt('difficulty', 'fail', `rank-${stage.rank}`); continue; }
    const rhythm = analyzeStageRhythm(graph, stage);
    if (rhythm.status !== 'pass') { onAttempt('rhythm', rhythm.status, rhythm.reason); continue; }
    const disclosure = proveSingleKeyDisclosure(puzzle, stage.witness.route, UNLOCK_BATCH_RECIPE.disclosure);
    if (disclosure.status !== 'pass') { onAttempt('public-information', disclosure.status, disclosure.reason); continue; }
    const input: RatingInput = { puzzle, design: { role: 'challenge', family: `generated-box-${origin.template}`, purpose: { event: 'key', description: 'One mandatory key followed by whole-board sorting; uniform batch acceptance.' } } };
    const rating = extractUnlockRating(input, ratingComparisonSet([input]), UNLOCK_BATCH_RECIPE.graph.maxStates, UNLOCK_BATCH_RECIPE.graph.maxEdges, UNLOCK_BATCH_RECIPE.maxStageWork);
    const acceptance = acceptSingleKey(puzzle, rating, { target: UNLOCK_BATCH_RECIPE.target, disclosureBudget: UNLOCK_BATCH_RECIPE.disclosure });
    onAttempt('acceptance', acceptance.status, acceptance.reasons.map(r => r.code).join(','));
    if (acceptance.status !== 'pass') continue;
    const classicReferences = unlockClassicReferences(puzzle, rating.status === 'complete' ? rating.evidence.stageDifficulty : null, rating.evidenceSha256);
    if (classicReferences.base.status !== 'rated') { onAttempt('classic-reference', 'unknown', classicReferences.base.reason); continue; }
    const source = { method: UNLOCK_BATCH_METHOD, origin, classic, solution: solved.route, structureKey: structureKey(classic),
      overlay: { key: overlay.key, locked: overlay.locked, order: overlay.order } };
    return { puzzle, source, sourceSha256: sha256(source), rating, acceptance, classicReferences };
  }
  return null;
}
