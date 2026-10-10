import { UNLOCK_RATING_METHOD, type UnlockRatingReport } from './unlockRatingEvidence.ts';
export const RATING_WEIGHTS = { Q1: 25, Q2: 25, Q3: 20, Q4: 20, Q5: 10, D1: 25, D2: 25, D3: 15, D4: 15, D5: 15, D6: 5 } as const;
export type RatingMetric = keyof typeof RATING_WEIGHTS;
export const METRIC_EVIDENCE: Record<RatingMetric, readonly string[]> = {
  Q1: ['shortest', 'plusTwo'], Q2: ['mechanisms', 'ablations'], Q3: ['expression', 'information'], Q4: ['shortest', 'plusTwo'], Q5: ['novelty'],
  D1: ['shortest', 'plusTwo'], D2: ['shortest', 'plusTwo'], D3: ['shortest', 'plusTwo'], D4: ['mechanisms', 'shortest'], D5: ['information', 'ablations'], D6: ['graph'],
};
export function operationGrade(moves: number) {
  if (!Number.isSafeInteger(moves) || moves < 0) throw new Error('Invalid shortest pour count');
  return moves <= 6 ? 0 : moves <= 12 ? 1 : moves <= 18 ? 2 : moves <= 24 ? 3 : moves <= 30 ? 4 : 5;
}
/** Completed main-graph evidence does not admit unsolvable puzzles or complete
 * budget-limited counterfactual searches. */
export function ratingMetricReadiness(report: UnlockRatingReport, metric: RatingMetric): { status: 'ready' | 'unknown' | 'blocked'; reason: string } {
  if (report.status === 'unknown') return { status: 'unknown', reason: 'Original puzzle search is unknown.' };
  if (report.evidence.graph.shortestMoves === null) return { status: 'blocked', reason: 'Original puzzle is proven unsolvable; no Q/D score is admissible.' };
  const ablations = report.evidence.ablations;
  const required = metric === 'Q2' ? [ablations.allOpen,...ablations.individual.map(a => a.result)]
    : metric === 'D5' ? [ablations.fullyVisible] : [];
  if (required.some(a => a.status === 'unknown')) return { status: 'unknown', reason: `${metric} requires a completed ${metric === 'Q2' ? 'all-open and individual-mechanism' : 'fully-visible'} comparison; required search is unknown.` };
  return { status: 'ready', reason: 'Required computational evidence is complete; the automatic grade mapping is checked separately.' };
}

export function scoreUnlockRating(id: string, report: UnlockRatingReport) {
  if (arguments.length > 2) throw new Error('Manual score input is not supported');
  if (id !== report.puzzleId) throw new Error('Score puzzle mismatch');
  if (report.method !== UNLOCK_RATING_METHOD) throw new Error('Score method mismatch');
  const metrics = Object.fromEntries(Object.entries(RATING_WEIGHTS).map(([name, weight]) => {
    const metric = name as RatingMetric;
    const readiness = ratingMetricReadiness(report, metric);
    if (readiness.status !== 'ready') return [metric, { status: readiness.status, source: 'automatic', grade: null, weight, points: null,
      reason: readiness.reason, evidenceRefs: METRIC_EVIDENCE[metric] }];
    if (metric === 'D6' && report.status === 'complete' && report.evidence.graph.shortestMoves !== null) {
      const n = report.evidence.graph.shortestMoves, grade = operationGrade(n);
      return [metric, { status: 'scored', source: 'automatic', grade, weight, points: grade * weight / 5,
        reason: `Verified shortest route: ${n} pours; <=6 / 7–12 / 13–18 / 19–24 / 25–30 / >=31 => 0–5.`, evidenceRefs: METRIC_EVIDENCE[metric] }];
    }
    return [metric, { status: 'unimplemented', source: 'automatic', grade: null, weight, points: null,
      evidenceRefs: METRIC_EVIDENCE[metric], reason: 'Automatic grade mapping has not been specified and implemented; manual scores are not accepted.' }];
  })) as Record<RatingMetric, { status: string; points: number | null; grade: number | null; source: string; reason: string }>;
  const total = (prefix: 'Q' | 'D') => {
    const items = Object.entries(metrics).filter(([key]) => key.startsWith(prefix));
    return { score: items.every(([, m]) => m.points !== null) ? items.reduce((n, [, m]) => n + m.points!, 0) : null,
      pending: items.filter(([, m]) => m.points === null).map(([key]) => key),
      unimplemented: items.filter(([, m]) => m.status === 'unimplemented').map(([key]) => key),
      unknown: items.filter(([, m]) => m.status === 'unknown').map(([key]) => key),
      blocked: items.filter(([, m]) => m.status === 'blocked').map(([key]) => key),
      source: 'Fixed approved weights; automatic algorithms only; incomplete metrics block totals and missing weights are never redistributed.' };
  };
  return { method: UNLOCK_RATING_METHOD, evidenceSha256: report.evidenceSha256,
    solvability: report.status === 'unknown' ? 'unknown' : report.evidence.admission.solvability,
    metrics, Q: total('Q'), D: total('D') };
}
