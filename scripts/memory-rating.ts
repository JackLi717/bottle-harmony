import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { evaluateMemoryDifficulty, hiddenAssignments, MEMORY_DIFFICULTY_MODEL, ratingBoard, type MemoryRating } from '../src/game/memoryDifficulty.ts';
import { memoryPour, transferUnits } from '../src/game/memory.ts';
import { isSolved } from '../src/game/rules.ts';
import { ratingApply, ratingSolved } from '../src/game/memoryRatingSearch.ts';
import { decodeMemoryBank } from './memory-bank-lib.ts';
import { MEMORY_CALIBRATION_RECIPE, selectMemoryCalibration } from './memory-calibration-lib.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const index = args.indexOf(name), value = index < 0 ? fallback : Number(args[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
  return value;
};
if (args.some((a, i) => i % 2 === 0 && !['--states', '--milliseconds'].includes(a)) || args.length % 2) throw new Error('Use memory:rate [--states N] [--milliseconds N]');
const budget = { maxStates: option('--states', 300000), maxMilliseconds: option('--milliseconds', 2000) };
const source = readFileSync('assets/levels/memory-100.json'), bank = decodeMemoryBank(JSON.parse(source.toString()));
const binding = { bank: bank.id, rules: bank.rules, sha256: createHash('sha256').update(source).digest('hex'), model: MEMORY_DIFFICULTY_MODEL };
const folder = 'builds/memory-rating'; mkdirSync(folder, { recursive: true });
const records: MemoryRating[] = [];
function save(name: string, data: unknown) {
  writeFileSync(`${folder}/${name}.tmp`, JSON.stringify(data, null, 2)); renameSync(`${folder}/${name}.tmp`, `${folder}/${name}`);
}
for (const puzzle of bank.records) {
  const report = evaluateMemoryDifficulty(puzzle, budget);
  // Independent shared-core replay of the canonical shortest route, including
  // single black portions and visible-to-black cross-color reception.
  if (report.shortestMoves !== null) {
    const codes = report.canonicalBoard.flat(), colors = codes.map(c => `c${Math.floor(c / 2)}`), knowledge = codes.map(c => c % 2 ? -1 : 0);
    let id = 0, units = report.canonicalBoard.map(b => b.map(() => id++)), board = report.canonicalBoard;
    for (const move of report.route) {
      const p = memoryPour(units, colors, knowledge, move.source, move.target);
      assert.ok(p); assert.equal(p.amount, move.amount); assert.equal(p.color, `c${Math.floor(move.code / 2)}`);
      units = transferUnits(units, p).map(b => [...b]); board = ratingApply(board, move);
    }
    assert.ok(ratingSolved(board));
    assert.ok(isSolved(units.map(b => b.map(id => colors[id])), 4));
    assert.deepEqual(units.map(b => b.map(id => colors[id])), board.map(b => b.map(c => `c${Math.floor(c / 2)}`)));
  }
  // Every source retains an uncertainty audit even when search is unknown.
  records.push(report);
  save('report.json', { ...binding, budget, complete: false, records });
  console.log(`${puzzle.number}: ${report.status} M=${report.memory?.total ?? '?'} S=${report.sorting?.total ?? '?'} D=${report.combined ?? '?'} bridge=${report.memory?.bridgeTransfers ?? '?'} saved=${report.bridgeComparison?.savedMoves ?? '?'}`);
}
const calibration = selectMemoryCalibration(records);
const sourceIds = new Set<string>(), physical = new Set<string>();
for (const entry of calibration) {
  const puzzle = bank.records.find(p => p.level.id === entry.id)!;
  assert.ok(!sourceIds.has(entry.id)); sourceIds.add(entry.id);
  assert.ok(!physical.has(puzzle.evidence.structureKey)); physical.add(puzzle.evidence.structureKey);
}
const summary = { rated: records.filter(r => r.status === 'rated').length, unknown: records.filter(r => r.status === 'unknown').map(r => r.number),
  calibrationIds: calibration.map(entry => entry.id),
  shortestRoutes: records.filter(r => r.shortestMoves !== null).length,
  routesUsingBridges: records.filter(r => r.memory && r.memory.bridgeTransfers > 0).map(r => r.number),
  shorterWithBridges: records.filter(r => (r.bridgeComparison?.savedMoves ?? 0) > 0).map(r => ({ number: r.number, saved: r.bridgeComparison!.savedMoves })),
  sourceUncertainty: bank.records.map(p => ({ number: p.number, assignments: hiddenAssignments(ratingBoard(p)) })),
};
save('report.json', { ...binding, budget, complete: true, summary, records });
// Reference existing stable IDs; no runtime library, numbering or player save is overwritten.
save('calibration-20.json', { ...binding, budget, complete: true, recipe: MEMORY_CALIBRATION_RECIPE, entries: calibration,
  puzzles: calibration.map(e => bank.records.find(p => p.level.id === e.id)) });
const columns = ['position', 'sourceNumber', 'role', 'bridgeFocus', 'memory', 'sorting', 'combined', 'id'] as const;
writeFileSync(`${folder}/calibration-20.csv`, [columns.join(','), ...calibration.map(e => columns.map(c => e[c]).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ ...binding, rated: summary.rated, unknown: summary.unknown, calibration: calibration.map(e => e.sourceNumber) }));
