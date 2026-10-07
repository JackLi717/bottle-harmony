import { INTERNAL_GRADES, LOAD_MODEL } from './difficultyLoad.ts';
import type { DifficultyTier } from './difficulty.ts';

export const PRODUCTION_PLAN = 'thousand-waves-v3' as const;
export type ProductionSlot = {
  readonly number: number;
  readonly stage: number;
  readonly wave: number;
  readonly position: number;
  readonly role: 'relax' | 'standard' | 'thinking' | 'challenge';
  readonly tier: DifficultyTier;
  readonly rank: number;
  readonly scoreMinimum: number;
  readonly scoreMaximum: number;
  readonly colorsMinimum: number;
  readonly colorsMaximum: number;
  /** Soft ordinary-level preference; challenges have no stage color preference. */
  readonly preferredColorsMinimum: number | null;
  readonly preferredColorsMaximum: number | null;
  readonly allowedEmptyBottles: readonly (1 | 2)[];
  readonly mixing: 'relaxed' | 'diverse';
  readonly maxSolutionMoves: number;
};

const PEAK_RANKS = [4, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8] as const;
const COLOR_BANDS = [
  [6, 9],
  [7, 10], [7, 10], [7, 10], [7, 10],
  [8, 10], [8, 10], [8, 10], [8, 10],
  [8, 11], [8, 11], [8, 11], [8, 11], [8, 11],
  [9, 11], [9, 11], [9, 11], [9, 11], [9, 11], [9, 11],
] as const;

/** A recipe of 1,000 requested slots, never evidence that levels exist.
 * Generate -> rate -> accept actual matching evidence -> assign stable numbers.
 * Challenge slots must additionally be sorted by actual score, never relabeled
 * to meet quotas. Shared bands permit plateaus between deeper verified ranks. */
export function createProductionPlan(): readonly ProductionSlot[] {
  const slots: ProductionSlot[] = [];
  for (let number = 1; number <= 1000; number++) {
    const stage = Math.ceil(number / 50), wave = Math.ceil(number / 10), position = (number - 1) % 10 + 1;
    const peak = PEAK_RANKS[stage - 1], [preferredMinimum, preferredMaximum] = COLOR_BANDS[stage - 1];
    const role = position <= 3 ? 'relax' : position <= 6 ? 'standard' : position <= 9 ? 'thinking' : 'challenge';
    const rank = role === 'challenge' ? peak : role === 'relax' ? 1 : role === 'standard' ? 2 : stage < 8 ? 3 : 4;
    const tier = INTERNAL_GRADES[rank - 1].tier;
    const allowedEmptyBottles = Object.freeze(role === 'relax' ? [2] as const : [1, 2] as const);
    // Overlapping bands guide variety rather than enforce a growing minimum.
    // Actual counts can rise or fall within and across waves independently of
    // the verified challenge score; twelve bottles remains a hard boundary.
    const colorsMaximum = number <= 3 ? 3 : 12 - Math.min(...allowedEmptyBottles);
    const colorsMinimum = number <= 3 ? 2 : 3;
    const preferredColorsMinimum = role === 'challenge' ? null : number <= 3 ? 2 : preferredMinimum;
    const preferredColorsMaximum = role === 'challenge' ? null : Math.min(preferredMaximum, colorsMaximum);
    slots.push(Object.freeze({ number, stage, wave, position, role, tier, rank,
      scoreMinimum: (rank - 1) * 1000, scoreMaximum: rank * 1000 - 1,
      colorsMinimum, colorsMaximum, preferredColorsMinimum, preferredColorsMaximum, allowedEmptyBottles,
      mixing: tier === 'D3' || tier === 'D4' ? 'diverse' : 'relaxed',
      maxSolutionMoves: role === 'relax' ? 24 : role === 'standard' ? 36 : role === 'thinking' ? 48 : 60,
    }));
  }
  return Object.freeze(slots);
}

export function productionSummary(slots = createProductionPlan()) {
  return {
    plan: PRODUCTION_PLAN, model: LOAD_MODEL, total: slots.length,
    tiers: Object.fromEntries(['D1', 'D2', 'D3', 'D4'].map(tier => [tier, slots.filter(slot => slot.tier === tier).length])),
    ranks: Object.fromEntries(INTERNAL_GRADES.map(grade => [grade.rank, slots.filter(slot => slot.rank === grade.rank).length])),
    stages: Array.from({ length: 20 }, (_, index) => {
      const stageSlots = slots.filter(slot => slot.stage === index + 1);
      const ordinary = stageSlots.find(slot => slot.role === 'standard')!;
      return { stage: index + 1, from: stageSlots[0].number, to: stageSlots.at(-1)!.number,
        challengeRank: stageSlots.at(-1)!.rank, maximumColors: Math.max(...stageSlots.map(slot => slot.colorsMaximum)),
        preferredColorsMinimum: ordinary.preferredColorsMinimum, preferredColorsMaximum: ordinary.preferredColorsMaximum,
        tiers: Object.fromEntries(['D1', 'D2', 'D3', 'D4'].map(tier => [tier, stageSlots.filter(slot => slot.tier === tier).length])) };
    }),
  };
}
