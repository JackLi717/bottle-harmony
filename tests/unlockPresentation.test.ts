import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineSession, moveEngineSession, resetEngineSession, undoEngineSession, visibleEngineState } from '../src/game/engine.ts';
import { engineFixture, ENGINE_EXAMPLES } from '../src/game/engineExamples.ts';
import { unlockArtExample } from '../src/game/unlockArtExamples.ts';
import { CLASSIC_UNKNOWN_FILL, COVER_FAMILIES, coverGroups, coverPose, pourPresentation, revealOpacity, UNIT_REVEAL_MS, UNLOCK_DURATION_MS } from '../src/art/unlockPresentation.ts';
import { boardLayout } from '../src/ui/boardLayout.ts';
import { FLOW_END, POUR_DURATION_MS } from '../src/art/pourGeometry.ts';
import { VESSELS } from '../src/art/vesselDesigns.ts';
import { liquidFrame } from '../src/art/liquidPresentation.ts';
import { LIQUIDS } from '../src/art/palette.ts';
const visible = (s: ReturnType<typeof createEngineSession>) => visibleEngineState(s.runtime, s.state, s.known, s.seen);

test('every one/two/three-bottle sample opens atomically with either condition; undo keeps contents visible and reset covers again', () => {
  for (const count of [1,2,3] as const) for (const condition of ['key','color'] as const) for (const family of COVER_FAMILIES) {
    const initial = createEngineSession(unlockArtExample(count, condition), 'art');
    assert.ok(initial.runtime.puzzle.colors.every(color => LIQUIDS[color]), 'All sample colors must have renderer materials');
    const before = visible(initial), layout = boardLayout(12);
    const closed = coverGroups(initial.runtime.puzzle, before, null, layout.positions, family);
    assert.equal(closed.length, family === 'cloth' ? count : 1);
    assert.ok(closed.every(g => g.state === 'closed'));
    const result = moveEngineSession(initial, { type: 'transfer', source: 'b0', target: 'b1' })!;
    assert.ok(result); assert.equal(result.events.filter(e => e.type === 'unlock').length, 1);
    const after = visible(result.session);
    const opening = coverGroups(initial.runtime.puzzle, after, before, layout.positions, family);
    assert.equal(opening.length, closed.length); assert.ok(opening.every(g => g.state === 'opening'));
    assert.deepEqual(opening.map(g => g.indices), closed.map(g => g.indices));
    assert.deepEqual(coverGroups(initial.runtime.puzzle, after, null, layout.positions, family), []);
    const undone = undoEngineSession(result.session), relocked = coverGroups(initial.runtime.puzzle, visible(undone), null, layout.positions, family);
    assert.equal(relocked.length, count); assert.ok(relocked.every(g => g.state === 'relocked'));
    for (const i of closed.flatMap(g => g.indices)) {
      assert.equal(visible(undone)[i].locked, true); assert.ok(visible(undone)[i].colors.every(c => c !== null));
    }
    assert.deepEqual(coverGroups(initial.runtime.puzzle, visible(resetEngineSession(undone)), null, layout.positions, family), closed);
  }
});

test('cross-row, nonadjacent, differing conditions and mixed knowledge never become a shared opaque shell', () => {
  const p = engineFixture('split', [['coral'], ['coral','coral','coral'], [], [], [], []], { locked: [2,3,5], triggers: [
    { id: 'a', when: { type: 'empty', container: 'b0' }, unlock: ['b2','b3'] },
    { id: 'b', when: { type: 'color-full', color: 'coral', count: 4 }, unlock: ['b5'] },
  ]});
  const s = createEngineSession(p, 'split'), v = visible(s), positions = boardLayout(6).positions;
  for (const family of COVER_FAMILIES) {
    const groups = coverGroups(p, v, null, positions, family);
    assert.equal(groups.length, 3); assert.deepEqual(groups.map(g => g.indices), [[2],[3],[5]]);
    const mixed = v.map((c,i) => i === 3 ? { ...c, count: 0, colors: [] } : c);
    assert.equal(coverGroups(p, mixed, null, positions, family).find(g => g.indices.includes(3))?.state, 'relocked');
  }
});

test('all 4–12 bottle covers remain within screen slots for every vessel and do not depend on hidden liquid inventory', () => {
  for (let count = 4; count <= 12; count++) {
    const board: string[][] = Array.from({length: count}, () => []); board[0] = ['coral']; board[1] = ['coral','coral','coral'];
    const p = engineFixture('bounds', board, { locked: Array.from({length: count - 2}, (_, i) => i + 2),
      triggers: [{ id: 'key', when: {type: 'empty', container: 'b0'}, unlock: Array.from({length: count - 2}, (_,i) => 'b' + (i + 2)) }] });
    const s = createEngineSession(p, 'bounds'), v = visible(s), layout = boardLayout(count);
    for (const family of COVER_FAMILIES) {
      const groups = coverGroups(p, v, null, layout.positions, family);
      assert.deepEqual(groups.flatMap(g => g.indices), Array.from({length: count - 2}, (_,i) => i + 2));
      for (const g of groups) {
        assert.ok(g.x >= 0 && g.x + g.width <= layout.width + .000001);
        assert.ok(g.height + g.y < layout.positions[g.indices[0]].y + 180);
        assert.ok(g.indices.length <= (family === 'cloth' ? 1 : 3));
        assert.ok(g.indices.every(i => layout.positions[i].y === layout.positions[g.indices[0]].y));
      }
      assert.deepEqual(coverGroups(p, v.map(c => c.count === null ? {...c, colors: [null,null,null]} : c), null, layout.positions, family), groups);
      for (const vessel of VESSELS) assert.ok(Math.max(...vessel.interior.map(p => p.x)) - Math.min(...vessel.interior.map(p => p.x)) <= 64);
    }
  }
});

test('cover and unit disclosure wait for flow end, finish during the existing return, remain finite and monotone', () => {
  assert.ok(UNLOCK_DURATION_MS < (1 - FLOW_END) * POUR_DURATION_MS);
  assert.ok(UNIT_REVEAL_MS < UNLOCK_DURATION_MS);
  assert.notEqual(CLASSIC_UNKNOWN_FILL, '#111820');
  let previous = 0;
  for (let i = 0; i <= 1000; i++) {
    const p = i / 1000, pose = coverPose(p, 'opening');
    assert.ok(pose.open >= previous && pose.open <= 1); previous = pose.open;
    assert.ok(Number.isFinite(pose.opacity) && pose.opacity >= 0 && pose.opacity <= 1);
    if (p <= FLOW_END) { assert.equal(pose.open, 0); assert.equal(revealOpacity(p), 1); }
    for (const state of ['closed','relocked'] as const) assert.deepEqual(coverPose(p, state), { open: 0, opacity: 1, latch: 1 });
  }
  assert.equal(coverPose(1,'opening').opacity, 0); assert.equal(revealOpacity(1), 0);
});

test('same-color boundary reveals exactly the stable remaining unit, not deeper unknowns or moved portions', () => {
  const p = engineFixture('boundary-art', [['jade','coral','coral'], [], [], []], { hidden: [[0,0],[0,1]] });
  const before = createEngineSession(p,'boundary');
  const after = moveEngineSession(before, {type:'transfer', source:'b0', target:'b1'})!.session;
  assert.equal(after.state.contents[0].length, 2);
  const frame = pourPresentation(visible(before), visible(after), before.state.contents, after.state.contents, 0, 1, 1);
  assert.deepEqual(frame.containers[0].colors, [null,'coral','coral']);
  assert.deepEqual(frame.revealing[0], [false,true,false]);
  assert.deepEqual(frame.containers[1].colors, ['coral']);
  assert.deepEqual(frame.revealing[1], []);
  const undone = undoEngineSession(after);
  assert.deepEqual(visible(undone)[0].colors, [null,'coral','coral']);
  assert.deepEqual(visible(resetEngineSession(undone))[0].colors, [null,null,'coral']);
  for (const vessel of VESSELS) for (const angle of [0,-70,70]) {
    const layers = liquidFrame(['unit-0','unit-1','unit-2'], 2.5, angle, vessel, true);
    assert.equal(layers.length, 3); assert.ok(layers.every(l => l.path.length > 0));
  }
});

test('ordinary and already seen boards never replay opening on subsequent moves or restoration', () => {
  for (const p of ENGINE_EXAMPLES.slice(3)) {
    const s = createEngineSession(p,'plain'); assert.deepEqual(coverGroups(p, visible(s), null, boardLayout(p.containers.length).positions, 'wood'), []);
  }
  const s = createEngineSession(unlockArtExample(3,'key'),'restore');
  const after = moveEngineSession(s,{type:'transfer',source:'b0',target:'b1'})!.session;
  assert.deepEqual(coverGroups(after.runtime.puzzle,visible(after),null,boardLayout(12).positions,'roller'), []);
});
