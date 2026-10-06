import { memo } from 'react';
import Animated, { useAnimatedProps, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, Stop } from 'react-native-svg';
import type { ColorId, Pour } from '../game/rules';
import { liquidPath } from './liquidGeometry';
import { LIQUIDS } from './palette';
import { BOTTLE_INSIDE, BOTTLE_SHELL } from './bottleDesign';
import type { Point } from './liquidGeometry';
import { sourcePose, streamOpacity, transferredFraction, type PourPlan } from './pourGeometry';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

type LiquidLayerProps = {
  color: ColorId;
  layer: number;
  firstLayer: number;
  count: SharedValue<number>;
  angle: SharedValue<number>;
  id: string;
};

function LiquidLayer({ color, layer, firstLayer, count, angle, id }: LiquidLayerProps) {
  const props = useAnimatedProps(() => ({
    d: liquidPath(Math.min(layer + 1, count.value), angle.value),
    opacity: count.value > firstLayer ? 1 : 0,
  }));
  return <AnimatedPath animatedProps={props} fill={`url(#${id}-${color})`} stroke="#FFFFFF" strokeOpacity={0.075} strokeWidth={0.5} />;
}

export type BottleProps = {
  index: number;
  colors: readonly ColorId[];
  selected: boolean;
  completed: boolean;
  width: number;
  scale: number;
  plan: PourPlan | null;
  position: Point;
  pour: Pour | null;
  progress: SharedValue<number>;
};

/** Glass art remains static; liquid paths and transforms update on the UI thread. */
export const Bottle = memo(function Bottle({ index, colors, selected, completed, width, scale, plan, pour, progress, position }: BottleProps) {
  const isSource = pour?.source === index;
  const isTarget = pour?.target === index;
  const id = `bottle-${index}`;
  const angle = useDerivedValue(() => isSource && plan ? sourcePose(plan, progress.value).angle : 0);
  const count = useDerivedValue(() => {
    const transferred = pour ? transferredFraction(progress.value) * pour.amount : 0;
    return colors.length + (isSource ? -transferred : isTarget ? transferred - (pour?.amount ?? 0) : 0);
  });
  const style = useAnimatedStyle(() => {
    // Calculate one complete pose here; do not wait for a separate derived
    // position to catch up when Android receives the source/plan props.
    const pose = isSource && plan ? sourcePose(plan, progress.value) : null;
    return {
      left: (position.x + (pose?.dx ?? 0)) * scale,
      top: (position.y + (pose?.dy ?? (selected ? -12 : 0))) * scale,
      transform: [{ rotate: `${pose?.angle ?? 0}deg` }],
    };
  });
  const surface = useAnimatedProps(() => ({
    cy: 162 - 24 * count.value,
    opacity: count.value > 0 && Math.abs(angle.value) < 8 ? 0.4 : 0,
  }));
  const innerStream = useAnimatedProps(() => ({
    d: `M50,28 L50,${162 - 24 * count.value}`,
    opacity: isTarget ? streamOpacity(progress.value) * 0.9 : 0,
  }));
  const splash = useAnimatedProps(() => ({
    cy: 162 - 24 * count.value,
    rx: 4 + Math.sin(progress.value * 90) * 0.8,
    opacity: isTarget ? streamOpacity(progress.value) * 0.55 : 0,
  }));
  const spout = useAnimatedProps(() => ({
    d: `M${50 + (plan?.direction ?? 1) * 12},34 L${50 + (plan?.direction ?? 1) * 12},28`,
    opacity: isSource ? streamOpacity(progress.value) : 0,
  }));
  const flowColor = pour ? LIQUIDS[pour.color] : LIQUIDS.jade;

  return (
    <Animated.View pointerEvents="none" style={[{ width, height: width * 1.8, position: 'absolute', left: position.x * scale, top: (position.y - (selected ? 12 : 0)) * scale, zIndex: isSource ? 10 : 2 }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 180">
        <Defs>
          <LinearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#63B4C0" stopOpacity={0.34} />
            <Stop offset="0.2" stopColor="#C0E7E7" stopOpacity={0.09} />
            <Stop offset="0.7" stopColor="#091C35" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#83BBD2" stopOpacity={0.26} />
          </LinearGradient>
          <LinearGradient id={`${id}-rim`} x1="0" y1="0" x2="0.8" y2="1">
            <Stop offset="0" stopColor="#F2F1CE" />
            <Stop offset="0.4" stopColor="#8EC5CE" />
            <Stop offset="1" stopColor="#315670" />
          </LinearGradient>
          {Object.keys(LIQUIDS).map(color => (
            <LinearGradient key={color} id={`${id}-${color}`} x1="0" y1="0" x2="1" y2="0.45">
              <Stop offset="0" stopColor={LIQUIDS[color].dark} />
              <Stop offset="0.22" stopColor={LIQUIDS[color].main} />
              <Stop offset="0.7" stopColor={LIQUIDS[color].main} />
              <Stop offset="1" stopColor={LIQUIDS[color].dark} />
            </LinearGradient>
          ))}
          <ClipPath id={`${id}-inside`}><Path d={BOTTLE_INSIDE} /></ClipPath>
        </Defs>
        <Path d={BOTTLE_SHELL} fill={`url(#${id}-glass)`} stroke={completed ? '#E8CB8C' : selected ? '#B8F7E2' : '#82B1C4'} strokeOpacity={selected || completed ? 0.95 : 0.65} strokeWidth={selected ? 2.1 : 1.3} />
        <G clipPath={`url(#${id}-inside)`}>
          {[...colors].map((color, layer) => {
            let firstLayer = layer;
            while (firstLayer > 0 && colors[firstLayer - 1] === color) firstLayer--;
            return { color, layer, firstLayer };
          }).filter(({ color, layer }) => colors[layer + 1] !== color).reverse().map(({ color, layer, firstLayer }) => (
            <LiquidLayer key={layer} color={color} layer={layer} firstLayer={firstLayer} count={count} angle={angle} id={id} />
          ))}
          <AnimatedEllipse cx={50} rx={27.5} ry={3.5} fill="#FFFFFF" animatedProps={surface} />
          <AnimatedPath animatedProps={innerStream} fill="none" stroke={flowColor.main} strokeWidth={3.3} strokeLinecap="round" />
          <AnimatedPath animatedProps={innerStream} fill="none" stroke={flowColor.light} strokeWidth={0.9} strokeLinecap="round" />
          <AnimatedEllipse cx={50} ry={1.8} fill={flowColor.light} animatedProps={splash} />
        </G>
        <Path d="M31 62 Q27 68 27 77 V147 Q27 155 33 157" fill="none" stroke="#E9FFFF" strokeWidth={2.8} strokeOpacity={0.25} strokeLinecap="round" />
        <Path d="M73 80 V142" fill="none" stroke="#DEF6F7" strokeWidth={1.4} strokeOpacity={0.11} strokeLinecap="round" />
        <Path d="M40 42 Q38 49 30 55" fill="none" stroke="#F0FFFF" strokeWidth={1.8} strokeOpacity={0.24} strokeLinecap="round" />
        <Path d="M27 162 Q50 169 73 162" fill="none" stroke="#9FDEDC" strokeWidth={1.7} strokeOpacity={0.48} />
        <Ellipse cx={50} cy={28} rx={17} ry={5.8} fill="#183447" stroke={`url(#${id}-rim)`} strokeWidth={2.5} />
        <Ellipse cx={50} cy={28} rx={11.5} ry={3.3} fill="#081C2C" stroke="#72ACBC" strokeWidth={0.7} />
        <Path d="M34 27 Q50 19 66 27" fill="none" stroke="#EAF4E0" strokeWidth={1.1} strokeOpacity={0.75} />
        <AnimatedPath animatedProps={spout} fill="none" stroke={flowColor.main} strokeWidth={3.5} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
});
