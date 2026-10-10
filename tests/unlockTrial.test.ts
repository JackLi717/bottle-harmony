import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { UNLOCK_TRIAL, nextUnlockTrialIndex } from '../src/game/unlockTrial.ts';
import { createEngineSession, moveEngineSession, resetEngineSession, undoEngineSession, saveEngineSession, restoreEngineSession,
  listEngineActions, compileSortingPuzzle, type EngineAction } from '../src/game/engine.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { auditUnlockTrial, unlockTrialStructure } from '../scripts/lib/unlockTrialAudit.ts';

const evidence = JSON.parse(readFileSync(new URL('../assets/levels/unlock-trial-evidence.json',import.meta.url),'utf8')) as {
  definitionSha256: string; route: EngineAction[]; states: number; deadEnds: number; firedSets: string[]; simultaneous: string[];
  stages: { step: number; triggers: string[]; opened: string[] }[]; participatingLocked: string[];
}[];

test('twelve fixed classic trials independently replay all transfers, hidden boundaries and unlocks', () => {
  assert.equal(UNLOCK_TRIAL.length,12); assert.equal(evidence.length,12);
  for (const [i,{ puzzle }] of UNLOCK_TRIAL.entries()) {
    assert.equal(evidence[i].definitionSha256,createHash('sha256').update(JSON.stringify(puzzle)).digest('hex'));
    assert.equal(evidence[i].deadEnds,0); assert.ok(evidence[i].states > 0);
    assert.ok(puzzle.containers.length >= 4 && puzzle.containers.length <= 12);
    assert.ok(puzzle.containers.every(c => c.capacity === 4 && c.canSource && c.canReceive && c.receive === 'same' && !c.fixed));
    for (const color of puzzle.colors) assert.equal(puzzle.units.filter(u => u.color === color).length,4);
    assert.deepEqual(puzzle.goal,{ type: 'sort', containers: puzzle.containers.map(c => c.id) });
    let session = createEngineSession(puzzle,`test-${i}`);
    const colors = new Map(puzzle.units.map(u => [u.id,u.color])), hidden = new Set(puzzle.hidden);
    let contents = puzzle.containers.map(c => [...c.units]);
    const open = puzzle.containers.map(c => !puzzle.locked.includes(c.id)), known = new Set<string>(), fired = new Set<string>();
    function settle() {
      let changed: boolean;
      do {
        changed = false;
        contents.forEach((units,b) => { if (open[b]) units.forEach((u,d) => { if (!hidden.has(u) || d === units.length - 1) known.add(u); }); });
        const pending = puzzle.triggers.filter(t => !fired.has(t.id) && (t.when.type === 'empty'
          ? open[Number(t.when.container.slice(1))] && !contents[Number(t.when.container.slice(1))].length
          : contents.some((units,b) => open[b] && units.length === 4 && units.every(u => colors.get(u) === (t.when.type === 'color-full' ? t.when.color : '')))));
        for (const trigger of pending) { fired.add(trigger.id); for (const id of trigger.unlock) open[Number(id.slice(1))] = true; changed = true; }
      } while (changed);
    }
    settle();
    for (const action of evidence[i].route) {
      const source = Number(action.source.slice(1)), target = Number(action.target.slice(1));
      const from = contents[source], to = contents[target], color = colors.get(from.at(-1)!);
      assert.ok(open[source] && open[target] && from.length && known.has(from.at(-1)!));
      assert.ok(!to.length || colors.get(to.at(-1)!) === color);
      let amount = 0;
      while (amount < from.length && amount < 4 - to.length && known.has(from[from.length - amount - 1]) && colors.get(from[from.length - amount - 1]) === color) amount++;
      assert.ok(amount > 0);
      const moved = from.slice(-amount);
      contents = contents.map((units,b) => b === source ? units.slice(0,-amount) : b === target ? [...units,...moved] : units);
      settle();
      const result = moveEngineSession(session,action); assert.ok(result); session = result.session;
      assert.deepEqual(session.state.contents,contents); assert.deepEqual(session.state.open,open);
      assert.deepEqual(new Set(session.state.fired),fired); assert.deepEqual(new Set(session.known),known);
      // Current public move legality is independent of any still-hidden true colors.
      const unknown = puzzle.units.filter(u => !session.known.includes(u.id));
      if (unknown.length > 1) {
        const recolored = compileSortingPuzzle({ ...puzzle, units: puzzle.units.map(u => {
          const n = unknown.findIndex(v => v.id === u.id);
          return n < 0 ? u : { ...u, color: unknown[(n + 1) % unknown.length].color };
        }) });
        assert.deepEqual(listEngineActions(recolored,session.state,session.known),listEngineActions(session.runtime,session.state,session.known));
      }
      assert.deepEqual(saveEngineSession(restoreEngineSession(puzzle,saveEngineSession(session))),saveEngineSession(session));
    }
    assert.equal(session.status,'solved');
    assert.ok(contents.every(units => !units.length || units.length === 4 && units.every(u => colors.get(u) === colors.get(units[0]))));
    assert.notEqual(undoEngineSession(session).status,'solved');
    assert.deepEqual(saveEngineSession(resetEngineSession(session)).state,createEngineSession(puzzle,'initial').state);
  }
});

test('branch evidence covers both color orders, both chains and same-move trigger delivery', () => {
  assert.ok(evidence[5].firedSets.includes('cover-a')); assert.ok(evidence[5].firedSets.includes('cover-b'));
  assert.ok(evidence[8].simultaneous.includes('cover-a,key-a'));
  assert.equal(evidence[8].stages[0].triggers.length,2);
  for (const i of [6,9,11]) assert.equal(evidence[i].stages.length,2);
  for (const i of [1,2,4,5,6,8,9,10,11]) assert.ok(evidence[i].participatingLocked.length > 0);
  assert.ok(evidence[11].route.length > evidence[10].route.length);
});

test('continuous internal progression ends at twelve, requires completion and has no player state', () => {
  for (let i = 0; i < 12; i++) {
    assert.equal(nextUnlockTrialIndex(i,false),null);
    assert.equal(nextUnlockTrialIndex(i,true),i < 11 ? i + 1 : null);
  }
  for (const i of [-1,12,NaN,0.5]) assert.equal(nextUnlockTrialIndex(i,true),null);
});

test('content audit reports unknown budgets and catches design dead ends, rather than accepting a single route', () => {
  assert.equal(auditUnlockTrial(UNLOCK_TRIAL[0].puzzle,1).status,'unknown');
  const bad = engineFixture('insufficient-stage-space', [['coral','jade','coral'],['jade','coral','jade'],[],['amber','coral','amber','azure'],['amber','jade'],['azure','amber','azure','azure']],
    { locked: [3,4,5], triggers: [{ id: 'a',when: { type: 'empty',container: 'b0' },unlock: ['b3','b4'] },{ id: 'b',when: { type: 'empty',container: 'b4' },unlock: ['b5'] }] });
  const report = auditUnlockTrial(bad);
  assert.equal(report.status,'complete'); if (report.status === 'complete') { assert.ok(report.route.length); assert.ok(report.deadEnds > 0); }
});

test('exact trial structure ignores bottle positions, IDs and color names but retains disclosure and mappings', () => {
  const puzzle = UNLOCK_TRIAL[1].puzzle, order = [5,2,4,0,3,1];
  const renamed = { ...puzzle, colors: puzzle.colors.map(c => 'x' + c), units: puzzle.units.map(u => ({ id: 'z' + u.id,color: 'x' + u.color })),
    containers: order.map(i => ({ ...puzzle.containers[i],id: 'z' + puzzle.containers[i].id,units: puzzle.containers[i].units.map(u => 'z' + u) })),
    locked: puzzle.locked.map(id => 'z' + id), hidden: puzzle.hidden.map(id => 'z' + id),
    goal: { type: 'sort' as const,containers: puzzle.containers.map(c => 'z' + c.id) },
    triggers: puzzle.triggers.map(t => ({ id: 'z' + t.id,unlock: t.unlock.map(id => 'z' + id),
      when: t.when.type === 'color-full' ? { ...t.when,color: 'x' + t.when.color } : { ...t.when,container: 'z' + t.when.container } })) };
  assert.equal(unlockTrialStructure(puzzle),unlockTrialStructure(renamed));
  assert.notEqual(unlockTrialStructure(puzzle),unlockTrialStructure({ ...puzzle,hidden: [puzzle.units[0].id] }));
});
