import { DIFFICULTY_POLICY, PLANNING_POLICIES, DEPTH_POLICIES, colorRuns, type DifficultyReport, type PlanningDepthReport } from './difficulty.ts';
import { recordObject, structureKey } from './generation.ts';
import { initialBoard, type LevelDefinition } from './model.ts';
import { applyPour, getLegalPours, isSolved, type Board, type Pour } from './rules.ts';
import { replaySolution } from './solver.ts';

const MAX_CHARACTERS = 32000000;
function integer(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10000000) throw new Error('Invalid report count');
}
function pours(input: unknown): readonly Pour[] {
  if (!Array.isArray(input) || input.length > 256) throw new Error('Invalid report route');
  return input.map(item => {
    const move = recordObject(item, ['source', 'target', 'color', 'amount'], 'difficulty pour');
    integer(move.source); integer(move.target); integer(move.amount);
    if (typeof move.color !== 'string') throw new Error('Invalid report color');
    return { source: move.source, target: move.target, color: move.color, amount: move.amount };
  });
}

/** Checks artifact binding and route evidence without running the evaluator on a phone.
 * Strategy completeness/shortestness is recomputed by the offline verify command. */
export function decodeDifficultyPool(json: string, levels: readonly LevelDefinition[], depth = false): readonly DifficultyReport[] {
  if (json.length > MAX_CHARACTERS || levels.length < 1 || levels.length > 1000) throw new Error('Difficulty pool size limit');
  const pool = recordObject(JSON.parse(json), ['format', 'version', 'records'], 'difficulty pool');
  if (pool.format !== 'bottle-harmony-difficulty-pool' || pool.version !== 1 || !Array.isArray(pool.records) || pool.records.length !== levels.length) throw new Error('Difficulty pool mismatch');
  const ids = new Set<string>();
  const parsed = pool.records.map(input => {
    const value = recordObject(input, ['format', 'version', 'policy', 'levelId', 'structureKey', 'status', 'tier', 'reason', 'metrics', 'policies', 'referenceSolution', 'work', ...(depth ? ['rank', 'decisionLoad'] : [])], 'difficulty report');
    const level = levels.find(item => item.id === value.levelId);
    if (!level || ids.has(level.id) || value.format !== 'bottle-harmony-difficulty' || value.version !== 1 || value.policy !== (depth ? 'planning-depth-v1' : DIFFICULTY_POLICY) || value.structureKey !== structureKey(level)) throw new Error('Stale or invalid difficulty report');
    ids.add(level.id);
    if (!['rated', 'unknown', 'unsolvable'].includes(value.status as string)) throw new Error('Invalid difficulty status');
    integer(value.work);
    const metrics = recordObject(value.metrics, ['colors', 'bottles', 'initialEmptyBottles', 'spareColorRatio', 'colorRuns', 'shortestMoves', 'minimumEmptyBottlesOnRoute', 'maximumPreparationMovesOnRoute', 'minimumLegalChoicesOnRoute'], 'space metrics');
    const start = initialBoard(level), empty = start.filter(b => !b.length).length;
    if (metrics.colors !== level.colors.length || metrics.bottles !== start.length || metrics.initialEmptyBottles !== empty || metrics.spareColorRatio !== empty / level.colors.length || metrics.colorRuns !== colorRuns(start)) throw new Error('Incorrect space metrics');
    const reference = pours(value.referenceSolution);
    if (reference.length || isSolved(start, level.capacity)) {
      replaySolution(start, reference, level.capacity);
      if (metrics.shortestMoves !== reference.length) throw new Error('Incorrect route length');
      let board = start, preparation = 0, maximumPreparation = 0, minimumEmpty = empty, minimumChoices = Infinity;
      const key = (board: Board) => JSON.stringify(board.map(bottle => JSON.stringify(bottle)).sort());
      for (const move of reference) {
        const choices = new Set(getLegalPours(board, level.capacity).map(pour => key(applyPour(board, pour, level.capacity))));
        choices.delete(key(board));
        minimumChoices = Math.min(minimumChoices, choices.size);
        const next = applyPour(board, move, level.capacity);
        if (colorRuns(next) < colorRuns(board)) preparation = 0;
        else { preparation++; maximumPreparation = Math.max(maximumPreparation, preparation); }
        minimumEmpty = Math.min(minimumEmpty, next.filter(b => !b.length).length);
        board = next;
      }
      if (metrics.maximumPreparationMovesOnRoute !== maximumPreparation || metrics.minimumEmptyBottlesOnRoute !== minimumEmpty) throw new Error('Incorrect route space metrics');
      if (metrics.minimumLegalChoicesOnRoute !== (Number.isFinite(minimumChoices) ? minimumChoices : 0)) throw new Error('Incorrect route choices');
    } else if (['shortestMoves', 'minimumEmptyBottlesOnRoute', 'maximumPreparationMovesOnRoute', 'minimumLegalChoicesOnRoute'].some(key => metrics[key] !== null)) throw new Error('Unproven route metrics');
    const ladder = depth ? DEPTH_POLICIES : PLANNING_POLICIES;
    if (!Array.isArray(value.policies) || value.policies.length > ladder.length + 1) throw new Error('Invalid policies');
    const policies = value.policies.map((inputPolicy, index) => {
      const policy = recordObject(inputPolicy, ['tier', 'chainLimit', 'lookahead', 'status', 'checkedStates', 'branchingStates', 'maximumChoices', 'excludedChoices', 'witness', 'stallReason'], 'policy result');
      const expected = index < ladder.length ? ladder[index] : { tier: 'P4', chainLimit: null, lookahead: null };
      if (policy.tier !== expected.tier || policy.chainLimit !== expected.chainLimit || policy.lookahead !== expected.lookahead || !['passed', 'failed', 'unknown'].includes(policy.status as string)) throw new Error('Incorrect planning policy');
      for (const key of ['checkedStates', 'branchingStates', 'maximumChoices', 'excludedChoices']) integer(policy[key]);
      if (policy.branchingStates as number > (policy.checkedStates as number)) throw new Error('Incorrect branching count');
      const witness = pours(policy.witness);
      if (policy.status === 'passed') {
        replaySolution(start, witness, level.capacity);
        if (policy.stallReason !== null) throw new Error('Successful policy has stall');
      } else if (policy.status === 'failed') {
        let board = start;
        for (const move of witness) board = applyPour(board, move, level.capacity);
        if (isSolved(board, level.capacity) || !['no-local-progress', 'lookahead-excludes-all'].includes(policy.stallReason as string)) throw new Error('Invalid stall witness');
      } else if (witness.length || policy.stallReason !== null) throw new Error('Unknown policy has proof');
      return policy;
    });
    if (policies.slice(0, -1).some(policy => policy.status !== 'failed')) throw new Error('Skipped a lower policy');
    const final = policies.at(-1);
    if (final?.chainLimit === null && final.status !== 'passed') throw new Error('Invalid global evidence');
    if (value.status === 'unknown') {
      const fromPolicy = value.reason === 'policy-work' || value.reason === 'policy-time';
      if (fromPolicy ? !final || final.status !== 'unknown' || (!reference.length && !isSolved(start, level.capacity)) : policies.length !== 0 || reference.length !== 0) throw new Error('Unknown evidence mismatch');
    }
    if (value.status === 'rated') {
      const tier = final?.tier === 'P1' ? 'D1' : final?.tier === 'P2' ? 'D2' : final?.tier === 'P3' ? 'D3' : 'D4';
      if (!final || final.status !== 'passed' || value.tier !== tier || value.reason !== null || (!reference.length && !isSolved(start, level.capacity))) throw new Error('Invalid rated result');
    } else if (value.tier !== null || (value.status === 'unsolvable' && (value.reason !== null || reference.length || policies.length))
      || (value.status === 'unknown' && (!['solver-states', 'solver-time', 'policy-work', 'policy-time'].includes(value.reason as string) || (final && final.status !== 'unknown')))) throw new Error('Invalid unresolved result');
    if (depth) {
      if (value.rank !== (value.status === 'rated' ? policies.length : null)) throw new Error('Incorrect planning rank');
      if (value.status === 'rated' && value.rank !== 8) {
        const load = recordObject(value.decisionLoad, ['peakDecision', 'branchingDecisions', 'maximumMoves'], 'decision load');
        integer(load.peakDecision); integer(load.branchingDecisions); integer(load.maximumMoves);
        if ((load.maximumMoves as number) < reference.length) throw new Error('Invalid strategy operation bound');
      } else if (value.decisionLoad !== null) throw new Error('Unproven decision load');
    }
    return input as DifficultyReport;
  });
  return deepFreeze(parsed);
}

export function decodeDepthPool(json: string, levels: readonly LevelDefinition[]): readonly PlanningDepthReport[] {
  return decodeDifficultyPool(json, levels, true) as unknown as readonly PlanningDepthReport[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function encodeDifficultyPool(reports: readonly DifficultyReport[], levels: readonly LevelDefinition[]): string {
  const json = JSON.stringify({ format: 'bottle-harmony-difficulty-pool', version: 1, records: reports }, null, 2);
  decodeDifficultyPool(json, levels);
  return json;
}
