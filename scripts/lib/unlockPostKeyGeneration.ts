import assert from 'node:assert/strict';
import { makeCandidate, makeAnchoredCandidate, PRODUCTION_COLORS, parseGenerationConfig, structureKey } from '../../src/game/generation.ts';
import { parseLevel, initialBoard } from '../../src/game/model.ts';
import { engineFixture } from '../../src/game/engineExamples.ts';
import { solveBoard, replaySolution } from '../../src/game/solver.ts';
import { hasCleanStart } from '../../src/game/startQuality.ts';
import { buildRatingGraph } from './unlockRatingGraph.ts';
import { analyzeStageDifficulty } from './unlockStageDifficulty.ts';
import { analyzeStageRhythm } from './unlockStageRhythm.ts';
import { acceptSingleKey } from './unlockSingleKeyAcceptance.ts';
import { extractUnlockRating, ratingComparisonSet, sha256, type RatingInput } from './unlockRatingEvidence.ts';
import { unlockClassicReferences } from './unlockClassicReference.ts';

/** A generation filter, not a new difficulty or quality formula. */
export const POST_KEY_RECIPE = Object.freeze({ method: 'classic-key-postchallenge-v1', seed: 21000000, count: 20,
  templateSeedOffset: { 2: 1000000, 3: 0 },
  target: { min: 4, max: 6 }, afterMin: 3, templates: [2, 3] as const, colors: [7, 8] as const,
  allocation: 'classic-core-with-three-color-bridge-v1', cuts: [1, 2, 3] as const,
  maxCandidates: 10000, maxPerRoot: 4, graph: { maxStates: 250000, maxEdges: 4000000 }, maxStageWork: 5000000,
  disclosure: { maxWorlds: 10000, maxStatesPerWorld: 100000, maxTotalStates: 10000000, maxMilliseconds: 60000 },
});
export type PostKeyOrigin = { seed: number; colors: number; template: 2 | 3; cut: 1 | 2 | 3;
  generator: 'balanced-shuffle-v1' | 'anchored-shuffle-v1'; mutation?: { bottle: number; first: number; second: number } };

export function postKeyOrigin(template: 2 | 3, index: number): PostKeyOrigin {
  assert.ok([2, 3].includes(template) && Number.isSafeInteger(index) && index >= 0 && index < POST_KEY_RECIPE.maxCandidates);
  return { seed: POST_KEY_RECIPE.seed + POST_KEY_RECIPE.templateSeedOffset[template] + index, colors: POST_KEY_RECIPE.colors[index % POST_KEY_RECIPE.colors.length], template,
    cut: POST_KEY_RECIPE.cuts[index % POST_KEY_RECIPE.cuts.length], generator: index % 4 < 2 ? 'anchored-shuffle-v1' : 'balanced-shuffle-v1' };
}
export function reconstructPostKeyClassic(origin: PostKeyOrigin) {
  assert.ok(Number.isSafeInteger(origin.seed) && origin.seed >= 0 && origin.seed <= 0xffffffff);
  assert.ok(POST_KEY_RECIPE.colors.some(c => c === origin.colors) && [2, 3].includes(origin.template) && [1, 2, 3].includes(origin.cut));
  assert.ok(['balanced-shuffle-v1', 'anchored-shuffle-v1'].includes(origin.generator));
  // Keep a classic four/five-color, one-spare core. The other three colors
  // occupy a mixed bridge and a 4 + cut + (4-cut) concealed-capacity group.
  // Unlocking provides the second spare's capacity, without pre-sorting the core.
  const colors = PRODUCTION_COLORS.slice(0, origin.colors), [a, b, c] = colors;
  const config = parseGenerationConfig({ colors: colors.slice(3), emptyBottles: 1,
    minSolutionMoves: 1, maxSolutionMoves: 80, mixing: 'relaxed' });
  const raw = (origin.generator === 'balanced-shuffle-v1' ? makeCandidate : makeAnchoredCandidate)(origin.seed, 0, config);
  const concealed = [a, a, b, b, a, a, c, c];
  const board = [...raw.bottles.map(b => [...b.layers]), [b, b, c, c], concealed.slice(0, 4),
    concealed.slice(4, 4 + origin.cut), concealed.slice(4 + origin.cut)];
  if (origin.mutation) {
    const { bottle, first, second } = origin.mutation;
    assert.ok(Number.isSafeInteger(bottle) && bottle >= 0 && bottle < board.length);
    assert.ok(Number.isSafeInteger(first) && Number.isSafeInteger(second) && first >= 0 && first < second && second < board[bottle].length);
    assert.notEqual(board[bottle][first], board[bottle][second]);
    [board[bottle][first], board[bottle][second]] = [board[bottle][second], board[bottle][first]];
  }
  return parseLevel({ ...raw, colors, id: `post-classic-${origin.seed}-${origin.colors}-${origin.cut}${origin.mutation ? `-m-${origin.mutation.bottle}-${origin.mutation.first}-${origin.mutation.second}` : ''}`,
    bottles: board.map((layers, i) => ({ id: `post-bottle-${i}`, layers })) });
}

/** Count the same inventory-consistent worlds as the disclosure proof, including
 * concealed bottle lengths. This is a budget precheck, never a fairness proof. */
export function postKeyWorldCount(board: readonly (readonly string[])[], locked: readonly number[]) {
  const inventory = new Map<string, number>();
  for (const i of locked) for (const c of board[i]) inventory.set(c, (inventory.get(c) ?? 0) + 1);
  const factorial = (n: number): number => n < 2 ? 1 : n * factorial(n - 1);
  const total = [...inventory.values()].reduce((n, v) => n + v, 0);
  const lengthWays = (n: number, slots: number): number => !slots ? Number(n === 0)
    : Array.from({ length: Math.min(n, 4) + 1 }, (_, size) => lengthWays(n - size, slots - 1)).reduce((n, v) => n + v, 0);
  return factorial(total) / [...inventory.values()].reduce((n, v) => n * factorial(v), 1) * lengthWays(total, locked.length);
}
export function postKeyOverlays(origin: PostKeyOrigin) {
  const board = initialBoard(reconstructPostKeyClassic(origin));
  const n = board.length, groups = [origin.template === 3 ? [n - 3, n - 2, n - 1] : [n - 2, n - 1]];
  return groups.flatMap(locked => board.flatMap((b, key) => {
    if (key >= origin.colors - 3 || !b.length || locked.includes(key)) return [];
    const order = board.map((_, i) => i).filter(i => !locked.includes(i)); order.push(...locked);
    const targets = locked.map(i => order.indexOf(i)), keyIndex = order.indexOf(key);
    const puzzle = engineFixture(`post-key-${origin.seed}-${origin.template}-${origin.cut}-${key}-${locked.join('-')}${origin.mutation ? `-m-${origin.mutation.bottle}-${origin.mutation.first}-${origin.mutation.second}` : ''}`,
      order.map(i => board[i]), { locked: targets, triggers: [{ id: 'key-a', when: { type: 'empty', container: `b${keyIndex}` }, unlock: targets.map(i => `b${i}`) }] });
    return [{ key, locked, order, puzzle, worlds: postKeyWorldCount(board, locked) }];
  }));
}
export function postKeyStageInTarget(stage: ReturnType<typeof analyzeStageDifficulty>) {
  return stage.status === 'rated' && stage.rank >= POST_KEY_RECIPE.target.min && stage.rank <= POST_KEY_RECIPE.target.max && stage.afterRank >= POST_KEY_RECIPE.afterMin;
}
export function evaluatePostKeyCandidate(origin: PostKeyOrigin, onAttempt: (stage: string, status: string, reason: string | null) => void = () => {}) {
  const classic = reconstructPostKeyClassic(origin);
  if (!hasCleanStart(classic)) { onAttempt('classic-start', 'fail', 'more-than-two-same-color'); return null; }
  const solved = solveBoard(initialBoard(classic), { maxStates: 100000, maxMilliseconds: 30000 });
  onAttempt('classic-solution', solved.status === 'solved' ? 'pass' : solved.status === 'unsolvable' ? 'fail' : 'unknown', solved.status);
  if (solved.status !== 'solved') return null;
  replaySolution(initialBoard(classic), solved.route, 4);
  for (const overlay of postKeyOverlays(origin)) {
    if (overlay.worlds > POST_KEY_RECIPE.disclosure.maxWorlds) { onAttempt('public-information', 'unknown', 'public-world-budget'); continue; }
    const graph = buildRatingGraph(overlay.puzzle, POST_KEY_RECIPE.graph.maxStates, POST_KEY_RECIPE.graph.maxEdges);
    if (graph.status !== 'complete') { onAttempt('graph', 'unknown', graph.reason); continue; }
    if (graph.shortestMoves === null) { onAttempt('solvability', 'fail', 'unsolvable'); continue; }
    const stage = analyzeStageDifficulty(graph, POST_KEY_RECIPE.maxStageWork);
    if (stage.status !== 'rated') { onAttempt('difficulty', 'unknown', stage.reason); continue; }
    if (!postKeyStageInTarget(stage)) { onAttempt('generation-target', 'fail', `whole-${stage.rank}-after-${stage.afterRank}`); continue; }
    const rhythm = analyzeStageRhythm(graph, stage);
    if (rhythm.status !== 'pass') { onAttempt('rhythm', rhythm.status, rhythm.reason); continue; }
    const input: RatingInput = { puzzle: overlay.puzzle, design: { role: 'challenge', family: `post-key-box-${origin.template}`,
      purpose: { event: 'key', description: 'Retain post-key planning challenge under the unchanged single-key acceptance rules.' } } };
    const rating = extractUnlockRating(input, ratingComparisonSet([input]), POST_KEY_RECIPE.graph.maxStates, POST_KEY_RECIPE.graph.maxEdges, POST_KEY_RECIPE.maxStageWork);
    const acceptance = acceptSingleKey(overlay.puzzle, rating, { target: POST_KEY_RECIPE.target, disclosureBudget: POST_KEY_RECIPE.disclosure });
    onAttempt('acceptance', acceptance.status, acceptance.reasons.map(r => r.code).join(','));
    if (acceptance.status !== 'pass') continue;
    const classicReferences = unlockClassicReferences(overlay.puzzle, rating.status === 'complete' ? rating.evidence.stageDifficulty : null, rating.evidenceSha256);
    if (classicReferences.base.status !== 'rated') { onAttempt('classic-reference', 'unknown', classicReferences.base.reason); continue; }
    const source = { method: POST_KEY_RECIPE.method, origin, classic, solution: solved.route, structureKey: structureKey(classic),
      overlay: { key: overlay.key, locked: overlay.locked, order: overlay.order } };
    return { puzzle: overlay.puzzle, source, sourceSha256: sha256(source), rating, acceptance, classicReferences };
  }
  return null;
}
export type PostKeyRecord = NonNullable<ReturnType<typeof evaluatePostKeyCandidate>>;
export function postKeyRoot(origin: PostKeyOrigin) { const { mutation: _mutation, ...root } = origin; return sha256(root); }
export function postKeyNeighbors(record: PostKeyRecord): PostKeyOrigin[] {
  if (record.source.origin.mutation) return [];
  return record.source.classic.bottles.flatMap((b, bottle) => record.source.overlay.locked.includes(bottle) ? [] : b.layers.flatMap((c, first) => b.layers.flatMap((other, second) =>
    first < second && c !== other ? [{ ...record.source.origin, mutation: { bottle, first, second } }] : [])));
}
