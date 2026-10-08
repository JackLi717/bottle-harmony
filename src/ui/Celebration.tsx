import { prepareGameAudio } from './gameAudio';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { Fireworks } from '../art/Fireworks';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { finaleGlow } from '../art/pourPresentation';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const AUDIO = {
  2: require('../../assets/audio/fireworks-2.wav'),
  3: require('../../assets/audio/fireworks-3.wav'),
  4: require('../../assets/audio/fireworks-4.wav'),
  5: require('../../assets/audio/fireworks-5.wav'),
};
/** Transparent stage overlay: completed glass and corks remain in their original positions. */
export function Celebration({ count, width, height, sound, accent = '#B8F7E2', onComplete }: { count: 2 | 3 | 4 | 5; width: number; height: number; sound: boolean; accent?: string; onComplete: () => void }) {
  const player = useAudioPlayer(sound ? AUDIO[count] : null);
  const settling = useSharedValue(0);
  const glow = useAnimatedProps(() => ({ opacity: finaleGlow(settling.value) }));
  useEffect(() => {
    settling.set(0);
    settling.set(withTiming(1, { duration: 620, easing: Easing.linear }));
    return () => cancelAnimation(settling);
  }, [settling]);
  useEffect(() => {
    let active = true;
    if (sound) {
      void prepareGameAudio().then(() => {
        if (active) { player.volume = .65; player.play(); }
      }).catch(() => {});
    }
    // The audio hook owns release. Calling pause here would touch an already released object.
    return () => { active = false; };
  }, [sound, player]);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs><RadialGradient id="finale-glow" cx="50%" cy="50%" rx="50%" ry="50%">
        <Stop offset="0" stopColor={accent} /><Stop offset="1" stopColor={accent} stopOpacity={0} />
      </RadialGradient></Defs>
      <AnimatedEllipse cx={width / 2} cy={height * .55} rx={width * .46} ry={Math.min(height * .3, width * .44)} fill="url(#finale-glow)" animatedProps={glow} />
    </Svg>
    <Fireworks count={count} width={width} height={height} onComplete={onComplete} />
  </View>;
}
