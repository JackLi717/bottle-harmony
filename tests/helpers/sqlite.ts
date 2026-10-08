import { DatabaseSync } from 'node:sqlite';
import type { SqlValue, WriteDatabase } from '../../src/storage/sql.ts';
export class TestDatabase implements WriteDatabase {
  readonly native: DatabaseSync;
  fail: ((sql: string) => boolean) | null = null;
  statements: string[] = [];
  constructor(path = ':memory:') { this.native = new DatabaseSync(path); }
  getAllSync<T>(sql: string, ...params: SqlValue[]): T[] { return this.native.prepare(sql).all(...params) as T[]; }
  getFirstSync<T>(sql: string, ...params: SqlValue[]): T | null { return this.native.prepare(sql).get(...params) as T ?? null; }
  private check(sql: string) { this.statements.push(sql); if (this.fail?.(sql)) throw new Error('Injected disk write failure'); }
  async execAsync(sql: string) { this.check(sql); this.native.exec(sql); }
  async runAsync(sql: string, ...params: SqlValue[]) { this.check(sql); const result = this.native.prepare(sql).run(...params); return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) }; }
  async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return this.getAllSync<T>(sql, ...params); }
  async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return this.getFirstSync<T>(sql, ...params); }
}
