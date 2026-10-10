import { memo, useMemo, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, Pattern, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { SortingTrigger } from '../game/engineModel';
import { LIQUIDS, LIQUID_SYMBOLS } from './palette';
import { bottleKeyAnchor, bottleKeyPose, coverFamilyForConditions, coverPose, keyIdentity, type CoverFamily, type CoverGroup, type CoverState } from './unlockPresentation';
import type { VesselGeometry } from './vesselDesigns';
import { FLOW_END } from './pourGeometry';
import { RestraintBase } from './ContainerRestraint';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const IS_WEB = Platform.OS === 'web';
function matrixProps(matrix: number[]): { transform?: string; matrix?: number[]; opacity?: number } {
  'worklet';
  return IS_WEB ? { transform: 'matrix(' + matrix.join(' ') + ')' } : { matrix };
}

/** Three key heads remain legible at phone size; lock keyways use the identical silhouette. */
export function KeyGlyph({ shape, hole = false }: { shape: number; hole?: boolean }) {
  const identity = keyIdentity(shape);
  const head = shape % 3 === 0 ? 'M-5 -3 A5 5 0 1 0 5 -3 A5 5 0 1 0 -5 -3'
    : shape % 3 === 1 ? 'M0 -9 L6 -3 L0 3 L-6 -3 Z' : 'M-3 -8 H3 L6 -3 L3 2 H-3 L-6 -3 Z';
  return <G>
    <Path d={head} fill={hole ? identity.dark : identity.fill} stroke={hole ? identity.fill : identity.edge} strokeWidth={.7} />
    {identity.number && <SvgText x={0} y={-1.4} textAnchor="middle" fontSize={identity.number > 9 ? 3.5 : 4.8} fill={hole ? identity.light : identity.dark}>{identity.number}</SvgText>}
    {hole ? <Path d="M-1 -1 H1 L1.6 6 H-1.6 Z" fill="#211C18" /> : <>
      {!identity.number && <Circle cy={-3} r={2.1} fill={identity.dark} />}
      <Path d="M-1.2 1 V10 H3 V7 H1.4 V5 H3.8" fill="none" stroke={identity.dark} strokeWidth={3.5} strokeLinejoin="round" />
      <Path d="M-1.2 1 V10 H3 V7 H1.4 V5 H3.8" fill="none" stroke={identity.fill} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M-1.6 2 V9" fill="none" stroke={identity.light} strokeWidth={.55} />
      <Path d="M-3 -6 Q0 -8 3 -6" fill="none" stroke={identity.light} strokeWidth={.65} />
    </>}
  </G>;
}

function ClothBadge({ trigger, symbols, radius = 11 }: { trigger: SortingTrigger; symbols: boolean; radius?: number }) {
  if (trigger.when.type !== 'color-full') return null;
  const color = trigger.when.color;
  return <G transform={'scale(' + radius / 10 + ')'}>
    <Ellipse cy={1} rx={10.5} ry={11.1} fill="#080D13" opacity={.65} />
    <Circle r={10} fill="#344B61" stroke="#C1D0DC" strokeWidth={.75} />
    <Circle r={8.7} fill="none" stroke="#E0D3B7" strokeWidth={.55} strokeDasharray="1.3 1.5" />
    <Circle cy={-1.5} r={5.5} fill={LIQUIDS[color]?.main ?? '#328B80'} stroke="#EFFAF2" strokeWidth={.7} />
    {symbols && <SvgText y={1} fontSize={8} textAnchor="middle" fill="#F7FFF8">{LIQUID_SYMBOLS[color]}</SvgText>}
    {[-5.1,-1.7,1.7,5.1].map(x => <Circle key={x} cx={x} cy={6.8} r={1.05} fill="#FAF7E6" />)}
    <Path d="M-7 -6 Q0 -11 7 -6" fill="none" stroke="#FFFFFF" strokeOpacity={.28} strokeWidth={.6} />
  </G>;
}

/** The lock itself carries the condition; rigid shells never add a badge. */
function ConditionLock({ trigger, shape, symbols, id }: { trigger: SortingTrigger; shape: number; symbols: boolean; id: string }) {
  const color = trigger.when.type === 'color-full' ? trigger.when.color : null;
  const metal = keyIdentity(color ? 1 : shape), gradient = id + '-lock-' + shape;
  return <G>
    <Defs><LinearGradient id={gradient} x1="0" y1="0" x2="1" y2=".2">
      <Stop stopColor={metal.edge} /><Stop offset=".25" stopColor={metal.fill} /><Stop offset=".5" stopColor={metal.light} /><Stop offset="1" stopColor={metal.edge} />
    </LinearGradient></Defs>
    <Rect x={-2.8} y={-19} width={5.6} height={15} rx={1.2} fill={metal.dark} stroke={metal.edge} strokeWidth={.6} />
    <Path d="M-5 -4 V-10 A5 5 0 0 1 5 -10 V-4" fill="none" stroke={metal.dark} strokeWidth={3.5} />
    <Path d="M-5 -4 V-10 A5 5 0 0 1 5 -10 V-4" fill="none" stroke={'url(#' + gradient + ')'} strokeWidth={2.2} />
    <Rect x={-9.5} y={-4.5} width={19} height={18} rx={2.7} fill="#080D13" opacity={.55} />
    <Rect x={-9} y={-5} width={18} height={17} rx={2.4} fill={'url(#' + gradient + ')'} stroke={metal.dark} strokeWidth={.8} />
    <Path d="M-7 -3 H7" stroke={metal.light} strokeWidth={.65} />
    {color ? <>
      <Rect x={-6} y={-1.5} width={12} height={8} rx={1.2} fill={LIQUIDS[color]?.main ?? '#328B80'} stroke={metal.edge} strokeWidth={.6} />
      {symbols && <SvgText y={5} fontSize={8} textAnchor="middle" fill="#F7FFF8">{LIQUID_SYMBOLS[color]}</SvgText>}
      {[-4.5,-1.5,1.5,4.5].map(x => <Circle key={x} cx={x} cy={9} r={.85} fill={metal.dark} />)}
    </> : <G transform="translate(0 3) scale(.7)"><KeyGlyph shape={shape} hole /></G>}
  </G>;
}

function MaterialDefinitions({ id, width, height }: { id: string; width: number; height: number }) {
  return <Defs>
    <LinearGradient id={id + '-wood'} x1="0" y1="0" x2="1" y2=".1">
      <Stop stopColor="#38231F" /><Stop offset=".13" stopColor="#795343" /><Stop offset=".37" stopColor="#483029" /><Stop offset=".72" stopColor="#624030" /><Stop offset="1" stopColor="#2A1D1B" />
    </LinearGradient>
    <LinearGradient id={id + '-edge'} x1="0" y1="0" x2="1" y2="1">
      <Stop stopColor="#D4A486" /><Stop offset=".2" stopColor="#78503E" /><Stop offset=".6" stopColor="#352520" /><Stop offset="1" stopColor="#A57350" />
    </LinearGradient>
    <LinearGradient id={id + '-metal'} x1="0" y1="0" x2="0" y2="1">
      <Stop stopColor="#AABBC6" /><Stop offset=".16" stopColor="#657A8B" /><Stop offset=".43" stopColor="#233748" /><Stop offset=".8" stopColor="#40566A" /><Stop offset="1" stopColor="#101E2A" />
    </LinearGradient>
    <LinearGradient id={id + '-rail'} x1="0" y1="0" x2="1" y2="0">
      <Stop stopColor="#182936" /><Stop offset=".3" stopColor="#BAC5CA" /><Stop offset=".52" stopColor="#526878" /><Stop offset="1" stopColor="#162A39" />
    </LinearGradient>
    <LinearGradient id={id + '-gold'} x1="0" y1="0" x2="1" y2=".3">
      <Stop stopColor="#9C7545" /><Stop offset=".28" stopColor="#E1BE86" /><Stop offset=".53" stopColor="#F5DBA5" /><Stop offset="1" stopColor="#A57C47" />
    </LinearGradient>
    <LinearGradient id={id + '-cloth'} x1="0" y1="0" x2="1" y2=".15">
      <Stop stopColor="#33465D" /><Stop offset=".17" stopColor="#8198AE" /><Stop offset=".3" stopColor="#445D76" /><Stop offset=".49" stopColor="#8B9FB3" /><Stop offset=".65" stopColor="#3C536C" /><Stop offset=".84" stopColor="#788FA6" /><Stop offset="1" stopColor="#2B3C52" />
    </LinearGradient>
    <Pattern id={id + '-grain'} width={18} height={83} patternUnits="userSpaceOnUse">
      <Path d="M2 -10 Q8 14 3 33 T4 90 M7 -6 Q3 19 9 36 T8 90 M13 -5 Q19 11 13 28 T14 89 M17 0 Q12 25 17 47 T16 90" stroke="#D5A183" strokeWidth={.38} opacity={.4} fill="none" />
      <Path d="M5 -10 Q11 14 6 33 T7 90 M11 -6 Q7 19 13 36 T12 90 M16 -5 Q22 11 16 28 T17 89" stroke="#140F11" strokeWidth={.55} opacity={.5} fill="none" />
    </Pattern>
    <Pattern id={id + '-weave'} width={6} height={8} patternUnits="userSpaceOnUse">
      <Path d="M0 0 L3 4 L6 0 M0 4 L3 8 L6 4" stroke="#CBD7E1" strokeWidth={.35} opacity={.3} fill="none" />
      <Path d="M0 1 L3 5 L6 1" stroke="#172B43" strokeWidth={.45} opacity={.35} fill="none" />
    </Pattern>
    <ClipPath id={id + '-slot'}><Rect width={width} height={height} rx={4} /></ClipPath>
  </Defs>;
}

function WoodLeaf({ x, width, right, id, state, progress }: { x: number; width: number; right: boolean; id: string; state: CoverState; progress: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    const open = coverPose(progress.value, state).open, scale = Math.max(.025, 1 - open);
    const anchor = right ? x + width : x;
    return matrixProps([scale, 0, 0, 1, anchor * (1 - scale), 0]);
  });
  return <AnimatedG animatedProps={props}>
    <Rect x={x} y={8} width={width + .6} height={143} rx={1.4} fill={'url(#' + id + '-wood)'} stroke="#BC8B69" strokeWidth={.65} />
    <Rect x={x + .4} y={9} width={Math.max(0, width - .8)} height={141} fill={'url(#' + id + '-grain)'} />
    <Path d={'M' + (x + 1.5) + ' 12 V146 H' + (x + width - 1.4)} fill="none" stroke="#E3B191" strokeOpacity={.34} strokeWidth={.6} />
    <Rect x={right ? x + width - 3.3 : x + 1.5} y={80} width={1.7} height={11} rx={.8} fill={'url(#' + id + '-gold)'} stroke="#E6C18D" strokeWidth={.35} />
  </AnimatedG>;
}

function Shutter({ x, width, id, family, state, progress }: { x: number; width: number; id: string; family: 'roller' | 'louver'; state: CoverState; progress: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ height: 141 * (1 - coverPose(progress.value, state).open) }));
  const slide = useAnimatedProps(() => matrixProps([1, 0, 0, 1, 0, -141 * coverPose(progress.value, state).open]));
  const roll = useAnimatedProps(() => {
    const open = coverPose(progress.value, state).open;
    return { opacity: open > 0 ? 1 : 0, ...matrixProps([1, 0, 0, 1, 0, 4 * open]) };
  });
  return <G>
    <Defs><ClipPath id={id + '-shutter-' + x}><AnimatedRect x={x} y={9} width={width} height={141} animatedProps={props} /></ClipPath></Defs>
    <G clipPath={'url(#' + id + '-shutter-' + x + ')'}>
      <AnimatedG animatedProps={slide}>
      <Rect x={x} y={8} width={width} height={143} fill={family === 'roller' ? '#33221D' : '#122431'} />
      {Array.from({ length: family === 'roller' ? 20 : 14 }, (_, i) => {
        const y = 9 + i * (family === 'roller' ? 7 : 10), h = family === 'roller' ? 7 : 10;
        return <G key={i}>
          <Rect x={x} y={y} width={width} height={h - .15} fill={'url(#' + id + (family === 'roller' ? '-wood)' : '-metal)')} />
          <Path d={'M' + x + ' ' + (y + .8) + ' H' + (x + width)} stroke={family === 'roller' ? '#BD9374' : '#B8C7CE'} strokeOpacity={.55} strokeWidth={.55} />
          {family === 'roller' && <Path d={'M' + (x + 2) + ' ' + (y + 3) + ' Q' + (x + width / 2) + ' ' + (y + 1) + ' ' + (x + width - 2) + ' ' + (y + 4)} stroke="#1F1717" strokeOpacity={.5} strokeWidth={.45} fill="none" />}
        </G>;
      })}
      </AnimatedG>
    </G>
    <AnimatedG animatedProps={roll}>
      <Rect x={x} y={8} width={width} height={family === 'roller' ? 8 : 5} rx={family === 'roller' ? 4 : 1} fill={'url(#' + id + (family === 'roller' ? '-edge)' : '-metal)')} stroke={family === 'roller' ? '#AD8063' : '#96A8B1'} strokeWidth={.5} />
      {family === 'roller' && <Ellipse cx={x + width - 2.5} cy={12} rx={2.2} ry={3.5} fill="#4C3329" stroke="#BD9270" strokeWidth={.55} />}
    </AnimatedG>
  </G>;
}

function Cloth({ id, width, height, state, progress, neckWidth }: { id: string; width: number; height: number; state: CoverState; progress: SharedValue<number>; neckWidth: number }) {
  const cx = width / 2;
  const silhouette = 'M' + (cx - neckWidth) + ' 5 C' + (cx - neckWidth - 1) + ' -1 ' + (cx + neckWidth + 1) + ' -1 ' + (cx + neckWidth) + ' 5 C' + (cx + neckWidth - 2) + ' 20 ' + (width - 2) + ' 32 ' + (width - 2) + ' 59 L' + (width - 1) + ' ' + (height - 9) + ' Q' + (width - 2) + ' ' + (height - 2) + ' ' + (cx + 15) + ' ' + (height - 4) + ' Q' + cx + ' ' + height + ' ' + (cx - 15) + ' ' + (height - 4) + ' Q2 ' + (height - 2) + ' 1 ' + (height - 9) + ' L2 59 C2 32 ' + (cx - neckWidth + 2) + ' 20 ' + (cx - neckWidth) + ' 5 Z';
  const props = useAnimatedProps(() => {
    const p = coverPose(progress.value, state).open, sx = 1 - p * .7, sy = 1 - p * .93;
    return matrixProps([sx, 0, 0, sy, cx * (1 - sx), -p * 1.5]);
  });
  return <AnimatedG animatedProps={props}>
    <Defs><ClipPath id={id + '-cloth-shape'}><Path d={silhouette} /></ClipPath></Defs>
    <Path d={silhouette} fill={'url(#' + id + '-cloth)'} stroke="#9BACBC" strokeWidth={.7} />
    <G clipPath={'url(#' + id + '-cloth-shape)'}><Rect width={width} height={height} fill={'url(#' + id + '-weave)'} />
      {[-18,-7,7,20].map((dx, i) => <G key={dx}>
        <Path d={'M' + (cx + dx * .45) + ' 8 C' + (cx + dx * .2) + ' 40 ' + (cx + dx * 1.3) + ' 55 ' + (cx + dx) + ' ' + (height - 5)} fill="none" stroke="#162D48" strokeWidth={i % 2 ? 3.2 : 2.2} strokeOpacity={.5} />
        <Path d={'M' + (cx + dx * .45 + 1.2) + ' 8 C' + (cx + dx * .2 + 2) + ' 40 ' + (cx + dx * 1.3 + 2) + ' 55 ' + (cx + dx + 1.2) + ' ' + (height - 5)} fill="none" stroke="#C6D4DE" strokeWidth={.8} strokeOpacity={.5} />
      </G>)}
    </G>
    <Ellipse cx={cx} cy={4.5} rx={neckWidth} ry={3.8} fill="#7890A6" stroke="#B6C5D2" strokeWidth={.6} />
    <Path d={'M3 ' + (height - 9) + ' Q' + cx + ' ' + (height - 1) + ' ' + (width - 3) + ' ' + (height - 9)} fill="none" stroke="#B6C6D5" strokeWidth={.8} strokeOpacity={.65} />
  </AnimatedG>;
}

export const UnlockCover = memo(function UnlockCover({ group, family: requestedFamily, progress, scale, symbols, triggerIndices, neckWidth = 18 }: {
  group: CoverGroup; family: CoverFamily; progress: SharedValue<number>; scale: number; symbols: boolean; triggerIndices: readonly number[]; neckWidth?: number;
}) {
  const family = coverFamilyForConditions(requestedFamily, group.conditions);
  const { width, height, state, centers } = group, id = 'cover-' + family + '-' + group.id;
  const shell = useAnimatedProps(() => ({ opacity: coverPose(progress.value, state).opacity }));
  const latch = useAnimatedProps(() => ({ opacity: coverPose(progress.value, state).latch }));
  const clothBadge = useAnimatedProps(() => {
    const open = coverPose(progress.value, state).open;
    return matrixProps([1, 0, 0, 1, 0, family === 'cloth' ? -open * 66 : 0]);
  });
  const edges = centers.map((c, i) => ({ left: i ? (centers[i - 1] + c) / 2 : 0, right: i === centers.length - 1 ? width : (c + centers[i + 1]) / 2 }));
  const wood = family === 'wood' || family === 'roller';
  return <View pointerEvents="none" style={{ position: 'absolute', left: group.x * scale, top: group.y * scale, width: width * scale, height: height * scale, zIndex: 2 }}>
    <Svg width="100%" height="100%" viewBox={'0 0 ' + width + ' ' + height}>
      <MaterialDefinitions id={id} width={width} height={height} />
      {state === 'relocked' ? <RestraintBase width={width} height={height} fill={wood ? 'url(#' + id + '-wood)' : 'url(#' + id + '-rail)'} edge={wood ? '#9D7359' : '#8497A3'}>
        {group.conditions.slice(0, 2).map((trigger, i) => <G key={trigger.id} transform={'translate(' + (width - 10 - i * 17) + ' ' + (height - 16) + ')'}>
          {family === 'cloth' ? <ClothBadge trigger={trigger} symbols={symbols} radius={7} />
            : <G transform="scale(.7)"><ConditionLock trigger={trigger} shape={triggerIndices[i]} id={id} symbols={symbols} /></G>}
        </G>)}
        {family === 'louver' && <Path d={'M3 ' + (height - 3) + ' V10 M' + (width - 3) + ' ' + (height - 3) + ' V10'} fill="none" stroke="#8297A4" strokeWidth={1.2} />}
      </RestraintBase> : <AnimatedG animatedProps={shell} clipPath={'url(#' + id + '-slot)'}>
        {family === 'cloth' ? <Cloth id={id} width={width} height={height} state={state} progress={progress} neckWidth={neckWidth} /> : <>
          {edges.map(({ left, right }, i) => family === 'wood' ? <G key={i}>
            <WoodLeaf x={left + 2} width={(right - left - 4) / 2} right={false} id={id} state={state} progress={progress} />
            <WoodLeaf x={(left + right) / 2} width={(right - left - 4) / 2} right id={id} state={state} progress={progress} />
          </G> : <Shutter key={i} x={left + 3} width={right - left - 6} id={id} family={family} state={state} progress={progress} />)}
          {[0,...edges.map(e => e.right)].map((x, i) => <G key={i}>
            <Rect x={Math.max(0, Math.min(width - 4, x - 2))} y={4} width={4} height={height - 7} rx={.9} fill={'url(#' + id + (wood ? '-edge)' : '-rail)')} stroke={wood ? '#C89776' : '#9BABB5'} strokeWidth={.5} />
            <Path d={'M' + Math.max(1, Math.min(width - 3, x - 1)) + ' 9 V150'} stroke={wood ? '#E5B79A' : '#E6ECEB'} strokeOpacity={.5} strokeWidth={.5} />
          </G>)}
          <Rect x={.5} y={1} width={width - 1} height={8} rx={2.5} fill={'url(#' + id + (wood ? '-edge)' : '-metal)')} stroke={wood ? '#D1A385' : '#C3CDD1'} strokeWidth={.75} />
          <Path d={'M3 3 H' + (width - 3)} stroke={wood ? '#EAC4A5' : '#EDF2F0'} strokeWidth={.6} strokeOpacity={.65} />
          <Rect x={1} y={height - 8} width={width - 2} height={7} rx={2} fill={'url(#' + id + (wood ? '-wood)' : '-metal)')} stroke={wood ? '#A77A5C' : '#8C9FAB'} strokeWidth={.6} />
        </>}
        <AnimatedG animatedProps={latch}><AnimatedG animatedProps={clothBadge}>
          {group.conditions.slice(0, 2).map((trigger, i, list) => <G key={trigger.id} transform={'translate(' + (width / 2 + (i - (list.length - 1) / 2) * 23) + ' ' + (family === 'cloth' ? 76 : 82) + ')'}>
            {family === 'cloth' ? <ClothBadge trigger={trigger} symbols={symbols} />
              : <ConditionLock trigger={trigger} shape={triggerIndices[i]} id={id} symbols={symbols} />}
          </G>)}
          {group.conditions.length > 2 && <SvgText x={width / 2} y={106} textAnchor="middle" fontSize={9} fill="#F0DAB6">+{group.conditions.length - 2}</SvgText>}
        </AnimatedG></AnimatedG>
      </AnimatedG>}
    </Svg>
  </View>;
});

export function BottleKey({ shape, triggered, progress, vessel }: { shape: number; triggered: boolean; progress: SharedValue<number>; vessel: VesselGeometry }) {
  const anchor = useMemo(() => bottleKeyAnchor(vessel), [vessel]);
  const props = useAnimatedProps(() => {
    const pose = bottleKeyPose(anchor, triggered, progress.value);
    return { opacity: pose.opacity, ...matrixProps(pose.matrix) };
  });
  return <AnimatedG animatedProps={props}><KeyGlyph shape={shape} /></AnimatedG>;
}

export function UnlockBottleVisibility({ concealed, delayed, progress, children }: { concealed: boolean; delayed: boolean; progress: SharedValue<number>; children: ReactNode }) {
  // Mount the real glass only after its first disclosure. A native SVG mounted
  // under an initially invisible animated parent can retain an empty surface.
  const style = useAnimatedStyle(() => ({ opacity: delayed && progress.value < FLOW_END ? 0 : 1 }));
  if (concealed) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', inset: 0 }, style]}>{children}</Animated.View>;
}

/** Internal A/B control only; no rule or saved preference changes. */
export function LegacyCover({ x, y, scale, opening, progress }: { x: number; y: number; scale: number; opening: boolean; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: opening && progress.value >= 1 ? 0 : 1 }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (x + 20) * scale, top: (y + 23) * scale, width: 60 * scale, height: 140 * scale,
    backgroundColor: '#454E57', borderRadius: 10, borderWidth: 1, borderColor: '#86929C', zIndex: 2 }, style]} />;
}
