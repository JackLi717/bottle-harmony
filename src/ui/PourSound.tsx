import { useCallback, useEffect, useMemo } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useAnimatedReaction, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { streamOpacity } from '../art/pourGeometry';
import { prepareGameAudio } from './gameAudio';
import { createPourSoundGate } from './pourSoundGate';

/** Preload once, then follow the same UI clock as the visible water stream. */
export function PourSound({ progress, pouring, enabled }: { progress: SharedValue<number>; pouring: boolean; enabled: boolean }) {
  const player = useAudioPlayer(require('../../assets/audio/water-pour.wav'), { updateInterval: 1000 });
  const { isLoaded } = useAudioPlayerStatus(player);
  const available = useSharedValue(false);
  // Seeking briefly changes ExoPlayer READY to BUFFERING. Once this fixed local
  // asset has loaded, that transient status must not toggle the visible-flow cue.
  useEffect(() => { if (isLoaded) available.set(true); }, [isLoaded, available]);
  const gate = useMemo(() => createPourSoundGate({ prepare: prepareGameAudio, rewind: () => player.seekTo(0),
    play: () => { if (streamOpacity(progress.get()) > 0) player.play(); }, stop: () => player.pause() }), [player, progress]);
  const flowChanged = useCallback((next: boolean) => gate.setFlow(next), [gate]);
  useEffect(() => {
    // Expo AudioPlayer is a mutable native SharedObject with a documented volume setter.
    // eslint-disable-next-line react-hooks/immutability
    player.volume = .75;
    void prepareGameAudio().catch(() => {});
    return () => gate.dispose();
  }, [gate, player]);
  useEffect(() => { if (enabled && pouring) gate.arm(); else gate.setFlow(false); }, [enabled, pouring, gate]);
  useAnimatedReaction(() => enabled && pouring && available.value && streamOpacity(progress.value) > 0, (flow, previous) => {
    if (flow !== previous) scheduleOnRN(flowChanged, flow);
  }, [enabled, pouring, flowChanged]);
  return null;
}
