export type MetricTimeSlice = { endAt: number; durationMs: number; offset: number; phase: string; blocked: boolean };
/** Exact local-midnight splitting. Offset is minutes east of UTC, frozen at measurement. */
export function splitLocalDays(slice: MetricTimeSlice) {
  if (!Number.isFinite(slice.durationMs) || slice.durationMs < 0 || !Number.isFinite(slice.endAt)
    || !Number.isInteger(slice.offset) || Math.abs(slice.offset) > 840) throw new Error('Invalid measured interval');
  const result: { day: string; offset: number; durationMs: number; endAt: number }[] = [];
  let start = slice.endAt - slice.durationMs;
  while (start < slice.endAt) {
    const local = start + slice.offset * 60000;
    const next = (Math.floor(local / 86400000) + 1) * 86400000 - slice.offset * 60000;
    const end = Math.min(slice.endAt, next);
    result.push({ day: new Date(local).toISOString().slice(0, 10), offset: slice.offset, durationMs: end - start, endAt: end });
    start = end;
  }
  return result;
}
/** Separate from legacy timers: records intervals without changing their public return contract. */
export class MetricClock {
  private last: number;
  private wall: number;
  private offset: number;
  private active = false;
  private phase = 'play';
  private blocked = false;
  private slices: MetricTimeSlice[] = [];
  constructor(now: number, wall = Date.now(), offset = -new Date(wall).getTimezoneOffset()) {
    this.last = now; this.wall = wall; this.offset = offset;
  }
  update(now: number, active: boolean, blocked: boolean, phase = 'play', wall = Date.now(), offset = -new Date(wall).getTimezoneOffset()) {
    this.tick(now);
    this.active = active; this.blocked = blocked; this.phase = phase; this.wall = wall; this.offset = offset;
  }
  private tick(now: number) {
    const durationMs = Math.max(0, now - this.last);
    if (this.active && durationMs) {
      const previous = this.slices.at(-1);
      const endAt = this.wall + durationMs;
      if (previous && previous.phase === this.phase && previous.blocked === this.blocked && previous.offset === this.offset && Math.abs(previous.endAt - this.wall) < 1) {
        previous.endAt = endAt; previous.durationMs += durationMs;
      } else this.slices.push({ endAt, durationMs, offset: this.offset, phase: this.phase, blocked: this.blocked });
    }
    this.wall += durationMs; this.last = now;
  }
  take(now: number) { this.tick(now); const slices = this.slices; this.slices = []; return slices; }
}
