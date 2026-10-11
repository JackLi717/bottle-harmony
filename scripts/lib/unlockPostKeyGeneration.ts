import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// Read-only production inputs supply independently generated classic cores.
// The final source still reconstructs entirely from its recorded generator and seed.
const catalog = JSON.parse(readFileSync(new URL('../../assets/levels/mainline-catalog.json', import.meta.url), 'utf8')) as {
  records: { content: { origin: { seed: number; candidateIndex: number; generator: 'balanced-shuffle-v1' | 'anchored-shuffle-v1' };
    level: { colors: string[]; bottles: unknown[] } }; human: { score: { total: number } } }[] };
const CORE_SOURCES = catalog.records.filter(r => [5, 6].includes(r.content.level.colors.length) && r.content.level.bottles.length === r.content.level.colors.length + 1 && r.content.origin.candidateIndex === 0)
  .map(r => ({ seed: r.content.origin.seed, coreColors: r.content.level.colors.length, generator: r.content.origin.generator, score: r.human.score.total }))
  .sort((a, b) => b.score - a.score || a.seed - b.seed);
assert.ok(CORE_SOURCES.length >= 20 && CORE_SOURCES.every(s => ['balanced-shuffle-v1', 'anchored-shuffle-v1'].includes(s.generator)));

/** A generation filter, not a new difficulty or quality formula. */
export const POST_KEY_RECIPE = Object.freeze({ method: 'classic-key-postchallenge-v2', seed: 31000000, count: 20,
  templateSeedOffset: { 2: 1000000, 3: 0 },
  target: { min: 4, max: 6 }, afterMin: 3, corePool: { count: CORE_SOURCES.length, sha256: sha256(CORE_SOURCES) }, coreSizes: [5, 6], coreSelection: 'verified-and-fresh-alternating-v1', templates: [2, 3] as const, colors: [8] as const,
  allocation: 'run-shuffled-bridge-v2', crossLink: 'two-color-pair-exchange-v1', bridgeProfiles: [0, 1, 2, 3], partitions: [[4,4,4,0], [4,4,3,1], [4,4,2,2], [4,3,3,2]],
  diversity: { maxPerRoot: 1, uniqueLowerRows: true, uniqueAfterStates: true },
  maxCandidates: 20000, graph: { maxStates: 250000, maxEdges: 4000000 }, maxStageWork: 5000000,
  disclosure: { maxWorlds: 10000, maxStatesPerWorld: 100000, maxTotalStates: 10000000, maxMilliseconds: 60000 },
});
export type PostKeyOrigin = { seed: number; coreSeed: number; coreColors: 5 | 6; colors: 8; template: 2 | 3; partition: number; bridgeProfile: number; linked: boolean; layout: number;
  generator: 'balanced-shuffle-v1' | 'anchored-shuffle-v1' };

export function postKeyOrigin(template: 2 | 3, index: number): PostKeyOrigin {
  assert.ok([2, 3].includes(template) && Number.isSafeInteger(index) && index >= 0 && index < POST_KEY_RECIPE.maxCandidates);
  const seed = POST_KEY_RECIPE.seed + POST_KEY_RECIPE.templateSeedOffset[template] + index;
  const coreColors = (index % 2 ? 6 : 5) as 5 | 6;
  const pool = CORE_SOURCES.filter(c => c.coreColors === coreColors), core = pool[Math.floor(index / 4) % pool.length];
  return { seed, coreSeed: index % 4 < 2 ? core.seed : seed, coreColors, colors: 8, template,
    partition: Math.floor(index / 4) % 4, bridgeProfile: Math.floor(index / 16) % 4,
    linked: Math.floor(index / 64) % 2 === 1, layout: Math.floor(index / 128) % 6,
    generator: index % 4 < 2 ? core.generator : Math.floor(index / 4) % 2 ? 'balanced-shuffle-v1' : 'anchored-shuffle-v1' };
}
function sourceCore(origin: PostKeyOrigin) {
  const config = parseGenerationConfig({ colors: PRODUCTION_COLORS.slice(origin.colors - origin.coreColors, origin.colors), emptyBottles: 1,
    minSolutionMoves: 1, maxSolutionMoves: 80, mixing: 'relaxed' });
  return (origin.generator === 'balanced-shuffle-v1' ? makeCandidate : makeAnchoredCandidate)(origin.coreSeed, 0, config);
}
export function postKeyCoreKey(origin: PostKeyOrigin) { return structureKey(sourceCore(origin)); }
export function reconstructPostKeyClassic(origin: PostKeyOrigin) {
  assert.ok(Number.isSafeInteger(origin.seed) && origin.seed >= 0 && origin.seed <= 0xffffffff);
  assert.ok(Number.isSafeInteger(origin.coreSeed) && origin.coreSeed >= 0 && origin.coreSeed <= 0xffffffff);
  assert.ok(POST_KEY_RECIPE.coreSizes.includes(origin.coreColors));
  assert.equal(origin.colors, 8); assert.ok([2, 3].includes(origin.template));
  assert.ok(Number.isSafeInteger(origin.partition) && origin.partition >= 0 && origin.partition < POST_KEY_RECIPE.partitions.length);
  assert.ok(Number.isSafeInteger(origin.bridgeProfile) && POST_KEY_RECIPE.bridgeProfiles.includes(origin.bridgeProfile));
  assert.ok(typeof origin.linked === 'boolean' && Number.isSafeInteger(origin.layout) && origin.layout >= 0 && origin.layout < 6);
  assert.ok(['balanced-shuffle-v1', 'anchored-shuffle-v1'].includes(origin.generator));
  const colors = PRODUCTION_COLORS.slice(0, origin.colors), raw = sourceCore(origin);
  let state = (origin.seed ^ 0x6a09e667) >>> 0;
  const chunks = colors.slice(0, origin.colors - origin.coreColors).flatMap((color, i) => {
    const split = origin.bridgeProfile === 1 ? i === origin.seed % (origin.colors - origin.coreColors) : i !== origin.seed % (origin.colors - origin.coreColors);
    const lengths = origin.bridgeProfile === 0 ? [2, 2] : origin.bridgeProfile === 3 ? [1, 1, 1, 1] : split ? [2, 1, 1] : [2, 2];
    return lengths.map(length => Array<string>(length).fill(color));
  });
  for (let i = chunks.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(state / 0x100000000 * (i + 1));
    [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
  }
  const liquid = chunks.flat();
  let cursor = 0;
  const profile = origin.coreColors === 5 ? POST_KEY_RECIPE.partitions[origin.partition] : [[4,4,0], [4,3,1], [4,2,2], [3,3,2]][origin.partition];
  const bridge = profile.map(length => { const stack = liquid.slice(cursor, cursor + length); cursor += length; return stack; });
  const core = raw.bottles.map(b => [...b.layers]);
  // Reciprocal exchanges connect the two color inventories without changing
  // their global quantities. This is a fresh source, never a reused accepted neighbor.
  if (origin.linked) {
    const bottle = origin.seed % origin.coreColors, layer = (origin.seed >>> 3) % 4;
    if (origin.coreColors === 5 && origin.bridgeProfile % 2 === 0) {
      // Two pairs retain real dependencies across the opening. Both selected
      // colors exist in the independently generated core; no liquid is added.
      const chosen = [raw.colors[origin.seed % origin.coreColors], raw.colors[(origin.seed + 1) % origin.coreColors]];
      const cells = chosen.flatMap(color => core.flatMap((stack, b) => stack.flatMap((value, d) => value === color ? [{ b, d }] : [])).slice(0, 2));
      for (const [i, { b, d }] of cells.entries()) [core[b][d], bridge[0][i]] = [bridge[0][i], core[b][d]];
    } else [core[bottle][layer], bridge[0][0]] = [bridge[0][0], core[bottle][layer]];
  }
  const board = [...core, ...bridge];
  return parseLevel({ ...raw, colors, id: `post-classic2-${origin.seed}`,
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
  const board = initialBoard(reconstructPostKeyClassic(origin)), n = board.length;
  const bridgeStart = origin.coreColors + 1;
  const locked = origin.template === 3 ? (origin.coreColors === 5 ? [bridgeStart + 1, bridgeStart + 2, bridgeStart + 3] : [bridgeStart, bridgeStart + 1, bridgeStart + 2])
    : origin.coreColors === 6 ? [[bridgeStart, bridgeStart + 1], [bridgeStart, bridgeStart + 2], [bridgeStart + 1, bridgeStart + 2]][origin.seed % 3] : [[bridgeStart + 1, bridgeStart + 2], [bridgeStart + 1, bridgeStart + 3], [bridgeStart + 2, bridgeStart + 3]][origin.seed % 3];
  const slots = Math.floor(origin.layout / 3) * 5 + origin.layout % 3;
  const open = board.map((_, i) => i).filter(i => !locked.includes(i));
  // Mix core and bridge across both rows; box geometry remains an approved template.
  const mixed = [...open.filter(i => i < bridgeStart).filter((_, i) => i % 2 === 0),
    ...open.filter(i => i >= bridgeStart), ...open.filter(i => i < bridgeStart).filter((_, i) => i % 2 === 1)];
  const order = Array.from({ length: n }, (_, i) => i >= slots && i < slots + locked.length ? locked[i - slots] : mixed.shift()!);
  return board.flatMap((b, key) => {
    if (key >= origin.coreColors || !b.length || locked.includes(key)) return [];
    const targets = locked.map(i => order.indexOf(i)), keyIndex = order.indexOf(key);
    const puzzle = engineFixture(`post-key2-${origin.seed}-${origin.template}-${key}`,
      order.map(i => board[i]), { locked: targets, triggers: [{ id: 'key-a', when: { type: 'empty', container: `b${keyIndex}` }, unlock: targets.map(i => `b${i}`) }] });
    return [{ key, locked, order, puzzle, worlds: postKeyWorldCount(board, locked) }];
  });
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
export function postKeyRoot(origin: PostKeyOrigin) { return postKeyCoreKey(origin); }
