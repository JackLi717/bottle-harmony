import { transitionEngine, type EngineFrame, type EngineRuntime } from '../../src/game/engine.ts';
import { colorRuns, type RatingGraph, type GraphUnknown } from './unlockRatingGraph.ts';
import { STAGE_POLICIES, stagePolicyPhase, replayRatingPath } from './unlockStageDifficulty.ts';

export type DisclosureKind = 'cloth' | 'reveal' | 'key-cloth' | 'key-reveal' | 'two-key-reveal';
class WorkLimit extends Error {}

/** Public progress only: no concealed true color enters preparation selection.
 * Cloth: collect the closest pending condition color, then reduce open runs.
 * Reveal: remove the fewest known portions above a masked boundary, then reduce
 * known runs. With no pending disclosure, use ordinary full-board sorting. */
export function disclosureProgress(rt: EngineRuntime, f: EngineFrame, kind: DisclosureKind) {
  const known = new Set(f.known), p = rt.puzzle;
  const runs = f.state.contents.reduce((sum, stack, i) => sum + (f.state.open[i] ? stack.filter((id, d) => known.has(id)
    && (!d || !known.has(stack[d - 1]) || rt.unitColors.get(id) !== rt.unitColors.get(stack[d - 1]))).length : 0), 0);
  // A combined task keeps explicit targets, with the original key progress.
  // Visible masks are explored first; concealed box contents are never counted
  // as visible mask depths. Afterwards acquire the currently available key.
  const key = p.triggers.find(t => t.when.type === 'empty' && !f.state.fired.includes(t.id)
    && f.state.open[rt.containerIndex.get(t.when.container)!]);
  const maskDepths = f.state.contents.flatMap((s, i) => {
    if (!f.state.open[i]) return [];
    const last = s.findLastIndex(id => !known.has(id));
    return last < 0 ? [] : [s.length - last - 1];
  });
  if (kind.endsWith('reveal') && kind !== 'reveal' && maskDepths.length) return Math.min(...maskDepths) * (p.units.length + 1) + runs;
  if (kind !== 'cloth' && kind !== 'reveal' && key?.when.type === 'empty') return f.state.contents[rt.containerIndex.get(key.when.container)!].length * (p.units.length + 1) + runs;
  let remaining: number[];
  if (kind === 'cloth' || kind === 'key-cloth') {
    remaining = p.triggers.filter(t => !f.state.fired.includes(t.id)).map(t => {
      const color = t.when.type === 'color-full' ? t.when.color : '';
      return 4 - Math.max(0, ...f.state.contents.map((s, i) => f.state.open[i] ? s.filter(id => known.has(id) && rt.unitColors.get(id) === color).length : 0));
    });
  } else {
    remaining = maskDepths;
  }
  return remaining.length ? Math.min(...remaining) * (p.units.length + 1) + runs : runs;
}

/** Same seven preparation/lookahead policies as keys. Couple all actual
 * disclosure boundaries before minimizing the largest stage. Never splice
 * easy stages from different routes, or turn an exhausted ladder into grade 7.
 * Difficulty describes the true fixed layout; public safety is a separate gate. */
export function analyzeDisclosureDifficulty(graph: RatingGraph | GraphUnknown, kind: DisclosureKind, maxWork = 2000000) {
  if (!Number.isSafeInteger(maxWork) || maxWork < 1 || maxWork > 50000000) throw Error('Invalid stage work budget');
  const binding = { method: `${kind}-stage-planning-v1`, stageMethod: 'goal-stage-planning-v1', policies: STAGE_POLICIES, budget: { maxWork } };
  const empty = { rank: null, stageRanks: null, witness: null };
  if (graph.status === 'unknown') return { ...binding, ...empty, status: 'unknown' as const, reason: `graph-${graph.reason}`, work: 0 };
  if (graph.shortestMoves === null) return { ...binding, ...empty, status: 'blocked' as const, reason: 'unsolvable', work: 0 };
  let work = 0;
  const charge = () => { if (work >= maxWork) throw new WorkLimit(); work++; };
  const progress = graph.nodes.map(n => disclosureProgress(graph.runtime, n.frame, kind));
  const stamp = (f: EngineFrame) => JSON.stringify([f.state.fired, f.known.length]);
  const phases = new Map<string, ReturnType<typeof stagePolicyPhase>>();
  type End = { path: number[]; stages: { rank: number; end: number; length: number }[] };
  const cache = new Map<string, End | null>();
  const checks: { state: number; rank: number; passed: boolean }[] = [];
  function solve(root: number, limit: number): End | null {
    charge();
    if (graph.status !== 'complete') throw Error('Missing complete graph');
    if (graph.nodes[root].solved) return { path: [], stages: [] };
    const address = `${root}:${limit}`;
    if (cache.has(address)) return cache.get(address)!;
    const initial = graph.nodes[root].frame, identity = stamp(initial);
    let phase = phases.get(identity);
    if (!phase) {
      phase = stagePolicyPhase(graph, i => graph.nodes[i].solved || stamp(graph.nodes[i].frame) !== identity, progress, charge);
      phases.set(identity, phase);
    }
    // Every recursive boundary exposes information or fires a condition;
    // neutral preparation stays inside the unchanged strategy kernel.
    for (const config of STAGE_POLICIES.slice(0, limit)) {
      charge(); const policy = phase.policy(config), passed = policy.verify(root);
      checks.push({ state: root, rank: config.rank, passed });
      if (!passed) continue;
      for (const [end, path] of policy.witnesses(root, true)) {
        charge();
        if (!Number.isFinite(graph.distances[end])) continue;
        const tail = solve(end, limit);
        if (tail) {
          const result = { path: [...path, ...tail.path], stages: [{ rank: config.rank, end, length: path.length }, ...tail.stages] };
          cache.set(address, result); return result;
        }
      }
    }
    cache.set(address, null); return null;
  }
  try {
    for (const config of STAGE_POLICIES) {
      const found = solve(0, config.rank);
      if (!found) continue;
      const route = replayRatingPath(graph, [0, ...found.path]);
      let f = graph.nodes[0].frame, offset = 0;
      const stages = found.stages.map(s => {
        const start = f, startPour = offset;
        for (const action of route.slice(offset, offset + s.length)) {
          const next = transitionEngine(graph.runtime, f.state, f.known, action);
          if (!next.accepted) throw Error('Invalid disclosure stage witness');
          f = { state: next.state, known: next.known };
        }
        offset += s.length;
        const opened = f.state.fired.filter(id => !start.state.fired.includes(id));
        const revealed = f.known.filter(id => !start.known.includes(id));
        const keys = opened.filter(id => graph.runtime.puzzle.triggers.find(t => t.id === id)!.when.type === 'empty');
        return { rank: s.rank, goal: keys.length ? opened.length > keys.length ? 'acquire-key-and-open-cover' : 'acquire-key' : opened.length ? 'open-next-cover' : revealed.length ? 'reveal-next-portion' : 'sort',
          startPour, endPour: offset, opened, revealed, frame: f,
          merges: colorRuns(graph.runtime, start) - colorRuns(graph.runtime, f) };
      });
      const stageRanks = stages.map(s => s.rank), rank = Math.max(0, ...stageRanks);
      return { ...binding, status: 'rated' as const, reason: null, rank, stageRanks, witness: { route, stages }, work, checks };
    }
    return { ...binding, ...empty, status: 'unknown' as const, reason: 'outside-policy-range', work, checks };
  } catch (e) {
    if (!(e instanceof WorkLimit)) throw e;
    return { ...binding, ...empty, status: 'unknown' as const, reason: 'policy-work', work, checks };
  }
}
