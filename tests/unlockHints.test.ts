import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { generatedPostKeyTrials } from '../src/game/unlockGenerated.ts';
import { createEngineSession, listEngineActions, moveEngineSession, resetEngineSession, transitionEngine, undoEngineSession } from '../src/game/engine.ts';
import { singleKeyTableHint, singleKeyHintKey, singleKeyHintRecoverySteps } from '../src/game/unlockHints.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';
import { sha256 } from '../scripts/lib/unlockRatingEvidence.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { proveSingleKeyDisclosure, PUBLIC_DISCLOSURE_BUDGET } from '../scripts/lib/unlockPublicDisclosure.ts';

const bank = JSON.parse(readFileSync(new URL('../assets/levels/unlock-post-key-20.json', import.meta.url), 'utf8'));
const hints = JSON.parse(readFileSync(new URL('../assets/levels/unlock-post-key-hints.json', import.meta.url), 'utf8'));
const trials = generatedPostKeyTrials(bank, hints);

test('hint safety accepts a possible world that completes before opening; stage acceptance remains unchanged', () => {
  const puzzle = engineFixture('hint-early-completion', [['coral'], ['coral', 'coral', 'coral'], ['jade', 'jade', 'jade', 'jade'], [], ['amber', 'amber'], ['amber', 'amber']], {
    locked: [4, 5], triggers: [{ id: 'key', when: { type: 'empty', container: 'b2' }, unlock: ['b4', 'b5'] }],
  });
  const route = [{ type: 'transfer', source: 'b0', target: 'b1' }, { type: 'transfer', source: 'b2', target: 'b3' }, { type: 'transfer', source: 'b4', target: 'b5' }] as const;
  const strict = proveSingleKeyDisclosure(puzzle, route);
  assert.equal(strict.status, 'fail'); assert.equal(strict.reason, 'public-preparation-mismatch');
  const hint = proveSingleKeyDisclosure(puzzle, route, PUBLIC_DISCLOSURE_BUDGET, true);
  assert.equal(hint.status, 'pass'); assert.equal(hint.worlds.length, 5);
  assert.deepEqual(proveSingleKeyDisclosure(puzzle, route), strict);
});

test('all twenty trials can be completed by repeated public-safe hints, including undo and reset', () => {
  const { evidenceSha256, ...payload } = hints; assert.equal(evidenceSha256, sha256(payload));
  for (const trial of trials) {
    let session = createEngineSession(trial.puzzle, 'hint-test'), moves = 0;
    const initial = session;
    while (session.status !== 'solved') {
      const result = singleKeyTableHint(session, trial.hints!); assert.equal(result.status, 'hint'); assert.ok(result.status === 'hint');
      assert.equal(result.binding, session.runtime.binding); assert.equal(result.revision, session.revision); assert.equal(result.attempt, session.attempt);
      const moved = moveEngineSession(session, result.action); assert.ok(moved); session = moved.session;
      const undo = undoEngineSession(session), undoneHint = singleKeyTableHint(undo, trial.hints!);
      assert.equal(undoneHint.status, 'hint');
      assert.ok(++moves < 100);
    }
    const reset = resetEngineSession(session);
    assert.deepEqual(reset.state, initial.state); assert.equal(singleKeyTableHint(reset, trial.hints!).status, 'hint');
    assert.equal(singleKeyTableHint(session, trial.hints!).status, 'complete');
  }
});

test('complete tables cover every reachable state, including deviations, dead ends and remembered locks', () => {
  let states = 0, information = 0, deadEnds = 0;
  for (const trial of trials) {
    const graph = buildRatingGraph(trial.puzzle); assert.ok(graph.status === 'complete');
    const fresh = createEngineSession(trial.puzzle, 'all-states'), key = singleKeyHintKey(fresh.runtime);
    assert.equal(Object.keys(trial.hints!.states).length, graph.nodes.length);
    for (const [i, node] of graph.nodes.entries()) {
      states++;
      const current = { ...fresh, ...node.frame, seen: trial.puzzle.containers.filter((_, j) => node.frame.state.open[j]).map(c => c.id) };
      const row = trial.hints!.states[key(current.state)];
      assert.equal(row[0], Number.isFinite(graph.distances[i]) ? graph.distances[i] : -1);
      const result = singleKeyTableHint(current, trial.hints!);
      if (result.status === 'hint') {
        const next = moveEngineSession(current, result.action); assert.ok(next);
        const column = current.state.open.every(Boolean) ? 0 : 1;
        assert.equal(trial.hints!.states[key(next.session.state)][column], row[column] - 1);
      } else if (result.status === 'unsolvable') { deadEnds++; assert.equal(row[0], -1); }
      else if (result.status === 'unknown') { information++; assert.ok(row[0] > 0); assert.equal(row[1], -1); assert.equal(result.reason, 'information'); }
      else assert.equal(row[0], 0);
      // Undo can remember the entire locked inventory. Then true-layout proof is sufficient.
      if (row[0] > 0) assert.equal(singleKeyTableHint({ ...current, known: trial.puzzle.units.map(u => u.id), seen: trial.puzzle.containers.map(c => c.id) }, trial.hints!).status, 'hint');
    }
    const bad = graph.nodes.findIndex(n => trial.hints!.states[key(n.frame.state)][1] < 0);
    if (bad >= 0) {
      const chain = [bad];
      for (let i = bad; graph.nodes[i].parent >= 0;) { i = graph.nodes[i].parent; chain.push(i); }
      let played = fresh;
      for (const i of chain.reverse().slice(1)) {
        const action = listEngineActions(played.runtime, played.state, played.known).find(a => {
          const next = transitionEngine(played.runtime, played.state, played.known, a);
          return next.accepted && key(next.state) === key(graph.nodes[i].frame.state);
        });
        assert.ok(action); played = moveEngineSession(played, action)!.session;
      }
      const steps = singleKeyHintRecoverySteps(played, trial.hints!); assert.ok(steps && steps > 0);
      for (let i = 0; i < steps; i++) played = undoEngineSession(played);
      assert.equal(singleKeyTableHint(played, trial.hints!).status, 'hint');
    }
  }
  assert.ok(states > 10000); assert.ok(deadEnds > 0); assert.equal(information, 0, 'Every solvable concealed state in this batch has a safe hint');
});

test('hint tables reject another bank, changed puzzle, malformed distances and omitted entries', () => {
  const change = () => structuredClone(hints);
  const wrong = change(); wrong.bankEvidenceSha256 = '0'.repeat(64); assert.throws(() => generatedPostKeyTrials(bank, wrong));
  const missing = change(); delete missing.tables[bank.entries[0].puzzle.id]; assert.throws(() => generatedPostKeyTrials(bank, missing));
  const changed = change(); changed.tables[bank.entries[0].puzzle.id].binding += ' '; assert.throws(() => generatedPostKeyTrials(bank, changed));
  const malformed = change(); malformed.tables[bank.entries[0].puzzle.id].states.bad = [NaN, 0]; assert.throws(() => generatedPostKeyTrials(bank, malformed));
  const current = createEngineSession(trials[0].puzzle, 'wrong-puzzle');
  assert.throws(() => singleKeyTableHint(current, trials[1].hints!));
});
