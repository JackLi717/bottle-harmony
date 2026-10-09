import { useEffect, useId, type ReactNode } from 'react';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { MixingPuzzle } from '../game/mixing';
import { MIXING_PALETTE } from './mixingPalette';
const AnimatedRect = Animated.createAnimatedComponent(Rect);
function Region({ id, visible, animate, children }: { id: string; visible: boolean; animate: boolean; children: ReactNode }) {
  const fill = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    fill.set(animate && visible ? withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }) : visible ? 1 : 0);
    return () => cancelAnimation(fill);
  }, [visible, animate, fill]);
  const props = useAnimatedProps(() => ({ height: 370 * fill.value }));
  return <>
    <Defs><ClipPath id={id}><AnimatedRect x={0} y={0} width={360} animatedProps={props} /></ClipPath></Defs>
    <G opacity={.075}>{children}</G><G clipPath={`url(#${id})`}>{children}</G>
  </>;
}
/** Read-only result template. Repeated petals/shading never create additional logical pigment. */
export function MixingArtwork({ puzzle, visible, animate = false, width, height }: { puzzle: MixingPuzzle; visible: readonly number[]; animate?: boolean; width: number; height: number }) {
  const id = 'art' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const green = puzzle.goals.findIndex(c => c === 'labGreen');
  const petal = puzzle.goals.findIndex((_, i) => i !== green);
  const center = puzzle.goals.findIndex((_, i) => i !== green && i !== petal);
  const centerGoal = center < 0 ? petal : center;
  return <Svg pointerEvents="none" width={width} height={height} viewBox="0 0 360 370">
    <Defs>
      {puzzle.goals.map((c, i) => <RadialGradient key={i} id={`${id}-color-${i}`} cx="40%" cy="25%" rx="70%" ry="80%">
        <Stop offset="0" stopColor={MIXING_PALETTE[c].light} /><Stop offset=".45" stopColor={MIXING_PALETTE[c].main} /><Stop offset="1" stopColor={MIXING_PALETTE[c].dark} />
      </RadialGradient>)}
      <LinearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#C0E4EF" stopOpacity={.24} /><Stop offset=".25" stopColor="#87C6E4" stopOpacity={.035} /><Stop offset=".78" stopColor="#D9EDF1" stopOpacity={.07} /><Stop offset="1" stopColor="#91BED5" stopOpacity={.23} />
      </LinearGradient>
      <RadialGradient id={`${id}-glow`}><Stop offset="0" stopColor="#88B9AE" stopOpacity={.14} /><Stop offset="1" stopColor="#8AC9CE" stopOpacity={0} /></RadialGradient>
      <ClipPath id={`${id}-cup`}><Path d="M81 70 Q180 91 279 70 L260 304 Q180 330 100 304 Z" /></ClipPath>
    </Defs>
    <Ellipse cx={180} cy={182} rx={177} ry={180} fill={`url(#${id}-glow)`} />
    {puzzle.artwork === 'flower' ? <>
      <Region id={`${id}-leaf-reveal`} visible={visible.includes(green)} animate={animate}>
        <Path d="M180 319 C173 270 193 217 180 164" fill="none" stroke={`url(#${id}-color-${green})`} strokeWidth={9} strokeLinecap="round" />
        <Path d="M181 282 C125 286 93 257 90 224 C141 218 173 246 181 282 Z M182 257 C219 252 252 219 254 190 C212 193 181 220 182 257 Z" fill={`url(#${id}-color-${green})`} stroke="#DCEAD6" strokeOpacity={.15} />
        <Path d="M101 233 Q145 258 179 279 M113 246 L111 232 M131 259 L130 239 M145 270 L151 249 M245 202 Q213 232 185 252 M235 215 L222 210 M219 231 L207 224" stroke="#F1F9D7" strokeOpacity={.3} strokeWidth={1.2} fill="none" />
      </Region>
      <Region id={`${id}-petal-reveal`} visible={visible.includes(petal)} animate={animate}>
        {Array.from({ length: 12 }, (_, i) => <G key={i} rotation={i * 30} origin="180,145">
          <Path d="M180 148 C143 133 142 91 165 51 C174 34 186 35 197 53 C222 95 213 131 180 148 Z" fill={`url(#${id}-color-${petal})`} stroke="#FFF4F0" strokeOpacity={.18} strokeWidth={.8} />
          <Path d="M180 137 C176 109 178 78 179 53 M173 127 Q163 105 164 85 M188 125 Q199 101 194 79" stroke="#FFF8F0" strokeWidth={.85} strokeOpacity={.25} fill="none" />
          <Path d="M184 127 Q207 96 188 54" stroke="#FFFFFF" strokeOpacity={.12} strokeWidth={3} fill="none" />
        </G>)}
        {Array.from({ length: 8 }, (_, i) => <G key={i} rotation={i * 45 + 15} origin="180,145">
          <Path d="M180 149 C158 137 153 112 174 91 Q181 83 188 94 C204 116 200 135 180 149 Z" fill={`url(#${id}-color-${petal})`} stroke="#FFF4EC" strokeOpacity={.24} />
          <Path d="M180 140 L181 98" stroke="#FFF7EE" strokeOpacity={.32} strokeWidth={1.3} />
        </G>)}
      </Region>
      <Region id={`${id}-center-reveal`} visible={visible.includes(centerGoal)} animate={animate}>
        <Circle cx={180} cy={145} r={27} fill={`url(#${id}-color-${centerGoal})`} stroke="#FFFFFF" strokeOpacity={.2} />
        {Array.from({ length: 70 }, (_, i) => {
          const a = i * 2.39996, r = Math.sqrt(i / 70) * 23;
          return <Circle key={i} cx={180 + Math.cos(a) * r} cy={145 + Math.sin(a) * r} r={1.65} fill={i % 3 === 0 ? '#FFFFFF' : MIXING_PALETTE[puzzle.goals[centerGoal]].dark} opacity={i % 3 === 0 ? .42 : .5} />;
        })}
      </Region>
      <Ellipse cx={181} cy={330} rx={53} ry={5} fill="#08121D" opacity={.55} />
    </> : <>
      <Ellipse cx={180} cy={325} rx={112} ry={11} fill="#050E19" opacity={.65} />
      <G clipPath={`url(#${id}-cup)`}>
        {puzzle.goals.map((_, i) => {
          const bandHeight = 225 / puzzle.goals.length, y = 308 - (i + 1) * bandHeight;
          return <Region key={i} id={`${id}-band-${i}`} visible={visible.includes(i)} animate={animate}>
            <Path d={`M70 ${y} Q180 ${y + 22} 290 ${y} V${y + bandHeight + 15} H70 Z`} fill={`url(#${id}-color-${i})`} />
            <Path d={`M80 ${y + 5} Q180 ${y + 26} 280 ${y + 5}`} stroke="#FFFFFF" strokeOpacity={.36} strokeWidth={1.2} fill="none" />
            <Path d={`M99 ${y + 20} Q118 ${y + bandHeight * .5} 106 ${y + bandHeight - 3}`} stroke="#FFFFFF" strokeOpacity={.15} strokeWidth={3} fill="none" />
          </Region>;
        })}
      </G>
      <Path d="M77 66 Q180 92 283 66 L264 307 Q180 338 96 307 Z" fill={`url(#${id}-glass)`} stroke="#AECFD9" strokeOpacity={.6} strokeWidth={1.5} />
      <Ellipse cx={180} cy={66} rx={103} ry={14} fill="#96C8D6" fillOpacity={.045} stroke="#D6E9E4" strokeOpacity={.65} strokeWidth={2} />
      <Path d="M90 91 L106 295 Q180 318 252 295 M267 94 L250 284 M105 99 L116 277" fill="none" stroke="#F2F7EA" strokeOpacity={.4} strokeWidth={2} strokeLinecap="round" />
      <Path d="M124 311 Q180 324 236 311" stroke="#FFFFFF" strokeOpacity={.3} strokeWidth={2.5} fill="none" />
      <Path d="M262 78 V94 M254 86 H270 M102 286 V296 M97 291 H107" stroke="#FFFFFF" strokeOpacity={.65} strokeWidth={1.2} strokeLinecap="round" />
    </>}
    {visible.length === puzzle.goals.length && [0, 1, 2, 3, 4].map(i => <G key={i} opacity={.5}>
      <Path d={`M${42 + i * 68} ${55 + i % 2 * 230} v10 m-5 -5 h10`} stroke="#ECF2DA" strokeWidth={1} strokeLinecap="round" />
    </G>)}
  </Svg>;
}
