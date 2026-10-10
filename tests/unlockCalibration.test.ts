import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { UNLOCK_CALIBRATION } from '../src/game/unlockCalibration.ts';
import { nextUnlockTrialIndex } from '../src/game/unlockTrial.ts';
import { createEngineSession, moveEngineSession, resetEngineSession, undoEngineSession, visibleEngineState } from '../src/game/engine.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { reconstructCalibrationBoard } from '../scripts/lib/unlockCalibrationSource.ts';
import { auditUnlockStages } from '../scripts/lib/unlockStageAudit.ts';

type CompleteAudit = Extract<ReturnType<typeof auditUnlockStages>, { status: 'complete' }>;
const evidence = JSON.parse(readFileSync(new URL('../assets/levels/unlock-calibration-evidence.json',import.meta.url),'utf8')) as (CompleteAudit & {
  puzzle: string; definitionSha256: string; structureSha256: string;
})[];

test('eight frozen calibration boards reconstruct, conserve inventory and replay with reversible milestones', () => {
  assert.equal(UNLOCK_CALIBRATION.length,8); assert.equal(evidence.length,8);
  assert.equal(new Set(evidence.map(r => r.structureSha256)).size,8);
  for (const [i,entry] of UNLOCK_CALIBRATION.entries()) {
    const { puzzle } = entry, report = evidence[i], colors = new Map(puzzle.units.map(u => [u.id,u.color]));
    assert.equal(report.puzzle,puzzle.id);
    assert.equal(report.definitionSha256,createHash('sha256').update(JSON.stringify(puzzle)).digest('hex'));
    assert.deepEqual(puzzle.containers.map(c => c.units.map(u => colors.get(u))),reconstructCalibrationBoard(entry));
    for (const color of puzzle.colors) assert.equal(puzzle.units.filter(u => u.color === color).length,4);
    assert.ok(puzzle.containers.length <= 8); assert.ok(puzzle.containers.every(c => c.capacity === 4 && c.canSource && c.canReceive && c.receive === 'same'));
    assert.equal(report.deadEnds,0); assert.equal(report.route.length,report.shortestMoves);
    assert.ok(report.triggers.every(t => t.mandatory && t.solvedWithoutMilestone === 0));
    let session = createEngineSession(puzzle,'calibration-test');
    for (const action of report.route) {
      const previous = session, result = moveEngineSession(session,action); assert.ok(result); session = result.session;
      assert.deepEqual([...session.state.contents.flat()].sort(),puzzle.units.map(u => u.id).sort());
      if (session.state.fired.length > previous.state.fired.length) {
        const undone = undoEngineSession(session);
        assert.deepEqual(undone.state,previous.state);
        assert.ok(session.known.every(u => undone.known.includes(u)));
        const relocked = visibleEngineState(undone.runtime,undone.state,undone.known,undone.seen);
        assert.ok(relocked.some(c => c.locked && c.count !== null));
      }
    }
    assert.equal(session.status,'solved');
    assert.deepEqual(resetEngineSession(session).state,createEngineSession(puzzle,'reset').state);
    assert.deepEqual(resetEngineSession(session).known,createEngineSession(puzzle,'reset').known);
  }
});

test('controlled pairs change only receiving margin or disclosure, with a bounded eight-puzzle ending', () => {
  for (const i of [0,2,4]) {
    const a = UNLOCK_CALIBRATION[i].puzzle, b = UNLOCK_CALIBRATION[i + 1].puzzle;
    assert.equal(b.containers.length,a.containers.length + 1);
    assert.deepEqual(b.containers.slice(0,-1),a.containers); assert.equal(b.containers.at(-1)!.units.length,0);
    assert.deepEqual(b.units,a.units); assert.deepEqual(b.triggers,a.triggers); assert.deepEqual(b.locked,a.locked);
  }
  assert.deepEqual(UNLOCK_CALIBRATION[6].puzzle.containers,UNLOCK_CALIBRATION[7].puzzle.containers);
  assert.deepEqual(UNLOCK_CALIBRATION[6].puzzle.units,UNLOCK_CALIBRATION[7].puzzle.units);
  assert.equal(UNLOCK_CALIBRATION[6].puzzle.hidden.length,0); assert.equal(UNLOCK_CALIBRATION[7].puzzle.hidden.length,8);
  for (let i = 0; i < 8; i++) {
    assert.equal(nextUnlockTrialIndex(i,true,8),i < 7 ? i + 1 : null);
    assert.equal(nextUnlockTrialIndex(i,false,8),null);
  }
  for (const length of [NaN,-1,0,0.5]) assert.equal(nextUnlockTrialIndex(0,true,length),null);
});

test('stage audit independently proves key necessity and preserves before/after facts without assigning difficulty', () => {
  const report = auditUnlockStages(UNLOCK_CALIBRATION[0].puzzle);
  assert.equal(report.status,'complete'); if (report.status !== 'complete') return;
  assert.deepEqual(report.triggers,evidence[0].triggers);
  assert.deepEqual(report.route,evidence[0].route);
  assert.equal(report.triggers[0].minimumMovesToMilestone,7);
  assert.deepEqual(report.triggers[0].shortestCrossings.map(c => [c.before,c.after]),[[8,10]]);
  assert.ok(report.triggers[0].before.observations > 0); assert.ok(report.triggers[0].after.observations > 0);
  assert.equal('score' in report,false);
  assert.equal(auditUnlockStages(UNLOCK_CALIBRATION[0].puzzle,1).status,'unknown');
  const optional = engineFixture('already-sorted-locked-group', [['coral','coral','coral','coral'],['jade','jade','jade','jade'],[],[]],
    {locked:[1],triggers:[{id:'optional',when:{type:'empty',container:'b0'},unlock:['b1']}]});
  const bypass = auditUnlockStages(optional);
  assert.equal(bypass.status,'complete'); if (bypass.status === 'complete') {
    assert.equal(bypass.triggers[0].mandatory,false); assert.equal(bypass.triggers[0].solvedWithoutMilestone,1);
  }
});
