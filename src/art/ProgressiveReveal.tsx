import { Platform } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { G, Path, Text as SvgText } from 'react-native-svg';
import type { LiquidLayerFrame } from './liquidPresentation';
import { CLASSIC_UNKNOWN_FILL, revealOpacity } from './unlockPresentation';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);
const IS_WEB = Platform.OS === 'web';
function RevealLayer({ layer, liquid, progress }: { layer: number; liquid: SharedValue<LiquidLayerFrame[]>; progress: SharedValue<number> }) {
  const path = useAnimatedProps(() => ({ d: liquid.value[layer]?.path ?? '', opacity: revealOpacity(progress.value) }));
  const symbol = useAnimatedProps(() => {
    const pose = liquid.value[layer]?.symbol;
    if (!pose) return { opacity: 0 };
    const angle = pose.rotation * Math.PI / 180, scale = pose.size / 16;
    const matrix = [Math.cos(angle) * scale, Math.sin(angle) * scale, -Math.sin(angle) * scale, Math.cos(angle) * scale, pose.x, pose.y];
    return { opacity: pose.opacity * revealOpacity(progress.value), ...(IS_WEB ? { transform: 'matrix(' + matrix.join(' ') + ')' } : { matrix }) };
  });
  return <G><AnimatedPath animatedProps={path} fill={CLASSIC_UNKNOWN_FILL} />
    <AnimatedG animatedProps={symbol}><SvgText y={5.6} fontSize={16} textAnchor="middle" fill="#EAF0F5">?</SvgText></AnimatedG>
  </G>;
}
/** Independent portion paths prevent a newly seen same-color neighbor merging before disclosure. */
export function ProgressiveReveal({ layers, liquid, progress }: { layers: readonly boolean[]; liquid: SharedValue<LiquidLayerFrame[]>; progress: SharedValue<number> }) {
  return <G>{layers.map((reveal, i) => reveal ? <RevealLayer key={i} layer={i} liquid={liquid} progress={progress} /> : null)}</G>;
}
