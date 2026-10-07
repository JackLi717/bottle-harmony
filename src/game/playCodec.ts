import { parseLevel, type LevelDefinition } from './model.ts';
import { applyPour, getLegalPours } from './rules.ts';
import { createSession, moveSession } from './session.ts';
import { PLAY_TIERS, type PlayCatalog } from './catalog.ts';
import { freezePlay, RECOMMENDED_TIERS, type PlayState, type PlayMode } from './play.ts';
import { recordObject } from './generation.ts';

export const SAVE_KEY = 'bottle-harmony.play.v1';
const LIMIT = 4096;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Save actual starting data and replayable actions. No animation/timer/search state.
 * Binding to the current internal baseline prevents silently resuming altered assets. */
export function encodePlay(state: PlayState): string {
  const moves: number[][] = [];
  if (state.session.history.length > LIMIT) throw new Error('Progress history exceeds limit');
  const boards = [...state.session.history, state.session.board];
  let session = createSession(state.session.level);
  for (let i = 0; i < boards.length - 1; i++) {
    if (!same(session.board, boards[i])) throw new Error('Invalid progress history');
    const pour = getLegalPours(boards[i], session.level.capacity).find(pour => same(applyPour(boards[i], pour, session.level.capacity), boards[i + 1]));
    if (!pour) throw new Error('Invalid progress move');
    const accepted = moveSession(session, pour.source, pour.target);
    if (!accepted) throw new Error('Invalid progress after completion');
    session = accepted.session;
    moves.push([pour.source, pour.target]);
  }
  if (!same(session.board, state.session.board)) throw new Error('Invalid progress board');
  return JSON.stringify({ format: 'bottle-harmony-play', version: 1, level: state.session.level, moves,
    mode: state.mode, sequence: state.sequence, selections: state.selections, seenIds: state.seenIds,
    completedIds: state.completedIds, tutorialDone: state.tutorialDone, repeated: state.repeated });
}
export function decodePlay(json: string, levels: readonly LevelDefinition[], catalog: PlayCatalog): PlayState {
  if (json.length > 131072) throw new Error('Progress exceeds limit');
  const value = recordObject(JSON.parse(json), ['format', 'version', 'level', 'moves', 'mode', 'sequence', 'selections', 'seenIds', 'completedIds', 'tutorialDone', 'repeated'], 'progress');
  if (value.format !== 'bottle-harmony-play' || value.version !== 1) throw new Error('Unsupported progress format');
  const level = parseLevel(value.level), known = levels.find(item => item.id === level.id);
  if (!known || !same(parseLevel(known), level)) throw new Error('Progress belongs to a different content baseline');
  if (value.mode !== 'recommended' && !PLAY_TIERS.includes(value.mode as never)) throw new Error('Invalid play mode');
  if (!Number.isInteger(value.sequence) || (value.sequence as number) < 0 || (value.sequence as number) >= RECOMMENDED_TIERS.length
    || !Number.isInteger(value.selections) || (value.selections as number) < 0 || (value.selections as number) >= 1000000
    || typeof value.tutorialDone !== 'boolean' || typeof value.repeated !== 'boolean') throw new Error('Invalid progress metadata');
  const catalogIds = new Set(catalog.entries.map(entry => entry.content.level.id));
  const ids = (input: unknown): string[] => {
    if (!Array.isArray(input) || input.length > catalogIds.size || !input.every(id => typeof id === 'string' && catalogIds.has(id)) || new Set(input).size !== input.length) throw new Error('Invalid progress IDs');
    return input;
  };
  if (!Array.isArray(value.moves) || value.moves.length > LIMIT) throw new Error('Invalid progress moves');
  let session = createSession(level);
  for (const move of value.moves) {
    if (!Array.isArray(move) || move.length !== 2 || !move.every(Number.isInteger)) throw new Error('Invalid progress move');
    const accepted = moveSession(session, move[0], move[1]);
    if (!accepted) throw new Error('Illegal progress move');
    session = accepted.session;
  }
  return freezePlay({ session, mode: value.mode as PlayMode, sequence: value.sequence as number, selections: value.selections as number,
    seenIds: ids(value.seenIds), completedIds: ids(value.completedIds), tutorialDone: value.tutorialDone, repeated: value.repeated });
}
