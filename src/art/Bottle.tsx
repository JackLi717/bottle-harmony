import { memo } from 'react';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import type { ColorId, Pour } from '../game/rules';
import { liquidPath, liquidSurface } from './liquidGeometry';
import { LIQUIDS, LIQUID_SYMBOLS } from './palette';
import { DEFAULT_VESSEL, vesselCompletionEffect, type VesselDesign } from './vesselDesigns';
import type { Point } from './liquidGeometry';
import { sourcePose, streamOpacity, transferredFraction, type PourPlan } from './pourGeometry';
import { COMPLETION_DURATION, completionPose, completionVisible, shouldCelebrateCompletion, type CompletionEffect } from './bottleCompletion';
import { BottleCelebration } from './BottleCelebration';
import { PourRipples } from './PourRipples';
import { corkContact, pourFocus, receiverResponse } from './pourPresentation';

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
  vessel: VesselDesign;
};

function LiquidLayer({ color, layer, firstLayer, count, angle, id, vessel }: LiquidLayerProps) {
  const props = useAnimatedProps(() => ({
    d: liquidPath(Math.min(layer + 1, count.value), angle.value, vessel),
    opacity: count.value > firstLayer ? 1 : 0,
  }));
  return <AnimatedPath animatedProps={props} fill={`url(#${id}-${color})`} stroke="#FFFFFF" strokeOpacity={0.075} strokeWidth={0.5} />;
}

/** Gradients and the glass clip never change when a slot receives a new level. */
const BottleDefinitions = memo(function BottleDefinitions({ id, vessel }: { id: string; vessel: VesselDesign }) {
  return (
    <Defs>
      <LinearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#63B4C0" stopOpacity={0.34} />
        <Stop offset="0.2" stopColor="#C0E7E7" stopOpacity={0.09} />
        <Stop offset="0.7" stopColor="#091C35" stopOpacity={0.08} />
        <Stop offset="1" stopColor={vessel.tint} stopOpacity={0.26} />
      </LinearGradient>
      <LinearGradient id={`${id}-rim`} x1="0" y1="0" x2="0.8" y2="1">
        <Stop offset="0" stopColor={vessel.warm ? '#FFF1CB' : '#F2F1CE'} />
        <Stop offset="0.4" stopColor={vessel.warm ? '#DCC08A' : '#8EC5CE'} />
        <Stop offset="1" stopColor={vessel.warm ? '#886740' : '#315670'} />
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
      <RadialGradient id={`${id}-color-glow`} cx="50%" cy="38%" rx="50%" ry="60%">
        <Stop offset="0" stopColor="#FFFFFF" stopOpacity={.65} />
        <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
      </RadialGradient>
      {Object.keys(LIQUIDS).map(color => (
        <LinearGradient key={color} id={`${id}-${color}`} x1="0" y1="0" x2="1" y2="0.45">
          <Stop offset="0" stopColor={LIQUIDS[color].dark} />
          <Stop offset="0.22" stopColor={LIQUIDS[color].main} />
          <Stop offset="0.7" stopColor={LIQUIDS[color].main} />
          <Stop offset="1" stopColor={LIQUIDS[color].dark} />
        </LinearGradient>
      ))}
      <ClipPath id={`${id}-inside`}><Path d={vessel.inside} /></ClipPath>
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
  vessel?: VesselDesign;
  frozenBottom?: boolean;
};

/** Glass art remains static; liquid paths and transforms update on the UI thread. */
export const Bottle = memo(function Bottle({ index, colors, selected, completed, width, scale, plan, pour, progress, position, symbols = false, completionEffect = 'gold', completionScene = 'preview', completionReplay = 0, completionAnimations = true, vessel = DEFAULT_VESSEL, frozenBottom = false }: BottleProps) {
  const isSource = pour?.source === index;
  const isTarget = pour?.target === index;
  const id = `bottle-${index}-${vessel.id}`;
  const effect = vesselCompletionEffect(vessel, completionEffect);
  const scene = `${completionScene}:${vessel.id}`;
  const mouth = vessel.mouth;
  const iceTop = liquidSurface(1, vessel).y;
  const iceBottom = liquidSurface(0, vessel).y;
  const iceMiddle = (iceTop + iceBottom) / 2;
  const iceRadius = Math.min(8, Math.max(3, (iceBottom - iceTop) * .28));
  const angle = useDerivedValue(() => isSource && plan ? sourcePose(plan, progress.value).angle : 0);
  const count = useDerivedValue(() => {
    const transferred = pour ? transferredFraction(progress.value) * pour.amount : 0;
    return colors.length + (isSource ? -transferred : isTarget ? transferred - (pour?.amount ?? 0) : 0);
  });
  const complete = useDerivedValue(() => completionVisible(completed, count.value));
  const completionTimeline = useSharedValue(1);
  useAnimatedReaction(() => ({ complete: complete.value, scene, effect, replay: completionReplay, enabled: completionAnimations }), (current, previous) => {
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
  const surfaceLevel = useDerivedValue(() => liquidSurface(count.value, vessel));
  const surface = useAnimatedProps(() => ({
    cy: surfaceLevel.value.y,
    rx: Math.max(0, surfaceLevel.value.halfWidth - .5),
    opacity: count.value > 0 && Math.abs(angle.value) < 8 ? 0.4 - receiverResponse(progress.value, isTarget && completionAnimations) * .22 : 0,
  }));
  const innerStream = useAnimatedProps(() => ({
    d: `M50,${mouth.y + 5} L50,${surfaceLevel.value.y}`,
    opacity: isTarget ? streamOpacity(progress.value) * 0.9 : 0,
  }));
  const splash = useAnimatedProps(() => ({
    cy: surfaceLevel.value.y,
    rx: Math.min(surfaceLevel.value.halfWidth, 4 + Math.sin(progress.value * 90) * 0.8),
    opacity: isTarget ? streamOpacity(progress.value) * 0.55 : 0,
  }));
  const impact = useAnimatedProps(() => {
    const response = receiverResponse(progress.value, isTarget && completionAnimations);
    const y = surfaceLevel.value.y;
    const radius = Math.min(6, Math.max(0, surfaceLevel.value.halfWidth - 1));
    return { d: `M${50 - radius},${y} Q50,${y + 2 * response} ${50 + radius},${y}`, opacity: response * .65 };
  });
  const colorGlow = useAnimatedProps(() => ({
    opacity: complete.value && completionAnimations ? completionPose(completionTimeline.value).glow * .23 : 0,
  }));
  const contact = useAnimatedProps(() => ({
    opacity: complete.value ? corkContact(completionTimeline.value, completionAnimations) * .65 : 0,
  }));
  const spout = useAnimatedProps(() => ({
    d: `M${50 + (plan?.direction ?? 1) * mouth.outlet},${mouth.y + 6} L${50 + (plan?.direction ?? 1) * mouth.outlet},${mouth.y}`,
    opacity: isSource ? streamOpacity(progress.value) : 0,
  }));
  const flowColor = pour ? LIQUIDS[pour.color] : LIQUIDS.jade;
  const shell = useAnimatedProps(() => {
    const finished = complete.value;
    const focus = pourFocus(progress.value, (isSource || isTarget) && completionAnimations);
    return {
      stroke: finished ? '#E8CB8C' : selected || focus > 0 ? '#B8F7E2' : vessel.edge,
      strokeOpacity: selected || finished ? 0.95 : 0.65 + focus * .25,
      strokeWidth: selected ? 2.1 : finished ? 1.8 : 1.3 + focus * .55,
    };
  });
  const completion = useAnimatedProps(() => ({ opacity: complete.value ? 1 : 0 }));
  const cork = useAnimatedProps(() => {
    const pose = completionPose(completionTimeline.value);
    const corkScale = (mouth.inner + .5) / 12;
    return { opacity: complete.value ? pose.corkOpacity : 0, matrix: [corkScale, 0, 0, 1, 50 * (1 - corkScale), mouth.y - 28 + pose.corkY] };
  });

  return (
    <Animated.View pointerEvents="none" style={[{ width, height: width * 1.8, position: 'absolute', left: position.x * scale, top: (position.y - (selected ? 12 : 0)) * scale, zIndex: isSource ? 10 : 2 }, style]}>
      <Svg width="100%" height={width * 2.2} style={{ position: 'absolute', top: -40 * scale }} viewBox="0 -40 100 220">
        <BottleDefinitions id={id} vessel={vessel} />
        <BottleCelebration timeline={completionTimeline} complete={complete} id={id} shell={vessel.shell} />
        {effect === 'halo' && <AnimatedG animatedProps={completion}>
          <Ellipse cx={50} cy={170} rx={34} ry={7} fill="#E8CB8C" opacity={0.12} />
          <Ellipse cx={50} cy={170} rx={32} ry={5} fill="none" stroke="#E8CB8C" strokeWidth={1.4} opacity={0.8} />
          <Path d="M50 7 V17 M45 12 H55 M23 47 V53 M20 50 H26 M77 47 V53 M74 50 H80" fill="none" stroke="#F5DEAD" strokeWidth={1.2} strokeLinecap="round" />
        </AnimatedG>}
        <AnimatedPath d={vessel.shell} fill={`url(#${id}-glass)`} animatedProps={shell} />
        <G clipPath={`url(#${id}-inside)`}>
          {[...colors].map((color, layer) => {
            let firstLayer = layer;
            while (firstLayer > 0 && colors[firstLayer - 1] === color) firstLayer--;
            return { color, layer, firstLayer };
          }).filter(({ color, layer }) => colors[layer + 1] !== color).reverse().map(({ color, layer, firstLayer }) => (
            <LiquidLayer key={layer} color={color} layer={layer} firstLayer={firstLayer} count={count} angle={angle} id={id} vessel={vessel} />
          ))}
          {frozenBottom && colors.length > 0 && <G>
            <Path d={liquidPath(1, 0, vessel)} fill="#C6F3FF" fillOpacity={0.35} stroke="#E8FCFF" strokeOpacity={0.8} strokeWidth={1.2} />
            <Path d={`M50 ${iceMiddle - iceRadius} V${iceMiddle + iceRadius} M${50 - iceRadius} ${iceMiddle} H${50 + iceRadius} M${50 - iceRadius * .7} ${iceMiddle - iceRadius * .7} L${50 + iceRadius * .7} ${iceMiddle + iceRadius * .7} M${50 + iceRadius * .7} ${iceMiddle - iceRadius * .7} L${50 - iceRadius * .7} ${iceMiddle + iceRadius * .7}`}
              fill="none" stroke="#F2FDFF" strokeOpacity={0.85} strokeWidth={1.5} strokeLinecap="round" />
          </G>}
          {symbols && !isSource && !isTarget && colors.map((color, layer) => {
            const bottom = liquidSurface(layer, vessel).y, top = liquidSurface(layer + 1, vessel).y;
            const size = Math.min(16, (bottom - top) * .7);
            return <SvgText key={`symbol-${layer}`} x={50} y={(bottom + top) / 2 + size * .35} textAnchor="middle" fontSize={size} fill="#142F39" opacity={0.8}>{LIQUID_SYMBOLS[color]}</SvgText>;
          })}
          <AnimatedEllipse cx={50} rx={24.5} ry={3.5} fill="#FFFFFF" animatedProps={surface} />
          <AnimatedPath animatedProps={innerStream} fill="none" stroke={flowColor.main} strokeWidth={3.3} strokeLinecap="round" />
          <AnimatedPath animatedProps={innerStream} fill="none" stroke={flowColor.light} strokeWidth={0.9} strokeLinecap="round" />
          <AnimatedEllipse cx={50} ry={1.8} fill={flowColor.light} animatedProps={splash} />
          {isTarget && completionAnimations && <PourRipples progress={progress} surface={surfaceLevel} enabled color="#F5FFFD" />}
          <AnimatedPath animatedProps={impact} fill="none" stroke={flowColor.light} strokeWidth={1.1} strokeLinecap="round" />
          <AnimatedPath d={vessel.inside} fill={colors[0] ? LIQUIDS[colors[0]].light : '#FFFFFF'} animatedProps={colorGlow} />
          <AnimatedPath d={vessel.inside} fill={`url(#${id}-color-glow)`} animatedProps={colorGlow} />
        </G>
        {vessel.highlights.map((detail, index) => <Path key={`highlight-${index}`} d={detail.path} fill="none" stroke="#E9FFFF" strokeWidth={detail.width ?? 1.2} strokeOpacity={detail.opacity ?? .3} strokeLinecap="round" strokeLinejoin="round" />)}
        {vessel.details.map((detail, index) => <Path key={`detail-${index}`} d={detail.path} fill={detail.glass ? `url(#${id}-glass)` : 'none'} stroke={detail.gold ? '#E5CA91' : `url(#${id}-rim)`} strokeWidth={detail.width ?? .9} opacity={detail.opacity ?? .55} strokeLinecap="round" strokeLinejoin="round" />)}
        <Ellipse cx={50} cy={mouth.y} rx={mouth.outer} ry={5.8} fill="#183447" fillOpacity={vessel.cork ? 1 : .3} stroke={`url(#${id}-rim)`} strokeWidth={vessel.cork ? 2.5 : 1.5} />
        <Ellipse cx={50} cy={mouth.y} rx={mouth.inner} ry={3.3} fill="#081C2C" fillOpacity={vessel.cork ? 1 : .35} stroke="#72ACBC" strokeWidth={0.7} />
        <Path d={`M${51 - mouth.outer} ${mouth.y - 1} Q50 ${mouth.y - 9} ${49 + mouth.outer} ${mouth.y - 1}`} fill="none" stroke="#EAF4E0" strokeWidth={1.1} strokeOpacity={0.75} />
        {effect === 'cork' && <AnimatedG opacity={completed ? 1 : 0} animatedProps={cork}>
          {/* One tapered plug moves as a whole: its lower half enters the neck. */}
          <Path d="M38 18 Q50 14 62 18 L59.5 44 Q50 48 40.5 44 Z" fill={`url(#${id}-cork)`} stroke="#A78150" strokeWidth={0.65} />
          <Path d="M41 21 L43 42" stroke="#FFF0CB" strokeWidth={1.2} strokeOpacity={0.4} strokeLinecap="round" />
          <Path d="M44 23 L44.5 27 M53 21 L53 25 M57 26 L56.5 31 M47 34 L47.5 40 M54 37 L54 42" fill="none" stroke="#805B33" strokeOpacity={0.36} strokeWidth={0.8} strokeLinecap="round" />
          <Path d="M43 30 H44 M50 28 H51.5 M56 34 H57 M44 41 H45 M51 44 H52" stroke="#815C35" strokeOpacity={0.38} strokeWidth={0.7} strokeLinecap="round" />
          <Ellipse cx={50} cy={18} rx={12} ry={3.1} fill="#E9CDA0" stroke="#B9915D" strokeWidth={0.7} />
          <Ellipse cx={50} cy={17.6} rx={8.4} ry={1.6} fill="none" stroke="#F8E3BA" strokeWidth={0.7} opacity={0.7} />
        </AnimatedG>}
        {effect === 'cork' && <AnimatedG animatedProps={completion}>
          {/* Glass and the front lip cover the inserted portion, never the hovering cork. */}
          <G clipPath={`url(#${id}-inside)`}><G transform={`translate(50 ${mouth.y - 28}) scale(${(mouth.inner + .5) / 12} 1) translate(-50 0)`}>
            <Path d="M38 32 H62 V42 Q65 45 68 49 H32 Q35 45 38 42 Z" fill={`url(#${id}-neck-glass)`} />
            <Path d="M38.5 34 V41 M61.5 34 V41" stroke="#D5F1EB" strokeWidth={1} strokeOpacity={0.35} strokeLinecap="round" />
          </G></G>
          <Path d={`M${50 - mouth.outer} ${mouth.y} A${mouth.outer} 5.8 0 0 0 ${50 + mouth.outer} ${mouth.y}`} fill="none" stroke="#294B5D" strokeWidth={3.3} />
          <Path d={`M${50 - mouth.outer} ${mouth.y} A${mouth.outer} 5.8 0 0 0 ${50 + mouth.outer} ${mouth.y}`} fill="none" stroke={`url(#${id}-rim)`} strokeWidth={1.7} />
          <Path d={`M${50 - mouth.inner - 1.5} ${mouth.y + 3} Q50 ${mouth.y + 7.3} ${50 + mouth.inner + 1.5} ${mouth.y + 3}`} fill="none" stroke="#E4EFD9" strokeWidth={0.7} strokeOpacity={0.75} />
          <AnimatedEllipse cx={50} cy={mouth.y + 1.5} rx={mouth.inner + 1} ry={3} fill="none" stroke="#FFF4D8" strokeWidth={1.1} animatedProps={contact} />
          <AnimatedPath d={`M${50 - mouth.inner * .6},${mouth.y - 10} Q${50 - mouth.inner * .35},${mouth.y - 12} 50,${mouth.y - 10}`} fill="none" stroke="#FFF4D8" strokeWidth={1} strokeLinecap="round" animatedProps={contact} />
        </AnimatedG>}
        <AnimatedPath animatedProps={spout} fill="none" stroke={flowColor.main} strokeWidth={3.5} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
});
