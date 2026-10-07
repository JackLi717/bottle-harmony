import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_VESSEL, vesselFor, type VesselId } from '../art/vesselDesigns';
import { createProgressWriter } from '../storage/progressWriter';
import { parseVesselPreference, VESSEL_PREFERENCE_KEY } from '../storage/vesselPreference';

const write = createProgressWriter(value => AsyncStorage.setItem(VESSEL_PREFERENCE_KEY, value));
export function useVesselPreference() {
  const [id, setId] = useState<VesselId>(DEFAULT_VESSEL.id);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const chosen = useRef<VesselId | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(VESSEL_PREFERENCE_KEY)
      .then(value => { if (alive) setId(parseVesselPreference(value)); })
      .catch(() => {})
      .finally(() => { if (alive) setReady(true); });
    const subscription = AppState.addEventListener('change', () => {
      if (!chosen.current) return;
      const current = revision.current;
      void write(chosen.current).then(ok => { if (alive && current === revision.current) setSaved(ok); });
    });
    return () => { alive = false; subscription.remove(); };
  }, []);
  function chooseVessel(next: VesselId) {
    if (!ready) return;
    chosen.current = next;
    const current = ++revision.current;
    setId(next);
    void write(next).then(ok => { if (current === revision.current) setSaved(ok); });
  }
  return { vessel: vesselFor(id), ready, saved, chooseVessel };
}
