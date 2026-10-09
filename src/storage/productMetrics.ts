import type { WriteDatabase } from './sql.ts';
import { PRODUCT_METRICS_VERSION, METRICS_SCHEMA } from './metricsSchema.ts';
import { splitLocalDays, type MetricTimeSlice } from './metricTime.ts';
import { validateParameters, type AnalyticsEventName, type AnalyticsParameters } from '../analytics/contracts.ts';

export type MetricTotals = Record<string, number>;
export type MetricContext = {
  slot: string; mode: string; levelId: string; catalog: string; rules: string; number: number;
  attributes?: AnalyticsParameters; attemptKey?: string; existing: boolean; completed: boolean; routePosition: number;
};
export type MetricObservation = {
  kind: string; effective?: boolean; totals?: MetricTotals; slices?: MetricTimeSlice[];
  requestId?: string; result?: string; durationMs?: number; resource?: string;
  hinted?: boolean; answer?: 'correct' | 'wrong'; completion?: 'solved' | 'remembered' | 'recovered';
  detail?: AnalyticsParameters; stalled?: boolean; recovered?: boolean;
};
type Run = { id: string; slot: string; mode: string; level_id: string; catalog: string; rules: string; started_at: number;
  last_at: number; ended_at: number | null; result: string; partial: number; first_exposure: number; attempt: number; totals: string; flags: string };
type Flags = { hint: boolean; melt: boolean; reserve: boolean; answer?: string; attemptKey?: string; firstAction?: boolean; attributes?: AnalyticsParameters };
const timeBuckets = [0, 10000, 30000, 60000, 120000, 300000, 600000, 1200000, 1800000, 3600000];
const countBuckets = [0, 1, 2, 3, 5, 10, 20, 50];
export function metricBucket(value: number, time = false) {
  const edges = time ? timeBuckets : countBuckets;
  return value === 0 ? '0' : `${edges.find(n => n >= value) ?? 'overflow'}`;
}
function sum(target: MetricTotals, values: MetricTotals) {
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid metric delta');
    target[key] = (target[key] ?? 0) + value;
  }
}
function assistance(flags: Flags) { return `${flags.hint ? 'hint' : 'nohint'}_${flags.melt ? 'melt' : 'nomelt'}_${flags.reserve ? 'reserve' : 'noreserve'}`; }
function common(run: Run): AnalyticsParameters {
  return { ...JSON.parse(run.flags).attributes, mode: run.mode, puzzle_id: run.level_id, content_version: run.catalog, rules_version: run.rules,
    integrity: run.partial ? 'partial' : 'complete', first_exposure: run.first_exposure };
}
/** All methods that mutate facts run inside the player's existing serial transaction. */
export class ProductMetrics {
  readonly db: WriteDatabase;
  readonly appVersion: string;
  readonly installation: string;
  constructor(db: WriteDatabase, appVersion: string, installation: string) { this.db = db; this.appVersion = appVersion; this.installation = installation; }
  async initialize(at: number) {
    await this.db.execAsync(METRICS_SCHEMA);
    await this.db.runAsync("INSERT OR IGNORE INTO metadata VALUES('product-metrics-since',?)", String(at));
    await this.db.runAsync("INSERT OR IGNORE INTO metadata VALUES('product-metrics-version',?)", PRODUCT_METRICS_VERSION);
    // New installations collect by default; never overwrite a saved opt-out.
    await this.db.runAsync("INSERT OR IGNORE INTO preferences VALUES('analytics','true')");
    await this.db.runAsync("INSERT OR IGNORE INTO metadata VALUES('analytics-epoch','0')");
    await this.db.runAsync("INSERT OR IGNORE INTO metadata VALUES('metrics-last-prune','0')");
    // A visit without a closed boundary has an observation gap; clean pauses retain completeness.
    const open = await this.db.getAllAsync<{ run_id: string }>('SELECT DISTINCT run_id FROM metric_visits WHERE ended_at IS NULL');
    for (const row of open) {
      await this.db.runAsync('UPDATE metric_runs SET partial=1 WHERE id=?', row.run_id);
      await this.db.runAsync("UPDATE metric_firsts SET summary=COALESCE(summary,'{\"partial\":true,\"pending\":true}') WHERE completed_at IS NULL AND (mode,level_id,rules) IN(SELECT mode,level_id,rules FROM metric_runs WHERE id=?)", row.run_id);
      await this.db.runAsync("UPDATE metric_attempts SET partial=1 WHERE run_id=? AND result='playing'", row.run_id);
    }
    await this.db.runAsync('UPDATE metric_visits SET ended_at=last_at,partial=1 WHERE ended_at IS NULL');
    await this.db.runAsync('UPDATE metric_app_sessions SET ended_at=last_at,interrupted=1 WHERE ended_at IS NULL');
    await this.db.runAsync("UPDATE metric_requests SET result='interrupted' WHERE result IS NULL");
  }
  async emit(revision: number, at: number, name: AnalyticsEventName, params: AnalyticsParameters = {}, suffix: string = name) {
    if (this.db.getFirstSync<{ value: string }>("SELECT value FROM preferences WHERE key='analytics'")?.value !== 'true') return;
    const epoch = Number(this.db.getFirstSync<{ value: string }>("SELECT value FROM metadata WHERE key='analytics-epoch'")!.value);
    const environment = this.db.getFirstSync<{ value: string }>("SELECT value FROM metadata WHERE key='analytics-environment'")?.value ?? 'unconfigured';
    // Web, TV and offline builds keep local facts without creating an upload queue.
    if (environment !== 'production' && environment !== 'test') return;
    const id = `${this.installation}:${revision}:${suffix}`;
    const eventId = this.db.getFirstSync<{id:string}>('SELECT lower(hex(randomblob(16))) id')!.id;
    const data = { ...params, event_id: eventId, event_at: at, metrics_version: PRODUCT_METRICS_VERSION, app_version: this.appVersion, build_environment: environment };
    validateParameters(name, data);
    await this.db.runAsync('INSERT OR IGNORE INTO metric_outbox(id,revision,at,name,params,epoch) VALUES(?,?,?,?,?,?)', id, revision, at, name, JSON.stringify(data), epoch);
  }
  async session(revision: number, at: number, kind: 'foreground' | 'background' | 'ready', detail: AnalyticsParameters = {}) {
    let session = await this.db.getFirstAsync<{ id: string }>('SELECT id FROM metric_app_sessions WHERE ended_at IS NULL');
    if (!session && kind !== 'background') {
      session = { id: `${this.installation}:${revision}:app` };
      await this.db.runAsync('INSERT INTO metric_app_sessions VALUES(?,?,?,NULL,0)', session.id, at, at);
    }
    if (session) await this.db.runAsync('UPDATE metric_app_sessions SET last_at=?,ended_at=? WHERE id=?', at, kind === 'background' ? at : null, session.id);
    await this.emit(revision, at, kind === 'ready' ? 'bh_app_ready' : kind === 'foreground' ? 'bh_app_foreground' : 'bh_app_background', detail);
  }
  private async aggregate(run: Run, metric: string, value: number, bucket = '', flags: Flags = JSON.parse(run.flags)) {
    await this.db.runAsync(`INSERT INTO metric_summary VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET value=value+excluded.value`,
      run.mode, run.level_id, run.catalog, run.rules, PRODUCT_METRICS_VERSION, run.partial ? 'partial' : 'complete', assistance(flags), metric, bucket, value);
  }
  private async day(day: string, offset: number, mode: string, metric: string, value: number) {
    if (!value) return;
    await this.db.runAsync('INSERT INTO metric_days VALUES(?,?,?,?,?,?) ON CONFLICT DO UPDATE SET value=value+excluded.value', day, offset, mode, PRODUCT_METRICS_VERSION, metric, value);
  }
  private async activity(revision: number, at: number, mode: string, day: string, offset: number, qualifying: boolean) {
    if (!qualifying) return;
    await this.db.runAsync("INSERT OR IGNORE INTO metric_days VALUES(?,?,?,?,'active',1)", day, offset, mode, PRODUCT_METRICS_VERSION);
    const key = `metrics-activation:${mode}`;
    await this.db.runAsync('INSERT OR IGNORE INTO metadata VALUES(?,?)', key, JSON.stringify({ day, offset, at }));
    const first = JSON.parse(this.db.getFirstSync<{ value: string }>('SELECT value FROM metadata WHERE key=?', key)!.value) as { day: string; offset: number };
    const cohortDay = new Date(at + first.offset * 60000).toISOString().slice(0, 10);
    const changed = await this.db.runAsync("INSERT OR IGNORE INTO metric_days VALUES(?,?,?,?,'cohort-active',1)", cohortDay, first.offset, mode, PRODUCT_METRICS_VERSION);
    if (!changed.changes) return;
    const since = Math.floor((Date.parse(cohortDay) - Date.parse(first.day)) / 86400000);
    await this.emit(revision, at, 'bh_active_day', { mode, day: cohortDay, cohort_day: first.day, since_activation: Math.max(0, since) }, `active-${mode}-${cohortDay}`);
  }
  private async closeVisit(run: Run, revision: number, at: number, reason: string) {
    const visit = await this.db.getFirstAsync<{ id: string; totals: string }>('SELECT id,totals FROM metric_visits WHERE run_id=? AND ended_at IS NULL', run.id);
    if (!visit) return;
    await this.db.runAsync('UPDATE metric_visits SET ended_at=?,last_at=? WHERE id=?', at, at, visit.id);
    const totals: MetricTotals = JSON.parse(visit.totals);
    await this.emit(revision, at, 'bh_puzzle_leave', { ...common(run), reason, foreground_ms: totals.foreground_ms ?? 0, available_ms: totals.available_ms ?? 0,
      observation_ms: totals.observation_ms ?? 0, peek_ms: totals.peek_ms ?? 0, hidden_ms: totals.hidden_ms ?? 0, cleanup_ms: totals.cleanup_ms ?? 0, blocked_ms: totals.blocked_ms ?? 0 });
  }
  private async finishAttempt(run: Run, revision: number, at: number, result: string) {
    const id = `${run.id}:a${run.attempt}`;
    const attempt = await this.db.getFirstAsync<{ totals: string; partial: number }>('SELECT totals,partial FROM metric_attempts WHERE id=?', id);
    const changed = await this.db.runAsync("UPDATE metric_attempts SET ended_at=?,result=? WHERE id=? AND result='playing'", at, result, id);
    if (changed.changes && attempt) {
      const totals: MetricTotals = JSON.parse(attempt.totals);
      await this.aggregate({ ...run, partial: attempt.partial }, `attempt_${result}`, 1);
      for (const [key, value] of Object.entries(totals)) if (key.endsWith('_ms')) await this.aggregate({ ...run, partial: attempt.partial }, `attempt_${key}`, 1, metricBucket(value, true));
      await this.emit(revision, at, 'bh_attempt_end', { ...common(run), result, pours: totals.pours ?? 0, undos: totals.undos ?? 0, foreground_ms: totals.foreground_ms ?? 0 });
    }
  }
  async record(revision: number, at: number, context: MetricContext, observation: MetricObservation) {
    const { kind } = observation;
    let run = await this.db.getFirstAsync<Run>("SELECT * FROM metric_runs WHERE slot=? AND result='playing'", context.slot);
    const differs = run && (run.level_id !== context.levelId || run.mode !== context.mode || JSON.parse(run.flags).attemptKey !== context.attemptKey);
    if (run && differs) {
      await this.closeVisit(run, revision, at, 'switch');
      const result = kind === 'reset' ? 'reset' : 'left';
      await this.finishAttempt(run, revision, at, result);
      await this.db.runAsync("UPDATE metric_runs SET ended_at=?,result=? WHERE id=?", at, result, run.id); run = null;
    }
    const creates = ['show', 'pour', 'undo', 'reset', 'melt', 'reserve', 'hint-request', 'ready', 'peek-open', 'next'];
    if (!run && !context.completed && creates.includes(kind) && observation.effective !== false) {
      const first = await this.db.runAsync('INSERT OR IGNORE INTO metric_firsts VALUES(?,?,?,?,?,NULL,?,NULL)', context.mode, context.levelId, context.rules, context.catalog, at, context.existing ? 0 : 1);
      run = { id: `${this.installation}:${revision}:r`, slot: context.slot, mode: context.mode, level_id: context.levelId, catalog: context.catalog,
        rules: context.rules, started_at: at, last_at: at, ended_at: null, result: 'playing', partial: context.existing ? 1 : 0,
        first_exposure: first.changes && !context.existing ? 1 : 0, attempt: 1, totals: JSON.stringify({ attempts: 1 }),
        flags: JSON.stringify({ hint: false, melt: false, reserve: false, attemptKey: context.attemptKey, attributes: { ...context.attributes, level_number: context.number } }) };
      await this.db.runAsync('INSERT INTO metric_runs VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', ...Object.values(run));
      await this.db.runAsync("INSERT INTO metric_attempts VALUES(?,?,?,NULL,'playing',?,'{}')", `${run.id}:a1`, run.id, at, run.partial);
      await this.emit(revision, at, 'bh_puzzle_start', { ...common(run), level_number: context.number, new_observation: context.existing ? 0 : 1 });
    }
    if (!run) {
      if (kind === 'preference') await this.emit(revision, at, 'bh_preference', observation.detail);
      if (kind.startsWith('tutorial')) await this.emit(revision, at, 'bh_tutorial', { mode: context.mode, stage: kind });
      return;
    }
    let visit = await this.db.getFirstAsync<{ id: string; totals: string }>('SELECT id,totals FROM metric_visits WHERE run_id=? AND ended_at IS NULL', run.id);
    if (!visit && creates.includes(kind) && observation.effective !== false) {
      visit = { id: `${this.installation}:${revision}:v`, totals: '{}' };
      await this.db.runAsync('INSERT INTO metric_visits VALUES(?,?,?,?,NULL,?,?)', visit.id, run.id, at, at, run.partial, '{}');
      const totals: MetricTotals = JSON.parse(run.totals); sum(totals, { visits: 1 }); run.totals = JSON.stringify(totals);
      await this.emit(revision, at, 'bh_puzzle_visit', { ...common(run), result: kind === 'show' && !differs ? 'enter_or_resume' : 'action' });
    }
    const values: MetricTotals = { ...observation.totals };
    if (observation.stalled) values.stalled_episodes = 1;
    if (observation.recovered && observation.effective !== false) values.stalled_recoveries = 1;
    const flags: Flags = JSON.parse(run.flags);
    const effective = observation.effective !== false;
    if (effective && kind === 'pour') { flags.hint ||= !!observation.hinted; }
    if (effective && kind === 'melt') flags.melt = true;
    if (effective && kind === 'reserve') flags.reserve = true;
    if (kind === 'hint-request' && observation.requestId) {
      const inserted = await this.db.runAsync('INSERT OR IGNORE INTO metric_requests(id,run_id,requested_at,resource) VALUES(?,?,?,?)', observation.requestId, run.id, at, observation.resource ?? 'free');
      if (inserted.changes) { values.hint_requests = 1; await this.emit(revision, at, 'bh_hint_request', { ...common(run), resource: observation.resource ?? 'free', route_position: context.routePosition }); }
    }
    if (kind === 'hint-result' && observation.requestId) {
      const changed = await this.db.runAsync('UPDATE metric_requests SET result=?,duration_ms=? WHERE id=? AND run_id=? AND result IS NULL', observation.result ?? 'unknown', Math.max(0, observation.durationMs ?? 0), observation.requestId, run.id);
      if (changed.changes) { values[`search_${observation.result ?? 'unknown'}`] = 1; await this.emit(revision, at, 'bh_hint_result', { ...common(run), result: observation.result ?? 'unknown', duration_ms: observation.durationMs ?? 0 }); }
    }
    if (kind === 'pour' && effective && observation.hinted) {
      if (observation.requestId) await this.db.runAsync('UPDATE metric_requests SET executed=1 WHERE id=? AND run_id=? AND executed=0', observation.requestId, run.id);
      await this.emit(revision, at, 'bh_hint_execute', { ...common(run), resource: observation.resource ?? 'free', route_position: context.routePosition });
    }
    if ((values.credits_spent ?? 0) > 0) await this.emit(revision, at, 'bh_credit_spend', { ...common(run), credits_spent: values.credits_spent });
    // Real monotonic intervals are split at local midnight; synthetic test callers may supply totals only.
    for (const slice of observation.slices ?? []) for (const fragment of splitLocalDays(slice)) {
      const phase = slice.blocked ? 'blocked_ms' : slice.phase === 'observe' ? 'observation_ms' : slice.phase === 'peek' ? 'peek_ms' : slice.phase === 'cleanup' ? 'cleanup_ms' : context.mode.includes('memory') ? 'hidden_ms' : 'available_ms';
      await this.day(fragment.day, fragment.offset, run.mode, phase, fragment.durationMs);
      await this.day(fragment.day, fragment.offset, run.mode, 'foreground_ms', fragment.durationMs);
      const foreground = this.db.getFirstSync<{ value: number }>("SELECT value FROM metric_days WHERE day=? AND offset=? AND mode=? AND metric='foreground_ms'", fragment.day, fragment.offset, run.mode)?.value ?? 0;
      await this.activity(revision, fragment.endAt - 1, run.mode, fragment.day, fragment.offset, foreground >= 10000);
    }
    const offset = -new Date(at).getTimezoneOffset(), day = new Date(at + offset * 60000).toISOString().slice(0, 10);
    if (effective && ['pour', 'ready', 'peek-open'].includes(kind)) await this.activity(revision, at, run.mode, day, offset, true);
    for (const [key, value] of Object.entries(values)) if (!key.endsWith('_ms')) await this.day(day, offset, run.mode, key, value);
    const totals: MetricTotals = JSON.parse(run.totals); sum(totals, values);
    run.totals = JSON.stringify(totals); run.flags = JSON.stringify(flags); run.last_at = at;
    const attempt = await this.db.getFirstAsync<{ totals: string }>('SELECT totals FROM metric_attempts WHERE id=?', `${run.id}:a${run.attempt}`);
    if (attempt) { const a: MetricTotals = JSON.parse(attempt.totals); sum(a, values); await this.db.runAsync('UPDATE metric_attempts SET totals=? WHERE id=?', JSON.stringify(a), `${run.id}:a${run.attempt}`); }
    if (visit) { const v: MetricTotals = JSON.parse(visit.totals); sum(v, values); await this.db.runAsync('UPDATE metric_visits SET totals=?,last_at=? WHERE id=?', JSON.stringify(v), at, visit.id); }
    if (effective && ['pour', 'undo', 'reset', 'melt', 'reserve', 'peek-open', 'peek-close', 'ready', 'continue-after-reveal'].includes(kind)) {
      await this.emit(revision, at, 'bh_puzzle_action', { ...common(run), action: kind, route_position: context.routePosition, resource: observation.hinted ? observation.resource ?? 'free' : 'manual' });
      if (kind === 'pour' && !observation.hinted && !flags.firstAction) {
        flags.firstAction = true; run.flags = JSON.stringify(flags);
        await this.emit(revision, at, 'bh_first_action', { ...common(run), first_action_ms: totals.foreground_ms ?? 0 });
      }
    }
    if (observation.stalled) { await this.emit(revision, at, 'bh_stalled', common(run)); }
    if (observation.recovered && effective) await this.emit(revision, at, 'bh_stalled_recovery', { ...common(run), action: kind });
    if (kind === 'stalled-notice' || kind === 'dismiss-stalled') await this.emit(revision, at, 'bh_stalled_notice', { ...common(run), action: kind });
    if (kind === 'preference') await this.emit(revision, at, 'bh_preference', observation.detail);
    if (kind.startsWith('answer-check')) await this.emit(revision, at, 'bh_memory_check', { ...common(run), stage: kind, result: observation.result ?? 'pending' });
    if (observation.answer && !flags.answer) {
      flags.answer = observation.answer;
      const unassisted = !run.partial && !flags.hint && !(totals.peeks > 0);
      const category = run.first_exposure ? 'first' : 'repeat';
      await this.aggregate(run, `${category}_answer_${observation.answer}`, 1, '', flags);
      if (unassisted) await this.aggregate(run, `${category}_unassisted_${observation.answer}`, 1, '', flags);
      await this.emit(revision, at, 'bh_memory_answer', { ...common(run), answer: observation.answer, unassisted: Number(unassisted), peeks: totals.peeks ?? 0, hint_pours: totals.hint_pours ?? 0 });
    }
    if (kind === 'reset' && effective && context.mode !== 'memory') {
      await this.finishAttempt(run, revision, at, 'reset'); run.attempt++;
      totals.attempts = run.attempt;
      await this.db.runAsync("INSERT INTO metric_attempts VALUES(?,?,?,NULL,'playing',?,'{}')", `${run.id}:a${run.attempt}`, run.id, at, run.partial);
    }
    run.flags = JSON.stringify(flags); run.totals = JSON.stringify(totals);
    if (observation.completion) {
      run.result = observation.completion; run.ended_at = at;
      await this.finishAttempt(run, revision, at, observation.completion);
      await this.closeVisit(run, revision, at, 'completed');
      for (const [key, value] of Object.entries(totals)) {
        await this.aggregate(run, `completed_${key}_sum`, value);
        await this.aggregate(run, `completed_${key}_distribution`, 1, metricBucket(value, key.endsWith('_ms')));
      }
      await this.aggregate(run, `completed_${observation.completion}`, 1);
      const first = await this.db.runAsync('UPDATE metric_firsts SET completed_at=?,summary=? WHERE mode=? AND level_id=? AND rules=? AND completed_at IS NULL',
        at, JSON.stringify({ version: PRODUCT_METRICS_VERSION, totals, flags, partial: !!run.partial, observedFirst: !!run.first_exposure }), run.mode, run.level_id, run.rules);
      if (totals.credits_expected) await this.emit(revision, at, 'bh_credit_change', { ...common(run), credits_expected: totals.credits_expected, credits_awarded: totals.credits_awarded ?? 0, credits_capped: totals.credits_capped ?? 0 });
      await this.emit(revision, at, 'bh_puzzle_complete', { ...common(run), result: observation.completion, first_clear: ['mainline', 'side', 'memory'].includes(run.mode) ? first.changes : 0, assistance: assistance(flags), attempts: totals.attempts ?? 1, route_steps: context.routePosition });
      await this.emit(revision, at, 'bh_puzzle_timing', { ...common(run), foreground_ms: totals.foreground_ms ?? 0, blocked_ms: totals.blocked_ms ?? 0, available_ms: totals.available_ms ?? 0,
        observation_ms: totals.observation_ms ?? 0, peek_ms: totals.peek_ms ?? 0, hidden_ms: totals.hidden_ms ?? 0, cleanup_ms: totals.cleanup_ms ?? 0 });
      await this.emit(revision, at, 'bh_puzzle_operations', { ...common(run), pours: totals.pours ?? 0, hint_pours: totals.hint_pours ?? 0, undos: totals.undos ?? 0, resets: totals.resets ?? 0,
        peeks: totals.peeks ?? 0, melts: totals.melts ?? 0, reserves: totals.reserves ?? 0 });
      if (first.changes && ['mainline', 'side', 'memory'].includes(run.mode) && [1, 3, 10, 20, 100, 1000].includes(context.number)) await this.emit(revision, at, 'bh_milestone', { ...common(run), level_number: context.number });
    } else if (['pause', 'background', 'navigate', 'select'].includes(kind)) await this.closeVisit(run, revision, at, kind);
    await this.db.runAsync('UPDATE metric_runs SET last_at=?,ended_at=?,result=?,partial=?,attempt=?,totals=?,flags=? WHERE id=?', run.last_at, run.ended_at, run.result, run.partial, run.attempt, run.totals, run.flags, run.id);
  }
  async prune(revision: number, at: number) {
    const last = Number(this.db.getFirstSync<{ value: string }>("SELECT value FROM metadata WHERE key='metrics-last-prune'")?.value ?? 0);
    if (revision - last < 100) return;
    await this.db.runAsync("UPDATE metadata SET value=? WHERE key='metrics-last-prune'", String(revision));
    const cutoff = at - 30 * 86400000;
    for (const table of ['metric_attempts', 'metric_visits', 'metric_app_sessions']) await this.db.runAsync(`DELETE FROM ${table} WHERE ended_at IS NOT NULL AND (ended_at<? OR id IN(SELECT id FROM ${table} ORDER BY started_at DESC LIMIT -1 OFFSET 50000))`, cutoff);
    await this.db.runAsync("DELETE FROM metric_runs WHERE result<>'playing' AND (last_at<? OR id IN(SELECT id FROM metric_runs ORDER BY started_at DESC LIMIT -1 OFFSET 50000))", cutoff);
    await this.db.runAsync('DELETE FROM metric_requests WHERE result IS NOT NULL AND (requested_at<? OR id IN(SELECT id FROM metric_requests ORDER BY requested_at DESC LIMIT -1 OFFSET 50000))', cutoff);
    const expired = await this.db.runAsync('DELETE FROM metric_outbox WHERE at<? OR id IN(SELECT id FROM metric_outbox ORDER BY revision DESC,id DESC LIMIT -1 OFFSET 10000)', at - 2 * 86400000);
    if (expired.changes) await this.db.runAsync("INSERT INTO metadata VALUES('analytics-expired',?) ON CONFLICT DO UPDATE SET value=CAST(CAST(value AS INTEGER)+? AS TEXT)", String(expired.changes), expired.changes);
  }
}
