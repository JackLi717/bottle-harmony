import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { Fireworks } from '../art/Fireworks';

const AUDIO = {
  2: require('../../assets/audio/fireworks-2.wav'),
  3: require('../../assets/audio/fireworks-3.wav'),
  4: require('../../assets/audio/fireworks-4.wav'),
  5: require('../../assets/audio/fireworks-5.wav'),
};
/** Transparent stage overlay: completed glass and corks remain in their original positions. */
export function Celebration({ count, width, height, sound, onComplete }: { count: 2 | 3 | 4 | 5; width: number; height: number; sound: boolean; onComplete: () => void }) {
  const player = useAudioPlayer(sound ? AUDIO[count] : null);
  useEffect(() => {
    let active = true;
    if (sound) {
      void setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers', allowsRecording: false }).then(() => {
        if (active) { player.volume = .65; player.play(); }
      }).catch(() => {});
    }
    // The audio hook owns release. Calling pause here would touch an already released object.
    return () => { active = false; };
  }, [sound, player]);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Fireworks count={count} width={width} height={height} onComplete={onComplete} />
  </View>;
}
