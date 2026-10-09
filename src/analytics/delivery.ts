import type { PlayerRepository } from '../storage/playerRepository.ts';
import type { AnalyticsGateway, AnalyticsEventName, AnalyticsParameters } from './contracts.ts';

type PendingEvent = { id: string; at: number; name: AnalyticsEventName; params: string; epoch: number; retries: number };
/** SQLite owns the collection preference and outbox. SDK calls stay outside player transactions. */
export class AnalyticsDelivery {
  readonly player: PlayerRepository;
  readonly gateway: AnalyticsGateway;
  readonly environment: string;
  private enabled = false;
  private generation = 0;
  private running: Promise<void> | null = null;
  private configuring: Promise<boolean> | null = null;
  constructor(player: PlayerRepository, gateway: AnalyticsGateway, environment: string) {
    this.player = player; this.gateway = gateway; this.environment = environment;
  }
  async initialize() {
    await this.player.enqueueWrite(async () => {
      await this.player.db.runAsync("INSERT INTO metadata VALUES('analytics-environment',?) ON CONFLICT DO UPDATE SET value=excluded.value", this.environment);
      // A binary pointed at a different property must not replay another environment's queue.
      await this.player.db.runAsync("DELETE FROM metric_outbox WHERE json_extract(params,'$.build_environment')<>?", this.environment);
    });
    const requested = this.player.preference('analytics') === 'true';
    const available = await this.gateway.configure(requested);
    this.enabled = requested && available;
    this.player.onCommitted = () => { if (!this.running && !this.configuring && this.enabled) void this.flush(); };
    void this.flush();
  }
  setEnabled(enabled: boolean): Promise<boolean> {
    if (this.configuring) return this.configuring;
    // Stop dispatch immediately, including while SQLite or the native SDK is busy.
    this.enabled = false; ++this.generation;
    this.configuring = (async () => {
      try {
        await this.gateway.configure(false);
        const saved = await this.player.setPreference('analytics', String(enabled));
        if (!saved) return false;
        if (!enabled) await this.gateway.reset();
        const available = await this.gateway.configure(enabled);
        this.enabled = enabled && available;
        return true;
      } catch { this.enabled = false; return false; }
      finally { this.configuring = null; }
    })();
    void this.configuring.then(() => { if (this.enabled) void this.flush(); });
    return this.configuring;
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    const generation = this.generation;
    this.running = (async () => {
      if (!this.enabled || this.configuring || this.player.preference('analytics') !== 'true') return;
      // First ensure a previously failed save is committed. Never bypass the ordered save queue.
      if (!await this.player.flush()) return;
      const db = this.player.db;
      const rows = db.getAllSync<PendingEvent>('SELECT * FROM metric_outbox ORDER BY revision,id LIMIT 100');
      for (const row of rows) {
        if (!this.enabled || generation !== this.generation || this.player.preference('analytics') !== 'true') break;
        const epoch = Number(db.getFirstSync<{value:string}>("SELECT value FROM metadata WHERE key='analytics-epoch'")!.value);
        const stale = row.epoch !== epoch || row.at < Date.now() - 2 * 86400000 || row.retries >= 5;
        let accepted = stale;
        if (!stale) {
          try { await this.gateway.logEvent(row.name, JSON.parse(row.params) as AnalyticsParameters); accepted = true; }
          catch { /* Preserve this row for a bounded retry on the next foreground/heartbeat. */ }
        }
        if (!await this.player.enqueueWrite(async () => {
          if (accepted) await db.runAsync('DELETE FROM metric_outbox WHERE id=? AND epoch=?', row.id, row.epoch);
          else await db.runAsync('UPDATE metric_outbox SET retries=retries+1 WHERE id=? AND epoch=?', row.id, row.epoch);
          if (stale) await db.runAsync("INSERT INTO metadata VALUES('analytics-dropped','1') ON CONFLICT DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)");
        })) break;
        if (!accepted) break;
      }
    })().catch(() => { /* Analytics failure must not escape into gameplay. */ }).finally(() => { this.running = null; });
    return this.running;
  }
}
