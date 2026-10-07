import { structureKey } from './generation.ts';
import { initialBoard, parseLevel, type LevelDefinition } from './model.ts';
import { applyPour, getLegalPours, isSolved, type Board, type Pour } from './rules.ts';
import { replaySolution, solveBoard } from './solver.ts';

export const DIFFICULTY_POLICY = 'planning-frontier-v1' as const;
export type PlanningTier = 'P1' | 'P2' | 'P3' | 'P4';
export type DifficultyTier = 'D1' | 'D2' | 'D3' | 'D4';
export const PLANNING_POLICIES = [
  { tier: 'P1', chainLimit: 2, lookahead: 0 },
  { tier: 'P2', chainLimit: 4, lookahead: 1 },
  { tier: 'P3', chainLimit: 6, lookahead: 2 },
  { tier: 'P3', chainLimit: 6, lookahead: 3 },
] as const;
export type PolicyResult = {
  readonly tier: PlanningTier;
  readonly chainLimit: number | null;
  readonly lookahead: number | null;
  readonly status: 'passed' | 'failed' | 'unknown';
  readonly checkedStates: number;
  readonly branchingStates: number;
  readonly maximumChoices: number;
  readonly excludedChoices: number;
  /** Complete route on pass; route to a strategy stall on failure. Real bottle indices. */
  readonly witness: readonly Pour[];
  readonly stallReason: 'no-local-progress' | 'lookahead-excludes-all' | null;
};
export type SpaceMetrics = {
  readonly colors: number;
  readonly bottles: number;
  readonly initialEmptyBottles: number;
  readonly spareColorRatio: number;
  readonly colorRuns: number;
  readonly shortestMoves: number | null;
  /** These three metrics describe the independent shortest route, not every solution. */
  readonly minimumEmptyBottlesOnRoute: number | null;
  readonly maximumPreparationMovesOnRoute: number | null;
  readonly minimumLegalChoicesOnRoute: number | null;
};
export type DifficultyReport = {
  readonly format: 'bottle-harmony-difficulty';
  readonly version: 1;
  readonly policy: typeof DIFFICULTY_POLICY;
  readonly levelId: string;
  readonly structureKey: string;
  readonly status: 'rated' | 'unknown' | 'unsolvable';
  readonly tier: DifficultyTier | null;
  readonly reason: 'solver-states' | 'solver-time' | 'policy-work' | 'policy-time' | null;
  readonly metrics: SpaceMetrics;
  readonly policies: readonly PolicyResult[];
  readonly referenceSolution: readonly Pour[];
  readonly work: number;
};
export type DifficultyOptions = { maxSolveStates?: number; maxWork?: number; maxMilliseconds?: number; onPolicyChecked?: (policy: PolicyResult) => void };
export type PlanningPolicy = { readonly tier: PlanningTier; readonly chainLimit: number; readonly lookahead: number };
export const DEPTH_POLICIES: readonly PlanningPolicy[] = Object.freeze(([
  ...PLANNING_POLICIES,
  { tier: 'P4', chainLimit: 8, lookahead: 4 },
  { tier: 'P4', chainLimit: 10, lookahead: 6 },
  { tier: 'P4', chainLimit: 12, lookahead: 8 },
] satisfies PlanningPolicy[]).map(policy => Object.freeze(policy)));
export type DecisionLoad = {
  /** Peak at a single decision: 32 per preparation pour + 16 per choice bit (capped at 6). */
  readonly peakDecision: number;
  /** Maximum along any retained strategy path, not evaluator search work. */
  readonly branchingDecisions: number;
  readonly maximumMoves: number;
};
export type PlanningDepthReport = Omit<DifficultyReport, 'policy'> & {
  readonly policy: 'planning-depth-v1';
  readonly rank: number | null;
  readonly decisionLoad: DecisionLoad | null;
};

export function colorRuns(board: Board): number {
  return board.reduce((total, bottle) => total + bottle.filter((color, i) => i === 0 || color !== bottle[i - 1]).length, 0);
}

/** Equal movable bottles only. Canonical moves are later mapped back to real indices. */
function boardSpace(level: LevelDefinition) {
  const codes = new Map(level.colors.map((color, i) => [color, String.fromCharCode(65 + i)]));
  // Rule moves keep unchanged bottles by reference. Cache only immutable local
  // search arrays; no policy edges, ordering, work charges or score terms change.
  const bottleCodes = new WeakMap<readonly string[], string>();
  const boardKeys = new WeakMap<Board, string>();
  const encode = (bottle: readonly string[]) => {
    const previous = bottleCodes.get(bottle);
    if (previous !== undefined) return previous;
    const code = bottle.map(color => codes.get(color)!).join('');
    bottleCodes.set(bottle, code); return code;
  };
  const canonical = (board: Board): Board => [...board].sort((a, b) => compareKeys(encode(a), encode(b)));
  const key = (board: Board) => {
    const previous = boardKeys.get(board);
    if (previous !== undefined) return previous;
    const result = board.map(encode).sort().join('|');
    boardKeys.set(board, result); return result;
  };
  const toRealRoute = (path: readonly Pour[]): readonly Pour[] => {
    let real = initialBoard(level);
    const result: Pour[] = [];
    for (const move of path) {
      const sorted = canonical(real);
      const source = real.findIndex(bottle => encode(bottle) === encode(sorted[move.source]));
      const target = real.findIndex((bottle, i) => i !== source && encode(bottle) === encode(sorted[move.target]));
      const mapped = { ...move, source, target };
      real = applyPour(real, mapped, level.capacity);
      result.push(mapped);
    }
    return result;
  };
  return { canonical, key, toRealRoute };
}

type Edge = { board: Board; key: string; moves: readonly Pour[] };
class PolicyLimit extends Error {
  readonly reason: 'policy-work' | 'policy-time';
  constructor(reason: 'policy-work' | 'policy-time') { super(reason); this.reason = reason; }
}
const compareKeys = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Offline only. No oracle is consulted while choosing P1–P3 frontiers. */
export function evaluateDifficulty(definition: LevelDefinition, options: DifficultyOptions = {}): DifficultyReport {
  return evaluateWithPolicies(definition, options, PLANNING_POLICIES);
}

/** Offline fine grading uses the same rules/frontier verification as D1–D4.
 * A higher rank requires complete failure evidence for every lower policy.
 * Complete-rule fallback is rank 8, not a claim of a measured infinite depth. */
export function evaluatePlanningDepth(definition: LevelDefinition, options: DifficultyOptions = {}): PlanningDepthReport {
  let decisionLoad: DecisionLoad | null = null;
  const result = evaluateWithPolicies(definition, options, DEPTH_POLICIES, load => { decisionLoad = load; });
  return { ...result, policy: 'planning-depth-v1', rank: result.status === 'rated' ? result.policies.length : null, decisionLoad };
}

function evaluateWithPolicies(definition: LevelDefinition, options: DifficultyOptions, policiesToCheck: readonly PlanningPolicy[], onLoad?: (load: DecisionLoad) => void): DifficultyReport {
  const level = parseLevel(definition);
  const structuralKey = structureKey(level); // Ordinary four-layer boards only.
  const maxSolveStates = options.maxSolveStates ?? 100000;
  const maxWork = options.maxWork ?? 1000000;
  const maxMilliseconds = options.maxMilliseconds ?? 30000;
  if (!Number.isInteger(maxWork) || maxWork < 1 || maxWork > 10000000) throw new Error('maxWork must be 1..10000000');
  if (!Number.isFinite(maxMilliseconds) || maxMilliseconds <= 0 || maxMilliseconds > 60000) throw new Error('maxMilliseconds must be positive and at most 60000');
  if (!Number.isInteger(maxSolveStates) || maxSolveStates < 1 || maxSolveStates > 1000000) throw new Error('maxSolveStates must be 1..1000000');
  const began = performance.now();
  const start = initialBoard(level);
  const metrics: SpaceMetrics = {
    colors: level.colors.length, bottles: start.length,
    initialEmptyBottles: start.filter(b => !b.length).length,
    spareColorRatio: start.filter(b => !b.length).length / level.colors.length,
    colorRuns: colorRuns(start), shortestMoves: null,
    minimumEmptyBottlesOnRoute: null, maximumPreparationMovesOnRoute: null, minimumLegalChoicesOnRoute: null,
  };
  const policies: PolicyResult[] = [];
  let work = 0;
  const report = (status: DifficultyReport['status'], tier: DifficultyTier | null, reason: DifficultyReport['reason'], referenceSolution: readonly Pour[]): DifficultyReport => ({
    format: 'bottle-harmony-difficulty', version: 1, policy: DIFFICULTY_POLICY,
    levelId: level.id, structureKey: structuralKey, status, tier, reason, metrics, policies, referenceSolution, work,
  });
  const solved = solveBoard(start, { capacity: level.capacity, maxStates: maxSolveStates, maxMilliseconds });
  if (solved.status === 'invalid') throw new Error('Invalid solver input');
  if (solved.status === 'unsolvable') return report('unsolvable', null, null, []);
  if (solved.status === 'limitReached') return report('unknown', null, solved.reason === 'states' ? 'solver-states' : 'solver-time', []);
  replaySolution(start, solved.route, level.capacity);
  const routeMetrics = measureRoute(level, solved.route);
  Object.assign(metrics, routeMetrics, { shortestMoves: solved.route.length });
  const space = boardSpace(level);
  const charge = () => {
    if (performance.now() - began >= maxMilliseconds) throw new PolicyLimit('policy-time');
    if (work >= maxWork) throw new PolicyLimit('policy-work');
    work++;
  };
  const macroCache = new Map<string, readonly Edge[]>();
  function macros(board: Board, chainLimit: number): readonly Edge[] {
    charge();
    const cacheKey = `${chainLimit}:${space.key(board)}`;
    const cached = macroCache.get(cacheKey);
    if (cached) return cached;
    const root = space.canonical(board), rootRuns = colorRuns(root);
    const queue: Edge[] = [{ board: root, key: space.key(root), moves: [] }];
    const visited = new Set([space.key(root)]), ends = new Map<string, Edge>();
    for (let cursor = 0; cursor < queue.length; cursor++) {
      charge();
      const current = queue[cursor];
      for (const move of getLegalPours(current.board, level.capacity)) {
        charge();
        const next = space.canonical(applyPour(current.board, move, level.capacity));
        const key = space.key(next);
        if (key === current.key) continue; // Cosmetic bottle permutation.
        const moves = [...current.moves, move];
        const nextRuns = colorRuns(next);
        if (nextRuns > rootRuns) throw new Error('Ordinary pour increased color runs');
        if (nextRuns < rootRuns) {
          if (!ends.has(key)) ends.set(key, { board: next, key, moves });
        } else if (moves.length < chainLimit && !visited.has(key)) {
          visited.add(key); queue.push({ board: next, key, moves });
        }
      }
    }
    const result = [...ends.values()].sort((a, b) => a.moves.length - b.moves.length || compareKeys(a.key, b.key));
    macroCache.set(cacheKey, result);
    return result;
  }
  for (const policy of policiesToCheck) {
    const stats = { checkedStates: 0, branchingStates: 0, maximumChoices: 0, excludedChoices: 0 };
    const viability = new Map<string, boolean>();
    function viable(board: Board, depth: number): boolean {
      charge();
      if (isSolved(board, level.capacity) || depth === 0) return true;
      const key = `${depth}:${space.key(board)}`;
      if (viability.has(key)) return viability.get(key)!;
      const value = macros(board, policy.chainLimit).some(edge => viable(edge.board, depth - 1));
      viability.set(key, value);
      return value;
    }
    type Outcome = { passed: boolean; path: readonly Pour[]; stallReason: PolicyResult['stallReason']; load: DecisionLoad };
    const emptyLoad = { peakDecision: 0, branchingDecisions: 0, maximumMoves: 0 };
    const checked = new Map<string, Outcome>();
    function verify(board: Board): Outcome {
      charge();
      if (isSolved(board, level.capacity)) return { passed: true, path: [], stallReason: null, load: emptyLoad };
      const key = space.key(board);
      const previous = checked.get(key);
      if (previous) return previous;
      stats.checkedStates++;
      const choices = macros(board, policy.chainLimit);
      const retained = choices.filter(edge => viable(edge.board, policy.lookahead));
      stats.excludedChoices += choices.length - retained.length;
      const shortest = retained[0]?.moves.length;
      const frontier = retained.filter(edge => edge.moves.length === shortest);
      stats.maximumChoices = Math.max(stats.maximumChoices, frontier.length);
      if (frontier.length > 1) stats.branchingStates++;
      let outcome: Outcome;
      if (!frontier.length) outcome = { passed: false, path: [], stallReason: choices.length ? 'lookahead-excludes-all' : 'no-local-progress', load: emptyLoad };
      else {
        let example: readonly Pour[] | null = null;
        const load = { ...emptyLoad };
        const localLoad = 32 * (shortest! - 1) + 16 * Math.min(6, Math.ceil(Math.log2(frontier.length)));
        for (const edge of frontier) {
          const continuation = verify(edge.board);
          const path = [...edge.moves, ...continuation.path];
          if (!continuation.passed) { outcome = { passed: false, path, stallReason: continuation.stallReason, load: emptyLoad }; checked.set(key, outcome); return outcome; }
          load.peakDecision = Math.max(load.peakDecision, localLoad, continuation.load.peakDecision);
          load.branchingDecisions = Math.max(load.branchingDecisions, (frontier.length > 1 ? 1 : 0) + continuation.load.branchingDecisions);
          load.maximumMoves = Math.max(load.maximumMoves, edge.moves.length + continuation.load.maximumMoves);
          if (!example) example = path;
        }
        outcome = { passed: true, path: example!, stallReason: null, load };
      }
      checked.set(key, outcome);
      return outcome;
    }
    try {
      const outcome = verify(space.canonical(start));
      const witness = space.toRealRoute(outcome.path);
      if (outcome.passed) replaySolution(start, witness, level.capacity);
      policies.push({ ...policy, status: outcome.passed ? 'passed' : 'failed', ...stats, witness, stallReason: outcome.stallReason });
      options.onPolicyChecked?.(policies.at(-1)!);
      if (outcome.passed) {
        onLoad?.(outcome.load);
        return report('rated', policy.tier === 'P1' ? 'D1' : policy.tier === 'P2' ? 'D2' : policy.tier === 'P3' ? 'D3' : 'D4', null, solved.route);
      }
    } catch (error) {
      if (!(error instanceof PolicyLimit)) throw error;
      policies.push({ ...policy, status: 'unknown', ...stats, witness: [], stallReason: null });
      return report('unknown', null, error.reason, solved.route);
    }
  }
  policies.push({ tier: 'P4', chainLimit: null, lookahead: null, status: 'passed', checkedStates: solved.stats.expandedStates,
    branchingStates: 0, maximumChoices: 0, excludedChoices: 0, witness: solved.route, stallReason: null });
  return report('rated', 'D4', null, solved.route);
}

/** Path workload is separate from planning tiers. Never used to select policy frontiers. */
function measureRoute(level: LevelDefinition, route: readonly Pour[]) {
  let board = initialBoard(level), preparation = 0, maximumPreparation = 0;
  let minimumEmpty = board.filter(b => !b.length).length, minimumChoices = Infinity;
  const space = boardSpace(level);
  for (const move of route) {
    const choices = new Set(getLegalPours(board, level.capacity).map(pour => space.key(applyPour(board, pour, level.capacity))));
    choices.delete(space.key(board));
    minimumChoices = Math.min(minimumChoices, choices.size);
    const next = applyPour(board, move, level.capacity);
    if (colorRuns(next) < colorRuns(board)) preparation = 0;
    else { preparation++; maximumPreparation = Math.max(maximumPreparation, preparation); }
    minimumEmpty = Math.min(minimumEmpty, next.filter(b => !b.length).length);
    board = next;
  }
  return { minimumEmptyBottlesOnRoute: minimumEmpty, maximumPreparationMovesOnRoute: maximumPreparation,
    minimumLegalChoicesOnRoute: Number.isFinite(minimumChoices) ? minimumChoices : 0 };
}
