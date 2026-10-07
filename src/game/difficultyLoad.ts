import { evaluatePlanningDepth, type DifficultyOptions, type PlanningDepthReport } from './difficulty.ts';
import type { LevelDefinition } from './model.ts';

export const LOAD_MODEL = 'planning-load-v1' as const;
export const INTERNAL_GRADES = Object.freeze([
  { rank: 1, tier: 'D1', name: '直接整理', chainLimit: 2, lookahead: 0 },
  { rank: 2, tier: 'D2', name: '短程取舍', chainLimit: 4, lookahead: 1 },
  { rank: 3, tier: 'D3', name: '两阶段协调', chainLimit: 6, lookahead: 2 },
  { rank: 4, tier: 'D3', name: '三阶段协调', chainLimit: 6, lookahead: 3 },
  { rank: 5, tier: 'D4', name: '四阶段规划', chainLimit: 8, lookahead: 4 },
  { rank: 6, tier: 'D4', name: '六阶段规划', chainLimit: 10, lookahead: 6 },
  { rank: 7, tier: 'D4', name: '八阶段规划', chainLimit: 12, lookahead: 8 },
  { rank: 8, tier: 'D4', name: '完整规则规划', chainLimit: null, lookahead: null },
] as const);

export type LoadScore = {
  readonly planning: number;
  readonly peakDecision: number;
  readonly repeatedDecisions: number;
  readonly operations: number;
  readonly total: number;
};
export type LoadReport = {
  readonly model: typeof LOAD_MODEL;
  readonly evidence: PlanningDepthReport;
  readonly score: LoadScore | null;
};

/** Fixed production ordering, not a population percentile or a measured human score.
 * One planning-rank step outweighs all within-rank load. Only complete policy
 * paths contribute decision load; partial failed searches never contribute it.
 * Rank 8 has no bounded-policy decision proof, so its secondary terms are zero
 * except the verified shortest operation count. Empty space remains descriptive. */
export function evaluateLoad(level: LevelDefinition, options: DifficultyOptions = {}): LoadReport {
  const evidence = evaluatePlanningDepth(level, options);
  return { model: LOAD_MODEL, evidence, score: scorePlanningDepth(evidence) };
}

export function scorePlanningDepth(evidence: PlanningDepthReport): LoadScore | null {
  if (evidence.rank === null) return null;
  const load = evidence.decisionLoad;
  const planning = (evidence.rank - 1) * 1000;
  const peakDecision = load ? Math.min(749, load.peakDecision * 4) : 0;
  const repeatedDecisions = load ? Math.min(150, load.branchingDecisions * 6) : 0;
  const operations = Math.min(99, load?.maximumMoves ?? evidence.metrics.shortestMoves!);
  return { planning, peakDecision, repeatedDecisions, operations, total: planning + peakDecision + repeatedDecisions + operations };
}

class AboveTarget extends Error {}
/** Rejection screen only: once the requested policy has a complete failure
 * proof, the candidate cannot have that rank. Never emits a substitute grade.
 * Accepted records still contain exactly the complete ordinary evaluator data. */
export function evaluateLoadForTarget(level: LevelDefinition, rank: number, options: DifficultyOptions = {}): LoadReport | 'above-target' {
  if (!Number.isInteger(rank) || rank < 1 || rank > 8) throw new Error('Invalid target rank');
  let checked = 0;
  try {
    return evaluateLoad(level, { ...options, onPolicyChecked: policy => {
      checked++;
      if (checked === rank && policy.status === 'failed') throw new AboveTarget();
    } });
  } catch (error) { if (error instanceof AboveTarget) return 'above-target'; throw error; }
}
