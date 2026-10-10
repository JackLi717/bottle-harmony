import type { AndroidFrame } from './androidFrameStats.ts';

export type RenderMarker = { label: string; uptimeMilliseconds: number; runId?: string; moves?: number; cases?: number; outcome?: string };
/** Android RN 0.86 uses steady_clock for performance.now(), the same awake monotonic clock as gfxinfo. */
export function parseRenderEvent(line: string): RenderMarker | null {
  const index = line.indexOf('ENGINE_RENDER');
  if (index < 0) return null;
  const suffix = line.slice(index + 'ENGINE_RENDER'.length);
  // Release RN console prints multiple arguments as single-quoted inspected values.
  const payload = suffix.startsWith("', '") && suffix.endsWith("'") ? suffix.slice(4, -1) : suffix.startsWith(' ') ? suffix.slice(1) : '';
  let event;
  try { event = JSON.parse(payload); } catch { return null; }
  if (!event || event.runtime !== 'android' || !/^render_auto_\d+$/.test(event.runId ?? '')
    || !/^[a-zA-Z0-9:_-]{1,64}$/.test(event.label ?? '') || typeof event.uptimeMilliseconds !== 'number'
    || !Number.isFinite(event.uptimeMilliseconds) || event.uptimeMilliseconds < 0
    || !Number.isSafeInteger(event.moves) || event.moves < 0 || event.moves > 360
    || !Number.isSafeInteger(event.cases) || event.cases < 0 || event.cases > 75
    || (event.outcome !== undefined && (typeof event.outcome !== 'string' || event.outcome.length > 512))) return null;
  return { label: event.label, uptimeMilliseconds: event.uptimeMilliseconds, runId: event.runId, moves: event.moves, cases: event.cases, outcome: event.outcome };
}

export function partitionRenderFrames(frames: readonly AndroidFrame[], markers: readonly RenderMarker[], start: number, end: number) {
  if (![start, end].every(Number.isFinite) || start < 0 || end < start) throw new Error('Invalid native clock bounds');
  const ordered = markers.filter(m => m.uptimeMilliseconds >= start && m.uptimeMilliseconds <= end).sort((a, b) => a.uptimeMilliseconds - b.uptimeMilliseconds);
  // If an automatic run used another time origin, reject its evidence instead of silently losing markers.
  const automatic = markers.filter(m => m.runId);
  if (automatic.length && !ordered.some(m => m.runId)) throw new Error('Automatic render clock does not match Android uptime');
  let cursor = 0, phase = 'unmarked', mirroring = 'unknown';
  const groups = new Map<string, { phase: string; mirroring: string; frames: AndroidFrame[] }>();
  const sorted = [...frames].sort((a, b) => BigInt(a.intendedVsync) < BigInt(b.intendedVsync) ? -1 : BigInt(a.intendedVsync) > BigInt(b.intendedVsync) ? 1 : 0);
  for (const frame of sorted) {
    while (cursor < ordered.length && BigInt(Math.trunc(ordered[cursor].uptimeMilliseconds * 1000000)) <= BigInt(frame.intendedVsync)) {
      const marker = ordered[cursor++];
      if (marker.label === 'mirror:on' || marker.label === 'mirror:off') mirroring = marker.label.slice(7);
      else phase = marker.label;
    }
    const key = `${phase}@${mirroring}`;
    const group = groups.get(key) ?? { phase, mirroring, frames: [] }; group.frames.push(frame); groups.set(key, group);
  }
  return [...groups.values()];
}
