import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { PLAYER_SCHEMA } from '../src/storage/playerSchema.ts';
import { SORTING_SCHEMA } from '../src/storage/sortingSchema.ts';
import { loadSortingSession, saveSortingSession } from '../src/storage/sortingStorage.ts';
import { createEngineSession, moveEngineSession, saveEngineSession, undoEngineSession } from '../src/game/engine.ts';
import { ENGINE_EXAMPLES } from '../src/game/engineExamples.ts';
import { moveMainline } from '../src/game/mainline.ts';
import { TestDatabase } from './helpers/sqlite.ts';

const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
const open = (db: TestDatabase) => PlayerRepository.open(db, content.mainline, content.sides, 'engine-acceptance');

test('atomic schema-one upgrade preserves shipped progress, installation, wallet, preferences and gameplay facts', async () => {
  const db = new TestDatabase();
  const player = await open(db);
  await player.setPreference('vessel', 'champagne'); await player.setPreference('language', 'zh-Hans');
  const next = moveMainline(player.state, content.mainline.entries[0].solution[0].source, content.mainline.entries[0].solution[0].target)!;
  await player.commit(next.state, { type: 'pour' });
  // Remove only the newly added empty tables to model the released schema-one database.
  db.native.exec('DROP TABLE sorting_checkpoints; DROP TABLE sorting_sessions; PRAGMA user_version=1;');
  const progress = player.state, installation = player.installation;
  const counts = db.getAllSync('SELECT * FROM level_stats ORDER BY mode,level_id,metric');
  const reopened = await open(db);
  assert.equal(db.getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version, 2);
  assert.equal(reopened.installation, installation); assert.deepEqual(reopened.state, progress);
  assert.equal(reopened.preference('vessel'), 'champagne'); assert.equal(reopened.preference('language'), 'zh-Hans');
  assert.deepEqual(db.getAllSync("SELECT * FROM level_stats WHERE metric<>'interrupted_attempts' ORDER BY mode,level_id,metric"), counts);
  assert.equal(db.getFirstSync<{ value: number }>("SELECT value FROM level_stats WHERE metric='interrupted_attempts'")!.value, 1);
  assert.equal(db.getFirstSync<{ count: number }>('SELECT count(*) AS count FROM sorting_sessions')!.count, 0);
  db.native.close();
});

test('interrupted schema upgrade rolls back DDL and version, keeps old data, and retries cleanly', async () => {
  const db = new TestDatabase(), player = await open(db), installation = player.installation;
  db.native.exec('DROP TABLE sorting_checkpoints; DROP TABLE sorting_sessions; PRAGMA user_version=1;');
  db.fail = sql => sql.includes('CREATE TABLE sorting_sessions');
  await assert.rejects(open(db), /Injected/);
  assert.equal(db.getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version, 1);
  assert.equal(db.getFirstSync<{ value: string }>("SELECT value FROM metadata WHERE key='installation'")!.value, installation);
  db.fail = null; assert.equal((await open(db)).installation, installation);
  // The schema source itself remains a complete fresh baseline, not a migration-only fragment.
  const fresh = new TestDatabase(); fresh.native.exec(PLAYER_SCHEMA.replace(SORTING_SCHEMA, '').replace('user_version=2', 'user_version=1'));
  assert.equal(fresh.getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version, 1);
  fresh.native.close(); db.native.close();
});

test('sorting checkpoints append incrementally, undo knowledge survives restart and failed writes retry atomically', async () => {
  const db = new TestDatabase(), player = await open(db), puzzle = ENGINE_EXAMPLES[0];
  const start = createEngineSession(puzzle, 'storage'), moved = moveEngineSession(start, { type: 'transfer', source: 'b0', target: 'b1' })!.session;
  await player.enqueueWrite(() => saveSortingSession(db, 'acceptance', start, null));
  const original = saveEngineSession((await loadSortingSession(db, 'acceptance', puzzle))!);
  db.fail = sql => sql.startsWith('INSERT INTO sorting_checkpoints');
  assert.equal(await player.enqueueWrite(() => saveSortingSession(db, 'acceptance', moved, start)), false);
  assert.deepEqual(saveEngineSession((await loadSortingSession(db, 'acceptance', puzzle))!), original);
  db.fail = null; assert.equal(await player.flush(), true);
  assert.deepEqual(saveEngineSession((await loadSortingSession(db, 'acceptance', puzzle))!), saveEngineSession(moved));
  const undone = undoEngineSession(moved);
  await player.enqueueWrite(() => saveSortingSession(db, 'acceptance', undone, moved));
  const restored = (await loadSortingSession(db, 'acceptance', puzzle))!;
  assert.deepEqual(saveEngineSession(restored), saveEngineSession(undone));
  assert.equal(restored.state.open[2], false); assert.ok(restored.known.includes('u2_0'));
  assert.equal(db.getFirstSync<{ count: number }>('SELECT count(*) AS count FROM sorting_checkpoints')!.count, 1);
  await assert.rejects(loadSortingSession(db, 'acceptance', ENGINE_EXAMPLES[1]), /binding/);
  assert.equal(player.state.current, 1); assert.equal(player.state.hintCredits, 0);
  db.native.close();
});

test('missing or tampered frames fail without resetting or replacing the saved session', async () => {
  const db = new TestDatabase(), player = await open(db), puzzle = ENGINE_EXAMPLES[3];
  const start = createEngineSession(puzzle, 'corrupt'), next = moveEngineSession(start, { type: 'transfer', source: 'b0', target: 'b3' })!.session;
  await player.enqueueWrite(() => saveSortingSession(db, 'acceptance', next, null));
  db.native.exec("DELETE FROM sorting_checkpoints WHERE step=0");
  await assert.rejects(loadSortingSession(db, 'acceptance', puzzle), /Missing/);
  assert.equal(db.getFirstSync<{ count: number }>('SELECT count(*) AS count FROM sorting_sessions')!.count, 1);
  await player.enqueueWrite(() => saveSortingSession(db, 'acceptance', next, null));
  const frame = JSON.stringify({ state: next.state, known: next.known, seen: next.seen, binding: next.runtime.binding });
  await db.runAsync('UPDATE sorting_checkpoints SET frame=? WHERE step=-1', frame);
  await assert.rejects(loadSortingSession(db, 'acceptance', puzzle), /fields/);
  db.native.close();
});
