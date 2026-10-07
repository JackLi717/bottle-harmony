import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { decodeMainlineCatalog } from '../src/game/mainlineCatalog.ts';
import { evaluateHumanDifficulty, HUMAN_MODEL } from '../src/game/humanDifficulty.ts';

const [command, source = 'assets/levels/mainline-catalog.json', destination = 'builds/human-difficulty.json'] = process.argv.slice(2);
if (command !== 'rate' && command !== 'verify') throw new Error('Use rate [catalog] [report] or verify [catalog] [report]');
const catalog = decodeMainlineCatalog(await readFile(resolve(source), 'utf8'));
const reports = [];
for (const entry of catalog.entries) {
  const report = evaluateHumanDifficulty(entry.content.level, entry.rating.evidence.referenceSolution, entry.rating.evidence.rank!,
    { maxSolveStates: 100000, maxMilliseconds: 60000 });
  if (report.status !== 'rated') throw new Error(`Human proxy unknown at ${entry.number}: ${report.reason}`);
  reports.push({ number: entry.number, structureKey: entry.content.structureKey, report });
  if (entry.number % 50 === 0) console.log(`human difficulty ${entry.number}/1000`);
}
const value = { format: 'bottle-harmony-human-difficulty', version: 1, model: HUMAN_MODEL, catalogId: catalog.id, records: reports };
if (command === 'verify') {
  const expected = JSON.parse(await readFile(resolve(destination), 'utf8'));
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error('Human difficulty report mismatch');
  console.log('Verified 1000 human difficulty proxy reports');
} else {
  const output = resolve(destination), temporary = `${output}.${process.pid}.tmp`;
  await mkdir(dirname(output), { recursive: true });
  try { await writeFile(temporary, JSON.stringify(value), { flag: 'wx' }); await rename(temporary, output); }
  finally { await unlink(temporary).catch(() => {}); }
  console.log(`Rated 1000 boards: ${output}`);
}
