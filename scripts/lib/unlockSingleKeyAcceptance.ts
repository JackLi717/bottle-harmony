import assert from 'node:assert/strict';
import { compileSortingPuzzle, initialEngineState } from '../../src/game/engine.ts';
import { replayEngineRoute } from '../../src/game/engineSearch.ts';
import type { SortingPuzzle } from '../../src/game/engineModel.ts';
import { sha256, type UnlockRatingReport } from './unlockRatingEvidence.ts';
import { proveSingleKeyDisclosure, PUBLIC_DISCLOSURE_BUDGET, validateDisclosureBudget, type DisclosureBudget } from './unlockPublicDisclosure.ts';

export const SINGLE_KEY_ACCEPTANCE_METHOD = 'single-key-acceptance-v1';
export const ACCEPTANCE_LABELS = { pass: '通过', fail: '不通过', unknown: '未知' } as const;
export type DifficultyTarget = { min: number; max: number };
export function validateDifficultyTarget(target: DifficultyTarget | null) {
  if (target && (!Number.isSafeInteger(target.min) || !Number.isSafeInteger(target.max) || target.min < 1 || target.max > 7 || target.min > target.max)) throw new Error('Expected a difficulty target interval within ranks 1–7');
}
const disclosureReasons: Record<string, string> = {
  'public-world-unsolvable': '存在与公开信息一致、开锁后已证明无解的隐藏局面',
  'public-preparation-mismatch': '存在无法沿同一公开准备到达钥匙的隐藏局面',
  'public-preparation-illegal': '同一取钥准备在某个可能的隐藏局面中不合法',
  'public-time-budget': '达到公开信息验证的总时间上限',
  'public-world-budget': '达到隐藏局面枚举上限，尚未检查全部可能局面',
  'public-total-state-budget': '达到公开信息验证的总搜索状态上限',
  'public-search-states': '至少一个隐藏局面的后续求解达到状态上限',
  'public-search-time': '至少一个隐藏局面的后续求解达到时间上限',
  'public-search-cancelled': '至少一个隐藏局面的后续求解被取消',
};
type Check = { check: string; status: keyof typeof ACCEPTANCE_LABELS; code: string; reason: string };

/** All gates are necessary. A proved failure wins over unresolved other gates;
 * otherwise any unknown prevents acceptance. No total, weights or human grades. */
export function acceptSingleKey(puzzle: SortingPuzzle, report: UnlockRatingReport & { classicReferences?: unknown; acceptance?: unknown }, options: {
  target: DifficultyTarget | null; disclosureBudget?: DisclosureBudget;
}) {
  validateDifficultyTarget(options.target);
  const budget = options.disclosureBudget ?? PUBLIC_DISCLOSURE_BUDGET; validateDisclosureBudget(budget);
  assert.equal(report.definitionSha256, sha256(puzzle), 'Acceptance definition differs from rating');
  if (report.status === 'complete') {
    const { status: _status, evidenceSha256, limits: _limits, classicReferences: _references, acceptance: _acceptance, evidence, ...binding } = report;
    assert.equal(evidenceSha256, sha256({ binding, evidence }), 'Acceptance rating evidence hash differs');
  } else {
    const { status: _status, evidenceSha256, limits: _limits, classicReferences: _references, acceptance: _acceptance, evidence: _evidence, graph, ...binding } = report;
    assert.equal(evidenceSha256, sha256({ binding, graph }), 'Acceptance unknown evidence hash differs');
  }
  const binding = { method: SINGLE_KEY_ACCEPTANCE_METHOD, definitionSha256: report.definitionSha256,
    ratingEvidenceSha256: report.evidenceSha256, target: options.target, disclosureBudget: budget };
  const checks: Check[] = [];
  let publicInformation: ReturnType<typeof proveSingleKeyDisclosure> | null = null;
  const add = (check: string, status: Check['status'], code: string, reason: string) => checks.push({ check, status, code, reason });
  const finish = () => {
    const status = checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'unknown') ? 'unknown' : 'pass';
    const reasons = status === 'pass' ? [{ code: 'all-required-checks-passed', reason: '同一分段证书的全部必要检查通过。' }]
      : checks.filter(c => c.status !== 'pass').map(c => ({ code: c.code, reason: c.reason }));
    const evidence = { status, label: ACCEPTANCE_LABELS[status], reasons, checks, publicInformation };
    return { ...binding, ...evidence, evidenceSha256: sha256({ binding, evidence }),
      limits: 'Offline single-key content acceptance against an explicit batch difficulty target; not player calibration, release approval or all-action safety. Original classic scores are references only. No empty-bottle threshold or weighted quality score.' };
  };
  const trigger = puzzle.triggers[0];
  if (puzzle.containers.length < 4 || puzzle.containers.length > 8 || puzzle.hidden.length || puzzle.triggers.length !== 1
    || trigger.when.type !== 'empty' || !puzzle.locked.length || puzzle.locked.some(id => !trigger.unlock.includes(id))) {
    add('scope', 'unknown', 'outside-single-key-scope', '不在当前单钥匙验收范围：需四至八瓶、一把钥匙一次打开全部锁瓶，无额外遮色或机关。'); return finish();
  }
  add('scope', 'pass', 'single-key-scope', '属于当前单钥匙验收范围。');
  const evidence = report.status === 'complete' ? report.evidence : null;
  const stage = evidence?.stageDifficulty;
  if (!evidence) add('solvability', 'unknown', 'graph-budget', '完整搜图未完成，可解性与必经性尚未确定。');
  else if (evidence.admission.solvability === 'unsolvable') add('solvability', 'fail', 'unsolvable', '完整搜索已证明无解。');
  else {
    const runtime = compileSortingPuzzle(puzzle); replayEngineRoute(runtime, initialEngineState(runtime), evidence.graph.route);
    add('solvability', 'pass', 'replayed-complete-solution', '至少一条合法完整解已经回放。');
  }
  const milestone = evidence?.decisions.status === 'complete' ? evidence.decisions.shortest.milestones.find(m => m.trigger === trigger.id) : null;
  add('mandatory-key', milestone ? milestone.mandatory ? 'pass' : 'fail' : 'unknown', milestone ? milestone.mandatory ? 'mandatory-key' : 'optional-key' : 'mandatory-key-unknown',
    milestone ? milestone.mandatory ? '完整动作图证明钥匙是通关必经节点。' : '存在绕过钥匙的完整解。' : '尚未证明钥匙是通关必经节点。');
  if (!options.target) add('difficulty', 'unknown', 'missing-difficulty-target', '未提供整批制作的目标难度区间。');
  else if (stage?.status !== 'rated') add('difficulty', 'unknown', 'difficulty-unknown', `分段难度尚未确定：${stage?.reason ?? 'graph-budget'}。`);
  else add('difficulty', stage.rank >= options.target.min && stage.rank <= options.target.max ? 'pass' : 'fail',
    stage.rank >= options.target.min && stage.rank <= options.target.max ? 'difficulty-in-target' : 'difficulty-outside-target',
    `整题 ${stage.rank} 档，统一目标为 ${options.target.min}–${options.target.max} 档。`);
  const rhythm = evidence?.stageRhythm;
  add('rhythm', rhythm?.status === 'pass' ? 'pass' : rhythm?.status === 'fail' ? 'fail' : 'unknown',
    rhythm?.status === 'pass' ? 'supported-rhythm' : rhythm?.status === 'fail' ? `rhythm-${rhythm.reason}` : 'rhythm-unknown',
    rhythm?.status === 'pass' ? `同一证书前后整理量 ${rhythm.before}／${rhythm.after}，符合${rhythm.structure === 'balanced' ? '大致均衡' : '前多后少'}。`
      : rhythm?.status === 'fail' ? '整理节奏不符合前后均衡或前多后少。' : '尚未得到同一证书的整理节奏结论。');
  const visual = report.presentation;
  add('visual-template', visual.status === 'pass' ? 'pass' : visual.status === 'fail' ? 'fail' : 'unknown',
    visual.status === 'pass' ? 'fixed-template-matched' : visual.status === 'fail' ? 'fixed-template-mismatch' : 'fixed-template-unknown',
    visual.status === 'pass' ? '符合固定视觉模板。' : visual.status === 'fail' ? `不符合固定视觉模板：${visual.issues.map(i => i.code).join('、')}。` : '视觉模板尚无适用验收结论。');
  if (stage?.status === 'rated' && milestone?.mandatory) {
    publicInformation = proveSingleKeyDisclosure(puzzle, stage.witness.route, budget);
    add('public-information', publicInformation.status, publicInformation.reason ?? 'public-worlds-proved',
      publicInformation.status === 'pass' ? `${publicInformation.worlds.length} 种公开信息一致的隐藏局面均能沿同一准备取钥，开锁后各有完整解。`
        : publicInformation.status === 'fail' ? `公开信息验证不通过：${disclosureReasons[publicInformation.reason ?? ''] ?? publicInformation.reason}。` : `公开信息验证未完成：${disclosureReasons[publicInformation.reason ?? ''] ?? publicInformation.reason}。`);
  } else add('public-information', 'unknown', 'missing-paired-key-witness', '缺少必经钥匙的分段证书，不能用另一条路线补公开信息证明。');
  return finish();
}
