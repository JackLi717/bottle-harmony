import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createEngineSession, initialEngineState, listEngineActions, transitionEngine, type EngineAction, type EngineFrame } from '../src/game/engine.ts';
import { replayEngineRoute } from '../src/game/engineSearch.ts';
import { singleKeyHintKey, singleKeyTableHint, type SingleKeyHintTable } from '../src/game/unlockHints.ts';
import { buildRatingGraph, type RatingGraph } from './lib/unlockRatingGraph.ts';
import { proveSingleKeyDisclosure } from './lib/unlockPublicDisclosure.ts';
import { sha256 } from './lib/unlockRatingEvidence.ts';

const bank = JSON.parse(readFileSync('assets/levels/unlock-post-key-20.json', 'utf8'));
const extend = process.argv.slice(2);
assert.ok(!extend.length || (extend.length === 1 && extend[0] === '--extend-certified'), 'Unknown option');
const prior = extend.length ? JSON.parse(readFileSync('assets/levels/unlock-post-key-hints.json', 'utf8')) : null;
if (prior) {
  const { evidenceSha256, ...payload } = prior;
  assert.equal(evidenceSha256, sha256(payload)); assert.equal(prior.bankEvidenceSha256, bank.evidenceSha256);
}
const output = 'builds/unlock-hints'; mkdirSync(output, { recursive: true });
const tables: Record<string, SingleKeyHintTable> = {}, checks = [];
function routeThrough(graph: RatingGraph, from: number, to: number) {
  const chain = [from];
  for (let i = from; graph.nodes[i].parent >= 0;) { i = graph.nodes[i].parent; chain.push(i); }
  chain.reverse(); chain.push(to);
  const route: EngineAction[] = []; let frame: EngineFrame = initialEngineState(graph.runtime), at = 0;
  const advance = (target: number) => {
    const candidate = listEngineActions(graph.runtime, frame.state, frame.known).find(action => {
      const next = transitionEngine(graph.runtime, frame.state, frame.known, action);
      return next.accepted && graph.key(next) === graph.key(graph.nodes[target].frame);
    });
    assert.ok(candidate); const next = transitionEngine(graph.runtime, frame.state, frame.known, candidate); assert.ok(next.accepted);
    frame = next; at = target; route.push(candidate);
  };
  for (const index of chain.slice(1)) advance(index);
  while (graph.distances[at] > 0) advance(graph.nodes[at].edges.find(e => graph.distances[e.to] === graph.distances[at] - 1)!.to);
  replayEngineRoute(graph.runtime, initialEngineState(graph.runtime), route);
  return route;
}
for (const entry of bank.entries) {
  const graph = buildRatingGraph(entry.puzzle); assert.equal(graph.status, 'complete'); assert.ok(graph.status === 'complete');
  const key = singleKeyHintKey(graph.runtime), keys = graph.nodes.map(n => key(n.frame.state));
  assert.equal(new Set(keys).size, graph.nodes.length, 'Hint quotient differs from verified graph');
  const publicDistance = graph.nodes.map((n, i) => n.frame.state.open.every(Boolean) ? graph.distances[i] : Infinity);
  const exits: Record<string, string[]> = {}, proofs = [];
  for (const [i, node] of graph.nodes.entries()) {
    for (const to of new Set(node.edges.filter(e => e.unlock.length && Number.isFinite(graph.distances[e.to])).map(e => e.to))) {
      const cached = prior?.tables[entry.puzzle.id];
      assert.ok(!cached || cached.binding === graph.runtime.binding);
      if (cached?.exits[keys[i]]?.includes(keys[to])) {
        proofs.push({ from: i, to, status: 'pass', worlds: null, reused: true });
        (exits[keys[i]] ??= []).push(keys[to]); publicDistance[i] = Math.min(publicDistance[i], graph.distances[to] + 1); continue;
      }
      const proof = proveSingleKeyDisclosure(entry.puzzle, routeThrough(graph, i, to), {
        maxWorlds: 10000, maxStatesPerWorld: 1000000, maxTotalStates: 10000000, maxMilliseconds: 60000,
      }, true);
      assert.notEqual(proof.status, 'unknown', `Incomplete public proof for ${entry.number}/${i}/${to}`);
      proofs.push({ from: i, to, status: proof.status, worlds: proof.worlds.length });
      if (proof.status !== 'pass') continue;
      (exits[keys[i]] ??= []).push(keys[to]);
      publicDistance[i] = Math.min(publicDistance[i], graph.distances[to] + 1);
    }
  }
  // Bellman relaxation only on closed-to-closed edges. A boundary is usable only
  // after its common public preparation was proved against ALL hidden worlds.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [i, node] of graph.nodes.entries()) {
      if (node.frame.state.open.every(Boolean)) continue;
      for (const edge of node.edges) if (!edge.unlock.length && publicDistance[i] > publicDistance[edge.to] + 1) {
        publicDistance[i] = publicDistance[edge.to] + 1; changed = true;
      }
    }
  }
  const finite = (n: number) => Number.isFinite(n) ? n : -1;
  const states = Object.fromEntries(keys.map((k, i) => [k, [finite(graph.distances[i]), finite(publicDistance[i])] as const]));
  assert.ok(publicDistance[0] < Infinity, 'Initial puzzle needs a public-safe hint');
  tables[entry.puzzle.id] = { binding: graph.runtime.binding, states, exits };
  const fresh = createEngineSession(entry.puzzle, 'offline-hint-audit');
  for (const node of graph.nodes) {
    const current = { ...fresh, ...node.frame, seen: entry.puzzle.containers.filter((_: unknown, j: number) => node.frame.state.open[j]).map((c: { id: string }) => c.id) };
    const hint = singleKeyTableHint(current, tables[entry.puzzle.id]);
    if (hint.status === 'hint') {
      const next = transitionEngine(graph.runtime, current.state, current.known, hint.action); assert.ok(next.accepted);
      const column = current.state.open.every(Boolean) ? 0 : 1;
      assert.equal(states[key(next.state)][column], states[key(current.state)][column] - 1);
    }
  }
  const check = { number: entry.number, states: keys.length, edges: graph.edges,
    solvable: graph.distances.filter(Number.isFinite).length,
    concealedWithoutSafeHint: graph.nodes.filter((n, i) => !n.frame.state.open.every(Boolean) && Number.isFinite(graph.distances[i]) && !Number.isFinite(publicDistance[i])).length,
    proofs };
  checks.push(check); console.log(JSON.stringify(check));
}
const payload = { method: 'single-key-complete-hints-v1', bankEvidenceSha256: bank.evidenceSha256, tables };
const result = { ...payload, evidenceSha256: sha256(payload) };
writeFileSync(`${output}/verification.json`, JSON.stringify({ status: 'pass', checks }, null, 2) + '\n');
writeFileSync(`${output}/hints.json`, JSON.stringify(result) + '\n');
writeFileSync('assets/levels/unlock-post-key-hints.json.tmp', JSON.stringify(result) + '\n');
renameSync('assets/levels/unlock-post-key-hints.json.tmp', 'assets/levels/unlock-post-key-hints.json');
