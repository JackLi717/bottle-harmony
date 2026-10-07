import { useEffect, useMemo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { BURST_SECONDS, emberGroups, emberPosition, FIREWORK_INTERVAL, FIREWORK_START, FIREWORKS, fireworkDuration, LAUNCH_SECONDS, rocketPosition, type EmberGroup } from './fireworkPhysics';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
/** All layers of one color share SVG paths, avoiding a native view for every spark. */
function Petals({ clock, start, group, x, y }: { clock: SharedValue<number>; start: number; group: EmberGroup; x: number; y: number }) {
  const props = useAnimatedProps(() => {
    const elapsed = clock.value - start - LAUNCH_SECONDS;
    if (elapsed < 0 || elapsed > BURST_SECONDS) return { d: 'M0 0', opacity: 0 };
    let d = '';
    for (const ember of group.embers) {
      const t = elapsed - ember.delay;
      if (t < 0 || t > ember.life) continue;
      const fade = Math.min(1, t * 20) * Math.pow(Math.max(0, 1 - t / ember.life), .55);
      const glitter = ember.layer === 3 ? .3 + .7 * Math.pow(.5 + .5 * Math.sin(t * 31 + ember.seed), 2) : 1;
      // Trails shorten as they burn out, leaving scattered points that fall and twinkle.
      const tailTime = Math.min(t, (ember.layer === 3 ? .035 : .33) * fade * glitter);
      const a = emberPosition(ember, t - tailTime);
      const b = emberPosition(ember, t - tailTime * .66);
      const c = emberPosition(ember, t - tailTime * .33);
      const head = emberPosition(ember, t);
      d += `M${x + a.x} ${y + a.y}L${x + b.x} ${y + b.y}L${x + c.x} ${y + c.y}L${x + head.x} ${y + head.y}`;
    }
    return { d: d || 'M0 0', opacity: Math.pow(Math.max(0, 1 - elapsed / BURST_SECONDS), .85) };
  });
  const tips = useAnimatedProps(() => {
    const elapsed = clock.value - start - LAUNCH_SECONDS;
    if (elapsed < 0 || elapsed > BURST_SECONDS) return { d: 'M0 0', opacity: 0 };
    let d = '';
    for (const ember of group.embers) {
      const t = elapsed - ember.delay;
      if (t < 0 || t > ember.life) continue;
      const glitter = ember.layer === 3 ? .5 + .5 * Math.sin(t * 31 + ember.seed) : 1;
      if (glitter < .4) continue;
      const a = emberPosition(ember, Math.max(0, t - .025));
      const b = emberPosition(ember, t);
      d += `M${x + a.x} ${y + a.y}L${x + b.x} ${y + b.y}`;
    }
    return { d: d || 'M0 0', opacity: Math.pow(Math.max(0, 1 - elapsed / BURST_SECONDS), .5) };
  });
  return <>{<AnimatedPath animatedProps={props} stroke={group.color} strokeWidth={4} strokeOpacity={.07} strokeLinecap="round" fill="none" />}
    <AnimatedPath animatedProps={props} stroke={group.color} strokeWidth={1.05} strokeOpacity={.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <AnimatedPath animatedProps={tips} stroke={group.color} strokeWidth={1.6} strokeLinecap="round" fill="none" />
  </>;
}
function Shell({ clock, start, index, height }: { clock: SharedValue<number>; start: number; index: number; height: number }) {
  const { x, y: relativeY } = FIREWORKS[index];
  const y = height * relativeY, bottom = height - 12;
  const groups = useMemo(() => emberGroups(index), [index]);
  const trail = useAnimatedProps(() => {
    const t = clock.value - start;
    if (t < 0 || t >= LAUNCH_SECONDS) return { d: 'M0 0', opacity: 0 };
    const point = rocketPosition(x, y, t, bottom), tail = rocketPosition(x, y, Math.max(0, t - .18), bottom);
    return { d: `M${tail.x} ${tail.y}L${point.x} ${point.y}`, opacity: .9 };
  });
  const head = useAnimatedProps(() => {
    const t = clock.value - start, point = rocketPosition(x, y, t, bottom);
    return { cx: point.x, cy: point.y, opacity: t >= 0 && t < LAUNCH_SECONDS ? 1 : 0 };
  });
  const halo = useAnimatedProps(() => {
    const t = clock.value - start - LAUNCH_SECONDS;
    return { r: 5 + Math.max(0, t) * 210, opacity: t >= 0 && t < .4 ? .14 * (1 - t / .4) : 0 };
  });
  const flash = useAnimatedProps(() => {
    const t = clock.value - start - LAUNCH_SECONDS;
    return { r: 3 + Math.max(0, t) * 45, opacity: t >= 0 && t < .2 ? .95 * (1 - t / .2) : 0 };
  });
  return <><AnimatedPath animatedProps={trail} stroke="#FFD993" strokeWidth={7} strokeOpacity={.14} strokeLinecap="round" /><AnimatedPath animatedProps={trail} stroke="#FFE3AA" strokeWidth={1.8} strokeLinecap="round" /><AnimatedCircle animatedProps={head} r={2.6} fill="#FFF4D9" />
    <AnimatedCircle animatedProps={halo} cx={x} cy={y} fill="#FFD899" />
    {groups.map((group, i) => <Petals key={i} clock={clock} start={start} group={group} x={x} y={y} />)}
    <AnimatedCircle animatedProps={flash} cx={x} cy={y} fill="#FFF6DF" />
  </>;
}
export function Fireworks({ count, width, height, onComplete }: { count: 2 | 3 | 4 | 5; width: number; height: number; onComplete: () => void }) {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(0);
    clock.set(withTiming(fireworkDuration(count), { duration: fireworkDuration(count) * 1000, easing: Easing.linear }, done => {
      if (done) scheduleOnRN(onComplete);
    }));
    return () => cancelAnimation(clock);
  }, [count, clock, onComplete]);
  const svgHeight = height * 400 / Math.max(1, width);
  return <Svg pointerEvents="none" width={width} height={height} viewBox={`0 0 400 ${svgHeight}`}>
    {FIREWORKS.slice(0, count).map((_, index) => <Shell key={index} clock={clock} start={FIREWORK_START + index * FIREWORK_INTERVAL} index={index} height={svgHeight} />)}
  </Svg>;
}
