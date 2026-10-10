import * as SQLite from 'expo-sqlite';
import { createEngineSession, moveEngineSession, saveEngineSession } from '../game/engine';
import { engineFixture } from '../game/engineExamples';
import { measurement } from '../game/engineBenchmark';
import { SORTING_SCHEMA } from './sortingSchema';
import { loadSortingSession, saveSortingSession } from './sortingStorage';
import { transaction } from './sql';

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
      if (i % 16 === 15) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    check(); const start = performance.now(), restored = await loadSortingSession(db, 'benchmark', puzzle);
    const restoreMilliseconds = performance.now() - start;
    if (!restored || JSON.stringify(saveEngineSession(restored)) !== JSON.stringify(saveEngineSession(session))) throw new Error('Native SQLite restore mismatch');
    const integrity = await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check');
    const foreignKeys = await db.getAllAsync('PRAGMA foreign_key_check');
    if (integrity?.quick_check !== 'ok' || foreignKeys.length) throw new Error('Native SQLite integrity failure');
    return { status: 'measured' as const, engine: 'Expo SQLite', journal: 'WAL', synchronous: 'FULL', transactions: 256,
      writeMilliseconds: measurement(samples.slice(16)), restoreDepth: restored.history.length, restoreMilliseconds, integrity: 'ok' };
  } finally {
    await db.closeAsync();
    await SQLite.deleteDatabaseAsync(name);
  }
}
