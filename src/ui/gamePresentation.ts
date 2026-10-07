import type { PlayableEntry } from '../game/mainlinePlayable.ts';
import { createSession, moveSession } from '../game/session.ts';

/** Presentation actions mirror mainline boundaries without granting new progression. */
export function finishPresentation(mode: 'mainline' | 'replay' | 'preview', number: number, total = 1000) {
  if (mode !== 'mainline') return { title: 'finished' as const, label: 'home' as const, action: 'home' as const };
  if (number === total) return { title: 'finalFinished' as const, label: 'replayLevels' as const, action: 'levels' as const };
  return { title: 'finished' as const, label: 'next' as const, action: 'next' as const };
}

/** Replay a validated route into a private session; never touch saved mainline state. */
export function completedPreviewSession(entry: PlayableEntry) {
  let session = createSession(entry.level);
  for (const pour of entry.solution) {
    const accepted = moveSession(session, pour.source, pour.target);
    if (!accepted || accepted.event.pour.amount !== pour.amount || accepted.event.pour.color !== pour.color) throw new Error('Invalid celebration preview route');
    session = accepted.session;
  }
  if (session.status !== 'solved') throw new Error('Incomplete celebration preview route');
  return session;
}
