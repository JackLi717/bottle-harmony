import type { Board, ColorId } from './rules.ts';

export const CORE_LIMITS = { bottles: 16, colors: 12, capacity: 8, jsonCharacters: 32768 } as const;
export type BottleDefinition = { readonly id: string; readonly layers: readonly ColorId[] };
/** Ordinary movable bottles share one capacity. Array order is the display/replay order. */
export type LevelDefinition = {
  readonly format: 'bottle-harmony';
  readonly version: 1;
  readonly rules: 'water-sort';
  readonly id: string;
  readonly capacity: number;
  readonly colors: readonly ColorId[];
  readonly bottles: readonly BottleDefinition[];
};

const isId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export class LevelValidationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(issues.join('; '));
    this.name = 'LevelValidationError';
    this.issues = issues;
  }
}

/** Structural validity does not prove solvability. Each color fills exactly one bottle. */
export function validateBoard(input: unknown, capacity: number, colors?: readonly ColorId[]): string[] {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > CORE_LIMITS.capacity) return ['Capacity must be an integer from 1 to 8'];
  if (!Array.isArray(input) || input.length < 2 || input.length > CORE_LIMITS.bottles) return ['Board must contain 2 to 16 bottles'];
  const issues: string[] = [];
  const counts = new Map<string, number>();
  for (const [index, bottle] of input.entries()) {
    if (!Array.isArray(bottle) || bottle.length > capacity) { issues.push(`Bottle ${index} exceeds capacity or is not an array`); continue; }
    for (const color of bottle) {
      if (!isId(color)) { issues.push(`Bottle ${index} contains an invalid color ID`); continue; }
      counts.set(color, (counts.get(color) ?? 0) + 1);
    }
  }
  if (counts.size < 1 || counts.size > CORE_LIMITS.colors) issues.push('Board must contain 1 to 12 colors');
  for (const [color, count] of counts) {
    if (count !== capacity) issues.push(`Color ${color} must have exactly ${capacity} layers, received ${count}`);
    if (colors && !colors.includes(color)) issues.push(`Unknown color ${color}`);
  }
  if (colors) for (const color of colors) if (!counts.has(color)) issues.push(`Missing color ${color}`);
  return issues;
}

/** Validate unknown input and take a frozen, detached copy at the boundary. */
export function parseLevel(input: unknown): LevelDefinition {
  if (!isRecord(input)) throw new LevelValidationError(['Level must be an object']);
  const issues: string[] = [];
  const allowed = ['format', 'version', 'rules', 'id', 'capacity', 'colors', 'bottles'];
  if (Object.keys(input).some(key => !allowed.includes(key))) issues.push('Unsupported level field');
  if (input.format !== 'bottle-harmony' || input.version !== 1 || input.rules !== 'water-sort') issues.push('Unsupported format, version or rules');
  if (!isId(input.id)) issues.push('Invalid level ID');
  const colors = input.colors;
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > CORE_LIMITS.colors || !colors.every(isId) || new Set(colors).size !== colors.length) issues.push('Colors must be unique valid IDs (1 to 12)');
  const bottles = input.bottles;
  if (!Array.isArray(bottles) || bottles.length < 2 || bottles.length > CORE_LIMITS.bottles) issues.push('Level must contain 2 to 16 bottles');
  if (issues.length) throw new LevelValidationError(issues);
  const validBottles = bottles as unknown[];
  const ids = new Set<string>();
  const board: unknown[] = [];
  for (const bottle of validBottles) {
    if (!isRecord(bottle) || !isId(bottle.id) || Object.keys(bottle).some(key => key !== 'id' && key !== 'layers')) {
      issues.push('Bottle must contain a valid ID and layers only');
      continue;
    }
    if (ids.has(bottle.id)) issues.push(`Duplicate bottle ID ${bottle.id}`);
    ids.add(bottle.id);
    board.push(bottle.layers);
  }
  issues.push(...validateBoard(board, input.capacity as number, colors as string[]));
  if (issues.length) throw new LevelValidationError(issues);
  return Object.freeze({
    format: 'bottle-harmony', version: 1, rules: 'water-sort', id: input.id as string,
    capacity: input.capacity as number,
    colors: Object.freeze([...(colors as string[])]),
    bottles: Object.freeze(validBottles.map(bottle => {
      const value = bottle as BottleDefinition;
      return Object.freeze({ id: value.id, layers: Object.freeze([...value.layers]) });
    })),
  });
}

export function initialBoard(level: LevelDefinition): Board {
  return level.bottles.map(bottle => [...bottle.layers]);
}
