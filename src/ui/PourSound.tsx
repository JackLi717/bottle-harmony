import { useCallback, useEffect, useMemo } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useAnimatedReaction, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { FLOW_START, POUR_DURATION_MS, streamOpacity } from '../art/pourGeometry';
import { pourAudioClip, VESSEL_AUDIO, type PourAudioClip, type ReceiverFillBand } from '../art/pourAudio';
import type { VesselId } from '../art/vesselDesigns';
import { prepareGameAudio } from './gameAudio';
import { createPourSoundGate } from './pourSoundGate';

const CLIPS: Record<PourAudioClip, number> = {
  'neck-low': require('../../assets/audio/pour/neck-low.wav'),
  'neck-mid': require('../../assets/audio/pour/neck-mid.wav'),
  'neck-high': require('../../assets/audio/pour/neck-high.wav'),
  'flask-low': require('../../assets/audio/pour/flask-low.wav'),
  'flask-mid': require('../../assets/audio/pour/flask-mid.wav'),
  'flask-high': require('../../assets/audio/pour/flask-high.wav'),
  'slender-low': require('../../assets/audio/pour/slender-low.wav'),
  'slender-mid': require('../../assets/audio/pour/slender-mid.wav'),
  'slender-high': require('../../assets/audio/pour/slender-high.wav'),
  'straight-low': require('../../assets/audio/pour/straight-low.wav'),
  'straight-mid': require('../../assets/audio/pour/straight-mid.wav'),
  'straight-high': require('../../assets/audio/pour/straight-high.wav'),
  'bowl-low': require('../../assets/audio/pour/bowl-low.wav'),
  'bowl-mid': require('../../assets/audio/pour/bowl-mid.wav'),
  'bowl-high': require('../../assets/audio/pour/bowl-high.wav'),
  'shallow-low': require('../../assets/audio/pour/shallow-low.wav'),
  'shallow-mid': require('../../assets/audio/pour/shallow-mid.wav'),
  'shallow-high': require('../../assets/audio/pour/shallow-high.wav'),
};
type Props = { progress: SharedValue<number>; pouring: boolean; enabled: boolean; vessel: VesselId; receiverLayers: number };

const BANDS: readonly ReceiverFillBand[] = ['low', 'mid', 'high'];

/** Keep this vessel family's three short clips ready before a move chooses one. */
export function PourSound({ vessel, receiverLayers, ...props }: Props) {
  const clip = pourAudioClip(vessel, receiverLayers);
  return <>{BANDS.map(band => {
    const candidate: PourAudioClip = `${VESSEL_AUDIO[vessel]}-${band}`;
    return <PourClip key={candidate} clip={candidate} {...props} pouring={props.pouring && candidate === clip} />;
  })}</>;
}

function PourClip({ progress, pouring, enabled, clip }: Omit<Props, 'vessel' | 'receiverLayers'> & { clip: PourAudioClip }) {
  const player = useAudioPlayer(CLIPS[clip], { updateInterval: 1000 });
  const { isLoaded } = useAudioPlayerStatus(player);
  const available = useSharedValue(false);
  // Seeking briefly changes ExoPlayer READY to BUFFERING. Once this fixed local
  // asset has loaded, that transient status must not toggle the visible-flow cue.
  useEffect(() => { if (isLoaded) available.set(true); }, [isLoaded, available]);
  const gate = useMemo(() => createPourSoundGate({ prepare: prepareGameAudio, rewind: () => player.seekTo(0),
    available: () => {
      // A small local file can become ready before the status hook subscribes.
      // Read native readiness while lifting rather than waiting for a lost event.
      if (!available.get() && player.isLoaded) available.set(true);
      return available.get();
    }, skipLate: true,
    play: () => { if (streamOpacity(progress.get()) > 0) player.play(); }, stop: () => player.pause() }), [player, progress, available]);
  const flowChanged = useCallback((next: boolean) => gate.setFlow(next), [gate]);
  useEffect(() => {
    // Expo AudioPlayer is a mutable native SharedObject with a documented volume setter.
    // eslint-disable-next-line react-hooks/immutability
    player.volume = .75;
    void prepareGameAudio().catch(() => {});
    return () => gate.dispose();
  }, [gate, player]);
  useEffect(() => { if (!enabled || !pouring) gate.setFlow(false); }, [enabled, pouring, gate]);
  useEffect(() => {
    // Prepare while idle as well as lifting. Selecting a receiver's fill band
    // must not create a new player or wait for a cold load at flow entry.
    if (enabled) {
      if (gate.arm()) return;
      // Native readiness may precede the hook's subscription. Preparation never
      // starts sound: only the visible-flow edge can do that.
      const retry = setInterval(() => { if (gate.arm()) clearInterval(retry); }, 25);
      const deadline = setTimeout(() => clearInterval(retry), pouring ? FLOW_START * POUR_DURATION_MS : 2000);
      return () => { clearInterval(retry); clearTimeout(deadline); };
    }
  }, [enabled, pouring, isLoaded, gate]);
  useAnimatedReaction(() => ({ visible: pouring && streamOpacity(progress.value) > 0, enabled }), (current, previous) => {
    if (!current.visible || !current.enabled) {
      if (previous?.visible && previous.enabled) scheduleOnRN(flowChanged, false);
    } else if (!previous?.visible) scheduleOnRN(flowChanged, true);
    // Loading or unmuting midway through a stream must not trigger a late cue.
  }, [enabled, pouring, flowChanged]);
  return null;
}
