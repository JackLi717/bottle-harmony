import { compileSortingPuzzle, evaluateEngineGoal, initialEngineState, listEngineActions, transitionEngine,
  type EngineAction, type EngineFrame } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';

/** Minimum solvability gate: one replayed completion suffices. Wrong choices may
 * need undo/reset; dead-end counts and hidden-information fairness are separate. */
export function assertUnlockTrialSolvable(puzzle: SortingPuzzle, evidence:
  { status: 'complete'; shortestMoves: number | null; route: readonly EngineAction[] } | { status: 'unknown' }) {
  if (evidence.status !== 'complete') throw new Error(`Unknown solvability: ${puzzle.id}`);
  if (evidence.shortestMoves === null) throw new Error(`Unsolvable trial: ${puzzle.id}`);
  const runtime = compileSortingPuzzle(puzzle);
  replayEngineRoute(runtime,initialEngineState(runtime),evidence.route);
}

/** Exact canonical structure for these <=8-bottle handcrafted boards. IDs and colors are relabeled, never artwork. */
export function unlockTrialStructure(puzzle: SortingPuzzle): string {
  if (puzzle.containers.length > 8) throw new Error('Handcrafted canonicalization budget');
  const colors = new Map(puzzle.units.map(u => [u.id,u.color])), hidden = new Set(puzzle.hidden);
  let best: string | null = null;
  function visit(order: number[], remaining: number[]) {
    if (remaining.length) { for (const i of remaining) visit([...order,i],remaining.filter(n => n !== i)); return; }
    const names = new Map<string,number>(), color = (c: string) => { if (!names.has(c)) names.set(c,names.size); return names.get(c)!; };
    const ids = new Map(order.map((i,n) => [puzzle.containers[i].id,n]));
    const containers = order.map(i => {
      const c = puzzle.containers[i];
      return [c.capacity,c.canSource,c.canReceive,c.receive,c.fixed,c.protectedBottom,c.acceptColors?.map(color).sort(),
        puzzle.locked.includes(c.id),c.units.map(u => [color(colors.get(u)!),hidden.has(u)])];
    });
    const triggers = puzzle.triggers.map(t => [t.when.type === 'empty' ? ['empty',ids.get(t.when.container)] : ['color-full',color(t.when.color),t.when.count],
      t.unlock.map(id => ids.get(id)).sort((a,b) => a! - b!)]).map(t => JSON.stringify(t)).sort();
    const value = JSON.stringify([puzzle.amount,containers,triggers]);
    if (best === null || value < best) best = value;
  }
  visit([],puzzle.containers.map((_,i) => i));
  return best!;
}

/** Content acceptance only, not a difficulty evaluator or generator. No player database access. */
export function auditUnlockTrial(puzzle: SortingPuzzle, maxStates = 250000) {
  const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime);
  // Merge only containers with identical static rules, whole-board goal role,
  // trigger-source role and target-group membership. Never exchange key bottles.
  if (puzzle.goal.type !== 'sort' || puzzle.goal.containers.length !== puzzle.containers.length) throw new Error('Whole-board trial only');
  const roles = puzzle.containers.map(c => JSON.stringify([c.capacity,c.canSource,c.canReceive,c.receive,c.fixed,c.protectedBottom,c.acceptColors,
    puzzle.locked.includes(c.id), puzzle.triggers.filter(t => t.when.type === 'empty' && t.when.container === c.id).map(t => t.id),
    puzzle.triggers.filter(t => t.unlock.includes(c.id)).map(t => t.id)]));
  const groups = [...new Set(roles)].map(role => roles.flatMap((r,i) => r === role ? [i] : []));
  const codes = new Map(puzzle.units.map(u => [u.id, puzzle.colors.indexOf(u.color) * 3]));
  function key(frame: EngineFrame) {
    const known = new Set(frame.known);
    const stacks = frame.state.contents.map((units,i) => Number(frame.state.open[i]) + units.map(u => String.fromCharCode(65 + codes.get(u)! + (known.has(u) ? 1 : runtime.hidden.has(u) ? 2 : 0))).join(''));
    return groups.map(indices => indices.map(i => stacks[i]).sort().join('|')).join('/') + '#' + [...frame.state.fired].sort().join(',');
  }
  type Node = { frame: EngineFrame; parent: number; action: EngineAction | null; predecessors: number[]; solved: boolean };
  const nodes: Node[] = [{ frame: initial, parent: -1, action: null, predecessors: [], solved: false }];
  const visited = new Map([[key(initial),0]]), triggerSteps = new Map<string, number>(), firedSets = new Set<string>(), simultaneous = new Set<string>();
  const depths = [0];
  let edges = 0, firstSolution = -1;
  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const node = nodes[cursor];
    firedSets.add([...node.frame.state.fired].sort().join(','));
    node.solved = evaluateEngineGoal(runtime,node.frame.state);
    if (node.solved) { if (firstSolution < 0) firstSolution = cursor; continue; }
    for (const action of listEngineActions(runtime,node.frame.state,node.frame.known)) {
      const result = transitionEngine(runtime,node.frame.state,node.frame.known,action);
      if (!result.accepted) throw new Error('Enumeration disagrees');
      const newlyFired = result.state.fired.filter(t => !node.frame.state.fired.includes(t));
      for (const trigger of newlyFired) if (!triggerSteps.has(trigger)) triggerSteps.set(trigger,depths[cursor] + 1);
      if (newlyFired.length > 1) simultaneous.add([...newlyFired].sort().join(','));
      const nextKey = key(result);
      let index = visited.get(nextKey);
      if (index === undefined) {
        if (nodes.length >= maxStates) return { status: 'unknown' as const, reason: 'states', states: nodes.length };
        index = nodes.length; visited.set(nextKey,index); depths.push(depths[cursor] + 1);
        nodes.push({ frame: { state: result.state, known: result.known }, parent: cursor, action, predecessors: [], solved: false });
      }
      nodes[index].predecessors.push(cursor); edges++;
    }
  }
  const winning = new Set(nodes.flatMap((node,i) => node.solved ? [i] : [])), queue = [...winning];
  for (let cursor = 0; cursor < queue.length; cursor++) for (const previous of nodes[queue[cursor]].predecessors) {
    if (!winning.has(previous)) { winning.add(previous); queue.push(previous); }
  }
  const route: EngineAction[] = [];
  for (let index = firstSolution; index >= 0 && nodes[index].parent >= 0; index = nodes[index].parent) route.push(nodes[index].action!);
  route.reverse();
  if (firstSolution >= 0) replayEngineRoute(runtime,initial,route);
  let frame = initial;
  const stages: { step: number; triggers: readonly string[]; opened: readonly string[] }[] = [];
  const participated = new Set<string>();
  for (const [index,action] of route.entries()) {
    const next = transitionEngine(runtime,frame.state,frame.known,action);
    if (!next.accepted) throw new Error('Illegal route');
    participated.add(action.source); participated.add(action.target);
    for (const event of next.events) if (event.type === 'unlock') stages.push({ step: index + 1, triggers: event.triggers, opened: event.containers });
    frame = next;
  }
  return { status: 'complete' as const, states: nodes.length, edges, deadEnds: nodes.length - winning.size,
    shortestMoves: firstSolution < 0 ? null : route.length, route, stages,
    earliestTriggers: Object.fromEntries(triggerSteps), firedSets: [...firedSets].sort(), simultaneous: [...simultaneous].sort(),
    participatingLocked: puzzle.locked.filter(id => participated.has(id)),
    // Legality never reads an unknown color: unknown top is exposed by settle,
    // and transferWithKnowledge stops before each original hidden boundary.
    informationCriterion: nodes.length === winning.size ? 'all-reachable-public-legal-actions-preserve-completability'
      : 'fixed-layout-has-forward-dead-ends' };
}
