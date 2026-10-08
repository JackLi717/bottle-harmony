import { createSession, moveSession, meltSession, restoreSessionCheckpoint, type GameSession } from '../game/session.ts';
import { hasOptionalReserve, oneSpareLevel } from '../game/optionalReserve.ts';
import type { PlayableMainline } from '../game/mainlinePlayable.ts';
import type { SolidSideCatalog } from '../game/solidSide.ts';
import { getLegalPours, applyPour, type Board } from '../game/rules.ts';
import { getSolidLegalPours, applySolidPour } from '../game/solidRules.ts';
import type { WriteDatabase, SqlValue } from './sql.ts';

export type Slot = 'main' | 'side' | 'replay';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type SessionRow = { slot: Slot; level_id: string; bottle_count: number; history_depth: number; history_start: number; frozen_bottle: number | null; melted: number; melt_at: number | null };
type LayerRow = { step: number; bottle: number; depth: number; color: string };

async function putBoard(db: WriteDatabase, slot: Slot, step: number, board: Board) {
  const values: SqlValue[] = [];
  board.forEach((bottle, b) => bottle.forEach((color, depth) => values.push(slot, step, b, depth, color)));
  if (values.length) await db.runAsync(`INSERT INTO session_layers VALUES ${Array.from({ length: values.length / 5 }, () => '(?,?,?,?,?)').join(',')}`, ...values);
}

/** Append only the new undo snapshot; old accepted history is never re-encoded on each move. */
export async function saveSession(db: WriteDatabase, slot: Slot, next: GameSession | null, before: GameSession | null) {
  if (next === before) return;
  if (!next) { await db.runAsync('DELETE FROM sessions WHERE slot=?', slot); return; }
  if (next.history.length > 4096) throw new Error('Session history exceeds budget');
  const replacement = !before || before.level.id !== next.level.id || next.history.length === 0;
  if (replacement) await db.runAsync('DELETE FROM sessions WHERE slot=?', slot);
  const solid = next.solid;
  await db.runAsync(`INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET
    level_id=excluded.level_id,bottle_count=excluded.bottle_count,history_depth=excluded.history_depth,
    history_start=excluded.history_start,frozen_bottle=excluded.frozen_bottle,melted=excluded.melted,melt_at=excluded.melt_at`,
  slot, next.level.id, next.board.length, next.history.length, next.historyOffset, solid?.bottle ?? null, solid?.melted ? 1 : 0, solid?.meltAt ?? null);
  await db.runAsync('DELETE FROM session_layers WHERE slot=? AND step=-1', slot);
  if (!replacement && next.historyOffset > before!.historyOffset) await db.runAsync('DELETE FROM session_layers WHERE slot=? AND step>=0 AND step<?', slot, next.historyOffset);
  if (!replacement && next.historyOffset + next.history.length < before!.historyOffset + before!.history.length) await db.runAsync('DELETE FROM session_layers WHERE slot=? AND step>=?', slot, next.historyOffset + next.history.length);
  const from = replacement ? 0 : Math.max(0, Math.min(before!.historyOffset + before!.history.length - next.historyOffset, next.history.length));
  for (let i = from; i < next.history.length; i++) await putBoard(db, slot, next.historyOffset + i, next.history[i]);
  await putBoard(db, slot, -1, next.board);
}

/** Validate every stored transition once on restoration, including melt position and reserve variant. */
export function loadSessions(db: WriteDatabase, catalog: PlayableMainline, sides: SolidSideCatalog): Record<Slot, GameSession | null> {
  const result: Record<Slot, GameSession | null> = { main: null, side: null, replay: null };
  for (const row of db.getAllSync<SessionRow>('SELECT * FROM sessions')) {
    const main = catalog.entries.find(e => (e.levelId ?? e.level.id) === row.level_id);
    const side = sides.entries.find(e => (e.levelId ?? e.level.id) === row.level_id);
    if (!main && !side || row.slot === 'main' && !main || row.slot === 'side' && !side) throw new Error('Invalid session level binding');
    let level = (main ?? side)!.level;
    if (main && row.bottle_count === level.bottles.length - 1 && hasOptionalReserve(main)) level = oneSpareLevel(main);
    if (level.bottles.length !== row.bottle_count || row.frozen_bottle !== (side?.frozenBottle ?? null)
      || row.melted !== 0 && row.melted !== 1 || !side && (row.melted || row.melt_at !== null)
      || side && (!row.melted && row.melt_at !== null || row.melted && (row.melt_at === null || row.melt_at < 0 || row.melt_at > row.history_depth))) throw new Error('Invalid session variant');
    // Keep each sync bridge response below Expo web's 1 MiB shared buffer.
    const layers: LayerRow[] = [];
    for (let offset = 0; ; offset += 1024) {
      const page = db.getAllSync<LayerRow>('SELECT step,bottle,depth,color FROM session_layers WHERE slot=? ORDER BY step,bottle,depth LIMIT 1024 OFFSET ?', row.slot, offset);
      layers.push(...page);
      if (page.length < 1024) break;
    }
    const snapshots = new Map<number, string[][]>();
    snapshots.set(-1, Array.from({ length: row.bottle_count }, () => []));
    for (let i = row.history_start; i < row.history_start + row.history_depth; i++) snapshots.set(i, Array.from({ length: row.bottle_count }, () => []));
    for (const layer of layers) {
      const board = snapshots.get(layer.step), bottle = board?.[layer.bottle];
      if (!bottle || bottle.length !== layer.depth || !level.colors.includes(layer.color)) throw new Error('Invalid saved layers');
      bottle.push(layer.color);
    }
    let restored = createSession(level, side ? { bottle: side.frozenBottle, depth: 1, melted: false, meltAt: null } : null);
    for (let i = 0; i <= row.history_depth; i++) {
      const board = snapshots.get(i === row.history_depth ? -1 : row.history_start + i)!;
      if (i === 0) {
        if (row.history_start) restored = restoreSessionCheckpoint(level, board, row.history_start, row.melted && row.melt_at === 0 && restored.solid ? { ...restored.solid, melted: true, meltAt: 0 } : restored.solid);
        else if (!same(restored.board, board)) throw new Error('Invalid initial saved snapshot');
      } else {
        const legal = restored.solid ? getSolidLegalPours(restored.board, 4, restored.solid) : getLegalPours(restored.board, 4);
        const pour = legal.find(p => same(restored.solid ? applySolidPour(restored.board, p, 4, restored.solid) : applyPour(restored.board, p, 4), board));
        const accepted = pour && moveSession(restored, pour.source, pour.target);
        if (!accepted) throw new Error('Illegal saved transition');
        restored = accepted.session;
      }
      if (row.melted && row.melt_at === i) restored = meltSession(restored);
    }
    // A melt is indexed before the next move, including at the final current board.
    if (row.melted && !restored.solid?.melted) restored = meltSession(restored);
    result[row.slot] = restored;
  }
  return result;
}
