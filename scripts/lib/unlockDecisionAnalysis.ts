import { visibleEngineState } from '../../src/game/engine.ts';
import { colorRuns, completeColors, type RatingGraph } from './unlockRatingGraph.ts';
import { distribution, ratingSpace } from './unlockRatingFacts.ts';

export const DECISION_ANALYSIS_METHOD = 'consequence-stage-v1';
const MAX_PROGRESS_HORIZON = 7;
type Range = { min: number | null; max: number | null };
type Choice = {
  successors: number; neutralSelfLoops: number; optimal: number; costly: number; dead: number;
  costSensitive: boolean; resourceSensitive: boolean; milestoneSensitive: boolean;
  consequential: boolean; optimalPlanningAlternatives: boolean;
  minimumCompatibleSlots: number | null; emptyReceivers: number;
  horizon: { status: 'resolved' | 'unresolved' | 'unavailable'; pours: number | null };
};
const range = (values: number[]): Range => ({ min: values.length ? values.reduce((m, v) => Math.min(m, v), Infinity) : null,
  max: values.length ? values.reduce((m, v) => Math.max(m, v), -Infinity) : null });
const uniqueEdges = (graph: RatingGraph, i: number) => [...new Map(graph.nodes[i].edges.map(e => [e.to, e])).values()];

/** Shortest successful preparation to each milestone. Unsolvable continuations
 * never supply an apparently shorter way to obtain a key. */
function milestoneDistances(graph: RatingGraph, trigger: string) {
  const distance = graph.nodes.map((n, i) => Number.isFinite(graph.distances[i]) && n.frame.state.fired.includes(trigger) ? 0 : Infinity);
  const queue = distance.flatMap((d, i) => d === 0 ? [i] : []);
  for (let cursor = 0; cursor < queue.length; cursor++) for (const p of graph.nodes[queue[cursor]].predecessors) {
    if (!Number.isFinite(graph.distances[p]) || Number.isFinite(distance[p])) continue;
    distance[p] = distance[queue[cursor]] + 1; queue.push(p);
  }
  return distance;
}

/** Public-progress policy: maximize completed colors, then minimize color runs,
 * then maximize empty receivers. Exact remaining costs only audit its choices;
 * they never rank them. A horizon is reported only from fully visible states. */
function progressPolicy(graph: RatingGraph) {
  const visible = graph.nodes.map(n => visibleEngineState(graph.runtime, n.frame.state, n.frame.known)
    .every(c => c.count !== null && c.colors.every(color => color !== null)));
  const width = graph.runtime.puzzle.containers.length + 1;
  const scores = graph.nodes.map((n, i) => visible[i]
    ? completeColors(graph.runtime, n.frame).length * (graph.runtime.puzzle.units.length + 1) * width
      - colorRuns(graph.runtime, n.frame) * width + ratingSpace(graph.runtime, n.frame).emptyReceivers
    : -Infinity);
  const layers = [scores];
  for (let h = 1; h < MAX_PROGRESS_HORIZON; h++) layers.push(graph.nodes.map((n, i) => n.solved ? scores[i]
    : n.edges.reduce((best, e) => Math.max(best, layers[h - 1][e.to]), -Infinity)));
  return (i: number, successors: number[]): Choice['horizon'] => {
    if (!visible[i]) return { status: 'unavailable', pours: null };
    if (successors.every(j => graph.distances[j] === graph.distances[i] - 1)) return { status: 'resolved', pours: 0 };
    for (let h = 1; h <= MAX_PROGRESS_HORIZON; h++) {
      const best = successors.reduce((m, j) => Math.max(m, layers[h - 1][j]), -Infinity);
      const selected = successors.filter(j => layers[h - 1][j] === best);
      if (selected.length && selected.every(j => graph.distances[j] === graph.distances[i] - 1)) return { status: 'resolved', pours: h };
    }
    return { status: 'unresolved', pours: null };
  };
}

function summarize(indices: number[], choices: Choice[]) {
  const rows = indices.map(i => choices[i]);
  const horizons = (samples: Choice[]) => ({ resolved: distribution(samples.flatMap(r => r.horizon.pours === null ? [] : [r.horizon.pours])),
    unresolved: samples.filter(r => r.horizon.status === 'unresolved').length, unavailable: samples.filter(r => r.horizon.status === 'unavailable').length });
  return { states: rows.length, consequentialStates: rows.filter(r => r.consequential).length,
    consequentialFraction: rows.length ? rows.filter(r => r.consequential).length / rows.length : null,
    optimalPlanningStates: rows.filter(r => r.optimalPlanningAlternatives).length,
    costSensitiveStates: rows.filter(r => r.costSensitive).length,
    resourceSensitiveStates: rows.filter(r => r.resourceSensitive).length,
    milestoneSensitiveStates: rows.filter(r => r.milestoneSensitive).length,
    deadAlternativeStates: rows.filter(r => r.dead > 0).length,
    onlyCostSensitiveStates: rows.filter(r => r.costSensitive && !r.resourceSensitive && !r.milestoneSensitive).length,
    successors: distribution(rows.map(r => r.successors)),
    emptyReceivers: distribution(rows.map(r => r.emptyReceivers)),
    minimumCompatibleSlots: distribution(rows.flatMap(r => r.minimumCompatibleSlots === null ? [] : [r.minimumCompatibleSlots])),
    publicProgressHorizon: horizons(rows), choiceProgressHorizon: horizons(rows.filter(r => r.consequential)) };
}

/** Exact independent extrema over all bounded complete walks. Counts are never
 * path-weighted. Additive extrema can be propagated separately; consecutive
 * runs retain (current run, historical peak) together. */
function routeProfile(graph: RatingGraph, extra: number, choices: Choice[], phase: (i: number) => boolean) {
  const limit = graph.shortestMoves! + extra;
  const names = ['pours', 'consequentialPours', 'optimalPlanningPours', 'noEmptyReceiverPours'] as const;
  type Bounds = { min: number[]; max: number[] };
  let frontier = new Map<number, Bounds>([[0, { min: [0,0,0,0], max: [0,0,0,0] }]]);
  const totals: Bounds = { min: names.map(() => Infinity), max: names.map(() => -Infinity) };
  const density: number[] = [];
  for (let step = 0; step <= limit; step++) {
    const next = new Map<number, Bounds>();
    for (const [i, bounds] of frontier) {
      if (graph.nodes[i].solved) {
        names.forEach((_, k) => { totals.min[k] = Math.min(totals.min[k], bounds.min[k]); totals.max[k] = Math.max(totals.max[k], bounds.max[k]); });
        // Whole-route density only: step and choice count belong to the same walk.
        if (step) density.push(bounds.min[1] / step, bounds.max[1] / step);
        continue;
      }
      const c = choices[i];
      for (const e of uniqueEdges(graph, i)) {
        if (step + 1 + graph.distances[e.to] > limit) continue;
        const add = phase(i) ? [1, Number(c.consequential && e.to !== i), Number(c.optimalPlanningAlternatives && e.to !== i), Number(c.emptyReceivers === 0)] : [0,0,0,0];
        const b = next.get(e.to) ?? { min: names.map(() => Infinity), max: names.map(() => -Infinity) };
        names.forEach((_, k) => { b.min[k] = Math.min(b.min[k], bounds.min[k] + add[k]); b.max[k] = Math.max(b.max[k], bounds.max[k] + add[k]); });
        next.set(e.to, b);
      }
    }
    frontier = next;
  }
  return { ...Object.fromEntries(names.map((name, k) => [name, { min: Number.isFinite(totals.min[k]) ? totals.min[k] : null,
    max: Number.isFinite(totals.max[k]) ? totals.max[k] : null }])) as Record<typeof names[number], Range>,
    consequentialShareOfWholeRoute: range(density) };
}

function routeRuns(graph: RatingGraph, extra: number, choices: Choice[]) {
  const limit = graph.shortestMoves! + extra, base = limit + 2;
  const compute = (tail: boolean) => {
    let frontier = new Map<number, Set<number>>([[0, new Set([0])]]);
    const terminal: number[] = [];
    for (let step = 0; step <= limit; step++) {
      const next = new Map<number, Set<number>>();
      for (const [i, pairs] of frontier) {
        if (graph.nodes[i].solved) { for (const pair of pairs) terminal.push(tail ? pair % base : Math.floor(pair / base)); continue; }
        for (const e of uniqueEdges(graph, i)) {
          if (step + 1 + graph.distances[e.to] > limit) continue;
          const dest = next.get(e.to) ?? new Set<number>();
          for (const pair of pairs) {
            const consequential = choices[i].consequential && e.to !== i;
            const run = tail ? (consequential ? 0 : pair % base + 1)
              : consequential ? pair % base + 1 : 0;
            dest.add(run + Math.max(Math.floor(pair / base), run) * base);
          }
          next.set(e.to, dest);
        }
      }
      frontier = next;
    }
    return range(terminal);
  };
  return { longestConsequentialRun: compute(false), tailAfterLastConsequentialChoice: compute(true) };
}

export function analyzeRatingDecisions(graph: RatingGraph) {
  if (graph.shortestMoves === null) return { status: 'blocked' as const, method: DECISION_ANALYSIS_METHOD, reason: 'Original graph is unsolvable.' };
  const triggers = graph.runtime.puzzle.triggers;
  const milestone = triggers.map(t => milestoneDistances(graph, t.id));
  const spaces = graph.nodes.map(n => ratingSpace(graph.runtime, n.frame));
  // Ignore completed full-color sources when measuring unfinished work's space.
  const resources = graph.nodes.map((n, i) => {
    const active = spaces[i].compatible.filter(c => {
      const stack = n.frame.state.contents[graph.runtime.containerIndex.get(c.source)!];
      return stack.length !== 4 || stack.some(u => graph.runtime.unitColors.get(u) !== graph.runtime.unitColors.get(stack[0]));
    });
    const byColor = new Map<string, number[]>();
    for (const source of active) byColor.set(source.color, [...(byColor.get(source.color) ?? []), source.slots]);
    return { minimum: active.length ? Math.min(...active.map(c => c.slots)) : null,
      signature: JSON.stringify([...byColor].sort(([a], [b]) => a.localeCompare(b)).map(([color, slots]) => [color, slots.sort((a, b) => a - b)])) };
  });
  const horizon = progressPolicy(graph);
  const choices: Choice[] = graph.nodes.map((n, i) => {
    const all = uniqueEdges(graph, i), candidates = all.filter(e => e.to !== i);
    const optimal = candidates.filter(e => graph.distances[e.to] === graph.distances[i] - 1);
    const viable = candidates.filter(e => Number.isFinite(graph.distances[e.to]));
    const costSensitive = Number.isFinite(graph.distances[i]) && candidates.length > 1
      && new Set(candidates.map(e => graph.distances[e.to])).size > 1;
    const resourceSensitive = viable.length > 1 && new Set(viable.map(e => resources[e.to].signature)).size > 1;
    const milestoneSignature = (to: number) => JSON.stringify(milestone.map(distances => distances[to]));
    const milestoneSensitive = viable.length > 1 && new Set(viable.map(e => milestoneSignature(e.to))).size > 1;
    return { successors: candidates.length, neutralSelfLoops: all.length - candidates.length,
      optimal: optimal.length, costly: viable.length - optimal.length, dead: candidates.length - viable.length,
      costSensitive, resourceSensitive, milestoneSensitive,
      consequential: Number.isFinite(graph.distances[i]) && candidates.length > 1 && (costSensitive || resourceSensitive || milestoneSensitive),
      optimalPlanningAlternatives: optimal.length > 1 && (new Set(optimal.map(e => resources[e.to].signature)).size > 1
        || new Set(optimal.map(e => milestoneSignature(e.to))).size > 1),
      minimumCompatibleSlots: resources[i].minimum, emptyReceivers: spaces[i].emptyReceivers,
      horizon: n.solved ? { status: 'resolved', pours: 0 } : horizon(i, candidates.map(e => e.to)) };
  });
  const corridor = (extra: number) => {
    const included = graph.nodes.flatMap((n, i) => n.depth + graph.distances[i] <= graph.shortestMoves! + extra && !n.solved ? [i] : []);
    const summary = summarize(included, choices);
    const milestones = triggers.map((t, k) => {
      const fired = (i: number) => graph.nodes[i].frame.state.fired.includes(t.id);
      const crossings = included.flatMap(i => uniqueEdges(graph, i).filter(e => e.unlock.includes(t.id)
        && graph.nodes[i].depth + 1 + graph.distances[e.to] <= graph.shortestMoves! + extra).map(e => ({
        state: i, successor: e.to, action: e.action,
        earliestPour: graph.nodes[i].depth + 1, remainingMoves: graph.distances[e.to],
        emptyReceiverGain: spaces[e.to].emptyReceivers - spaces[i].emptyReceivers,
        minimumCompatibleSlotsBefore: resources[i].minimum, minimumCompatibleSlotsAfter: resources[e.to].minimum,
        openReceivingCapacityGain: spaces[e.to].openCapacity - spaces[i].openCapacity,
        openFreeSlotsGain: spaces[e.to].freeSlots - spaces[i].freeSlots,
      })));
      return { trigger: t.id, kind: t.when.type === 'empty' ? 'key' : 'cover',
        mandatory: !graph.nodes.some(n => n.solved && !n.frame.state.fired.includes(t.id)),
        minimumSuccessfulPreparation: Number.isFinite(milestone[k][0]) ? milestone[k][0] : null,
        before: { ...summarize(included.filter(i => !fired(i)), choices), route: routeProfile(graph, extra, choices, i => !fired(i)) },
        after: { ...summarize(included.filter(fired), choices), route: routeProfile(graph, extra, choices, fired) },
        crossings: { count: crossings.length, emptyReceiverGain: distribution(crossings.map(c => c.emptyReceiverGain)),
          openReceivingCapacityGain: distribution(crossings.map(c => c.openReceivingCapacityGain)),
          openFreeSlotsGain: distribution(crossings.map(c => c.openFreeSlotsGain)),
          earliestPour: distribution(crossings.map(c => c.earliestPour)), remainingMoves: distribution(crossings.map(c => c.remainingMoves)),
          examples: crossings.slice(0, 12) } };
    });
    // A state may appear at several elapsed lengths on N+2 walks; retain them all.
    let frontier = new Set([0]);
    const curve = [];
    for (let elapsed = 0; elapsed <= graph.shortestMoves! + extra && frontier.size; elapsed++) {
      curve.push({ elapsedPours: elapsed, ...summarize([...frontier].filter(i => !graph.nodes[i].solved), choices) });
      frontier = new Set([...frontier].flatMap(i => graph.nodes[i].edges.filter(e => elapsed + 1 + graph.distances[e.to] <= graph.shortestMoves! + extra).map(e => e.to)));
    }
    return { extraPours: extra, summary, route: { ...routeProfile(graph, extra, choices, () => true), ...routeRuns(graph, extra, choices) }, milestones, curve,
      examples: included.filter(i => choices[i].consequential).sort((a, b) => Number(choices[b].dead > 0) - Number(choices[a].dead > 0)
        || choices[b].successors - choices[a].successors || a - b).slice(0, 12).map(i => ({ state: i, frame: graph.nodes[i].frame, ...choices[i],
          alternatives: uniqueEdges(graph, i).map(e => ({ action: e.action, successor: e.to, neutral: e.to === i,
            remainingMoves: Number.isFinite(graph.distances[e.to]) ? graph.distances[e.to] : null,
            regret: Number.isFinite(graph.distances[e.to]) ? 1 + graph.distances[e.to] - graph.distances[i] : null,
            successfulPreparation: Object.fromEntries(triggers.map((t, k) => [t.id, Number.isFinite(milestone[k][e.to]) ? milestone[k][e.to] : null])),
            space: spaces[e.to] })) })) };
  };
  return { status: 'complete' as const, method: DECISION_ANALYSIS_METHOD,
    policy: { name: 'public-progress-v1', maxHorizon: MAX_PROGRESS_HORIZON,
      meaning: 'Minimum tested horizon at which ALL best public-progress actions have optimal exact continuation cost. Policy proxy only, not required human foresight. Hidden states are unavailable; no success by the limit is unresolved, never high difficulty.' },
    shortest: corridor(0), plusTwo: corridor(2),
    limits: 'Full-truth fixed-layout consequences, not public-information fairness or human quality grades. Self-loops are neutral. Resource signatures and successful milestone distances describe differences, not proof of mandatory resource needs. Counts, peaks and durations stay separate; more traps or routes never give quality points. Tail is relative to this consequence definition, not a claim of effortless human play.' };
}

export type DecisionAnalysis = ReturnType<typeof analyzeRatingDecisions>;
export function compareRatingDecisions(original: DecisionAnalysis, reference: DecisionAnalysis) {
  if (original.status !== 'complete' || reference.status !== 'complete') return { status: 'blocked' as const, reason: 'Both definitions must be solvable.' };
  const contrast = (a: typeof original.shortest, b: typeof original.shortest) => ({
    consequentialFraction: a.summary.consequentialFraction === null || b.summary.consequentialFraction === null ? null : a.summary.consequentialFraction - b.summary.consequentialFraction,
    optimalPlanningStates: a.summary.optimalPlanningStates - b.summary.optimalPlanningStates,
    costSensitiveStates: a.summary.costSensitiveStates - b.summary.costSensitiveStates,
    deadAlternativeStates: a.summary.deadAlternativeStates - b.summary.deadAlternativeStates,
    publicProgressHorizonComparable: a.summary.publicProgressHorizon.unavailable === 0 && b.summary.publicProgressHorizon.unavailable === 0,
    publicProgressHorizonMedian: a.summary.publicProgressHorizon.unavailable || b.summary.publicProgressHorizon.unavailable
      || a.summary.choiceProgressHorizon.resolved.median === null || b.summary.choiceProgressHorizon.resolved.median === null ? null
      : a.summary.choiceProgressHorizon.resolved.median - b.summary.choiceProgressHorizon.resolved.median,
    publicProgressHorizonPeak: a.summary.publicProgressHorizon.unavailable || b.summary.publicProgressHorizon.unavailable
      || a.summary.choiceProgressHorizon.resolved.max === null || b.summary.choiceProgressHorizon.resolved.max === null ? null
      : a.summary.choiceProgressHorizon.resolved.max - b.summary.choiceProgressHorizon.resolved.max,
    minimumCompatibleSlotsMedian: a.summary.minimumCompatibleSlots.median === null || b.summary.minimumCompatibleSlots.median === null ? null
      : a.summary.minimumCompatibleSlots.median - b.summary.minimumCompatibleSlots.median,
    route: Object.fromEntries(Object.entries(a.route).map(([key, value]) => {
      const other = b.route[key as keyof typeof b.route];
      return [key, { min: value.min === null || other.min === null ? null : value.min - other.min,
        max: value.max === null || other.max === null ? null : value.max - other.max }];
    })) });
  return { status: 'complete' as const, method: DECISION_ANALYSIS_METHOD, direction: 'original minus reference',
    shortest: contrast(original.shortest, reference.shortest), plusTwo: contrast(original.plusTwo, reference.plusTwo),
    interpretation: 'Matched automatic measurements only. State totals depend on corridor size; compare fractions and route ranges too. Mixed changes do not imply a scalar harder/easier or quality judgment; no inherited score or mechanism bonus.' };
}
