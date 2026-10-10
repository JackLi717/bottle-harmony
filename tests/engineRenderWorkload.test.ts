import assert from 'node:assert/strict';
import test from 'node:test';
import { createEngineSession, moveEngineSession, visibleEngineState } from '../src/game/engine.ts';
import { ENGINE_EXAMPLES } from '../src/game/engineExamples.ts';
import { ENGINE_RENDER_ROUTES, engineRenderCase } from '../src/game/engineRenderWorkload.ts';
import { VESSELS, vesselAtCapacity } from '../src/art/vesselDesigns.ts';
import { createPourPlan, sourcePose } from '../src/art/pourGeometry.ts';

test('the sustained rendering workload fully replays all five rules in all fifteen approved vessel styles', () => {
  let cases = 0, moves = 0;
  for (;; cases++) {
    const entry = engineRenderCase(cases, VESSELS.length);
    if (!entry) break;
    const puzzle = ENGINE_EXAMPLES[entry.exampleIndex];
    let session = createEngineSession(puzzle, `render-${cases}`);
    for (const action of ENGINE_RENDER_ROUTES[entry.exampleIndex]) {
      const before = visibleEngineState(session.runtime, session.state, session.known, session.seen);
      const source = session.runtime.containerIndex.get(action.source)!, target = session.runtime.containerIndex.get(action.target)!;
      const result = moveEngineSession(session, action);
      assert.ok(result, `${puzzle.id}: ${action.source} → ${action.target}`);
      const event = result.events.find(e => e.type === 'transfer');
      assert.ok(event?.type === 'transfer');
      const vessel = VESSELS[entry.styleIndex];
      const plan = createPourPlan({ x: 0, y: 0 }, { x: 220, y: 200 }, before[source].colors.length, event.units.length, -70, 12, 360, 430,
        vesselAtCapacity(vessel, puzzle.containers[source].capacity), vesselAtCapacity(vessel, puzzle.containers[target].capacity));
      for (const progress of [0, .34, .5, .72, 1]) {
        const pose = sourcePose(plan, progress);
        assert.ok([pose.angle, pose.dx, pose.dy, pose.outlet.x, pose.outlet.y].every(Number.isFinite));
      }
      session = result.session; moves++;
    }
    assert.equal(session.status, 'solved', puzzle.id);
  }
  assert.equal(cases, 75); assert.equal(moves, 360);
  assert.throws(() => engineRenderCase(-1, 15)); assert.throws(() => engineRenderCase(1, 0));
});
