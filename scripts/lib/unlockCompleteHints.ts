import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { createEngineSession, initialEngineState, listEngineActions, transitionEngine, type EngineAction, type EngineFrame } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import { singleKeyHintKey, singleKeyTableHint, type SingleKeyHintTable } from '../../src/game/unlockHints.ts';
import { buildRatingGraph, type RatingGraph } from './unlockRatingGraph.ts';
import { proveSingleKeyDisclosure, type DisclosureBudget } from './unlockPublicDisclosure.ts';
import { sha256 } from './unlockRatingEvidence.ts';

type Entry = { number: number; puzzle: SortingPuzzle; route: readonly EngineAction[]; acceptance: { status: string; evidenceSha256: string } };
type Boundary = { status: 'pass' | 'fail'; worlds: number | null; budget?: DisclosureBudget; proofSha256?: string; acceptanceSha256?: string };
function routeThrough(graph: RatingGraph, from: number, to: number) {
  const chain = [from];
  for (let i = from; graph.nodes[i].parent >= 0;) { i = graph.nodes[i].parent; chain.push(i); }
  chain.reverse(); chain.push(to);
  const route: EngineAction[] = []; let frame: EngineFrame = initialEngineState(graph.runtime), at = 0;
  const advance = (target: number) => {
    const action = listEngineActions(graph.runtime, frame.state, frame.known).find(a => {
      const next = transitionEngine(graph.runtime, frame.state, frame.known, a);
      return next.accepted && graph.key(next) === graph.key(graph.nodes[target].frame);
    });
    assert.ok(action); const next = transitionEngine(graph.runtime, frame.state, frame.known, action); assert.ok(next.accepted);
    frame = next; at = target; route.push(action);
  };
  for (const i of chain.slice(1)) advance(i);
  while (graph.distances[at] > 0) advance(graph.nodes[at].edges.find(e => graph.distances[e.to] === graph.distances[at] - 1)!.to);
  replayEngineRoute(graph.runtime, initialEngineState(graph.runtime), route); return route;
}

/** Seed from the accepted all-world certificate, then prove only uncovered
 * branches. Recovery is allowed only after excluding every forward public path;
 * a search limit never becomes an unsafe/unsolvable verdict. */
export function completeSingleKeyHints(entry: Entry, disclosure: DisclosureBudget, output = 'builds/unlock-hints') {
  assert.equal(entry.acceptance.status, 'pass'); assert.match(entry.acceptance.evidenceSha256, /^[a-f0-9]{64}$/);
  mkdirSync(output, { recursive: true });
  const graph = buildRatingGraph(entry.puzzle); assert.equal(graph.status, 'complete'); assert.ok(graph.status === 'complete');
  const key = singleKeyHintKey(graph.runtime), keys = graph.nodes.map(n => key(n.frame.state)), indices = new Map(keys.map((k, i) => [k, i]));
  assert.equal(indices.size, graph.nodes.length);
  const budget = { ...disclosure, maxStatesPerWorld: 1000000 }, cachePath = `${output}/cache-${sha256(entry.puzzle)}.json`;
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null;
  if (cache) {
    const { evidenceSha256, ...payload } = cache; assert.equal(evidenceSha256, sha256(payload));
    assert.equal(cache.method, 'single-key-boundary-cache-v1'); assert.equal(cache.binding, graph.runtime.binding); assert.equal(cache.budgetSha256, sha256(budget));
  }
  const exits: Record<string, string[]> = structuredClone(cache?.exits ?? {}), rejected: Record<string, string[]> = cache?.rejected ?? {};
  const boundaries: Record<string, Boundary> = cache?.boundaries ?? {};
  const incomplete = new Map<string, { from: number; to: number }>(Object.entries(cache?.incomplete ?? {}).map(([target, value]) => {
    const row = value as { source: string; target: string }, from = indices.get(row.source), to = indices.get(row.target);
    assert.ok(from !== undefined && to !== undefined && target === row.target); return [target, { from, to }];
  }));
  const checkpoint = () => {
    const pending = Object.fromEntries([...incomplete].map(([target, { from, to }]) => [target, { source: keys[from], target: keys[to] }]));
    const payload = { method: 'single-key-boundary-cache-v1', binding: graph.runtime.binding, budgetSha256: sha256(budget), exits, rejected, boundaries, incomplete: pending };
    writeFileSync(cachePath + '.tmp', JSON.stringify({ ...payload, evidenceSha256: sha256(payload) }) + '\n'); renameSync(cachePath + '.tmp', cachePath);
  };
  const distances = graph.nodes.map((n, i) => n.frame.state.open.every(Boolean) ? graph.distances[i] : Infinity);
  const queue: number[] = [];
  const addExit = (from: number, to: number) => {
    assert.ok(!graph.nodes[from].frame.state.open.every(Boolean) && graph.nodes[to].frame.state.open.every(Boolean));
    assert.ok(graph.nodes[from].edges.some(e => e.unlock.length && e.to === to));
    if (!(exits[keys[from]] ??= []).includes(keys[to])) exits[keys[from]].push(keys[to]);
    if (distances[from] > graph.distances[to] + 1) { distances[from] = graph.distances[to] + 1; queue.push(from); }
  };
  const relax = () => {
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const to = queue[cursor];
      for (const from of graph.nodes[to].predecessors) if (!graph.nodes[from].frame.state.open.every(Boolean) && distances[from] > distances[to] + 1) {
        distances[from] = distances[to] + 1; queue.push(from);
      }
    }
    queue.length = 0;
  };
  for (const [from, targets] of Object.entries(exits)) for (const to of targets) {
    assert.ok(indices.has(from) && indices.has(to)); addExit(indices.get(from)!, indices.get(to)!);
  }
  replayEngineRoute(graph.runtime, initialEngineState(graph.runtime), entry.route);
  let frame = initialEngineState(graph.runtime), opening: { from: number; to: number } | null = null;
  for (const action of entry.route) {
    const before = frame, next = transitionEngine(graph.runtime, frame.state, frame.known, action); assert.ok(next.accepted); frame = next;
    if (!before.state.open.every(Boolean) && frame.state.open.every(Boolean)) {
      const from = indices.get(key(before.state)), to = indices.get(key(frame.state)); assert.ok(from !== undefined && to !== undefined);
      assert.ok(boundaries[keys[to]]?.status !== 'fail', 'Accepted opening conflicts with a cached counterexample');
      boundaries[keys[to]] = { status: 'pass', worlds: null, acceptanceSha256: entry.acceptance.evidenceSha256 };
      addExit(from, to); opening = { from, to }; incomplete.delete(keys[to]); break;
    }
  }
  assert.ok(opening); relax(); assert.ok(Number.isFinite(distances[0])); checkpoint();
  const proofs: { from: number; to: number; status: string; reason: string | null; worlds: number; retried?: boolean }[] = [];
  const remember = (from: number, to: number, proof: ReturnType<typeof proveSingleKeyDisclosure>, retried = false) => {
    proofs.push({ from, to, status: proof.status, reason: proof.reason, worlds: proof.worlds.length, retried });
    console.log(`Proof ${entry.number}: ${from} → ${to}, ${retried ? 'retry ' : ''}${proof.status}, ${proof.reason ?? proof.worlds.length}`);
    if (proof.status === 'unknown') incomplete.set(keys[to], { from, to });
    else {
      assert.ok(proof.status === 'pass' || proof.reason === 'public-world-unsolvable'); incomplete.delete(keys[to]);
      boundaries[keys[to]] = { status: proof.status, worlds: proof.worlds.length, budget: proof.budget, proofSha256: sha256(proof) };
      if (proof.status === 'pass') addExit(from, to);
      else if (!(rejected[keys[from]] ??= []).includes(keys[to])) rejected[keys[from]].push(keys[to]);
    }
    relax(); checkpoint();
  };
  for (const [from, node] of graph.nodes.entries()) {
    if (node.frame.state.open.every(Boolean) || !Number.isFinite(graph.distances[from]) || Number.isFinite(distances[from])) continue;
    for (const to of new Set(node.edges.filter(e => e.unlock.length && Number.isFinite(graph.distances[e.to])).map(e => e.to))) {
      const boundary = boundaries[keys[to]];
      if (boundary) { if (boundary.status === 'pass') { addExit(from, to); relax(); } }
      else if (!incomplete.has(keys[to])) remember(from, to, proveSingleKeyDisclosure(entry.puzzle, routeThrough(graph, from, to), budget, true));
      if (Number.isFinite(distances[from])) break;
    }
  }
  for (const [boundaryKey, { from, to }] of incomplete) {
    const parents = graph.nodes.flatMap((n, i) => n.edges.some(e => e.unlock.length && keys[e.to] === boundaryKey) ? [i] : []);
    if (!parents.some(i => Number.isFinite(graph.distances[i]) && !Number.isFinite(distances[i]))) continue;
    const proof = proveSingleKeyDisclosure(entry.puzzle, routeThrough(graph, from, to), { ...budget, maxTotalStates: 50000000, maxMilliseconds: 1800000 }, true);
    remember(from, to, proof, true);
    if (proof.status === 'pass') { for (const parent of parents) addExit(parent, to); relax(); checkpoint(); }
  }
  assert.ok([...incomplete.keys()].every(target => !graph.nodes.some((n, i) => Number.isFinite(graph.distances[i]) && !Number.isFinite(distances[i])
    && n.edges.some(e => e.unlock.length && keys[e.to] === target))), `Unresolved public hint branch: ${entry.number}`);
  checkpoint();
  const finite = (n: number) => Number.isFinite(n) ? n : -1;
  const states = Object.fromEntries(keys.map((k, i) => [k, [finite(graph.distances[i]), finite(distances[i])] as const]));
  const table: SingleKeyHintTable = { binding: graph.runtime.binding, states, exits }, fresh = createEngineSession(entry.puzzle, 'offline-hint-audit');
  for (const node of graph.nodes) {
    const current = { ...fresh, ...node.frame, seen: entry.puzzle.containers.filter((_, i) => node.frame.state.open[i]).map(c => c.id) };
    const hint = singleKeyTableHint(current, table);
    if (hint.status === 'hint') {
      const next = transitionEngine(graph.runtime, current.state, current.known, hint.action); assert.ok(next.accepted);
      const column = current.state.open.every(Boolean) ? 0 : 1; assert.equal(states[key(next.state)][column], states[key(current.state)][column] - 1);
    }
  }
  return { table, check: { number: entry.number, states: keys.length, edges: graph.edges, solvable: graph.distances.filter(Number.isFinite).length,
    concealedNeedsRecovery: graph.nodes.filter((n, i) => !n.frame.state.open.every(Boolean) && Number.isFinite(graph.distances[i]) && !Number.isFinite(distances[i])).length,
    opening, openingAcceptanceSha256: entry.acceptance.evidenceSha256, proofs } };
}
