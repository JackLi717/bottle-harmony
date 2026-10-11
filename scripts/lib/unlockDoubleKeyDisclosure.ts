import assert from 'node:assert/strict';
import { evaluateEngineGoal, listEngineActions, transitionEngine, visibleEngineState, type EngineFrame, type EngineAction, type EngineRuntime } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { solveBoard } from '../../src/game/solver.ts';
import { assertRatingScope } from './unlockRatingGraph.ts';
import { concealedInventoryWorlds, PUBLIC_DISCLOSURE_BUDGET, validateDisclosureBudget, type DisclosureBudget } from './unlockPublicDisclosure.ts';
import { sequentialKeys, validateDoubleKeyWitness } from './unlockSequentialKeys.ts';
import { sha256 } from './unlockRatingEvidence.ts';
import type { analyzeDoubleKeyDifficulty } from './unlockDoubleKeyDifficulty.ts';

type Verdict = 'pass' | 'fail' | 'unknown';
type World = { contents: string[][]; runtime: EngineRuntime; initial: EngineFrame; frame: EngineFrame; observation: string; prefix: EngineAction[] };
type Certificate = { world: number; route: readonly EngineAction[] };
class Limit extends Error { reason: string; constructor(reason: string) { super(reason); this.reason = reason; } }

/** A common first prefix; then one common second-key preparation per actual
 * PUBLIC observation, followed by fully visible world-specific sorting. Search
 * never branches on the still concealed second group. A bounded search cannot
 * prove absence. The true observation remains bound to the rating witness. */
export function proveDoubleKeyDisclosure(puzzle: SortingPuzzle, stage: ReturnType<typeof analyzeDoubleKeyDifficulty>, budget: DisclosureBudget = PUBLIC_DISCLOSURE_BUDGET) {
  validateDisclosureBudget(budget); assertRatingScope(puzzle);
  const scope = sequentialKeys(puzzle); assert.equal(scope.status, 'supported'); assert.ok(scope.status === 'supported');
  assert.equal(stage.status, 'rated'); assert.ok(stage.status === 'rated');
  const w = stage.witness, prefix = w.route.slice(0, w.splitPours[0]), trueMiddle = w.route.slice(w.splitPours[0], w.splitPours[1]);
  const started = performance.now(), worlds: World[] = [], certificates: Certificate[] = [];
  const branches: { observation: string; worlds: number[]; status: Verdict; middle: readonly EngineAction[] | null; reason: string | null }[] = [];
  let states = 0;
  const time = () => { if (performance.now() - started >= budget.maxMilliseconds) throw new Limit('public-time-budget'); };
  const charge = (n = 1) => { time(); if (states + n > budget.maxTotalStates) throw new Limit('public-total-state-budget'); states += n; };
  const observation = (runtime: EngineRuntime, f: EngineFrame) => sha256({ visible: visibleEngineState(runtime, f.state, f.known), fired: [...f.state.fired].sort() });
  const finish = (status: Verdict, reason: string | null) => ({ method: 'sequential-two-key-public-disclosure-v1', status, reason, budget,
    prefix, states, worlds: worlds.map(x => ({ contents: x.contents, observation: x.observation })), branches, certificates,
    limits: 'All inventory-consistent concealed counts and orders; adaptive second preparation only by public observation. The true branch uses the coupled rating certificate. Proves a sufficient public policy, not arbitrary-action safety, human discoverability, or that another first prefix cannot work.' });
  const { runtime: trueRuntime, initial: trueInitial } = validateDoubleKeyWitness(puzzle, w), trueObservation = observation(trueRuntime, w.openedFrames[0]);
  const solveVisible = (world: number, frame: EngineFrame, middle: readonly EngineAction[]): { status: Verdict; route?: readonly EngineAction[] } => {
    const row = worlds[world];
    if (evaluateEngineGoal(row.runtime, frame.state)) return { status: 'pass', route: [...row.prefix, ...middle] };
    assert.ok(frame.state.open.every(Boolean)); time();
    if (states >= budget.maxTotalStates) throw new Limit('public-total-state-budget');
    const result = solveBoard(frame.state.contents.map(s => s.map(id => row.runtime.unitColors.get(id)!)), {
      maxStates: Math.min(budget.maxStatesPerWorld, budget.maxTotalStates - states), maxMilliseconds: Math.min(60000, budget.maxMilliseconds - (performance.now() - started)),
    });
    charge(result.stats.visitedStates);
    if (result.status === 'invalid') throw new Error('Invalid disclosed classic board');
    if (result.status === 'limitReached') return { status: 'unknown' };
    if (result.status === 'unsolvable') return { status: 'fail' };
    const route = [...row.prefix, ...middle, ...result.route.map(p => ({ type: 'transfer' as const, source: puzzle.containers[p.source].id, target: puzzle.containers[p.target].id }))];
    replayEngineRoute(row.runtime, row.initial, route); return { status: 'pass', route };
  };
  try {
    for (const layout of concealedInventoryWorlds(puzzle)) {
      time(); if (worlds.length >= budget.maxWorlds) throw new Limit('public-world-budget'); charge();
      const locked = puzzle.containers.filter(c => puzzle.locked.includes(c.id));
      // A hypothetical concealed second key may have no liquid, even though
      // authored levels require nonempty key bottles. Keep that public world:
      // it automatically fires when the first group opens. Only the frame's
      // contents vary; all rules, stable unit colors and permissions stay fixed.
      const runtime = trueRuntime;
      const initial: EngineFrame = { state: { ...trueInitial.state, contents: puzzle.containers.map((c, index) => {
        const i = locked.findIndex(x => x.id === c.id); return i < 0 ? trueInitial.state.contents[index] : layout.units[i];
      }) }, known: trueInitial.known }; let frame = initial; const used: EngineAction[] = [];
      for (const action of prefix) {
        if (evaluateEngineGoal(runtime, frame.state)) break;
        const next = transitionEngine(runtime, frame.state, frame.known, action);
        if (!next.accepted) return finish('fail', 'public-first-preparation-illegal'); frame = { state: next.state, known: next.known }; used.push(action);
      }
      worlds.push({ contents: layout.contents, runtime, initial, frame, observation: observation(runtime, frame), prefix: used });
    }
    const groups = new Map<string, number[]>();
    worlds.forEach((row, i) => { const group = groups.get(row.observation) ?? []; group.push(i); groups.set(row.observation, group); });
    // Search each observation's common OPEN state graph until the second key.
    // A completed world may stop early; its success is not required to reveal.
    for (const [observed, members] of groups) {
      time();
      type Node = { frames: { world: number; frame: EngineFrame }[]; path: EngineAction[]; retired: Certificate[] };
      const root: Node = { frames: members.map(world => ({ world, frame: worlds[world].frame })), path: [], retired: [] };
      const retire = (node: Node): Node => ({ ...node, frames: node.frames.filter(x => !evaluateEngineGoal(worlds[x.world].runtime, x.frame.state)),
        retired: [...node.retired, ...node.frames.filter(x => evaluateEngineGoal(worlds[x.world].runtime, x.frame.state)).map(x => ({ world: x.world, route: [...worlds[x.world].prefix, ...node.path] }))] });
      const close = (node: Node): { status: Verdict; certs: Certificate[] } | null => {
        if (node.frames.some(x => !x.frame.state.open.every(Boolean))) return null;
        const certs = [...node.retired]; let unknown = false;
        for (const x of node.frames) {
          const result = solveVisible(x.world, x.frame, node.path);
          if (result.status === 'fail') return { status: 'fail', certs: [] };
          if (result.status === 'unknown') unknown = true;
          else certs.push({ world: x.world, route: result.route! });
        }
        return { status: unknown ? 'unknown' : 'pass', certs };
      };
      const advance = (node: Node, action: EngineAction): Node => {
        const frames = node.frames.map(x => { const next = transitionEngine(worlds[x.world].runtime, x.frame.state, x.frame.known, action); assert.ok(next.accepted, 'Common public action must be legal in every active world'); return { world: x.world, frame: { state: next.state, known: next.known } }; });
        return retire({ frames, path: [...node.path, action], retired: node.retired });
      };
      let result: ReturnType<typeof close> = null, chosen: EngineAction[] = [], unknown = false;
      if (observed === trueObservation) {
        let node = retire(root);
        for (const action of trueMiddle) { if (!node.frames.length) break; node = advance(node, action); }
        result = close(node); assert.ok(result, 'True middle must reach the second disclosure'); chosen = node.path;
      } else {
        const queue = [retire(root)], seen = new Set<string>();
        for (let cursor = 0; cursor < queue.length; cursor++) {
          charge(); const node = queue[cursor], ending = close(node);
          if (ending) { if (ending.status === 'pass') { result = ending; chosen = node.path; break; } if (ending.status === 'unknown') unknown = true; continue; }
          const representative = node.frames[0], runtime = worlds[representative.world].runtime;
          const identity = JSON.stringify([observation(runtime, representative.frame), node.frames.map(x => x.world)]);
          if (seen.has(identity)) continue; seen.add(identity);
          if (seen.size >= budget.maxStatesPerWorld) { unknown = true; break; }
          for (const action of listEngineActions(runtime, representative.frame.state, representative.frame.known)) queue.push(advance(node, action));
        }
        result ??= { status: unknown ? 'unknown' : 'fail', certs: [] };
      }
      const reason = result.status === 'pass' ? null : result.status === 'unknown' ? 'public-second-search-budget'
        : observed === trueObservation ? 'paired-second-preparation-unsafe' : 'no-common-second-preparation';
      branches.push({ observation: observed, worlds: members, status: result.status, middle: result.status === 'pass' ? chosen : null, reason });
      if (result.status === 'pass') certificates.push(...result.certs);
      else if (result.status === 'fail') return finish('fail', reason);
    }
    if (branches.some(b => b.status === 'unknown')) return finish('unknown', 'public-second-search-budget');
    assert.equal(new Set(certificates.map(c => c.world)).size, worlds.length);
    for (const c of certificates) replayEngineRoute(worlds[c.world].runtime, worlds[c.world].initial, c.route);
    return finish('pass', null);
  } catch (error) { if (!(error instanceof Limit)) throw error; return finish('unknown', error.reason); }
}
