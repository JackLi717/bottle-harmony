import type { MemoryPhase } from '../game/memory.ts';
import type { MemoryTiming } from './memoryRepository.ts';
/** Distinguish self-paced observation, temporary peek and available solving; never infer cold-start gaps. */
export class MemoryClock {
  private last: number;
  private active = false;
  private blocked = false;
  private phase: MemoryPhase = 'observe';
  private totals = { observationMs: 0, peekMs: 0, solveMs: 0, blockedMs: 0 };
  constructor(now: number) { this.last = now; }
  private tick(now: number) {
    const elapsed = Math.max(0, now - this.last); this.last = now;
    if (!this.active) return;
    if (this.blocked) this.totals.blockedMs += elapsed;
    else if (this.phase === 'observe') this.totals.observationMs += elapsed;
    else if (this.phase === 'peek') this.totals.peekMs += elapsed;
    else this.totals.solveMs += elapsed;
  }
  update(now: number, active: boolean, blocked: boolean, phase: MemoryPhase) { this.tick(now); this.active = active; this.blocked = blocked; this.phase = phase; }
  take(now: number): MemoryTiming { this.tick(now); const value = this.totals; this.totals = { observationMs: 0, peekMs: 0, solveMs: 0, blockedMs: 0 }; return value; }
}
