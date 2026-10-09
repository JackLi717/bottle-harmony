import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSession, moveSession } from '../src/game/session.ts';
import { createMemory, moveMemory, readyMemory, type MemoryPuzzle } from '../src/game/memory.ts';
import type { TutorialContent } from '../src/ui/tutorialDemonstration.ts';
import { tutorialDemonstration } from '../src/ui/tutorialDemonstration.ts';
import { isSolved } from '../src/game/rules.ts';

const classic: TutorialContent = JSON.parse(readFileSync(new URL('../assets/levels/mainline-play.json', import.meta.url), 'utf8')).entries[0];
const memory: MemoryPuzzle = JSON.parse(readFileSync(new URL('../assets/levels/memory-100.json', import.meta.url), 'utf8')).records[0];

test('classic demonstration taps the correct source and target then legally solves the packaged first level', () => {
  const before = JSON.stringify(classic), beats = tutorialDemonstration(classic);
  let session = createSession(classic.level), move = 0;
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (beat.kind !== 'pour') continue;
    const expected = classic.solution[move++];
    assert.deepEqual(beats[i - 3].picture.board, session.board);
    assert.equal(beats[i - 3].hand, expected.source);
    assert.equal(beats[i - 3].selected, expected.source);
    assert.equal(beats[i - 1].hand, expected.target);
    assert.equal(beats[i - 1].selected, expected.source);
    const accepted = moveSession(session, expected.source, expected.target)!;
    assert.deepEqual(beat.pour, accepted.event.pour);
    assert.deepEqual(beat.resting.board, accepted.session.board);
    assert.deepEqual(beat.picture.board[expected.source], session.board[expected.source]);
    assert.equal(beat.picture.board[expected.target].length, session.board[expected.target].length + expected.amount);
    session = accepted.session;
  }
  assert.equal(move, 5);
  assert.equal(session.status, 'solved');
  assert.ok(isSolved(beats.at(-1)!.picture.board, 4));
  assert.equal(beats.at(-1)!.kind, 'done');
  assert.equal(JSON.stringify(classic), before);
});

test('memory demonstration marks, hides, transports and reveals the same liquid units only at the answer', () => {
  const content = { level: memory.level, solution: memory.solution, memory };
  const before = JSON.stringify(content), beats = tutorialDemonstration(content);
  assert.equal(beats[0].kind, 'observe');
  assert.equal(beats[0].picture.marked.flat().filter(Boolean).length, memory.masks.length);
  assert.equal(beats[0].picture.hidden.flat().filter(Boolean).length, 0);
  assert.equal(beats[2].kind, 'readyTap');
  assert.equal(beats[3].kind, 'hide');
  assert.equal(beats[3].picture.hidden.flat().filter(Boolean).length, memory.masks.length);
  let session = readyMemory(createMemory(memory));
  for (const beat of beats.filter(b => b.kind === 'pour')) {
    const p = beat.pour!, black = session.revealed[session.units[p.source].at(-1)!] < 0;
    assert.equal(beat.hiddenPour, black);
    if (black) assert.equal(p.amount, 1);
    const accepted = moveMemory(session, p.source, p.target)!;
    assert.deepEqual(accepted.event.pour, p);
    assert.equal(beat.picture.hidden.flat().filter(Boolean).length, memory.masks.length + (black ? 1 : 0));
    assert.deepEqual(beat.resting.board, accepted.session.game.board);
    session = accepted.session;
  }
  assert.equal(session.judgement, 'correct');
  const reveal = beats.findIndex(b => b.kind === 'reveal');
  assert.equal(beats[reveal - 1].kind, 'pour');
  assert.equal(beats[reveal].picture.reveals.flat().filter(Boolean).length, memory.masks.length);
  assert.ok(isSolved(beats[reveal].picture.board, 4));
  assert.equal(beats.at(-1)!.picture.reveals.flat().filter(Boolean).length, 0);
  assert.equal(JSON.stringify(content), before);
  assert.deepEqual(tutorialDemonstration(content), beats);
});

test('demonstrations reject invalid or incomplete solutions instead of displaying a fake success', () => {
  assert.throws(() => tutorialDemonstration({ ...classic, solution: classic.solution.slice(0, -1) }), /Incomplete/);
  assert.throws(() => tutorialDemonstration({ ...classic, solution: [{ ...classic.solution[0], amount: 99 }] }), /Invalid/);
  assert.throws(() => tutorialDemonstration({ level: memory.level, memory, solution: memory.solution.slice(0, -1) }), /Incomplete/);
});
