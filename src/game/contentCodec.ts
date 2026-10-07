import { parseGeneratedContent, recordObject, type GeneratedContent } from './generation.ts';
import { LevelValidationError } from './model.ts';

const MAX_POOL_CHARACTERS = 32000000;
const MAX_RECORDS = 1000;

function parsePool(input: unknown): readonly GeneratedContent[] {
  const value = recordObject(input, ['format', 'version', 'records'], 'pool');
  if (value.format !== 'bottle-harmony-pool' || value.version !== 1 || !Array.isArray(value.records) || value.records.length < 1 || value.records.length > MAX_RECORDS) throw new LevelValidationError(['Invalid pool format or record count (1 to 1000)']);
  const records = value.records.map(parseGeneratedContent);
  const keys = new Set<string>(), ids = new Set<string>();
  for (const record of records) {
    if (keys.has(record.structureKey) || ids.has(record.level.id)) throw new LevelValidationError(['Pool contains duplicate content']);
    keys.add(record.structureKey); ids.add(record.level.id);
  }
  return Object.freeze(records);
}

export function encodeContentPool(records: readonly GeneratedContent[]): string {
  const verified = parsePool({ format: 'bottle-harmony-pool', version: 1, records });
  const json = JSON.stringify({ format: 'bottle-harmony-pool', version: 1, records: verified }, null, 2);
  if (json.length > MAX_POOL_CHARACTERS) throw new LevelValidationError(['Content pool exceeds size limit']);
  return json;
}

export function decodeContentPool(json: string): readonly GeneratedContent[] {
  if (typeof json !== 'string' || json.length > MAX_POOL_CHARACTERS) throw new LevelValidationError(['Content pool exceeds size limit']);
  let input: unknown;
  try { input = JSON.parse(json); } catch { throw new LevelValidationError(['Invalid pool JSON']); }
  return parsePool(input);
}
