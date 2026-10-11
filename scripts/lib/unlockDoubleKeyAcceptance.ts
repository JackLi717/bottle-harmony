import assert from 'node:assert/strict';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { compileSortingPuzzle, initialEngineState, type EngineAction } from '../../src/game/engine.ts';
import { assertRatingScope, buildRatingGraph, type GraphUnknown } from './unlockRatingGraph.ts';
import { analyzeDoubleKeyDifficulty } from './unlockDoubleKeyDifficulty.ts';
import { analyzeDoubleKeyRhythm } from './unlockDoubleKeyRhythm.ts';
import { auditUnlockVisualTemplates } from './unlockVisualTemplates.ts';
import { sequentialKeys, unlockQualityBounds, validateDoubleKeyWitness } from './unlockSequentialKeys.ts';
import { proveDoubleKeyDisclosure } from './unlockDoubleKeyDisclosure.ts';
import { validateDifficultyTarget, ACCEPTANCE_LABELS, type DifficultyTarget } from './unlockSingleKeyAcceptance.ts';
import { PUBLIC_DISCLOSURE_BUDGET, validateDisclosureBudget, type DisclosureBudget } from './unlockPublicDisclosure.ts';
import { sha256 } from './unlockRatingEvidence.ts';
import { classicFrameReference } from './unlockClassicReference.ts';

export const DOUBLE_KEY_ACCEPTANCE_METHOD = 'sequential-two-key-acceptance-v1';
type Check = { check: string; status: 'pass' | 'fail' | 'unknown'; code: string; reason: string };

/** Only offline fixed samples: no asset projection, phone rating or player I/O. */
export function evaluateDoubleKey(puzzle: SortingPuzzle, options: {
  target: DifficultyTarget | null; maxStates?: number; maxEdges?: number; maxWork?: number; disclosureBudget?: DisclosureBudget;
}) {
  validateDifficultyTarget(options.target);
  const disclosureBudget = options.disclosureBudget ?? PUBLIC_DISCLOSURE_BUDGET; validateDisclosureBudget(disclosureBudget);
  const maxStates = options.maxStates ?? 250000, maxEdges = options.maxEdges ?? 4000000, maxWork = options.maxWork ?? 2000000;
  for (const [value, ceiling] of [[maxStates, 1000000], [maxEdges, 10000000], [maxWork, 50000000]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new Error('Invalid double-key evaluation budget');
  }
  const binding = { method: DOUBLE_KEY_ACCEPTANCE_METHOD, definitionSha256: sha256(puzzle), target: options.target,
    budgets: { maxStates, maxEdges, maxWork, disclosureBudget } };
  const checks: Check[] = [...unlockQualityBounds(puzzle).checks];
  const scope = sequentialKeys(puzzle), presentation = auditUnlockVisualTemplates(puzzle);
  let graphSummary: { status: 'complete'; states: number; edges: number; shortestMoves: number | null; route: EngineAction[] } | GraphUnknown | null = null;
  let difficulty: ReturnType<typeof analyzeDoubleKeyDifficulty> | null = null;
  let rhythm: ReturnType<typeof analyzeDoubleKeyRhythm> | null = null;
  let publicInformation: ReturnType<typeof proveDoubleKeyDisclosure> | null = null;
  const finish = () => {
    const status = checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'unknown') ? 'unknown' : 'pass';
    const reasons = status === 'pass' ? [{ code: 'all-required-checks-passed', reason: '双钥匙同一完整证书的全部必要检查通过。' }] : checks.filter(c => c.status !== 'pass').map(({ code, reason }) => ({ code, reason }));
    const evidence = { status, label: ACCEPTANCE_LABELS[status], reasons, checks, graph: graphSummary, difficulty, rhythm, presentation, publicInformation };
    return { ...binding, ...evidence, evidenceSha256: sha256({ binding, evidence }), limits: 'Offline two sequential mandatory bottom keys; pass/fail/unknown only. No weights, player-calibrated grades, all-action safety, generated bank or release approval.' };
  };
  try { assertRatingScope(puzzle); } catch { checks.push({ check: 'scope', status: 'unknown', code: 'outside-classic-rating-scope', reason: '仅支持至多十瓶、四份容量的经典全盘排序。' }); return finish(); }
  if (scope.status !== 'supported') { checks.push({ check: 'scope', status: 'unknown', code: scope.reason, reason: '需两把底部钥匙，第二把位于第一组内，两组独立覆盖全部锁瓶，钥匙瓶初始非空。' }); return finish(); }
  checks.push({ check: 'scope', status: 'pass', code: 'sequential-two-key-scope', reason: '第一把钥匙打开含第二把钥匙的瓶组，第二把再打开余下瓶组。' });
  checks.push({ check: 'visual-template', status: presentation.status === 'pass' ? 'pass' : presentation.status === 'fail' ? 'fail' : 'unknown', code: `visual-${presentation.status}`,
    reason: presentation.status === 'pass' ? '两组均符合既有固定视觉模板。' : `视觉模板：${presentation.issues.map(i => i.code).join('、') || presentation.status}。` });
  const graph = buildRatingGraph(puzzle, maxStates, maxEdges);
  graphSummary = graph.status === 'complete' ? { status: graph.status, states: graph.nodes.length, edges: graph.edges, shortestMoves: graph.shortestMoves, route: graph.route } : graph;
  difficulty = analyzeDoubleKeyDifficulty(graph, maxWork); rhythm = analyzeDoubleKeyRhythm(graph, difficulty);
  checks.push({ check: 'solvability', status: graph.status === 'unknown' ? 'unknown' : graph.shortestMoves === null ? 'fail' : 'pass', code: graph.status === 'unknown' ? 'graph-budget' : graph.shortestMoves === null ? 'unsolvable' : 'complete-route-replayed', reason: graph.status === 'unknown' ? '完整动作图尚未完成。' : graph.shortestMoves === null ? '完整动作图证明无解。' : '至少一条合法完整解已回放。' });
  for (const key of scope.keys) {
    const mandatory = graph.status === 'complete' && graph.shortestMoves !== null ? graph.nodes.filter(n => n.solved).every(n => n.frame.state.fired.includes(key.id)) : null;
    checks.push({ check: `mandatory-${key.id}`, status: mandatory === null ? 'unknown' : mandatory ? 'pass' : 'fail', code: mandatory === null ? 'mandatory-key-unknown' : mandatory ? 'mandatory-key' : 'optional-key', reason: mandatory === null ? `钥匙 ${key.id} 必经性未确定。` : mandatory ? `钥匙 ${key.id} 是完成解必经节点。` : `存在绕过钥匙 ${key.id} 的完整解。` });
  }
  const inTarget = difficulty.status === 'rated' && options.target && difficulty.rank >= options.target.min && difficulty.rank <= options.target.max;
  checks.push({ check: 'difficulty', status: !options.target || difficulty.status !== 'rated' ? 'unknown' : inTarget ? 'pass' : 'fail',
    code: !options.target ? 'missing-difficulty-target' : difficulty.status !== 'rated' ? 'difficulty-unknown' : inTarget ? 'difficulty-in-target' : 'difficulty-outside-target',
    reason: !options.target ? '未提供整批统一难度目标。' : difficulty.status !== 'rated' ? `分段难度未确定：${difficulty.reason}。` : `三段 ${difficulty.stageRanks.join('／')} 档，整题 ${difficulty.rank} 档，目标 ${options.target.min}–${options.target.max} 档。` });
  checks.push({ check: 'rhythm', status: rhythm.status === 'pass' ? 'pass' : rhythm.status === 'fail' ? 'fail' : 'unknown', code: `rhythm-${rhythm.status}`, reason: rhythm.status === 'pass' || rhythm.status === 'fail' ? `三段整理量 ${rhythm.stageWork!.join('／')}；取钥合计／最终整理为 ${rhythm.before}／${rhythm.after}，沿用原均衡／前多后少标准：${rhythm.status === 'pass' ? '通过' : '不通过'}。` : '缺少完整三段整理量证书。' });
  if (difficulty.status === 'rated') {
    publicInformation = proveDoubleKeyDisclosure(puzzle, difficulty, disclosureBudget);
    checks.push({ check: 'public-information', status: publicInformation.status, code: publicInformation.reason ?? 'public-worlds-proved', reason: publicInformation.status === 'pass' ? `${publicInformation.worlds.length} 个隐藏世界、${publicInformation.branches.length} 种首次开锁观察均有公开策略与完整续解。` : `公开信息证明${publicInformation.status === 'fail' ? '不通过' : '未完成'}：${publicInformation.reason}。` });
  } else checks.push({ check: 'public-information', status: 'unknown', code: 'missing-coupled-witness', reason: '缺少同一双钥匙分段证书，不能补用另一条真值路线。' });
  return finish();
}

/** Preserve old raw classic references only where that model is applicable.
 * The two acquisition tasks are never scored as whole-board sorting. */
export function doubleKeyClassicReferences(puzzle: SortingPuzzle, result: ReturnType<typeof evaluateDoubleKey>) {
  assert.equal(result.definitionSha256, sha256(puzzle));
  const { method, definitionSha256, target, budgets, evidenceSha256, limits: _limits, ...evidence } = result;
  assert.equal(evidenceSha256, sha256({ binding: { method, definitionSha256, target, budgets }, evidence }));
  const runtime = compileSortingPuzzle(puzzle), base = compileSortingPuzzle({ ...puzzle, locked: [], triggers: [], hidden: [] });
  const stage = result.difficulty;
  const frames = stage?.status === 'rated' ? stage.witness.openedFrames : null;
  if (stage?.status === 'rated') validateDoubleKeyWitness(puzzle, stage.witness);
  const references = { base: classicFrameReference(base, initialEngineState(base)), stages: [
    { goal: 'first-key', status: 'not-applicable', reason: '取钥目标不适用经典全盘排序百分分。' },
    { goal: 'second-key', status: 'not-applicable', reason: '取钥目标及仍锁定的局面不适用经典全盘排序百分分。' },
    { goal: 'sort', reference: frames ? classicFrameReference(runtime, frames[1]) : null },
  ] };
  const binding = { method: 'sequential-two-key-classic-reference-v1', definitionSha256: sha256(puzzle), acceptanceEvidenceSha256: result.evidenceSha256 };
  return { ...binding, ...references, evidenceSha256: sha256({ binding, references }) };
}
