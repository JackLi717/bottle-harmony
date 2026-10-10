import { parseLevel, type LevelDefinition } from './model.ts';

export const ENGINE_LIMITS = Object.freeze({ containers: 16, capacity: 16, colors: 12, units: 192, triggers: 32, jsonCharacters: 131072 });
export type SortingContainer = {
  readonly id: string; readonly capacity: number; readonly canSource: boolean; readonly canReceive: boolean;
  readonly receive: 'same' | 'any'; readonly units: readonly string[]; readonly fixed: boolean; readonly protectedBottom: number; readonly acceptColors: readonly string[] | null;
};
export type SortingUnit = { readonly id: string; readonly color: string };
export type SortingGoal =
  | { readonly type: 'sort'; readonly containers: readonly string[] }
  | { readonly type: 'collect'; readonly container: string; readonly color: string; readonly count: number; readonly exact: boolean; readonly exclusive: boolean }
  | { readonly type: 'sequence'; readonly container: string; readonly colors: readonly string[] }
  | { readonly type: 'all'; readonly goals: readonly SortingGoal[] };
export type SortingTrigger = {
  readonly id: string;
  readonly when: { readonly type: 'empty'; readonly container: string } | { readonly type: 'color-full'; readonly color: string; readonly count: 4 };
  readonly unlock: readonly string[];
};
export type SortingPuzzle = {
  readonly format: 'bottle-harmony-engine'; readonly version: 1; readonly rules: 'sorting-v1';
  readonly id: string; readonly revision: string; readonly colors: readonly string[]; readonly units: readonly SortingUnit[];
  readonly containers: readonly SortingContainer[]; readonly amount: 'run' | 'one'; readonly goal: SortingGoal;
  readonly locked: readonly string[]; readonly hidden: readonly string[]; readonly triggers: readonly SortingTrigger[];
};
export class EngineValidationError extends Error {}
const fail = (message: string): never => { throw new EngineValidationError(message); };
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Expected object');
  if (Object.keys(value).some(key => !keys.includes(key))) return fail('Unsupported field');
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value) ? value : fail('Invalid ID');
}
function boolean(value: unknown): boolean { return typeof value === 'boolean' ? value : fail('Expected boolean'); }
function integer(value: unknown, min: number, max: number): number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max ? value as number : fail('Integer outside budget');
}
function array<T>(value: unknown, parse: (v: unknown) => T, max: number, min = 0): readonly T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) return fail('Array outside budget');
  return Object.freeze(value.map(parse));
}
function unique(values: readonly string[]): readonly string[] {
  if (new Set(values).size !== values.length) fail('Duplicate ID');
  return values;
}

/** Strict new encoding; the shipped water-sort-v1 decoder remains unchanged. */
export function parseSortingPuzzle(input: unknown): SortingPuzzle {
  const value = record(input, ['format', 'version', 'rules', 'id', 'revision', 'colors', 'units', 'containers', 'amount', 'goal', 'locked', 'hidden', 'triggers']);
  if (value.format !== 'bottle-harmony-engine' || value.version !== 1 || value.rules !== 'sorting-v1') fail('Unsupported engine encoding or rules');
  const colors = unique(array(value.colors, id, ENGINE_LIMITS.colors, 1));
  const units = array(value.units, v => {
    const unit = record(v, ['id', 'color']);
    const color = id(unit.color);
    if (!colors.includes(color)) fail('Unknown color');
    return Object.freeze({ id: id(unit.id), color });
  }, ENGINE_LIMITS.units, 1);
  const unitIds = unique(units.map(u => u.id));
  if (colors.some(color => !units.some(u => u.color === color))) fail('Unused color');
  const containers = array(value.containers, v => {
    const c = record(v, ['id', 'capacity', 'canSource', 'canReceive', 'receive', 'units', 'fixed', 'protectedBottom', 'acceptColors']);
    const capacity = integer(c.capacity, 1, ENGINE_LIMITS.capacity);
    if (c.receive !== 'same' && c.receive !== 'any') fail('Unknown receiver policy');
    return Object.freeze({ id: id(c.id), capacity, canSource: boolean(c.canSource), canReceive: boolean(c.canReceive),
      receive: c.receive as 'same' | 'any', units: array(c.units, id, capacity), fixed: boolean(c.fixed), protectedBottom: integer(c.protectedBottom === undefined ? 0 : c.protectedBottom, 0, capacity),
      acceptColors: c.acceptColors === undefined || c.acceptColors === null ? null : unique(array(c.acceptColors, v => { const color = id(v); return colors.includes(color) ? color : fail('Unknown receiver color'); }, colors.length, 1)) });
  }, ENGINE_LIMITS.containers, 2);
  const containerIds = unique(containers.map(c => c.id));
  if (containers.some(c => c.protectedBottom > c.units.length)) fail('Protected bottom exceeds initial liquid');
  const assigned = unique(containers.flatMap(c => c.units));
  if (assigned.length !== units.length || assigned.some(u => !unitIds.includes(u))) fail('Every unit must occur exactly once');
  const ref = (v: unknown) => { const key = id(v); return containerIds.includes(key) ? key : fail('Unknown container'); };
  const colorRef = (v: unknown) => { const key = id(v); return colors.includes(key) ? key : fail('Unknown goal color'); };
  let goalCount = 0;
  function goal(v: unknown, depth = 0): SortingGoal {
    if (++goalCount > 32 || depth > 4) fail('Goal budget exceeded');
    const g = record(v, ['type', 'containers', 'container', 'color', 'count', 'exact', 'exclusive', 'colors', 'goals']);
    if (g.type === 'sort') {
      record(v, ['type', 'containers']);
      return Object.freeze({ type: 'sort', containers: unique(array(g.containers, ref, containers.length, 1)) });
    }
    if (g.type === 'collect') {
      record(v, ['type', 'container', 'color', 'count', 'exact', 'exclusive']);
      const container = ref(g.container), color = colorRef(g.color);
      const count = integer(g.count, 1, containers.find(c => c.id === container)!.capacity);
      if (units.filter(u => u.color === color).length < count) fail('Insufficient target inventory');
      return Object.freeze({ type: 'collect', container, color, count, exact: boolean(g.exact), exclusive: boolean(g.exclusive) });
    }
    if (g.type === 'sequence') {
      record(v, ['type', 'container', 'colors']);
      const container = ref(g.container), pattern = array(g.colors, colorRef, containers.find(c => c.id === container)!.capacity, 1);
      for (const color of colors) if (pattern.filter(c => c === color).length > units.filter(u => u.color === color).length) fail('Insufficient sequence inventory');
      return Object.freeze({ type: 'sequence', container, colors: pattern });
    }
    if (g.type === 'all') {
      record(v, ['type', 'goals']);
      return Object.freeze({ type: 'all', goals: array(g.goals, child => goal(child, depth + 1), 16, 1) });
    }
    return fail('Unsupported goal');
  }
  const locked = unique(array(value.locked, ref, containers.length));
  const hidden = unique(array(value.hidden, v => { const key = id(v); return unitIds.includes(key) ? key : fail('Unknown hidden unit'); }, units.length));
  const triggers = array(value.triggers, v => {
    const trigger = record(v, ['id', 'when', 'unlock']);
    const condition = record(trigger.when, ['type', 'container', 'color', 'count']);
    let when: SortingTrigger['when'];
    if (condition.type === 'empty') {
      record(trigger.when, ['type', 'container']);
      const container = ref(condition.container);
      if (!containers.find(c => c.id === container)!.units.length) fail('Key bottle must initially contain liquid');
      when = Object.freeze({ type: 'empty', container });
    } else if (condition.type === 'color-full') {
      record(trigger.when, ['type', 'color', 'count']);
      if (condition.count !== 4) fail('Cover condition requires four portions');
      when = Object.freeze({ type: 'color-full', color: colorRef(condition.color), count: 4 });
    } else return fail('Unknown trigger condition');
    const unlock = unique(array(trigger.unlock, ref, containers.length, 1));
    if (unlock.some(c => !locked.includes(c))) fail('Trigger targets must be initially locked');
    return Object.freeze({ id: id(trigger.id), when, unlock });
  }, ENGINE_LIMITS.triggers);
  unique(triggers.map(t => t.id));
  if (locked.some(c => !triggers.some(t => t.unlock.includes(c)))) fail('Locked container has no trigger');
  if (value.amount !== 'run' && value.amount !== 'one') fail('Unknown transfer amount');
  const puzzle: SortingPuzzle = Object.freeze({ format: 'bottle-harmony-engine', version: 1, rules: 'sorting-v1', id: id(value.id), revision: id(value.revision),
    colors, units, containers, amount: value.amount as 'run' | 'one', goal: goal(value.goal), locked, hidden, triggers });
  if (JSON.stringify(puzzle).length > ENGINE_LIMITS.jsonCharacters) fail('Engine JSON exceeds budget');
  return puzzle;
}

export function decodeSortingPuzzle(text: string): SortingPuzzle {
  if (text.length > ENGINE_LIMITS.jsonCharacters) fail('Engine JSON exceeds budget');
  return parseSortingPuzzle(JSON.parse(text));
}

/** Stable ID assignment belongs to this adapter version, never to the current board. */
export function classicSortingPuzzle(input: LevelDefinition, frozenBottle: number | null = null): SortingPuzzle {
  const level = parseLevel(input), units: SortingUnit[] = [];
  const containers = level.bottles.map((b, bottle) => ({ id: b.id, capacity: level.capacity, canSource: true, canReceive: true,
    receive: 'same' as const, fixed: false, protectedBottom: bottle === frozenBottle ? 1 : 0, units: b.layers.map((color, depth) => {
      const unit = { id: `u${bottle}_${depth}`, color }; units.push(unit); return unit.id;
    }) }));
  return parseSortingPuzzle({ format: 'bottle-harmony-engine', version: 1, rules: 'sorting-v1', id: level.id, revision: 'classic-v1',
    colors: level.colors, units, containers, amount: 'run', goal: { type: 'sort', containers: containers.map(c => c.id) }, locked: [], hidden: [], triggers: [] });
}
