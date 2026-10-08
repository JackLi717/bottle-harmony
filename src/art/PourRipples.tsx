import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Ellipse } from 'react-native-svg';
import { ripplePose } from './pourPresentation';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
type Props = { progress: SharedValue<number>; surface: SharedValue<{ y: number; halfWidth: number }>; enabled: boolean; color: string };

function Ring({ progress, surface, enabled, color, index }: Props & { index: number }) {
  const props = useAnimatedProps(() => ({ ...ripplePose(progress.value, index, surface.value.halfWidth, enabled), cy: surface.value.y + .7 }));
  return <>
    <AnimatedEllipse cx={50} animatedProps={props} fill="none" stroke="#174B5D" strokeOpacity={.55} strokeWidth={2.6} />
    <AnimatedEllipse cx={50} animatedProps={props} fill="none" stroke={color} strokeWidth={1.3} />
  </>;
}

export function PourRipples(props: Props) {
  return <>{[0, 1, 2].map(index => <Ring key={index} {...props} index={index} />)}</>;
}
