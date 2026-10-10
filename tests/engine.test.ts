import assert from 'node:assert/strict';
import test from 'node:test';
import { classicSortingPuzzle, decodeSortingPuzzle, parseSortingPuzzle } from '../src/game/engineModel.ts';
import { createEngineSession, engineTransferAmount, evaluateEngineGoal, listEngineActions, moveEngineSession, resetEngineSession,
  restoreEngineSession, saveEngineSession, transitionEngine, undoEngineSession, validateEngineState, visibleEngineState, type EngineAction, type EngineSession } from '../src/game/engine.ts';
import { createEngineHintTask, createEngineProofSearch, replayEngineRoute, type EngineSearchOptions } from '../src/game/engineSearch.ts';
import { ENGINE_EXAMPLES, engineFixture } from '../src/game/engineExamples.ts';
import { parseLevel } from '../src/game/model.ts';
import { applyPour, getLegalPours, isSolved } from '../src/game/rules.ts';
import { oracleApply, oracleMoves, oracleSolved } from './helpers/classicOracle.ts';

const action = (source: number, target: number): EngineAction => ({ type: 'transfer', source: `b${source}`, target: `b${target}` });
function move(current: EngineSession, source: number, target: number) { const result = moveEngineSession(current, action(source, target)); assert.ok(result); return result.session; }
function solve(current: EngineSession, options: EngineSearchOptions = { maxStates: 30000, maxMilliseconds: 10000 }) {
  const task = createEngineProofSearch(current.runtime, current, options);
  let result; do { result = task.step(64, 4); } while (!result); return result;
}
function invariant(current: EngineSession) {
  validateEngineState(current.runtime, current.state, current.known);
  const units = current.state.contents.flat();
  assert.equal(new Set(units).size, current.runtime.puzzle.units.length);
  for (const color of current.runtime.puzzle.colors) assert.equal(units.filter(u => current.runtime.unitColors.get(u) === color).length, current.runtime.puzzle.units.filter(u => u.color === color).length);
}

test('strict schema rejects unknown fields, versions, references, duplication and impossible inventory', () => {
  const source = ENGINE_EXAMPLES[3];
  const cases = [ { ...source, rules: 'unrecognized' }, { ...source, version: 2 }, { ...source, ignored: true },
    { ...source, containers: source.containers.map((c, i) => i ? c : { ...c, capacity: 0 }) },
    { ...source, containers: source.containers.map((c, i) => i ? c : { ...c, receive: 'magic' }) },
    { ...source, units: source.units.map((u, i) => i ? u : { ...u, extra: 'bad' }) },
    { ...source, hidden: ['missing'] }, { ...source, goal: { type: 'collect', container: 'b3', color: 'jade', count: 12, exact: true, exclusive: true } },
    { ...source, goal: { type: 'sequence', container: 'b3', colors: ['missing'] } },
    { ...source, goal: { type: 'sort', containers: ['b0'], exact: true } },
    { ...source, locked: ['b0'] }, { ...source, units: [...source.units, source.units[0]] },
  ];
  for (const value of cases) assert.throws(() => parseSortingPuzzle(value));
  assert.deepEqual(decodeSortingPuzzle(JSON.stringify(source)), source);
  assert.throws(() => decodeSortingPuzzle(' '.repeat(131073)));
  const mutable = JSON.parse(JSON.stringify(source)); const detached = parseSortingPuzzle(mutable);
  mutable.containers[0].units.splice(0); assert.equal(detached.containers[0].units.length, 4);
  assert.ok(Object.isFrozen(detached.containers[0].units));
});

test('mixed capacities and collection preserve inventory and ignore explicitly irrelevant liquid', () => {
  let current = createEngineSession(ENGINE_EXAMPLES[3], 'collection');
  assert.deepEqual(current.runtime.puzzle.containers.slice(0, 4).map(c => c.capacity), [4, 5, 6, 12]);
  for (const source of [0, 1, 2]) { current = move(current, source, 3); invariant(current); }
  assert.equal(current.status, 'solved'); assert.equal(current.state.contents[3].length, 12);
  assert.deepEqual(visibleEngineState(current.runtime, current.state, current.known)[4].colors, ['jade', 'amber']);
  assert.equal(moveEngineSession(current, action(3, 0)), null);
  current = undoEngineSession(current); assert.equal(current.status, 'playing'); assert.equal(current.state.contents[3].length, 8);
  assert.equal(engineTransferAmount(current.runtime, current.state, current.known, 3, 0), 0);
  assert.deepEqual(restoreEngineSession(current.runtime.puzzle, saveEngineSession(current)), current);
});

test('fixed appearance, source permission and receiver permission are independent; undo bypasses normal source restrictions', () => {
  const puzzle = engineFixture('permissions', [['coral'], [], ['jade']], { fixed: [0], sources: [true, false, true], receivers: [false, true, true],
    goal: { type: 'collect', container: 'b1', color: 'jade', count: 1, exact: true, exclusive: true } });
  const start = createEngineSession(puzzle, 'permissions'), next = move(start, 0, 1);
  assert.equal(engineTransferAmount(next.runtime, next.state, next.known, 1, 0), 0);
  assert.equal(engineTransferAmount(next.runtime, next.state, next.known, 2, 0), 0);
  assert.deepEqual(undoEngineSession(next).state, start.state);
  assert.equal(visibleEngineState(start.runtime, start.state, start.known)[0].fixed, true);
  assert.equal(visibleEngineState(start.runtime, start.state, start.known)[0].canSource, true);
});

test('ordered goal permits wrong input without secretly rejecting it; one-unit transfer and bottom-to-top order are explicit', () => {
  const start = createEngineSession(ENGINE_EXAMPLES[4], 'sequence');
  const wrong = move(start, 2, 3); assert.equal(wrong.state.contents[3].length, 1); assert.equal(wrong.status, 'playing');
  let current = resetEngineSession(wrong);
  for (const source of [0, 1, 2, 0, 1, 2]) current = move(current, source, 3);
  assert.equal(current.status, 'solved');
  assert.deepEqual(visibleEngineState(current.runtime, current.state, current.known)[3].colors, ENGINE_EXAMPLES[4].goal.type === 'sequence' ? ENGINE_EXAMPLES[4].goal.colors : []);
  assert.equal(solve(wrong).status, 'unsolvable');
  const task = createEngineProofSearch(start.runtime, start, { maxStates: 30000, maxMilliseconds: 10000 }); task.cancel(); assert.equal(task.step()?.status, 'unknown');
});

test('key and cover fire together, groups reveal atomically, undo relocks without forgetting and reset hides again', () => {
  const base = ENGINE_EXAMPLES[0];
  const puzzle = parseSortingPuzzle({ ...base, triggers: [...base.triggers, { id: 'cloth', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b2'] }] });
  const start = createEngineSession(puzzle, 'keys');
  assert.equal(visibleEngineState(start.runtime, start.state, start.known)[2].count, null);
  assert.equal(moveEngineSession(start, action(0, 2)), null);
  const result = moveEngineSession(start, action(0, 1))!;
  assert.deepEqual(result.session.state.open, [true, true, true, true, true]);
  assert.deepEqual(result.session.state.fired, ['cloth', 'key']);
  assert.deepEqual(result.events.filter(e => e.type === 'unlock').map(e => e.type === 'unlock' ? e.triggers : []), [['key', 'cloth']]);
  const undone = undoEngineSession(result.session), view = visibleEngineState(undone.runtime, undone.state, undone.known);
  assert.equal(view[2].locked, true); assert.equal(view[2].canSource, false); assert.equal(view[2].canReceive, false);
  assert.deepEqual(view[2].colors, ['jade', 'jade', 'amber', 'amber']);
  assert.deepEqual(saveEngineSession(restoreEngineSession(puzzle, saveEngineSession(undone))), saveEngineSession(undone));
  const reset = resetEngineSession(undone); assert.deepEqual(reset.state, start.state); assert.deepEqual(reset.known, start.known);
});

test('revealing a true same-color unit stops at the old hidden boundary, knowledge follows stable identity through move/undo/recovery', () => {
  const puzzle = engineFixture('boundary', [['jade', 'coral', 'coral'], [], ['jade']], { hidden: [[0, 0], [0, 1]],
    goal: { type: 'collect', container: 'b1', color: 'jade', count: 2, exact: true, exclusive: true } });
  const start = createEngineSession(puzzle, 'reveal');
  assert.deepEqual(visibleEngineState(start.runtime, start.state, start.known)[0].colors, [null, null, 'coral']);
  const first = move(start, 0, 1); assert.equal(first.state.contents[1].length, 1); assert.ok(first.known.includes('u0_1'));
  assert.deepEqual(visibleEngineState(first.runtime, first.state, first.known)[0].colors, [null, 'coral']);
  const second = move(first, 0, 1); assert.deepEqual(second.state.contents[1], ['u0_2', 'u0_1']); assert.ok(second.known.includes('u0_0'));
  const undone = undoEngineSession(undoEngineSession(second));
  assert.deepEqual(undone.state, start.state); assert.equal(engineTransferAmount(undone.runtime, undone.state, undone.known, 0, 1), 2);
  assert.deepEqual(saveEngineSession(restoreEngineSession(puzzle, saveEngineSession(undone))), saveEngineSession(undone));
  const again = move(undone, 0, 1); assert.equal(again.state.contents[1].length, 2);
  assert.deepEqual(saveEngineSession(restoreEngineSession(puzzle, saveEngineSession(again))), saveEngineSession(again));
  assert.deepEqual(resetEngineSession(again).known, start.known);
});

test('invalid/stale actions leave state unchanged, corrupted history and definition rebinding reject', () => {
  const current = createEngineSession(ENGINE_EXAMPLES[3], 'validation'), saved = saveEngineSession(move(current, 0, 3));
  assert.equal(moveEngineSession(current, action(0, 3), 99), null);
  assert.deepEqual(transitionEngine(current.runtime, current.state, current.known, { ...action(0, 3), amount: 999 } as EngineAction), { accepted: false, reason: 'invalidAction' });
  assert.throws(() => restoreEngineSession(ENGINE_EXAMPLES[4], saved));
  assert.throws(() => restoreEngineSession(current.runtime.puzzle, { ...saved, state: { ...saved.state, contents: saved.state.contents.map((b, i) => i ? b : ['bogus']) } }));
  assert.throws(() => restoreEngineSession(current.runtime.puzzle, { ...saved, history: [{ ...saved.history[0], state: saved.state }] }));
  assert.deepEqual(current.state.contents[0], ['u0_0', 'u0_1', 'u0_2', 'u0_3']);
});

test('all internal fixtures have fully replayed proofs; state/time/memory exhaustion stays unknown', () => {
  for (const puzzle of ENGINE_EXAMPLES) {
    const start = createEngineSession(puzzle, 'proof'), result = solve(start);
    assert.equal(result.status, 'solved', puzzle.id); assert.ok(result.status === 'solved');
    const final = replayEngineRoute(start.runtime, start, result.route); assert.equal(evaluateEngineGoal(start.runtime, final.state), true);
  }
  const start = createEngineSession(ENGINE_EXAMPLES[0], 'limits');
  for (const options of [{ maxStates: 1 }, { maxEstimatedBytes: 1 }, { maxMilliseconds: .000001 }]) assert.equal(solve(start, options).status, 'unknown');
});

test('small complete state spaces independently match legacy legal moves and terminal results', () => {
  const level = parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'small', capacity: 2, colors: ['jade', 'coral'],
    bottles: [{ id: 'b0', layers: ['jade', 'coral'] }, { id: 'b1', layers: ['coral', 'jade'] }, { id: 'b2', layers: [] }] });
  const start = createEngineSession(classicSortingPuzzle(level), 'differential'), queue = [start], seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!, board = current.state.contents.map(b => b.map(u => current.runtime.unitColors.get(u)!)), key = JSON.stringify(board);
    if (seen.has(key)) continue; seen.add(key); invariant(current);
    assert.equal(evaluateEngineGoal(current.runtime, current.state), oracleSolved(board, 2));
    const expected = oracleMoves(board, 2);
    assert.deepEqual(getLegalPours(board, 2), expected);
    assert.deepEqual(listEngineActions(current.runtime, current.state, current.known), expected.map(p => action(p.source, p.target)));
    for (const pour of expected) {
      const next = transitionEngine(current.runtime, current.state, current.known, action(pour.source, pour.target)); assert.ok(next.accepted);
      assert.deepEqual(next.state.contents.map(b => b.map(u => current.runtime.unitColors.get(u)!)), oracleApply(board, pour));
      assert.deepEqual(applyPour(board, pour, 2), oracleApply(board, pour));
      if (!isSolved(board, 2)) queue.push(move(current, pour.source, pour.target));
    }
  }
  assert.equal(seen.size, 8);
});

test('one-step hints bind to revisions; bounded hidden-world checks never use the true assignment as a privileged answer', context => {
  const current = createEngineSession(ENGINE_EXAMPLES[3], 'hint'), task = createEngineHintTask(current, { maxMilliseconds: 10000 });
  let hint; do { hint = task.step(); } while (!hint);
  assert.equal(hint.status, 'hint'); assert.ok(hint.status === 'hint'); assert.equal(hint.revision, current.revision); assert.equal(hint.attempt, current.attempt);
  // Isolate the world-count boundary from host scheduling and concurrent native compilation.
  context.mock.method(performance, 'now', () => 0);
  const hidden = createEngineSession(ENGINE_EXAMPLES[2], 'hidden'), limited = createEngineHintTask(hidden, { maxWorlds: 1 });
  assert.deepEqual(limited.step(), { status: 'unknown', reason: 'information' });
  const cancelled = createEngineHintTask(hidden); assert.equal(cancelled.cancel().status, 'unknown');
  let time = 0; context.mock.method(performance, 'now', () => time += 5);
  assert.deepEqual(createEngineHintTask(hidden).step(), { status: 'unknown', reason: 'budget' });
});

test('unlock chains terminate, empty revealed bottles stay known behind restored locks', () => {
  const puzzle = engineFixture('chain', [['coral'], ['coral', 'coral', 'coral'], [], ['jade']], {
    locked: [2, 3], triggers: [
      { id: 'a', when: { type: 'empty', container: 'b0' }, unlock: ['b2'] },
      { id: 'b', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b3'] },
    ], goal: { type: 'collect', container: 'b2', color: 'jade', count: 1, exact: true, exclusive: true },
  });
  const start = createEngineSession(puzzle, 'empty-seen'), next = move(start, 0, 1);
  const restored = restoreEngineSession(puzzle, saveEngineSession(undoEngineSession(next)));
  assert.deepEqual(restored.state.open, [true, true, false, false]);
  assert.equal(visibleEngineState(restored.runtime, restored.state, restored.known, restored.seen)[2].count, 0);
  assert.equal(visibleEngineState(start.runtime, start.state, start.known, start.seen)[2].count, null);
  assert.equal(listEngineActions(restored.runtime, restored.state, restored.known).some(a => a.target === 'b2'), false);
});

test('explicit receiver color filters are independent from goal and preserve target-color reachability', () => {
  const start = createEngineSession(ENGINE_EXAMPLES[3], 'filter');
  assert.equal(moveEngineSession(start, action(4, 3)), null); // Amber cannot enter the coral collector.
  assert.ok(moveEngineSession(start, action(0, 3)));
  const relaxed = parseSortingPuzzle({ ...ENGINE_EXAMPLES[3], containers: ENGINE_EXAMPLES[3].containers.map((c, i) => i === 3 ? { ...c, acceptColors: null } : c) });
  assert.ok(moveEngineSession(createEngineSession(relaxed, 'no-filter'), action(4, 3)));
});

test('seeded mixed move/undo/reset/save sequences preserve determinism, inventory and knowledge', () => {
  let seed = 0x44beef;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (const puzzle of ENGINE_EXAMPLES) {
    let current = createEngineSession(puzzle, 'seeded');
    for (let i = 0; i < 250; i++) {
      const previousKnown = current.known, choice = random() % 20;
      if (!choice) { current = resetEngineSession(current); }
      else if (choice < 5 || current.status === 'solved') current = undoEngineSession(current);
      else {
        const legal = listEngineActions(current.runtime, current.state, current.known), action = legal[random() % legal.length];
        if (action) {
          const left = moveEngineSession(current, action), right = moveEngineSession(current, action);
          assert.deepEqual(left, right); assert.ok(left); current = left.session;
        }
      }
      invariant(current);
      if (choice) for (const unit of previousKnown) assert.ok(current.known.includes(unit));
      if (i % 25 === 0) {
        const restored = restoreEngineSession(puzzle, JSON.parse(JSON.stringify(saveEngineSession(current))));
        assert.deepEqual(saveEngineSession(restored), saveEngineSession(current)); assert.equal(restored.historyBytes, current.historyBytes); current = restored;
      }
    }
  }
});

test('long history trims a valid anchor, restores cooperatively and maintains byte accounting after undo and append', () => {
  const puzzle = engineFixture('long-history', [['coral'], [], ['jade']], { goal: { type: 'collect', container: 'b1', color: 'jade', count: 1, exact: true, exclusive: true } });
  let current = createEngineSession(puzzle, 'history');
  for (let i = 0; i < 4100; i++) current = move(current, i % 2, 1 - i % 2);
  assert.equal(current.history.length, 4096); assert.equal(current.offset, 4);
  current = restoreEngineSession(puzzle, saveEngineSession(current));
  assert.ok(current.historyBytes > 0);
  const expected = current.historyBytes - JSON.stringify(current.history.at(-1)).length;
  current = undoEngineSession(current); assert.equal(current.historyBytes, expected);
  current = move(current, 1, 0); assert.equal(current.history.length, 4096);
  assert.equal(current.historyBytes, current.history.reduce((total, frame) => total + JSON.stringify(frame).length, 0));
});

test('history byte ceiling trims before count ceiling for large stable IDs', () => {
  const base = engineFixture('large-history', [...Array.from({ length: 11 }, () => Array<string>(16).fill('coral')), [], []], {
    capacities: Array<number>(13).fill(16), goal: { type: 'collect', container: 'b12', color: 'coral', count: 16, exact: true, exclusive: true },
  });
  const ids = new Map(base.units.map((unit, i) => [unit.id, `unit_${String(i).padStart(58, '0')}`]));
  const puzzle = parseSortingPuzzle({ ...base, units: base.units.map(u => ({ ...u, id: ids.get(u.id) })), containers: base.containers.map(c => ({ ...c, units: c.units.map(u => ids.get(u)) })) });
  let current = createEngineSession(puzzle, 'byte-limit');
  for (let i = 0; i < 500; i++) current = move(current, i % 2 ? 11 : 0, i % 2 ? 0 : 11);
  assert.ok(current.offset > 0); assert.ok(current.history.length < 500); assert.ok(current.historyBytes <= 8 * 1024 * 1024);
  const restored = restoreEngineSession(puzzle, saveEngineSession(current));
  assert.deepEqual(saveEngineSession(restored), saveEngineSession(current)); assert.equal(restored.historyBytes, current.historyBytes);
});

test('composed goals allow empty remainder, exact/exclusive collection and sequence boundaries independently', () => {
  const puzzle = engineFixture('composed', [['coral'], ['jade'], []], { capacities: [2, 2, 3], any: [0, 1, 2],
    goal: { type: 'all', goals: [
      { type: 'collect', container: 'b2', color: 'coral', count: 1, exact: true, exclusive: false },
      { type: 'sequence', container: 'b2', colors: ['coral', 'jade'] },
      { type: 'sort', containers: ['b0', 'b1'] },
    ] },
  });
  let current = createEngineSession(puzzle, 'composed'); current = move(current, 0, 2); assert.equal(current.status, 'playing');
  current = move(current, 1, 2); assert.equal(current.status, 'solved');
  assert.equal(evaluateEngineGoal(current.runtime, current.state, { type: 'collect', container: 'b2', color: 'coral', count: 1, exact: true, exclusive: true }), false);
  assert.equal(evaluateEngineGoal(current.runtime, current.state, { type: 'sequence', container: 'b2', colors: ['jade', 'coral'] }), false);
});
