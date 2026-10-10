import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { loadSortingSession, saveSortingSession } from '../src/storage/sortingStorage.ts';
import { TestDatabase } from '../tests/helpers/sqlite.ts';
import { createEngineSession, moveEngineSession, saveEngineSession } from '../src/game/engine.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { measurement } from '../src/game/engineBenchmark.ts';

const directory = resolve('builds/engine-upgrade/storage'); mkdirSync(directory, { recursive: true });
const library = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(library);
const open = (db: TestDatabase) => PlayerRepository.open(db, content.mainline, content.sides, 'engine-acceptance');
const oldPath = process.argv[2];
let upgrade: object = { status: 'not-run', reason: 'Pass a captured schema-one player database as the first argument.' };
if (oldPath) {
  assert.ok(existsSync(oldPath));
  // Compare normal startup of HEAD's schema-one repository with the upgrade, using identical copies and clock.
  for (const name of ['baseline', 'upgraded']) for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(oldPath + suffix)) cpSync(oldPath + suffix, resolve(directory, name + '.sqlite' + suffix));
  }
  const oldRepository = execFileSync('git', ['show', '2efbf9a:src/storage/playerRepository.ts'], { encoding: 'utf8' });
  const rewritten = oldRepository.replace(/from '([^']+)'/g, (_, path: string) => `from '${pathToFileURL(resolve('src/storage', path)).href}'`)
    .replace(pathToFileURL(resolve('src/storage/playerSchema.ts')).href, './schema.ts');
  writeFileSync(resolve(directory, 'repository.ts'), rewritten);
  writeFileSync(resolve(directory, 'schema.ts'), execFileSync('git', ['show', '2efbf9a:src/storage/playerSchema.ts']));
  const OldPlayer = (await import(pathToFileURL(resolve(directory, 'repository.ts')).href)).PlayerRepository as typeof PlayerRepository;
  const baseline = new TestDatabase(resolve(directory, 'baseline.sqlite')), upgraded = new TestDatabase(resolve(directory, 'upgraded.sqlite'));
  assert.equal(upgraded.getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version, 1);
  const tables = baseline.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(r => r.name);
  const originalNow = Date.now, fixedNow = originalNow(); Date.now = () => fixedNow;
  const started = performance.now();
  try { await OldPlayer.open(baseline, content.mainline, content.sides, 'engine-acceptance'); await open(upgraded); }
  finally { Date.now = originalNow; }
  const openMilliseconds = performance.now() - started;
  for (const table of tables) {
    const rows = (db: TestDatabase) => db.getAllSync(`SELECT * FROM "${table}"`).map(row => JSON.stringify(row)).sort();
    assert.deepEqual(rows(upgraded), rows(baseline), table);
  }
  assert.equal(upgraded.getFirstSync<{ quick_check: string }>('PRAGMA quick_check')!.quick_check, 'ok');
  assert.deepEqual(upgraded.getAllSync('PRAGMA foreign_key_check'), []);
  assert.equal(upgraded.getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version, 2);
  upgrade = { status: 'passed', source: resolve(oldPath), equalExistingTables: tables.length, schema: '1→2', combinedOpenMilliseconds: openMilliseconds, integrity: 'ok', foreignKeys: 'ok' };
  baseline.native.close(); upgraded.native.close();
}
const db = new TestDatabase(resolve(directory, 'benchmark.sqlite')), player = await open(db);
const puzzle = engineFixture('sqlite-benchmark', [['coral'], [], ['jade']], { goal: { type: 'collect', container: 'b1', color: 'jade', count: 1, exact: true, exclusive: true } });
let current = createEngineSession(puzzle, 'sqlite-benchmark');
await player.enqueueWrite(() => saveSortingSession(db, 'benchmark', current, null));
const writes: number[] = [], rows: number[] = [];
for (let i = 0; i < 256; i++) {
  const before = current; current = moveEngineSession(current, { type: 'transfer', source: `b${i % 2}`, target: `b${1 - i % 2}` })!.session;
  const priorStatements = db.statements.length, started = performance.now();
  assert.equal(await player.enqueueWrite(() => saveSortingSession(db, 'benchmark', current, before)), true);
  writes.push(performance.now() - started);
  rows.push(db.statements.slice(priorStatements).filter(sql => sql.startsWith('INSERT INTO sorting_checkpoints')).length);
}
assert.ok(rows.every(count => count === 2));
const started = performance.now(), loaded = await loadSortingSession(db, 'benchmark', puzzle);
assert.deepEqual(saveEngineSession(loaded!), saveEngineSession(current));
const report = { environment: { runtime: process.version, sqlite: db.getFirstSync('SELECT sqlite_version() AS version') }, note: 'Desktop Node SQLite, WAL; synchronous PRAGMA recorded below. Includes serial transaction; not Expo/mobile latency evidence.', upgrade,
  incrementalWriteMilliseconds: measurement(writes.slice(16)), checkpointWritesPerMove: [...new Set(rows)], restore256WallMilliseconds: performance.now() - started,
  contentSha256: createHash('sha256').update(readFileSync('assets/levels/content.sqlite')).digest('hex'), synchronous: db.getFirstSync('PRAGMA synchronous'), pageCount: db.getFirstSync('PRAGMA page_count'), pageSize: db.getFirstSync('PRAGMA page_size') };
writeFileSync(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
db.native.close(); library.native.close();
