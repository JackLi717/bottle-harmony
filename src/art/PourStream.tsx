import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { ColorId } from '../game/rules';
import { LIQUIDS } from './palette';
import { MEMORY_UNKNOWN_FILL } from './memoryPresentation';
import { sourcePose, streamOpacity, type PourPlan } from './pourGeometry';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function PourStream({ plan, color, progress, hidden = false, palette = LIQUIDS }: { plan: PourPlan; color: ColorId; progress: SharedValue<number>; hidden?: boolean; palette?: typeof LIQUIDS }) {
  const props = useAnimatedProps(() => {
    const outlet = sourcePose(plan, progress.value).outlet;
    const bottom = plan.target.y + (plan.targetMouthY ?? plan.geometry.mouth.y) + 7;
    return {
      d: `M${outlet.x},${outlet.y} L${plan.target.x + 50},${bottom}`,
      opacity: streamOpacity(progress.value),
    };
  });
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${plan.width} ${plan.height}`} pointerEvents="none">
      <AnimatedPath stroke={hidden ? MEMORY_UNKNOWN_FILL : palette[color].main} strokeWidth={3.5} strokeLinecap="round" fill="none" animatedProps={props} />
      <AnimatedPath stroke={hidden ? '#64717C' : palette[color].light} strokeWidth={0.9} strokeLinecap="round" fill="none" animatedProps={props} />
    </Svg>
  );
}
