import { type PlayCatalog } from './catalog.ts';
import type { DifficultyTier } from './difficulty.ts';
import type { LevelDefinition } from './model.ts';
import { createSession, moveSession, resetSession, undoSession, type GameSession } from './session.ts';

export type PlayMode = 'recommended' | DifficultyTier;
export type PlayState = {
  readonly session: GameSession;
  readonly mode: PlayMode;
  readonly sequence: number;
  readonly selections: number;
  readonly seenIds: readonly string[];
  readonly completedIds: readonly string[];
  readonly tutorialDone: boolean;
  readonly repeated: boolean;
};
// A play sequence, not calendar gating: warm up, occasionally think harder, relax again.
export const RECOMMENDED_TIERS: readonly DifficultyTier[] = ['D1', 'D2', 'D1', 'D2', 'D3', 'D1', 'D2', 'D3', 'D2', 'D4', 'D1', 'D2'];
export function nextTier(state: PlayState): DifficultyTier {
  return state.mode === 'recommended' ? RECOMMENDED_TIERS[state.sequence % RECOMMENDED_TIERS.length] : state.mode;
}
export function freezePlay(state: PlayState): PlayState {
  return Object.freeze({ ...state, seenIds: Object.freeze([...state.seenIds]), completedIds: Object.freeze([...state.completedIds]) });
}
export function createPlay(level: LevelDefinition): PlayState {
  return freezePlay({ session: createSession(level), mode: 'recommended', sequence: 0, selections: 0, seenIds: [], completedIds: [], tutorialDone: false, repeated: false });
}
export function movePlay(state: PlayState, source: number, target: number, catalog: PlayCatalog) {
  const accepted = moveSession(state.session, source, target);
  if (!accepted) return null;
  const id = state.session.level.id;
  const credited = accepted.session.status === 'solved' && catalog.entries.some(entry => entry.content.level.id === id) && !state.completedIds.includes(id);
  return { state: freezePlay({ ...state, session: accepted.session, completedIds: credited ? [...state.completedIds, id] : state.completedIds }), event: accepted.event };
}
export function undoPlay(state: PlayState): PlayState { return freezePlay({ ...state, session: undoSession(state.session) }); }
export function resetPlay(state: PlayState): PlayState { return freezePlay({ ...state, session: resetSession(state.session) }); }
export function choosePlay(state: PlayState, level: LevelDefinition): PlayState {
  return freezePlay({ ...state, session: createSession(level), tutorialDone: true, repeated: false });
}
/** Switching modes explicitly starts a new board. Skips keep the current pacing
 * position; only completing a catalog level advances recommended pacing. */
export function advancePlay(state: PlayState, catalog: PlayCatalog, reason: 'completed' | 'skip', mode = state.mode): PlayState {
  if (reason === 'completed' && state.session.status !== 'solved') throw new Error('Cannot advance an unfinished level as completed');
  const isCatalog = catalog.entries.some(entry => entry.content.level.id === state.session.level.id);
  const sequence = mode !== state.mode ? 0 : (state.sequence + (reason === 'completed' && isCatalog ? 1 : 0)) % RECOMMENDED_TIERS.length;
  const tier = nextTier({ ...state, sequence, mode });
  const entries = catalog.entries.filter(entry => entry.difficulty.tier === tier);
  if (!entries.length) throw new Error(`Missing playable tier ${tier}`);
  let seenIds = [...state.seenIds];
  let available = entries.filter(entry => !seenIds.includes(entry.content.level.id));
  const repeated = !available.length;
  if (repeated) {
    const tierIds = new Set(entries.map(entry => entry.content.level.id));
    seenIds = seenIds.filter(id => !tierIds.has(id));
    available = entries;
  }
  // Stable shuffle across the remaining pool; reproducible after restoring progress.
  const index = ((Math.imul(state.selections + 1, 1664525) + 1013904223) >>> 0) % available.length;
  const level = available[index].content.level;
  return freezePlay({ ...state, session: createSession(level), mode, sequence, selections: (state.selections + 1) % 1000000,
    seenIds: [...seenIds, level.id], tutorialDone: true, repeated });
}
