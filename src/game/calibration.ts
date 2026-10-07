import { decodeContentPool } from './contentCodec.ts';
import type { GeneratedContent } from './generation.ts';
import { initialBoard } from './model.ts';
import { applyPour, type Board, type Pour } from './rules.ts';

export type TrialTier = 'D1' | 'D2' | 'D3' | 'D4';
export const TRIAL_TIERS: readonly TrialTier[] = ['D1', 'D2', 'D3', 'D4'];
export const TIER_NAMES: Record<TrialTier, string> = { D1: '轻松', D2: '标准', D3: '思考', D4: '挑战' };

// Trial groups are editorial hypotheses, not outputs of a difficulty evaluator.
const MANIFEST = [
  { code: 'C01', tier: 'D1', levelId: 'g-v1-000002cd-0-2c-2e', focus: '两色入门，熟悉整段倒水' },
  { code: 'C02', tier: 'D1', levelId: 'g-v1-000002ce-0-3c-2e', focus: '增加一种颜色，看看是否仍然轻松' },
  { code: 'C03', tier: 'D2', levelId: 'g-v1-000002cd-0-3c-2e', focus: '三色、两个空瓶，练习腾挪空间' },
  { code: 'C04', tier: 'D2', levelId: 'g-v1-000002d2-0-4c-2e', focus: '增加操作量，观察是否需要更多思考' },
  { code: 'C05', tier: 'D3', levelId: 'g-v1-000002cd-69-3c-1e', focus: '每瓶至少三色、一个空瓶，规划倒水顺序' },
  { code: 'C06', tier: 'D3', levelId: 'g-v1-000002d3-0-4c-2e', focus: '空瓶充足，但颜色分段更多' },
  { code: 'C07', tier: 'D4', levelId: 'g-v1-000002cd-78-4c-1e', focus: '四色混排、一个空瓶，观察空间规划压力' },
  { code: 'C08', tier: 'D4', levelId: 'g-v1-000002cd-3-5c-2e', focus: '五色、更多颜色分段，比较决策与操作负担' },
] as const;

export type CalibrationSample = {
  readonly code: string;
  readonly tier: TrialTier;
  readonly focus: string;
  readonly content: GeneratedContent;
};

/** One small, bundled internal trial pool. The UI never generates on launch. */
export function loadCalibrationSamples(json: string): readonly CalibrationSample[] {
  const pool = decodeContentPool(json);
  if (pool.length !== MANIFEST.length) throw new Error('Calibration pool must match the manifest');
  const byId = new Map(pool.map(content => [content.level.id, content]));
  return Object.freeze(MANIFEST.map(item => {
    const content = byId.get(item.levelId);
    if (!content) throw new Error(`Missing calibration sample ${item.code}`);
    if ((item.tier === 'D3' || item.tier === 'D4') && content.origin.config.mixing !== 'diverse') throw new Error(`Sample ${item.code} requires diverse initial bottles`);
    return Object.freeze({ code: item.code, tier: item.tier, focus: item.focus, content });
  }));
}

/** Reuse a proven suffix only when the actual bottle arrangement matches.
 * Off-route play still uses the bounded solver; move count alone is insufficient. */
export function referenceHint(content: Pick<GeneratedContent, 'level' | 'solution'>, current: Board): Pour | null {
  let board = initialBoard(content.level);
  const key = JSON.stringify(current);
  for (const pour of content.solution) {
    if (JSON.stringify(board) === key) return pour;
    board = applyPour(board, pour, content.level.capacity);
  }
  return null;
}
