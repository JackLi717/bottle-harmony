import assert from 'node:assert/strict';
import { PRODUCTION_COLORS, structureKey } from '../../src/game/generation.ts';
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
import { inspectPostKeyIntegration, inspectUnlockedIntegration, POST_KEY_INTEGRATION_METHOD } from './unlockPostKeyIntegration.ts';

/** Only generation changes. Rating, rhythm and public-information rules stay fixed. */
export const POST_KEY_RECIPE = Object.freeze({ method: 'classic-key-postchallenge-v3', seed: 33000000, count: 20,
  templateSeedOffset: { 2: 1000000, 3: 0 },
  target: { min: 4, max: 6 }, afterMin: 3, templates: [2, 3] as const, colors: [7, 8] as const,
  overlaySelection: 'seed-rotated-four-groups-three-keys-v1', candidateGraph: { maxStates: 20000, maxEdges: 300000 },
  source: 'whole-board-run-shuffle-v1', spareCapacity: 2, minKeyPortions: 2, runProfiles: [[2,2], [2,1,1], [1,1,1,1]],
  integration: { method: POST_KEY_INTEGRATION_METHOD, minSharedColors: 3, minLinksPerOccupiedLockedBottle: 2, connectedRemainingColors: true },
  diversity: { maxPerRoot: 1, uniqueLowerRows: true, uniqueAfterStates: true },
  maxCandidates: 100000, graph: { maxStates: 250000, maxEdges: 4000000 }, maxStageWork: 5000000,
  disclosure: { maxWorlds: 500000, maxStatesPerWorld: 100000, maxTotalStates: 10000000, maxMilliseconds: 600000, reuseContinuations: true, compactContinuations: true },
});
export type PostKeyOrigin = { seed: number; colors: 7 | 8; template: 2 | 3; fillProfile: number; runProfile: number; layout: number;
  generator: 'whole-board-run-shuffle-v1' };
export function postKeyOrigin(template: 2 | 3, index: number): PostKeyOrigin {
  assert.ok([2, 3].includes(template) && Number.isSafeInteger(index) && index >= 0 && index < POST_KEY_RECIPE.maxCandidates);
  return { seed: POST_KEY_RECIPE.seed + POST_KEY_RECIPE.templateSeedOffset[template] + index,
    colors: (index % 2 ? 8 : 7), template, fillProfile: Math.floor(index / 2) % 3,
    runProfile: Math.floor(index / 6) % 3, layout: Math.floor(index / 18) % 6, generator: POST_KEY_RECIPE.source };
}
export function reconstructPostKeyClassic(origin: PostKeyOrigin) {
  assert.ok(Number.isSafeInteger(origin.seed) && origin.seed >= 0 && origin.seed <= 0xffffffff);
  assert.ok(POST_KEY_RECIPE.colors.includes(origin.colors)); assert.ok([2, 3].includes(origin.template));
  assert.ok(Number.isSafeInteger(origin.fillProfile) && origin.fillProfile >= 0 && origin.fillProfile < 3);
  assert.ok(Number.isSafeInteger(origin.runProfile) && origin.runProfile >= 0 && origin.runProfile < 3);
  assert.ok(Number.isSafeInteger(origin.layout) && origin.layout >= 0 && origin.layout < 6);
  assert.equal(origin.generator, POST_KEY_RECIPE.source);
  let state = origin.seed >>> 0;
  const shuffle = <T>(values: T[]) => {
    for (let i = values.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const j = Math.floor(state / 0x100000000 * (i + 1)); [values[i], values[j]] = [values[j], values[i]];
    }
    return values;
  };
  const colors = PRODUCTION_COLORS.slice(0, origin.colors);
  // One inventory, shuffled across the entire board before any key/lock choice.
  // Partial fills distribute the same eight spare portions, never add a subpuzzle.
  const liquid = shuffle(colors.flatMap(c => POST_KEY_RECIPE.runProfiles[origin.runProfile].map(n => Array<string>(n).fill(c)))).flat();
  const profiles = [
    [...Array<number>(origin.colors - 2).fill(4), 2,2,2,2],
    [...Array<number>(origin.colors - 3).fill(4), 3,3,2,2,2],
    [...Array<number>(origin.colors - 2).fill(4), 3,3,2,0],
  ];
  let cursor = 0;
  const bottles = shuffle(profiles[origin.fillProfile]).map((n, i) => {
    const layers = liquid.slice(cursor, cursor + n); cursor += n;
    return { id: `post-bottle-${i}`, layers };
  });
  assert.equal(cursor, liquid.length);
  return parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: `post-classic3-${origin.seed}`,
    capacity: 4, colors, bottles });
}
export function postKeyCoreKey(origin: PostKeyOrigin) { return structureKey(reconstructPostKeyClassic(origin)); }
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
  const board = initialBoard(reconstructPostKeyClassic(origin)), n = board.length;
  const combinations = (start: number, selected: number[]): number[][] => selected.length === origin.template ? [selected]
    : board.flatMap((b, i) => i >= start && (b.length === 0 || new Set(b).size >= 2) ? combinations(i + 1, [...selected, i]) : []);
  const groups = combinations(0, []).filter(locked => inspectPostKeyIntegration(board, locked).status === 'pass')
    .map(locked => ({ locked, worlds: postKeyWorldCount(board, locked) }))
    .sort((a, b) => a.worlds - b.worlds || a.locked.join(',').localeCompare(b.locked.join(',')));
  const feasible = groups.filter(({ locked, worlds }) => worlds <= POST_KEY_RECIPE.disclosure.maxWorlds
    && board.reduce((free, stack, i) => free + (locked.includes(i) ? 0 : 4 - stack.length), 0) >= 4);
  const selected = Array.from({ length: Math.min(4, feasible.length) }, (_, i) => feasible[(origin.seed + i) % feasible.length]);
  return selected.flatMap(({ locked, worlds }) => {
    const rowSize = Math.ceil(n / 2), row = Math.floor(origin.layout / 3);
    const positionsPerRow = (row ? n - rowSize : rowSize) - origin.template + 1;
    const slots = row * rowSize + (origin.layout % 3) % positionsPerRow;
    const open = board.map((_, i) => i).filter(i => !locked.includes(i));
    const order = Array.from({ length: n }, (_, i) => i >= slots && i < slots + locked.length ? locked[i - slots] : open.shift()!);
    return board.map((b, key) => ({ b, key })).filter(({ b, key }) => b.length >= 2 && !locked.includes(key))
      .sort((a, b) => b.b.length - a.b.length || new Set(b.b).size - new Set(a.b).size || a.key - b.key).slice(0, 3).flatMap(({ key }) => {
      const targets = locked.map(i => order.indexOf(i)), keyIndex = order.indexOf(key);
      const puzzle = engineFixture(`post-key3-${origin.seed}-${locked.join('-')}-${key}`,
        order.map(i => board[i]), { locked: targets, triggers: [{ id: 'key-a', when: { type: 'empty', container: `b${keyIndex}` }, unlock: targets.map(i => `b${i}`) }] });
      return [{ key, locked, order, puzzle, worlds }];
    });
  });
}
export function postKeyStageInTarget(stage: ReturnType<typeof analyzeStageDifficulty>) {
  return stage.status === 'rated' && stage.rank >= POST_KEY_RECIPE.target.min && stage.rank <= POST_KEY_RECIPE.target.max && stage.afterRank >= POST_KEY_RECIPE.afterMin;
}
export function evaluatePostKeyCandidate(origin: PostKeyOrigin, onAttempt: (stage: string, status: string, reason: string | null) => void = () => {}, selected?: { key: number; locked: readonly number[] }) {
  const classic = reconstructPostKeyClassic(origin);
  if (!hasCleanStart(classic)) { onAttempt('classic-start', 'fail', 'more-than-two-same-color'); return null; }
  const solved = solveBoard(initialBoard(classic), { maxStates: 100000, maxMilliseconds: 30000 });
  onAttempt('classic-solution', solved.status === 'solved' ? 'pass' : solved.status === 'unsolvable' ? 'fail' : 'unknown', solved.status);
  if (solved.status !== 'solved') return null;
  replaySolution(initialBoard(classic), solved.route, 4);
  for (const overlay of postKeyOverlays(origin).filter(o => !selected || o.key === selected.key && JSON.stringify(o.locked) === JSON.stringify(selected.locked))) {
    const accessibleFree = overlay.puzzle.containers.filter(c => !overlay.puzzle.locked.includes(c.id)).reduce((n, c) => n + c.capacity - c.units.length, 0);
    if (accessibleFree < 4) { onAttempt('key-space', 'fail', 'cannot-empty-any-open-bottle'); continue; }
    if (overlay.worlds > POST_KEY_RECIPE.disclosure.maxWorlds) { onAttempt('public-information', 'unknown', 'public-world-budget'); continue; }
    const graph = buildRatingGraph(overlay.puzzle, POST_KEY_RECIPE.candidateGraph.maxStates, POST_KEY_RECIPE.candidateGraph.maxEdges);
    if (graph.status !== 'complete') { onAttempt('graph', 'unknown', graph.reason); continue; }
    if (graph.shortestMoves === null) { onAttempt('solvability', 'fail', 'unsolvable'); continue; }
    const stage = analyzeStageDifficulty(graph, POST_KEY_RECIPE.maxStageWork);
    if (stage.status !== 'rated') { onAttempt('difficulty', 'unknown', stage.reason); continue; }
    if (!postKeyStageInTarget(stage)) { onAttempt('generation-target', 'fail', `whole-${stage.rank}-after-${stage.afterRank}`); continue; }
    const integration = inspectUnlockedIntegration(overlay.puzzle, stage.witness.unlockedFrame!);
    if (integration.status !== 'pass') { onAttempt('integration', 'fail', integration.reason); continue; }
    const rhythm = analyzeStageRhythm(graph, stage);
    if (rhythm.status !== 'pass') { onAttempt('rhythm', rhythm.status, rhythm.reason); continue; }
    const input: RatingInput = { puzzle: overlay.puzzle, design: { role: 'challenge', family: `post-key-box-${origin.template}`,
      purpose: { event: 'key', description: 'Retain post-key planning challenge under the unchanged single-key acceptance rules.' } } };
    const rating = extractUnlockRating(input, ratingComparisonSet([input]), POST_KEY_RECIPE.graph.maxStates, POST_KEY_RECIPE.graph.maxEdges, POST_KEY_RECIPE.maxStageWork);
    onAttempt('public-proof', 'running', String(overlay.worlds));
    const acceptance = acceptSingleKey(overlay.puzzle, rating, { target: POST_KEY_RECIPE.target, disclosureBudget: POST_KEY_RECIPE.disclosure });
    onAttempt('acceptance', acceptance.status, acceptance.reasons.map(r => r.code).join(','));
    if (acceptance.status !== 'pass') continue;
    const classicReferences = unlockClassicReferences(overlay.puzzle, rating.status === 'complete' ? rating.evidence.stageDifficulty : null, rating.evidenceSha256);
    if (classicReferences.base.status !== 'rated') { onAttempt('classic-reference', 'unknown', classicReferences.base.reason); continue; }
    const source = { method: POST_KEY_RECIPE.method, origin, classic, solution: solved.route, structureKey: structureKey(classic),
      overlay: { key: overlay.key, locked: overlay.locked, order: overlay.order } };
    return { puzzle: overlay.puzzle, source, sourceSha256: sha256(source), rating, acceptance: postKeyAcceptanceEvidence(acceptance), classicReferences, integration };
  }
  return null;
}
export type PostKeyRecord = NonNullable<ReturnType<typeof evaluatePostKeyCandidate>>;
export function postKeyRoot(origin: PostKeyOrigin) { return postKeyCoreKey(origin); }


/** Keep complete all-world proof hashes/counts, not millions of repeated routes.
 * Independent verification regenerates and compares the full proof digest. */
export function postKeyAcceptanceEvidence(accepted: ReturnType<typeof acceptSingleKey>) {
  const proof = accepted.publicInformation;
  if (!proof) return { ...accepted, publicInformation: null };
  const { worlds, ...binding } = proof;
  return { ...accepted, publicInformation: { ...binding, encoding: 'all-worlds-count-and-sha256-v1',
    worldsCount: worlds.length, worldsSha256: sha256(worlds) } };
}
