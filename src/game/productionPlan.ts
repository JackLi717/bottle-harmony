import { HUMAN_MODEL } from './humanDifficulty.ts';

export const PRODUCTION_PLAN = 'thousand-mountain-v1' as const;
export type WaveRole = 'teaching' | 'recovery' | 'climb' | 'pressure' | 'subpeak' | 'peak';
export type ProductionSlot = {
  readonly number: number;
  readonly stage: number;
  readonly wave: number;
  readonly position: number;
  readonly cycle: number;
  readonly cyclePosition: number;
  readonly waveRole: WaveRole;
  readonly role: 'ordinary' | 'challenge';
  readonly targetScore: number;
  readonly preferredColorsMinimum: number | null;
  readonly preferredColorsMaximum: number | null;
  readonly maxSolutionMoves: number;
};

/** Provisional production targets, not a conversion of the player's 50% experience goal. */
export function cycleTargets(cycle: number) {
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > 50) throw new Error('Invalid cycle');
  const progress = (cycle - 1) / 49;
  return { valley: Math.round(18 + 23 * progress), subpeak: Math.round(40 + 29 * progress),
    peak: Math.round(45 + 29 * progress) };
}

export function challengeTarget(wave: number): number {
  if (!Number.isInteger(wave) || wave < 1 || wave > 100) throw new Error('Invalid wave');
  const target = cycleTargets(Math.ceil(wave / 2));
  return wave % 2 === 1 ? target.subpeak : target.peak;
}

export function createProductionPlan(): readonly ProductionSlot[] {
  const ascent = [0, 0.04, 0.14, 0.28, 0.44, 0.61, 0.76, 0.90, 1];
  return Object.freeze(Array.from({ length: 1000 }, (_, index) => {
    const number = index + 1, stage = Math.ceil(number / 50), wave = Math.ceil(number / 10);
    const position = index % 10 + 1, cycle = Math.ceil(number / 20), cyclePosition = index % 20 + 1;
    const role = position === 10 ? 'challenge' : 'ordinary';
    const targets = cycleTargets(cycle), second = cyclePosition > 10;
    const summit = second ? targets.peak : targets.subpeak, floor = targets.valley + (second ? 2 : 0);
    const targetScore = number <= 10 ? [1, 3, 7, 14, 20, 24, 28, 32, 35, 40][index] : position === 10 ? summit
      : Math.round(floor + (summit - 5 - floor) * ascent[position - 1]);
    const waveRole: WaveRole = number <= 3 ? 'teaching' : position === 10 ? second ? 'peak' : 'subpeak'
      : position <= 2 ? 'recovery' : position >= 8 ? 'pressure' : 'climb';
    return Object.freeze({ number, stage, wave, position, cycle, cyclePosition, waveRole, role, targetScore,
      preferredColorsMinimum: role === 'challenge' ? null : number <= 3 ? 2 : 4,
      preferredColorsMaximum: role === 'challenge' ? null : number <= 3 ? 3 : waveRole === 'recovery' ? 7 : 11,
      maxSolutionMoves: 60 });
  }));
}

/** Shared production/import acceptance. Ordinary scores may fall across waves
 * and by two points inside an ascent. Peaks and relief are checked separately. */
export function validateRamp(entries: readonly { readonly number: number; readonly score: number }[]): void {
  if (entries.length !== 1000) throw new Error('Mountain plan requires 1000 levels');
  const plan = createProductionPlan();
  for (const [index, entry] of entries.entries()) {
    const slot = plan[index];
    if (entry.number !== index + 1 || !Number.isInteger(entry.score) || entry.score < 0 || entry.score > 100)
      throw new Error('Invalid mountain score or number');
    if (slot.number > 3 && Math.abs(entry.score - slot.targetScore) > 8) throw new Error(`Score outside wave band at ${entry.number}`);
    if (slot.position === 10) {
      if (entry.score < slot.targetScore || entry.score > slot.targetScore + 3) throw new Error('Peak outside target band');
      if (entry.score - Math.max(...entries.slice(index - 9, index).map(row => row.score)) < 5) throw new Error('Challenge lacks a local peak');
      if (index >= 20 && entry.score < entries[index - 20].score) throw new Error('Cycle peaks decrease');
      if (slot.cyclePosition === 20 && entry.score - entries[index - 10].score < 4) throw new Error('Main peak lacks height above subpeak');
    } else if (slot.number > 3) {
      if (slot.position <= 2 && index >= 10 && entries[Math.floor(index / 10) * 10 - 1].score - entry.score < 12)
        throw new Error('Recovery lacks a clear drop');
      if (slot.position >= 3 && entry.score < entries[index - 1].score - 2) throw new Error('Ascent drops too far');
    }
  }
}

export function productionSummary(slots = createProductionPlan()) {
  return { plan: PRODUCTION_PLAN, model: HUMAN_MODEL, total: slots.length, cycleLength: 20, cycles: 50,
    ordinary: slots.filter(slot => slot.role === 'ordinary').length,
    challenges: slots.filter(slot => slot.role === 'challenge').length,
    roles: Object.fromEntries(['teaching', 'recovery', 'climb', 'pressure', 'subpeak', 'peak']
      .map(role => [role, slots.filter(slot => slot.waveRole === role).length])),
    stages: Array.from({ length: 20 }, (_, index) => ({ stage: index + 1, from: index * 50 + 1, to: (index + 1) * 50 })) };
}
