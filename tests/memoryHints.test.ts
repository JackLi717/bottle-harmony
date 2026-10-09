import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createMemory, readyMemory, moveMemory, undoMemory, peekMemory, getMemoryPour, unitColors, type MemorySession, type MemoryPuzzle } from '../src/game/memory.ts';
import { memoryReferenceHint } from '../src/game/memorySolver.ts';
import { createMemoryHintPlanner, memoryHintReason, type MemoryHintTask } from '../src/game/memoryHints.ts';
import { verifiedMemoryRoute, memoryEncoding } from '../src/game/memoryRoutes.ts';
const bank: MemoryPuzzle[] = JSON.parse(readFileSync(new URL('../assets/levels/memory-100.json', import.meta.url), 'utf8')).records;
const drain = (task: MemoryHintTask) => { let result; do { result = task.step(32, 4); } while (!result); return result; };
function replay(s: MemorySession, route: readonly { source: number; target: number }[]) {
  for (const p of route) { const moved = moveMemory(s, p.source, p.target); assert.ok(moved); s = moved.session; }
  assert.equal(s.judgement, 'correct'); return s;
}
function deviation(puzzle: MemoryPuzzle) {
  const s = readyMemory(createMemory(puzzle));
  for (let a = 0; a < s.units.length; a++) for (let b = 0; b < s.units.length; b++) {
    const moved = moveMemory(s, a, b);
    if (!moved || moved.session.judgement !== 'hidden' || memoryReferenceHint(moved.session)) continue;
    const back = moveMemory(moved.session, b, a);
    if (back && JSON.stringify(back.session.units) === JSON.stringify(s.units)) return moved.session;
  }
  throw new Error('No reversible off-reference fixture');
}
test('all 100 puzzles match reference routes after bottle permutation, with actual indices and a replayed completion', () => {
  for (const p of bank) {
    let s = readyMemory(createMemory(p));
    const first = p.solution[0]; s = moveMemory(s, first.source, first.target)!.session;
    const units = [...s.units.slice(1), s.units[0]], current = { ...s, units };
    const hint = memoryReferenceHint(current); assert.ok(hint, `puzzle ${p.number}`);
    const result = drain(createMemoryHintPlanner().create(current)); assert.equal(result.status, 'solved');
    if (result.status !== 'solved') continue;
    assert.equal(result.stats.expandedStates, 0); assert.equal(result.shortest, false);
    assert.deepEqual(result.route[0], hint); assert.ok(verifiedMemoryRoute(current, result.route)); replay(current, result.route);
  }
});
test('puzzle 16 accepts the other empty bottle and repeated hints finish without restarting search', () => {
  const p = bank[15], start = readyMemory(createMemory(p)), first = p.solution[0];
  const other = start.units.findIndex((b, i) => !b.length && i !== first.target); assert.ok(other >= 0);
  let s = moveMemory(start, first.source, other)!.session;
  const planner = createMemoryHintPlanner(); let hints = 0;
  while (s.judgement === 'hidden') {
    const result = drain(planner.create(s)); assert.equal(result.status, 'solved'); if (result.status !== 'solved') break;
    assert.equal(result.stats.expandedStates, 0); assert.ok(result.route.length);
    s = moveMemory(s, result.route[0].source, result.route[0].target, true)!.session; hints++;
    assert.ok(hints <= p.solution.length);
  }
  assert.equal(s.judgement, 'correct'); assert.equal(s.hints, hints);
});
test('off-reference decisions find complete routes; their suffixes are reused, undo is safe and a new puzzle replaces the cache', () => {
  const planner = createMemoryHintPlanner();
  for (const n of [20, 60, 80, 100]) {
    const s = deviation(bank[n - 1]); const original = JSON.stringify(s);
    const result = drain(planner.create(s)); assert.equal(result.status, 'solved', `puzzle ${n}`);
    if (result.status !== 'solved') continue;
    assert.ok(result.stats.expandedStates > 0); assert.ok(verifiedMemoryRoute(s, result.route)); replay(s, result.route);
    const p = result.route[0], moved = moveMemory(s, p.source, p.target, true)!.session;
    const suffix = drain(planner.create(moved)); assert.equal(suffix.status, 'solved');
    if (suffix.status === 'solved') { assert.equal(suffix.stats.expandedStates, 0); replay(moved, suffix.route); }
    const undo = undoMemory(moved), again = drain(planner.create(undo)); assert.equal(again.status, 'solved');
    assert.equal(JSON.stringify(s), original, 'assistance must not mutate a session');
  }
});
test('black-rule search without stored routes finds verified completions, including real mismatched-color bridges', () => {
  const p = { ...bank[34], solution: [] }, s = readyMemory(createMemory(p));
  const result = drain(createMemoryHintPlanner().create(s, { maxStates: 100000, maxMilliseconds: 1000 }));
  assert.equal(result.status, 'solved'); if (result.status !== 'solved') return;
  const colors = unitColors(p); let current = s, bridges = 0;
  for (const m of result.route) {
    const source = current.units[m.source].at(-1)!, target = current.units[m.target].at(-1);
    if (target !== undefined && colors[source] !== colors[target]) bridges++;
    current = moveMemory(current, m.source, m.target)!.session;
  }
  assert.ok(bridges > 0); assert.equal(current.judgement, 'correct');
});
test('unknown and cancelled searches return no speculative move; full exhaustion alone proves unsolvable', () => {
  const s = deviation(bank[99]);
  const limited = drain(createMemoryHintPlanner().create(s, { maxStates: 1, maxMilliseconds: 1000 })); assert.equal(limited.status, 'limitReached'); assert.ok(!('route' in limited));
  const task = createMemoryHintPlanner().create(s); const cancelled = task.cancel(); assert.equal(cancelled.status, 'limitReached'); assert.deepEqual(task.step(), cancelled);
  const start = readyMemory(createMemory({ ...bank[0], solution: [] }));
  const full = { ...start, units: start.units.slice(0, 2) };
  assert.equal(drain(createMemoryHintPlanner().create(full)).status, 'unsolvable');
});
test('route verification rejects premature wrong answers and explanations never inspect hidden true colors', () => {
  const s = readyMemory(createMemory(bank[0])), black = s.units.findIndex(b => s.revealed[b.at(-1)!] < 0);
  const p = getMemoryPour(s, black, 2)!; assert.equal(memoryHintReason(s, p), 'memoryHintUncover');
  assert.equal(memoryHintReason(peekMemory(s), p), 'memoryHintUncover');
  const altered = { ...s, puzzle: { ...s.puzzle, level: { ...s.puzzle.level, bottles: s.puzzle.level.bottles.map((b, i) => i === black ? { ...b, layers: b.layers.map((c, d) => d === b.layers.length - 1 ? 'amber' : c) } : b) } } };
  assert.equal(memoryHintReason(altered, p), memoryHintReason(s, p), 'hidden true color cannot change the explanation');
  const shuffled = { ...s, units: s.units.map((b, i) => i === 0 ? [...b].reverse() : b) };
  assert.notEqual(memoryEncoding(s).key(s.units), memoryEncoding(shuffled).key(shuffled.units));
  assert.equal(verifiedMemoryRoute(s, [...bank[0].solution, bank[0].solution[0]]), false);
  assert.equal(verifiedMemoryRoute(s, [{ ...p, amount: p.amount + 1 }]), false);
});
