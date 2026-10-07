import { recordObject } from './generation.ts';
import { getLegalPours, applyPour } from './rules.ts';
import { createSession, moveSession, type GameSession } from './session.ts';
import { createMainline, MAX_HINT_CREDITS, type MainlineState } from './mainline.ts';
import type { PlayableMainline } from './mainlinePlayable.ts';
import { hasOptionalReserve, oneSpareLevel } from './optionalReserve.ts';

export const MAINLINE_SAVE_KEY = 'bottle-harmony.mainline.v1';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function sessionMoves(session: GameSession, catalog: PlayableMainline) {
  if (session.history.length > 4096) throw new Error('Session history exceeds budget');
  const boards = [...session.history, session.board], moves: number[][] = [];
  let restored = createSession(session.level);
  for (let i = 0; i < boards.length - 1; i++) {
    if (!same(boards[i], restored.board)) throw new Error('Invalid history');
    const pour = getLegalPours(restored.board, 4).find(p => same(applyPour(restored.board, p, 4), boards[i + 1]));
    if (!pour) throw new Error('Invalid stored move');
    const accepted = moveSession(restored, pour.source, pour.target);
    if (!accepted) throw new Error('Move after completion');
    restored = accepted.session; moves.push([pour.source, pour.target]);
  }
  if (!same(restored.board, session.board)) throw new Error('Invalid session board');
  const entry = catalog.entries.find(e => e.level.id === session.level.id);
  if (!entry) throw new Error('Session level missing from catalog');
  const reserveLocked = hasOptionalReserve(entry) && session.level.bottles.length === entry.level.bottles.length - 1;
  if (session.level.bottles.length !== entry.level.bottles.length && !reserveLocked) throw new Error('Invalid session variant');
  return { levelId: session.level.id, ...(reserveLocked ? { reserveLocked: true } : {}), moves };
}
export function encodeMainline(state: MainlineState, catalog: PlayableMainline) {
  const json = JSON.stringify({ format: 'bottle-harmony-mainline-save', version: 1, catalog: catalog.id,
    current: state.current, completedThrough: state.completedThrough, tutorialDone: state.tutorialDone, symbols: state.symbols,
    hintCredits: state.hintCredits, freeHintUsed: state.freeHintUsed,
    main: sessionMoves(state.main, catalog), replay: state.replay ? sessionMoves(state.replay, catalog) : null });
  if (json.length > 262144) throw new Error('Progress exceeds size budget');
  decodeMainline(json, catalog);
  return json;
}
export function decodeMainline(json: string, catalog: PlayableMainline): MainlineState {
  if (json.length > 262144) throw new Error('Progress exceeds size budget');
  const value = recordObject(JSON.parse(json), ['format', 'version', 'catalog', 'current', 'completedThrough', 'tutorialDone', 'symbols', 'hintCredits', 'freeHintUsed', 'main', 'replay'], 'mainline progress');
  if (value.format !== 'bottle-harmony-mainline-save' || value.version !== 1 || value.catalog !== catalog.id
    || !Number.isInteger(value.current) || (value.current as number) < 1 || (value.current as number) > catalog.entries.length
    || !Number.isInteger(value.completedThrough) || (value.completedThrough as number) < 0 || (value.completedThrough as number) > catalog.entries.length
    || (value.current as number) < (value.completedThrough as number) || (value.current as number) > (value.completedThrough as number) + 1
    || typeof value.tutorialDone !== 'boolean' || typeof value.symbols !== 'boolean'
    || (value.hintCredits !== undefined && (!Number.isInteger(value.hintCredits) || (value.hintCredits as number) < 0
      || (value.hintCredits as number) > Math.min(MAX_HINT_CREDITS, (value.completedThrough as number) + Math.floor((value.completedThrough as number) / 10))))
    || (value.freeHintUsed !== undefined && typeof value.freeHintUsed !== 'boolean')) throw new Error('Invalid mainline progress metadata');
  const restore = (input: unknown, main: boolean) => {
    const raw = recordObject(input, ['levelId', 'reserveLocked', 'moves'], 'saved session');
    const entry = catalog.entries.find(e => e.level.id === raw.levelId);
    if (!entry || (main ? entry.number !== value.current : entry.number > (value.completedThrough as number))
      || !Array.isArray(raw.moves) || raw.moves.length > 4096
      || (raw.reserveLocked !== undefined && raw.reserveLocked !== true)
      || (raw.reserveLocked === true && !hasOptionalReserve(entry))) throw new Error('Session binding mismatch');
    // Pre-feature saves contain the original full board and stay exactly as played.
    let session = createSession(raw.reserveLocked === true ? oneSpareLevel(entry) : entry.level);
    for (const move of raw.moves) {
      if (!Array.isArray(move) || move.length !== 2 || !move.every(Number.isInteger)) throw new Error('Invalid saved move');
      const accepted = moveSession(session, move[0], move[1]);
      if (!accepted) throw new Error('Illegal saved move');
      session = accepted.session;
    }
    return session;
  };
  return Object.freeze({ ...createMainline(catalog), current: value.current as number, completedThrough: value.completedThrough as number,
    tutorialDone: value.tutorialDone, symbols: value.symbols,
    // Pre-release saves from before hint tickets keep their unlocked progress and
    // receive a bounded starting balance. No separate legacy schema is retained.
    hintCredits: value.hintCredits === undefined ? Math.min(MAX_HINT_CREDITS, value.completedThrough as number) : value.hintCredits as number,
    freeHintUsed: value.freeHintUsed === undefined ? false : value.freeHintUsed as boolean,
    main: restore(value.main, true), replay: value.replay === null ? null : restore(value.replay, false) });
}
