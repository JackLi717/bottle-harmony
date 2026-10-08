import type { PlayableMainline } from '../game/mainlinePlayable';
import type { MainlineEntry } from '../game/mainlineCatalog';
import type { ContentRepository } from '../storage/contentRepository';
export let MAINLINE: PlayableMainline;
let repository: ContentRepository;
export function installMainlineContent(content: ContentRepository) { repository = content; MAINLINE = content.mainline; }
export function mainlineReport(number: number) {
  const entry = MAINLINE.entries[number - 1];
  const row = repository.evidence<MainlineEntry>(entry.levelId ?? entry.level.id);
  return { rating: row.rating, human: row.human };
}
