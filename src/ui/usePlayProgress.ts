import type { MessageKey } from '../i18n/messages';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createMainline, type MainlineState } from '../game/mainline';
import { decodeMainline, encodeMainline, MAINLINE_SAVE_KEY } from '../game/mainlineCodec';
import { createProgressWriter } from '../storage/progressWriter';
import { MAINLINE } from './mainlineContent';

const write = createProgressWriter(value => AsyncStorage.setItem(MAINLINE_SAVE_KEY, value));
export function usePlayProgress() {
  const [play, updatePlay] = useState(() => createMainline(MAINLINE));
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<MessageKey>('localProgress');
  const latest = useRef<string | null>(null);
  const lastRequested = useRef<string | null>(null);
  const alive = useRef(true);
  const dirty = useRef(false);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    (async () => {
      let restored = createMainline(MAINLINE);
      try {
        const json = await AsyncStorage.getItem(MAINLINE_SAVE_KEY);
        if (json) {
          try { restored = decodeMainline(json, MAINLINE); }
          catch { /* An incompatible pre-release board starts fresh; retain its bytes until the next explicit action. */ }
        }
      } catch { /* Keep the fresh in-memory session without exposing a storage diagnostic in play. */ }
      if (cancelled) return;
      // Do not overwrite a failed read or invalid save merely by mounting the app.
      lastRequested.current = encodeMainline(restored, MAINLINE);
      latest.current = lastRequested.current;
      updatePlay(restored); setSaveStatus('localProgress'); setReady(true);
    })();
    return () => { cancelled = true; alive.current = false; };
  }, []);
  const encoded = useMemo(() => {
    try { return encodeMainline(play, MAINLINE); } catch { return null; }
  }, [play]);
  useEffect(() => {
    if (!ready || encoded === null) return;
    const json = encoded;
    latest.current = json;
    if (lastRequested.current === json) return;
    lastRequested.current = json;
    dirty.current = true;
    write(json).then(ok => {
      if (alive.current && latest.current === json) setSaveStatus(ok ? 'saved' : 'saveFailed');
    });
  }, [encoded, ready]);
  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && dirty.current && latest.current) {
        const json = latest.current;
        write(json).then(ok => { if (alive.current && latest.current === json) setSaveStatus(ok ? 'saved' : 'saveFailed'); });
      }
    });
    return () => subscription.remove();
  }, [ready]);
  function setPlay(next: MainlineState) {
    updatePlay(next);
  }
  return { play, setPlay, ready, saveStatus: encoded === null ? 'saveTooLong' as const : saveStatus };
}
