import { HUMAN_MODEL } from './humanDifficulty.ts';

export const PRODUCTION_PLAN = 'thousand-ramp-v1' as const;
export type ProductionSlot = {
  readonly number: number;
  readonly stage: number;
  readonly wave: number;
  readonly position: number;
  readonly role: 'ordinary' | 'challenge';
  readonly preferredColorsMinimum: number | null;
  readonly preferredColorsMaximum: number | null;
  readonly maxSolutionMoves: number;
};

const COLOR_BANDS = [
  [6, 9], [6, 9], [6, 9],
  [7, 10], [7, 10], [7, 10], [7, 10], [7, 10],
  [5, 10], [5, 10], [5, 10], [5, 10], [5, 10], [5, 10],
  [7, 11], [7, 11], [7, 11],
  [8, 11], [8, 11], [8, 11],
] as const;

/** Nine ordinary levels steadily rise on the human proxy; every tenth is a
 * higher local challenge. Five waves form a stage and stage means climb. */
export function createProductionPlan(): readonly ProductionSlot[] {
  return Object.freeze(Array.from({ length: 1000 }, (_, index) => {
    const number = index + 1, stage = Math.ceil(number / 50), wave = Math.ceil(number / 10);
    const position = index % 10 + 1, role = position === 10 ? 'challenge' : 'ordinary';
    const [minimum, maximum] = COLOR_BANDS[stage - 1];
    return Object.freeze({ number, stage, wave, position, role,
      preferredColorsMinimum: role === 'challenge' ? null : number <= 3 ? 2 : minimum,
      preferredColorsMaximum: role === 'challenge' ? null : number <= 3 ? 3 : maximum,
      maxSolutionMoves: 60 });
  }));
}

/** Fixed target for selecting the first 95 challenge candidates. The final
 * five use the five highest verified scores in the pool. */
export function challengeTarget(wave: number): number {
  if (!Number.isInteger(wave) || wave < 1 || wave > 100) throw new Error('Invalid wave');
  // The first late-stage wave needs one extra point to preserve its five-point peak.
  return wave <= 95 ? Math.max(Math.round(18 + 47 * (wave / 95) ** 1.2), wave >= 66 ? 49 : 0) : 66;
}

export function validateRamp(entries: readonly { readonly number: number; readonly score: number }[]): void {
  if (entries.length !== 1000) throw new Error('Ramp requires 1000 levels');
  let previousOrdinary = -1, previousChallenge = -1, previousStageMean = -1;
  for (let stage = 1; stage <= 20; stage++) {
    let stageTotal = 0;
    for (let offset = 0; offset < 50; offset++) {
      const entry = entries[(stage - 1) * 50 + offset];
      if (entry.number !== (stage - 1) * 50 + offset + 1 || !Number.isInteger(entry.score) || entry.score < 0 || entry.score > 100) throw new Error('Invalid ramp score or number');
      stageTotal += entry.score;
      if (entry.number % 10 === 0) {
        if (entry.score < previousChallenge) throw new Error('Challenge scores decrease');
        const previousNine = entries.slice(entry.number - 10, entry.number - 1);
        if (entry.score - Math.max(...previousNine.map(row => row.score)) < (stage >= 14 ? 5 : 2)) throw new Error('Challenge lacks a local peak');
        previousChallenge = entry.score;
      } else {
        if (entry.score < previousOrdinary) throw new Error('Ordinary scores decrease');
        previousOrdinary = entry.score;
      }
    }
    const mean = stageTotal / 50;
    if (stage > 1 && (mean <= previousStageMean || mean - previousStageMean > 6)) throw new Error('Stage difficulty is not a steady rise');
    previousStageMean = mean;
  }
}

export function productionSummary(slots = createProductionPlan()) {
  return { plan: PRODUCTION_PLAN, model: HUMAN_MODEL, total: slots.length,
    ordinary: slots.filter(slot => slot.role === 'ordinary').length,
    challenges: slots.filter(slot => slot.role === 'challenge').length,
    stages: Array.from({ length: 20 }, (_, index) => ({ stage: index + 1, from: index * 50 + 1,
      to: (index + 1) * 50, preferredColorsMinimum: COLOR_BANDS[index][0], preferredColorsMaximum: COLOR_BANDS[index][1] })) };
}
