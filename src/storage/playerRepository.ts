import { createMainline, visibleSession, hintAvailability, type MainlineState } from '../game/mainline.ts';
import type { PlayableMainline } from '../game/mainlinePlayable.ts';
import type { SolidSideCatalog } from '../game/solidSide.ts';
import type { WriteDatabase } from './sql.ts';
import { transaction } from './sql.ts';
import { loadSessions, saveSession } from './sessionStorage.ts';
import { PLAYER_SCHEMA, PLAYER_SCHEMA_VERSION, METRICS_VERSION } from './playerSchema.ts';
import { StatisticsRecorder, sessionScope, type GameplayAction } from './statistics.ts';
import { createProductionPlan } from '../game/productionPlan.ts';
import { ProductMetrics } from './productMetrics.ts';

const metricPlan = createProductionPlan();
type ProgressRow = { catalog: string; current: number; completed: number; side_completed: number; tutorial: number; symbols: number; credits: number; free_hint_used: number };
type Job = { revision: number; at: number; before: MainlineState; next: MainlineState; action: GameplayAction; resolve: (ok: boolean) => void; work?: (revision: number) => Promise<void> };

function validateProgress(state: MainlineState, main: PlayableMainline, sides: SolidSideCatalog) {
  if (!Number.isInteger(state.current) || state.current < 1 || state.current > main.entries.length
    || !Number.isInteger(state.completedThrough) || state.completedThrough < 0 || state.completedThrough > state.current
    || state.current > state.completedThrough + 1 || state.main.level.id !== (main.entries[state.current - 1].levelId ?? main.entries[state.current - 1].level.id)
    || state.hintCredits < 0 || state.hintCredits > 5 || !Number.isInteger(state.hintCredits)
    || state.sideCompletedThrough < Math.floor((state.current - 1) / 20) || state.sideCompletedThrough > Math.floor(state.completedThrough / 20)) throw new Error('Invalid progress binding');
  if (state.side && (state.current % 20 !== 0 || state.main.status !== 'solved'
    || state.side.level.id !== (sides.entries[state.current / 20 - 1].levelId ?? sides.entries[state.current / 20 - 1].level.id))) throw new Error('Invalid side binding');
  if (state.replay) {
    const mainEntry = main.entries.find(e => (e.levelId ?? e.level.id) === state.replay!.level.id);
    const sideEntry = sides.entries.find(e => (e.levelId ?? e.level.id) === state.replay!.level.id);
    if (!mainEntry && !sideEntry || mainEntry && mainEntry.number > state.completedThrough || sideEntry && sideEntry.number > state.sideCompletedThrough) throw new Error('Locked replay');
  }
}

export class PlayerRepository {
  readonly db: WriteDatabase;
  readonly mainline: PlayableMainline;
  readonly sides: SolidSideCatalog;
  state: MainlineState;
  readonly installation: string;
  readonly statistics: StatisticsRecorder;
  readonly metrics: ProductMetrics;
  onCommitted?: () => void;
  private writeFailures = 0;
  private revision: number;
  private pending: Job[] = [];
  private running: Promise<boolean> | null = null;
  private constructor(db: WriteDatabase, mainline: PlayableMainline, sides: SolidSideCatalog, state: MainlineState, installation: string, revision: number, appVersion: string) {
    this.db = db; this.mainline = mainline; this.sides = sides; this.state = state;
    this.installation = installation; this.revision = revision;
    this.statistics = new StatisticsRecorder(db, installation, mainline.id, appVersion);
    this.metrics = new ProductMetrics(db, appVersion, installation);
  }
  static async open(db: WriteDatabase, main: PlayableMainline, sides: SolidSideCatalog, appVersion: string) {
    await db.execAsync('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version;
    if (version === 0) {
      const tables = await db.getAllAsync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
      if (tables.length) throw new Error('Uninitialized database contains data');
      await transaction(db, async () => {
        await db.execAsync(PLAYER_SCHEMA);
        const id = (await db.getFirstAsync<{ id: string }>('SELECT lower(hex(randomblob(16))) AS id'))!.id;
        for (const [key, value] of Object.entries({ installation: id, revision: '0', metrics: METRICS_VERSION, initialized: '1' })) await db.runAsync('INSERT INTO metadata VALUES(?,?)', key, value);
        for (const [key, value] of Object.entries({ sound: 'true', vessel: 'classic', symbols: 'false', language: 'system' })) await db.runAsync('INSERT INTO preferences VALUES(?,?)', key, value);
        const initial = createMainline(main);
        await PlayerRepository.putProgress(db, initial, main.id);
        await saveSession(db, 'main', initial.main, null);
      });
    } else if (version !== PLAYER_SCHEMA_VERSION) throw new Error('Unsupported player database schema');
    if ((await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check'))?.quick_check !== 'ok') throw new Error('Player database integrity failed');
    const metadata = new Map((await db.getAllAsync<{ key: string; value: string }>('SELECT * FROM metadata')).map(row => [row.key, row.value]));
    if (metadata.get('initialized') !== '1' || metadata.get('metrics') !== METRICS_VERSION || !/^[a-f0-9]{32}$/.test(metadata.get('installation') ?? '')) throw new Error('Player metadata invalid');
    const row = await db.getFirstAsync<ProgressRow>('SELECT * FROM progress WHERE id=1');
    if (!row || row.catalog !== main.id) throw new Error('Player content version mismatch');
    const sessions = loadSessions(db, main, sides);
    if (!sessions.main) throw new Error('Missing main session');
    const state: MainlineState = Object.freeze({ main: sessions.main, side: sessions.side, replay: sessions.replay,
      current: row.current, completedThrough: row.completed, sideCompletedThrough: row.side_completed,
      tutorialDone: !!row.tutorial, symbols: !!row.symbols, hintCredits: row.credits, freeHintUsed: !!row.free_hint_used });
    validateProgress(state, main, sides);
    const revision = Number(metadata.get('revision'));
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('Invalid revision');
    // A process that never closed its play session has an observation gap; do not invent elapsed time.
    await transaction(db, async () => {
      const interrupted = await db.runAsync('UPDATE play_sessions SET interrupted=1,ended_at=last_at WHERE ended_at IS NULL');
      if (interrupted.changes) {
        for (const row of await db.getAllAsync<{ mode: string; level_id: string; count: number }>("SELECT c.mode,c.level_id,COUNT(*) AS count FROM attempts a JOIN challenges c ON c.id=a.challenge_id WHERE a.result='playing' AND a.partial=0 GROUP BY c.mode,c.level_id")) {
          await db.runAsync("INSERT INTO level_stats VALUES(?,?,'interrupted_attempts',?) ON CONFLICT(mode,level_id,metric) DO UPDATE SET value=value+excluded.value", row.mode, row.level_id, row.count);
        }
        await db.runAsync("UPDATE attempts SET partial=1 WHERE result='playing'");
      }
      await db.runAsync("UPDATE hint_requests SET result='interrupted' WHERE result IS NULL");
    });
    const player = new PlayerRepository(db, main, sides, state, metadata.get('installation')!, revision, appVersion);
    await transaction(db, () => player.metrics.initialize(Date.now()));
    return player;
  }
  private static async putProgress(db: WriteDatabase, state: MainlineState, catalog: string) {
    await db.runAsync(`INSERT INTO progress VALUES(1,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      catalog=excluded.catalog,current=excluded.current,completed=excluded.completed,side_completed=excluded.side_completed,
      tutorial=excluded.tutorial,symbols=excluded.symbols,credits=excluded.credits,free_hint_used=excluded.free_hint_used`,
    catalog, state.current, state.completedThrough, state.sideCompletedThrough, state.tutorialDone ? 1 : 0, state.symbols ? 1 : 0, state.hintCredits, state.freeHintUsed ? 1 : 0);
  }
  preference(key: 'sound' | 'vessel' | 'symbols' | 'language' | 'analytics'): string {
    const value = this.db.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key=?', key)?.value;
    if (value === undefined && key === 'language') return 'system';
    if (value === undefined) throw new Error('Missing preference');
    return value;
  }
  commit(next: MainlineState, action: GameplayAction, at = Date.now()): Promise<boolean> {
    const before = this.state;
    validateProgress(next, this.mainline, this.sides);
    this.state = next;
    return new Promise(resolve => {
      this.pending.push({ revision: ++this.revision, before, next, action: Object.freeze({ ...action }), at, resolve });
      void this.flush();
    });
  }
  record(action: GameplayAction, at = Date.now()) { return this.commit(this.state, action, at); }
  setPreference(key: 'sound' | 'vessel' | 'language' | 'analytics', value: string) { return this.record({ type: 'preference', preference: key, value }); }
  hintRequestId() { return `${this.installation}:hint:${this.revision + 1}`; }
  /** Feature writes share the player revision/transaction queue; never nest transactions. */
  enqueueWrite(work: (revision: number) => Promise<void>): Promise<boolean> {
    return new Promise(resolve => {
      this.pending.push({ revision: ++this.revision, at: Date.now(), before: this.state, next: this.state, action: { type: 'diagnostic' }, resolve, work });
      void this.flush();
    });
  }
  private async pruneMetrics(revision: number, at: number) {
    const last = Number(this.db.getFirstSync<{ value: string }>("SELECT value FROM metadata WHERE key='metrics-last-prune'")?.value ?? 0);
    if (revision - last >= 100) { await this.statistics.prune(at); await this.metrics.prune(revision, at); }
  }
  private async recordProductMetrics(job: Job) {
    const { before, next, action, revision, at } = job;
    const scope = sessionScope(before), after = visibleSession(next);
    const effective = action.type === 'reset' ? scope.session.history.length > 0 || scope.session.historyOffset > 0 || !!scope.session.solid?.melted
      : ['pour', 'undo', 'reserve', 'melt'].includes(action.type) ? scope.session !== after : true;
    const totals: Record<string, number> = { foreground_ms: Math.max(0, action.foregroundMs ?? 0), blocked_ms: Math.max(0, action.blockedMs ?? 0) };
    totals.blocked_ms = Math.min(totals.foreground_ms, totals.blocked_ms);
    totals.available_ms = totals.foreground_ms - totals.blocked_ms;
    if (effective && action.type === 'pour') { totals.pours = 1; totals[action.hinted ? 'hint_pours' : 'manual_pours'] = 1; }
    if (effective && ['undo', 'reset', 'melt', 'reserve'].includes(action.type)) totals[{ undo: 'undos', reset: 'resets', melt: 'melts', reserve: 'reserves' }[action.type as 'undo']] = 1;
    if (action.hinted && effective && hintAvailability(before) === 'ticket') totals.credits_spent = 1;
    const first = next.completedThrough > before.completedThrough || next.sideCompletedThrough > before.sideCompletedThrough;
    if (first) {
      totals.credits_expected = next.completedThrough > before.completedThrough ? before.current % 10 === 0 ? 2 : 1 : 0;
      totals.credits_awarded = next.hintCredits - before.hintCredits + (totals.credits_spent ?? 0);
      totals.credits_capped = totals.credits_expected - totals.credits_awarded;
    }
    const entry = (scope.session.solid ? this.sides.entries : this.mainline.entries).find(e => (e.levelId ?? e.level.id) === scope.levelId);
    const number = entry?.number ?? 0;
    const mainEntry = this.mainline.entries.find(e => (e.levelId ?? e.level.id) === scope.levelId);
    await this.metrics.record(revision, at, {
      slot: scope.slot, mode: scope.mode, levelId: scope.levelId, catalog: this.mainline.id,
      rules: scope.session.solid ? 'solid-bottom-v1' : 'water-sort-v1', number,
      attributes: { colors: scope.session.level.colors.length, stage: Math.ceil(number / (scope.session.solid ? 5 : 50)), tier: mainEntry?.tier ?? 'side', wave_role: scope.session.solid ? 'side' : metricPlan[number - 1]?.waveRole ?? 'unknown' },
      existing: scope.session.history.length > 0 || scope.session.historyOffset > 0 || before.freeHintUsed,
      completed: scope.session.status === 'solved', routePosition: after.level.id === scope.levelId ? after.historyOffset + after.history.length : scope.session.historyOffset + scope.session.history.length,
    }, {
      kind: action.type, effective, totals, slices: action.slices, requestId: action.requestId, result: action.result, durationMs: action.durationMs,
      resource: hintAvailability(before), hinted: action.hinted,
      completion: effective && action.type === 'pour' && after.status === 'solved' ? 'solved' : undefined,
      stalled: scope.levelId === after.level.id && scope.session.status !== 'stalled' && after.status === 'stalled',
      recovered: scope.session.status === 'stalled' && ['undo', 'reset', 'melt', 'reserve'].includes(action.type),
      detail: action.type === 'preference' ? { preference: action.preference ?? 'unknown', value: action.value ?? 'unknown' } : undefined,
    });
  }
  /** Retain the failed head and all following jobs. Later actions/background retry in order. */
  flush(): Promise<boolean> {
    if (this.running) return this.running;
    let succeeded = false;
    let failedJob: Job | null = null;
    this.running = (async () => {
      while (this.pending.length) {
        const job = this.pending[0];
        try {
          await transaction(this.db, async () => {
            const saved = Number((await this.db.getFirstAsync<{ value: string }>("SELECT value FROM metadata WHERE key='revision'"))!.value);
            if (saved >= job.revision) return;
            if (saved !== job.revision - 1) throw new Error('Player write revision gap');
            if (job.work) {
              await job.work(job.revision);
              await this.pruneMetrics(job.revision, job.at);
              if (this.writeFailures) await this.metrics.emit(job.revision, job.at, 'bh_quality', { operation: 'storage_write', result: 'recovered', count: this.writeFailures });
              await this.db.runAsync("UPDATE metadata SET value=? WHERE key='revision'", String(job.revision));
              return;
            }
            if (job.before !== job.next) {
              await PlayerRepository.putProgress(this.db, job.next, this.mainline.id);
              await saveSession(this.db, 'main', job.next.main, job.before.main);
              await saveSession(this.db, 'side', job.next.side, job.before.side);
              await saveSession(this.db, 'replay', job.next.replay, job.before.replay);
              if (job.before.symbols !== job.next.symbols) await this.db.runAsync("UPDATE preferences SET value=? WHERE key='symbols'", String(job.next.symbols));
            }
            if (job.action.type === 'preference' && job.action.preference === 'analytics') {
              await this.db.runAsync('DELETE FROM metric_outbox');
              await this.db.runAsync("UPDATE metadata SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='analytics-epoch'");
            }
            if (job.action.type === 'preference' && job.action.preference && job.action.value !== undefined) await this.db.runAsync('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', job.action.preference, job.action.value);
            await this.statistics.record(job.revision, job.at, job.before, job.next, job.action);
            await this.recordProductMetrics(job);
            await this.pruneMetrics(job.revision, job.at);
            if (this.writeFailures) await this.metrics.emit(job.revision, job.at, 'bh_quality', { operation: 'storage_write', result: 'recovered', count: this.writeFailures });
            await this.db.runAsync("UPDATE metadata SET value=? WHERE key='revision'", String(job.revision));
          });
          this.writeFailures = 0;
          this.pending.shift(); job.resolve(true);
          try { this.onCommitted?.(); } catch { /* Delivery is independent of the committed save. */ }
        } catch {
          this.writeFailures = Math.min(1000000, this.writeFailures + 1);
          failedJob = job;
          return false;
        }
      }
      succeeded = true;
      return true;
    })().finally(() => {
      this.running = null;
      failedJob?.resolve(false);
      // An awaiting caller can enqueue between resolving its job and this cleanup.
      if (succeeded && this.pending.length) void this.flush();
    });
    return this.running;
  }
}
