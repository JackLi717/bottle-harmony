import * as SQLite from 'expo-sqlite';
import { yieldToHost } from '../runtime/cooperativeWork';
import { createEngineSession, moveEngineSession, saveEngineSession } from '../game/engine';
import { engineFixture } from '../game/engineExamples';
import { measurement } from '../game/engineBenchmark';
import { SORTING_SCHEMA } from './sortingSchema';
import { loadSortingSession, saveSortingSession } from './sortingStorage';
import { transaction, type WriteDatabase, type SqlValue } from './sql';

let benchmarkSequence = 0;
/** Disposable acceptance database, never player.sqlite or a production session slot. */
export async function benchmarkEngineStorage(cancelled: () => boolean) {
  const name = `engine-acceptance-${Date.now()}-${++benchmarkSequence}.sqlite`;
  const db = await SQLite.openDatabaseAsync(name);
  const check = () => { if (cancelled()) throw new Error('Storage benchmark cancelled'); };
  try {
    await db.execAsync(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      DROP TABLE IF EXISTS sorting_checkpoints; DROP TABLE IF EXISTS sorting_sessions; ${SORTING_SCHEMA}`);
    const puzzle = engineFixture('storage-benchmark', [['coral'], [], ['jade', 'jade', 'jade', 'jade']], {
      goal: { type: 'collect', container: 'b1', color: 'jade', count: 4, exact: true, exclusive: true },
    });
    let session = createEngineSession(puzzle, 'device-storage');
    await transaction(db, () => saveSortingSession(db, 'benchmark', session, null));
    const samples: number[] = [];
    for (let i = 0; i < 256; i++) {
      check();
      const next = moveEngineSession(session, { type: 'transfer', source: `b${i % 2}`, target: `b${1 - i % 2}` })!.session;
      const start = performance.now();
      await transaction(db, () => saveSortingSession(db, 'benchmark', next, session));
      samples.push(performance.now() - start); session = next;
      if (i % 16 === 15) await yieldToHost();
    }
    const queries: { operation: string; milliseconds: number }[] = [];
    const timedRead = async <T>(operation: string, work: () => Promise<T>): Promise<T> => {
      const begin = performance.now();
      try { return await work(); } finally { queries.push({ operation, milliseconds: performance.now() - begin }); }
    };
    const measuredDb: WriteDatabase = {
      getAllSync: db.getAllSync.bind(db), getFirstSync: db.getFirstSync.bind(db),
      runAsync: db.runAsync.bind(db), execAsync: db.execAsync.bind(db),
      getFirstAsync: <T>(sql: string, ...params: SqlValue[]) => timedRead('first', () => db.getFirstAsync<T>(sql, ...params)),
      getAllAsync: <T>(sql: string, ...params: SqlValue[]) => timedRead('all', () => db.getAllAsync<T>(sql, ...params)),
    };
    check(); const start = performance.now(), restored = await loadSortingSession(measuredDb, 'benchmark', puzzle);
    const restoreMilliseconds = performance.now() - start;
    if (!restored || JSON.stringify(saveEngineSession(restored)) !== JSON.stringify(saveEngineSession(session))) throw new Error('Native SQLite restore mismatch');
    const integrity = await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
    const foreignKeys = await db.getAllAsync('PRAGMA foreign_key_check');
    if (integrity?.quick_check !== 'ok' || foreignKeys.length) throw new Error('Native SQLite integrity failure');
    return { status: 'measured' as const, engine: 'Expo SQLite', journal: 'WAL', synchronous: 'FULL', transactions: 256,
      writeMilliseconds: measurement(samples.slice(16)), restoreDepth: restored.history.length, restoreMilliseconds, restoreQueries: queries, integrity: 'ok' };
  } finally {
    await db.closeAsync();
    await SQLite.deleteDatabaseAsync(name);
  }
}
