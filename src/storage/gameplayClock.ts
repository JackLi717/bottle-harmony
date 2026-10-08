/** Monotonic intervals, closed at visibility/blocking changes; overlapping blocks are a boolean union. */
export class GameplayClock {
  private last: number;
  private active = false;
  private blocked = false;
  private foreground = 0;
  private unavailable = 0;
  private sinceInput = 0;
  constructor(now: number) { this.last = now; }
  private tick(now: number) {
    const elapsed = Math.max(0, now - this.last);
    if (this.active) { this.foreground += elapsed; this.sinceInput += elapsed; if (this.blocked) this.unavailable += elapsed; }
    this.last = now;
  }
  update(now: number, active: boolean, blocked: boolean) { this.tick(now); this.active = active; this.blocked = blocked; }
  take(now: number, input = false) {
    this.tick(now);
    const value = { foregroundMs: this.foreground, blockedMs: this.unavailable, ...(input && this.active ? { sinceInputMs: this.sinceInput } : {}) };
    if (input) this.sinceInput = 0;
    this.foreground = 0; this.unavailable = 0;
    return value;
  }
}

export function monotonicNow() { return performance.now(); }
