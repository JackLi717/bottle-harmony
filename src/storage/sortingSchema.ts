export const SORTING_SCHEMA = `
CREATE TABLE sorting_sessions(slot TEXT PRIMARY KEY, puzzle_id TEXT NOT NULL, binding TEXT NOT NULL,
 attempt TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>=0), history_start INTEGER NOT NULL CHECK(history_start>=0),
 history_depth INTEGER NOT NULL CHECK(history_depth BETWEEN 0 AND 4096)) STRICT;
CREATE TABLE sorting_checkpoints(slot TEXT NOT NULL REFERENCES sorting_sessions(slot) ON DELETE CASCADE,
 step INTEGER NOT NULL CHECK(step>=-1), frame TEXT NOT NULL CHECK(json_valid(frame) AND length(frame)<=131072), PRIMARY KEY(slot,step)) STRICT;
`;
