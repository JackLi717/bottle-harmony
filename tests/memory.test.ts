import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemory, hiddenMemory, initialUnits, moveMemory, peekMemory, readyMemory, resetMemory, restoreMemory, undoMemory, validateMemoryPuzzle } from '../src/game/memory.ts';
import { getLegalPours } from '../src/game/rules.ts';
import { canonicalBottleStrings } from '../src/game/structure.ts';
import { replaySolution } from '../src/game/solver.ts';
import { initialBoard, parseLevel } from '../src/game/model.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { MemoryRepository } from '../src/storage/memoryRepository.ts';
import { MemoryClock } from '../src/storage/memoryClock.ts';
import { TestDatabase } from './helpers/sqlite.ts';
import { moveMainline } from '../src/game/mainline.ts';

const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
const puzzle = content.memoryPuzzleById('memory-prototype-v1-3');
async function setup(db = new TestDatabase()) {
  const player = await PlayerRepository.open(db, content.mainline, content.sides, 'test');
  return { db, player, memory: await MemoryRepository.open(player, content) };
}
test('one hundred memory boards are distinct, bounded and replay to completion from SQLite', () => {
  assert.equal(content.memory.length, 100);
  const keys = new Set<string>();
  for (let i = 1; i <= 100; i++) {
    const p = content.memoryPuzzle(i); validateMemoryPuzzle(p);
    assert.ok(p.level.colors.length <= 8); assert.ok(p.level.bottles.length <= 10);
    keys.add(canonicalBottleStrings(initialBoard(p.level).map(b => b.map(c => p.level.colors.indexOf(c)))));
    replaySolution(initialBoard(p.level), p.solution);
  }
  assert.equal(keys.size, 100);
  assert.throws(() => validateMemoryPuzzle({ ...puzzle, masks: [3] }), /top run|mask/i);
});
test('observation cannot pour; ready masks exact portions; peek is temporary and pauses actions', () => {
  const observation = createMemory(puzzle);
  assert.equal(moveMemory(observation, 0, 4), null);
  assert.ok(hiddenMemory(observation).flat().every(v => !v));
  const play = readyMemory(observation), knowledge = play.revealed;
  assert.equal(hiddenMemory(play).flat().filter(Boolean).length, 4);
  const peek = peekMemory(play);
  assert.equal(peek.peeks, 1); assert.equal(peek.revealed, knowledge);
  assert.ok(hiddenMemory(peek).flat().every(v => !v));
  assert.equal(moveMemory(peek, 0, 4), null); assert.equal(undoMemory(peek), peek);
  const back = peekMemory(peek);
  assert.equal(back.phase, 'play'); assert.equal(back.peeks, 1);
  assert.deepEqual(hiddenMemory(back), hiddenMemory(play));
});
test('newly exposed maximal run stays known through moving and undo; reset clears learned knowledge', () => {
  let state = readyMemory(createMemory(puzzle));
  const initial = state.revealed;
  state = moveMemory(state, 0, 4)!.session; // azure
  state = moveMemory(state, 0, 5)!.session; // amber exposes masked coral
  assert.equal(state.revealed[1], 2); assert.equal(state.revealed[0], -1);
  const undone = undoMemory(state);
  assert.equal(undone.revealed[1], 2); assert.equal(undone.pours, 2); assert.equal(undone.undos, 1);
  const reset = resetMemory(undone);
  assert.equal(reset.phase, 'observe'); assert.deepEqual(reset.units, initialUnits(puzzle));
  assert.deepEqual(reset.revealed, initial); assert.equal(reset.attempt, 2);
  // A learned liquid identity follows the actual maximal pours, regardless of the destination.
  let routed = readyMemory(createMemory(puzzle));
  for (const p of puzzle.solution) routed = moveMemory(routed, p.source, p.target)!.session;
  assert.equal(routed.revealed[1] >= 0, true);
  assert.equal(routed.units.some((b, i) => i !== 0 && b.includes(1)), true);
  const paired = content.memoryPuzzle(2);
  // The two initial bottom jade portions are separately hidden, not every jade in the board.
  assert.equal(hiddenMemory(readyMemory(createMemory(paired))).flat().filter(Boolean).length, 2);
});
test('restore rejects lost identities, forged moves, missing top knowledge and invalid phase', () => {
  const state = moveMemory(readyMemory(createMemory(puzzle)), 0, 4)!.session;
  const saved = { ...state, offset: state.game.historyOffset };
  assert.deepEqual(restoreMemory(puzzle, saved).game, state.game);
  assert.throws(() => restoreMemory(puzzle, { ...saved, units: state.units.map((b, i) => i === 4 ? [0] : b) }), /checkpoint/);
  assert.throws(() => restoreMemory(puzzle, { ...saved, revealed: state.revealed.map((n, id) => id === 2 ? -1 : n) }), /knowledge/);
  assert.throws(() => restoreMemory(puzzle, { ...saved, phase: 'observe' }), /observation/);
});
test('exposing a two-portion top run reveals both portions before the next maximal pour', () => {
  const original = content.memoryPuzzle(1);
  const level = parseLevel({ ...original.level, bottles: original.level.bottles.map((b, i) => ({ ...b, layers: i === 0 ? ['jade','jade','coral','coral'] : i === 1 ? ['coral','coral','jade','jade'] : [] })) });
  const paired = { ...original, level, masks: [0, 1] };
  validateMemoryPuzzle(paired);
  let state = readyMemory(createMemory(paired));
  assert.equal(hiddenMemory(state)[0].filter(Boolean).length, 2);
  const move = moveMemory(state, 0, 2)!; assert.equal(move.event.pour.amount, 2); state = move.session;
  assert.equal(state.revealed[0], 1); assert.equal(state.revealed[1], 1);
  assert.ok(hiddenMemory(state)[0].every(v => !v));
  assert.equal(moveMemory(state, 0, 3)!.event.pour.amount, 2);
  const undone = undoMemory(state); assert.equal(undone.revealed[0], 1); assert.equal(undone.revealed[1], 1);
});
test('SQLite restores exact phase, stable knowledge, undo and tutorial independently from mainline', async () => {
  const { db, player, memory } = await setup();
  const original = player.state;
  let state = readyMemory(createMemory(puzzle));
  assert.equal(await memory.commit(state, 'ready'), true);
  assert.equal(await memory.completeTutorial(), true);
  state = moveMemory(state, 0, 4)!.session;
  await memory.commit(state, 'pour');
  state = peekMemory(state); await memory.commit(state, 'peek-open');
  const reopened = await MemoryRepository.open(player, content);
  assert.equal(reopened.tutorialDone, true); assert.equal(reopened.state!.phase, 'peek');
  assert.equal(reopened.state!.peeks, 1); assert.deepEqual(reopened.state!.units, state.units);
  state = undoMemory(peekMemory(reopened.state!)); await reopened.commit(state, 'undo');
  const restored = (await MemoryRepository.open(player, content)).state!;
  assert.deepEqual(restored.game.board, initialBoard(puzzle.level)); assert.equal(restored.undos, 1);
  assert.equal(player.state, original); assert.equal(player.state.hintCredits, original.hintCredits);
  assert.equal(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE mode='memory' AND kind='peek-open'")!.n, 1);
  db.native.close();
});
test('failed memory transaction retries atomically in the shared mainline queue without duplicate counters', async () => {
  const { db, player, memory } = await setup();
  let state = readyMemory(memory.start()); await memory.commit(state, 'ready');
  state = peekMemory(state);
  db.fail = sql => sql.startsWith('INSERT INTO events');
  assert.equal(await memory.commit(state, 'peek-open'), false);
  assert.equal(db.getFirstSync<{ peeks: number }>('SELECT peeks FROM memory_session')!.peeks, 0);
  const step = content.mainline.entries[0].solution[0], moved = moveMainline(player.state, step.source, step.target)!;
  db.fail = null;
  assert.equal(await player.commit(moved.state, { type: 'pour' }), true);
  assert.equal(await player.flush(), true);
  assert.equal(db.getFirstSync<{ peeks: number }>('SELECT peeks FROM memory_session')!.peeks, 1);
  assert.equal(db.getFirstSync<{ value: number }>("SELECT value FROM level_stats WHERE mode='memory' AND metric='peeks'")!.value, 1);
  assert.equal(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE kind='peek-open'")!.n, 1);
  db.native.close();
});
test('completion/undo/recompletion do not award mainline credits or duplicate memory first completion', async () => {
  const { db, player, memory } = await setup();
  let state = readyMemory(memory.start()); await memory.commit(state, 'ready');
  for (const p of state.puzzle.solution) { state = moveMemory(state, p.source, p.target, true)!.session; await memory.commit(state, 'pour'); }
  assert.equal(state.game.status, 'solved'); assert.equal(state.hints, state.pours);
  assert.ok(hiddenMemory(state).flat().every(v => !v));
  state = undoMemory(state); await memory.commit(state, 'undo');
  const last = content.memoryPuzzle(1).solution.at(-1)!;
  state = moveMemory(state, last.source, last.target)!.session; await memory.commit(state, 'pour');
  assert.equal(db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM completions WHERE mode='memory'")!.n, 1);
  assert.equal(player.state.hintCredits, 0); assert.equal(player.state.completedThrough, 0);
  const before = state; state = resetMemory(state); await memory.commit(state, 'reset');
  assert.equal(db.getFirstSync<{ result: string }>('SELECT result FROM memory_attempts WHERE id=?', `${player.installation}:memory:${before.attempt}`)!.result, 'solved');
  assert.equal(memory.tutorialDone, false); db.native.close();
});
test('bounded long memory undo history restores its identity anchor and learned information from paged SQLite', async () => {
  let state = readyMemory(createMemory(content.memoryPuzzle(1)));
  state = moveMemory(state, 0, 2)!.session;
  state = moveMemory(state, 1, 3)!.session;
  state = moveMemory(state, 2, 1)!.session;
  for (let i = 0; i < 4100; i++) state = moveMemory(state, i % 2 ? 2 : 3, i % 2 ? 3 : 2)!.session;
  assert.equal(state.history.length, 4096); assert.equal(state.game.historyOffset, 7);
  const restored = restoreMemory(state.puzzle, { ...state, offset: state.game.historyOffset });
  assert.deepEqual(restored.units, state.units); assert.deepEqual(restored.revealed, state.revealed);
  assert.equal(getLegalPours(restored.game.board).length > 0, true);
  const { db, player, memory } = await setup();
  assert.equal(await memory.commit(state, 'checkpoint'), true);
  // Continue past the retained boundary, trim one snapshot, then undo without losing the anchor.
  state = moveMemory(state, 3, 2)!.session; await memory.commit(state, 'pour');
  state = undoMemory(state); await memory.commit(state, 'undo');
  const reloaded = (await MemoryRepository.open(player, content)).state!;
  assert.deepEqual(reloaded.units, state.units); assert.deepEqual(reloaded.revealed, state.revealed);
  assert.equal(reloaded.game.historyOffset, 8); assert.equal(reloaded.history.length, 4095);
  db.native.close();
});
test('memory clock separates observation/peek/available solving and excludes background and blocks', () => {
  const clock = new MemoryClock(0);
  clock.update(0, true, false, 'observe'); clock.update(100, true, false, 'play');
  clock.update(250, true, true, 'play'); clock.update(300, true, false, 'peek');
  clock.update(400, false, false, 'peek'); clock.update(900, true, false, 'peek');
  assert.deepEqual(clock.take(950), { observationMs: 100, solveMs: 150, peekMs: 150, blockedMs: 50 });
});
