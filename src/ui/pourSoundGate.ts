type Port = { prepare: () => Promise<void>; rewind: () => Promise<void>; play: () => void; stop: () => void;
  available?: () => boolean; skipLate?: boolean };

/** Prepare during the lift, then invalidate queued work when flow or its owner ends. */
export function createPourSoundGate(port: Port) {
  let alive = true, flowing = false, generation = 0, preparation = 0;
  let cue: Promise<void> | null = null;
  let prepared = false;
  function arm() {
    if (!alive) return false;
    if (cue) return true;
    if (port.available?.() === false) return false;
    const token = ++preparation;
    cue = (async () => {
      await port.prepare();
      if (alive && token === preparation) {
        await port.rewind();
        if (alive && token === preparation) prepared = true;
      }
    })();
    // Preparation may finish without a visible flow (cancel/mute/background).
    void cue.catch(() => {});
    return true;
  }
  async function start(token: number, ready: Promise<void>) {
    try {
      await ready;
      if (alive && flowing && token === generation) port.play();
    } catch { /* Audio failure never changes an accepted game move. */ }
  }
  return {
    arm,
    setFlow(next: boolean) {
      if (!alive || (next === flowing && (next || !cue))) return;
      const wasFlowing = flowing;
      flowing = next;
      const token = ++generation;
      if (next) {
        arm();
        if (cue && port.available?.() !== false && (!port.skipLate || prepared)) void start(token, cue);
      }
      else { preparation++; cue = null; prepared = false; if (wasFlowing) port.stop(); }
    },
    // useAudioPlayer releases the native player first; cleanup must not call it again.
    dispose() { alive = false; flowing = false; generation++; preparation++; cue = null; prepared = false; },
  };
}
