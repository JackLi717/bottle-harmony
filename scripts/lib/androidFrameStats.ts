export type AndroidFrame = { window: string; flags: number; intendedVsync: string; completed: string; timelineId: string;
  milliseconds: number; displayPresent?: string };
export function parseAndroidFrames(text: string): { frames: AndroidFrame[]; invalidObservations: number; uptimeMilliseconds: number | null; since: string | null } {
  const frames: AndroidFrame[] = [];
  let window = '', columns: string[] | null = null, collecting = false, invalidObservations = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('Window: ')) window = line.slice(8).trim();
    if (line.trim() === '---PROFILEDATA---') { collecting = !collecting; columns = null; continue; }
    if (!collecting || !line.trim()) continue;
    const cells = line.trim().replace(/,$/, '').split(',');
    if (cells.includes('Flags')) {
      columns = cells;
      if (!['Flags', 'IntendedVsync', 'FrameCompleted'].every(name => columns!.includes(name))) throw new Error('Unsupported Android frame-stat columns');
      continue;
    }
    if (!columns) continue;
    const value = (name: string) => cells[columns!.indexOf(name)];
    const intendedVsync = value('IntendedVsync'), completed = value('FrameCompleted'), flags = value('Flags');
    if (cells.length !== columns.length || ![intendedVsync, completed, flags].every(v => /^\d+$/.test(v ?? ''))) { invalidObservations++; continue; }
    const elapsed = BigInt(completed) - BigInt(intendedVsync);
    if (elapsed <= 0n || elapsed > 60000000000n) { invalidObservations++; continue; }
    const present = value('DisplayPresentTime');
    const displayPresent = /^\d+$/.test(present ?? '') && BigInt(present) >= BigInt(intendedVsync)
      && BigInt(present) - BigInt(intendedVsync) <= 60000000000n ? present : undefined;
    frames.push({ window, flags: Number(flags), intendedVsync, completed, timelineId: value('FrameTimelineVsyncId') ?? '', milliseconds: Number(elapsed) / 1e6, displayPresent });
  }
  const uptime = /^Uptime: (\d+)/m.exec(text), since = /^Stats since: (\d+)ns/m.exec(text);
  return { frames, invalidObservations, uptimeMilliseconds: uptime ? Number(uptime[1]) : null, since: since?.[1] ?? null };
}
export const androidFrameKey = (frame: AndroidFrame) => `${frame.window}#${frame.intendedVsync}#${frame.timelineId}`;

/** Call on one continuous operation window; never bridge idle gaps or windows. */
export function presentedFrameIntervals(frames: readonly AndroidFrame[]): number[] {
  const windows = new Map<string, Set<bigint>>();
  for (const frame of frames) {
    if (!frame.displayPresent) continue;
    const times = windows.get(frame.window) ?? new Set<bigint>();
    times.add(BigInt(frame.displayPresent)); windows.set(frame.window, times);
  }
  return [...windows.values()].flatMap(times => {
    const sorted = [...times].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    return sorted.slice(1).map((value, i) => Number(value - sorted[i]) / 1e6);
  });
}
