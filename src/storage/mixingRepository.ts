import { createMixing, restoreMixing, MIXING_RULES, type MixingSession, type MixingFrame, type MixUnit } from '../game/mixing.ts';
import { MIXING_CATALOG, MIXING_PUZZLES, mixingPuzzle } from '../game/mixingCatalog.ts';
import type { PlayerRepository } from './playerRepository.ts';
import type { WriteDatabase } from './sql.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mixing_trial_session(id INTEGER PRIMARY KEY CHECK(id=1), puzzle TEXT NOT NULL, catalog TEXT NOT NULL, rules TEXT NOT NULL,
 offset INTEGER NOT NULL CHECK(offset>=0), history_depth INTEGER NOT NULL CHECK(history_depth BETWEEN 0 AND 256)) STRICT;
CREATE TABLE IF NOT EXISTS mixing_trial_frames(step INTEGER PRIMARY KEY, active INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS mixing_trial_units(step INTEGER NOT NULL, place INTEGER NOT NULL, depth INTEGER NOT NULL, atom INTEGER NOT NULL, color TEXT NOT NULL,
 batch INTEGER, PRIMARY KEY(step,place,depth), UNIQUE(step,atom)) STRICT;
CREATE TABLE IF NOT EXISTS mixing_trial_deliveries(step INTEGER NOT NULL, ordinal INTEGER NOT NULL, goal INTEGER NOT NULL, PRIMARY KEY(step,ordinal), UNIQUE(step,goal)) STRICT;
`;
export class MixingRepository {
  state: MixingSession | null;
  readonly player: PlayerRepository;
  private constructor(player: PlayerRepository, state: MixingSession | null) { this.player = player; this.state = state; }
  static async open(player: PlayerRepository) {
    const db = player.db;
    if (!await player.enqueueWrite(async () => { await db.execAsync(SCHEMA); })) throw new Error('Unable to initialize mixing trial');
    const saved = await db.getFirstAsync<{ puzzle: string; catalog: string; rules: string; offset: number; history_depth: number }>('SELECT * FROM mixing_trial_session WHERE id=1');
    let state: MixingSession | null = null;
    if (saved) {
      if (saved.catalog !== MIXING_CATALOG || saved.rules !== MIXING_RULES) throw new Error('Mixing content binding mismatch');
      const puzzle = mixingPuzzle(saved.puzzle), frames = new Map<number, MixingFrame>();
      // Batch restoration asynchronously: do not block the browser/main thread once per undo layer.
      const rows = await db.getAllAsync<{ step: number; active: number }>('SELECT * FROM mixing_trial_frames ORDER BY step');
      const layers = await db.getAllAsync<{ step: number; place: number; depth: number; atom: number; color: MixUnit['color']; batch: number | null }>('SELECT * FROM mixing_trial_units ORDER BY step,place,depth');
      const collected = await db.getAllAsync<{ step: number; ordinal: number; goal: number }>('SELECT * FROM mixing_trial_deliveries ORDER BY step,ordinal');
      if ([...layers, ...collected].some(r => !rows.some(f => f.step === r.step))) throw new Error('Orphan mixing checkpoint');
      for (const row of rows) {
        const containers: MixUnit[][] = Array.from({ length: puzzle.bottles.length + 1 + puzzle.goals.length }, () => []);
        for (const u of layers.filter(layer => layer.step === row.step)) {
          if (!containers[u.place] || u.depth !== containers[u.place].length) throw new Error('Invalid mixing layer order');
          containers[u.place].push({ atom: u.atom, color: u.color, batch: u.batch });
        }
        const deliveries = collected.filter(d => d.step === row.step);
        if (deliveries.some((d, i) => d.ordinal !== i || !containers[puzzle.bottles.length + 1 + d.goal])) throw new Error('Invalid mixing delivery order');
        const frame = { bottles: containers.slice(0, puzzle.bottles.length), mixer: containers[puzzle.bottles.length], deliveries: deliveries.map(d => ({ goal: d.goal, units: containers[puzzle.bottles.length + 1 + d.goal] })), active: row.active };
        if (containers.slice(puzzle.bottles.length + 1).some((b, i) => b.length && !deliveries.some(d => d.goal === i))) throw new Error('Orphan mixing material');
        frames.set(row.step, frame);
      }
      if (frames.size !== saved.history_depth + 1 || !frames.has(-1)) throw new Error('Missing mixing checkpoints');
      const history = Array.from({ length: saved.history_depth }, (_, i) => { const frame = frames.get(saved.offset + i); if (!frame) throw new Error('Missing mixing undo frame'); return frame; });
      state = restoreMixing(puzzle, frames.get(-1)!, history, saved.offset);
    }
    return new MixingRepository(player, state);
  }
  start() { return this.state ?? createMixing(MIXING_PUZZLES[0]); }
  commit(next: MixingSession) {
    const before = this.state; this.state = next;
    // Shares the player's serial transaction queue without changing the mainline, wallet or memory session.
    return this.player.enqueueWrite(async () => { await saveMixing(this.player.db, next, before); });
  }
}
async function saveMixing(db: WriteDatabase, next: MixingSession, before: MixingSession | null) {
  const replace = !before || next.puzzle.id !== before.puzzle.id || next.offset === 0 && next.history.length === 0 && next.frame.bottles !== before.frame.bottles;
  if (replace) { await db.runAsync('DELETE FROM mixing_trial_frames'); await db.runAsync('DELETE FROM mixing_trial_units'); await db.runAsync('DELETE FROM mixing_trial_deliveries'); }
  await db.runAsync('INSERT OR REPLACE INTO mixing_trial_session VALUES(1,?,?,?,?,?)', next.puzzle.id, MIXING_CATALOG, MIXING_RULES, next.offset, next.history.length);
  async function write(step: number, frame: MixingFrame) {
    await db.runAsync('INSERT OR REPLACE INTO mixing_trial_frames VALUES(?,?)', step, frame.active);
    await db.runAsync('DELETE FROM mixing_trial_units WHERE step=?', step); await db.runAsync('DELETE FROM mixing_trial_deliveries WHERE step=?', step);
    const containers = [...frame.bottles, frame.mixer, ...next.puzzle.goals.map((_, i) => frame.deliveries.find(d => d.goal === i)?.units ?? [])];
    for (let place = 0; place < containers.length; place++) for (let depth = 0; depth < containers[place].length; depth++) {
      const u = containers[place][depth]; await db.runAsync('INSERT INTO mixing_trial_units VALUES(?,?,?,?,?,?)', step, place, depth, u.atom, u.color, u.batch);
    }
    for (let i = 0; i < frame.deliveries.length; i++) await db.runAsync('INSERT INTO mixing_trial_deliveries VALUES(?,?,?)', step, i, frame.deliveries[i].goal);
  }
  await write(-1, next.frame);
  for (let i = 0; i < next.history.length; i++) {
    const step = next.offset + i;
    if (replace || before?.history[step - before.offset] !== next.history[i]) await write(step, next.history[i]);
  }
  for (const table of ['mixing_trial_frames', 'mixing_trial_units', 'mixing_trial_deliveries']) await db.runAsync(`DELETE FROM ${table} WHERE step<>-1 AND (step<? OR step>=?)`, next.offset, next.offset + next.history.length);
}
