import Svg, { Circle, Path } from 'react-native-svg';

export function Icon({ name, color = '#D9E7E5', size = 22 }: { name: 'undo' | 'reset' | 'play' | 'spark'; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'undo' && <Path d="M8 5 3 10l5 5 M3 10h10a6 6 0 0 1 0 12" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'reset' && <Path d="M20 9a8 8 0 1 0 0 6 M20 3v6h-6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'play' && <Path d="m9 5 10 7-10 7Z" fill={color} />}
      {name === 'spark' && <><Path d="M12 2 14.8 9.2 22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z" stroke={color} strokeWidth={1.3} /><Circle cx={12} cy={12} r={2} fill={color} /></>}
    </Svg>
  );
}
