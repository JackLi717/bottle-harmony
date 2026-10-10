export type AndroidFrame = { window: string; flags: number; intendedVsync: string; completed: string; timelineId: string;
  milliseconds: number };
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
    frames.push({ window, flags: Number(flags), intendedVsync, completed, timelineId: value('FrameTimelineVsyncId') ?? '', milliseconds: Number(elapsed) / 1e6 });
  }
  const uptime = /^Uptime: (\d+)/m.exec(text), since = /^Stats since: (\d+)ns/m.exec(text);
  return { frames, invalidObservations, uptimeMilliseconds: uptime ? Number(uptime[1]) : null, since: since?.[1] ?? null };
}
export const androidFrameKey = (frame: AndroidFrame) => `${frame.window}#${frame.intendedVsync}#${frame.timelineId}`;
