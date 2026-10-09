export const PRODUCT_METRICS_VERSION = 'product-metrics-v1';
/** Additive observation boundary. Never resets progress or reconstructs unobserved history. */
export const METRICS_SCHEMA = `
CREATE TABLE IF NOT EXISTS metric_runs(
 id TEXT PRIMARY KEY, slot TEXT NOT NULL, mode TEXT NOT NULL, level_id TEXT NOT NULL,
 catalog TEXT NOT NULL, rules TEXT NOT NULL, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
 ended_at INTEGER, result TEXT NOT NULL, partial INTEGER NOT NULL, first_exposure INTEGER NOT NULL,
 attempt INTEGER NOT NULL, totals TEXT NOT NULL CHECK(json_valid(totals)), flags TEXT NOT NULL CHECK(json_valid(flags))) STRICT;
CREATE INDEX IF NOT EXISTS metric_runs_open ON metric_runs(slot,result);
CREATE TABLE IF NOT EXISTS metric_attempts(
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER,
 result TEXT NOT NULL, partial INTEGER NOT NULL, totals TEXT NOT NULL CHECK(json_valid(totals))) STRICT;
CREATE TABLE IF NOT EXISTS metric_visits(
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
 ended_at INTEGER, partial INTEGER NOT NULL, totals TEXT NOT NULL CHECK(json_valid(totals))) STRICT;
CREATE INDEX IF NOT EXISTS metric_visits_open ON metric_visits(run_id,ended_at);
CREATE TABLE IF NOT EXISTS metric_firsts(
 mode TEXT NOT NULL, level_id TEXT NOT NULL, rules TEXT NOT NULL, catalog TEXT NOT NULL,
 entered_at INTEGER NOT NULL, completed_at INTEGER, observed_first INTEGER NOT NULL,
 summary TEXT CHECK(summary IS NULL OR json_valid(summary)), PRIMARY KEY(mode,level_id,rules)) STRICT;
CREATE TABLE IF NOT EXISTS metric_summary(
 mode TEXT NOT NULL, level_id TEXT NOT NULL, catalog TEXT NOT NULL, rules TEXT NOT NULL,
 version TEXT NOT NULL, quality TEXT NOT NULL, assistance TEXT NOT NULL, metric TEXT NOT NULL,
 bucket TEXT NOT NULL, value REAL NOT NULL,
 PRIMARY KEY(mode,level_id,catalog,rules,version,quality,assistance,metric,bucket)) STRICT;
CREATE TABLE IF NOT EXISTS metric_days(
 day TEXT NOT NULL, offset INTEGER NOT NULL, mode TEXT NOT NULL, version TEXT NOT NULL,
 metric TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY(day,offset,mode,version,metric)) STRICT;
CREATE TABLE IF NOT EXISTS metric_requests(
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL, requested_at INTEGER NOT NULL, result TEXT,
 duration_ms REAL, executed INTEGER NOT NULL DEFAULT 0, resource TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS metric_app_sessions(
 id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL, ended_at INTEGER,
 interrupted INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE IF NOT EXISTS metric_outbox(
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL, at INTEGER NOT NULL, name TEXT NOT NULL,
 params TEXT NOT NULL CHECK(json_valid(params)), epoch INTEGER NOT NULL, retries INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE INDEX IF NOT EXISTS metric_outbox_order ON metric_outbox(revision,id);
`;
