import type { PlayableMainline } from './mainlinePlayable.ts';
import { createSession, moveSession, undoSession, resetSession, type GameSession } from './session.ts';

export type MainlineState = {
  readonly main: GameSession;
  readonly replay: GameSession | null;
  readonly current: number;
  readonly completedThrough: number;
  readonly tutorialDone: boolean;
  readonly symbols: boolean;
};
export const visibleSession = (state: MainlineState) => state.replay ?? state.main;
export function createMainline(catalog: PlayableMainline): MainlineState {
  return Object.freeze({ main: createSession(catalog.entries[0].level), replay: null, current: 1, completedThrough: 0, tutorialDone: false, symbols: false });
}
export function moveMainline(state: MainlineState, source: number, target: number) {
  const result = moveSession(visibleSession(state), source, target);
  if (!result) return null;
  const next = state.replay ? { ...state, replay: result.session } : { ...state, main: result.session,
    completedThrough: result.session.status === 'solved' ? Math.max(state.completedThrough, state.current) : state.completedThrough };
  return { state: Object.freeze(next), event: result.event };
}
export function editMainline(state: MainlineState, action: 'undo' | 'reset'): MainlineState {
  const session = (action === 'undo' ? undoSession : resetSession)(visibleSession(state));
  return Object.freeze(state.replay ? { ...state, replay: session } : { ...state, main: session });
}
export function nextMainline(state: MainlineState, catalog: PlayableMainline): MainlineState {
  if (state.replay) return Object.freeze({ ...state, replay: null });
  if (state.main.status !== 'solved') throw new Error('Complete the current level first');
  if (state.current === catalog.entries.length) return state;
  return Object.freeze({ ...state, current: state.current + 1, main: createSession(catalog.entries[state.current].level) });
}
export function selectMainline(state: MainlineState, catalog: PlayableMainline, number: number): MainlineState {
  if (!Number.isInteger(number) || number < 1 || number > catalog.entries.length) throw new Error('Invalid level number');
  if (number === state.current) return Object.freeze({ ...state, replay: null });
  if (number > state.completedThrough) throw new Error('Level is locked');
  return Object.freeze({ ...state, replay: createSession(catalog.entries[number - 1].level) });
}
