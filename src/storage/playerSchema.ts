export const PLAYER_SCHEMA_VERSION = 1;
export const METRICS_VERSION = 'gameplay-v1';
export const PLAYER_SCHEMA = `
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE progress(id INTEGER PRIMARY KEY CHECK(id=1), catalog TEXT NOT NULL, current INTEGER NOT NULL CHECK(current>0),
 completed INTEGER NOT NULL CHECK(completed>=0), side_completed INTEGER NOT NULL CHECK(side_completed>=0),
 tutorial INTEGER NOT NULL CHECK(tutorial IN(0,1)), symbols INTEGER NOT NULL CHECK(symbols IN(0,1)),
 credits INTEGER NOT NULL CHECK(credits BETWEEN 0 AND 5), free_hint_used INTEGER NOT NULL CHECK(free_hint_used IN(0,1))) STRICT;
CREATE TABLE sessions(slot TEXT PRIMARY KEY CHECK(slot IN('main','side','replay')), level_id TEXT NOT NULL, bottle_count INTEGER NOT NULL,
 history_depth INTEGER NOT NULL CHECK(history_depth BETWEEN 0 AND 4096), history_start INTEGER NOT NULL CHECK(history_start>=0), frozen_bottle INTEGER, melted INTEGER NOT NULL, melt_at INTEGER) STRICT;
CREATE TABLE session_layers(slot TEXT NOT NULL REFERENCES sessions(slot) ON DELETE CASCADE,
 step INTEGER NOT NULL CHECK(step>=-1), bottle INTEGER NOT NULL CHECK(bottle>=0), depth INTEGER NOT NULL CHECK(depth BETWEEN 0 AND 3),
 color TEXT NOT NULL, PRIMARY KEY(slot,step,bottle,depth)) STRICT;
CREATE TABLE preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE completions(mode TEXT NOT NULL, level_id TEXT NOT NULL, first_completed_at INTEGER NOT NULL, PRIMARY KEY(mode,level_id)) STRICT;
CREATE TABLE play_sessions(id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, last_at INTEGER NOT NULL, ended_at INTEGER, interrupted INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE challenges(id TEXT PRIMARY KEY, slot TEXT NOT NULL, level_id TEXT NOT NULL, mode TEXT NOT NULL,
 started_at INTEGER NOT NULL, completed_at INTEGER, status TEXT NOT NULL, assisted INTEGER NOT NULL DEFAULT 0, attempt_id TEXT NOT NULL) STRICT;
CREATE INDEX challenge_slot ON challenges(slot,status);
CREATE TABLE attempts(id TEXT PRIMARY KEY, challenge_id TEXT NOT NULL REFERENCES challenges(id), started_at INTEGER NOT NULL,
 ended_at INTEGER, result TEXT NOT NULL, partial INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE events(sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, at INTEGER NOT NULL,
 play_session_id TEXT, challenge_id TEXT, attempt_id TEXT, mode TEXT, level_id TEXT, kind TEXT NOT NULL,
 app_version TEXT NOT NULL, catalog TEXT NOT NULL, rules_version TEXT NOT NULL, policy_version TEXT NOT NULL,
 metrics_version TEXT NOT NULL, detail TEXT NOT NULL CHECK(json_valid(detail))) STRICT;
CREATE INDEX events_level ON events(mode,level_id,sequence);
CREATE INDEX events_date ON events(at);
CREATE TABLE level_stats(mode TEXT NOT NULL, level_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL,
 PRIMARY KEY(mode,level_id,metric)) STRICT;
CREATE TABLE daily_stats(day TEXT NOT NULL, timezone TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL,
 PRIMARY KEY(day,timezone,metric)) STRICT;
CREATE TABLE hint_requests(id TEXT PRIMARY KEY, challenge_id TEXT, level_id TEXT NOT NULL, requested_at INTEGER NOT NULL,
 result TEXT, duration_ms REAL, executed INTEGER NOT NULL DEFAULT 0, resource TEXT NOT NULL) STRICT;
PRAGMA user_version=1;
`;
