import { visibleSession, hintAvailability, type MainlineState } from '../game/mainline.ts';
import type { WriteDatabase } from './sql.ts';
import type { MetricTimeSlice } from './metricTime.ts';
import { METRICS_VERSION } from './playerSchema.ts';

export type GameplayAction = {
  type: 'show' | 'pause' | 'background' | 'clock' | 'pour' | 'undo' | 'reset' | 'reserve' | 'melt' | 'navigate' | 'select' | 'preference' | 'hint-request' | 'hint-result' | 'dismiss-stalled' | 'diagnostic' | 'stalled-notice' | 'tutorial-show' | 'tutorial-complete';
  slices?: MetricTimeSlice[]; hinted?: boolean; source?: string; target?: string; amount?: number; requestId?: string;
  result?: string; durationMs?: number; foregroundMs?: number; blockedMs?: number;
  preference?: string; value?: string; sinceInputMs?: number; reason?: string;
};
type Challenge = { id: string; slot: string; level_id: string; mode: string; attempt_id: string; status: string; assisted: number };

export function sessionScope(state: MainlineState) {
  const session = visibleSession(state), slot = state.replay ? 'replay' : state.side ? 'side' : 'main';
  const completed = slot === 'main' ? state.completedThrough >= state.current : slot === 'side' ? state.sideCompletedThrough >= state.current / 20 : false;
  const base = session.solid ? 'side' : 'mainline';
  const mode = slot === 'replay' ? `replay-${base}` : completed ? `post-${base}` : base;
  return { session, slot, mode, levelId: session.level.id };
}

export class StatisticsRecorder {
  readonly db: WriteDatabase;
  readonly installation: string;
  readonly catalog: string;
  readonly appVersion: string;
  constructor(db: WriteDatabase, installation: string, catalog: string, appVersion: string) {
    this.db = db; this.installation = installation; this.catalog = catalog; this.appVersion = appVersion;
  }
  private async add(mode: string, levelId: string, metric: string, value = 1) {
    if (!value) return;
    await this.db.runAsync(`INSERT INTO level_stats VALUES(?,?,?,?) ON CONFLICT(mode,level_id,metric) DO UPDATE SET value=value+excluded.value`, mode, levelId, metric, value);
  }
  private async daily(at: number, metric: string, value = 1) {
    if (!value) return;
    const d = new Date(at), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timezone = `UTC${-d.getTimezoneOffset()}`;
    await this.db.runAsync(`INSERT INTO daily_stats VALUES(?,?,?,?) ON CONFLICT(day,timezone,metric) DO UPDATE SET value=value+excluded.value`, day, timezone, metric, value);
  }
  private async ensure(before: MainlineState, id: string, at: number, force = false): Promise<Challenge> {
    const scope = sessionScope(before);
    let row = await this.db.getFirstAsync<Challenge>("SELECT * FROM challenges WHERE slot=? AND status='open' ORDER BY started_at DESC LIMIT 1", scope.slot);
    if (row && (force || row.level_id !== scope.levelId || row.mode !== scope.mode)) {
      await this.db.runAsync("UPDATE challenges SET status='left' WHERE id=?", row.id);
      await this.db.runAsync("UPDATE attempts SET ended_at=?,result='left' WHERE id=?", at, row.attempt_id);
      row = null;
    }
    if (!row) {
      const attempt = `${id}:a`;
      await this.db.runAsync("INSERT INTO challenges VALUES(?,?,?,?,?,?,?,0,?)", id, scope.slot, scope.levelId, scope.mode, at, null, 'open', attempt);
      await this.db.runAsync("INSERT INTO attempts VALUES(?,?,?,?,?,0)", attempt, id, at, null, 'playing');
      await this.add(scope.mode, scope.levelId, 'challenges'); await this.add(scope.mode, scope.levelId, 'attempts');
      row = { id, slot: scope.slot, level_id: scope.levelId, mode: scope.mode, attempt_id: attempt, status: 'open', assisted: 0 };
    }
    return row;
  }
  async record(sequence: number, at: number, before: MainlineState, next: MainlineState, action: GameplayAction) {
    const id = `${this.installation}:${sequence}`, scope = sessionScope(before);
    let playSession = await this.db.getFirstAsync<{ id: string }>('SELECT id FROM play_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1');
    if (!playSession && ['show', 'pour', 'undo', 'reset', 'reserve', 'melt', 'select', 'navigate', 'preference', 'hint-request'].includes(action.type)) {
      playSession = { id: `${id}:play` };
      await this.db.runAsync('INSERT INTO play_sessions VALUES(?,?,?,NULL,0)', playSession.id, at, at);
      await this.daily(at, 'play_sessions');
    }
    if (playSession) await this.db.runAsync('UPDATE play_sessions SET last_at=? WHERE id=?', at, playSession.id);
    const nextScope = sessionScope(next);
    const effective = action.type === 'reset' ? scope.session.history.length > 0 || scope.session.historyOffset > 0 || !!scope.session.solid?.melted
      : ['pour', 'undo', 'reserve', 'melt'].includes(action.type) ? scope.session !== nextScope.session : true;
    let challenge = await this.db.getFirstAsync<Challenge>("SELECT * FROM challenges WHERE slot=? AND level_id=? AND mode=? AND status='open' LIMIT 1", scope.slot, scope.levelId, scope.mode);
    const creates = ['show', 'pour', 'undo', 'reset', 'reserve', 'melt', 'hint-request'];
    if (effective && creates.includes(action.type) && (action.type !== 'show' || scope.session.status !== 'solved')) challenge = await this.ensure(before, `${id}:c`, at);
    if (action.type === 'select' && next.replay && next.replay !== before.replay) {
      const old = await this.db.getFirstAsync<Challenge>("SELECT * FROM challenges WHERE slot=? AND status='open' LIMIT 1", nextScope.slot);
      if (old) {
        await this.db.runAsync("UPDATE challenges SET status='left' WHERE id=?", old.id);
        await this.db.runAsync("UPDATE attempts SET ended_at=?,result='left' WHERE id=?", at, old.attempt_id);
      }
    }
    if (challenge) {
      const add = (metric: string, value = 1) => this.add(challenge!.mode, challenge!.level_id, metric, value);
      const foreground = Math.max(0, action.foregroundMs ?? 0), blocked = Math.min(foreground, Math.max(0, action.blockedMs ?? 0));
      await add('foreground_ms', foreground); await add('blocked_ms', blocked); await add('available_ms', foreground - blocked);
      await this.daily(at, 'foreground_ms', foreground);
      const vessel = this.db.getFirstSync<{ value: string }>("SELECT value FROM preferences WHERE key='vessel'")!.value;
      await this.daily(at, `vessel_${vessel}_ms`, foreground);
      if ((action.sinceInputMs ?? 0) >= 60000) await add('long_pauses');
      if (effective && action.type === 'pour') {
        await add(action.hinted ? 'hint_pours' : 'manual_pours'); await add('pours');
        if (action.hinted) {
          await this.db.runAsync('UPDATE challenges SET assisted=1 WHERE id=?', challenge.id);
          const resource = hintAvailability(before);
          await add(`hint_${resource}`);
          if (resource === 'ticket') await add('credits_spent');
          if (!challenge.assisted) await add('first_hint_route_position', scope.session.historyOffset + scope.session.history.length);
          if (action.requestId) await this.db.runAsync('UPDATE hint_requests SET executed=1 WHERE id=? AND challenge_id=?', action.requestId, challenge.id);
        }
      }
      if (effective && action.type === 'undo') await add('undos');
      if (effective && action.type === 'reset') {
        await add('resets'); await add('attempts');
        await this.db.runAsync("UPDATE attempts SET ended_at=?,result='reset' WHERE id=?", at, challenge.attempt_id);
        challenge.attempt_id = `${id}:a`;
        await this.db.runAsync("INSERT INTO attempts VALUES(?,?,?,?,?,0)", challenge.attempt_id, challenge.id, at, null, 'playing');
        await this.db.runAsync('UPDATE challenges SET attempt_id=? WHERE id=?', challenge.attempt_id, challenge.id);
      }
      if (effective && (action.type === 'melt' || action.type === 'reserve')) await add(action.type === 'melt' ? 'melts' : 'reserves');
      if (action.type === 'dismiss-stalled') await add('stalled_dismissals');
      if (action.type === 'show') await add('visits');
      if (action.type === 'hint-request' && action.requestId) {
        await add('hint_requests');
        const resource = hintAvailability(before);
        await this.db.runAsync('INSERT INTO hint_requests VALUES(?,?,?,?,NULL,NULL,0,?)', action.requestId, challenge.id, scope.levelId, at, resource);
        if (resource === 'none') await add('hint_no_credit');
      }
      if (action.type === 'hint-result' && action.requestId) {
        const changed = await this.db.runAsync('UPDATE hint_requests SET result=?,duration_ms=? WHERE id=? AND result IS NULL', action.result ?? 'unknown', action.durationMs ?? 0, action.requestId);
        if (changed.changes) await add(`search_${action.result ?? 'unknown'}`);
      }
      if (scope.session.status !== 'stalled' && nextScope.session.status === 'stalled' && scope.levelId === nextScope.levelId) await add('stalled_episodes');
      if (effective && scope.session.status === 'stalled' && ['undo', 'reset', 'melt', 'reserve'].includes(action.type)) await add(`stalled_${action.type}`);
      if (effective && action.type === 'pour' && nextScope.session.status === 'solved') {
        await this.db.runAsync("UPDATE challenges SET completed_at=?,status='completed' WHERE id=?", at, challenge.id);
        await this.db.runAsync("UPDATE attempts SET ended_at=?,result='solved' WHERE id=?", at, challenge.attempt_id);
        await add('completed_challenges'); await add('completed_route_steps', nextScope.session.historyOffset + nextScope.session.history.length);
        await add('completed_without_hints', challenge.assisted || action.hinted ? 0 : 1);
        if (nextScope.session.solid?.melted) await add('completed_melted');
      }
    }
    const firstMain = next.completedThrough > before.completedThrough, firstSide = next.sideCompletedThrough > before.sideCompletedThrough;
    if (firstMain || firstSide) {
      const mode = firstSide ? 'side' : 'mainline';
      const completion = await this.db.runAsync('INSERT OR IGNORE INTO completions VALUES(?,?,?)', mode, nextScope.levelId, at);
      if (completion.changes) {
        await this.add(mode, nextScope.levelId, 'first_clears'); await this.daily(at, 'first_clears');
        const expected = firstMain ? next.current % 10 === 0 ? 2 : 1 : 0;
        await this.add(mode, nextScope.levelId, 'credits_expected', expected);
        // A hinted final pour can spend one ticket and receive the completion reward together.
        const spent = action.hinted && hintAvailability(before) === 'ticket' ? 1 : 0;
        await this.add(mode, nextScope.levelId, 'credits_awarded', next.hintCredits - before.hintCredits + spent);
        await this.add(mode, nextScope.levelId, 'credits_capped', expected - (next.hintCredits - before.hintCredits + spent));
      }
    }
    if (action.type === 'background' && playSession) await this.db.runAsync('UPDATE play_sessions SET ended_at=? WHERE id=?', at, playSession.id);
    await this.db.runAsync('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', sequence, id, sequence, at, playSession?.id ?? null,
      challenge?.id ?? null, challenge?.attempt_id ?? null, scope.mode, scope.levelId, action.type, this.appVersion, this.catalog,
      scope.session.solid ? 'solid-bottom-v1' : 'water-sort-v1', 'hint-credits-v1', METRICS_VERSION, JSON.stringify({ ...action, effective,
        routePosition: scope.session.historyOffset + scope.session.history.length, hintResource: hintAvailability(before),
        melted: !!scope.session.solid?.melted, symbols: before.symbols, integrity: 'observed' }));

  }
  async prune(at: number, maxEvents = 50000, days = 30) {
    const cutoff = await this.db.getFirstAsync<{ sequence: number }>('SELECT MAX(sequence) AS sequence FROM events WHERE at<? OR sequence IN(SELECT sequence FROM events ORDER BY sequence DESC LIMIT -1 OFFSET ?)', at - days * 86400000, maxEvents);
    if (cutoff?.sequence) await this.db.runAsync("INSERT INTO metadata VALUES('events_pruned_through',?) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(value AS INTEGER),CAST(excluded.value AS INTEGER)) AS TEXT)", String(cutoff.sequence));
    await this.db.runAsync('DELETE FROM events WHERE at<? OR sequence IN(SELECT sequence FROM events ORDER BY sequence DESC LIMIT -1 OFFSET ?)', at - days * 86400000, maxEvents);
    await this.db.runAsync('DELETE FROM hint_requests WHERE result IS NOT NULL AND (requested_at<? OR id IN(SELECT id FROM hint_requests ORDER BY requested_at DESC,id DESC LIMIT -1 OFFSET ?))', at - days * 86400000, maxEvents);
    await this.db.runAsync("DELETE FROM attempts WHERE result<>'playing' AND (ended_at<? OR id IN(SELECT id FROM attempts ORDER BY started_at DESC,id DESC LIMIT -1 OFFSET ?)) AND id NOT IN(SELECT attempt_id FROM challenges WHERE status='open')", at - days * 86400000, maxEvents);
    await this.db.runAsync("DELETE FROM challenges WHERE status<>'open' AND id NOT IN(SELECT challenge_id FROM attempts) AND (started_at<? OR id IN(SELECT id FROM challenges ORDER BY started_at DESC,id DESC LIMIT -1 OFFSET ?))", at - days * 86400000, maxEvents);
    await this.db.runAsync('DELETE FROM play_sessions WHERE ended_at IS NOT NULL AND (ended_at<? OR id IN(SELECT id FROM play_sessions ORDER BY started_at DESC,id DESC LIMIT -1 OFFSET ?))', at - days * 86400000, maxEvents);
  }
}
