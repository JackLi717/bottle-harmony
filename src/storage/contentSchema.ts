export const CONTENT_SCHEMA_VERSION = 1;
export const CONTENT_SCHEMA = `
PRAGMA foreign_keys=ON;
CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE levels(
 id TEXT PRIMARY KEY, mode TEXT NOT NULL, number INTEGER NOT NULL CHECK(number>0),
 capacity INTEGER NOT NULL CHECK(capacity=4), color_count INTEGER NOT NULL, bottle_count INTEGER NOT NULL,
 rank INTEGER, tier TEXT, score INTEGER, frozen_bottle INTEGER, after_mainline INTEGER,
 reserve INTEGER NOT NULL DEFAULT 0 CHECK(reserve IN(0,1)), UNIQUE(mode,number)
) STRICT;
CREATE TABLE colors(level_id TEXT NOT NULL REFERENCES levels(id), position INTEGER NOT NULL, color TEXT NOT NULL,
 PRIMARY KEY(level_id,position), UNIQUE(level_id,color)) STRICT;
CREATE TABLE bottles(level_id TEXT NOT NULL REFERENCES levels(id), position INTEGER NOT NULL, id TEXT NOT NULL,
 PRIMARY KEY(level_id,position), UNIQUE(level_id,id)) STRICT;
CREATE TABLE layers(level_id TEXT NOT NULL, bottle INTEGER NOT NULL, depth INTEGER NOT NULL CHECK(depth BETWEEN 0 AND 3), color TEXT NOT NULL,
 PRIMARY KEY(level_id,bottle,depth), FOREIGN KEY(level_id,bottle) REFERENCES bottles(level_id,position),
 FOREIGN KEY(level_id,color) REFERENCES colors(level_id,color)) STRICT;
CREATE TABLE solution_steps(level_id TEXT NOT NULL REFERENCES levels(id), variant TEXT NOT NULL, step INTEGER NOT NULL,
 source INTEGER NOT NULL, target INTEGER NOT NULL, color TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 4),
 PRIMARY KEY(level_id,variant,step), FOREIGN KEY(level_id,source) REFERENCES bottles(level_id,position),
 FOREIGN KEY(level_id,target) REFERENCES bottles(level_id,position)) STRICT;
CREATE TABLE evidence(level_id TEXT PRIMARY KEY REFERENCES levels(id), record TEXT NOT NULL CHECK(json_valid(record))) STRICT;
CREATE TABLE tags(level_id TEXT NOT NULL REFERENCES levels(id), tag TEXT NOT NULL, PRIMARY KEY(level_id,tag)) STRICT;
CREATE TABLE internal_assets(key TEXT PRIMARY KEY, record TEXT NOT NULL CHECK(json_valid(record))) STRICT;
CREATE TABLE memory_masks(level_id TEXT NOT NULL, unit INTEGER NOT NULL CHECK(unit>=0), PRIMARY KEY(level_id,unit), FOREIGN KEY(level_id) REFERENCES levels(id)) STRICT;
PRAGMA user_version=1;
`;
