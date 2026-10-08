import { useState } from 'react';
import { getPlayer } from '../storage/runtime';
export function useSoundPreference() {
  const [sound, setSound] = useState(() => getPlayer().preference('sound') === 'true');
  const [saved, setSaved] = useState(true);
  function toggleSound() {
    const next = !sound; setSound(next);
    void getPlayer().setPreference('sound', String(next)).then(setSaved);
  }
  return { sound, ready: true, saved, toggleSound };
}
