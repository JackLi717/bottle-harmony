import assert from 'node:assert/strict';
import { compileSortingPuzzle, initialEngineState, type EngineFrame } from '../../src/game/engine.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { assertRevealScope } from '../../src/game/progressiveRevealHints.ts';
import { assertRatingScope, buildRatingGraph, colorRuns } from './unlockRatingGraph.ts';
import { analyzeDisclosureDifficulty, type DisclosureKind } from './disclosureStageDifficulty.ts';
import { proveDisclosureRoute, DISCLOSURE_PROOF_BUDGET, validateDisclosureProofBudget, type DisclosureProofBudget } from './disclosurePublicProof.ts';
import { auditUnlockClothTemplates } from './unlockClothTemplates.ts';
import { unlockQualityBounds } from './unlockSequentialKeys.ts';
import { classifyStageWork, STAGE_RHYTHM_POLICY } from './unlockStageRhythm.ts';
import { validateDifficultyTarget, ACCEPTANCE_LABELS, type DifficultyTarget } from './unlockSingleKeyAcceptance.ts';
import { classicFrameReference } from './unlockClassicReference.ts';
import { sha256 } from './unlockRatingEvidence.ts';
import { combinationScope } from './combinationScope.ts';
import { auditProgressiveMasks } from './progressiveMaskTemplates.ts';
import { auditUnlockVisualTemplates } from './unlockVisualTemplates.ts';

type Check = { check: string; status: 'pass' | 'fail' | 'unknown'; code: string; reason: string };
export function evaluateDisclosure(puzzle: SortingPuzzle, kind: DisclosureKind, options: {
  target: DifficultyTarget | null; maxStates?: number; maxEdges?: number; maxWork?: number; proofBudget?: DisclosureProofBudget;
}) {
  const runtime = compileSortingPuzzle(puzzle); // Invalid definitions are errors, not unknown puzzles.
  validateDifficultyTarget(options.target);
  const maxStates = options.maxStates ?? 250000, maxEdges = options.maxEdges ?? 4000000, maxWork = options.maxWork ?? 2000000;
  for (const [value, ceiling] of [[maxStates, 1000000], [maxEdges, 10000000], [maxWork, 50000000]]) if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw Error('Invalid disclosure evaluation budget');
  const proofBudget = options.proofBudget ?? DISCLOSURE_PROOF_BUDGET; validateDisclosureProofBudget(proofBudget);
  const binding = { method: `${kind}-automatic-acceptance-v1`, definitionSha256: sha256(puzzle), target: options.target, budgets: { maxStates, maxEdges, maxWork, proofBudget } };
  const combined = kind !== 'cloth' && kind !== 'reveal';
  const checks: Check[] = [], presentation = kind === 'cloth' ? auditUnlockClothTemplates(puzzle)
    : kind === 'key-cloth' ? auditUnlockClothTemplates(puzzle, { mixedKeys: true }) : combined ? auditUnlockVisualTemplates(puzzle) : null;
  let maskTemplate: ReturnType<typeof auditProgressiveMasks> | null = null;
  let difficulty: ReturnType<typeof analyzeDisclosureDifficulty> | null = null;
  let publicInformation: ReturnType<typeof proveDisclosureRoute> | null = null;
  let rhythm: { method: string; status: 'pass' | 'fail' | 'unknown' | 'not-applicable'; reason: string | null; before: number | null; after: number | null; policy: typeof STAGE_RHYTHM_POLICY } | null = null;
  let graphSummary: { status: string; states: number; edges: number; shortestMoves?: number | null } | null = null;
  const add = (check: string, status: Check['status'], code: string, reason: string) => checks.push({ check, status, code, reason });
  const finish = () => {
    const status = checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'unknown') ? 'unknown' : 'pass';
    const reasons = status === 'pass' ? [{ code: 'all-required-checks-passed', reason: '同一完整分段证书的全部必要检查通过。' }] : checks.filter(c => c.status !== 'pass').map(({ code, reason }) => ({ code, reason }));
    const evidence = { status, label: ACCEPTANCE_LABELS[status], reasons, checks, graph: graphSummary, difficulty, rhythm, presentation, maskTemplate, publicInformation };
    return { ...binding, ...evidence, evidenceSha256: sha256({ binding, evidence }), limits: 'Offline fixed-layout stage difficulty plus coupled adaptive public proof. No weighted score, human calibration, all-action safety or content installation.' };
  };
  if (kind === 'cloth' || combined) {
    checks.push(...unlockQualityBounds(puzzle).checks);
    add('visual-template', presentation!.status === 'pass' ? 'pass' : presentation!.status === 'fail' ? 'fail' : 'unknown', `${kind}-template-${presentation!.status}`,
      presentation!.status === 'pass' ? '符合对应的固定匣／布盖模板。' : `遮盖模板：${presentation!.issues.map(i => i.code).join('、')}。`);
  }
  try {
    if (kind === 'reveal') assertRevealScope(runtime);
    else if (combined) {
      const scope = combinationScope(puzzle, kind);
      if (scope.status !== 'supported') throw Error(scope.reason);
    } else {
      assertRatingScope(puzzle, 12);
      if (![8, 10, 12].includes(puzzle.containers.length) || puzzle.hidden.length || !puzzle.triggers.length || puzzle.triggers.length > 4
        || puzzle.triggers.some(t => t.when.type !== 'color-full' || t.when.count !== 4)) throw Error('Unsupported color cloth scope');
    }
  } catch {
    add('scope', 'unknown', 'unsupported-disclosure-scope', combined ? '组合超出当前范围：单钥匙＋一种条件色四角布盖，或一／两把先后依赖钥匙＋开放瓶内一至六份遮色；四份容量、至多十二瓶，无其他能力。' : kind === 'reveal' ? '仅支持至多六瓶、六份下层遮色且无其他能力的独立逐层显色。' : '仅支持八／十／十二瓶、四份容量、一至四种颜色条件且无额外遮色的布盖题。'); return finish();
  }
  if (kind.endsWith('reveal')) {
    maskTemplate = auditProgressiveMasks(puzzle);
    add('mask-template', maskTemplate.status, `mask-template-${maskTemplate.status}`, maskTemplate.status === 'pass'
      ? `符合固定下层遮色模板：${maskTemplate.bottles} 瓶、${maskTemplate.portions} 份。` : `下层遮色模板不匹配：${maskTemplate.issues.join('、')}。`);
  }
  const initial = initialEngineState(runtime);
  if (initial.state.fired.length || initial.known.length === puzzle.units.length && kind === 'reveal') {
    add('initial-disclosure', 'fail', 'no-initial-disclosure-task', '初态已触发开放或没有实际未知份，未形成待完成的新能力任务。'); return finish();
  }
  add('scope', 'pass', `${kind}-scope`, combined ? '属于当前组合评价范围。' : '属于当前独立能力评价范围。');
  const graph = buildRatingGraph(puzzle, maxStates, maxEdges, kind === 'reveal' ? 6 : 12);
  graphSummary = graph.status === 'complete' ? { status: graph.status, states: graph.nodes.length, edges: graph.edges, shortestMoves: graph.shortestMoves } : graph;
  difficulty = analyzeDisclosureDifficulty(graph, kind, maxWork);
  add('solvability', graph.status === 'unknown' ? 'unknown' : graph.shortestMoves === null ? 'fail' : 'pass',
    graph.status === 'unknown' ? 'graph-budget' : graph.shortestMoves === null ? 'unsolvable' : 'complete-route-replayed',
    graph.status === 'unknown' ? '完整动作图尚未完成。' : graph.shortestMoves === null ? '完整动作图证明真实布局无解。' : '至少一条合法完整解已回放。');
  if (kind !== 'reveal') for (const t of puzzle.triggers) {
    const mandatory = graph.status === 'complete' && graph.shortestMoves !== null ? graph.nodes.filter(n => n.solved).every(n => n.frame.state.fired.includes(t.id)) : null;
    add(`mandatory-${t.id}`, mandatory === null ? 'unknown' : mandatory ? 'pass' : 'fail', mandatory === null ? 'mandatory-trigger-unknown' : mandatory ? t.when.type === 'empty' ? 'mandatory-key' : 'mandatory-cover' : t.when.type === 'empty' ? 'optional-key' : 'optional-cover',
      mandatory === null ? `条件 ${t.id} 的必经性未确定。` : mandatory ? `条件 ${t.id} 是完成解必经节点。` : `存在绕过条件 ${t.id} 的完整解，遮盖未形成必要阶段。`);
  }
  if (kind === 'key-cloth') {
    const key = puzzle.triggers.find(t => t.when.type === 'empty')!, cover = puzzle.triggers.find(t => t.when.type === 'color-full')!;
    const ordered = graph.status === 'complete' ? !graph.nodes.some(n => n.frame.state.fired.includes(cover.id) && !n.frame.state.fired.includes(key.id)) : null;
    add('key-before-cloth', ordered === null ? 'unknown' : ordered ? 'pass' : 'fail', ordered === null ? 'dependency-unknown' : ordered ? 'key-before-cloth' : 'cloth-can-open-before-key',
      ordered === null ? '尚未证明先取钥匙再开布的依赖。' : ordered ? '完整动作图证明开布必须先取得钥匙，允许同一步自动连锁。' : '存在先开布再取钥匙的合法局面，不符合本轮依赖结构。');
  }
  const inTarget = difficulty.status === 'rated' && options.target && difficulty.rank >= options.target.min && difficulty.rank <= options.target.max;
  add('difficulty', !options.target || difficulty.status !== 'rated' ? 'unknown' : inTarget ? 'pass' : 'fail',
    !options.target ? 'missing-difficulty-target' : difficulty.status !== 'rated' ? 'difficulty-unknown' : inTarget ? 'difficulty-in-target' : 'difficulty-outside-target',
    !options.target ? '未提供整批统一的 1–7 档目标区间。' : difficulty.status !== 'rated' ? `分段难度未确定：${difficulty.reason}。` : `各段 ${difficulty.stageRanks.join('／')} 档，整题 ${difficulty.rank} 档；目标 ${options.target.min}–${options.target.max} 档。`);
  if (kind === 'reveal') rhythm = { method: 'disclosure-merge-rhythm-v1', status: 'not-applicable', reason: 'self-reveal-has-no-fixed-unlock-before-after-split', before: null, after: null, policy: STAGE_RHYTHM_POLICY };
  else if (difficulty.status === 'rated') {
    const opened = difficulty.witness.stages.filter(s => s.opened.length).at(-1);
    const final = difficulty.witness.stages.at(-1)?.frame ?? initial;
    if (!opened) rhythm = { method: 'disclosure-merge-rhythm-v1', status: 'unknown', reason: 'no-cover-boundary', before: null, after: null, policy: STAGE_RHYTHM_POLICY };
    else {
      const before = colorRuns(runtime, initial) - colorRuns(runtime, opened.frame), after = colorRuns(runtime, opened.frame) - colorRuns(runtime, final);
      const classified = before < 0 || after < 0 ? { status: 'fail' as const, reason: 'back-loaded' } : classifyStageWork(before, after);
      rhythm = { method: 'disclosure-merge-rhythm-v1', ...classified, before, after, policy: STAGE_RHYTHM_POLICY };
    }
  } else rhythm = { method: 'disclosure-merge-rhythm-v1', status: 'unknown', reason: 'missing-stage-witness', before: null, after: null, policy: STAGE_RHYTHM_POLICY };
  if (kind !== 'reveal') add('rhythm', rhythm.status === 'pass' ? 'pass' : rhythm.status === 'fail' ? 'fail' : 'unknown', `rhythm-${rhythm.status}`,
    `至最后一次机关开放的整理量／最终整理量：${rhythm.before ?? '未知'}／${rhythm.after ?? '未知'}，沿用大致均衡或前多后少规则。`);
  if (difficulty.status === 'rated') {
    publicInformation = proveDisclosureRoute(puzzle, kind, difficulty.witness.route, proofBudget);
    add('public-information', publicInformation.status, publicInformation.reason,
      publicInformation.status === 'pass' ? `${publicInformation.worlds} 个库存相容隐藏世界均有公开自适应完成策略，真实分支与评级证书一致。`
        : publicInformation.status === 'fail' ? '存在与公开信息相容的隐藏局面，无法沿当前分段证书及公开观察分支完成；真实答案可解不足以通过。'
          : `公开信息验证达到计算限额，尚未检查完毕：${publicInformation.reason}。`);
  } else add('public-information', 'unknown', 'missing-coupled-witness', '缺少完整分段证书，不能另用真值路线冒充公开策略。');
  return finish();
}

/** Raw classic scores are references only; preparation targets are not full sort. */
export function disclosureClassicReferences(puzzle: SortingPuzzle, result: ReturnType<typeof evaluateDisclosure>) {
  assert.equal(result.definitionSha256, sha256(puzzle));
  const { method, definitionSha256, target, budgets, evidenceSha256, limits: _limits, ...evidence } = result;
  assert.equal(evidenceSha256, sha256({ binding: { method, definitionSha256, target, budgets }, evidence }));
  const runtime = compileSortingPuzzle(puzzle), initial = initialEngineState(runtime), base = compileSortingPuzzle({ ...puzzle, hidden: [], locked: [], triggers: [] });
  const d = result.difficulty;
  const stages = d?.status === 'rated' ? d.witness.stages.map((s, i) => {
    const start: EngineFrame = i ? d.witness.stages[i - 1].frame : initial;
    return { goal: s.goal, frameSha256: sha256(start), reference: s.goal === 'sort' ? classicFrameReference(runtime, start) : { status: 'not-applicable', reason: '取钥匙／开启盖布／显露下一份颜色的目标不适用经典全盘排序百分分。' } };
  }) : [];
  const binding = { method: 'disclosure-classic-reference-v1', definitionSha256: sha256(puzzle), acceptanceEvidenceSha256: result.evidenceSha256 };
  const references = { base: classicFrameReference(base, initialEngineState(base)), stages };
  return { ...binding, ...references, evidenceSha256: sha256({ binding, references }) };
}
