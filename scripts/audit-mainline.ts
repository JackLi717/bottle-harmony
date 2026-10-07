import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseProductionRecords } from '../src/game/mainlineCatalog.ts';
import { recordObject } from '../src/game/generation.ts';
import { inspectStartQuality } from '../src/game/startQuality.ts';

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
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ input, output, total: report.total, affected: report.affected,
  completedBottleLevels: report.completedBottleLevels, tripleBottles: report.tripleBottles,
  fourLayerBottles: report.fourLayerBottles, byRank: report.byRank }, null, 2));
