import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createProgressWriter } from '../storage/progressWriter';

const KEY = 'bottle-harmony.sound.v1';
const write = createProgressWriter(value => AsyncStorage.setItem(KEY, value));
export function useSoundPreference() {
  const [sound, setSound] = useState(true);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY).then(value => { if (alive) setSound(value !== 'false'); }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  function toggleSound() {
    const next = !sound;
    setSound(next);
    void write(String(next)).then(setSaved);
  }
  return { sound, ready, saved, toggleSound };
}
