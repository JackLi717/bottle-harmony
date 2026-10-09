import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { MessageKey } from '../i18n/messages';
import type { MainlineState } from '../game/mainline';
import { visibleSession } from '../game/mainline';
import { getPlayer } from '../storage/runtime';
import type { GameplayAction } from '../storage/statistics';
import { MetricClock } from '../storage/metricTime';
import { GameplayClock, monotonicNow } from '../storage/gameplayClock';
export function usePlayProgress() {
  const repository = getPlayer();
  const [play, updatePlay] = useState(repository.state);
  const [saveStatus, setSaveStatus] = useState<MessageKey>('localProgress');
  const [timer] = useState(() => new GameplayClock(monotonicNow()));
  const clock = useRef(timer);
  const [metricsClock] = useState(() => new MetricClock(monotonicNow()));
  const alive = useRef(true), visible = useRef(false), blocked = useRef(false);
  const active = useRef(AppState.currentState === 'active'), revision = useRef(0);
  const focus = useRef('');
  function report(result: Promise<boolean>) {
    const request = ++revision.current;
    void result.then(ok => { if (alive.current && revision.current === request) setSaveStatus(ok ? 'saved' : 'saveFailed'); });
  }
  function record(action: GameplayAction) {
    report(repository.record({ slices: metricsClock.take(monotonicNow()), ...clock.current.take(performance.now(), ['pour', 'undo', 'reset', 'melt', 'reserve', 'hint-request'].includes(action.type)), ...action }));
  }
  function setPlay(next: MainlineState, action: GameplayAction = { type: 'navigate' }) {
    const timing = clock.current.take(performance.now(), ['pour', 'undo', 'reset', 'melt', 'reserve'].includes(action.type));
    if (action.type === 'navigate' || action.type === 'select' || visibleSession(next).status === 'solved') { clock.current.update(performance.now(), false, false); metricsClock.update(monotonicNow(), false, false); }
    updatePlay(next);
    report(repository.commit(next, { slices: metricsClock.take(monotonicNow()), ...timing, ...action }));
  }
  function observe(entered: boolean, unavailable: boolean, scope: string) {
    const wasVisible = visible.current;
    const changed = focus.current !== scope;
    focus.current = scope;
    clock.current.update(performance.now(), entered && active.current, unavailable);
    metricsClock.update(monotonicNow(), entered && active.current, unavailable);
    visible.current = entered; blocked.current = unavailable;
    if (entered !== wasVisible || entered && changed) record({ type: entered ? 'show' : 'pause' });
  }
  useEffect(() => {
    const timer = clock.current;
    alive.current = true;
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      clock.current.update(performance.now(), visible.current && active.current, blocked.current);
      metricsClock.update(monotonicNow(), visible.current && active.current, blocked.current);
      report(repository.record({ slices: metricsClock.take(monotonicNow()), ...clock.current.take(performance.now()), type: active.current ? visible.current ? 'show' : 'clock' : 'background' }));
      void repository.flush();
    });
    const interval = setInterval(() => {
      if (active.current && visible.current) report(repository.record({ slices: metricsClock.take(monotonicNow()), ...clock.current.take(performance.now()), type: 'clock' }));
      else void repository.flush();
    }, 10000);
    return () => {
      alive.current = false; subscription.remove(); clearInterval(interval);
      metricsClock.update(monotonicNow(), false, false);
      void repository.record({ slices: metricsClock.take(monotonicNow()), ...timer.take(performance.now()), type: 'background' });
    };
  // Repository and clock are stable for the lifetime of this screen.
  }, [repository, metricsClock]);
  return { play, setPlay, record, observe, hintRequestId: () => repository.hintRequestId(), ready: true, saveStatus };
}
