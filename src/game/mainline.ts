import type { PlayableMainline } from './mainlinePlayable.ts';
import { createSession, moveSession, undoSession, resetSession, meltSession, extendSessionWithEmptyBottle, type GameSession } from './session.ts';
import { hasOptionalReserve, oneSpareLevel } from './optionalReserve.ts';
import type { SolidSideCatalog } from './solidSide.ts';

export type MainlineState = {
  readonly main: GameSession;
  readonly replay: GameSession | null;
  readonly side: GameSession | null;
  readonly sideCompletedThrough: number;
  readonly current: number;
  readonly completedThrough: number;
  readonly tutorialDone: boolean;
  readonly symbols: boolean;
  readonly hintCredits: number;
  readonly freeHintUsed: boolean;
};
export const MAX_HINT_CREDITS = 5;
export const visibleSession = (state: MainlineState) => state.replay ?? state.side ?? state.main;
const newLevelSession = (catalog: PlayableMainline, number: number) => createSession(oneSpareLevel(catalog.entries[number - 1]));
export function createMainline(catalog: PlayableMainline): MainlineState {
  return Object.freeze({ main: newLevelSession(catalog, 1), replay: null, side: null, sideCompletedThrough: 0,
    current: 1, completedThrough: 0, tutorialDone: false, symbols: false, hintCredits: 0, freeHintUsed: false });
}
export function reserveIsLocked(state: MainlineState, catalog: PlayableMainline): boolean {
  const session = visibleSession(state);
  if (state.side && !state.replay) return false;
  const entry = state.replay ? catalog.entries.find(e => (e.levelId ?? e.level.id) === session.level.id) : catalog.entries[state.current - 1];
  return !!entry && hasOptionalReserve(entry) && session.level.bottles.length === entry.level.bottles.length - 1;
}
export function unlockReserveMainline(state: MainlineState, catalog: PlayableMainline): MainlineState {
  if (!reserveIsLocked(state, catalog)) return state;
  const session = visibleSession(state);
  const entry = state.replay ? catalog.entries.find(e => (e.levelId ?? e.level.id) === session.level.id)! : catalog.entries[state.current - 1];
  const expanded = extendSessionWithEmptyBottle(session, entry.level);
  return Object.freeze(state.replay ? { ...state, replay: expanded } : { ...state, main: expanded });
}
export function moveMainline(state: MainlineState, source: number, target: number) {
  const result = moveSession(visibleSession(state), source, target);
  if (!result) return null;
  if (state.side && !state.replay) {
    const sideCompletedThrough = result.session.status === 'solved' ? Math.max(state.sideCompletedThrough, state.current / 20) : state.sideCompletedThrough;
    return { state: Object.freeze({ ...state, side: result.session, sideCompletedThrough }), event: result.event, awardedTickets: 0 };
  }
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
  return Object.freeze(state.replay ? { ...state, replay: session } : state.side ? { ...state, side: session } : { ...state, main: session });
}
export function meltSideMainline(state: MainlineState): MainlineState {
  if (state.replay?.solid) return Object.freeze({ ...state, replay: meltSession(state.replay) });
  if (!state.side || state.replay) return state;
  return Object.freeze({ ...state, side: meltSession(state.side) });
}
export function nextMainline(state: MainlineState, catalog: PlayableMainline, sides?: SolidSideCatalog): MainlineState {
  if (state.replay) return Object.freeze({ ...state, replay: null });
  if (state.side) {
    if (state.side.status !== 'solved') throw new Error('Complete the side level first');
    if (state.current === catalog.entries.length) return Object.freeze({ ...state, side: null });
    return Object.freeze({ ...state, side: null, current: state.current + 1,
      main: newLevelSession(catalog, state.current + 1), freeHintUsed: false });
  }
  if (state.main.status !== 'solved') throw new Error('Complete the current level first');
  if (sides && state.current % 20 === 0 && state.sideCompletedThrough < state.current / 20) {
    const entry = sides.entries[state.current / 20 - 1];
    if (!entry || entry.afterMainline !== state.current) throw new Error('Missing side level');
    return Object.freeze({ ...state, side: createSession(entry.level, { bottle: entry.frozenBottle, depth: 1, melted: false, meltAt: null }), freeHintUsed: false });
  }
  if (state.current === catalog.entries.length) return state;
  return Object.freeze({ ...state, current: state.current + 1, main: newLevelSession(catalog, state.current + 1), freeHintUsed: false });
}
export function selectMainline(state: MainlineState, catalog: PlayableMainline, number: number): MainlineState {
  if (!Number.isInteger(number) || number < 1 || number > catalog.entries.length) throw new Error('Invalid level number');
  if (number === state.current) return Object.freeze(state.side && state.completedThrough >= number
    ? { ...state, replay: newLevelSession(catalog, number) } : { ...state, replay: null });
  if (number > state.completedThrough) throw new Error('Level is locked');
  return Object.freeze({ ...state, replay: newLevelSession(catalog, number) });
}
export function resumeMainline(state: MainlineState): MainlineState {
  return state.replay ? Object.freeze({ ...state, replay: null }) : state;
}
export function selectSideMainline(state: MainlineState, sides: SolidSideCatalog, number: number): MainlineState {
  if (!Number.isInteger(number) || number < 1 || number > state.sideCompletedThrough) throw new Error('Side level is locked');
  const entry = sides.entries[number - 1];
  if (!entry || entry.number !== number) throw new Error('Missing side level');
  return Object.freeze({ ...state, replay: createSession(entry.level, { bottle: entry.frozenBottle, depth: 1, melted: false, meltAt: null }) });
}
