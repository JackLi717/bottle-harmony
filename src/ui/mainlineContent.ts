import { decodePlayableMainline } from '../game/mainlinePlayable';
import { parseProductionRecords } from '../game/mainlineCatalog';
const data: unknown = require('../../assets/levels/mainline-play.json');
export const MAINLINE = decodePlayableMainline(JSON.stringify(data));
export function mainlineReport(number: number) {
  const full = require('../../assets/levels/mainline-catalog.json');
  const row = full.records[number - 1];
  return parseProductionRecords([{ content: row.content, rating: row.rating }])[0].rating;
}
