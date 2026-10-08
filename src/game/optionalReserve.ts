import { parseLevel, type LevelDefinition } from './model.ts';
import type { PlayableEntry } from './mainlinePlayable.ts';

/** Independently solved against mainline-1000-v5; the level ID binds each offer to its board. */
export const OPTIONAL_RESERVE_LEVELS: ReadonlyMap<number, string> = new Map([
  [4, 'a-v1-001e849e-0-6c-2e'],
  [65, 'a-v1-002dc822-0-7c-2e'],
  [68, 'a-v1-00325b1a-0-7c-2e'],
  [193, 'a-v1-001e8547-0-6c-2e'],
  [364, 'a-v1-002dc7ab-0-7c-2e'],
  [463, 'a-v1-006ad015-0-8c-2e'],
  [485, 'a-v1-00325ada-0-7c-2e'],
]);

export function hasOptionalReserve(entry: PlayableEntry): boolean {
  const bottles = entry.level.bottles;
  return OPTIONAL_RESERVE_LEVELS.get(entry.number) === entry.level.id && bottles.length >= 5
    && bottles.at(-1)!.layers.length === 0 && bottles.at(-2)!.layers.length === 0;
}

export function oneSpareLevel(entry: PlayableEntry): LevelDefinition {
  if (!hasOptionalReserve(entry)) return entry.level;
  return parseLevel({ ...entry.level, bottles: entry.level.bottles.slice(0, -1) });
}
