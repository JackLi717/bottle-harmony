import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { GameplayClock } from '../src/storage/gameplayClock.ts';
import { editMainline, hintMainline, moveMainline, nextMainline, selectMainline, selectSideMainline, visibleSession, meltSideMainline, unlockReserveMainline, reserveIsLocked } from '../src/game/mainline.ts';
import { TestDatabase } from './helpers/sqlite.ts';

const source = new TestDatabase('assets/levels/content.sqlite');
source.native.exec('PRAGMA query_only=ON');
const content = new ContentRepository(source);
const main = content.mainline, sides = content.sides;
async function setup(db = new TestDatabase()) { return { db, repo: await PlayerRepository.open(db, main, sides, 'acceptance') }; }
const metric = (db: TestDatabase, name: string, mode = 'mainline', level = main.entries[0].level.id) => db.getFirstSync<{ value: number }>('SELECT value FROM level_stats WHERE metric=? AND mode=? AND level_id=?', name, mode, level)?.value ?? 0;
async function pour(repo: PlayerRepository, step: { source: number; target: number }, hinted = false, requestId?: string) {
  const accepted = (hinted ? hintMainline : moveMainline)(repo.state, step.source, step.target);
  assert.ok(accepted, `Legal move in ${visibleSession(repo.state).level.id}`);
  assert.equal(await repo.commit(accepted.state, { type: 'pour', hinted, requestId, source: accepted.event.sourceId, target: accepted.event.targetId, amount: accepted.event.pour.amount }), true);
}
async function complete(repo: PlayerRepository) {
  const scope = visibleSession(repo.state);
  const entry = main.entries.find(e => e.levelId === scope.level.id);
  if (reserveIsLocked(repo.state, main)) assert.equal(await repo.commit(unlockReserveMainline(repo.state, main), { type: 'reserve' }), true);
  const route = entry?.solution ?? sides.entries.find(e => e.levelId === scope.level.id)!.frozenRoute;
  for (const step of route) await pour(repo, step);
}

test('content startup reads metadata only; layouts/routes/evidence are lazy and source is read-only', () => {
  const db = new TestDatabase('assets/levels/content.sqlite');
  db.native.exec('PRAGMA query_only=ON');
  const reads: string[] = [];
  const reader = { getAllSync<T>(sql: string, ...args: (string | number | null | Uint8Array)[]) { reads.push(sql); return db.getAllSync<T>(sql, ...args); }, getFirstSync<T>(sql: string, ...args: (string | number | null | Uint8Array)[]) { reads.push(sql); return db.getFirstSync<T>(sql, ...args); } };
  const catalog = new ContentRepository(reader);
  assert.equal(catalog.mainline.entries.length, 1000); assert.equal(catalog.sides.entries.length, 50);
  assert.ok(!reads.some(sql => /FROM (layers|bottles|solution_steps|evidence)/.test(sql)));
  assert.equal(catalog.mainline.entries[999].level.capacity, 4);
  assert.ok(catalog.mainline.entries[999].solution.length > 0);
  assert.throws(() => db.native.exec('DELETE FROM levels'), /readonly/);
  db.native.close();
});

test('fresh initialization is atomic, restart preserves SQLite state and all preferences', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bottle-sqlite-'));
  try {
    const path = join(dir, 'player.sqlite'), db = new TestDatabase(path);
    const { repo } = await setup(db), installation = repo.installation;
    await repo.setPreference('sound', 'false'); await repo.setPreference('vessel', 'champagne');
    await repo.commit({ ...repo.state, tutorialDone: true, symbols: true }, { type: 'preference', preference: 'symbols', value: 'true' });
    await repo.record({ type: 'show' });
    await pour(repo, main.entries[0].solution[0]);
    await repo.record({ type: 'hint-request', requestId: 'pending-hint' });
    const state = repo.state; db.native.close();
    const reopened = new TestDatabase(path), restored = (await setup(reopened)).repo;
    assert.deepEqual(restored.state, state); assert.equal(restored.installation, installation);
    assert.equal(restored.preference('sound'), 'false'); assert.equal(restored.preference('vessel'), 'champagne'); assert.equal(restored.preference('symbols'), 'true');
    assert.equal(reopened.getFirstSync<{ partial: number }>('SELECT partial FROM attempts')!.partial, 1);
    assert.equal(reopened.getFirstSync<{ result: string }>('SELECT result FROM hint_requests')!.result, 'interrupted');
    await restored.record({ type: 'show' });
    assert.equal(metric(reopened, 'challenges'), 1); assert.equal(metric(reopened, 'attempts'), 1); assert.equal(metric(reopened, 'visits'), 2);
    reopened.native.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('failed initialization rolls back; corrupt/unsupported/content-mismatched saves never reset', async () => {
  const db = new TestDatabase(); db.fail = sql => sql.includes('INSERT INTO preferences');
  await assert.rejects(setup(db), /Injected/);
  assert.equal(db.getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version, 0);
  assert.equal(db.getAllSync('SELECT name FROM sqlite_master WHERE type=\'table\'').length, 0);
  db.fail = null; const { repo } = await setup(db); const installation = repo.installation;
  db.native.exec("UPDATE progress SET catalog='other'"); await assert.rejects(setup(db), /mismatch/);
  assert.equal(db.getFirstSync<{ value: string }>("SELECT value FROM metadata WHERE key='installation'")!.value, installation);
  db.native.exec('PRAGMA user_version=99'); await assert.rejects(setup(db), /Unsupported/);
  db.native.close();
});

test('transaction failure retains ordered moves, retry is idempotent and stats/progress commit together', async () => {
  const { db, repo } = await setup(); await repo.record({ type: 'show' });
  db.fail = sql => sql.startsWith('INSERT INTO events');
  const first = moveMainline(repo.state, main.entries[0].solution[0].source, main.entries[0].solution[0].target)!;
  assert.equal(await repo.commit(first.state, { type: 'pour' }), false);
  assert.equal(repo.state.main.history.length, 1); assert.equal(db.getFirstSync<{ history_depth: number }>('SELECT history_depth FROM sessions')!.history_depth, 0);
  assert.equal(metric(db, 'pours'), 0);
  const second = main.entries[0].solution[1];
  const next = moveMainline(repo.state, second.source, second.target)!;
  const pending = repo.commit(next.state, { type: 'pour' });
  db.fail = null; assert.equal(await repo.flush(), true); assert.equal(await pending, true);
  assert.equal(metric(db, 'pours'), 2); assert.equal(db.getFirstSync<{ history_depth: number }>('SELECT history_depth FROM sessions')!.history_depth, 2);
  assert.equal(await repo.flush(), true); assert.equal(metric(db, 'pours'), 2);
  const restored = (await setup(db)).repo; assert.deepEqual(restored.state, repo.state);
  db.native.close();
});

test('hints link request, result, execution and spending; reset/undo do not erase pre-clear assistance', async () => {
  const { db, repo } = await setup(); await repo.record({ type: 'show' });
  const requestId = repo.hintRequestId(); await repo.record({ type: 'hint-request', requestId });
  await repo.record({ type: 'hint-result', requestId, result: 'reference', durationMs: 12 });
  await pour(repo, main.entries[0].solution[0], true, requestId);
  await repo.commit(editMainline(repo.state, 'undo'), { type: 'undo' });
  await pour(repo, main.entries[0].solution[0]);
  await repo.commit(editMainline(repo.state, 'reset'), { type: 'reset' });
  await complete(repo);
  assert.equal(metric(db, 'hint_pours'), 1); assert.equal(metric(db, 'hint_free'), 1);
  assert.equal(metric(db, 'undos'), 1); assert.equal(metric(db, 'resets'), 1); assert.equal(metric(db, 'attempts'), 2);
  assert.equal(metric(db, 'completed_without_hints'), 0); assert.equal(metric(db, 'first_clears'), 1);
  assert.equal(db.getFirstSync<{ executed: number }>('SELECT executed FROM hint_requests WHERE id=?', requestId)!.executed, 1);
  const credits = repo.state.hintCredits;
  await repo.commit(editMainline(repo.state, 'undo'), { type: 'undo' }); await pour(repo, main.entries[0].solution.at(-1)!);
  assert.equal(repo.state.hintCredits, credits); assert.equal(metric(db, 'first_clears'), 1);
  assert.equal(metric(db, 'pours', 'post-mainline'), 1);
  db.native.close();
});

test('foreground time excludes background gaps, unions blocked intervals and stops after solve', () => {
  const clock = new GameplayClock(0);
  clock.update(100, true, false); clock.update(1100, true, true); clock.update(1600, true, true); clock.update(2100, true, false);
  clock.update(3100, false, false); clock.update(100000, true, false);
  assert.deepEqual(clock.take(101000, true), { foregroundMs: 4000, blockedMs: 1000, sinceInputMs: 4000 });
  clock.update(101100, false, false); assert.deepEqual(clock.take(200000), { foregroundMs: 100, blockedMs: 0 });
});

test('more than 4096 moves retain a bounded undo checkpoint and keep saving after the boundary', { timeout: 60000 }, async () => {
  const { db, repo } = await setup();
  for (let i = 0; i < 4100; i++) await pour(repo, i === 0 ? { source: 0, target: 2 } : i % 2 === 1 ? { source: 2, target: 3 } : { source: 3, target: 2 });
  assert.equal(repo.state.main.history.length, 4096); assert.equal(repo.state.main.historyOffset, 4);
  assert.deepEqual((await setup(db)).repo.state, repo.state);
  await repo.commit(editMainline(repo.state, 'undo'), { type: 'undo' });
  assert.deepEqual((await setup(db)).repo.state, repo.state);
  while (repo.state.main.history.length) await repo.commit(editMainline(repo.state, 'undo'), { type: 'undo' });
  assert.equal(repo.state.main.historyOffset, 4);
  assert.deepEqual((await setup(db)).repo.state, repo.state);
  await repo.commit(editMainline(repo.state, 'reset'), { type: 'reset' });
  assert.equal(repo.state.main.historyOffset, 0); assert.deepEqual((await setup(db)).repo.state, repo.state);
  assert.equal(metric(db, 'resets'), 1); assert.equal(metric(db, 'attempts'), 2);
  db.native.close();
});

test('no-effect reset, undo and melt requests do not create attempts or successful actions', async () => {
  const { db, repo } = await setup(); await repo.record({ type: 'show' });
  await repo.commit(editMainline(repo.state, 'reset'), { type: 'reset' });
  await repo.commit(editMainline(repo.state, 'undo'), { type: 'undo' });
  await repo.commit(meltSideMainline(repo.state), { type: 'melt' });
  assert.equal(metric(db, 'attempts'), 1); assert.equal(metric(db, 'resets'), 0); assert.equal(metric(db, 'undos'), 0); assert.equal(metric(db, 'melts'), 0);
  db.native.close();
});

test('bounded raw events prune without reducing summaries, open attempts, undo state or revision deduplication', async () => {
  const { db, repo } = await setup(); await repo.record({ type: 'show' }); await pour(repo, main.entries[0].solution[0]);
  for (let i = 0; i < 120; i++) await repo.record({ type: 'clock', foregroundMs: 100 });
  const state = repo.state, count = metric(db, 'foreground_ms');
  await repo.statistics.prune(Date.now(), 10, 30);
  assert.equal(db.getAllSync('SELECT * FROM events').length, 10); assert.equal(metric(db, 'foreground_ms'), count);
  await repo.statistics.prune(Date.now() + 31 * 86400000, 10, 30);
  assert.equal(db.getAllSync('SELECT * FROM events').length, 0); assert.equal(db.getAllSync('SELECT * FROM attempts').length, 1);
  const restored = (await setup(db)).repo; assert.deepEqual(restored.state, state);
  await restored.record({ type: 'show' }); assert.equal(metric(db, 'challenges'), 1);
  db.native.close();
});

test('all 1050 production puzzles advance, reopen, replay, melt, undo, refreeze and stop at final boundary', { timeout: 240000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bottle-campaign-'));
  const path = join(dir, 'player.sqlite'); let db = new TestDatabase(path), repo = (await setup(db)).repo;
  const start = performance.now();
  try {
    for (let number = 1; number <= 1000; number++) {
      await repo.record({ type: 'show' }); await complete(repo);
      assert.equal(repo.state.completedThrough, number);
      await repo.commit(nextMainline(repo.state, main, sides), { type: 'navigate' });
      if (number % 20 === 0) {
        const side = sides.entries[number / 20 - 1];
        assert.equal(repo.state.side!.level.id, side.level.id); await repo.record({ type: 'show' });
        if (number === 20) {
          await repo.commit(meltSideMainline(repo.state), { type: 'melt' }); await pour(repo, side.meltedRoute[0]);
          await repo.commit(editMainline(repo.state, 'undo'), { type: 'undo' });
          assert.equal(repo.state.side!.solid!.melted, true);
          assert.deepEqual((await setup(db)).repo.state, repo.state);
          await repo.commit(editMainline(repo.state, 'reset'), { type: 'reset' }); assert.equal(repo.state.side!.solid!.melted, false);
        }
        await complete(repo); assert.equal(repo.state.sideCompletedThrough, number / 20);
        await repo.commit(nextMainline(repo.state, main, sides), { type: 'navigate' });
      }
      if (number === 21) {
        const mainSession = repo.state.main, credits = repo.state.hintCredits;
        await repo.commit(selectMainline(repo.state, main, 1), { type: 'select' }); await repo.record({ type: 'show' }); await complete(repo);
        assert.equal(repo.state.main, mainSession); assert.equal(repo.state.hintCredits, credits);
        await repo.commit(selectSideMainline(repo.state, sides, 1), { type: 'select' }); await repo.record({ type: 'show' }); await complete(repo);
        assert.equal(repo.state.hintCredits, credits);
        await repo.commit(nextMainline(repo.state, main, sides), { type: 'navigate' });
      }
      if (number % 100 === 0) {
        const state = repo.state; db.native.close(); db = new TestDatabase(path); repo = (await setup(db)).repo;
        assert.deepEqual(repo.state, state);
      }
    }
    assert.equal(repo.state.current, 1000); assert.equal(repo.state.sideCompletedThrough, 50); assert.equal(repo.state.side, null);
    assert.equal(nextMainline(repo.state, main, sides), repo.state);
    assert.equal(db.getAllSync('SELECT * FROM completions').length, 1050);
    assert.equal(db.getFirstSync<{ count: number }>("SELECT COUNT(*) AS count FROM level_stats WHERE metric='first_clears'")!.count, 1050);
    assert.equal(db.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check')!.integrity_check, 'ok');
    assert.deepEqual(db.getAllSync('PRAGMA foreign_key_check'), []);
    db.native.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log(JSON.stringify({ acceptance: '1050-campaign', milliseconds: Math.round(performance.now() - start), playerBytes: statSync(path).size, events: db.getFirstSync('SELECT COUNT(*) AS count FROM events') }));
  } finally { db.native.close(); rmSync(dir, { recursive: true, force: true }); }
});
