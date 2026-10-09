import test from 'node:test';
import assert from 'node:assert/strict';
import { MIXING_PUZZLES } from '../src/game/mixingCatalog.ts';
import { createMixing, MIXING_HISTORY, mixingComplete, moveMixing, RECIPES, restoreMixing, selectMixingGoal, solveMixing, undoMixing, validateMixingFrame, type MixingAction } from '../src/game/mixing.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { MixingRepository } from '../src/storage/mixingRepository.ts';
import { TestDatabase } from './helpers/sqlite.ts';

const routes = MIXING_PUZZLES.map(p => solveMixing(p));
test('all six trials have completely replayed shortest routes with exact pigment and volume conservation', () => {
  for (const [i, puzzle] of MIXING_PUZZLES.entries()) {
    const solved = routes[i]; assert.equal(solved.status, 'solved');
    let session = createMixing(puzzle);
    for (const action of solved.route) {
      session = selectMixingGoal(session, action.goal);
      const next = moveMixing(session, action.source, action.target); assert.notEqual(next, session);
      validateMixingFrame(puzzle, next.frame); session = next;
    }
    assert.ok(mixingComplete(session.frame, puzzle));
    assert.equal(session.frame.deliveries.reduce((total, d) => total + d.units.length, 0), puzzle.goals.length * 2);
    assert.deepEqual(restoreMixing(puzzle, session.frame, session.history), session);
    if ([1, 4, 5].includes(i)) assert.ok(solved.route.some(a => a.target !== puzzle.bottles.length), 'Buried trial must actually require source rearrangement');
    else assert.ok(solved.route.every(a => a.target === puzzle.bottles.length), 'Direct trial has no forced sorting gate');
  }
  assert.deepEqual(MIXING_PUZZLES[0].bottles, MIXING_PUZZLES[3].bottles);
  assert.deepEqual(MIXING_PUZZLES[0].goals, MIXING_PUZZLES[3].goals);
});
test('automatic collection and final completion are atomic with the pour and fully undoable', () => {
  let session = createMixing(MIXING_PUZZLES[0]);
  session = moveMixing(session, 0, 5); const before = session;
  session = moveMixing(session, 1, 5);
  assert.equal(session.frame.mixer.length, 0); assert.equal(session.frame.deliveries[0].units.length, 2);
  assert.equal(session.frame.deliveries[0].units[0].color, 'labOrange');
  assert.deepEqual(undoMixing(session).frame, before.frame);
  session = moveMixing(session, 1, 5); const beforeLast = session;
  session = moveMixing(session, 2, 5); assert.ok(mixingComplete(session.frame, session.puzzle));
  assert.deepEqual(undoMixing(session).frame, beforeLast.frame);
  assert.deepEqual(createMixing(session.puzzle), createMixing(MIXING_PUZZLES[0]));
});
test('wrong results stay in the mixer; free undo and return retain original atoms, generated colors cannot remix', () => {
  let session = createMixing(MIXING_PUZZLES[0]);
  session = moveMixing(session, 0, 5); const before = session;
  session = moveMixing(session, 2, 5);
  assert.equal(session.frame.deliveries.length, 0); assert.equal(session.frame.mixer[0].color, 'labPurple');
  assert.equal(session.frame.mixer.length, 2); assert.deepEqual(undoMixing(session).frame, before.frame);
  assert.equal(selectMixingGoal(session, 1), session, 'Cannot change a locked goal');
  session = moveMixing(session, 5, 3); assert.equal(session.frame.mixer.length, 0);
  assert.equal(session.frame.bottles[3].length, 2); validateMixingFrame(session.puzzle, session.frame);
  assert.equal(moveMixing(session, 3, 5), session);
  session = moveMixing(session, 3, 4); validateMixingFrame(session.puzzle, session.frame);
  assert.deepEqual(restoreMixing(session.puzzle, session.frame, session.history), session);
});
test('goal order is free, selecting a goal adds no undo step, and empty mixers require both portions', () => {
  let session = selectMixingGoal(createMixing(MIXING_PUZZLES[0]), 1);
  assert.equal(session.history.length, 0);
  const rearranged = moveMixing(session, 0, 3); assert.equal(rearranged.frame.active, 1);
  session = moveMixing(session, 2, 5); assert.equal(session.frame.deliveries.length, 0);
  session = moveMixing(session, 1, 5); assert.equal(session.frame.deliveries[0].goal, 1);
  session = moveMixing(session, 0, 5); session = moveMixing(session, 1, 5);
  assert.deepEqual(session.frame.deliveries.map(d => d.goal), [1, 0]);
  assert.ok(mixingComplete(session.frame, session.puzzle));
  assert.deepEqual(restoreMixing(session.puzzle, session.frame, session.history), session);
  assert.equal(solveMixing(session.puzzle, 1).status, 'unknown');
});
test('normal source pours move the maximal compatible run, mixer pours move exactly one portion', () => {
  let session = createMixing(MIXING_PUZZLES[0]);
  session = moveMixing(session, 1, 3); assert.equal(session.frame.bottles[3].length, 2);
  const next = moveMixing(session, 3, 5); assert.equal(next.frame.mixer.length, 1); assert.equal(next.frame.bottles[3].length, 1);
  assert.equal(moveMixing(next, 2, 0), next);
});
test('curated recipes cover all ten pairs without RGB comparisons and preserve both input portions', () => {
  for (const [goal, pair] of Object.entries(RECIPES)) {
    const puzzle = { id: 'test-pair', number: 1, artwork: 'flower' as const, bottles: [[pair[0]], [pair[1]], [], []], goals: [goal as keyof typeof RECIPES] };
    let session = createMixing(puzzle); session = moveMixing(session, 0, 4); session = moveMixing(session, 1, 4);
    assert.ok(mixingComplete(session.frame, puzzle)); assert.equal(session.frame.deliveries[0].units.length, 2);
    validateMixingFrame(puzzle, session.frame);
  }
});
test('bounded undo checkpoints restore their own data and corrupted material or impossible transitions reject', () => {
  let session = createMixing(MIXING_PUZZLES[0]);
  for (let i = 0; i < MIXING_HISTORY + 12; i++) session = moveMixing(session, i % 2 === 0 ? 0 : 3, i % 2 === 0 ? 3 : 0);
  assert.equal(session.history.length, MIXING_HISTORY); assert.equal(session.offset, 12);
  assert.deepEqual(restoreMixing(session.puzzle, session.frame, session.history, session.offset), session);
  const initial = createMixing(session.puzzle);
  assert.throws(() => restoreMixing(session.puzzle, { ...initial.frame, bottles: [[], ...initial.frame.bottles.slice(1)] }, []), /conservation/);
  assert.throws(() => restoreMixing(session.puzzle, { ...initial.frame, bottles: initial.frame.bottles.map((b, i) => i === 0 ? b.map(u => ({ ...u, color: 'amber' as const })) : b) }, []), /conservation/);
  assert.throws(() => restoreMixing(session.puzzle, initial.frame, [initial.frame]), /transition/);
});
async function setup() {
  const contentDb = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(contentDb);
  const db = new TestDatabase(), player = await PlayerRepository.open(db, content.mainline, content.sides, 'mixing-acceptance');
  return { db, player, contentDb, repo: await MixingRepository.open(player) };
}
test('SQLite restores choice, partial mixture, deliveries and undo without altering classic state or preferences', async () => {
  const { db, repo, player, contentDb } = await setup();
  try {
    await player.setPreference('sound', 'false'); const mainline = player.state;
    let session = selectMixingGoal(repo.start(), 1);
    for (const action of [{ source: 2, target: 5, goal: 1 }, { source: 1, target: 5, goal: 1 }, { source: 0, target: 5, goal: 0 }] as MixingAction[]) {
      session = moveMixing(selectMixingGoal(session, action.goal), action.source, action.target); assert.equal(await repo.commit(session), true);
    }
    const restored = await MixingRepository.open(player);
    assert.deepEqual(restored.state, session); assert.deepEqual(player.state, mainline); assert.equal(player.preference('sound'), 'false');
    assert.equal(await restored.commit(undoMixing(session)), true);
    assert.deepEqual((await MixingRepository.open(player)).state, undoMixing(session));
    await restored.commit(createMixing(MIXING_PUZZLES[5]));
    assert.deepEqual((await MixingRepository.open(player)).state, createMixing(MIXING_PUZZLES[5]));
    assert.equal(db.getFirstSync<{ n: number }>("SELECT COUNT(*) n FROM completions WHERE mode='mainline'")!.n, 0);
  } finally { db.native.close(); contentDb.native.close(); }
});
test('failed mixing writes roll back, retain queue order and retry without losing automatic deliveries', async () => {
  const { db, repo, player, contentDb } = await setup();
  try {
    let session = repo.start(); await repo.commit(session);
    db.fail = sql => sql.startsWith('INSERT INTO mixing_trial_units');
    session = moveMixing(session, 0, 5); assert.equal(await repo.commit(session), false);
    assert.equal(db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM mixing_trial_deliveries')!.n, 0);
    session = moveMixing(session, 1, 5); const pending = repo.commit(session);
    db.fail = null; await player.flush(); assert.equal(await pending, true);
    assert.deepEqual((await MixingRepository.open(player)).state, session);
    db.native.exec("UPDATE mixing_trial_units SET color='invalid' WHERE step=-1 AND atom=0");
    await assert.rejects(MixingRepository.open(player), /conservation/);
  } finally { db.native.close(); contentDb.native.close(); }
});
