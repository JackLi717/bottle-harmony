import { initialBoard, LevelValidationError, parseLevel, type LevelDefinition } from './model.ts';
import { isSolved, type Pour } from './rules.ts';
import { replaySolution } from './solver.ts';

export const GENERATOR_ID = 'balanced-shuffle-v1' as const;
export type GenerationConfig = {
  readonly colors: readonly string[];
  readonly emptyBottles: 1 | 2;
  readonly minSolutionMoves: number;
  readonly maxSolutionMoves: number;
};
export type ContentMetrics = {
  readonly colorCount: number;
  readonly bottleCount: number;
  readonly mixedBottles: number;
  readonly colorRuns: number;
  readonly solutionMoves: number;
};
export type GeneratedContent = {
  readonly format: 'bottle-harmony-content';
  readonly version: 1;
  readonly origin: { readonly generator: typeof GENERATOR_ID; readonly seed: number; readonly candidateIndex: number; readonly config: GenerationConfig };
  readonly level: LevelDefinition;
  readonly structureKey: string;
  /** A verified legal completion route. Imported routes do not claim optimality. */
  readonly solution: readonly Pour[];
  readonly metrics: ContentMetrics;
};

export function recordObject(input: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new LevelValidationError([`${label} must be an object`]);
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !fields.includes(key))) throw new LevelValidationError([`Unsupported ${label} field`]);
  return value;
}
export function isSeed(seed: unknown): seed is number {
  return typeof seed === 'number' && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff;
}

export function parseGenerationConfig(input: unknown): GenerationConfig {
  const value = recordObject(input, ['colors', 'emptyBottles', 'minSolutionMoves', 'maxSolutionMoves'], 'generation config');
  const colors = value.colors;
  if (!Array.isArray(colors) || colors.length < 2 || colors.length > 5) throw new LevelValidationError(['Generator requires 2 to 5 colors']);
  // Use the same ID validation and color-count rules as actual levels.
  parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort', id: 'config-check', capacity: 4,
    colors, bottles: colors.map((color, index) => ({ id: `b-${index}`, layers: Array(4).fill(color) })) });
  if (value.emptyBottles !== 1 && value.emptyBottles !== 2) throw new LevelValidationError(['emptyBottles must be 1 or 2']);
  const minimum = value.minSolutionMoves, maximum = value.maxSolutionMoves;
  if (typeof minimum !== 'number' || typeof maximum !== 'number' || !Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 1 || maximum < minimum || maximum > 256) {
    throw new LevelValidationError(['Solution move range must be integers with 1 <= minimum <= maximum <= 256']);
  }
  return Object.freeze({ colors: Object.freeze([...colors] as string[]), emptyBottles: value.emptyBottles, minSolutionMoves: minimum, maxSolutionMoves: maximum });
}

/** Directly address a candidate; retries never depend on time, global random state or prior calls. */
export function makeCandidate(seed: number, candidateIndex: number, config: GenerationConfig): LevelDefinition {
  if (!isSeed(seed) || !Number.isInteger(candidateIndex) || candidateIndex < 0 || candidateIndex >= 1000) throw new LevelValidationError(['Invalid seed or candidate index']);
  const settings = parseGenerationConfig(config);
  let state = (seed ^ Math.imul(candidateIndex + 1, 0x9e3779b9)) >>> 0;
  const layers = settings.colors.flatMap(color => Array<string>(4).fill(color));
  // Explicit 32-bit LCG and Fisher–Yates: no Math.random or platform-dependent hash.
  for (let i = layers.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((state / 0x100000000) * (i + 1));
    [layers[i], layers[j]] = [layers[j], layers[i]];
  }
  const bottles = settings.colors.map((_, i) => ({ id: `bottle-${i + 1}`, layers: layers.slice(i * 4, i * 4 + 4) }));
  for (let i = 0; i < settings.emptyBottles; i++) bottles.push({ id: `spare-${i + 1}`, layers: [] });
  return parseLevel({ format: 'bottle-harmony', version: 1, rules: 'water-sort',
    id: `g-v1-${seed.toString(16).padStart(8, '0')}-${candidateIndex}-${settings.colors.length}c-${settings.emptyBottles}e`, capacity: 4, colors: settings.colors, bottles });
}

/** Exact equivalence under bottle permutation and color renaming, bounded to at most 5! mappings. */
export function structureKey(definition: LevelDefinition): string {
  const level = parseLevel(definition);
  if (level.capacity !== 4 || level.colors.length < 2 || level.colors.length > 5) throw new LevelValidationError(['Structure key supports ordinary four-layer, 2 to 5 color levels']);
  const bottles = level.bottles.map(bottle => bottle.layers.map(color => level.colors.indexOf(color)));
  let best: string | null = null;
  const mappings = (prefix: number[], remaining: number[]) => {
    if (remaining.length) {
      for (const next of remaining) mappings([...prefix, next], remaining.filter(color => color !== next));
      return;
    }
    const key = bottles.map(bottle => bottle.map(color => String.fromCharCode(65 + prefix[color])).join('')).sort().join('/');
    if (best === null || key < best) best = key;
  };
  mappings([], level.colors.map((_, i) => i));
  return `water-sort:4:${level.colors.length}:${level.bottles.length}:${best}`;
}

export function contentMetrics(level: LevelDefinition, solutionMoves: number): ContentMetrics {
  let mixedBottles = 0, colorRuns = 0;
  for (const { layers } of level.bottles) {
    if (new Set(layers).size > 1) mixedBottles++;
    for (let i = 0; i < layers.length; i++) if (i === 0 || layers[i] !== layers[i - 1]) colorRuns++;
  }
  return Object.freeze({ colorCount: level.colors.length, bottleCount: level.bottles.length, mixedBottles, colorRuns, solutionMoves });
}

/** Verify provenance, actual layout, legal full replay, filters and derived metadata on every import. */
export function parseGeneratedContent(input: unknown): GeneratedContent {
  const value = recordObject(input, ['format', 'version', 'origin', 'level', 'structureKey', 'solution', 'metrics'], 'content');
  if (value.format !== 'bottle-harmony-content' || value.version !== 1) throw new LevelValidationError(['Unsupported content format or version']);
  const origin = recordObject(value.origin, ['generator', 'seed', 'candidateIndex', 'config'], 'origin');
  if (origin.generator !== GENERATOR_ID || !isSeed(origin.seed) || typeof origin.candidateIndex !== 'number' || !Number.isInteger(origin.candidateIndex) || origin.candidateIndex < 0 || origin.candidateIndex >= 1000) throw new LevelValidationError(['Unsupported or invalid generation origin']);
  const config = parseGenerationConfig(origin.config);
  const level = parseLevel(value.level);
  const expected = makeCandidate(origin.seed, origin.candidateIndex, config);
  if (JSON.stringify(level) !== JSON.stringify(expected)) throw new LevelValidationError(['Actual layout does not match generation origin']);
  if (!Array.isArray(value.solution) || value.solution.length < config.minSolutionMoves || value.solution.length > config.maxSolutionMoves) throw new LevelValidationError(['Solution outside configured move range']);
  const solution = value.solution.map(inputPour => {
    const pour = recordObject(inputPour, ['source', 'target', 'color', 'amount'], 'pour');
    if (typeof pour.source !== 'number' || typeof pour.target !== 'number' || typeof pour.color !== 'string' || typeof pour.amount !== 'number') throw new LevelValidationError(['Invalid pour fields']);
    return Object.freeze({ source: pour.source, target: pour.target, color: pour.color, amount: pour.amount });
  });
  try { replaySolution(initialBoard(level), solution, level.capacity); } catch { throw new LevelValidationError(['Solution failed full legal replay']); }
  const metrics = contentMetrics(level, solution.length);
  if (isSolved(initialBoard(level), level.capacity) || metrics.mixedBottles < 2) throw new LevelValidationError(['Content is already solved or has fewer than two mixed bottles']);
  const providedMetrics = recordObject(value.metrics, ['colorCount', 'bottleCount', 'mixedBottles', 'colorRuns', 'solutionMoves'], 'metrics');
  for (const key of Object.keys(metrics) as (keyof ContentMetrics)[]) if (providedMetrics[key] !== metrics[key]) throw new LevelValidationError([`Incorrect metric ${key}`]);
  const key = structureKey(level);
  if (value.structureKey !== key) throw new LevelValidationError(['Incorrect structure key']);
  return Object.freeze({ format: 'bottle-harmony-content', version: 1,
    origin: Object.freeze({ generator: GENERATOR_ID, seed: origin.seed, candidateIndex: origin.candidateIndex, config }),
    level, structureKey: key, solution: Object.freeze(solution), metrics });
}
