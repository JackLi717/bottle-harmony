type Port = { prepare: () => Promise<void>; rewind: () => Promise<void>; play: () => void; stop: () => void };

/** Prepare during the lift, then invalidate queued work when flow or its owner ends. */
export function createPourSoundGate(port: Port) {
  let alive = true, flowing = false, generation = 0, preparation = 0;
  let cue: Promise<void> | null = null;
  function arm() {
    if (!alive || cue) return;
    const token = ++preparation;
    cue = (async () => {
      await port.prepare();
      if (alive && token === preparation) await port.rewind();
    })();
    // Preparation may finish without a visible flow (cancel/mute/background).
    void cue.catch(() => {});
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
      if (next) { arm(); void start(token, cue!); }
      else { preparation++; cue = null; if (wasFlowing) port.stop(); }
    },
    // useAudioPlayer releases the native player first; cleanup must not call it again.
    dispose() { alive = false; flowing = false; generation++; preparation++; cue = null; },
  };
}
