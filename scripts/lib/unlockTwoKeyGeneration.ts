import assert from 'node:assert/strict';
import { initialBoard } from '../../src/game/model.ts';
import { engineFixture } from '../../src/game/engineExamples.ts';
import { solveBoard, replaySolution } from '../../src/game/solver.ts';
import { hasCleanStart } from '../../src/game/startQuality.ts';
import { structureKey } from '../../src/game/generation.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import type { EngineFrame } from '../../src/game/engine.ts';
import { postKeyOrigin, reconstructPostKeyClassic, postKeyWorldCount, type PostKeyOrigin } from './unlockPostKeyGeneration.ts';
import { inspectPostKeyIntegration } from './unlockPostKeyIntegration.ts';
import { rowStructure } from './unlockPostKeyDiversity.ts';
import { buildRatingGraph } from './unlockRatingGraph.ts';
import { analyzeDoubleKeyDifficulty } from './unlockDoubleKeyDifficulty.ts';
import { analyzeDoubleKeyRhythm } from './unlockDoubleKeyRhythm.ts';
import { evaluateDoubleKey, doubleKeyClassicReferences } from './unlockDoubleKeyAcceptance.ts';
import { sha256 } from './unlockRatingEvidence.ts';

export const TWO_KEY_RECIPE = Object.freeze({ method: 'classic-two-key-batch-v1', count: 6, source: 'whole-board-run-shuffle-v1',
  target: { min: 4, max: 6 }, groupWidths: [1, 1], maxCoveredShare: 0.5, maxCandidates: 100000,
  overlay: 'full-mixed-pairs-three-open-keys-v1', maxWorlds: 12000,
  graph: { maxStates: 15000, maxEdges: 250000 }, maxWork: 2000000,
  disclosure: { maxWorlds: 12000, maxStatesPerWorld: 100000, maxTotalStates: 10000000, maxMilliseconds: 180000, reuseContinuations: true },
  integration: 'each-opening-public-whole-board-v1', diversity: 'unique-classic-lower-row-final-v1' });
export function twoKeyOrigin(index: number) { return postKeyOrigin(2, index); }
export function twoKeyOverlays(origin: PostKeyOrigin) {
  const board = initialBoard(reconstructPostKeyClassic(origin)), n = board.length;
  const full = board.flatMap((s, i) => s.length === 4 && new Set(s).size >= 3 ? [i] : []);
  const result = [];
  for (const first of full) for (const second of full) {
    if (first === second || postKeyWorldCount(board, [first, second]) > TWO_KEY_RECIPE.maxWorlds
      || [first, second].some(i => inspectPostKeyIntegration(board, [i]).status !== 'pass')) continue;
    const open = board.map((_, i) => i).filter(i => i !== first && i !== second);
    const row = Math.ceil(n / 2), a = origin.layout % 3, b = row + origin.layout % Math.min(3, n - row);
    // Only move entire bottles. Their contents and the complete classic inventory are unchanged.
    const order = [...open]; order.splice(a, 0, first); order.splice(b, 0, second);
    const keys = open.filter(i => board[i].length >= 2 && new Set(board[i]).size >= 2)
      .sort((x, y) => board[y].length - board[x].length || x - y).slice(0, 3);
    for (const key of keys) {
      const puzzle = engineFixture(`two-key-v1-${origin.seed}-${first}-${second}-${key}`, order.map(i => board[i]), {
        locked: [a, b], triggers: [
          { id: 'key-a', when: { type: 'empty', container: `b${order.indexOf(key)}` }, unlock: [`b${a}`] },
          { id: 'key-b', when: { type: 'empty', container: `b${a}` }, unlock: [`b${b}`] },
        ],
      });
      result.push({ key, first, second, order, puzzle });
    }
  }
  // Deterministic bounded exploration; neither elapsed time nor manual selection sets the order.
  return result.slice(0, 12);
}
export function twoKeyIntegration(puzzle: SortingPuzzle, frames: readonly EngineFrame[]) {
  assert.equal(frames.length, 2);
  const colors = new Map(puzzle.units.map(u => [u.id, u.color]));
  const checks = frames.map((frame, i) => {
    const group = puzzle.triggers[i].unlock.map(id => puzzle.containers.findIndex(c => c.id === id));
    // A still concealed second group cannot supply the first opening's outside links.
    const board = frame.state.contents.map((s, j) => frame.state.open[j] ? s.map(id => colors.get(id)!) : []);
    return inspectPostKeyIntegration(board, group);
  });
  return { method: TWO_KEY_RECIPE.integration, status: checks.every(c => c.status === 'pass') ? 'pass' as const : 'fail' as const, openings: checks };
}
export function evaluateTwoKeyCandidate(origin: PostKeyOrigin, selected?: { key: number; first: number; second: number }, report: (s: string) => void = () => {}) {
  const classic = reconstructPostKeyClassic(origin);
  if (!hasCleanStart(classic)) return null;
  const solved = solveBoard(initialBoard(classic), { maxStates: 100000, maxMilliseconds: 30000 });
  if (solved.status !== 'solved') return null;
  replaySolution(initialBoard(classic), solved.route, 4);
  for (const overlay of twoKeyOverlays(origin).filter(o => !selected || o.key === selected.key && o.first === selected.first && o.second === selected.second)) {
    const graph = buildRatingGraph(overlay.puzzle, TWO_KEY_RECIPE.graph.maxStates, TWO_KEY_RECIPE.graph.maxEdges);
    if (graph.status !== 'complete' || graph.shortestMoves === null) continue;
    const stage = analyzeDoubleKeyDifficulty(graph, TWO_KEY_RECIPE.maxWork);
    if (stage.status !== 'rated' || stage.rank < 4 || stage.rank > 6) continue;
    const rhythm = analyzeDoubleKeyRhythm(graph, stage), integration = twoKeyIntegration(overlay.puzzle, stage.witness.openedFrames);
    if (rhythm.status !== 'pass' || integration.status !== 'pass') continue;
    report(`proof ${overlay.puzzle.id} ${stage.stageRanks.join('/')} ${postKeyWorldCount(initialBoard(classic), [overlay.first, overlay.second])} worlds`);
    const acceptance = evaluateDoubleKey(overlay.puzzle, { target: TWO_KEY_RECIPE.target, ...TWO_KEY_RECIPE.graph, maxWork: TWO_KEY_RECIPE.maxWork, disclosureBudget: TWO_KEY_RECIPE.disclosure });
    report(`${overlay.puzzle.id} ${acceptance.status} ${acceptance.publicInformation?.reason ?? ''}`);
    if (acceptance.status !== 'pass') continue;
    const references = doubleKeyClassicReferences(overlay.puzzle, acceptance);
    if (references.base.status !== 'rated' || references.stages[2].reference?.status !== 'rated') continue;
    const source = { origin, classic, solution: solved.route, structureKey: structureKey(classic),
      overlay: { key: overlay.key, first: overlay.first, second: overlay.second, order: overlay.order } };
    const publicProof = acceptance.publicInformation!;
    const { worlds, branches, certificates, ...proof } = publicProof;
    const evidence = { ...acceptance, publicInformation: { ...proof, encoding: 'all-worlds-count-and-sha256-v1',
      worldsCount: worlds.length, branchesCount: branches.length, certificatesCount: certificates.length,
      worldsSha256: sha256(worlds), branchesSha256: sha256(branches), certificatesSha256: sha256(certificates) } };
    return { puzzle: overlay.puzzle, source, sourceSha256: sha256(source), acceptance: evidence, references, integration,
      lowerRow: rowStructure(overlay.order.slice(Math.ceil(overlay.order.length / 2)).map(i => classic.bottles[i].layers)),
      finalStructure: rowStructure(stage.witness.openedFrames[1].state.contents.map(s => s.map(id => graph.runtime.unitColors.get(id)!))) };
  }
  return null;
}
export type TwoKeyRecord = NonNullable<ReturnType<typeof evaluateTwoKeyCandidate>>;
export function twoKeyDiversity(records: readonly TwoKeyRecord[]) {
  const roots = new Set(records.map(r => r.source.structureKey)).size, rows = new Set(records.map(r => r.lowerRow)).size,
    finals = new Set(records.map(r => r.finalStructure)).size;
  return { method: TWO_KEY_RECIPE.diversity, status: roots === records.length && rows === records.length && finals === records.length ? 'pass' : 'fail', roots, rows, finals };
}
export function projectTwoKeyBank(records: readonly TwoKeyRecord[]) {
  assert.equal(records.length, TWO_KEY_RECIPE.count); const diversity = twoKeyDiversity(records); assert.equal(diversity.status, 'pass');
  const entries = records.map((r, i) => {
    const d = r.acceptance.difficulty, rhythm = r.acceptance.rhythm; assert.ok(d?.status === 'rated' && rhythm?.status === 'pass');
    return { number: i + 1, puzzle: r.puzzle, origin: r.source.origin, overlay: r.source.overlay, sourceSha256: r.sourceSha256,
      classicStructureKey: r.source.structureKey, route: d.witness.route, splitPours: d.witness.splitPours, rank: d.rank, stageRanks: d.stageRanks,
      classicScore: r.references.base.human!.score!.total, finalClassicScore: r.references.stages[2].reference!.human!.score!.total,
      integration: r.integration, rhythm: { stageWork: rhythm.stageWork, structure: rhythm.structure },
      acceptance: { status: r.acceptance.status, label: r.acceptance.label, evidenceSha256: r.acceptance.evidenceSha256 } };
  });
  const payload = { format: 'bottle-harmony-internal-two-key-bank', version: 1, method: TWO_KEY_RECIPE.method, recipe: TWO_KEY_RECIPE, diversity, entries };
  return { ...payload, evidenceSha256: sha256(payload) };
}
