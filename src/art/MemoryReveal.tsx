import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { memoryLayerGeometry, memoryRevealPose } from './memoryPresentation';
import type { VesselGeometry } from './vesselDesigns';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** Only mounted after the source is upright at home. Never changes liquid or knowledge. */
export function MemoryReveal({ layer, vessel, id, color, progress }: { layer: number; vessel: VesselGeometry; id: string; color: string; progress: SharedValue<number> }) {
  const { path, top, bottom } = memoryLayerGeometry(layer, vessel);
  const clip = `${id}-memory-reveal-${layer}`, light = `${clip}-light`;
  const height = Math.max(3, (bottom - top) * .3);
  const fill = useAnimatedProps(() => ({ opacity: memoryRevealPose(progress.value).colorOpacity }));
  const glow = useAnimatedProps(() => ({ opacity: memoryRevealPose(progress.value).glowOpacity }));
  const sweep = useAnimatedProps(() => {
    const pose = memoryRevealPose(progress.value);
    return { y: bottom - (bottom - top + height) * pose.sweep, opacity: pose.glowOpacity };
  });
  return <G clipPath={`url(#${clip})`}>
    <Defs>
      <ClipPath id={clip}><Path d={path} /></ClipPath>
      <LinearGradient id={light} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#FFF3CE" stopOpacity={0} />
        <Stop offset=".5" stopColor="#FFF3CE" stopOpacity={.7} />
        <Stop offset="1" stopColor="#FFF3CE" stopOpacity={0} />
      </LinearGradient>
    </Defs>
    <AnimatedPath d={path} fill={`url(#${id}-${color})`} opacity={0} animatedProps={fill} />
    <AnimatedRect x={0} width={100} height={height} fill={`url(#${light})`} opacity={0} animatedProps={sweep} />
    <AnimatedPath d={path} fill="none" stroke="#FFF0B6" strokeWidth={1.4} opacity={0} animatedProps={glow} />
  </G>;
}
