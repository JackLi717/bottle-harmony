import { memo } from 'react';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import type { ColorId, Pour } from '../game/rules';
import { liquidPath } from './liquidGeometry';
import { LIQUIDS, LIQUID_SYMBOLS } from './palette';
import { BOTTLE_INSIDE, BOTTLE_SHELL } from './bottleDesign';
import type { Point } from './liquidGeometry';
import { sourcePose, streamOpacity, transferredFraction, type PourPlan } from './pourGeometry';
import { COMPLETION_DURATION, completionPose, completionVisible, shouldCelebrateCompletion, type CompletionEffect } from './bottleCompletion';
import { BottleCelebration } from './BottleCelebration';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedG = Animated.createAnimatedComponent(G);

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

/** Gradients and the glass clip never change when a slot receives a new level. */
const BottleDefinitions = memo(function BottleDefinitions({ id }: { id: string }) {
  return (
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
      <LinearGradient id={`${id}-cork`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#93683D" />
        <Stop offset="0.22" stopColor="#D4AD76" />
        <Stop offset="0.48" stopColor="#E9CCA0" />
        <Stop offset="0.8" stopColor="#BF935E" />
        <Stop offset="1" stopColor="#866039" />
      </LinearGradient>
      <LinearGradient id={`${id}-neck-glass`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#97D7DE" stopOpacity={0.44} />
        <Stop offset="0.25" stopColor="#AEDEE2" stopOpacity={0.16} />
        <Stop offset="0.7" stopColor="#173747" stopOpacity={0.24} />
        <Stop offset="1" stopColor="#80B7CE" stopOpacity={0.4} />
      </LinearGradient>
      <RadialGradient id={`${id}-completion-glow`} cx="50%" cy="50%" rx="50%" ry="50%">
        <Stop offset="0" stopColor="#FFF5D7" stopOpacity={0.24} />
        <Stop offset="0.45" stopColor="#F4DBA0" stopOpacity={0.2} />
        <Stop offset="0.75" stopColor="#E8CB8C" stopOpacity={0.09} />
        <Stop offset="1" stopColor="#E8CB8C" stopOpacity={0} />
      </RadialGradient>
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
  );
});

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
  symbols?: boolean;
  completionEffect?: CompletionEffect;
  completionScene?: string;
  completionReplay?: number;
  completionAnimations?: boolean;
};

/** Glass art remains static; liquid paths and transforms update on the UI thread. */
export const Bottle = memo(function Bottle({ index, colors, selected, completed, width, scale, plan, pour, progress, position, symbols = false, completionEffect = 'gold', completionScene = 'preview', completionReplay = 0, completionAnimations = true }: BottleProps) {
  const isSource = pour?.source === index;
  const isTarget = pour?.target === index;
  const id = `bottle-${index}`;
  const angle = useDerivedValue(() => isSource && plan ? sourcePose(plan, progress.value).angle : 0);
  const count = useDerivedValue(() => {
    const transferred = pour ? transferredFraction(progress.value) * pour.amount : 0;
    return colors.length + (isSource ? -transferred : isTarget ? transferred - (pour?.amount ?? 0) : 0);
  });
  const complete = useDerivedValue(() => completionVisible(completed, count.value));
  const completionTimeline = useSharedValue(1);
  useAnimatedReaction(() => ({ complete: complete.value, scene: completionScene, effect: completionEffect, replay: completionReplay, enabled: completionAnimations }), (current, previous) => {
    if (shouldCelebrateCompletion(current, previous)) {
      completionTimeline.value = 0;
      completionTimeline.value = withTiming(1, { duration: COMPLETION_DURATION, easing: Easing.linear });
    } else if (!current.complete || !current.enabled || current.scene !== previous?.scene) {
      cancelAnimation(completionTimeline);
      completionTimeline.value = 1;
    }
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
  const shell = useAnimatedProps(() => {
    const finished = complete.value;
    return {
      stroke: finished ? '#E8CB8C' : selected ? '#B8F7E2' : '#82B1C4',
      strokeOpacity: selected || finished ? 0.95 : 0.65,
      strokeWidth: selected ? 2.1 : finished ? 1.8 : 1.3,
    };
  });
  const completion = useAnimatedProps(() => ({ opacity: complete.value ? 1 : 0 }));
  const cork = useAnimatedProps(() => {
    const pose = completionPose(completionTimeline.value);
    return { opacity: complete.value ? pose.corkOpacity : 0, matrix: [1, 0, 0, 1, 0, pose.corkY] };
  });

  return (
    <Animated.View pointerEvents="none" style={[{ width, height: width * 1.8, position: 'absolute', left: position.x * scale, top: (position.y - (selected ? 12 : 0)) * scale, zIndex: isSource ? 10 : 2 }, style]}>
      <Svg width="100%" height={width * 2.2} style={{ position: 'absolute', top: -40 * scale }} viewBox="0 -40 100 220">
        <BottleDefinitions id={id} />
        <BottleCelebration timeline={completionTimeline} complete={complete} id={id} />
        {completionEffect === 'halo' && <AnimatedG animatedProps={completion}>
          <Ellipse cx={50} cy={170} rx={34} ry={7} fill="#E8CB8C" opacity={0.12} />
          <Ellipse cx={50} cy={170} rx={32} ry={5} fill="none" stroke="#E8CB8C" strokeWidth={1.4} opacity={0.8} />
          <Path d="M50 7 V17 M45 12 H55 M23 47 V53 M20 50 H26 M77 47 V53 M74 50 H80" fill="none" stroke="#F5DEAD" strokeWidth={1.2} strokeLinecap="round" />
        </AnimatedG>}
        <AnimatedPath d={BOTTLE_SHELL} fill={`url(#${id}-glass)`} animatedProps={shell} />
        <G clipPath={`url(#${id}-inside)`}>
          {[...colors].map((color, layer) => {
            let firstLayer = layer;
            while (firstLayer > 0 && colors[firstLayer - 1] === color) firstLayer--;
            return { color, layer, firstLayer };
          }).filter(({ color, layer }) => colors[layer + 1] !== color).reverse().map(({ color, layer, firstLayer }) => (
            <LiquidLayer key={layer} color={color} layer={layer} firstLayer={firstLayer} count={count} angle={angle} id={id} />
          ))}
          {symbols && !isSource && !isTarget && colors.map((color, layer) => <SvgText key={`symbol-${layer}`} x={50} y={155 - layer * 24} textAnchor="middle" fontSize={16} fill="#142F39" opacity={0.8}>{LIQUID_SYMBOLS[color]}</SvgText>)}
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
        {completionEffect === 'cork' && <AnimatedG animatedProps={cork}>
          {/* One tapered plug moves as a whole: its lower half enters the neck. */}
          <Path d="M38 18 Q50 14 62 18 L59.5 44 Q50 48 40.5 44 Z" fill={`url(#${id}-cork)`} stroke="#A78150" strokeWidth={0.65} />
          <Path d="M41 21 L43 42" stroke="#FFF0CB" strokeWidth={1.2} strokeOpacity={0.4} strokeLinecap="round" />
          <Path d="M44 23 L44.5 27 M53 21 L53 25 M57 26 L56.5 31 M47 34 L47.5 40 M54 37 L54 42" fill="none" stroke="#805B33" strokeOpacity={0.36} strokeWidth={0.8} strokeLinecap="round" />
          <Path d="M43 30 H44 M50 28 H51.5 M56 34 H57 M44 41 H45 M51 44 H52" stroke="#815C35" strokeOpacity={0.38} strokeWidth={0.7} strokeLinecap="round" />
          <Ellipse cx={50} cy={18} rx={12} ry={3.1} fill="#E9CDA0" stroke="#B9915D" strokeWidth={0.7} />
          <Ellipse cx={50} cy={17.6} rx={8.4} ry={1.6} fill="none" stroke="#F8E3BA" strokeWidth={0.7} opacity={0.7} />
        </AnimatedG>}
        {completionEffect === 'cork' && <AnimatedG animatedProps={completion}>
          {/* Glass and the front lip cover the inserted portion, never the hovering cork. */}
          <Path d="M38 32 H62 V42 Q65 45 68 49 H32 Q35 45 38 42 Z" fill={`url(#${id}-neck-glass)`} />
          <Path d="M38.5 34 V41 M61.5 34 V41" stroke="#D5F1EB" strokeWidth={1} strokeOpacity={0.35} strokeLinecap="round" />
          <Path d="M33 28 A17 5.8 0 0 0 67 28" fill="none" stroke="#294B5D" strokeWidth={3.3} />
          <Path d="M33 28 A17 5.8 0 0 0 67 28" fill="none" stroke={`url(#${id}-rim)`} strokeWidth={1.7} />
          <Path d="M37 31 Q50 35.3 63 31" fill="none" stroke="#E4EFD9" strokeWidth={0.7} strokeOpacity={0.75} />
        </AnimatedG>}
        <AnimatedPath animatedProps={spout} fill="none" stroke={flowColor.main} strokeWidth={3.5} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
});
