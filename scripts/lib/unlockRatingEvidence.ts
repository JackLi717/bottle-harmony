import { createHash } from 'node:crypto';
import { listEngineActions, transitionEngine, visibleEngineState } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { buildRatingGraph, completeColors, type RatingGraph } from './unlockRatingGraph.ts';
import { distribution, publicRatingFacts, ratingSpace } from './unlockRatingFacts.ts';
import { analyzeRatingDecisions, compareRatingDecisions } from './unlockDecisionAnalysis.ts';
import { unlockTrialStructure } from './unlockTrialAudit.ts';
export { distribution, publicRatingFacts, ratingSpace } from './unlockRatingFacts.ts';

export const UNLOCK_RATING_METHOD = 'classic-quality-evidence-v3';
export const sha256 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type RatingDesign = { role: 'teaching' | 'recovery' | 'challenge'; family: string;
  purpose: { event: 'sort' | 'key' | 'cover' | 'reveal' | 'order' | 'chain' | 'simultaneous'; description: string } };
export type RatingInput = { puzzle: SortingPuzzle; design: RatingDesign };
export const RATING_LIMITS = 'Fixed-layout forward play until whole-board completion; no undo histories or alternative hidden worlds. Full-truth route costs are not public-information reasoning or a fairness proof.';
export function validateDesign(design: RatingDesign) {
  if (!design || !['teaching', 'recovery', 'challenge'].includes(design.role) || !design.family?.trim()
    || !design.purpose?.description?.trim() || !['sort', 'key', 'cover', 'reveal', 'order', 'chain', 'simultaneous'].includes(design.purpose.event)) throw new Error('Explicit design role, family and checkable purpose required');
}

function outcomes(graph: RatingGraph, index: number) {
  const node = graph.nodes[index], seen = new Set<number>();
  return node.edges.filter(e => { if (seen.has(e.to)) return false; seen.add(e.to); return true; }).map(edge => {
    const next = transitionEngine(graph.runtime, node.frame.state, node.frame.known, edge.action);
    if (!next.accepted) throw new Error('Evidence witness rejected');
    const d = graph.distances[edge.to], space = ratingSpace(graph.runtime, next);
    const information = publicRatingFacts(graph.runtime, next);
    const consequence = { remainingMoves: Number.isFinite(d) ? d : null,
      regret: Number.isFinite(d) && Number.isFinite(graph.distances[index]) ? 1 + d - graph.distances[index] : null,
      fired: [...next.state.fired].sort(), emptyReceivers: space.emptyReceivers,
      freeSlots: space.freeSlots, compatibleSlots: space.compatible.map(c => c.slots).sort((a, b) => a - b),
      knownColors: information.inventory.map(c => 4 - c.count).sort((a, b) => a - b) };
    const source = graph.runtime.puzzle.containers.findIndex(c => c.id === edge.action.source);
    const target = graph.runtime.puzzle.containers.findIndex(c => c.id === edge.action.target);
    const visible = visibleEngineState(graph.runtime, node.frame.state, node.frame.known);
    return { action: edge.action, successor: edge.to, consequence,
      publicCue: { source: visible[source], receiver: visible[target] },
      events: next.events, nextPublic: information,
      consequenceClass: sha256(consequence) };
  });
}

function graphSummary(graph: ReturnType<typeof buildRatingGraph>) {
  if (graph.status === 'unknown') return graph;
  return { ...completeGraphSummary(graph), decisions: analyzeRatingDecisions(graph) };
}
function completeGraphSummary(graph: RatingGraph) {
  return { status: graph.status, states: graph.nodes.length, edges: graph.edges, deadEnds: graph.deadEnds,
    shortestMoves: graph.shortestMoves, route: graph.route,
    firedSets: [...new Set(graph.nodes.map(n => [...n.frame.state.fired].sort().join(',')))].sort(),
    choiceWidths: distribution(graph.nodes.filter(n => !n.solved).map(n => new Set(n.edges.map(e => e.to)).size)) };
}

/** Finite route-length-bounded DP over (state, current run, historical peak).
 * Keeping the joint pair avoids inventing extrema by combining different routes. */
function routeRhythm(graph: RatingGraph, extra: number, widths: number[]) {
  if (graph.shortestMoves === null) return null;
  const limit = graph.shortestMoves + extra, base = limit + 2;
  const empty = graph.nodes.map(n => ratingSpace(graph.runtime, n.frame).emptyReceivers);
  const compute = (kind: 'preparation' | 'single' | 'tail' | 'no-empty') => {
    let frontier = new Map<number, Set<number>>([[0, new Set([0])]]);
    const terminal = new Set<number>();
    let stateSteps = 0;
    for (let step = 0; step <= limit; step++) {
      const nextFrontier = new Map<number, Set<number>>();
      for (const [index, pairs] of frontier) {
        stateSteps++;
        if (graph.nodes[index].solved) {
          for (const pair of pairs) terminal.add(kind === 'tail' ? pair % base : Math.floor(pair / base));
          continue;
        }
        for (const edge of graph.nodes[index].edges) {
          if (step + 1 + graph.distances[edge.to] > limit) continue;
          let destination = nextFrontier.get(edge.to);
          if (!destination) { destination = new Set(); nextFrontier.set(edge.to, destination); }
          for (const pair of pairs) {
            const previous = pair % base, peak = Math.floor(pair / base);
            const run = kind === 'preparation' ? (edge.breakthrough ? 0 : previous + 1)
              : kind === 'single' ? (widths[index] === 1 ? previous + 1 : 0)
              : kind === 'no-empty' ? (empty[index] === 0 ? previous + 1 : 0)
              : widths[index] > 1 ? 0 : previous + 1;
            destination.add(run + Math.max(peak, run) * base);
          }
        }
      }
      frontier = nextFrontier;
    }
    const values = [...terminal];
    return { stateSteps, min: values.reduce((n, v) => Math.min(n, v), Infinity), max: values.reduce((n, v) => Math.max(n, v), -Infinity) };
  };
  return { longestPreparation: compute('preparation'), longestSingleConsequenceRun: compute('single'), tailAfterLastChoice: compute('tail'), noEmptyReceiverRun: compute('no-empty'),
    units: 'pours; ranges over all quotient walks completing in at most N+extra steps; no subjective pressure threshold' };
}

function prepareDistances(graph: RatingGraph) {
  const distance = graph.nodes.map(n => n.edges.some(e => e.breakthrough) ? 1 : Infinity);
  const queue = distance.flatMap((d, i) => Number.isFinite(d) ? [i] : []);
  for (let cursor = 0; cursor < queue.length; cursor++) for (const p of graph.nodes[queue[cursor]].predecessors) {
    if (distance[p] <= distance[queue[cursor]] + 1) continue;
    distance[p] = distance[queue[cursor]] + 1; queue.push(p);
  }
  return distance;
}

function corridor(graph: RatingGraph, extra: number) {
  const included = graph.nodes.flatMap((n, i) => graph.shortestMoves !== null && n.depth + graph.distances[i] <= graph.shortestMoves + extra ? [i] : []);
  const observation = new Set<number>(included.length ? [0] : []), widths = graph.nodes.map(() => 0);
  const preparations = prepareDistances(graph);
  for (const i of included) for (const e of graph.nodes[i].edges) {
    if (e.breakthrough && graph.nodes[i].depth + 1 + graph.distances[e.to] <= graph.shortestMoves! + extra) observation.add(e.to);
  }
  const facts = included.map(i => {
    const candidates = outcomes(graph, i), classes = new Set(candidates.map(c => c.consequenceClass)).size;
    widths[i] = classes;
    return { i, candidates, classes, space: ratingSpace(graph.runtime, graph.nodes[i].frame) };
  });
  const observed = facts.filter(f => observation.has(f.i));
  // Full distributions cover every included state. Detailed examples are bounded and
  // selected deterministically, with each example retaining ALL non-equivalent actions.
  const examples = [...observed].sort((a, b) => b.classes - a.classes || a.i - b.i).slice(0, 12).map(f => ({
    state: f.i, minimumElapsedPours: graph.nodes[f.i].depth, remainingMoves: graph.distances[f.i],
    frame: graph.nodes[f.i].frame, public: publicRatingFacts(graph.runtime, graph.nodes[f.i].frame), space: f.space,
    consequenceClasses: f.classes, preparationToNextEvent: Number.isFinite(preparations[f.i]) ? preparations[f.i] : null,
    candidates: f.candidates,
    receiverContention: graph.runtime.puzzle.containers.flatMap(c => {
      const users = f.candidates.filter(x => x.action.target === c.id).map(x => x.action.source);
      return new Set(users).size > 1 ? [{ receiver: c.id, sources: [...new Set(users)], meaning: 'legal alternatives share a receiver; does not prove goal competition' }] : [];
    }),
  }));
  return { extraPours: extra, states: included.length, observationStates: observed.length,
    coverage: 'All equivalent states on all complete routes of length <=N+extra; observations at start and every merge/unlock/reveal/completed-color destination. All legal successors included in each observation, even off-corridor.',
    equivalentChoices: distribution(facts.map(f => f.candidates.length)), consequenceClasses: distribution(facts.map(f => f.classes)),
    observedClasses: distribution(observed.map(f => f.classes)),
    successorCosts: distribution(observed.flatMap(f => f.candidates.flatMap(c => c.consequence.remainingMoves === null ? [] : [c.consequence.remainingMoves]))),
    regrets: distribution(observed.flatMap(f => f.candidates.flatMap(c => c.consequence.regret === null ? [] : [c.consequence.regret]))),
    unsolvableSuccessors: observed.reduce((n, f) => n + f.candidates.filter(c => c.consequence.remainingMoves === null).length, 0),
    stages: [...new Set(observed.map(f => [...graph.nodes[f.i].frame.state.fired].sort().join(',')))].sort().map(fired => {
      const samples = observed.filter(f => [...graph.nodes[f.i].frame.state.fired].sort().join(',') === fired);
      return { fired, observations: samples.length, consequenceClasses: distribution(samples.map(f => f.classes)),
        emptyReceivers: distribution(samples.map(f => f.space.emptyReceivers)) };
    }), emptyReceivers: distribution(facts.map(f => f.space.emptyReceivers)),
    compatibleSlots: distribution(facts.flatMap(f => f.space.compatible.map(c => c.slots))),
    preparationToNextEvent: distribution(observed.flatMap(f => Number.isFinite(preparations[f.i]) ? [preparations[f.i]] : [])),
    rhythm: routeRhythm(graph, extra, widths), examples,
    consequenceEquivalence: 'Same exact remaining cost, fired set, empty receivers, free slots, sorted compatible capacities and known-color counts. A descriptive projection, not proof of equal strategic value.',
    lookahead: { status: 'separate-policy-measurement', evidenceRef: 'decisions', reason: 'Fixed public-progress policy horizons are measured separately; public-cue similarity and human D1 grade mapping remain unimplemented. Preparation distance is not D1.' } };
}

function dependencies(graph: RatingGraph) {
  const triggers = graph.runtime.puzzle.triggers;
  return { conditions: triggers.map(t => ({ ...t, resources: t.unlock.map(id => {
    const c = graph.runtime.puzzle.containers.find(c => c.id === id)!;
    return { container: id, capacity: c.capacity, initialPortions: c.units.length, kind: c.units.length ? 'liquid-and-space' : 'empty-space' };
  }) })),
  structuralKeyPrecedence: triggers.flatMap(b => b.when.type === 'empty' ? triggers.filter(a => a.id !== b.id && a.unlock.includes(b.when.type === 'empty' ? b.when.container : '')).map(a => ({ before: a.id, after: b.id })) : []),
  verifiedPrecedence: triggers.flatMap(b => triggers.flatMap(a => {
    if (a.id === b.id) return [];
    const reached = graph.nodes.filter(n => n.frame.state.fired.includes(b.id));
    return reached.length && reached.every(n => n.frame.state.fired.includes(a.id)) ? [{ beforeOrTogether: a.id, after: b.id, witnessStates: reached.length }] : [];
  })),
  firedSets: [...new Set(graph.nodes.map(n => [...n.frame.state.fired].sort().join(',')))].sort(),
  simultaneous: [...new Set(graph.nodes.flatMap(n => n.edges.filter(e => e.unlock.length > 1).map(e => [...e.unlock].sort().join(','))))].sort(),
  scope: 'Precedence over the full fixed-layout action graph, includes simultaneity and optional triggers. No extra unlock completion goal.' };
}

function purposeEvidence(graph: RatingGraph, design: RatingDesign) {
  const triggers = graph.runtime.puzzle.triggers;
  const wanted = new Set(triggers.filter(t => design.purpose.event === 'key' ? t.when.type === 'empty' : t.when.type === 'color-full').map(t => t.id));
  let witnesses = 0;
  for (const node of graph.nodes) for (const edge of node.edges) {
    if ((design.purpose.event === 'key' || design.purpose.event === 'cover') && edge.unlock.some(t => wanted.has(t))
      || design.purpose.event === 'reveal' && edge.reveal.some(u => graph.runtime.hidden.has(u))
      || design.purpose.event === 'simultaneous' && edge.unlock.length > 1) witnesses++;
  }
  if (design.purpose.event === 'sort') witnesses = graph.nodes.filter(n => n.solved).length;
  if (design.purpose.event === 'order') witnesses = triggers.flatMap(a => triggers.filter(b => a.id < b.id
    && graph.nodes.some(n => n.frame.state.fired.includes(a.id) && !n.frame.state.fired.includes(b.id))
    && graph.nodes.some(n => n.frame.state.fired.includes(b.id) && !n.frame.state.fired.includes(a.id)))).length;
  if (design.purpose.event === 'chain') witnesses = triggers.flatMap(a => triggers.filter(b => a.id !== b.id
    && graph.nodes.some(n => n.frame.state.fired.includes(a.id) && !n.frame.state.fired.includes(b.id))
    && graph.nodes.some(n => n.frame.state.fired.includes(b.id))
    && graph.nodes.every(n => !n.frame.state.fired.includes(b.id) || n.frame.state.fired.includes(a.id)))).length;
  return { event: design.purpose.event, observed: witnesses > 0, witnesses,
    interpretation: 'Event/pair existence in the fixed-layout graph only; does not establish design value, teaching clarity or required reasoning.' };
}

function trace(graph: RatingGraph) {
  let frame = graph.nodes[0].frame;
  return graph.route.map((action, i) => {
    const before = publicRatingFacts(graph.runtime, frame), next = transitionEngine(graph.runtime, frame.state, frame.known, action);
    if (!next.accepted) throw new Error('Trace action rejected');
    const row = { step: i + 1, action, events: next.events, progressiveReveals: next.events.flatMap(e => e.type === 'reveal' ? e.units.filter(u => graph.runtime.hidden.has(u)) : []),
      before, after: publicRatingFacts(graph.runtime, next), fullTruthCompletedColors: completeColors(graph.runtime, next),
      publicLegalActionsBefore: listEngineActions(graph.runtime, frame.state, frame.known),
      publicLegalActionsAfter: listEngineActions(graph.runtime, next.state, next.known) };
    frame = next; return row;
  });
}

function openTargets(puzzle: SortingPuzzle, targets: readonly string[]): SortingPuzzle {
  return { ...puzzle, locked: puzzle.locked.filter(c => !targets.includes(c)),
    triggers: puzzle.triggers.map(t => ({ ...t, unlock: t.unlock.filter(c => !targets.includes(c)) })).filter(t => t.unlock.length) };
}
export function ratingComparisonSet(inputs: readonly RatingInput[]) {
  if (!inputs.length || new Set(inputs.map(i => i.puzzle.id)).size !== inputs.length) throw new Error('Comparison set must have unique puzzle IDs');
  const structures = inputs.map(({ puzzle, design }) => { validateDesign(design); return { id: puzzle.id, family: design.family, designSha256: sha256(design), definitionSha256: sha256(puzzle),
    structure: sha256(unlockTrialStructure(puzzle)),
    base: sha256(unlockTrialStructure({ ...puzzle, locked: [], hidden: [], triggers: [] })),
    features: { colors: puzzle.colors.length, bottles: puzzle.containers.length, keys: puzzle.triggers.filter(t => t.when.type === 'empty').length,
      covers: puzzle.triggers.filter(t => t.when.type === 'color-full').length, hidden: puzzle.hidden.length } }; });
  return { sha256: sha256(inputs.map(i => ({ puzzle: i.puzzle, design: i.design })).sort((a, b) => a.puzzle.id.localeCompare(b.puzzle.id))), structures };
}
export function extractUnlockRating(input: RatingInput, comparison: ReturnType<typeof ratingComparisonSet>, maxStates = 250000, maxEdges = 4000000) {
  validateDesign(input.design);
  const { puzzle, design } = input;
  const own = comparison.structures.find(c => c.id === puzzle.id);
  if (!own || own.designSha256 !== sha256(design) || own.definitionSha256 !== sha256(puzzle)
    || own.structure !== sha256(unlockTrialStructure(puzzle))) throw new Error('Comparison set does not bind this puzzle');
  const graph = buildRatingGraph(puzzle, maxStates, maxEdges);
  const nearest = comparison.structures.filter(c => c.id !== puzzle.id).map(c => ({ id: c.id, family: c.family,
    exactDuplicate: c.structure === own.structure, sameBase: c.base === own.base,
    differences: Object.keys(own.features).filter(k => own.features[k as keyof typeof own.features] !== c.features[k as keyof typeof c.features]),
    featureDistance: Object.keys(own.features).reduce((n, k) => n + Math.abs(own.features[k as keyof typeof own.features] - c.features[k as keyof typeof c.features]), 0) }))
    .sort((a, b) => Number(b.exactDuplicate) - Number(a.exactDuplicate) || Number(b.sameBase) - Number(a.sameBase) || a.featureDistance - b.featureDistance || a.id.localeCompare(b.id));
  const binding = { puzzleId: puzzle.id, method: UNLOCK_RATING_METHOD, rules: puzzle.rules, definitionSha256: sha256(puzzle), structureSha256: own.structure, classicStructureSha256: own.base,
    design, comparisonSha256: comparison.sha256, budget: { maxStates, maxEdges } };
  if (graph.status === 'unknown') return { ...binding, status: 'unknown' as const, graph, evidence: null, evidenceSha256: sha256({ binding, graph }), limits: RATING_LIMITS };
  const decisions = analyzeRatingDecisions(graph);
  const originalSummary = { ...completeGraphSummary(graph), decisions };
  const ablationCache = new Map<string, ReturnType<typeof graphSummary>>([[sha256(puzzle), originalSummary]]);
  const ablate = (candidate: SortingPuzzle) => {
    const hash = sha256(candidate);
    let summary = ablationCache.get(hash);
    if (!summary) { summary = graphSummary(buildRatingGraph(candidate, maxStates, maxEdges)); ablationCache.set(hash, summary); }
    return { definitionSha256: hash, ...summary };
  };
  const timeline = trace(graph);
  const ablations = { allOpen: ablate({ ...puzzle, locked: [], triggers: [] }),
    fullyVisible: ablate({ ...puzzle, hidden: [] }),
    classicBase: ablate({ ...puzzle, locked: [], hidden: [], triggers: [] }),
    individual: puzzle.triggers.map(t => ({ trigger: t.id, openedTargets: t.unlock, result: ablate(openTargets(puzzle, t.unlock)) })) };
  const compare = (reference: ReturnType<typeof ablate>) => ({ definitionSha256: reference.definitionSha256,
    ...(reference.status === 'unknown' ? { status: 'unknown' as const, reason: reference.reason }
      : compareRatingDecisions(decisions, reference.decisions)) });
  const evidence = { declaredPurpose: purposeEvidence(graph, design), admission: { solvability: graph.shortestMoves === null ? 'unsolvable' : 'solved', fixedLayoutAllActionsSafe: graph.deadEnds === 0,
    publicInformationFairness: puzzle.hidden.length || puzzle.locked.length ? 'unknown' : 'fully-visible', productionEligible: false }, graph: completeGraphSummary(graph), shortest: corridor(graph, 0), plusTwo: corridor(graph, 2),
    mechanisms: { ...dependencies(graph), referenceResourceUse: puzzle.locked.map(container => {
      const opened = timeline.find(row => row.events.some(e => e.type === 'unlock' && e.containers.includes(container)));
      const used = timeline.find(row => opened && row.step > opened.step && (row.action.source === container || row.action.target === container));
      return { container, openedAt: opened?.step ?? null, firstUsedAt: used?.step ?? null, scope: 'One replayed shortest route; participation is not mechanism value.' };
    }) },
    decisions, ablations,
    decisionComparisons: { classicBase: compare(ablations.classicBase), allOpen: compare(ablations.allOpen), fullyVisible: compare(ablations.fullyVisible),
      individual: ablations.individual.map(a => ({ trigger: a.trigger, comparison: compare(a.result) })) },
    information: { source: 'public visible state and public four-of-each inventory only', trace: timeline,
      fairness: puzzle.hidden.length || puzzle.locked.length ? 'unknown-alternative-worlds-not-enumerated' : 'fully-visible',
      reasoningGrade: 'unimplemented-automatic-mapping; reveal counts and full-truth costs do not establish inference demand' },
    expression: { ruleChecks: { strictDefinition: true, fourOfEach: true, wholeBoardGoal: true, automaticEvents: true },
      presentation: 'unimplemented automatic presentation checks: readable conditions, linked targets, known/unknown distinction, reveal feedback and seen-relocked rendering require presentation evidence' },
    novelty: { comparisonSha256: comparison.sha256, family: design.family, nearest,
      distanceMeaning: 'L1 distance of colors/bottles/keys/covers/hidden counts; descriptive only. Exact duplicates use full canonical structure. Neither distance nor family label gives Q5.' } };
  return { ...binding, status: 'complete' as const, evidence, evidenceSha256: sha256({ binding, evidence }), limits: RATING_LIMITS };
}
export type UnlockRatingReport = ReturnType<typeof extractUnlockRating>;

/** Match actual classic controls by canonical base structure, never by editorial
 * family names or an inherited classic score. Each side keeps its own evidence. */
export function pairedRatingComparisons(reports: readonly UnlockRatingReport[]) {
  return reports.flatMap(original => reports.filter(reference => reference.puzzleId !== original.puzzleId
    && reference.structureSha256 === reference.classicStructureSha256
    && original.classicStructureSha256 === reference.structureSha256).map(reference => ({
      original: original.puzzleId, reference: reference.puzzleId,
      originalEvidenceSha256: original.evidenceSha256, referenceEvidenceSha256: reference.evidenceSha256,
      ...(original.status === 'unknown' || reference.status === 'unknown' ? { status: 'unknown' as const, reason: 'Required graph search is unknown.' }
        : compareRatingDecisions(original.evidence.decisions, reference.evidence.decisions)),
    })));
}
