import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPlay, type PlayState } from '../game/play';
import { decodePlay, encodePlay, SAVE_KEY } from '../game/playCodec';
import { DEMO_LEVEL } from '../game/demo';
import { createProgressWriter } from '../storage/progressWriter';
import { CATALOG, PLAY_LEVELS } from './content';

const write = createProgressWriter(value => AsyncStorage.setItem(SAVE_KEY, value));
export function usePlayProgress() {
  const [play, updatePlay] = useState(() => createPlay(DEMO_LEVEL));
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [saveStatus, setSaveStatus] = useState('本地进度');
  const latest = useRef<string | null>(null);
  const lastRequested = useRef<string | null>(null);
  const alive = useRef(true);
  const dirty = useRef(false);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    (async () => {
      let restored = createPlay(DEMO_LEVEL);
      try {
        const json = await AsyncStorage.getItem(SAVE_KEY);
        if (json) {
          try { restored = decodePlay(json, PLAY_LEVELS, CATALOG); }
          catch { if (!cancelled) setNotice('保存记录无法恢复，已回到初次体验。新的操作会建立新记录。'); }
        }
      } catch { if (!cancelled) setNotice('暂时读不到本地进度，已进入初次体验。新的操作会重试保存。'); }
      if (cancelled) return;
      // Do not overwrite a failed read or invalid save merely by mounting the app.
      lastRequested.current = encodePlay(restored);
      latest.current = lastRequested.current;
      updatePlay(restored); setSaveStatus('本地进度就绪'); setReady(true);
    })();
    return () => { cancelled = true; alive.current = false; };
  }, []);
  const encoded = useMemo(() => {
    try { return encodePlay(play); } catch { return null; }
  }, [play]);
  useEffect(() => {
    if (!ready || encoded === null) return;
    const json = encoded;
    latest.current = json;
    if (lastRequested.current === json) return;
    lastRequested.current = json;
    dirty.current = true;
    write(json).then(ok => {
      if (alive.current && latest.current === json) setSaveStatus(ok ? '已保存在本机' : '保存失败，下次操作重试');
    });
  }, [encoded, ready]);
  useEffect(() => {
    if (!ready) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && dirty.current && latest.current) {
        const json = latest.current;
        write(json).then(ok => { if (alive.current && latest.current === json) setSaveStatus(ok ? '已保存在本机' : '保存失败，下次操作重试'); });
      }
    });
    return () => subscription.remove();
  }, [ready]);
  function setPlay(next: PlayState) {
    updatePlay(next); setNotice('');
  }
  return { play, setPlay, ready, notice, saveStatus: encoded === null ? '本次进度过长，未保存' : saveStatus };
}
