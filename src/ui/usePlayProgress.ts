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
      let restored = createMainline(MAINLINE);
      try {
        const json = await AsyncStorage.getItem(MAINLINE_SAVE_KEY);
        if (!json && await AsyncStorage.getItem('bottle-harmony.play.v1') && !cancelled) setNotice('已升级为千关主线，从第一关开始解锁。');
        if (json) {
          try { restored = decodeMainline(json, MAINLINE); }
          catch { if (!cancelled) setNotice('保存记录无法恢复，已回到初次体验。新的操作会建立新记录。'); }
        }
      } catch { if (!cancelled) setNotice('暂时读不到本地进度，已进入初次体验。新的操作会重试保存。'); }
      if (cancelled) return;
      // Do not overwrite a failed read or invalid save merely by mounting the app.
      lastRequested.current = encodeMainline(restored, MAINLINE);
      latest.current = lastRequested.current;
      updatePlay(restored); setSaveStatus('本地进度就绪'); setReady(true);
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
  function setPlay(next: MainlineState) {
    updatePlay(next); setNotice('');
  }
  return { play, setPlay, ready, notice, saveStatus: encoded === null ? '本次进度过长，未保存' : saveStatus };
}
