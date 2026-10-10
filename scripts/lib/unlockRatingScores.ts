import { UNLOCK_RATING_METHOD, type UnlockRatingReport } from './unlockRatingEvidence.ts';
export const RATING_WEIGHTS = { Q1: 25, Q2: 25, Q3: 20, Q4: 20, Q5: 10, D1: 25, D2: 25, D3: 15, D4: 15, D5: 15, D6: 5 } as const;
export type RatingMetric = keyof typeof RATING_WEIGHTS;
export const RATING_CHECKLISTS: Record<Exclude<RatingMetric, 'D6'>, readonly string[]> = {
  Q1: ['Judgments serve the declared role and purpose', 'Different consequences have replayable examples', 'Mechanical actions are distinguished from useful decisions'],
  Q2: ['Structure serves sorting or teaching', 'Ablations compare order, resources and later use, not only move count'],
  Q3: ['Conditions and linked targets are readable', 'Known and unknown portions are distinct', 'Unlock/reveal feedback matches events', 'Seen-relocked liquid remains visible and unusable'],
  Q4: ['Preparation, breakthroughs and tail fit the declared role', 'Shortest and plus-two route ranges have been inspected', 'Milestone preparation and later sorting are assessed separately'],
  Q5: ['Comparison set and family are identified', 'Canonical duplicates and same-base variants are checked', 'New decisions, rather than new artwork, justify the grade'],
  D1: ['Preparation evidence is distinct from required foresight', 'An example explains what horizon distinguishes the plans'],
  D2: ['All non-equivalent actions at the cited state are considered', 'Visible similarities and actual tradeoffs are explained', 'Route or solution counts are not used as a difficulty target'],
  D3: ['Only genuinely compatible open receiving capacity counts', 'Peak and sustained pressure are distinguished'],
  D4: ['Deterministic key dependencies and verified dynamic precedence are distinguished', 'Resource competition has an explicit example', 'Opening all groups is not assumed to be a goal'],
  D5: ['Reasoning uses only public clues and inventory', 'A reveal count is not a reasoning grade', 'Any claimed replanning has a concrete before/after example'],
};
export const METRIC_EVIDENCE: Record<RatingMetric, readonly string[]> = {
  Q1: ['shortest', 'plusTwo'], Q2: ['mechanisms', 'ablations'], Q3: ['expression', 'information'], Q4: ['shortest', 'plusTwo'], Q5: ['novelty'],
  D1: ['shortest', 'plusTwo'], D2: ['shortest', 'plusTwo'], D3: ['shortest', 'plusTwo'], D4: ['mechanisms', 'shortest'], D5: ['information', 'ablations'], D6: ['graph'],
};
export function operationGrade(moves: number) {
  if (!Number.isSafeInteger(moves) || moves < 0) throw new Error('Invalid shortest pour count');
  return moves <= 6 ? 0 : moves <= 12 ? 1 : moves <= 18 ? 2 : moves <= 24 ? 3 : moves <= 30 ? 4 : 5;
}
type ManualItem = { grade: number | null; reviewer: string; reason: string; evidenceRefs: string[]; checklist: boolean[]; externalEvidence: string[] };
export type RatingReview = { method: string; puzzle: string; evidenceSha256: string; metrics: Partial<Record<RatingMetric, ManualItem>> };
function strictObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error('Invalid review fields');
  return value as Record<string, unknown>;
}
export function parseRatingReview(value: unknown, report: UnlockRatingReport): RatingReview {
  const root = strictObject(value, ['method', 'puzzle', 'evidenceSha256', 'metrics']);
  if (root.method !== UNLOCK_RATING_METHOD || root.puzzle !== report.puzzleId) throw new Error('Invalid review method or puzzle');
  // Puzzle ID is separately supplied by the bound definition, never inferred from a filename.
  if (root.evidenceSha256 !== report.evidenceSha256 || report.status !== 'complete') throw new Error('Review evidence is stale or unknown');
  const metrics = strictObject(root.metrics, Object.keys(RATING_WEIGHTS));
  const parsed: RatingReview['metrics'] = {};
  for (const [name, raw] of Object.entries(metrics)) {
    if (name === 'D6') throw new Error('D6 is automatic and cannot be overridden');
    const key = name as Exclude<RatingMetric, 'D6'>, item = strictObject(raw, ['grade', 'reviewer', 'reason', 'evidenceRefs', 'checklist', 'externalEvidence']);
    if (item.grade !== null && (!Number.isInteger(item.grade) || (item.grade as number) < 0 || (item.grade as number) > 5)) throw new Error('Review grade outside 0–5');
    if (typeof item.reviewer !== 'string' || typeof item.reason !== 'string'
      || !Array.isArray(item.evidenceRefs) || !item.evidenceRefs.length || item.evidenceRefs.some(r => typeof r !== 'string' || !METRIC_EVIDENCE[key].includes(r))
      || !Array.isArray(item.checklist) || item.checklist.length !== RATING_CHECKLISTS[key].length || item.checklist.some(c => typeof c !== 'boolean')
      || !Array.isArray(item.externalEvidence) || item.externalEvidence.some(e => typeof e !== 'string' || !e.trim())) throw new Error('Review checklist or evidence missing');
    if (item.grade !== null && (!item.reviewer.trim() || !item.reason.trim() || item.checklist.some(c => !c)
      || key === 'Q3' && !item.externalEvidence.length)) throw new Error('Scored manual item requires reviewer, reasons, completed checklist and Q3 UI evidence');
    parsed[key] = item as ManualItem;
  }
  return { method: root.method as string, puzzle: root.puzzle as string, evidenceSha256: root.evidenceSha256 as string, metrics: parsed };
}
export function reviewTemplate(id: string, report: UnlockRatingReport): RatingReview {
  return { method: UNLOCK_RATING_METHOD, puzzle: id, evidenceSha256: report.evidenceSha256,
    metrics: Object.fromEntries(Object.entries(RATING_CHECKLISTS).map(([metric, checklist]) => [metric, {
      grade: null, reviewer: '', reason: '', evidenceRefs: [...METRIC_EVIDENCE[metric as RatingMetric]], checklist: checklist.map(() => false), externalEvidence: [],
    }])) };
}
export function scoreUnlockRating(id: string, report: UnlockRatingReport, rawReview?: unknown) {
  if (id !== report.puzzleId) throw new Error('Score puzzle mismatch');
  const review = rawReview === undefined ? null : parseRatingReview(rawReview, report);
  if (review && review.puzzle !== id) throw new Error('Review puzzle mismatch');
  const metrics = Object.fromEntries(Object.entries(RATING_WEIGHTS).map(([name, weight]) => {
    const metric = name as RatingMetric;
    if (metric === 'D6' && report.status === 'complete' && report.evidence.graph.status === 'complete' && report.evidence.graph.shortestMoves !== null) {
      const n = report.evidence.graph.shortestMoves, grade = operationGrade(n);
      return [metric, { status: 'scored', source: 'automatic', grade, weight, points: grade * weight / 5,
        reason: `Verified shortest route: ${n} pours; <=6 / 7–12 / 13–18 / 19–24 / 25–30 / >=31 => 0–5.`, evidenceRefs: METRIC_EVIDENCE[metric] }];
    }
    const manual = review?.metrics[metric];
    return [metric, manual?.grade !== null && manual?.grade !== undefined
      ? { ...manual, status: 'scored', source: 'manual', weight, points: manual.grade * weight / 5 }
      : { status: 'pending', source: 'pending', grade: null, weight, points: null, evidenceRefs: METRIC_EVIDENCE[metric],
        reason: report.status === 'unknown' ? 'Required search is unknown.' : 'No confirmed automatic mapping or completed manual review.', checklist: metric === 'D6' ? [] : RATING_CHECKLISTS[metric] }];
  })) as Record<RatingMetric, { status: string; points: number | null; grade: number | null; source: string; reason: string }>;
  const total = (prefix: 'Q' | 'D') => {
    const items = Object.entries(metrics).filter(([key]) => key.startsWith(prefix));
    return { score: items.every(([, m]) => m.points !== null) ? items.reduce((n, [, m]) => n + m.points!, 0) : null,
      pending: items.filter(([, m]) => m.points === null).map(([key]) => key),
      source: 'Fixed approved weights; automatic and manual sources remain explicit; missing weights are never redistributed.' };
  };
  return { method: UNLOCK_RATING_METHOD, evidenceSha256: report.evidenceSha256, metrics, Q: total('Q'), D: total('D') };
}
