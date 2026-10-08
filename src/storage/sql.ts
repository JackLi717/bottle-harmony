/** Small shared boundary: Expo SQLite on device, real node:sqlite in acceptance tests. */
export type SqlValue = string | number | null | Uint8Array;
export interface ReadDatabase {
  getAllSync<T>(sql: string, ...params: SqlValue[]): T[];
  getFirstSync<T>(sql: string, ...params: SqlValue[]): T | null;
}
export interface WriteDatabase extends ReadDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ changes: number; lastInsertRowId: number }>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
}

export async function transaction<T>(db: WriteDatabase, work: () => Promise<T>): Promise<T> {
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    const value = await work();
    await db.execAsync('COMMIT');
    return value;
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}
