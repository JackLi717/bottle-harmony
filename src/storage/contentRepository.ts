import { parseLevel, type LevelDefinition } from '../game/model.ts';
import { replaySolution } from '../game/solver.ts';
import { initialBoard } from '../game/model.ts';
import type { Pour } from '../game/rules.ts';
import type { PlayableEntry, PlayableMainline } from '../game/mainlinePlayable.ts';
import type { SolidSideCatalog, SolidSideEntry } from '../game/solidSide.ts';
import type { ReadDatabase, WriteDatabase } from './sql.ts';
import { CONTENT_SCHEMA_VERSION } from './contentSchema.ts';
import { MEMORY_CATALOG, MEMORY_COUNT } from '../game/memoryCatalog.ts';
import { validateMemoryPuzzle, type MemoryPuzzle } from '../game/memory.ts';

type LevelRow = { id: string; mode: string; number: number; capacity: number; color_count: number; bottle_count: number;
  rank: number; tier: PlayableEntry['tier']; score: number; frozen_bottle: number; after_mainline: number; reserve: number };

/** Metadata is small. Layouts, routes and full evidence are loaded only on access. */
export class ContentRepository {
  readonly mainline: PlayableMainline;
  readonly sides: SolidSideCatalog;
  readonly memory: readonly MemoryPuzzle[];
  private cache = new Map<string, LevelDefinition>();
  readonly db: ReadDatabase;
  static async open(db: WriteDatabase) {
    const rows = await db.getAllAsync<LevelRow>('SELECT * FROM levels ORDER BY mode,number');
    const metadata = new Map((await db.getAllAsync<{ key: string; value: string }>('SELECT * FROM metadata')).map(row => [row.key, row.value]));
    return new ContentRepository(db, rows, metadata);
  }
  constructor(db: ReadDatabase, prefetchedRows?: LevelRow[], metadata?: Map<string, string>) {
    this.db = db;
    if (db.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version !== CONTENT_SCHEMA_VERSION) throw new Error('Unsupported content schema');
    const value = (key: string) => {
      if (metadata) { const value = metadata.get(key); if (value === undefined) throw new Error(`Missing content metadata: ${key}`); return value; }
      const row = db.getFirstSync<{ value: string }>('SELECT value FROM metadata WHERE key=?', key);
      if (!row) throw new Error(`Missing content metadata: ${key}`);
      return row.value;
    };
    const rows = prefetchedRows ?? db.getAllSync<LevelRow>('SELECT * FROM levels ORDER BY mode,number');
    const main = rows.filter(row => row.mode === 'mainline'), side = rows.filter(row => row.mode === 'side');
    if (main.length !== Number(value('mainlineCount')) || side.length !== Number(value('sideCount'))
      || main.some((row, i) => row.number !== i + 1) || side.some((row, i) => row.number !== i + 1)) throw new Error('Content manifest mismatch');
    this.mainline = Object.freeze({ id: value('catalog'), entries: Object.freeze(main.map(row => Object.freeze({
      number: row.number, levelId: row.id, colorCount: row.color_count, bottleCount: row.bottle_count,
      rank: row.rank, tier: row.tier, score: row.score,
      get level() { return repository.level(row.id); },
      get solution() { return repository.route(row.id, 'main'); },
    }))) });
    const repository = this;
    const memory = rows.filter(row => row.mode === 'memory');
    if (memory.length !== Number(value('memoryCount')) || value('memoryCatalog') !== MEMORY_CATALOG || memory.length !== MEMORY_COUNT || memory.some((row, i) => row.number !== i + 1)) throw new Error('Memory manifest mismatch');
    this.memory = Object.freeze(memory.map(row => Object.freeze({
      number: row.number,
      get level() { return repository.level(row.id); },
      get masks() { return Object.freeze(db.getAllSync<{ unit: number }>('SELECT unit FROM memory_masks WHERE level_id=? ORDER BY unit', row.id).map(r => r.unit)); },
      get skill() { return repository.evidence<{ skill: string }>(row.id).skill; },
      get solution() { return repository.route(row.id, 'main'); },
    })));
    this.sides = Object.freeze({ id: value('sideCatalog'), entries: Object.freeze(side.map(row => Object.freeze({
      number: row.number, levelId: row.id, afterMainline: row.after_mainline, frozenBottle: row.frozen_bottle,
      get level() { return repository.level(row.id); },
      get frozenRoute() { return repository.route(row.id, 'frozen'); },
      get meltedRoute() { return repository.route(row.id, 'melted'); },
      get difficulty() { return repository.evidence<{ difficulty: SolidSideEntry['difficulty'] }>(row.id).difficulty; },
      get structureKey() { return repository.evidence<{ structureKey: string }>(row.id).structureKey; },
    }))) });
  }
  memoryPuzzleById(id: string): MemoryPuzzle {
    const row = this.db.getFirstSync<{ number: number }>("SELECT number FROM levels WHERE mode='memory' AND id=?", id);
    if (!row) throw new Error('Missing memory puzzle ID');
    return this.memoryPuzzle(row.number);
  }
  memoryPuzzle(number: number): MemoryPuzzle {
    const puzzle = this.memory[number - 1];
    if (!puzzle || puzzle.number !== number) throw new Error('Missing memory puzzle');
    validateMemoryPuzzle(puzzle);
    return puzzle;
  }
  level(id: string): LevelDefinition {
    const cached = this.cache.get(id);
    if (cached) { this.cache.delete(id); this.cache.set(id, cached); return cached; }
    const row = this.db.getFirstSync<LevelRow>('SELECT * FROM levels WHERE id=?', id);
    if (!row) throw new Error('Missing level');
    const bottles = this.db.getAllSync<{ position: number; id: string }>('SELECT position,id FROM bottles WHERE level_id=? ORDER BY position', id);
    const layers = this.db.getAllSync<{ bottle: number; depth: number; color: string }>('SELECT bottle,depth,color FROM layers WHERE level_id=? ORDER BY bottle,depth', id);
    const colors = this.db.getAllSync<{ color: string }>('SELECT color FROM colors WHERE level_id=? ORDER BY position', id).map(item => item.color);
    if (bottles.length !== row.bottle_count || colors.length !== row.color_count || bottles.some((b, i) => b.position !== i)) throw new Error('Invalid content shape');
    const level = parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id, capacity: row.capacity, colors,
      bottles: bottles.map(b => {
        const fill = layers.filter(layer => layer.bottle === b.position);
        if (fill.some((layer, i) => layer.depth !== i)) throw new Error('Missing content layer');
        return { id: b.id, layers: fill.map(layer => layer.color) };
      }) });
    this.cache.set(id, level);
    if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    return level;
  }
  route(id: string, variant: string): readonly Pour[] {
    const rows = this.db.getAllSync<Pour & { step: number }>('SELECT step,source,target,color,amount FROM solution_steps WHERE level_id=? AND variant=? ORDER BY step', id, variant);
    if (!rows.length || rows.some((row, i) => row.step !== i)) throw new Error('Invalid content route');
    const route = Object.freeze(rows.map(({ source, target, color, amount }) => Object.freeze({ source, target, color, amount })));
    if (variant === 'main') replaySolution(initialBoard(this.level(id)), route);
    return route;
  }
  evidence<T>(id: string): T {
    const row = this.db.getFirstSync<{ record: string }>('SELECT record FROM evidence WHERE level_id=?', id);
    if (!row) throw new Error('Missing content evidence');
    return JSON.parse(row.record) as T;
  }
  internal<T>(key: string): T {
    const row = this.db.getFirstSync<{ record: string }>('SELECT record FROM internal_assets WHERE key=?', key);
    if (!row) throw new Error('Missing internal content');
    return JSON.parse(row.record) as T;
  }
}
