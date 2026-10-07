import { decodeContentPool, encodeContentPool } from './contentCodec.ts';
import { DIFFICULTY_POLICY, type DifficultyReport, type DifficultyTier } from './difficulty.ts';
import { decodeDifficultyPool, encodeDifficultyPool } from './difficultyCodec.ts';
import { hasDiverseStart, recordObject, type GeneratedContent } from './generation.ts';

export const PLAY_TIERS: readonly DifficultyTier[] = ['D1', 'D2', 'D3', 'D4'];
export type CatalogEntry = { readonly content: GeneratedContent; readonly difficulty: DifficultyReport };
export type PlayCatalog = { readonly id: string; readonly entries: readonly CatalogEntry[] };

/** A current internal content baseline, independent of UI and storage. Every record
 * has replayable completion evidence and an actual rating, not a requested label. */
export function decodeCatalog(json: string): PlayCatalog {
  if (json.length > 2000000) throw new Error('Catalog exceeds 2 MB');
  const value = recordObject(JSON.parse(json), ['format', 'version', 'id', 'policy', 'records'], 'catalog');
  if (value.format !== 'bottle-harmony-catalog' || value.version !== 1 || value.policy !== DIFFICULTY_POLICY
    || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value.id) || !Array.isArray(value.records)) throw new Error('Invalid catalog');
  const records = value.records.map(input => recordObject(input, ['content', 'difficulty'], 'catalog entry'));
  const contents = decodeContentPool(JSON.stringify({ format: 'bottle-harmony-pool', version: 1, records: records.map(record => record.content) }));
  const reports = decodeDifficultyPool(JSON.stringify({ format: 'bottle-harmony-difficulty-pool', version: 1, records: records.map(record => record.difficulty) }), contents.map(content => content.level));
  const byId = new Map(reports.map(report => [report.levelId, report]));
  const entries = contents.map(content => {
    const difficulty = byId.get(content.level.id)!;
    if (difficulty.status !== 'rated' || !difficulty.tier) throw new Error('Unrated catalog entry');
    if ((difficulty.tier === 'D3' || difficulty.tier === 'D4') && (content.origin.config.mixing !== 'diverse' || !hasDiverseStart(content.level))) throw new Error('Thinking/challenge content requires diverse starts');
    return Object.freeze({ content, difficulty });
  });
  for (const tier of PLAY_TIERS) if (!entries.some(entry => entry.difficulty.tier === tier)) throw new Error(`Missing catalog tier ${tier}`);
  return Object.freeze({ id: value.id, entries: Object.freeze(entries) });
}

export function encodeCatalog(catalog: PlayCatalog): string {
  // Validate through the existing provenance, deduplication and evidence boundaries.
  encodeContentPool(catalog.entries.map(entry => entry.content));
  encodeDifficultyPool(catalog.entries.map(entry => entry.difficulty), catalog.entries.map(entry => entry.content.level));
  const json = JSON.stringify({ format: 'bottle-harmony-catalog', version: 1, id: catalog.id, policy: DIFFICULTY_POLICY, records: catalog.entries }, null, 2);
  decodeCatalog(json);
  return json;
}
