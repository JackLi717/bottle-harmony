import { memo } from 'react';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Ellipse, G, Path } from 'react-native-svg';
import { BOTTLE_SHELL } from './bottleDesign';
import { completionPose } from './bottleCompletion';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const SPARKS = [
  { x: 25, y: 43, dx: -6, dy: -12, delay: 0.04, size: 2.4 },
  { x: 75, y: 47, dx: 7, dy: -16, delay: 0.16, size: 1.9 },
  { x: 13, y: 86, dx: -5, dy: -11, delay: 0.12, size: 1.6 },
  { x: 87, y: 93, dx: 5, dy: -9, delay: 0.02, size: 2.2 },
  { x: 26, y: 148, dx: -7, dy: -6, delay: 0.2, size: 1.9 },
  { x: 74, y: 144, dx: 8, dy: -7, delay: 0.09, size: 1.5 },
];
type Props = { timeline: SharedValue<number>; complete: SharedValue<boolean>; id: string };

function Spark({ timeline, complete, spark }: Pick<Props, 'timeline' | 'complete'> & { spark: typeof SPARKS[number] }) {
  const props = useAnimatedProps(() => {
    const t = Math.max(0, Math.min(1, (timeline.value - spark.delay) / 0.58));
    const light = Math.pow(Math.sin(Math.PI * t), 2);
    const drift = 1 - Math.pow(1 - t, 2);
    const x = spark.x + spark.dx * drift, y = spark.y + spark.dy * drift;
    const r = 0.3 + spark.size * light;
    return { opacity: complete.value ? light * 0.9 : 0,
      d: `M${x},${y - r * 1.6} L${x + r * 0.5},${y - r * 0.5} L${x + r * 1.6},${y} L${x + r * 0.5},${y + r * 0.5} L${x},${y + r * 1.6} L${x - r * 0.5},${y + r * 0.5} L${x - r * 1.6},${y} L${x - r * 0.5},${y - r * 0.5} Z` };
  });
  return <AnimatedPath fill="#FFF1BD" animatedProps={props} />;
}

/** A small fixed set of SVG shapes runs on the UI thread; no filters or JS frame loop. */
export const BottleCelebration = memo(function BottleCelebration({ timeline, complete, id }: Props) {
  const glow = useAnimatedProps(() => ({ opacity: complete.value ? completionPose(timeline.value).glow : 0 }));
  const wave = useAnimatedProps(() => {
    const pose = completionPose(timeline.value);
    return { opacity: complete.value ? pose.glow * 0.65 : 0, rx: 30 + 17 * pose.spread, ry: 6 + 5 * pose.spread };
  });
  const afterglow = useAnimatedProps(() => {
    const t = Math.max(0, Math.min(1, (timeline.value - 0.16) / 0.7));
    const spread = 1 - Math.pow(1 - t, 2);
    return { opacity: complete.value ? Math.pow(Math.sin(Math.PI * t), 2) * 0.3 : 0,
      rx: 28 + 16 * spread, ry: 5 + 5 * spread };
  });
  return <G>
    <AnimatedG animatedProps={glow}>
      <Ellipse cx={50} cy={100} rx={46} ry={78} fill={`url(#${id}-completion-glow)`} />
      <Path d={BOTTLE_SHELL} fill="none" stroke="#E8CB8C" strokeWidth={13} strokeOpacity={0.055} />
      <Path d={BOTTLE_SHELL} fill="none" stroke="#F9E4AB" strokeWidth={7} strokeOpacity={0.12} />
      <Path d={BOTTLE_SHELL} fill="none" stroke="#FFF3CC" strokeWidth={3.6} strokeOpacity={0.3} />
      <Path d={BOTTLE_SHELL} fill="none" stroke="#FFF7DA" strokeWidth={1.8} strokeOpacity={0.85} />
    </AnimatedG>
    <AnimatedEllipse cx={50} cy={169} fill="none" stroke="#F7DEA5" strokeWidth={1.5} animatedProps={wave} />
    <AnimatedEllipse cx={50} cy={169} fill="none" stroke="#FFF0C4" strokeWidth={0.7} animatedProps={afterglow} />
    {SPARKS.map((spark, index) => <Spark key={index} spark={spark} timeline={timeline} complete={complete} />)}
  </G>;
});
