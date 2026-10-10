import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compileSortingPuzzle, initialEngineState, transitionEngine, visibleEngineState, type EngineAction } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import { parseProductionRecords } from '../../src/game/mainlineCatalog.ts';
import { evaluateHumanDifficulty, type HumanDifficultyReport } from '../../src/game/humanDifficulty.ts';
import { solveBoard } from '../../src/game/solver.ts';
import { UNLOCK_BASELINE, UNLOCK_BASELINE_PAIRS } from '../../src/game/unlockBaseline.ts';
import { auditUnlockStages } from './unlockStageAudit.ts';
import { assertUnlockTrialSolvable, unlockTrialStructure } from './unlockTrialAudit.ts';

const hash = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
function permutations(items: readonly string[]): string[][] {
  if (!items.length) return [[]];
  return [...new Set(items)].flatMap(color => {
    const rest = [...items]; rest.splice(rest.indexOf(color),1);
    return permutations(rest).map(tail => [color,...tail]);
  });
}

/** A common public prefix reaches the only disclosure; then every inventory-consistent
 * order has a fully replayed solution. This is an existence proof, not all-action safety. */
export function auditBaselineDisclosure(puzzle: typeof UNLOCK_BASELINE[number]['puzzle'], route: readonly EngineAction[]) {
  assert.equal(puzzle.hidden.length,0); assert.equal(puzzle.locked.length,1); assert.equal(puzzle.triggers.length,1);
  const runtime = compileSortingPuzzle(puzzle), locked = puzzle.containers.find(c => c.id === puzzle.locked[0])!;
  assert.equal(locked.units.length,4);
  for (const color of puzzle.colors) assert.equal(puzzle.units.filter(u => u.color === color).length,4);
  let frame = initialEngineState(runtime);
  assert.deepEqual(puzzle.units.filter(u => !frame.known.includes(u.id)).map(u => u.id).sort(),[...locked.units].sort());
  const prefix: EngineAction[] = [], observations: ReturnType<typeof visibleEngineState>[] = [];
  for (const action of route) {
    observations.push(visibleEngineState(runtime,frame.state,frame.known));
    const next = transitionEngine(runtime,frame.state,frame.known,action);
    assert.ok(next.accepted); prefix.push(action); frame = next;
    if (frame.state.fired.length) break;
  }
  assert.deepEqual(frame.state.fired,['key-a']); assert.ok(frame.state.open.every(Boolean));
  assert.equal(frame.known.length,puzzle.units.length);
  // The only unseen units are this full locked bottle. Four-per-color conservation
  // fixes its multiset from all other visible units; enumerate every distinct order.
  const orders = permutations(locked.units.map(u => runtime.unitColors.get(u)!));
  const worlds = orders.map(order => {
    const assignment = new Map(locked.units.map((u,i) => [u,order[i]]));
    const world = compileSortingPuzzle({ ...puzzle, units:puzzle.units.map(u => ({...u,color:assignment.get(u.id) ?? u.color})) });
    let current = initialEngineState(world);
    for (const [i,action] of prefix.entries()) {
      assert.deepEqual(visibleEngineState(world,current.state,current.known),observations[i],'Preparation depends on unseen order');
      const next = transitionEngine(world,current.state,current.known,action);
      assert.ok(next.accepted); current = next;
    }
    assert.ok(current.state.open.every(Boolean)); assert.equal(current.known.length,puzzle.units.length);
    const result = solveBoard(current.state.contents.map(stack => stack.map(u => world.unitColors.get(u)!)),{maxStates:100000,maxMilliseconds:60000});
    assert.equal(result.status,'solved','Unknown or unsolvable hidden world is not admission');
    if (result.status !== 'solved') throw new Error('Unproved disclosure');
    const continuation: EngineAction[] = result.route.map(p => ({type:'transfer',source:`b${p.source}`,target:`b${p.target}`}));
    replayEngineRoute(world,initialEngineState(world),[...prefix,...continuation]);
    return { order, continuation };
  });
  return { status:'proved' as const, criterion:'common-public-prefix-then-visible-completion-v1', prefix, worlds,
    limits:'Only this one initially full locked bottle and public four-per-color inventory. Does not prove all choices safe, human discoverability or balanced phase difficulty.' };
}

export function auditUnlockBaselines(records: readonly { number:number; content:unknown; rating:{evidence:{rank:number; referenceSolution:Parameters<typeof evaluateHumanDifficulty>[1]}}; human:HumanDifficultyReport }[]) {
  const structures = new Set<string>();
  return UNLOCK_BASELINE_PAIRS.map((pair,i) => {
    const record = records.find(r => r.number === pair.mainline); assert.ok(record);
    // Strict existing content + lower-policy evidence decoder, without rerating the thousand.
    const [{content,rating}] = parseProductionRecords([{content:record.content,rating:record.rating}]);
    assert.deepEqual(content.level.bottles.map(b => b.layers),pair.board);
    const human = evaluateHumanDifficulty(content.level,rating.evidence.referenceSolution,rating.evidence.rank!);
    assert.deepEqual(human,record.human); assert.equal(human.status,'rated'); assert.equal(human.score?.total,pair.classicScore);
    assert.ok(pair.classicScore >= 49 && pair.classicScore <= 51);
    const variants = UNLOCK_BASELINE.slice(i * 2,i * 2 + 2).map(entry => {
      const structure = unlockTrialStructure(entry.puzzle); assert.ok(!structures.has(structure)); structures.add(structure);
      const audit = auditUnlockStages(entry.puzzle);
      assertUnlockTrialSolvable(entry.puzzle,audit);
      if (audit.status !== 'complete') throw new Error('Unknown is not admission');
      if (entry.variant === 'classic') assert.equal(audit.shortestMoves,human.shortestMoves);
      else {
        assert.equal(audit.triggers.length,1); assert.ok(audit.triggers[0].mandatory);
        assert.deepEqual(audit.participatingLocked,entry.puzzle.locked);
        assert.ok(audit.triggers[0].shortestCrossings.length > 0);
        for (const crossing of audit.triggers[0].shortestCrossings) {
          assert.ok(crossing.before >= 7 && crossing.after >= 7);
          const share = crossing.before / audit.shortestMoves!; assert.ok(share >= 0.35 && share <= 0.65);
        }
      }
      return { puzzle:entry.puzzle.id, variant:entry.variant, definitionSha256:hash(entry.puzzle), structureSha256:hash(structure),
        ...audit, disclosure:entry.variant === 'key' ? auditBaselineDisclosure(entry.puzzle,audit.route) : null };
    });
    return { mainline:pair.mainline, sourceSha256:hash(record), origin:content.origin, classicHuman:human, variants };
  });
}
