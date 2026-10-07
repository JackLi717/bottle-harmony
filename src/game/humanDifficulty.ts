import { initialBoard, type LevelDefinition } from './model.ts';
import { applyPour, getLegalPours, isSolved, type Board, type Pour } from './rules.ts';
import { colorRuns } from './difficulty.ts';
import { replaySolution, solveBoard } from './solver.ts';
import { recordObject, structureKey } from './generation.ts';
import type { DifficultyTier } from './difficulty.ts';

export const HUMAN_MODEL = 'human-decision-v1' as const;
export type HumanDecision = {
  readonly moveIndex: number;
  readonly choices: number;
  readonly safeChoices: number;
  readonly deadEnds: number;
  readonly costlyDetours: number;
  readonly deceptiveChoices: number;
  readonly risk: number;
};
export type HumanScore = {
  readonly planning: number;
  readonly trapPeak: number;
  readonly trapRepeat: number;
  readonly space: number;
  readonly visual: number;
  readonly operations: number;
  readonly total: number;
};
export type HumanDifficultyReport = {
  readonly model: typeof HUMAN_MODEL;
  readonly structureKey: string;
  readonly planningRank: number;
  readonly shortestMoves: number;
  readonly status: 'rated' | 'unknown';
  readonly reason: 'states' | 'time' | null;
  readonly decisions: readonly HumanDecision[];
  readonly score: HumanScore | null;
};
export type HumanOptions = { readonly maxSolveStates?: number; readonly maxMilliseconds?: number };

export function tierForHumanScore(score: number): DifficultyTier {
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error('Invalid human score');
  return score < 20 ? 'D1' : score < 35 ? 'D2' : score < 55 ? 'D3' : 'D4';
}

const key = (board: Board) => board.map(bottle => bottle.join(',')).sort().join('|');
const samePour = (a: Pour, b: Pour) => a.source === b.source && a.target === b.target && a.color === b.color && a.amount === b.amount;

/** Offline proxy, based on exact consequences of visible legal choices at three
 * points on a verified shortest route. It does not claim a measured human rating.
 * Budget exhaustion leaves the whole score unknown. */
export function evaluateHumanDifficulty(level: LevelDefinition, shortestRoute: readonly Pour[], planningRank: number, options: HumanOptions = {}): HumanDifficultyReport {
  if (!Number.isInteger(planningRank) || planningRank < 1 || planningRank > 8) throw new Error('Invalid planning rank');
  if (!shortestRoute.length) throw new Error('Missing shortest route');
  replaySolution(initialBoard(level), shortestRoute, level.capacity);
  const maxSolveStates = options.maxSolveStates ?? 100000;
  const maxMilliseconds = options.maxMilliseconds ?? 60000;
  // The structural key fixes both bottle order and color labels. Otherwise a
  // solver tie between shortest routes could alter the score after renaming.
  const structuralKey = structureKey(level);
  const canonicalStart = structuralKey.split(':').at(-1)!.split('/').map(bottle => [...bottle]);
  const canonical = solveBoard(canonicalStart, { capacity: level.capacity, maxStates: maxSolveStates, maxMilliseconds });
  if (canonical.status === 'limitReached') return { model: HUMAN_MODEL, structureKey: structuralKey, planningRank, shortestMoves: shortestRoute.length,
    status: 'unknown', reason: canonical.reason === 'states' ? 'states' : 'time', decisions: [], score: null };
  if (canonical.status !== 'solved' || canonical.route.length !== shortestRoute.length) throw new Error('Reference route is not shortest');
  const route = canonical.route;
  const states: Board[] = [canonicalStart];
  for (const pour of route) states.push(applyPour(states.at(-1)!, pour, level.capacity));
  const locations = [...new Set([0, Math.floor(route.length / 3), Math.floor(2 * route.length / 3)])];
  const decisions: HumanDecision[] = [];
  for (const moveIndex of locations) {
    const board = states[moveIndex], remaining = route.length - moveIndex;
    const before = colorRuns(board), seen = new Set<string>();
    let choices = 0, safeChoices = 0, deadEnds = 0, costlyDetours = 0, deceptiveChoices = 0, badWeight = 0;
    for (const pour of getLegalPours(board, level.capacity)) {
      const from = board[pour.source];
      // A completed bottle is visually finished; ordinary players are unlikely
      // to disturb it unless the proven route actually requires doing so.
      if (from.length === level.capacity && from.every(color => color === from[0]) && !samePour(pour, route[moveIndex])) continue;
      const next = applyPour(board, pour, level.capacity), nextKey = key(next);
      if (moveIndex > 0 && nextKey === key(states[moveIndex - 1])) continue; // Obvious immediate undo.
      if (seen.has(nextKey)) continue;
      seen.add(nextKey); choices++;
      let regret: number | null;
      if (samePour(pour, route[moveIndex])) regret = 0;
      else if (isSolved(next, level.capacity)) regret = 1 - remaining;
      else {
        const result = solveBoard(next, { capacity: level.capacity, maxStates: maxSolveStates, maxMilliseconds });
        if (result.status === 'limitReached') return { model: HUMAN_MODEL, structureKey: structuralKey, planningRank, shortestMoves: route.length,
          status: 'unknown', reason: result.reason === 'states' ? 'states' : 'time', decisions, score: null };
        if (result.status === 'invalid') throw new Error('Invalid alternative state');
        regret = result.status === 'unsolvable' ? null : 1 + result.route.length - remaining;
      }
      if (regret !== null && regret < 0) throw new Error('Reference route is not shortest');
      if (regret !== null && regret <= 2) safeChoices++;
      let severity = 0;
      if (regret === null) { deadEnds++; severity = 1; }
      else if (regret >= 3) { costlyDetours++; severity = regret >= 6 ? 0.8 : 0.5; }
      if (severity) {
        const deceptive = colorRuns(next) < before;
        if (deceptive) deceptiveChoices++;
        badWeight += severity * (deceptive ? 1 : 0.6);
      }
    }
    const risk = choices ? (badWeight / choices) * Math.min(1, Math.log2(choices + 1) / 2.5) : 0;
    decisions.push({ moveIndex, choices, safeChoices, deadEnds, costlyDetours, deceptiveChoices, risk });
  }
  const riskPeak = Math.max(...decisions.map(decision => decision.risk));
  const riskMean = decisions.reduce((sum, decision) => sum + decision.risk, 0) / decisions.length;
  const emptyShare = states.slice(0, -1).filter(board => board.every(bottle => bottle.length > 0)).length / route.length;
  const planning = Math.round(10 * (planningRank - 1) / 7);
  const trapPeak = Math.round(35 * (0.65 * riskPeak + 0.35 * riskMean));
  const trapRepeat = Math.round(10 * decisions.filter(decision => decision.risk >= 0.25).length / decisions.length);
  const space = Math.round(6 * (states[0].filter(bottle => bottle.length === 0).length === 1 ? 1 : 0) + 9 * emptyShare);
  const visual = Math.round(15 * Math.max(0, level.colors.length - 2) / 9);
  const operations = Math.min(15, Math.round(15 * Math.max(0, route.length - 4) / 26));
  const score = { planning, trapPeak, trapRepeat, space, visual, operations,
    total: planning + trapPeak + trapRepeat + space + visual + operations };
  return { model: HUMAN_MODEL, structureKey: structuralKey, planningRank, shortestMoves: route.length, status: 'rated', reason: null, decisions, score };
}

/** Fast schema/binding check for bundled evidence. The offline verifier
 * recomputes every exact alternative search before accepting a new package. */
export function parseHumanDifficultyReport(input: unknown, level: LevelDefinition, rank: number, shortestMoves: number): HumanDifficultyReport {
  const report = recordObject(input, ['model', 'structureKey', 'planningRank', 'shortestMoves', 'status', 'reason', 'decisions', 'score'], 'human difficulty');
  if (report.model !== HUMAN_MODEL || report.structureKey !== structureKey(level) || report.planningRank !== rank
    || report.shortestMoves !== shortestMoves || report.status !== 'rated' || report.reason !== null
    || !Array.isArray(report.decisions) || report.decisions.length < 1 || report.decisions.length > 3) throw new Error('Invalid human difficulty report');
  const decisions = report.decisions.map(inputDecision => {
    const d = recordObject(inputDecision, ['moveIndex', 'choices', 'safeChoices', 'deadEnds', 'costlyDetours', 'deceptiveChoices', 'risk'], 'human decision');
    for (const field of ['moveIndex', 'choices', 'safeChoices', 'deadEnds', 'costlyDetours', 'deceptiveChoices']) {
      if (!Number.isInteger(d[field]) || (d[field] as number) < 0) throw new Error('Invalid human decision count');
    }
    if ((d.moveIndex as number) >= shortestMoves || (d.safeChoices as number) + (d.deadEnds as number) + (d.costlyDetours as number) !== d.choices
      || typeof d.risk !== 'number' || !Number.isFinite(d.risk) || d.risk < 0 || d.risk > 1) throw new Error('Invalid human decision evidence');
    return d as unknown as HumanDecision;
  });
  const score = recordObject(report.score, ['planning', 'trapPeak', 'trapRepeat', 'space', 'visual', 'operations', 'total'], 'human score');
  const limits = { planning: 10, trapPeak: 35, trapRepeat: 10, space: 15, visual: 15, operations: 15, total: 100 };
  for (const [field, limit] of Object.entries(limits)) if (!Number.isInteger(score[field]) || (score[field] as number) < 0 || (score[field] as number) > limit) throw new Error('Invalid human score');
  if (Object.keys(limits).filter(field => field !== 'total').reduce((sum, field) => sum + (score[field] as number), 0) !== score.total) throw new Error('Incorrect human score total');
  return { model: HUMAN_MODEL, structureKey: report.structureKey as string, planningRank: rank, shortestMoves,
    status: 'rated', reason: null, decisions, score: score as unknown as HumanScore };
}
