import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodeMainlineCatalog } from '../src/game/mainlineCatalog.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { solveBoard, replaySolution } from '../src/game/solver.ts';
import { createProductionPlan } from '../src/game/productionPlan.ts';

const [input = 'assets/levels/mainline-catalog.json', output = 'builds/optional-reserve-rebuild.json'] = process.argv.slice(2);
const catalog = decodeMainlineCatalog(await readFile(resolve(input), 'utf8'));
const rows: { number: number; id: string; status: 'solved' | 'unsolvable' | 'unknown'; moves?: number }[] = [];
for (const entry of catalog.entries) {
  const bottles = entry.content.level.bottles;
  if (bottles.at(-1)?.layers.length !== 0 || bottles.at(-2)?.layers.length !== 0) continue;
  const smaller = parseLevel({ ...entry.content.level, bottles: bottles.slice(0, -1) });
  const result = solveBoard(initialBoard(smaller), { capacity: 4, maxStates: 1000000, maxMilliseconds: 60000 });
  if (result.status === 'solved') replaySolution(initialBoard(smaller), result.route, 4);
  rows.push({ number: entry.number, id: entry.content.level.id,
    status: result.status === 'solved' ? 'solved' : result.status === 'unsolvable' ? 'unsolvable' : 'unknown',
    ...(result.status === 'solved' ? { moves: result.route.length } : {}) });
  if (rows.length % 25 === 0) console.log(`one-spare check ${rows.length} boards`);
}
const report = { format: 'bottle-harmony-optional-reserve-audit', version: 1, catalogId: catalog.id,
  total: rows.length, solved: rows.filter(row => row.status === 'solved').length,
  unsolvable: rows.filter(row => row.status === 'unsolvable').length,
  unknown: rows.filter(row => row.status === 'unknown').length, rows };
const destination = resolve(output);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: destination, total: report.total, solved: report.solved,
  unsolvable: report.unsolvable, unknown: report.unknown }));
if (report.unknown) throw new Error('Some one-spare boards remain unknown; no eligibility map generated');
if (rows.some(row => row.status === 'solved' && createProductionPlan()[row.number - 1].waveRole === 'recovery'))
  throw new Error('A recovery board would start with a locked spare; select a different recovery board');
const eligible = rows.filter(row => row.number > 3 && row.status === 'solved');
const source = `import { parseLevel, type LevelDefinition } from './model.ts';\nimport type { PlayableEntry } from './mainlinePlayable.ts';\n\n/** Independently solved against ${catalog.id}; the level ID binds each offer to its board. */\nexport const OPTIONAL_RESERVE_LEVELS: ReadonlyMap<number, string> = new Map([\n${eligible.map(row => `  [${row.number}, '${row.id}'],`).join('\n')}\n]);\n\nexport function hasOptionalReserve(entry: PlayableEntry): boolean {\n  const bottles = entry.level.bottles;\n  return OPTIONAL_RESERVE_LEVELS.get(entry.number) === entry.level.id && bottles.length >= 5\n    && bottles.at(-1)!.layers.length === 0 && bottles.at(-2)!.layers.length === 0;\n}\n\nexport function oneSpareLevel(entry: PlayableEntry): LevelDefinition {\n  if (!hasOptionalReserve(entry)) return entry.level;\n  return parseLevel({ ...entry.level, bottles: entry.level.bottles.slice(0, -1) });\n}\n`;
await writeFile(destination.replace(/\.json$/, '.ts.txt'), source);
