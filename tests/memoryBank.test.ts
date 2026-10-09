import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { decodeMemoryBank, analyzeMemory, prototypePositions } from '../scripts/memory-bank-lib.ts';
import { createMemory, readyMemory, moveMemory, hiddenMemory, undoMemory, restoreMemory, revealMemory, validateMemoryPuzzle } from '../src/game/memory.ts';
import { initialBoard } from '../src/game/model.ts';
import { replaySolution, solveBoard } from '../src/game/solver.ts';
import { nextMemoryNumber } from '../src/game/memoryCatalog.ts';
import { ContentRepository } from '../src/storage/contentRepository.ts';
import { MemoryRepository } from '../src/storage/memoryRepository.ts';
import { PlayerRepository } from '../src/storage/playerRepository.ts';
import { TestDatabase } from './helpers/sqlite.ts';
import { MEMORY_PROTOTYPES } from '../scripts/memory-prototypes.ts';
const input = () => JSON.parse(readFileSync('assets/levels/memory-100.json', 'utf8'));
const bank = decodeMemoryBank(input());

test('100 unique sourced boards have dispersed four-depth masks and two independently replayed black routes', () => {
  const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
  const histogram = [0,0,0,0];
  for (const p of bank.records) {
    assert.deepEqual(content.memoryPuzzle(p.number).level, p.level);
    assert.deepEqual(content.memoryPuzzle(p.number).masks, p.masks);
    assert.deepEqual(content.evidence(p.level.id), p);
    assert.ok(p.masks.some(id => id % 4 === 3));
    if (p.masks.length >= 4) assert.ok(p.evidence.depthHistogram.every(n => n > 0));
    p.evidence.depthHistogram.forEach((n,d) => histogram[d] += n);
    const solved = solveBoard(initialBoard(p.level), { maxStates: 100000, maxMilliseconds: 30000 });
    assert.equal(solved.status, 'solved', `Unverified ${p.number}`);
    if (solved.status === 'solved') assert.equal(solved.route.length, p.ordinaryReference.length);
    replaySolution(initialBoard(p.level), p.ordinaryAlternative);
    assert.ok(p.evidence.lighterVariant.hidden < p.masks.length);
  }
  assert.deepEqual(histogram, [239,149,146,243]); source.native.close();
});
test('every recorded quantity agrees with black-unit rules; knowledge is fixed until explicit reveal', () => {
  for (const p of bank.records) for (const route of [p.solution, p.alternative]) {
    let state = readyMemory(createMemory(p));
    const knowledge = state.revealed;
    for (const q of route) {
      const before = state, accepted = moveMemory(state, q.source, q.target)!;
      assert.deepEqual(accepted.event.pour, q); state = accepted.session;
      assert.equal(state.revealed, knowledge);
      assert.equal(hiddenMemory(state).flat().filter(Boolean).length, p.masks.length);
      assert.notEqual(state.game.status, 'solved');
      const undo = undoMemory(state);
      assert.deepEqual(undo.units, before.units); assert.equal(undo.revealed, knowledge);
    }
    assert.deepEqual(restoreMemory(p, { ...state, offset: state.game.historyOffset }).units, state.units);
    state = revealMemory(state); assert.equal(state.judgement, 'correct'); assert.equal(state.game.status, 'solved');
    assert.deepEqual(restoreMemory(p, { ...state, offset: state.game.historyOffset }).revealed, state.revealed);
  }
});
test('import rejects forged sources/evidence/routes, adjacent masks, changed targets and duplicate boards', () => {
  for (const mutate of [
    (b: ReturnType<typeof input>) => b.records[2].source.origin.seed++,
    (b: ReturnType<typeof input>) => b.records[22].evidence.reference.firstTransfer[0]++,
    (b: ReturnType<typeof input>) => b.records[22].target.hidden++,
    (b: ReturnType<typeof input>) => b.records[22].solution[0].amount++,
    (b: ReturnType<typeof input>) => b.records[22].alternative = b.records[22].solution,
  ]) { const b = input(); mutate(b); assert.throws(() => decodeMemoryBank(b)); }
  const duplicate = input(), first = duplicate.records[10], second = duplicate.records[11];
  Object.assign(second, { level: first.level, source: first.source, ordinaryReference: first.ordinaryReference, ordinaryAlternative: first.ordinaryAlternative,
    solution: first.solution, alternative: first.alternative, masks: first.masks });
  second.evidence = analyzeMemory(second, second.alternative);
  assert.throws(() => decodeMemoryBank(duplicate), /Duplicate board/);
  assert.throws(() => validateMemoryPuzzle({ ...bank.records[0], masks: [2,3] }), /nonadjacent/);
});
test('original physical boards keep stable IDs with new masks; black attempts restore by ID with no mainline changes', async () => {
  const source = new TestDatabase('assets/levels/content.sqlite'), content = new ContentRepository(source);
  for (const [number, index] of prototypePositions) {
    const old = MEMORY_PROTOTYPES[index - 1], p = content.memoryPuzzle(number);
    assert.deepEqual(p.level, old.level); assert.notDeepEqual(p.masks, old.masks);
    const db = new TestDatabase(), player = await PlayerRepository.open(db, content.mainline, content.sides, 'test');
    const repository = await MemoryRepository.open(player, content), main = player.state;
    let state = readyMemory(createMemory({ ...p, number: index }));
    const q = p.solution[0]; state = moveMemory(state, q.source, q.target)!.session;
    await repository.commit(state, 'pour'); await repository.completeTutorial();
    const loaded = await MemoryRepository.open(player, content);
    assert.equal(loaded.state!.puzzle.number, number); assert.equal(loaded.state!.puzzle.level.id, old.level.id);
    assert.deepEqual(loaded.state!.units, state.units); assert.deepEqual(loaded.state!.revealed, state.revealed);
    assert.equal(loaded.tutorialDone, true); assert.equal(player.state, main); db.native.close();
  }
  source.native.close();
});
test('memory progression reaches 100 and wraps to one without a phantom 101', () => {
  assert.equal(nextMemoryNumber(5), 6); assert.equal(nextMemoryNumber(99), 100); assert.equal(nextMemoryNumber(100), 1);
  assert.throws(() => nextMemoryNumber(101)); assert.throws(() => nextMemoryNumber(0));
});
