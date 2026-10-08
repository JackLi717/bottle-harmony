import { tierForHumanScore } from './humanDifficulty.ts';
import { FEATURE_TAGS, FEATURE_TYPES, type FeatureTag, type LevelFeatureReport } from './levelFeatures.ts';

export type FeatureRow = { readonly number: number; readonly report: LevelFeatureReport };
/** Discussion targets, not production quotas or changes to difficulty ordering. */
export const FEATURE_COVERAGE_POLICY = 'classic-coverage-proposal-v1' as const;
export const FEATURE_COVERAGE_TARGETS: readonly { readonly tag: FeatureTag; readonly minimumShare: number;
  readonly maximumShare: number; readonly tiers?: readonly string[] }[] = [
  { tag: 'early-deception', minimumShare: 0.04, maximumShare: 0.08 },
  { tag: 'preparation-chain-route', minimumShare: 0.05, maximumShare: 0.10 },
  { tag: 'space-reuse-route', minimumShare: 0.08, maximumShare: 0.15 },
  { tag: 'midroute-risk', minimumShare: 0.12, maximumShare: 0.20 },
  { tag: 'late-risk', minimumShare: 0.02, maximumShare: 0.04 },
  { tag: 'repeated-decision-risk', minimumShare: 0.05, maximumShare: 0.10 },
  { tag: 'small-board-planning', minimumShare: 0.08, maximumShare: 0.15 },
  { tag: 'repeated-bottom-start', minimumShare: 0.25, maximumShare: 0.40 },
  { tag: 'alternating-start', minimumShare: 0.04, maximumShare: 0.08, tiers: ['D1', 'D2'] },
  { tag: 'adjacent-block-start', minimumShare: 0.03, maximumShare: 0.08 },
];
const strategyTags = new Set<FeatureTag>([
  'early-deception', 'early-risk', 'opening-risk', 'multiple-safe-openings', 'repeated-decision-risk',
  'midroute-risk', 'space-tight-route', 'space-reuse-route', 'preparation-chain-route', 'late-risk',
]);

/** Similarity measures observed strategy tags, not exact structural equivalence.
 * Unknown late observations are removed from BOTH sides of the comparison. */
export function featureSimilarity(left: LevelFeatureReport, right: LevelFeatureReport): number {
  const comparable = (tag: FeatureTag) => strategyTags.has(tag)
    && (tag !== 'late-risk' || left.late.status === 'complete' && right.late.status === 'complete')
    && (!tag.startsWith('early-') || left.early.status === 'complete' && right.early.status === 'complete');
  const a = new Set(left.tags.filter(comparable)), b = new Set(right.tags.filter(comparable));
  const union = new Set([...a, ...b]);
  return union.size ? [...a].filter(tag => b.has(tag)).length / union.size : 0;
}

export function summarizeFeatureRows(rows: readonly FeatureRow[]) {
  const completeLate = rows.filter(row => row.report.late.status === 'complete').length;
  const completeEarly = rows.filter(row => row.report.early.status === 'complete').length;
  return {
    levels: rows.length,
    lateCoverage: { complete: completeLate, unknown: rows.filter(row => row.report.late.status === 'unknown').length,
      notRequested: rows.filter(row => row.report.late.status === 'not-requested').length },
    earlyCoverage: { complete: completeEarly, unknown: rows.filter(row => row.report.early.status === 'unknown').length,
      notRequested: rows.filter(row => row.report.early.status === 'not-requested').length,
      notApplicable: rows.filter(row => row.report.early.status === 'not-applicable').length },
    primary: Object.entries(FEATURE_TYPES).map(([type, name]) => ({ type, name,
      count: rows.filter(row => row.report.primary === type).length })),
    tags: Object.entries(FEATURE_TAGS).map(([tag, definition]) => {
      const matches = rows.filter(row => row.report.tags.includes(tag as FeatureTag));
      return { tag, ...definition, count: matches.length,
        denominator: tag === 'late-risk' ? completeLate : tag.startsWith('early-') ? completeEarly : rows.length,
        examples: matches.slice(0, 6).map(row => row.number) };
    }),
  };
}

/** Multi-label ranges overlap. Unknown observations widen the possible count
 * instead of being treated as absent; the first three teaching levels are fixed. */
export function recommendFeatureCoverage(rows: readonly FeatureRow[]) {
  return FEATURE_COVERAGE_TARGETS.map(target => {
    const eligible = rows.filter(row => row.number > 3
      && (!target.tiers || target.tiers.includes(tierForHumanScore(row.report.humanScore))));
    const count = eligible.filter(row => row.report.tags.includes(target.tag)).length;
    const unknown = eligible.filter(row => target.tag.startsWith('early-')
      ? row.report.early.status === 'unknown' || row.report.early.status === 'not-requested'
      : target.tag === 'late-risk' && row.report.late.status !== 'complete').length;
    const minimum = Math.ceil(eligible.length * target.minimumShare), maximum = Math.floor(eligible.length * target.maximumShare);
    const status = eligible.length < 50 ? 'insufficient-sample' : count + unknown < minimum ? 'below-target'
      : count > maximum ? 'above-target' : unknown ? 'incomplete' : 'within-target';
    return { ...target, name: FEATURE_TAGS[target.tag].name, eligible: eligible.length, count, unknown,
      minimum, maximum, status, confirmedShortfall: Math.max(0, minimum - count - unknown),
      possibleShortfall: Math.max(0, minimum - count) };
  });
}

export function buildFeatureDistribution(rows: readonly FeatureRow[]) {
  if (!rows.length || new Set(rows.map(row => row.number)).size !== rows.length
    || rows.some(row => !Number.isInteger(row.number) || row.number < 1 || row.number > 1000)
    || new Set(rows.map(row => row.report.structureKey)).size !== rows.length) throw new Error('Invalid feature rows');
  const ordered = [...rows].sort((a, b) => a.number - b.number);
  const adjacent = ordered.slice(1).flatMap((right, i) => {
    const left = ordered[i];
    if (right.number !== left.number + 1) return [];
    return [{ left: left.number, right: right.number, similarity: featureSimilarity(left.report, right.report),
      samePrimary: left.report.primary === right.report.primary }];
  });
  let longestPrimaryRun = 1, currentRun = 1;
  adjacent.forEach((pair, index) => {
    currentRun = pair.samePrimary ? (index === 0 || pair.left === adjacent[index - 1].right ? currentRun + 1 : 2) : 1;
    longestPrimaryRun = Math.max(longestPrimaryRun, currentRun);
  });
  const group = (items: readonly FeatureRow[]) => summarizeFeatureRows(items);
  return {
    whole: group(ordered),
    recommendations: { policy: FEATURE_COVERAGE_POLICY, targets: recommendFeatureCoverage(ordered) },
    byTier: ['D1', 'D2', 'D3', 'D4'].map(tier => ({ tier, ...group(ordered.filter(row => tierForHumanScore(row.report.humanScore) === tier)) })),
    byScore: [...new Set(ordered.map(row => row.report.humanScore))].sort((a, b) => a - b)
      .map(score => ({ score, ...group(ordered.filter(row => row.report.humanScore === score)) })),
    byColors: [...new Set(ordered.map(row => row.report.structure.colors))].sort((a, b) => a - b)
      .map(colors => ({ colors, ...group(ordered.filter(row => row.report.structure.colors === colors)) })),
    stages: Array.from({ length: 20 }, (_, i) => ({ stage: i + 1,
      ...group(ordered.filter(row => Math.floor((row.number - 1) / 50) === i)) })).filter(stage => stage.levels),
    waves: Array.from({ length: 100 }, (_, i) => ({ wave: i + 1,
      ...group(ordered.filter(row => Math.floor((row.number - 1) / 10) === i)) })).filter(wave => wave.levels),
    adjacency: { pairs: adjacent.length, samePrimaryPairs: adjacent.filter(pair => pair.samePrimary).length,
      longestPrimaryRun, similarPairs: adjacent.filter(pair => pair.similarity >= 0.8) },
  };
}
