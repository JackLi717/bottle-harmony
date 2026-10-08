import { colorRuns } from './difficulty.ts';
import { structureKey } from './generation.ts';
import { parseHumanDifficultyReport, type HumanDifficultyReport } from './humanDifficulty.ts';
import { initialBoard, parseLevel, type LevelDefinition } from './model.ts';
import { applyPour, getLegalPours, isSolved, type Board, type Pour } from './rules.ts';
import { replaySolution, solveBoard } from './solver.ts';
import { measureStartVariety } from './startQuality.ts';

/** Offline feature vocabulary, independent of the human difficulty formula. */
export const FEATURE_MODEL = 'classic-features-v1' as const;
export const FEATURE_TAGS = {
  'early-deception': { name: '前段表面进展有风险', scope: 'exact-early-probe' },
  'early-risk': { name: '前段观察点后果分化', scope: 'exact-early-probe' },
  'opening-risk': { name: '首步后果分化', scope: 'verified-samples' },
  'multiple-safe-openings': { name: '多个低代价首步', scope: 'verified-samples' },
  'repeated-decision-risk': { name: '多个观察点有风险', scope: 'verified-samples' },
  'midroute-risk': { name: '中段观察点有风险', scope: 'verified-samples' },
  'space-tight-route': { name: '参考路线中转空间紧张', scope: 'reference-route' },
  'space-reuse-route': { name: '参考路线空瓶多色复用', scope: 'reference-route' },
  'preparation-chain-route': { name: '参考路线连续准备', scope: 'reference-route' },
  'partial-transfer-route': { name: '参考路线部分接收', scope: 'reference-route' },
  'bottom-release-route': { name: '参考路线露出单层底色', scope: 'reference-route' },
  'late-risk': { name: '收尾观察点有风险', scope: 'exact-late-probe' },
  'small-board-planning': { name: '小棋盘较高规划代理', scope: 'verified-planning' },
  'alternating-start': { name: '开局交替色层', scope: 'initial-structure' },
  'adjacent-block-start': { name: '开局连续色块较多', scope: 'initial-structure' },
  'repeated-bottom-start': { name: '开局底色重复', scope: 'initial-structure' },
} as const;
export type FeatureTag = keyof typeof FEATURE_TAGS;
export type FeatureEvidence = {
  readonly tag: FeatureTag;
  readonly scope: typeof FEATURE_TAGS[FeatureTag]['scope'];
  readonly facts: Readonly<Record<string, number | readonly number[]>>;
};
export const FEATURE_TYPES = {
  'counterintuitive-opening': '前段合并诱惑型',
  'preparation-chain': '连续准备型',
  'space-management': '空间周转型',
  'late-decision': '收尾选择型',
  'flexible-opening': '宽松多开局型',
  'repeated-decisions': '多段风险型',
  'direct-organization': '其他整理型',
  'incomplete-observation': '观察证据未完成',
} as const;
export type FeatureType = keyof typeof FEATURE_TYPES;
export type LateProbeOptions = { readonly maxStates?: number; readonly maxMilliseconds?: number };
export type ChoiceEvidence = {
  readonly pour: Pour;
  readonly merges: boolean;
  readonly outcome: 'solved' | 'unsolvable' | 'unknown';
  readonly regret: number | null;
  /** Legal full witness, not a claim about every solution. */
  readonly continuation: readonly Pour[] | null;
  readonly unknownReason: 'states' | 'time' | null;
};
export type LateProbe = {
  readonly status: 'complete' | 'unknown' | 'not-requested' | 'not-applicable';
  readonly moveIndex: number;
  readonly board: Board;
  readonly remainingShortest: number | null;
  readonly choices: readonly ChoiceEvidence[];
  readonly unknownReason: 'states' | 'time' | null;
};
export type RouteFeatures = {
  readonly moves: number;
  readonly noEmptyMoves: readonly number[];
  readonly noEmptyShare: number;
  readonly lastEmptyConsumedMoves: readonly number[];
  readonly preparationChains: readonly { readonly start: number; readonly length: number }[];
  readonly maximumPreparation: number;
  readonly reuse: readonly { readonly bottleId: string; readonly colors: readonly string[]; readonly moves: readonly number[] }[];
  readonly maximumReuseColors: number;
  readonly partialTransferMoves: readonly number[];
  readonly bottomReleaseMoves: readonly number[];
  readonly firstCompletionMove: number;
};
export type LevelFeatureReport = {
  readonly model: typeof FEATURE_MODEL;
  readonly levelId: string;
  readonly structureKey: string;
  readonly planningRank: number;
  readonly humanScore: number;
  readonly probeBudgets: { readonly early: Required<LateProbeOptions> | null; readonly late: Required<LateProbeOptions> | null };
  readonly structure: ReturnType<typeof inspectFeatureStructure>;
  readonly route: RouteFeatures;
  /** Counts inherited from the independently audited catalog's canonical route.
   * They must not be mapped to the potentially different supplied route. */
  readonly humanSamples: HumanDifficultyReport['decisions'];
  readonly early: LateProbe;
  readonly late: LateProbe;
  readonly tags: readonly FeatureTag[];
  readonly evidence: readonly FeatureEvidence[];
  /** Presentation heuristic with a fixed priority, not a proven unique strategy. */
  readonly primary: FeatureType;
};

// Bottle permutation only: colors retain their logical identity during a route.
const stateKey = (board: Board) => JSON.stringify(board.map(bottle => bottle.join(',')).sort());
const fullMono = (bottle: readonly string[], capacity: number) => bottle.length === capacity && bottle.every(color => color === bottle[0]);

export function inspectFeatureStructure(level: LevelDefinition) {
  const filled = level.bottles.filter(bottle => bottle.layers.length > 0);
  const bottoms = filled.map(bottle => bottle.layers[0]);
  const adjacencySlots = filled.reduce((sum, bottle) => sum + Math.max(0, bottle.layers.length - 1), 0);
  const variety = measureStartVariety(level);
  return {
    colors: level.colors.length, bottles: level.bottles.length, emptyBottles: level.bottles.length - filled.length,
    ...variety, distinctBottoms: new Set(bottoms).size,
    repeatedBottomBottles: bottoms.length - new Set(bottoms).size,
    alternatingBottles: filled.filter(({ layers: x }) => x.length === 4 && x[0] === x[2] && x[1] === x[3] && x[0] !== x[1]).length,
    adjacentPairShare: adjacencySlots ? variety.adjacentPairs / adjacencySlots : 0,
    colorSpread: level.colors.map(color => filled.filter(bottle => bottle.layers.includes(color)).length).sort((a, b) => a - b),
  };
}

/** Measurements of one accepted route; no necessity claims are made. */
export function inspectFeatureRoute(level: LevelDefinition, route: readonly Pour[]): RouteFeatures {
  replaySolution(initialBoard(level), route, level.capacity);
  let board = initialBoard(level), preparationStart = -1, preparationLength = 0, firstCompletionMove = -1;
  const noEmptyMoves: number[] = [], lastEmptyConsumedMoves: number[] = [], partialTransferMoves: number[] = [], bottomReleaseMoves: number[] = [];
  const preparationChains: { start: number; length: number }[] = [];
  const reuse = level.bottles.map(bottle => ({ bottleId: bottle.id, colors: new Set<string>(), moves: [] as number[] }));
  const finishChain = () => {
    if (preparationLength) preparationChains.push({ start: preparationStart, length: preparationLength });
    preparationStart = -1; preparationLength = 0;
  };
  route.forEach((pour, moveIndex) => {
    const empties = board.filter(bottle => !bottle.length).length;
    if (!empties) noEmptyMoves.push(moveIndex);
    const from = board[pour.source];
    let topRun = 0;
    for (let i = from.length - 1; i >= 0 && from[i] === pour.color; i--) topRun++;
    if (pour.amount < topRun) partialTransferMoves.push(moveIndex);
    if (!board[pour.target].length) {
      reuse[pour.target].colors.add(pour.color); reuse[pour.target].moves.push(moveIndex);
    }
    const next = applyPour(board, pour, level.capacity);
    if (empties === 1 && next.every(bottle => bottle.length)) lastEmptyConsumedMoves.push(moveIndex);
    if (from.length > 1 && next[pour.source].length === 1 && from.at(-1) !== from[0]) bottomReleaseMoves.push(moveIndex);
    if (colorRuns(next) === colorRuns(board) && stateKey(next) !== stateKey(board)) {
      if (!preparationLength) preparationStart = moveIndex;
      preparationLength++;
    } else finishChain();
    if (firstCompletionMove < 0 && next.some(bottle => fullMono(bottle, level.capacity))) firstCompletionMove = moveIndex;
    board = next;
  });
  finishChain();
  return {
    moves: route.length, noEmptyMoves, noEmptyShare: route.length ? noEmptyMoves.length / route.length : 0,
    lastEmptyConsumedMoves, preparationChains, maximumPreparation: Math.max(0, ...preparationChains.map(chain => chain.length)),
    reuse: reuse.filter(item => item.colors.size > 1).map(item => ({ ...item, colors: [...item.colors].sort() })),
    maximumReuseColors: Math.max(0, ...reuse.map(item => item.colors.size)),
    partialTransferMoves, bottomReleaseMoves, firstCompletionMove,
  };
}

/** Exact outcomes at one route state, bounded by a TOTAL probe time budget.
 * Unknown choices remain unknown; counts from incomplete probes create no tags. */
function probeChoices(level: LevelDefinition, route: readonly Pour[], moveIndex: number, options: LateProbeOptions): LateProbe {
  replaySolution(initialBoard(level), route, level.capacity);
  const maxStates = options.maxStates ?? 30000, maxMilliseconds = options.maxMilliseconds ?? 500;
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 1000000
    || !Number.isFinite(maxMilliseconds) || maxMilliseconds <= 0 || maxMilliseconds > 60000) throw new Error('Invalid feature probe budget');
  let board = initialBoard(level), previous: Board | null = null;
  for (const pour of route.slice(0, moveIndex)) { previous = board; board = applyPour(board, pour, level.capacity); }
  const began = performance.now();
  const solve = (input: Board) => {
    const remaining = maxMilliseconds - (performance.now() - began);
    return remaining <= 0 ? null : solveBoard(input, { capacity: level.capacity, maxStates, maxMilliseconds: remaining });
  };
  const root = solve(board);
  if (!root || root.status === 'limitReached') return { status: 'unknown', moveIndex, board, remainingShortest: null, choices: [],
    unknownReason: root?.status === 'limitReached' && root.reason === 'states' ? 'states' : 'time' };
  if (root.status !== 'solved') throw new Error('Accepted route has an invalid late state');
  replaySolution(board, root.route, level.capacity);
  const seen = new Set([stateKey(board)]);
  if (previous) seen.add(stateKey(previous));
  const choices: ChoiceEvidence[] = [];
  for (const pour of getLegalPours(board, level.capacity)) {
    const next = applyPour(board, pour, level.capacity), key = stateKey(next);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = isSolved(next, level.capacity) ? { status: 'solved' as const, route: [] } : solve(next);
    let outcome: ChoiceEvidence['outcome'], regret: number | null = null, continuation: readonly Pour[] | null = null;
    let unknownReason: ChoiceEvidence['unknownReason'] = null;
    if (!result || result.status === 'limitReached') {
      outcome = 'unknown'; unknownReason = result?.status === 'limitReached' && result.reason === 'states' ? 'states' : 'time';
    }
    else if (result.status === 'unsolvable') outcome = 'unsolvable';
    else if (result.status === 'solved') {
      outcome = 'solved'; continuation = result.route;
      replaySolution(next, continuation, level.capacity);
      regret = 1 + continuation.length - root.route.length;
      if (regret < 0) throw new Error('Inconsistent shortest late distance');
    } else throw new Error('Invalid late successor');
    choices.push({ pour, merges: colorRuns(next) < colorRuns(board), outcome, regret, continuation, unknownReason });
  }
  return { status: choices.some(choice => choice.outcome === 'unknown') ? 'unknown' : 'complete',
    moveIndex, board, remainingShortest: root.route.length, choices,
    unknownReason: choices.find(choice => choice.unknownReason)?.unknownReason ?? null };
}

export function probeLateChoices(level: LevelDefinition, route: readonly Pour[], options: LateProbeOptions = {}): LateProbe {
  const moveIndex = Math.max(0, route.length - Math.max(3, Math.ceil(route.length / 5)));
  return probeChoices(level, route, moveIndex, options);
}

/** First real merging opportunity along this route in its first third. Full
 * initial bottles cannot merge on move zero, so an opening-only test is blind. */
export function probeEarlyChoices(level: LevelDefinition, route: readonly Pour[], options: LateProbeOptions = {}): LateProbe {
  replaySolution(initialBoard(level), route, level.capacity);
  let board = initialBoard(level);
  for (let moveIndex = 0; moveIndex <= Math.min(route.length - 1, Math.ceil(route.length / 3)); moveIndex++) {
    const runs = colorRuns(board);
    if (getLegalPours(board, level.capacity).some(pour => colorRuns(applyPour(board, pour, level.capacity)) < runs)) {
      return probeChoices(level, route, moveIndex, options);
    }
    board = applyPour(board, route[moveIndex], level.capacity);
  }
  return { status: 'not-applicable', moveIndex: -1, board: [], remainingShortest: null, choices: [], unknownReason: null };
}

const notRequested = (): LateProbe => ({ status: 'not-requested', moveIndex: -1, board: [],
  remainingShortest: null, choices: [], unknownReason: null });

/** Human evidence is inherited; publishing still requires its independent audit.
 * New route features are replayed, and late branch distances are recomputed. */
export function analyzeLevelFeatures(definition: LevelDefinition, route: readonly Pour[], humanInput: HumanDifficultyReport,
  planningRank: number, options: { readonly lateProbe?: LateProbeOptions | false; readonly earlyProbe?: LateProbeOptions | false } = {}): LevelFeatureReport {
  const level = parseLevel(definition);
  if (level.capacity !== 4) throw new Error('Classic features require four-layer capacity');
  const human = parseHumanDifficultyReport(humanInput, level, planningRank, route.length);
  const structure = inspectFeatureStructure(level), routeFeatures = inspectFeatureRoute(level, route);
  const early = options.earlyProbe === false ? notRequested() : probeEarlyChoices(level, route, options.earlyProbe);
  const late = options.lateProbe === false ? notRequested() : probeLateChoices(level, route, options.lateProbe);
  const budget = (value: LateProbeOptions | false | undefined) => value === false ? null
    : { maxStates: value?.maxStates ?? 30000, maxMilliseconds: value?.maxMilliseconds ?? 500 };
  const probeBudgets = { early: budget(options.earlyProbe), late: budget(options.lateProbe) };
  const evidence: FeatureEvidence[] = [];
  const add = (tag: FeatureTag, facts: FeatureEvidence['facts']) => evidence.push({ tag, scope: FEATURE_TAGS[tag].scope, facts });
  const opening = human.decisions.find(point => point.moveIndex === 0);
  if (!opening) throw new Error('Missing opening decision evidence');
  const earlyBad = early.choices.filter(choice => choice.outcome === 'unsolvable' || choice.regret !== null && choice.regret >= 3);
  const earlyDeceptive = earlyBad.filter(choice => choice.merges);
  if (early.status === 'complete' && earlyDeceptive.length) add('early-deception', { moveIndex: early.moveIndex, deceptiveChoices: earlyDeceptive.length, choices: early.choices.length });
  if (early.status === 'complete' && earlyBad.length) add('early-risk', { moveIndex: early.moveIndex, riskyChoices: earlyBad.length, choices: early.choices.length });
  if (opening.deadEnds + opening.costlyDetours) add('opening-risk', { deadEnds: opening.deadEnds, costlyDetours: opening.costlyDetours, choices: opening.choices });
  if (opening.safeChoices >= 2) add('multiple-safe-openings', { safeChoices: opening.safeChoices, choices: opening.choices });
  const risky = human.decisions.filter(point => point.risk >= 0.25);
  if (risky.length >= 2) add('repeated-decision-risk', { sampledMoveIndices: risky.map(point => point.moveIndex), sampledPoints: human.decisions.length });
  const middle = human.decisions.filter(point => point.moveIndex > 0 && point.deadEnds + point.costlyDetours > 0);
  if (middle.length) add('midroute-risk', { sampledMoveIndices: middle.map(point => point.moveIndex) });
  if (routeFeatures.noEmptyShare >= 0.25) add('space-tight-route', { noEmptyShare: routeFeatures.noEmptyShare, moveIndices: routeFeatures.noEmptyMoves });
  if (routeFeatures.maximumReuseColors >= 2) add('space-reuse-route', { maximumReuseColors: routeFeatures.maximumReuseColors });
  if (routeFeatures.maximumPreparation >= 2) add('preparation-chain-route', { maximumPreparation: routeFeatures.maximumPreparation,
    moveIndices: routeFeatures.preparationChains.filter(chain => chain.length >= 2).map(chain => chain.start) });
  if (routeFeatures.partialTransferMoves.length) add('partial-transfer-route', { moveIndices: routeFeatures.partialTransferMoves });
  if (routeFeatures.bottomReleaseMoves.length) add('bottom-release-route', { moveIndices: routeFeatures.bottomReleaseMoves });
  const lateBad = late.choices.filter(choice => choice.outcome === 'unsolvable' || choice.regret !== null && choice.regret >= 3);
  if (late.status === 'complete' && lateBad.length) add('late-risk', { moveIndex: late.moveIndex, riskyChoices: lateBad.length, choices: late.choices.length });
  if (structure.bottles <= 7 && planningRank >= 5) add('small-board-planning', { bottles: structure.bottles, planningRank });
  if (structure.alternatingBottles) add('alternating-start', { bottles: structure.alternatingBottles });
  if (structure.adjacentPairShare >= 0.25) add('adjacent-block-start', { adjacentPairShare: structure.adjacentPairShare });
  if (structure.repeatedBottomBottles) add('repeated-bottom-start', { bottles: structure.repeatedBottomBottles });
  // Stable, transparent display priority. Multi-label counts are authoritative
  // observations; this exclusive summary is only a production aid.
  const primary: FeatureType = early.status === 'unknown' || early.status === 'not-requested' || late.status !== 'complete' ? 'incomplete-observation'
    : early.status === 'complete' && earlyDeceptive.length ? 'counterintuitive-opening'
    : routeFeatures.maximumPreparation >= 2 ? 'preparation-chain'
    : routeFeatures.noEmptyShare >= 0.35 && routeFeatures.maximumReuseColors >= 2 ? 'space-management'
    : late.status === 'complete' && lateBad.length ? 'late-decision'
    : opening.safeChoices >= 3 && !opening.deadEnds && !opening.costlyDetours ? 'flexible-opening'
    : risky.length >= 2 ? 'repeated-decisions' : 'direct-organization';
  return { model: FEATURE_MODEL, levelId: level.id, structureKey: structureKey(level), planningRank,
    humanScore: human.score!.total, probeBudgets, structure, route: routeFeatures, humanSamples: human.decisions, early, late,
    tags: evidence.map(item => item.tag), evidence, primary };
}
