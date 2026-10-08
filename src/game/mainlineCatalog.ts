import { decodeContentPool } from './contentCodec.ts';
import { decodeDepthPool } from './difficultyCodec.ts';
import { INTERNAL_GRADES, LOAD_MODEL, scorePlanningDepth, type LoadReport } from './difficultyLoad.ts';
import { hasDiverseStart, recordObject, type GeneratedContent } from './generation.ts';
import { createProductionPlan, PRODUCTION_PLAN, validateRamp, type WaveRole } from './productionPlan.ts';
import { FEATURE_MODEL, FEATURE_TAGS, FEATURE_TYPES, type FeatureTag, type FeatureType } from './levelFeatures.ts';
import { hasCleanStart, hasVariedStart } from './startQuality.ts';
import { HUMAN_MODEL, parseHumanDifficultyReport, tierForHumanScore, type HumanDifficultyReport } from './humanDifficulty.ts';

export type ProductionRecord = { readonly content: GeneratedContent; readonly rating: LoadReport };
export type LevelDesign = { readonly cycle: number; readonly position: number; readonly role: WaveRole;
  readonly featureModel: typeof FEATURE_MODEL; readonly primary: FeatureType; readonly tags: readonly FeatureTag[] };
export type MainlineEntry = ProductionRecord & { readonly number: number; readonly human: HumanDifficultyReport; readonly design?: LevelDesign };
export type MainlineCatalog = { readonly id: string; readonly entries: readonly MainlineEntry[] };
const LIMIT = 32000000;

/** Import checks source, all legal witnesses, binding and score arithmetic.
 * Completeness and shortest distances are independently recomputed offline. */
export function parseProductionRecords(input: unknown): readonly ProductionRecord[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 1000) throw new Error('Production record count must be 1..1000');
  const raw = input.map(value => recordObject(value, ['content', 'rating'], 'production record'));
  const contents = decodeContentPool(JSON.stringify({ format: 'bottle-harmony-pool', version: 1, records: raw.map(r => r.content) }));
  const ratings = raw.map(r => recordObject(r.rating, ['model', 'evidence', 'score'], 'load report'));
  const evidence = decodeDepthPool(JSON.stringify({ format: 'bottle-harmony-difficulty-pool', version: 1, records: ratings.map(r => r.evidence) }), contents.map(c => c.level));
  return Object.freeze(contents.map((content, index) => {
    const e = evidence[index], score = scorePlanningDepth(e);
    if (ratings[index].model !== LOAD_MODEL || e.status !== 'rated' || !score || e.levelId !== content.level.id
      || e.tier !== INTERNAL_GRADES[e.rank! - 1]?.tier) throw new Error('Incomplete production rating');
    const provided = recordObject(ratings[index].score, ['planning', 'peakDecision', 'repeatedDecisions', 'operations', 'total'], 'load score');
    if (Object.keys(score).some(key => provided[key] !== score[key as keyof typeof score])) throw new Error('Incorrect load score');
    if ((e.tier === 'D3' || e.tier === 'D4') && (content.origin.config.mixing !== 'diverse' || !hasDiverseStart(content.level))) throw new Error('Missing diverse start');
    return Object.freeze({ content, rating: Object.freeze({ model: LOAD_MODEL, evidence: e, score: Object.freeze(score) }) });
  }));
}

export function decodeMainlineCatalog(json: string): MainlineCatalog {
  return parseCatalog(json, false);
}

/** Offline input only; this does not restore old player saves or accept old runtime packs. */
export function decodeMainlineSelectionSource(json: string): MainlineCatalog {
  return parseCatalog(json, true);
}

function parseCatalog(json: string, selectionSource: boolean): MainlineCatalog {
  if (json.length > LIMIT) throw new Error('Mainline file exceeds size budget');
  const raw = recordObject(JSON.parse(json), ['format', 'version', 'id', 'plan', 'model', 'records'], 'mainline catalog');
  const legacySource = selectionSource && raw.plan === 'thousand-ramp-v1';
  if (raw.format !== 'bottle-harmony-mainline' || raw.version !== 1 || raw.plan !== PRODUCTION_PLAN && !legacySource || raw.model !== HUMAN_MODEL
    || typeof raw.id !== 'string' || !/^[\w-]{1,64}$/.test(raw.id) || !Array.isArray(raw.records) || raw.records.length !== 1000) throw new Error('Invalid mainline catalog');
  const rows = raw.records.map(r => recordObject(r, ['number', 'content', 'rating', 'human', 'design'], 'mainline entry'));
  const records = parseProductionRecords(rows.map(r => ({ content: r.content, rating: r.rating })));
  const plan = createProductionPlan();
  const entries = records.map((record, index) => {
    const slot = plan[index], colors = record.content.level.colors.length;
    const human = parseHumanDifficultyReport(rows[index].human, record.content.level,
      record.rating.evidence.rank!, record.rating.evidence.metrics.shortestMoves!);
    if (rows[index].number !== slot.number || colors < (slot.number <= 3 ? 2 : 4) || colors > (slot.number <= 3 ? 3 : 11)
      || record.content.level.bottles.length > 12 || record.content.level.capacity !== 4
      || (tierForHumanScore(human.score!.total) === 'D3' || tierForHumanScore(human.score!.total) === 'D4') && !hasDiverseStart(record.content.level)
      || record.content.solution.length > slot.maxSolutionMoves || !hasCleanStart(record.content.level)
      || !hasVariedStart(record.content.level)) throw new Error(`Entry violates slot ${slot.number}`);
    let design: LevelDesign | undefined;
    if (!legacySource) {
      const d = recordObject(rows[index].design, ['cycle', 'position', 'role', 'featureModel', 'primary', 'tags'], 'level design');
      if (d.cycle !== slot.cycle || d.position !== slot.cyclePosition || d.role !== slot.waveRole || d.featureModel !== FEATURE_MODEL
        || typeof d.primary !== 'string' || !(d.primary in FEATURE_TYPES) || d.primary === 'incomplete-observation' || !Array.isArray(d.tags)
        || new Set(d.tags).size !== d.tags.length || d.tags.some(tag => typeof tag !== 'string' || !(tag in FEATURE_TAGS))) throw new Error('Invalid level design');
      if (slot.role === 'challenge' && (record.rating.evidence.rank! < 4 || human.score!.trapPeak < (slot.targetScore < 55 ? 5 : 8))) throw new Error('Peak lacks decision evidence');
      if (slot.waveRole === 'recovery' && (human.score!.trapPeak > 12 || human.score!.trapRepeat > 3
        || d.tags.includes('preparation-chain-route'))) throw new Error('Recovery lacks relief evidence');
      design = Object.freeze(d as unknown as LevelDesign);
    }
    return Object.freeze({ ...record, number: slot.number, human, ...(design ? { design } : {}) });
  });
  if (!legacySource) validateRamp(entries.map(entry => ({ number: entry.number, score: entry.human.score!.total })));
  return Object.freeze({ id: raw.id, entries: Object.freeze(entries) });
}

export function encodeMainlineCatalog(catalog: MainlineCatalog): string {
  const json = JSON.stringify({ format: 'bottle-harmony-mainline', version: 1, id: catalog.id, plan: PRODUCTION_PLAN, model: HUMAN_MODEL, records: catalog.entries });
  decodeMainlineCatalog(json);
  return json;
}
