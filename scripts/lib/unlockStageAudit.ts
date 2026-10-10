import { transitionEngine } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { buildRatingGraph, colorRuns, completeColors, type RatingGraph } from './unlockRatingGraph.ts';
import { distribution, ratingSpace } from './unlockRatingEvidence.ts';

function stagePressure(graph: RatingGraph, indices: number[]) {
  const spaces = indices.map(i => ratingSpace(graph.runtime,graph.nodes[i].frame));
  return { observations: indices.length, emptyReceivers: distribution(spaces.map(s => s.emptyReceivers)),
    minimumCompatibleSlots: distribution(spaces.map(s => Math.min(...s.compatible.map(c => c.slots)))),
    colorRuns: distribution(indices.map(i => colorRuns(graph.runtime,graph.nodes[i].frame))) };
}
/** Stage facts only. No route-count target, difficulty grades or claimed human aha response. */
export function auditUnlockStages(puzzle: SortingPuzzle, maxStates = 250000) {
  const graph = buildRatingGraph(puzzle,maxStates);
  if (graph.status !== 'complete') return graph;
  const { nodes, distances, shortestMoves } = graph;
  const corridor = nodes.flatMap((n,i) => shortestMoves !== null && n.depth + distances[i] === shortestMoves ? [i] : []);
  const triggers = puzzle.triggers.map(trigger => {
    // Distance to this milestone, independently of the final sorting distance.
    const distance = nodes.map(n => n.frame.state.fired.includes(trigger.id) ? 0 : Infinity);
    const queue = distance.flatMap((d,i) => d === 0 ? [i] : []);
    for (let cursor = 0; cursor < queue.length; cursor++) for (const previous of nodes[queue[cursor]].predecessors) {
      if (Number.isFinite(distance[previous])) continue;
      distance[previous] = distance[queue[cursor]] + 1; queue.push(previous);
    }
    const crossings = corridor.flatMap(i => nodes[i].edges.filter(e => e.unlock.includes(trigger.id)
      && nodes[i].depth + 1 + distances[e.to] === shortestMoves).map(e => ({ before: nodes[i].depth + 1,
      after: distances[e.to], completeColors: completeColors(graph.runtime,nodes[e.to].frame).length,
      remainingRuns: colorRuns(graph.runtime,nodes[e.to].frame), emptyReceivers: ratingSpace(graph.runtime,nodes[e.to].frame).emptyReceivers })));
    const solvedWithoutMilestone = nodes.filter(n => n.solved && !n.frame.state.fired.includes(trigger.id)).length;
    return { id: trigger.id, mandatory: shortestMoves !== null && solvedWithoutMilestone === 0, solvedWithoutMilestone,
      minimumMovesToMilestone: Number.isFinite(distance[0]) ? distance[0] : null,
      shortestCrossings: crossings, before: stagePressure(graph,corridor.filter(i => !nodes[i].frame.state.fired.includes(trigger.id))),
      after: stagePressure(graph,corridor.filter(i => nodes[i].frame.state.fired.includes(trigger.id))) };
  });
  let frame = nodes[0].frame;
  const participated = new Set<string>();
  const trace = graph.route.map((action,i) => {
    const next = transitionEngine(graph.runtime,frame.state,frame.known,action);
    if (!next.accepted) throw new Error('Stage route replay rejected');
    participated.add(action.source); participated.add(action.target); frame = next;
    return { step: i + 1, action, fired: next.events.flatMap(e => e.type === 'unlock' ? [...e.triggers] : []),
      emptyReceivers: ratingSpace(graph.runtime,frame).emptyReceivers, remainingRuns: colorRuns(graph.runtime,frame) };
  });
  const allOpen = buildRatingGraph({ ...puzzle, locked: [], triggers: [] },maxStates);
  return { status: 'complete' as const, states: nodes.length, edges: graph.edges, deadEnds: graph.deadEnds, shortestMoves,
    route: graph.route, triggers, trace, participatingLocked: puzzle.locked.filter(id => participated.has(id)),
    allOpen: allOpen.status === 'complete' ? { status: allOpen.status, shortestMoves: allOpen.shortestMoves, deadEnds: allOpen.deadEnds } : allOpen,
    limits: 'Exact fixed-layout forward graph until completion. Before/after facts cover all globally shortest corridors; moves, space and runs are not difficulty grades. Alternative hidden worlds, visual quality and human breakthrough experience remain unvalidated.' };
}
