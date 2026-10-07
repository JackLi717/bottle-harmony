import type { PlayableMainline } from './mainlinePlayable.ts';
import { createSession, moveSession, undoSession, resetSession, type GameSession } from './session.ts';

export type MainlineState = {
  readonly main: GameSession;
  readonly replay: GameSession | null;
  readonly current: number;
  readonly completedThrough: number;
  readonly tutorialDone: boolean;
  readonly symbols: boolean;
  readonly hintCredits: number;
  readonly freeHintUsed: boolean;
};
export const MAX_HINT_CREDITS = 5;
export const visibleSession = (state: MainlineState) => state.replay ?? state.main;
export function createMainline(catalog: PlayableMainline): MainlineState {
  return Object.freeze({ main: createSession(catalog.entries[0].level), replay: null, current: 1, completedThrough: 0, tutorialDone: false, symbols: false, hintCredits: 0, freeHintUsed: false });
}
export function moveMainline(state: MainlineState, source: number, target: number) {
  const result = moveSession(visibleSession(state), source, target);
  if (!result) return null;
  const firstClear = !state.replay && result.session.status === 'solved' && state.completedThrough < state.current;
  const reward = firstClear ? state.current % 10 === 0 ? 2 : 1 : 0;
  const hintCredits = Math.min(MAX_HINT_CREDITS, state.hintCredits + reward);
  const next = state.replay ? { ...state, replay: result.session } : { ...state, main: result.session,
    completedThrough: firstClear ? state.current : state.completedThrough, hintCredits };
  return { state: Object.freeze(next), event: result.event, awardedTickets: hintCredits - state.hintCredits };
}
export function hintAvailability(state: MainlineState): 'free' | 'ticket' | 'none' | 'replay' {
  if (state.replay) return 'replay';
  if (!state.freeHintUsed) return 'free';
  return state.hintCredits > 0 ? 'ticket' : 'none';
}
/** A hint is charged only if its legal pour is accepted. It stays spent after undo/reset. */
export function hintMainline(state: MainlineState, source: number, target: number) {
  const availability = hintAvailability(state);
  if (availability === 'none') return null;
  const charged = availability === 'replay' ? state : Object.freeze({ ...state,
    freeHintUsed: true, hintCredits: state.hintCredits - (availability === 'ticket' ? 1 : 0) });
  return moveMainline(charged, source, target);
}
export function editMainline(state: MainlineState, action: 'undo' | 'reset'): MainlineState {
  const session = (action === 'undo' ? undoSession : resetSession)(visibleSession(state));
  return Object.freeze(state.replay ? { ...state, replay: session } : { ...state, main: session });
}
export function nextMainline(state: MainlineState, catalog: PlayableMainline): MainlineState {
  if (state.replay) return Object.freeze({ ...state, replay: null });
  if (state.main.status !== 'solved') throw new Error('Complete the current level first');
  if (state.current === catalog.entries.length) return state;
  return Object.freeze({ ...state, current: state.current + 1, main: createSession(catalog.entries[state.current].level), freeHintUsed: false });
}
export function selectMainline(state: MainlineState, catalog: PlayableMainline, number: number): MainlineState {
  if (!Number.isInteger(number) || number < 1 || number > catalog.entries.length) throw new Error('Invalid level number');
  if (number === state.current) return Object.freeze({ ...state, replay: null });
  if (number > state.completedThrough) throw new Error('Level is locked');
  return Object.freeze({ ...state, replay: createSession(catalog.entries[number - 1].level) });
}
