import { recordObject } from './generation.ts';
import { getLegalPours, applyPour } from './rules.ts';
import { createSession, moveSession, meltSession, type GameSession } from './session.ts';
import { createMainline, MAX_HINT_CREDITS, type MainlineState } from './mainline.ts';
import type { PlayableMainline } from './mainlinePlayable.ts';
import { hasOptionalReserve, oneSpareLevel } from './optionalReserve.ts';
import type { SolidSideCatalog } from './solidSide.ts';
import { applySolidPour, getSolidLegalPours } from './solidRules.ts';

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
function sideMoves(session: GameSession) {
  if (!session.solid || session.history.length > 4096) throw new Error('Invalid side session');
  const boards = [...session.history, session.board], moves: number[][] = [];
  const meltAt = session.solid.melted ? session.solid.meltAt : null;
  if (meltAt !== null && (!Number.isInteger(meltAt) || (meltAt as number) < 0 || (meltAt as number) > session.history.length)) throw new Error('Invalid heat point');
  let restored = createSession(session.level, { bottle: session.solid.bottle, depth: 1, melted: false, meltAt: null });
  for (let i = 0; i < boards.length - 1; i++) {
    if (i === meltAt) restored = meltSession(restored);
    if (!same(boards[i], restored.board)) throw new Error('Invalid side history');
    const pour = getSolidLegalPours(restored.board, 4, restored.solid!).find(p => same(applySolidPour(restored.board, p, 4, restored.solid!), boards[i + 1]));
    if (!pour) throw new Error('Invalid side move');
    const accepted = moveSession(restored, pour.source, pour.target);
    if (!accepted) throw new Error('Side move after completion');
    restored = accepted.session; moves.push([pour.source, pour.target]);
  }
  if (meltAt === session.history.length) restored = meltSession(restored);
  if (!same(restored.board, session.board) || restored.solid?.melted !== session.solid.melted) throw new Error('Invalid side session board');
  return { levelId: session.level.id, meltAt, moves };
}
export function encodeMainline(state: MainlineState, catalog: PlayableMainline, sides?: SolidSideCatalog) {
  if (state.side && (!sides || !sides.entries.some(entry => entry.level.id === state.side!.level.id))) throw new Error('Side content missing');
  const json = JSON.stringify({ format: 'bottle-harmony-mainline-save', version: 1, catalog: catalog.id,
    current: state.current, completedThrough: state.completedThrough, tutorialDone: state.tutorialDone, symbols: state.symbols,
    hintCredits: state.hintCredits, freeHintUsed: state.freeHintUsed,
    main: sessionMoves(state.main, catalog), replay: state.replay ? state.replay.solid ? sideMoves(state.replay) : sessionMoves(state.replay, catalog) : null,
    sideCompletedThrough: state.sideCompletedThrough, side: state.side ? sideMoves(state.side) : null });
  if (json.length > 262144) throw new Error('Progress exceeds size budget');
  decodeMainline(json, catalog, sides);
  return json;
}
export function decodeMainline(json: string, catalog: PlayableMainline, sides?: SolidSideCatalog): MainlineState {
  if (json.length > 262144) throw new Error('Progress exceeds size budget');
  const value = recordObject(JSON.parse(json), ['format', 'version', 'catalog', 'current', 'completedThrough', 'tutorialDone', 'symbols', 'hintCredits', 'freeHintUsed', 'main', 'replay', 'sideCompletedThrough', 'side'], 'mainline progress');
  if (value.format !== 'bottle-harmony-mainline-save' || value.version !== 1 || value.catalog !== catalog.id
    || !Number.isInteger(value.current) || (value.current as number) < 1 || (value.current as number) > catalog.entries.length
    || !Number.isInteger(value.completedThrough) || (value.completedThrough as number) < 0 || (value.completedThrough as number) > catalog.entries.length
    || (value.current as number) < (value.completedThrough as number) || (value.current as number) > (value.completedThrough as number) + 1
    || typeof value.tutorialDone !== 'boolean' || typeof value.symbols !== 'boolean'
    || (value.hintCredits !== undefined && (!Number.isInteger(value.hintCredits) || (value.hintCredits as number) < 0
      || (value.hintCredits as number) > Math.min(MAX_HINT_CREDITS, (value.completedThrough as number) + Math.floor((value.completedThrough as number) / 10))))
    || (value.freeHintUsed !== undefined && typeof value.freeHintUsed !== 'boolean')
    || (value.sideCompletedThrough !== undefined && (!Number.isInteger(value.sideCompletedThrough)
      || (value.sideCompletedThrough as number) < 0 || (value.sideCompletedThrough as number) > Math.floor((value.completedThrough as number) / 20)))) throw new Error('Invalid mainline progress metadata');
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
  const sideCompletedThrough = value.sideCompletedThrough === undefined ? Math.floor(((value.current as number) - 1) / 20) : value.sideCompletedThrough as number;
  const restoreSide = (input: unknown, expectedNumber: number | null): GameSession => {
    if (!sides) throw new Error('Side content missing');
    const raw = recordObject(input, ['levelId', 'meltAt', 'moves'], 'side session');
    const entry = sides.entries.find(item => item.level.id === raw.levelId);
    if (!entry || expectedNumber !== null && entry.number !== expectedNumber
      || expectedNumber === null && entry.number > sideCompletedThrough
      || !Array.isArray(raw.moves) || raw.moves.length > 4096
      || (raw.meltAt !== null && (!Number.isInteger(raw.meltAt) || (raw.meltAt as number) < 0 || (raw.meltAt as number) > raw.moves.length))) throw new Error('Invalid side session');
    let session = createSession(entry.level, { bottle: entry.frozenBottle, depth: 1, melted: false, meltAt: null });
    for (let i = 0; i < raw.moves.length; i++) {
      if (i === raw.meltAt) session = meltSession(session);
      const move = raw.moves[i];
      if (!Array.isArray(move) || move.length !== 2 || !move.every(Number.isInteger)) throw new Error('Invalid side move');
      const accepted = moveSession(session, move[0], move[1]);
      if (!accepted) throw new Error('Illegal side move');
      session = accepted.session;
    }
    if (raw.meltAt === raw.moves.length) session = meltSession(session);
    return session;
  };
  let side: GameSession | null = null;
  if (value.side !== undefined && value.side !== null) {
    if (!sides || (value.current as number) % 20 !== 0 || (value.completedThrough as number) !== value.current) throw new Error('Invalid side progress binding');
    side = restoreSide(value.side, (value.current as number) / 20);
    const sideNumber = (value.current as number) / 20;
    if (side.status === 'solved' ? sideCompletedThrough !== sideNumber
      : sideCompletedThrough !== sideNumber - 1 && sideCompletedThrough !== sideNumber) throw new Error('Invalid side completion');
  }
  const current = value.current as number;
  const pastSides = Math.floor((current - 1) / 20);
  if (sides && (sideCompletedThrough < pastSides || sideCompletedThrough > pastSides + (side ? 1 : current === catalog.entries.length ? 1 : 0)
    || !side && current < catalog.entries.length && sideCompletedThrough !== pastSides)) throw new Error('Invalid side progression');
  const main = restore(value.main, true);
  if (side && main.status !== 'solved') throw new Error('Side level requires a completed mainline level');
  return Object.freeze({ ...createMainline(catalog), current: value.current as number, completedThrough: value.completedThrough as number,
    side, sideCompletedThrough,
    tutorialDone: value.tutorialDone, symbols: value.symbols,
    // Pre-release saves from before hint tickets keep their unlocked progress and
    // receive a bounded starting balance. No separate legacy schema is retained.
    hintCredits: value.hintCredits === undefined ? Math.min(MAX_HINT_CREDITS, value.completedThrough as number) : value.hintCredits as number,
    freeHintUsed: value.freeHintUsed === undefined ? false : value.freeHintUsed as boolean,
    main, replay: value.replay === null ? null
      : sides?.entries.some(entry => entry.level.id === (value.replay as { levelId?: unknown })?.levelId)
        ? restoreSide(value.replay, null) : restore(value.replay, false) });
}
