import { decodePlayableMainline } from '../game/mainlinePlayable';
import { parseProductionRecords } from '../game/mainlineCatalog';
import { parseHumanDifficultyReport } from '../game/humanDifficulty';
const data: unknown = require('../../assets/levels/mainline-play.json');
export const MAINLINE = decodePlayableMainline(JSON.stringify(data));
export function mainlineReport(number: number) {
  const full = require('../../assets/levels/mainline-catalog.json');
  const row = full.records[number - 1];
  const record = parseProductionRecords([{ content: row.content, rating: row.rating }])[0];
  return { rating: record.rating, human: parseHumanDifficultyReport(row.human, record.content.level,
    record.rating.evidence.rank!, record.rating.evidence.metrics.shortestMoves!) };
}
