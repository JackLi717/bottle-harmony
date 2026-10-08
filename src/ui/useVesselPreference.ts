import { useRef, useState } from 'react';
import { vesselFor, type VesselId } from '../art/vesselDesigns';
import { getPlayer } from '../storage/runtime';
export function useVesselPreference() {
  const [id, setId] = useState(() => vesselFor(getPlayer().preference('vessel')).id);
  const [saved, setSaved] = useState(true);
  const revision = useRef(0);
  function chooseVessel(next: VesselId) {
    const current = ++revision.current; setId(next);
    void getPlayer().setPreference('vessel', next).then(ok => { if (current === revision.current) setSaved(ok); });
  }
  return { vessel: vesselFor(id), ready: true, saved, chooseVessel };
}
