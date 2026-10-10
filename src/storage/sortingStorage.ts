import { createEngineRestoreTask, ENGINE_HISTORY_BYTE_LIMIT, type EngineCheckpoint, type EngineSession } from '../game/engine.ts';
import type { SortingPuzzle } from '../game/engineModel.ts';
import type { WriteDatabase } from './sql.ts';

type Header = { puzzle_id: string; binding: string; attempt: string; revision: number; history_start: number; history_depth: number };
const slotId = (slot: string) => { if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slot)) throw new Error('Invalid sorting slot'); };

/** Called inside PlayerRepository.enqueueWrite's serial transaction, never independently nested. */
export async function saveSortingSession(db: WriteDatabase, slot: string, next: EngineSession, before: EngineSession | null): Promise<void> {
  slotId(slot);
  const replace = !before || before.runtime.binding !== next.runtime.binding || before.attempt !== next.attempt || !next.history.length;
  if (replace) await db.runAsync('DELETE FROM sorting_sessions WHERE slot=?', slot);
  await db.runAsync(`INSERT INTO sorting_sessions VALUES(?,?,?,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET
    puzzle_id=excluded.puzzle_id,binding=excluded.binding,attempt=excluded.attempt,revision=excluded.revision,
    history_start=excluded.history_start,history_depth=excluded.history_depth`,
  slot, next.runtime.puzzle.id, next.runtime.binding, next.attempt, next.revision, next.offset, next.history.length);
  async function write(step: number, checkpoint: EngineCheckpoint) {
    const frame = JSON.stringify(checkpoint);
    if (frame.length > 131072) throw new Error('Sorting checkpoint exceeds storage budget');
    await db.runAsync('INSERT INTO sorting_checkpoints VALUES(?,?,?) ON CONFLICT(slot,step) DO UPDATE SET frame=excluded.frame', slot, step, frame);
  }
  await write(-1, { state: next.state, known: next.known, seen: next.seen });
  for (let i = 0; i < next.history.length; i++) {
    if (replace || next.history[i] !== before?.history[next.offset + i - before.offset]) await write(next.offset + i, next.history[i]);
  }
  await db.runAsync('DELETE FROM sorting_checkpoints WHERE slot=? AND step<>-1 AND (step<? OR step>=?)', slot, next.offset, next.offset + next.history.length);
}

export async function loadSortingSession(db: WriteDatabase, slot: string, puzzle: SortingPuzzle): Promise<EngineSession | null> {
  slotId(slot);
  const header = await db.getFirstAsync<Header>('SELECT * FROM sorting_sessions WHERE slot=?', slot);
  if (!header) return null;
  if (header.puzzle_id !== puzzle.id || !Number.isSafeInteger(header.history_depth) || header.history_depth < 0 || header.history_depth > 4096) throw new Error('Sorting content binding mismatch');
  const volume = await db.getFirstAsync<{ size: number }>('SELECT coalesce(sum(length(frame)),0) AS size FROM sorting_checkpoints WHERE slot=?', slot);
  if (!volume || volume.size > ENGINE_HISTORY_BYTE_LIMIT + 131072) throw new Error('Sorting history exceeds storage budget');
  const rows = await db.getAllAsync<{ step: number; frame: string }>('SELECT step,frame FROM sorting_checkpoints WHERE slot=? ORDER BY step', slot);
  if (rows.length !== header.history_depth + 1 || rows[0]?.step !== -1
    || rows.slice(1).some((row, i) => row.step !== header.history_start + i)) throw new Error('Missing sorting checkpoint');
  const frames: EngineCheckpoint[] = [];
  let slice = performance.now();
  for (const row of rows) {
    if (row.frame.length > 131072) throw new Error('Sorting checkpoint exceeds storage budget');
    const frame: unknown = JSON.parse(row.frame);
    if (!frame || typeof frame !== 'object' || Array.isArray(frame) || Object.keys(frame).some(key => !['state', 'known', 'seen'].includes(key))) throw new Error('Invalid sorting checkpoint fields');
    frames.push(frame as EngineCheckpoint);
    if (performance.now() - slice >= 4) { await new Promise<void>(resolve => setTimeout(resolve, 0)); slice = performance.now(); }
  }
  const task = createEngineRestoreTask(puzzle, { format: 'engine-session-v1', binding: header.binding, attempt: header.attempt,
    revision: header.revision, offset: header.history_start, history: frames.slice(1), state: frames[0].state, known: frames[0].known, seen: frames[0].seen });
  let restored;
  do { restored = task.step(64, 4); if (!restored) await new Promise<void>(resolve => setTimeout(resolve, 0)); } while (!restored);
  return restored;
}
