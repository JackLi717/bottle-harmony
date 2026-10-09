import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemory, hiddenMemory, initialUnits, moveMemory, peekMemory, readyMemory, resetMemory, restoreMemory, undoMemory, revealMemory, continueMemory, memoryPour, memoryReadyToReveal, unitColors, validateMemoryPuzzle, MEMORY_RULES, type MemorySession } from '../src/game/memory.ts';
import { createMemorySolver, memoryReferenceHint } from '../src/game/memorySolver.ts';
import { parseLevel } from '../src/game/model.ts';
import { solveBoard, type SolverTask } from '../src/game/solver.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { MemoryRepository } from '../src/storage/memoryRepository.ts';
import { MemoryClock } from '../src/storage/memoryClock.ts';
import { TestDatabase } from './helpers/sqlite.ts';
import { moveMainline } from '../src/game/mainline.ts';

const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
const puzzle = content.memoryPuzzle(1);
const fixture = { number: 1, skill: 'test', masks: [1, 3], solution: [], level: parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'black-fixture', capacity: 4,
  colors: ['jade', 'coral'], bottles: [['jade','jade','coral','coral'],['coral','coral','jade','jade'],[],[]].map((layers, i) => ({ id: `b${i}`, layers })) }) };
const restore = (s: MemorySession) => restoreMemory(s.puzzle, { ...s, offset: s.game.historyOffset });
const drain = (task: SolverTask) => { let result; do { result = task.step(32, 4); } while (!result); return result; };
async function setup(db = new TestDatabase()) {
  const player = await PlayerRepository.open(db, content.mainline, content.sides, 'test');
  return { db, player, memory: await MemoryRepository.open(player, content) };
}

test('observation and temporary peek cannot move; all four depths can be masked', () => {
  for (const depth of [0,1,2,3]) validateMemoryPuzzle({ ...fixture, masks: [depth] });
  assert.throws(() => validateMemoryPuzzle({ ...fixture, masks: [2,3] }), /nonadjacent/);
  assert.throws(() => validateMemoryPuzzle({ ...fixture, masks: [0,4] }), /upper and lower/);
  const observation = createMemory(fixture);
  assert.equal(moveMemory(observation, 0, 2), null);
  assert.ok(hiddenMemory(observation).flat().every(v => !v));
  const play = readyMemory(observation), peek = peekMemory(play);
  assert.equal(hiddenMemory(play).flat().filter(Boolean).length, 2);
  assert.equal(peek.peeks, 1); assert.equal(peek.revealed, play.revealed);
  assert.ok(hiddenMemory(peek).flat().every(v => !v));
  assert.equal(moveMemory(peek, 0, 2), null); assert.equal(undoMemory(peek), peek);
  assert.deepEqual(hiddenMemory(peekMemory(peek)), hiddenMemory(play));
});
test('black moves exactly one unit; visible runs stop at black; either black contact permits a mismatch', () => {
  let s = readyMemory(createMemory(fixture));
  const first = moveMemory(s, 0, 2)!;
  assert.equal(first.event.pour.amount, 1); s = first.session;
  assert.equal(s.units[2][0], 3); assert.equal(hiddenMemory(s)[2][0], true);
  assert.equal(s.revealed[1], -1); assert.equal(s.revealed[3], -1);
  assert.equal(moveMemory(s, 1, 0), null); // Both visible, different colors.
  const wildcardReceiver = moveMemory(s, 1, 2)!;
  assert.equal(wildcardReceiver.event.pour.amount, 2); // Visible jade onto hidden coral.
  assert.deepEqual(wildcardReceiver.session.game.board[2], ['coral','jade','jade']);
  assert.equal(wildcardReceiver.session.revealed[3], -1);
  assert.equal(memoryPour([[0,1],[],[]], ['jade','jade'], [-1,-1], 0, 1)!.amount, 1);
  assert.equal(memoryPour([[0,1],[],[]], ['jade','jade'], [-1,0], 0, 1)!.amount, 1);
  assert.equal(memoryPour([[0],[1],[]], ['jade','coral'], [-1,-1], 0, 1)!.amount, 1);
  assert.equal(memoryPour([[0],[1],[]], ['jade','coral'], [0,0], 0, 1), null);
  assert.equal(moveMemory(s, 2, 0)!.event.pour.amount, 1); // Black source onto visible coral.
});
test('hidden moves keep knowledge until the publicly sorted board automatically reveals', () => {
  let s = readyMemory(createMemory(puzzle));
  const original = s.revealed, route = puzzle.solution;
  for (const p of route) {
    s = moveMemory(s, p.source, p.target)!.session;
    if (p !== route.at(-1)) {
      assert.equal(s.revealed, original);
      assert.notEqual(s.game.status, 'solved');
      assert.equal(hiddenMemory(s).flat().filter(Boolean).length, puzzle.masks.length);
    }
  }
  const known = s;
  assert.equal(known.revealAt, puzzle.solution.length);
  assert.equal(known.game.status, 'solved'); assert.equal(known.judgement, 'correct');
  assert.ok(hiddenMemory(known).flat().every(v => !v));
  const undone = undoMemory(known);
  assert.equal(undone.judgement, 'cleanup'); assert.ok(undone.revealed.every(n => n >= 0));
  assert.deepEqual(restore(undone).units, undone.units);
  const reset = resetMemory(undone);
  assert.equal(reset.phase, 'observe'); assert.equal(reset.attempt, 2);
  assert.deepEqual(reset.units, initialUnits(puzzle)); assert.ok(reset.revealed.some(n => n < 0));
});
test('automatic answer eligibility ignores true hidden colors but requires full, visibly consistent bottles', () => {
  const colors = unitColors(fixture), knowledge = createMemory(fixture).revealed;
  assert.equal(memoryReadyToReveal([[0,1],[2,3],[4,5],[6,7]], colors, knowledge), false);
  assert.equal(memoryReadyToReveal(initialUnits(fixture), colors, knowledge), false);
  // Both full bottles look sorted, though their black portions contain the opposite color.
  const sorted = [[], [4,5,2,1], [3,6,7,0], []];
  assert.equal(memoryReadyToReveal(sorted, colors, knowledge), true);
  const changed = colors.map((c,id) => knowledge[id] < 0 ? 'azure' : c);
  assert.equal(memoryReadyToReveal(sorted, changed, knowledge), true);
  assert.equal(memoryReadyToReveal([[0,1,2,3], []], colors, colors.map(() => -1)), true);
  assert.equal(memoryReadyToReveal([[], []], [], []), false);
});
test('an incorrect automatic answer never grants completion and keeps ordinary recovery available', () => {
  let s = readyMemory(createMemory(fixture));
  for (const [source, target] of [[0,2],[1,2],[0,1],[0,1],[0,2]]) s = moveMemory(s, source, target)!.session;
  assert.equal(s.judgement, 'wrong'); assert.notEqual(s.game.status, 'solved');
  assert.equal(s.revealAt, 5); assert.ok(s.revealed.every(n => n >= 0));
  assert.equal(moveMemory(s, 1, 0), null);
  assert.deepEqual(restore(s).game, s.game);
  const solved = solveBoard(s.game.board);
  assert.equal(solved.status, 'solved');
  if (solved.status === 'solved') {
    let cleanup = continueMemory(s, solved.route);
    for (const p of solved.route) cleanup = moveMemory(cleanup, p.source, p.target)!.session;
    assert.equal(cleanup.game.status, 'solved'); assert.equal(cleanup.judgement, 'cleanup');
  }
  const undo = undoMemory(s);
  assert.equal(undo.judgement, 'cleanup'); assert.ok(undo.revealed.every(n => n >= 0));
});
test('wrong answers pause; continuation requires a replayed ordinary solution; undo keeps revealed knowledge', () => {
  let s = readyMemory(createMemory(fixture));
  s = moveMemory(s, 0, 2)!.session;
  const wrong = revealMemory(s);
  assert.equal(wrong.judgement, 'wrong'); assert.equal(moveMemory(wrong, 1, 3), null);
  assert.throws(() => continueMemory(wrong, []));
  const solved = solveBoard(wrong.game.board, { maxStates: 100000, maxMilliseconds: 5000 });
  assert.equal(solved.status, 'solved');
  if (solved.status !== 'solved') return;
  let cleanup = continueMemory(wrong, solved.route);
  assert.equal(cleanup.judgement, 'cleanup');
  assert.deepEqual(restore(cleanup).units, cleanup.units);
  for (const p of solved.route) cleanup = moveMemory(cleanup, p.source, p.target)!.session;
  assert.equal(cleanup.game.status, 'solved');
  const undone = undoMemory(wrong);
  assert.equal(undone.revealAt, 0); assert.equal(undone.judgement, 'cleanup');
  assert.ok(hiddenMemory(undone).flat().every(v => !v));
  const ordinary = moveMemory(undone, 0, 2)!;
  assert.equal(ordinary.event.pour.amount, 2);
  assert.deepEqual(restore(ordinary.session).game, ordinary.session.game);
});
test('complete exhaustion differs from search limits, and cannot enable continuation', () => {
  const dead = { ...fixture, level: parseLevel({ ...fixture.level, bottles: fixture.level.bottles.slice(0,2) }) };
  const wrong = revealMemory(readyMemory(createMemory(dead)));
  assert.equal(solveBoard(wrong.game.board).status, 'unsolvable');
  assert.throws(() => continueMemory(wrong, []));
  const limited = drain(createMemorySolver(readyMemory(createMemory(fixture)), { maxStates: 1, maxMilliseconds: 1000 }));
  assert.equal(limited.status, 'limitReached');
  const cancelled = createMemorySolver(readyMemory(createMemory(fixture)));
  assert.equal(cancelled.cancel().status, 'limitReached');
});
test('hints use black rules and exact unit-route matches; found routes replay before reveal', () => {
  let s = readyMemory(createMemory(puzzle));
  assert.deepEqual(memoryReferenceHint(s), puzzle.solution[0]);
  s = moveMemory(s, puzzle.solution[0].source, puzzle.solution[0].target)!.session;
  assert.deepEqual(memoryReferenceHint(s), puzzle.solution[1]);
  const result = drain(createMemorySolver(readyMemory(createMemory(fixture)), { maxStates: 100000, maxMilliseconds: 5000 }));
  assert.equal(result.status, 'solved');
  if (result.status !== 'solved') return;
  let state = readyMemory(createMemory(fixture));
  for (const p of result.route) { const next = moveMemory(state, p.source, p.target)!; assert.deepEqual(next.event.pour, p); state = next.session; }
  assert.equal(revealMemory(state).judgement, 'correct');
});
test('restore rejects lost identities, forged history, partial disclosure and invalid phases', () => {
  const s = moveMemory(readyMemory(createMemory(fixture)), 0, 2)!.session;
  const saved = { ...s, offset: 0 };
  assert.deepEqual(restoreMemory(fixture, saved).game, s.game);
  assert.throws(() => restoreMemory(fixture, { ...saved, units: s.units.map((b,i) => i === 2 ? [0] : b) }), /checkpoint/);
  assert.throws(() => restoreMemory(fixture, { ...saved, revealed: s.revealed.map((n,id) => id === 3 ? 0 : n) }), /knowledge/);
  assert.throws(() => restoreMemory(fixture, { ...saved, phase: 'observe' }), /judgement/);
  assert.throws(() => restoreMemory(fixture, { ...saved, units: initialUnits(fixture) }), /history/);
});
test('SQLite restores hidden/peek/reveal/undo boundaries and tutorial without changing mainline or wallet', async () => {
  const { db, player, memory } = await setup(), original = player.state;
  let s = readyMemory(memory.start()); await memory.commit(s, 'ready'); await memory.completeTutorial();
  const p = s.puzzle.solution[0]; s = moveMemory(s, p.source, p.target)!.session; await memory.commit(s, 'pour');
  s = peekMemory(s); await memory.commit(s, 'peek-open');
  let loaded = await MemoryRepository.open(player, content);
  assert.equal(loaded.state!.phase, 'peek'); assert.equal(loaded.tutorialDone, true); assert.deepEqual(loaded.state!.units, s.units);
  s = revealMemory(peekMemory(loaded.state!)); await loaded.commit(s, 'reveal-answer');
  loaded = await MemoryRepository.open(player, content);
  assert.equal(loaded.state!.judgement, 'wrong'); assert.ok(loaded.state!.revealed.every(n => n >= 0));
  s = undoMemory(loaded.state!); await loaded.commit(s, 'undo');
  const reloaded = (await MemoryRepository.open(player, content)).state!;
  assert.equal(reloaded.revealAt, 0); assert.equal(reloaded.judgement, 'cleanup');
  assert.equal(player.state, original); assert.equal(player.state.hintCredits, original.hintCredits);
  db.native.close();
});
test('failed memory writes retry atomically in the shared player queue without duplicate counters', async () => {
  const { db, player, memory } = await setup();
  let s = readyMemory(memory.start()); await memory.commit(s, 'ready'); s = peekMemory(s);
  db.fail = sql => sql.startsWith('INSERT INTO events');
  assert.equal(await memory.commit(s, 'peek-open'), false);
  assert.equal(db.getFirstSync<{ peeks: number }>('SELECT peeks FROM memory_black_session')!.peeks, 0);
  db.fail = null;
  const p = content.mainline.entries[0].solution[0], moved = moveMainline(player.state, p.source, p.target)!;
  assert.equal(await player.commit(moved.state, { type: 'pour' }), true);
  assert.equal(await player.flush(), true);
  assert.equal(db.getFirstSync<{ peeks: number }>('SELECT peeks FROM memory_black_session')!.peeks, 1);
  assert.equal(db.getFirstSync<{ peeks: number }>('SELECT peeks FROM memory_black_attempts')!.peeks, 1);
  assert.equal(db.getFirstSync<{ value: number }>("SELECT value FROM level_stats WHERE mode='memory' AND metric='peeks'")!.value, 1);
  assert.equal(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE kind='peek-open'")!.n, 1);
  db.native.close();
});
test('automatic correct/assisted completion is distinct and redoing does not overwrite the first result or grant credits', async () => {
  const { db, player, memory } = await setup();
  let s = readyMemory(memory.start()); await memory.commit(s, 'ready');
  for (const p of s.puzzle.solution) { s = moveMemory(s, p.source, p.target, true)!.session; await memory.commit(s, 'pour'); }
  assert.equal(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM completions WHERE mode='memory'")!.n, 1);
  const loaded = (await MemoryRepository.open(player, content)).state!;
  assert.equal(loaded.judgement, 'correct'); assert.deepEqual(loaded.units, s.units);
  s = undoMemory(s); await memory.commit(s, 'undo');
  const last = s.puzzle.solution.at(-1)!; s = moveMemory(s, last.source, last.target)!.session; await memory.commit(s, 'pour');
  assert.equal(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM completions WHERE mode='memory'")!.n, 1);
  assert.equal(db.getFirstSync<{ result: string }>('SELECT result FROM memory_black_attempts WHERE id=?', `${player.installation}:${MEMORY_RULES}:${s.attempt}`)!.result, 'remembered');
  assert.equal(player.state.hintCredits, 0); assert.equal(player.state.completedThrough, 0);
  db.native.close();
});
test('4096-step undo checkpoints retain stable identities through truncation, reveal and restart', async () => {
  let s = readyMemory(createMemory(puzzle));
  const from = Math.floor(puzzle.masks[0] / 4), a = puzzle.level.colors.length, b = a + 1;
  s = moveMemory(s, from, a)!.session;
  for (let i = 0; i < 4100; i++) s = moveMemory(s, i % 2 ? b : a, i % 2 ? a : b)!.session;
  assert.equal(s.history.length, 4096); assert.equal(s.game.historyOffset, 5);
  assert.deepEqual(restore(s).units, s.units);
  const { db, player, memory } = await setup(); await memory.commit(s, 'checkpoint');
  s = revealMemory(s); await memory.commit(s, 'reveal-answer');
  s = undoMemory(s); await memory.commit(s, 'undo');
  const loaded = (await MemoryRepository.open(player, content)).state!;
  assert.deepEqual(loaded.units, s.units); assert.deepEqual(loaded.revealed, s.revealed);
  assert.equal(loaded.revealAt, s.game.historyOffset + s.history.length);
  db.native.close();
});
test('memory clock excludes background and keeps observation, peek and blocked intervals separate', () => {
  const clock = new MemoryClock(0);
  clock.update(0, true, false, 'observe'); clock.update(100, true, false, 'play');
  clock.update(250, true, true, 'play'); clock.update(300, true, false, 'peek');
  clock.update(400, false, false, 'peek'); clock.update(900, true, false, 'peek');
  assert.deepEqual(clock.take(950), { observationMs: 100, solveMs: 150, peekMs: 150, blockedMs: 50 });
});
