import { CORE_LIMITS, LevelValidationError, parseLevel, type LevelDefinition } from './model.ts';

export function encodeLevel(level: LevelDefinition): string {
  return JSON.stringify(parseLevel(level), null, 2);
}

export function decodeLevel(json: string): LevelDefinition {
  if (typeof json !== 'string' || json.length > CORE_LIMITS.jsonCharacters) throw new LevelValidationError(['Level JSON exceeds the input size limit']);
  let input: unknown;
  try { input = JSON.parse(json); } catch { throw new LevelValidationError(['Invalid JSON']); }
  return parseLevel(input);
}
