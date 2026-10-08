import { recordObject, structureKey, hasDiverseStart } from './generation.ts';
import { initialBoard, parseLevel, type LevelDefinition } from './model.ts';
import { replaySolution } from './solver.ts';
import type { Pour } from './rules.ts';
import type { DifficultyTier } from './difficulty.ts';
import { createProductionPlan, PRODUCTION_PLAN, validateRamp } from './productionPlan.ts';
import type { MainlineCatalog } from './mainlineCatalog.ts';
import { hasCleanStart, hasVariedStart } from './startQuality.ts';
import { tierForHumanScore } from './humanDifficulty.ts';

export type PlayableEntry = { readonly number: number; readonly levelId?: string; readonly colorCount?: number; readonly bottleCount?: number; readonly level: LevelDefinition; readonly solution: readonly Pour[]; readonly rank: number; readonly tier: DifficultyTier; readonly score: number };
export type PlayableMainline = { readonly id: string; readonly entries: readonly PlayableEntry[] };
export function encodePlayableMainline(catalog: MainlineCatalog) {
  return JSON.stringify({ format: 'bottle-harmony-mainline-play', version: 1, plan: PRODUCTION_PLAN, id: catalog.id,
    entries: catalog.entries.map(e => ({ number: e.number, level: e.content.level, solution: e.content.solution, rank: e.rating.evidence.rank,
      tier: tierForHumanScore(e.human.score!.total), score: e.human.score!.total })) });
}
/** Offline ratings are baked in; startup validates actual playable data and
 * complete legal routes, without importing all strategy graphs and witnesses. */
export function decodePlayableMainline(json: string): PlayableMainline {
  if (json.length > 8000000) throw new Error('Playable catalog exceeds size budget');
  const raw = recordObject(JSON.parse(json), ['format', 'version', 'plan', 'id', 'entries'], 'playable catalog');
  if (raw.format !== 'bottle-harmony-mainline-play' || raw.version !== 1 || raw.plan !== PRODUCTION_PLAN || typeof raw.id !== 'string'
    || !Array.isArray(raw.entries) || raw.entries.length !== 1000) throw new Error('Invalid playable catalog');
  const keys = new Set<string>(), ids = new Set<string>(), plan = createProductionPlan();
  const entries = raw.entries.map((input, index) => {
    const e = recordObject(input, ['number', 'level', 'solution', 'rank', 'tier', 'score'], 'playable entry');
    const level = parseLevel(e.level), slot = plan[index];
    if (e.number !== index + 1 || !Number.isInteger(e.rank) || (e.rank as number) < 1 || (e.rank as number) > 8
      || !Number.isInteger(e.score) || (e.score as number) < 0 || (e.score as number) > 100
      || e.tier !== tierForHumanScore(e.score as number)
      || !Array.isArray(e.solution) || e.solution.length < 1 || e.solution.length > slot.maxSolutionMoves
      || level.capacity !== 4 || level.bottles.length > 12 || level.colors.length < (slot.number <= 3 ? 2 : 4)
      || level.colors.length > (slot.number <= 3 ? 3 : 11)
      || (e.tier === 'D3' || e.tier === 'D4') && !hasDiverseStart(level) || !hasCleanStart(level)
      || !hasVariedStart(level)) throw new Error('Playable slot mismatch');
    const solution = e.solution.map(input => {
      const p = recordObject(input, ['source', 'target', 'color', 'amount'], 'playable pour');
      if (!Number.isInteger(p.source) || !Number.isInteger(p.target) || !Number.isInteger(p.amount) || typeof p.color !== 'string') throw new Error('Invalid playable pour');
      return Object.freeze(p as Pour);
    });
    replaySolution(initialBoard(level), solution);
    const key = structureKey(level);
    if (keys.has(key) || ids.has(level.id)) throw new Error('Duplicate playable level');
    keys.add(key); ids.add(level.id);
    return Object.freeze({ number: index + 1, level, solution: Object.freeze(solution), rank: e.rank as number, tier: e.tier as DifficultyTier, score: e.score as number });
  });
  validateRamp(entries.map(entry => ({ number: entry.number, score: entry.score })));
  return Object.freeze({ id: raw.id, entries: Object.freeze(entries) });
}
