import type { Board } from '../game/rules.ts';
import type { GameStatus } from '../game/session.ts';

export type StalledReason = 'noMoves' | 'unsolvable';
export type NoticeInput = { scope: string; board: Board; status: GameStatus; entered: boolean; eligible: boolean };
export type StalledNoticeState = { input: NoticeInput | null; reason: StalledReason | null; handled: boolean; suppress: boolean };
export const INITIAL_STALLED_NOTICE: StalledNoticeState = { input: null, reason: null, handled: false, suppress: false };

/** UI only: wait for presentation readiness without changing the committed session. */
export function advanceStalledNotice(state: StalledNoticeState, next: NoticeInput): StalledNoticeState {
  const previous = state.input;
  if (previous && previous.scope === next.scope && previous.board === next.board && previous.status === next.status && previous.entered === next.entered && previous.eligible === next.eligible) return state;
  let result = { ...state, input: next };
  if (!next.entered || !previous?.entered || previous.scope !== next.scope) result = { ...INITIAL_STALLED_NOTICE, input: next };
  else if (previous.board !== next.board) result = { input: next, reason: null, handled: false,
    suppress: state.suppress && previous.status === 'stalled' && next.status === 'stalled' };
  if (next.status === 'solved') result = { ...result, reason: null, handled: false, suppress: false };
  if (next.entered && next.eligible && next.status === 'stalled' && !result.handled && !result.suppress) {
    result = { ...result, reason: 'noMoves', handled: true };
  }
  return result;
}

export function closeStalledNotice(state: StalledNoticeState, recovering = false): StalledNoticeState {
  return { ...state, reason: null, handled: true, suppress: recovering || state.suppress };
}

/** Only a fully exhausted search can request this; budget limits are not failure. */
export function showUnsolvableNotice(state: StalledNoticeState): StalledNoticeState {
  if (!state.input?.entered || state.input.status === 'solved') return state;
  return { ...state, reason: state.input.status === 'stalled' ? 'noMoves' : 'unsolvable', handled: true };
}
