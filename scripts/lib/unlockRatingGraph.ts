import { compileSortingPuzzle, evaluateEngineGoal, initialEngineState, listEngineActions, transitionEngine,
  type EngineAction, type EngineFrame, type EngineRuntime } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';

export function assertRatingScope(puzzle: SortingPuzzle) {
  compileSortingPuzzle(puzzle); // Strict shared decoder before any offline assumptions.
  if (puzzle.containers.length > 10 || puzzle.amount !== 'run' || puzzle.goal.type !== 'sort'
    || puzzle.goal.containers.length !== puzzle.containers.length
    || puzzle.containers.some(c => c.capacity !== 4 || !c.canSource || !c.canReceive || c.receive !== 'same'
      || c.protectedBottom || c.acceptColors !== null)
    || puzzle.colors.some(c => puzzle.units.filter(u => u.color === c).length !== 4)) {
    throw new Error('Rating supports only <=10-container classic four-portion whole-board trials');
  }
}

/** Equivalent rule roles are interchangeable; spent single-key roles may merge after opening.
 * Knowledge is encoded per liquid occurrence.
 * Stable unit IDs do not affect forward moves once color and disclosure behavior agree.
 * Undo histories are deliberately outside this graph. */
export function ratingStateKey(runtime: EngineRuntime) {
  const puzzle = runtime.puzzle;
  const roles = puzzle.containers.map(c => JSON.stringify([c.capacity, c.canSource, c.canReceive, c.receive,
    c.fixed, c.protectedBottom, c.acceptColors, puzzle.locked.includes(c.id),
    puzzle.triggers.filter(t => t.when.type === 'empty' && t.when.container === c.id).map(t => t.id).sort(),
    puzzle.triggers.filter(t => t.unlock.includes(c.id)).map(t => t.id).sort()]));
  const groups = [...new Set(roles)].map(role => roles.flatMap((r, i) => r === role ? [i] : []));
  // In the larger internal scope, after every bottom key has fired and every unit
  // is public, historical key/lock roles cannot affect any future move or
  // goal. Quotient those now equivalent bottles exactly, retaining all physical
  // permissions. Keep the <=8 evidence ordering unchanged for frozen reports.
  const openedRoles = puzzle.containers.map(c => JSON.stringify([c.capacity, c.canSource, c.canReceive, c.receive,
    c.fixed, c.protectedBottom, c.acceptColors]));
  const openedGroups = [...new Set(openedRoles)].map(role => openedRoles.flatMap((r, i) => r === role ? [i] : []));
  const canCollapse = puzzle.containers.length > 8 && !puzzle.hidden.length && [1, 2].includes(puzzle.triggers.length)
    && puzzle.triggers.every(t => t.when.type === 'empty')
    && puzzle.locked.every(id => puzzle.triggers.some(t => t.unlock.includes(id)));
  const codes = new Map(puzzle.units.map(u => [u.id, puzzle.colors.indexOf(u.color) * 3]));
  return (frame: EngineFrame) => {
    const known = new Set(frame.known);
    const stacks = frame.state.contents.map((units, i) => Number(frame.state.open[i]) + units.map(u =>
      String.fromCharCode(65 + codes.get(u)! + (known.has(u) ? 1 : runtime.hidden.has(u) ? 2 : 0))).join(''));
    const activeGroups = canCollapse && puzzle.triggers.every(t => frame.state.fired.includes(t.id)) && frame.state.open.every(Boolean) ? openedGroups : groups;
    return activeGroups.map(indices => indices.map(i => stacks[i]).sort().join('|')).join('/')
      + '#' + [...frame.state.fired].sort().join(',');
  };
}
export type RatingEdge = { to: number; action: EngineAction; breakthrough: boolean; unlock: string[]; reveal: string[] };
export type RatingNode = { frame: EngineFrame; depth: number; parent: number; edges: RatingEdge[]; predecessors: number[]; solved: boolean };
export type RatingGraph = { status: 'complete'; runtime: EngineRuntime; key: ReturnType<typeof ratingStateKey>;
  nodes: RatingNode[]; distances: number[]; shortestMoves: number | null; route: EngineAction[]; edges: number; deadEnds: number };
export type GraphUnknown = { status: 'unknown'; reason: 'states' | 'edges'; states: number; edges: number };

export function colorRuns(runtime: EngineRuntime, frame: EngineFrame) {
  return frame.state.contents.reduce((n, stack) => n + stack.filter((u, i) => !i || runtime.unitColors.get(u) !== runtime.unitColors.get(stack[i - 1])).length, 0);
}
export function completeColors(runtime: EngineRuntime, frame: EngineFrame) {
  return runtime.puzzle.colors.filter(color => frame.state.contents.some(stack => stack.length === 4 && stack.every(u => runtime.unitColors.get(u) === color)));
}

export function buildRatingGraph(puzzle: SortingPuzzle, maxStates = 250000, maxEdges = 4000000): RatingGraph | GraphUnknown {
  assertRatingScope(puzzle);
  if (!Number.isSafeInteger(maxStates) || maxStates < 1 || maxStates > 1000000
    || !Number.isSafeInteger(maxEdges) || maxEdges < 1 || maxEdges > 10000000) throw new Error('Invalid rating budget');
  const runtime = compileSortingPuzzle(puzzle), key = ratingStateKey(runtime), initial = initialEngineState(runtime);
  const node = (frame: EngineFrame, depth: number, parent: number): RatingNode => ({ frame, depth, parent, edges: [], predecessors: [], solved: evaluateEngineGoal(runtime, frame.state) });
  const nodes = [node(initial, 0, -1)], visited = new Map([[key(initial), 0]]);
  let edges = 0;
  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const current = nodes[cursor];
    if (current.solved) continue;
    const runs = colorRuns(runtime, current.frame), completed = completeColors(runtime, current.frame);
    for (const action of listEngineActions(runtime, current.frame.state, current.frame.known)) {
      if (edges >= maxEdges) return { status: 'unknown', reason: 'edges', states: nodes.length, edges };
      const next = transitionEngine(runtime, current.frame.state, current.frame.known, action);
      if (!next.accepted) throw new Error('Rating action enumeration disagreed');
      const value = key(next);
      let to = visited.get(value);
      if (to === undefined) {
        if (nodes.length >= maxStates) return { status: 'unknown', reason: 'states', states: nodes.length, edges };
        to = nodes.length; visited.set(value, to); nodes.push(node({ state: next.state, known: next.known }, current.depth + 1, cursor));
      }
      const unlock = next.events.flatMap(e => e.type === 'unlock' ? [...e.triggers] : []);
      const reveal = next.events.flatMap(e => e.type === 'reveal' ? [...e.units] : []);
      current.edges.push({ to, action, unlock, reveal, breakthrough: unlock.length > 0 || reveal.length > 0
        || colorRuns(runtime, next) < runs || completeColors(runtime, next).some(c => !completed.includes(c)) });
      nodes[to].predecessors.push(cursor); edges++;
    }
  }
  const distances = nodes.map(() => Infinity), queue: number[] = [];
  nodes.forEach((n, i) => { if (n.solved) { distances[i] = 0; queue.push(i); } });
  for (let cursor = 0; cursor < queue.length; cursor++) for (const previous of nodes[queue[cursor]].predecessors) {
    if (distances[previous] !== Infinity) continue;
    distances[previous] = distances[queue[cursor]] + 1; queue.push(previous);
  }
  // Re-select edges on the live frame: stored quotient representatives can permute
  // equivalent bottles/units, so concatenating their action IDs is not a legal route.
  let frame: EngineFrame = initial, index = 0;
  const route: EngineAction[] = [];
  while (Number.isFinite(distances[index]) && distances[index] > 0) {
    const candidates = new Map(nodes[index].edges.filter(e => distances[e.to] === distances[index] - 1).map(e => [key(nodes[e.to].frame), e.to]));
    let found = false;
    for (const action of listEngineActions(runtime, frame.state, frame.known)) {
      const next = transitionEngine(runtime, frame.state, frame.known, action);
      if (!next.accepted) throw new Error('Route action rejected');
      const to = candidates.get(key(next));
      if (to === undefined) continue;
      frame = next; index = to; route.push(action); found = true; break;
    }
    if (!found) throw new Error('Invalid quotient route');
  }
  if (Number.isFinite(distances[0])) replayEngineRoute(runtime, initial, route);
  return { status: 'complete', runtime, key, nodes, distances, shortestMoves: Number.isFinite(distances[0]) ? distances[0] : null,
    route, edges, deadEnds: distances.filter(d => !Number.isFinite(d)).length };
}
