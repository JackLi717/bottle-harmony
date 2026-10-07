import { decodeContentPool } from './contentCodec.ts';
import { decodeDepthPool } from './difficultyCodec.ts';
import { INTERNAL_GRADES, LOAD_MODEL, scorePlanningDepth, type LoadReport } from './difficultyLoad.ts';
import { hasDiverseStart, recordObject, type GeneratedContent } from './generation.ts';
import { createProductionPlan, PRODUCTION_PLAN } from './productionPlan.ts';

export type ProductionRecord = { readonly content: GeneratedContent; readonly rating: LoadReport };
export type MainlineEntry = ProductionRecord & { readonly number: number };
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
  if (raw.format !== 'bottle-harmony-mainline' || raw.version !== 1 || raw.plan !== PRODUCTION_PLAN || raw.model !== LOAD_MODEL
    || typeof raw.id !== 'string' || !/^[\w-]{1,64}$/.test(raw.id) || !Array.isArray(raw.records) || raw.records.length !== 1000) throw new Error('Invalid mainline catalog');
  const rows = raw.records.map(r => recordObject(r, ['number', 'content', 'rating'], 'mainline entry'));
  const records = parseProductionRecords(rows.map(r => ({ content: r.content, rating: r.rating })));
  const plan = createProductionPlan();
  let previousChallenge = -1;
  const entries = records.map((record, index) => {
    const slot = plan[index], colors = record.content.level.colors.length, spares = record.content.origin.config.emptyBottles;
    if (rows[index].number !== slot.number || record.rating.evidence.rank !== slot.rank || record.rating.evidence.tier !== slot.tier
      || colors < slot.colorsMinimum || colors > slot.colorsMaximum || !slot.allowedEmptyBottles.includes(spares)
      || record.content.level.bottles.length > 12 || record.content.level.capacity !== 4
      || record.content.solution.length > slot.maxSolutionMoves) throw new Error(`Entry violates slot ${slot.number}`);
    if (slot.role === 'challenge') {
      if (record.rating.score!.total < previousChallenge) throw new Error('Challenge scores decrease');
      previousChallenge = record.rating.score!.total;
    }
    return Object.freeze({ ...record, number: slot.number });
  });
  return Object.freeze({ id: raw.id, entries: Object.freeze(entries) });
}

export function encodeMainlineCatalog(catalog: MainlineCatalog): string {
  const json = JSON.stringify({ format: 'bottle-harmony-mainline', version: 1, id: catalog.id, plan: PRODUCTION_PLAN, model: LOAD_MODEL, records: catalog.entries });
  decodeMainlineCatalog(json);
  return json;
}
