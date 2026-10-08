import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseProductionRecords } from '../src/game/mainlineCatalog.ts';
import { recordObject } from '../src/game/generation.ts';
import { inspectStartQuality, measureStartVariety } from '../src/game/startQuality.ts';

const input = resolve(process.argv[2] ?? 'assets/levels/mainline-catalog.json');
const output = resolve(process.argv[3] ?? 'builds/mainline-start-audit.json');
const catalog = recordObject(JSON.parse(await readFile(input, 'utf8')), ['format', 'version', 'id', 'plan', 'model', 'records'], 'mainline catalog');
if (catalog.format !== 'bottle-harmony-mainline' || catalog.version !== 1 || typeof catalog.id !== 'string'
  || !Array.isArray(catalog.records) || catalog.records.length !== 1000) throw new Error('Invalid audit input');
const records = parseProductionRecords(catalog.records.map((entry, index) => {
  const row = recordObject(entry, ['number', 'content', 'rating', 'human'], 'mainline entry');
  if (row.number !== index + 1) throw new Error(`Invalid level number at ${index + 1}`);
  return { content: row.content, rating: row.rating };
}));
const rows = records.flatMap((record, index) => {
  const issues = inspectStartQuality(record.content.level);
  return issues.length ? [{ number: index + 1, rank: record.rating.evidence.rank,
    levelId: record.content.level.id, issues }] : [];
});
const variety = records.map((record, index) => ({ number: index + 1,
  generator: record.content.origin.generator, ...measureStartVariety(record.content.level) }));
const summarizeVariety = (items: typeof variety) => ({
  levels: items.length,
  allBottomPaired: items.filter(item => item.bottomPairs === item.filled).length,
  bottomPairedBottles: items.reduce((sum, item) => sum + item.bottomPairs, 0),
  filledBottles: items.reduce((sum, item) => sum + item.filled, 0),
  fourColorBottles: items.reduce((sum, item) => sum + item.fourColors, 0),
  adjacentPairs: items.reduce((sum, item) => sum + item.adjacentPairs, 0),
});
const report = {
  format: 'bottle-harmony-start-quality-audit', version: 1, catalogId: catalog.id,
  total: records.length, affected: rows.length,
  completedBottleLevels: rows.filter(row => row.issues.some(issue => issue.completed)).length,
  completedBottles: rows.reduce((sum, row) => sum + row.issues.filter(issue => issue.completed).length, 0),
  tripleBottles: rows.reduce((sum, row) => sum + row.issues.filter(issue => issue.copies === 3).length, 0),
  fourLayerBottles: rows.reduce((sum, row) => sum + row.issues.filter(issue => issue.copies === 4).length, 0),
  byRank: Array.from({ length: 8 }, (_, i) => ({ rank: i + 1,
    total: records.filter(record => record.rating.evidence.rank === i + 1).length,
    affected: rows.filter(row => row.rank === i + 1).length })),
  levels: rows,
  openingVariety: { whole: summarizeVariety(variety), first43: summarizeVariety(variety.slice(0, 43)),
    stages: Array.from({ length: 20 }, (_, index) => ({ stage: index + 1,
      ...summarizeVariety(variety.slice(index * 50, (index + 1) * 50)) })) },
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ input, output, total: report.total, affected: report.affected,
  completedBottleLevels: report.completedBottleLevels, tripleBottles: report.tripleBottles,
  fourLayerBottles: report.fourLayerBottles, byRank: report.byRank,
  openingVariety: report.openingVariety }, null, 2));
