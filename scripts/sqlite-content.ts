import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { CONTENT_SCHEMA } from '../src/storage/contentSchema.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import type { ReadDatabase } from '../src/storage/sql.ts';
import { decodeMainlineCatalog } from '../src/game/mainlineCatalog.ts';
import { decodePlayableMainline, encodePlayableMainline } from '../src/game/mainlinePlayable.ts';
import { decodeSolidSide } from '../src/game/solidSide.ts';
import { hasOptionalReserve } from '../src/game/optionalReserve.ts';
import type { LevelDefinition } from '../src/game/model.ts';
import type { Pour } from '../src/game/rules.ts';
import { decodeMemoryBank } from './memory-bank-lib.ts';
import { MEMORY_CATALOG, MEMORY_COUNT } from '../src/game/memoryCatalog.ts';
import { validateMemoryPuzzle, replayMemory } from '../src/game/memory.ts';

export function nodeReader(db: DatabaseSync): ReadDatabase {
  return { getAllSync: <T>(sql: string, ...params: any[]) => db.prepare(sql).all(...params) as T[],
    getFirstSync: <T>(sql: string, ...params: any[]) => (db.prepare(sql).get(...params) ?? null) as T | null };
}
export function buildContent(output = 'assets/levels/content.sqlite') {
  const fullText = readFileSync('assets/levels/mainline-catalog.json', 'utf8');
  const fullRaw = JSON.parse(fullText);
  const full = decodeMainlineCatalog(fullText);
  const compact = readFileSync('assets/levels/mainline-play.json', 'utf8');
  assert.deepEqual(JSON.parse(encodePlayableMainline(full)), JSON.parse(compact));
  const main = decodePlayableMainline(compact);
  const sideText = readFileSync('assets/levels/solid-side-50.json', 'utf8'), sideRaw = JSON.parse(sideText);
  const sides = decodeSolidSide(sideRaw);
  const memoryText = readFileSync('assets/levels/memory-100.json', 'utf8');
  const memory = decodeMemoryBank(JSON.parse(memoryText));
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  rmSync(temporary, { force: true });
  const db = new DatabaseSync(temporary);
  try {
    db.exec(CONTENT_SCHEMA);
    db.exec('BEGIN IMMEDIATE');
    const put = (sql: string, ...values: any[]) => db.prepare(sql).run(...values);
    for (const [key, value] of Object.entries({ catalog: main.id, sideCatalog: sides.id, mainlineCount: '1000', sideCount: '50', memoryCatalog: MEMORY_CATALOG, memoryCount: String(MEMORY_COUNT), memorySourceSha256: createHash('sha256').update(memoryText).digest('hex'),
      mainlineSourceSha256: createHash('sha256').update(fullText).digest('hex'), sideSourceSha256: createHash('sha256').update(sideText).digest('hex'),
      validation: 'source-reconstructed-routes-replayed-evidence-checked-v1' })) put('INSERT INTO metadata VALUES(?,?)', key, value);
    const layout = (level: LevelDefinition) => {
      level.colors.forEach((color, i) => put('INSERT INTO colors VALUES(?,?,?)', level.id, i, color));
      level.bottles.forEach((bottle, i) => {
        put('INSERT INTO bottles VALUES(?,?,?)', level.id, i, bottle.id);
        bottle.layers.forEach((color, depth) => put('INSERT INTO layers VALUES(?,?,?,?)', level.id, i, depth, color));
      });
    };
    const route = (id: string, variant: string, moves: readonly Pour[]) => moves.forEach((p, i) =>
      put('INSERT INTO solution_steps VALUES(?,?,?,?,?,?,?)', id, variant, i, p.source, p.target, p.color, p.amount));
    for (const entry of main.entries) {
      put('INSERT INTO levels VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', entry.level.id, 'mainline', entry.number, 4,
        entry.level.colors.length, entry.level.bottles.length, entry.rank, entry.tier, entry.score, null, null, hasOptionalReserve(entry) ? 1 : 0);
      layout(entry.level); route(entry.level.id, 'main', entry.solution);
      const evidence = fullRaw.records[entry.number - 1];
      put('INSERT INTO evidence VALUES(?,?)', entry.level.id, JSON.stringify(evidence));
      for (const tag of evidence.design.tags) put('INSERT INTO tags VALUES(?,?)', entry.level.id, tag);
    }
    for (const entry of sides.entries) {
      put('INSERT INTO levels VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', entry.level.id, 'side', entry.number, 4,
        entry.level.colors.length, entry.level.bottles.length, null, null, null, entry.frozenBottle, entry.afterMainline, 0);
      layout(entry.level); route(entry.level.id, 'frozen', entry.frozenRoute); route(entry.level.id, 'melted', entry.meltedRoute);
      put('INSERT INTO evidence VALUES(?,?)', entry.level.id, JSON.stringify(entry));
    }
    for (const key of ['calibration', 'calibration-difficulty']) put('INSERT INTO internal_assets VALUES(?,?)', key, readFileSync(`assets/levels/${key}.json`, 'utf8'));
    for (const puzzle of memory.records) {
      validateMemoryPuzzle(puzzle);
      put('INSERT INTO levels VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', puzzle.level.id, 'memory', puzzle.number, 4, puzzle.level.colors.length, puzzle.level.bottles.length, null, null, null, null, null, 0);
      layout(puzzle.level); route(puzzle.level.id, 'main', puzzle.solution); route(puzzle.level.id, 'alternative', puzzle.alternative);
      for (const id of puzzle.masks) put('INSERT INTO memory_masks VALUES(?,?)', puzzle.level.id, id);
      put('INSERT INTO evidence VALUES(?,?)', puzzle.level.id, JSON.stringify(puzzle));
    }
    db.exec('COMMIT');
    assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check), ['ok']);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    const repository = new ContentRepository(nodeReader(db));
    assert.equal(repository.memory.length, MEMORY_COUNT);
    for (const expected of memory.records) {
      const recovered = repository.memoryPuzzle(expected.number);
      assert.deepEqual(recovered.level, expected.level); assert.deepEqual(recovered.masks, expected.masks);
      assert.deepEqual(recovered.solution, expected.solution);
      assert.deepEqual(repository.route(recovered.level.id, 'alternative'), expected.alternative);
      assert.deepEqual(repository.evidence(recovered.level.id), expected);
      replayMemory(recovered, recovered.solution);
    }
    const recovered = repository.mainline.entries.map(entry => ({ number: entry.number, level: entry.level, solution: entry.solution, rank: entry.rank, tier: entry.tier, score: entry.score }));
    assert.deepEqual(recovered, main.entries);
    const records = recovered.map(entry => {
      const record = repository.evidence<any>(entry.level.id);
      assert.deepEqual(record.content.level, entry.level);
      assert.deepEqual(record.content.solution, entry.solution);
      assert.deepEqual(db.prepare('SELECT tag FROM tags WHERE level_id=? ORDER BY tag').all(entry.level.id).map(row => row.tag), [...record.design.tags].sort());
      return record;
    });
    // Read-back performs source reconstruction, every witness replay and all wave/score checks again.
    decodeMainlineCatalog(JSON.stringify({ ...JSON.parse(fullText), records }));
    for (const entry of repository.sides.entries) {
      const expected = sides.entries[entry.number - 1];
      assert.deepEqual(entry.level, expected.level);
      assert.deepEqual(entry.frozenRoute, expected.frozenRoute);
      assert.deepEqual(entry.meltedRoute, expected.meltedRoute);
      assert.deepEqual(repository.evidence(entry.level.id), expected);
    }
    assert.deepEqual(repository.internal('calibration'), JSON.parse(readFileSync('assets/levels/calibration.json', 'utf8')));
    assert.deepEqual(repository.internal('calibration-difficulty'), JSON.parse(readFileSync('assets/levels/calibration-difficulty.json', 'utf8')));
    // The side decoder independently replays both normalized route variants read back from SQLite.
    decodeSolidSide({ ...sideRaw, levels: sideRaw.levels.map((row: any, i: number) => ({ ...row,
      frozenRoute: repository.sides.entries[i].frozenRoute.map(p => ({ ...p, color: row.colors[sides.entries[i].level.colors.indexOf(p.color)] })),
      meltedRoute: repository.sides.entries[i].meltedRoute.map(p => ({ ...p, color: row.colors[sides.entries[i].level.colors.indexOf(p.color)] })) })) });
    db.exec('VACUUM');
  } finally { db.close(); }
  renameSync(temporary, output);
  const bytes = readFileSync(output), sha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync('src/storage/contentManifest.ts', `// Generated by npm run content:build; verified SQLite artifact.\nexport const CONTENT_SHA256 = '${sha256}';\nexport const CONTENT_DATABASE_NAME = 'content-${sha256.slice(0, 16)}.sqlite';\n`);
  console.log(JSON.stringify({ output, bytes: bytes.length, sha256, mainline: main.entries.length, sides: sides.entries.length, memory: memory.records.length, verified: true }));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/sqlite-content.ts')) buildContent(process.argv[2]);
