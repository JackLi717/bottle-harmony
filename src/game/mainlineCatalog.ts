import { decodeContentPool } from './contentCodec.ts';
import { decodeDepthPool } from './difficultyCodec.ts';
import { INTERNAL_GRADES, LOAD_MODEL, scorePlanningDepth, type LoadReport } from './difficultyLoad.ts';
import { hasDiverseStart, recordObject, type GeneratedContent } from './generation.ts';
import { createProductionPlan, PRODUCTION_PLAN, validateRamp } from './productionPlan.ts';
import { hasCleanStart } from './startQuality.ts';
import { HUMAN_MODEL, parseHumanDifficultyReport, tierForHumanScore, type HumanDifficultyReport } from './humanDifficulty.ts';

export type ProductionRecord = { readonly content: GeneratedContent; readonly rating: LoadReport };
export type MainlineEntry = ProductionRecord & { readonly number: number; readonly human: HumanDifficultyReport };
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
  if (json.length > LIMIT) throw new Error('Mainline file exceeds size budget');
  const raw = recordObject(JSON.parse(json), ['format', 'version', 'id', 'plan', 'model', 'records'], 'mainline catalog');
  if (raw.format !== 'bottle-harmony-mainline' || raw.version !== 1 || raw.plan !== PRODUCTION_PLAN || raw.model !== HUMAN_MODEL
    || typeof raw.id !== 'string' || !/^[\w-]{1,64}$/.test(raw.id) || !Array.isArray(raw.records) || raw.records.length !== 1000) throw new Error('Invalid mainline catalog');
  const rows = raw.records.map(r => recordObject(r, ['number', 'content', 'rating', 'human'], 'mainline entry'));
  const records = parseProductionRecords(rows.map(r => ({ content: r.content, rating: r.rating })));
  const plan = createProductionPlan();
  const entries = records.map((record, index) => {
    const slot = plan[index], colors = record.content.level.colors.length;
    const human = parseHumanDifficultyReport(rows[index].human, record.content.level,
      record.rating.evidence.rank!, record.rating.evidence.metrics.shortestMoves!);
    if (rows[index].number !== slot.number || colors < (slot.number <= 3 ? 2 : 4) || colors > (slot.number <= 3 ? 3 : 11)
      || record.content.level.bottles.length > 12 || record.content.level.capacity !== 4
      || (tierForHumanScore(human.score!.total) === 'D3' || tierForHumanScore(human.score!.total) === 'D4') && !hasDiverseStart(record.content.level)
      || record.content.solution.length > slot.maxSolutionMoves || !hasCleanStart(record.content.level)) throw new Error(`Entry violates slot ${slot.number}`);
    return Object.freeze({ ...record, number: slot.number, human });
  });
  validateRamp(entries.map(entry => ({ number: entry.number, score: entry.human.score!.total })));
  return Object.freeze({ id: raw.id, entries: Object.freeze(entries) });
}

export function encodeMainlineCatalog(catalog: MainlineCatalog): string {
  const json = JSON.stringify({ format: 'bottle-harmony-mainline', version: 1, id: catalog.id, plan: PRODUCTION_PLAN, model: HUMAN_MODEL, records: catalog.entries });
  decodeMainlineCatalog(json);
  return json;
}
