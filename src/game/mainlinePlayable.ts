import { recordObject, structureKey, hasDiverseStart } from './generation.ts';
import { initialBoard, parseLevel, type LevelDefinition } from './model.ts';
import { replaySolution } from './solver.ts';
import type { Pour } from './rules.ts';
import { INTERNAL_GRADES } from './difficultyLoad.ts';
import type { DifficultyTier } from './difficulty.ts';
import { createProductionPlan, PRODUCTION_PLAN } from './productionPlan.ts';
import type { MainlineCatalog } from './mainlineCatalog.ts';

export type PlayableEntry = { readonly number: number; readonly level: LevelDefinition; readonly solution: readonly Pour[]; readonly rank: number; readonly tier: DifficultyTier; readonly score: number };
export type PlayableMainline = { readonly id: string; readonly entries: readonly PlayableEntry[] };
export function encodePlayableMainline(catalog: MainlineCatalog) {
  return JSON.stringify({ format: 'bottle-harmony-mainline-play', version: 1, plan: PRODUCTION_PLAN, id: catalog.id,
    entries: catalog.entries.map(e => ({ number: e.number, level: e.content.level, solution: e.content.solution, rank: e.rating.evidence.rank, tier: e.rating.evidence.tier, score: e.rating.score!.total })) });
}
/** Offline ratings are baked in; startup validates actual playable data and
 * complete legal routes, without importing all strategy graphs and witnesses. */
export function decodePlayableMainline(json: string): PlayableMainline {
  if (json.length > 8000000) throw new Error('Playable catalog exceeds size budget');
  const raw = recordObject(JSON.parse(json), ['format', 'version', 'plan', 'id', 'entries'], 'playable catalog');
  if (raw.format !== 'bottle-harmony-mainline-play' || raw.version !== 1 || raw.plan !== PRODUCTION_PLAN || typeof raw.id !== 'string'
    || !Array.isArray(raw.entries) || raw.entries.length !== 1000) throw new Error('Invalid playable catalog');
  const keys = new Set<string>(), ids = new Set<string>(), plan = createProductionPlan();
  let challengeScore = -1;
  const entries = raw.entries.map((input, index) => {
    const e = recordObject(input, ['number', 'level', 'solution', 'rank', 'tier', 'score'], 'playable entry');
    const level = parseLevel(e.level), slot = plan[index];
    if (e.number !== index + 1 || e.rank !== slot.rank || e.tier !== INTERNAL_GRADES[slot.rank - 1].tier
      || !Number.isInteger(e.score) || (e.score as number) < slot.scoreMinimum || (e.score as number) > slot.scoreMaximum
      || !Array.isArray(e.solution) || e.solution.length < 1 || e.solution.length > slot.maxSolutionMoves
      || level.capacity !== 4 || level.bottles.length > 12 || level.colors.length < slot.colorsMinimum || level.colors.length > slot.colorsMaximum
      || !slot.allowedEmptyBottles.includes(level.bottles.filter(b => !b.layers.length).length as 1 | 2)
      || (slot.mixing === 'diverse' && !hasDiverseStart(level))) throw new Error('Playable slot mismatch');
    const solution = e.solution.map(input => {
      const p = recordObject(input, ['source', 'target', 'color', 'amount'], 'playable pour');
      if (!Number.isInteger(p.source) || !Number.isInteger(p.target) || !Number.isInteger(p.amount) || typeof p.color !== 'string') throw new Error('Invalid playable pour');
      return Object.freeze(p as Pour);
    });
    replaySolution(initialBoard(level), solution);
    const key = structureKey(level);
    if (keys.has(key) || ids.has(level.id)) throw new Error('Duplicate playable level');
    keys.add(key); ids.add(level.id);
    if (slot.role === 'challenge') {
      if ((e.score as number) < challengeScore) throw new Error('Playable challenge scores decrease');
      challengeScore = e.score as number;
    }
    return Object.freeze({ number: index + 1, level, solution: Object.freeze(solution), rank: e.rank as number, tier: e.tier as DifficultyTier, score: e.score as number });
  });
  return Object.freeze({ id: raw.id, entries: Object.freeze(entries) });
}
