import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { UNLOCK_BASELINE, UNLOCK_BASELINE_PAIRS } from '../src/game/unlockBaseline.ts';
import { nextUnlockTrialIndex } from '../src/game/unlockTrial.ts';
import { compileSortingPuzzle, createEngineSession, initialEngineState, moveEngineSession, resetEngineSession, undoEngineSession, visibleEngineState } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { auditBaselineDisclosure, auditUnlockBaselines } from '../scripts/lib/unlockBaselineAudit.ts';
import { engineFixture } from '../src/game/engineExamples.ts';
import { buildRatingGraph } from '../scripts/lib/unlockRatingGraph.ts';

const catalog = JSON.parse(readFileSync(new URL('../assets/levels/mainline-catalog.json',import.meta.url),'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../assets/levels/unlock-baseline-evidence.json',import.meta.url),'utf8')) as {
  pairs: ReturnType<typeof auditUnlockBaselines>;
};

test('six baseline trials bind to reconstructed classics with independently recomputed scores and complete stage evidence', () => {
  const recomputed = auditUnlockBaselines(catalog.records);
  assert.deepEqual(recomputed,evidence.pairs);
  assert.equal(UNLOCK_BASELINE.length,6);
  assert.deepEqual(recomputed.map(p => p.classicHuman.score!.total),[49,50,51]);
  assert.equal(new Set(recomputed.flatMap(p => p.variants.map(v => v.structureSha256))).size,6);
  // Classic-style wrong choices are allowed here, and must remain visible in evidence.
  assert.ok(recomputed.every(p => p.variants.every(v => v.deadEnds > 0)));
  for (const [i,pair] of UNLOCK_BASELINE_PAIRS.entries()) {
    const classic = UNLOCK_BASELINE[i * 2].puzzle, key = UNLOCK_BASELINE[i * 2 + 1].puzzle;
    assert.deepEqual(classic.containers,key.containers); assert.deepEqual(classic.units,key.units);
    assert.deepEqual(classic.hidden,key.hidden); assert.equal(key.hidden.length,0);
    assert.equal(classic.locked.length,0); assert.deepEqual(key.locked,[`b${pair.locked}`]);
    assert.deepEqual(key.triggers,[{id:'key-a',when:{type:'empty',container:`b${pair.key}`},unlock:[`b${pair.locked}`]}]);
    assert.equal(key.containers[pair.locked].units.length,4); // Never an extra empty reward.
    const report = recomputed[i].variants[1]; assert.equal(report.triggers[0].mandatory,true);
    assert.equal(report.disclosure!.worlds.length,12);
    assert.equal('score' in report,false); // The key overlay never inherits the base rating.
  }
});

test('all six routes finish; opening, undo knowledge and reset retain existing engine semantics', () => {
  for (const [i,entry] of UNLOCK_BASELINE.entries()) {
    const report = evidence.pairs[Math.floor(i / 2)].variants[i % 2];
    assert.equal(createHash('sha256').update(JSON.stringify(entry.puzzle)).digest('hex'),report.definitionSha256);
    let session = createEngineSession(entry.puzzle,'baseline-test');
    for (const action of report.route) {
      const previous = session, moved = moveEngineSession(session,action); assert.ok(moved); session = moved.session;
      if (session.state.fired.length > previous.state.fired.length) {
        const undone = undoEngineSession(session); assert.deepEqual(undone.state,previous.state);
        const relocked = visibleEngineState(undone.runtime,undone.state,undone.known,undone.seen);
        assert.ok(relocked.some(c => c.locked && c.colors.length === 4));
        assert.ok(session.known.every(u => undone.known.includes(u)));
      }
    }
    assert.equal(session.status,'solved');
    const reset = resetEngineSession(session), fresh = createEngineSession(entry.puzzle,'fresh');
    assert.deepEqual(reset.state,fresh.state); assert.deepEqual(reset.known,fresh.known);
    assert.equal(nextUnlockTrialIndex(i,true,6),i < 5 ? i + 1 : null);
    assert.equal(nextUnlockTrialIndex(i,false,6),null);
  }
});

test('disclosure certificates replay the same preparation and all twelve adaptive continuations per key', () => {
  for (const [i,pair] of evidence.pairs.entries()) {
    const puzzle = UNLOCK_BASELINE[i * 2 + 1].puzzle, proof = pair.variants[1].disclosure!;
    const locked = puzzle.containers.find(c => c.id === puzzle.locked[0])!;
    const truths = new Set<string>();
    for (const world of proof.worlds) {
      const colors = new Map(locked.units.map((u,j) => [u,world.order[j]]));
      const runtime = compileSortingPuzzle({...puzzle,units:puzzle.units.map(u => ({...u,color:colors.get(u.id) ?? u.color}))});
      replayEngineRoute(runtime,initialEngineState(runtime),[...proof.prefix,...world.continuation]);
      truths.add(JSON.stringify(world.order));
    }
    assert.equal(truths.size,12);
  }
});

test('a solvable true layout is rejected when its public preparation strands another possible hidden order', () => {
  const record = catalog.records.find((r: {number:number}) => r.number === 635);
  const puzzle = engineFixture('unsafe-hidden-order',record.content.level.bottles.map((b: {layers:string[]}) => b.layers),
    {locked:[4],triggers:[{id:'key-a',when:{type:'empty',container:'b0'},unlock:['b4']}]});
  const graph = buildRatingGraph(puzzle);
  assert.equal(graph.status,'complete'); if (graph.status !== 'complete') return;
  assert.notEqual(graph.shortestMoves,null); // Full truth alone would have admitted it.
  assert.throws(() => auditBaselineDisclosure(puzzle,graph.route),/Unknown or unsolvable hidden world/);
});
