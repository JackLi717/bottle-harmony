import { recordObject } from './generation.ts';
import { getLegalPours, applyPour } from './rules.ts';
import { createSession, moveSession, type GameSession } from './session.ts';
import { createMainline, type MainlineState } from './mainline.ts';
import type { PlayableMainline } from './mainlinePlayable.ts';

export const MAINLINE_SAVE_KEY = 'bottle-harmony.mainline.v1';
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function sessionMoves(session: GameSession) {
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
  return { levelId: session.level.id, moves };
}
export function encodeMainline(state: MainlineState, catalog: PlayableMainline) {
  const json = JSON.stringify({ format: 'bottle-harmony-mainline-save', version: 1, catalog: catalog.id,
    current: state.current, completedThrough: state.completedThrough, tutorialDone: state.tutorialDone, symbols: state.symbols,
    main: sessionMoves(state.main), replay: state.replay ? sessionMoves(state.replay) : null });
  if (json.length > 262144) throw new Error('Progress exceeds size budget');
  decodeMainline(json, catalog);
  return json;
}
export function decodeMainline(json: string, catalog: PlayableMainline): MainlineState {
  if (json.length > 262144) throw new Error('Progress exceeds size budget');
  const value = recordObject(JSON.parse(json), ['format', 'version', 'catalog', 'current', 'completedThrough', 'tutorialDone', 'symbols', 'main', 'replay'], 'mainline progress');
  if (value.format !== 'bottle-harmony-mainline-save' || value.version !== 1 || value.catalog !== catalog.id
    || !Number.isInteger(value.current) || (value.current as number) < 1 || (value.current as number) > catalog.entries.length
    || !Number.isInteger(value.completedThrough) || (value.completedThrough as number) < 0 || (value.completedThrough as number) > catalog.entries.length
    || (value.current as number) < (value.completedThrough as number) || (value.current as number) > (value.completedThrough as number) + 1
    || typeof value.tutorialDone !== 'boolean' || typeof value.symbols !== 'boolean') throw new Error('Invalid mainline progress metadata');
  const restore = (input: unknown, main: boolean) => {
    const raw = recordObject(input, ['levelId', 'moves'], 'saved session');
    const entry = catalog.entries.find(e => e.level.id === raw.levelId);
    if (!entry || (main ? entry.number !== value.current : entry.number > (value.completedThrough as number))
      || !Array.isArray(raw.moves) || raw.moves.length > 4096) throw new Error('Session binding mismatch');
    let session = createSession(entry.level);
    for (const move of raw.moves) {
      if (!Array.isArray(move) || move.length !== 2 || !move.every(Number.isInteger)) throw new Error('Invalid saved move');
      const accepted = moveSession(session, move[0], move[1]);
      if (!accepted) throw new Error('Illegal saved move');
      session = accepted.session;
    }
    return session;
  };
  return Object.freeze({ ...createMainline(catalog), current: value.current as number, completedThrough: value.completedThrough as number,
    tutorialDone: value.tutorialDone, symbols: value.symbols, main: restore(value.main, true), replay: value.replay === null ? null : restore(value.replay, false) });
}
