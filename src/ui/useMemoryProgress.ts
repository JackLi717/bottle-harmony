import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { MemorySession } from '../game/memory';
import { monotonicNow } from '../storage/gameplayClock';
import { MemoryClock } from '../storage/memoryClock';
import { getMemory } from '../storage/runtime';

export function useMemoryProgress(visible = true) {
  const repository = getMemory();
  const [session, setSession] = useState(() => repository.start());
  const [tutorial, setTutorial] = useState(!repository.tutorialDone);
  const [saved, setSaved] = useState(true);
  const [timer] = useState(() => new MemoryClock(monotonicNow()));
  const clock = useRef(timer);
  const mounted = useRef(true), sequence = useRef(0), blocked = useRef(false), foreground = useRef(AppState.currentState === 'active');
  const current = useRef(session);
  const tutorialRef = useRef(tutorial), shown = useRef(false);
  const report = useCallback((promise: Promise<boolean>) => {
    const revision = ++sequence.current;
    void promise.then(ok => { if (mounted.current && sequence.current === revision) setSaved(ok); });
  }, []);
  const record = useCallback((kind: string, detail: Record<string, unknown> = {}) => {
    report(repository.commit(current.current, kind, detail, clock.current!.take(monotonicNow())));
  }, [report, repository]);
  function commit(next: MemorySession, kind: string, detail: Record<string, unknown> = {}) {
    if (next === current.current) return;
    // Close the old attempt's measured interval before reset/next creates another one.
    if (next.attempt !== current.current.attempt) {
      clock.current.update(monotonicNow(), false, blocked.current, current.current.phase);
      record('clock');
    }
    const now = monotonicNow();
    const timing = clock.current!.take(now);
    clock.current!.update(now, foreground.current && shown.current && !tutorialRef.current && next.game.status !== 'solved', blocked.current, next.phase);
    current.current = next; setSession(next); report(repository.commit(next, kind, detail, timing));
  }
  const availability = useCallback((unavailable: boolean) => {
    blocked.current = unavailable;
    const value = current.current;
    clock.current!.update(monotonicNow(), foreground.current && shown.current && !tutorialRef.current && value.game.status !== 'solved', unavailable, value.phase);
  }, []);
  useEffect(() => {
    const wasShown = shown.current;
    shown.current = visible;
    availability(blocked.current);
    if (visible) record('show');
    else if (wasShown) record('pause');
  }, [visible, availability, record]);
  function finishTutorial() { tutorialRef.current = false; setTutorial(false); report(repository.completeTutorial()); availability(blocked.current); record('tutorial-complete'); }
  useEffect(() => {
    const timer = clock.current;
    mounted.current = true;
    availability(blocked.current);
    const subscription = AppState.addEventListener('change', state => {
      foreground.current = state === 'active'; availability(blocked.current); if (shown.current) record(foreground.current ? 'show' : 'background'); void repository.player.flush();
    });
    const interval = setInterval(() => { if (foreground.current && shown.current) record('clock'); else void repository.player.flush(); }, 10000);
    return () => { mounted.current = false; subscription.remove(); clearInterval(interval); timer.update(monotonicNow(), false, false, current.current.phase); if (shown.current) record('pause'); };
  }, [availability, record, repository]);
  return { session, commit, record, tutorial, finishTutorial, availability, saved, repository };
}
