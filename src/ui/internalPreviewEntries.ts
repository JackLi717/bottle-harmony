import type { PlayableEntry } from '../game/mainlinePlayable.ts';

/** Select cards from the startup manifest, without materializing SQLite layouts. */
export function internalPreviewEntries(entries: readonly PlayableEntry[]): readonly PlayableEntry[] {
  return [entries.find(entry => entry.colorCount === 11),
    entries.find(entry => entry.colorCount === 10 && entry.bottleCount === 12),
    entries.at(-1)].filter((entry): entry is PlayableEntry => !!entry);
}
