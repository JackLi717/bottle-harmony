import { useMemo } from 'react';
import Animated, { useAnimatedProps, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { G, Path } from 'react-native-svg';
import { MEMORY_UNKNOWN_FILL, memoryRevealCover, memoryRevealPath } from './memoryPresentation';
import type { VesselGeometry } from './vesselDesigns';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Prepared during the last pour; uncovers the already merged real liquid at home. */
export function MemoryReveal({ layers, vessel, pourProgress, visibleLayers, progress }: { layers: readonly boolean[]; vessel: VesselGeometry; pourProgress: SharedValue<number>; visibleLayers: SharedValue<number>; progress: SharedValue<number> }) {
  const key = layers.map(Number).join('');
  const path = useMemo(() => memoryRevealPath([...key].map(n => n === '1'), vessel), [key, vessel]);
  // Subscribe SVG opacity to this boolean edge, not every frame of the last pour.
  const ready = useDerivedValue(() => pourProgress.value >= 1 && visibleLayers.value > 0);
  const cover = useAnimatedProps(() => ({ opacity: memoryRevealCover(ready.value ? 1 : 0, progress.value, 1).opacity }));
  const glow = useAnimatedProps(() => ({ opacity: memoryRevealCover(ready.value ? 1 : 0, progress.value, 1).glow }));
  return <G>
    <AnimatedPath d={path} fill={MEMORY_UNKNOWN_FILL} animatedProps={cover} />
    <AnimatedPath d={path} fill="#FFF3CE" animatedProps={glow} />
  </G>;
}
