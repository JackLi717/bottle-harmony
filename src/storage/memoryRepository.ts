import { MEMORY_CATALOG } from '../game/memoryCatalog.ts';
import { createMemory, restoreMemory, MEMORY_RULES, type MemorySession, type UnitBoard } from '../game/memory.ts';
import type { ContentRepository } from './contentRepository.ts';
import type { PlayerRepository } from './playerRepository.ts';
import type { WriteDatabase } from './sql.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memory_black_session(id INTEGER PRIMARY KEY CHECK(id=1), level_id TEXT NOT NULL, number INTEGER NOT NULL,
 rules TEXT NOT NULL, attempt INTEGER NOT NULL, phase TEXT NOT NULL CHECK(phase IN('observe','play','peek')),
 judgement TEXT NOT NULL CHECK(judgement IN('hidden','wrong','cleanup','correct')), reveal_at INTEGER,
 history_start INTEGER NOT NULL, history_depth INTEGER NOT NULL CHECK(history_depth BETWEEN 0 AND 4096),
 pours INTEGER NOT NULL, peeks INTEGER NOT NULL, hints INTEGER NOT NULL, undos INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS memory_black_layers(step INTEGER NOT NULL, bottle INTEGER NOT NULL, depth INTEGER NOT NULL CHECK(depth BETWEEN 0 AND 3),
 unit INTEGER NOT NULL, PRIMARY KEY(step,bottle,depth), UNIQUE(step,unit)) STRICT;
CREATE TABLE IF NOT EXISTS memory_black_knowledge(unit INTEGER PRIMARY KEY, first_step INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS memory_black_attempts(id TEXT PRIMARY KEY, level_id TEXT NOT NULL, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
 ended_at INTEGER, result TEXT NOT NULL, partial INTEGER NOT NULL DEFAULT 0,
 observation_ms REAL NOT NULL DEFAULT 0, peek_ms REAL NOT NULL DEFAULT 0, solve_ms REAL NOT NULL DEFAULT 0, blocked_ms REAL NOT NULL DEFAULT 0,
 pours INTEGER NOT NULL DEFAULT 0, peeks INTEGER NOT NULL DEFAULT 0, hints INTEGER NOT NULL DEFAULT 0, undos INTEGER NOT NULL DEFAULT 0) STRICT;
INSERT OR IGNORE INTO preferences VALUES('memory-black-v1-tutorial','false');
`;
type Saved = { level_id: string; number: number; rules: string; attempt: number; phase: MemorySession['phase']; judgement: MemorySession['judgement']; reveal_at: number | null; history_start: number; history_depth: number; pours: number; peeks: number; hints: number; undos: number };
export type MemoryTiming = { observationMs?: number; peekMs?: number; solveMs?: number; blockedMs?: number };
export class MemoryRepository {
  state: MemorySession | null;
  tutorialDone: boolean;
  readonly player: PlayerRepository;
  readonly content: ContentRepository;
  private constructor(player: PlayerRepository, content: ContentRepository, state: MemorySession | null, tutorial: boolean) {
    this.player = player; this.content = content; this.state = state; this.tutorialDone = tutorial;
  }
  static async open(player: PlayerRepository, content: ContentRepository) {
    const db = player.db;
    // This rule set has its own SQLite tables; no old experimental session is imported or reset.
    // The mainline and existing preferences remain in the shared player database.
    const ok = await player.enqueueWrite(async () => {
      await db.execAsync(SCHEMA);
      await db.runAsync("INSERT OR IGNORE INTO metadata VALUES('memory-black-summary-v2-since',?)", String(Date.now()));
    });
    if (!ok) throw new Error('Unable to initialize memory storage');
    const row = db.getFirstSync<Saved>('SELECT * FROM memory_black_session WHERE id=1');
    let state: MemorySession | null = null;
    if (row) {
      // Stable content ID owns the board; position may change when a bank is reordered.
      const puzzle = content.memoryPuzzleById(row.level_id);
      if (puzzle.level.id !== row.level_id || row.rules !== MEMORY_RULES) throw new Error('Memory content binding mismatch');
      const snapshots = new Map<number, number[][]>();
      const total = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM memory_black_layers')!.n;
      for (let offset = 0; offset < total; offset += 1024) {
        for (const layer of db.getAllSync<{ step: number; bottle: number; depth: number; unit: number }>('SELECT * FROM memory_black_layers ORDER BY step,bottle,depth LIMIT 1024 OFFSET ?', offset)) {
          const board = snapshots.get(layer.step) ?? puzzle.level.bottles.map(() => [] as number[]);
          if (!board[layer.bottle] || board[layer.bottle].length !== layer.depth) throw new Error('Invalid memory layer order');
          board[layer.bottle].push(layer.unit); snapshots.set(layer.step, board);
        }
      }
      const units = snapshots.get(-1), history: UnitBoard[] = [];
      if (!units || snapshots.size !== row.history_depth + 1) throw new Error('Missing memory snapshots');
      for (let i = 0; i < row.history_depth; i++) {
        const board = snapshots.get(row.history_start + i);
        if (!board) throw new Error('Missing memory undo checkpoint'); history.push(board);
      }
      const knowledge = db.getAllSync<{ unit: number; first_step: number }>('SELECT * FROM memory_black_knowledge ORDER BY unit');
      if (knowledge.some((r, i) => r.unit !== i)) throw new Error('Missing memory knowledge');
      state = restoreMemory(puzzle, { units, history, revealed: knowledge.map(r => r.first_step), phase: row.phase, judgement: row.judgement, revealAt: row.reveal_at,
        attempt: row.attempt, offset: row.history_start, pours: row.pours, peeks: row.peeks, hints: row.hints, undos: row.undos });
    }
    if (!await player.enqueueWrite(async () => { await db.runAsync("UPDATE memory_black_attempts SET partial=1 WHERE result='playing'"); })) throw new Error('Unable to mark interrupted memory attempt');
    const tutorial = db.getFirstSync<{ value: string }>("SELECT value FROM preferences WHERE key='memory-black-v1-tutorial'")?.value;
    if (tutorial !== 'true' && tutorial !== 'false') throw new Error('Invalid memory tutorial preference');
    return new MemoryRepository(player, content, state, tutorial === 'true');
  }
  start() { return this.state ?? createMemory(this.content.memoryPuzzle(1)); }
  select(number: number) { return createMemory(this.content.memoryPuzzle(number), (this.state?.attempt ?? 0) + 1); }
  completeTutorial() {
    this.tutorialDone = true;
    return this.player.enqueueWrite(async () => { await this.player.db.runAsync("UPDATE preferences SET value='true' WHERE key='memory-black-v1-tutorial'"); });
  }
  commit(next: MemorySession, kind: string, detail: Record<string, unknown> = {}, timing: MemoryTiming = {}) {
    const before = this.state, at = Date.now(); this.state = next;
    const db = this.player.db, attemptId = `${this.player.installation}:${MEMORY_RULES}:${next.attempt}`;
    return this.player.enqueueWrite(async revision => {
      const add = async (metric: string, value = 1, levelId = next.puzzle.level.id) => {
        if (!value) return;
        await db.runAsync('INSERT INTO level_stats VALUES(?,?,?,?) ON CONFLICT(mode,level_id,metric) DO UPDATE SET value=value+excluded.value', 'memory', levelId, metric, value);
        const date = new Date(at), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        await db.runAsync('INSERT INTO daily_stats VALUES(?,?,?,?) ON CONFLICT(day,timezone,metric) DO UPDATE SET value=value+excluded.value', day, `UTC${-date.getTimezoneOffset()}`, `memory_${metric}`, value);
      };
      if (before !== next) await saveMemory(db, next, before);
      if (before && before.attempt !== next.attempt) await db.runAsync("UPDATE memory_black_attempts SET ended_at=COALESCE(ended_at,?),result=CASE WHEN result='playing' THEN 'reset' ELSE result END WHERE id=?", at, `${this.player.installation}:${MEMORY_RULES}:${before.attempt}`);
      const started = await db.runAsync("INSERT OR IGNORE INTO memory_black_attempts(id,level_id,started_at,last_at,result) VALUES(?,?,?,?,'playing')", attemptId, next.puzzle.level.id, at, at);
      if (started.changes) await add('attempts');
      const deltas = { pours: next.pours - (before?.attempt === next.attempt ? before.pours : 0), peeks: next.peeks - (before?.attempt === next.attempt ? before.peeks : 0),
        hints: next.hints - (before?.attempt === next.attempt ? before.hints : 0), undos: next.undos - (before?.attempt === next.attempt ? before.undos : 0),
        observation_ms: timing.observationMs ?? 0, peek_ms: timing.peekMs ?? 0, solve_ms: timing.solveMs ?? 0, blocked_ms: timing.blockedMs ?? 0 };
      for (const [metric, value] of Object.entries(deltas)) {
        if (!Number.isFinite(value) || value < 0) throw new Error('Invalid memory metric');
        if (value) {
          // Metric names are constants from deltas above, never external input.
          await db.runAsync(`UPDATE memory_black_attempts SET ${metric}=${metric}+? WHERE id=?`, value, attemptId);
          await add(metric, value);
        }
      }
      if (kind === 'reset' && before && before.attempt !== next.attempt) await add('resets', 1, before.puzzle.level.id);
      if (before?.attempt === next.attempt && before.judgement === 'hidden' && (next.judgement === 'correct' || next.judgement === 'wrong')) {
        await add('first_answers');
        await add(next.judgement === 'correct' ? 'first_answer_correct' : 'first_answer_wrong');
        const attempt = (await db.getFirstAsync<{ partial: number }>('SELECT partial FROM memory_black_attempts WHERE id=?', attemptId))!;
        if (!attempt.partial && next.peeks === 0 && next.hints === 0) {
          await add('unassisted_answers');
          if (next.judgement === 'correct') await add('unassisted_correct');
        }
        if (attempt.partial) await add('partial_answers');
      }
      if (kind === 'hint-request') await add('hint_requests');
      if (kind === 'hint-result' && ['solved', 'unsolvable', 'unknown', 'cancelled'].includes(String(detail.result))) await add(`hint_${detail.result}`);
      await db.runAsync('UPDATE memory_black_attempts SET last_at=? WHERE id=?', at, attemptId);
      if (next.game.status === 'solved') {
        const result = next.judgement === 'correct' ? 'remembered' : 'recovered';
        const completed = await db.runAsync("UPDATE memory_black_attempts SET result=?,ended_at=COALESCE(ended_at,?) WHERE id=? AND result='playing'", result, at, attemptId);
        if (completed.changes) await add(result);
        await db.runAsync("INSERT OR IGNORE INTO completions VALUES('memory',?,?)", next.puzzle.level.id, at);
      }
      await db.runAsync('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', revision, `${this.player.installation}:${revision}`, revision, at,
        null, null, attemptId, 'memory', next.puzzle.level.id, kind, this.player.statistics.appVersion, MEMORY_CATALOG, MEMORY_RULES, 'memory-free-v1', 'memory-black-tracking-v2',
        JSON.stringify({ ...detail, ...timing, phase: next.phase, judgement: next.judgement, routeStep: next.game.historyOffset + next.game.history.length,
          revealed: before?.attempt === next.attempt ? next.revealed.flatMap((step, id) => before.revealed[id] === -1 && step >= 0 ? [{ unit: id, step }] : []) : [] }));
      if (revision % 100 === 0) {
        await this.player.statistics.prune(at);
        await db.runAsync("DELETE FROM memory_black_attempts WHERE id<>? AND (last_at<? OR id IN(SELECT id FROM memory_black_attempts ORDER BY last_at DESC LIMIT -1 OFFSET 50000))", attemptId, at - 30 * 86400000);
      }
    });
  }
}
async function saveMemory(db: WriteDatabase, next: MemorySession, before: MemorySession | null) {
  const replace = !before || before.attempt !== next.attempt;
  if (replace) { await db.runAsync('DELETE FROM memory_black_layers'); await db.runAsync('DELETE FROM memory_black_knowledge'); }
  await db.runAsync('INSERT OR REPLACE INTO memory_black_session VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?)', next.puzzle.level.id, next.puzzle.number, MEMORY_RULES, next.attempt, next.phase, next.judgement, next.revealAt,
    next.game.historyOffset, next.history.length, next.pours, next.peeks, next.hints, next.undos);
  const writeBoard = async (step: number, units: UnitBoard) => {
    await db.runAsync('DELETE FROM memory_black_layers WHERE step=?', step);
    for (let b = 0; b < units.length; b++) for (let d = 0; d < units[b].length; d++) await db.runAsync('INSERT INTO memory_black_layers VALUES(?,?,?,?)', step, b, d, units[b][d]);
  };
  if (replace || before.units !== next.units) await writeBoard(-1, next.units);
  if (replace) { for (let i = 0; i < next.history.length; i++) await writeBoard(next.game.historyOffset + i, next.history[i]); }
  else if (next.pours > before.pours && next.history.length) await writeBoard(next.game.historyOffset + next.history.length - 1, next.history.at(-1)!);
  await db.runAsync('DELETE FROM memory_black_layers WHERE step<>-1 AND (step<? OR step>=?)', next.game.historyOffset, next.game.historyOffset + next.history.length);
  for (let id = 0; id < next.revealed.length; id++) if (replace || next.revealed[id] !== before.revealed[id]) await db.runAsync('INSERT OR REPLACE INTO memory_black_knowledge VALUES(?,?)', id, next.revealed[id]);
}
