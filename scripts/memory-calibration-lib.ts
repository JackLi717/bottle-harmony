import type { MemoryRating } from '../src/game/memoryDifficulty.ts';

export const MEMORY_CALIBRATION_RECIPE = 'memory-two-axis-calibration-v1';
type Role = 'teaching' | 'memory' | 'sorting-variation' | 'subpeak' | 'peak' | 'recovery';
export type CalibrationEntry = { position: number; id: string; sourceNumber: number; role: Role; bridgeFocus: boolean; memory: number; sorting: number; combined: number };
// Explicit variation, not a sort by total score. Targets are calibration proxies.
const slots: { role: Role; m: number; s: number; bridge?: boolean }[] = [
  { role: 'teaching', m: 0, s: 1 }, { role: 'teaching', m: 9, s: 14 }, { role: 'teaching', m: 11, s: 6 },
  { role: 'memory', m: 28, s: 10 }, { role: 'sorting-variation', m: 32, s: 23 }, { role: 'subpeak', m: 48, s: 21 },
  { role: 'recovery', m: 20, s: 8 }, { role: 'memory', m: 50, s: 21, bridge: true }, { role: 'memory', m: 58, s: 22 },
  { role: 'peak', m: 63, s: 24 }, { role: 'recovery', m: 35, s: 12 }, { role: 'recovery', m: 40, s: 14 },
  { role: 'memory', m: 58, s: 15 }, { role: 'sorting-variation', m: 46, s: 27 }, { role: 'memory', m: 66, s: 20 },
  { role: 'subpeak', m: 73, s: 27 }, { role: 'recovery', m: 46, s: 18 }, { role: 'memory', m: 74, s: 24, bridge: true },
  { role: 'sorting-variation', m: 65, s: 30 }, { role: 'peak', m: 82, s: 29 },
];
export function selectMemoryCalibration(reports: readonly MemoryRating[]): CalibrationEntry[] {
  const eligible = reports.filter(r => r.status === 'rated' && r.memory && r.sorting && r.combined !== null);
  const selected: CalibrationEntry[] = [], used = new Set<string>();
  for (const [index, slot] of slots.entries()) {
    const position = index + 1;
    const candidates = eligible.filter(r => {
      if (used.has(r.key)) return false;
      if (slot.role === 'teaching') return r.number === position;
      if (!r.memory!.informationBits || r.number <= 3) return false;
      if (slot.role === 'memory' && r.memory!.total < r.sorting!.total + 15) return false;
      if (slot.bridge && !r.memory!.bridgeTransfers) return false;
      if (slot.role === 'recovery') {
        const challenge = [...selected].reverse().find(e => e.role === 'peak' || e.role === 'subpeak');
        if (!challenge || r.combined! > challenge.combined - 10) return false;
      }
      if (slot.role === 'peak' || slot.role === 'subpeak') {
        const start = slot.role === 'peak' ? index - 3 : Math.max(0, index - 4);
        if (r.combined! < Math.max(...selected.slice(start).map(e => e.combined)) + 3) return false;
        const paired = [...selected].reverse().find(e => e.role === (slot.role === 'peak' ? 'subpeak' : 'peak'));
        if (paired && r.combined! < paired.combined + 4) return false;
      }
      return true;
    });
    const distance = (r: MemoryRating) => Math.abs(r.memory!.total - slot.m) + 1.5 * Math.abs(r.sorting!.total - slot.s)
      + (slot.bridge ? (r.bridgeComparison?.savedMoves ?? 0) > 0 ? -4 : 0 : 0);
    const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
    candidates.sort((a, b) => distance(a) - distance(b) || compare(a.key, b.key) || compare(a.id, b.id));
    const chosen = candidates[0];
    if (!chosen) throw new Error(`No verified candidate for calibration position ${position}; widen the pool, not the acceptance rules`);
    used.add(chosen.key);
    selected.push({ position, id: chosen.id, sourceNumber: chosen.number, role: slot.role, bridgeFocus: !!slot.bridge,
      memory: chosen.memory!.total, sorting: chosen.sorting!.total, combined: chosen.combined! });
  }
  return selected;
}
