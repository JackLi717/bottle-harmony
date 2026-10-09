import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName = 'mixer' | 'eye' | 'eye-off' | 'language' | 'back' | 'previous' | 'next' | 'undo' | 'reset' | 'play' | 'spark' | 'hint' | 'fire' | 'settings' | 'levels' | 'close' | 'trophy' | 'lock';
export function Icon({ name, color = '#FFF2D4', size = 22 }: { name: IconName; color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'mixer' && <><Path d="M5 8h14l-2 13H7Z M4 8h16 M8 14h8" stroke={color} strokeWidth={1.6} strokeLinejoin="round" /><Path d="M12 2c-3 3-3 5 0 5s3-2 0-5Z" fill={color} /></>}
      {(name === 'eye' || name === 'eye-off') && <><Path d="M2 12 Q12 -2 22 12 Q12 26 2 12Z" stroke={color} strokeWidth={1.6} /><Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={1.6} />{name === 'eye-off' && <Path d="M3 3 21 21" stroke={color} strokeWidth={2} strokeLinecap="round" />}</>}
      {name === 'language' && <><Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.5} /><Path d="M3 12h18 M12 3c-6 5-6 13 0 18 M12 3c6 5 6 13 0 18" stroke={color} strokeWidth={1.3} /></>}
      {name === 'back' && <Path d="m14 5-7 7 7 7 M7 12h13" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'previous' && <Path d="m15 5-7 7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'next' && <Path d="m9 5 7 7-7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'undo' && <Path d="M9 4 3 10l6 6 M3 10h11a5 5 0 0 1 0 10h-3" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'reset' && <Path d="M20 9a8 8 0 1 0 0 6 M20 3v6h-6" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />}
      {name === 'play' && <Path d="m9 5 10 7-10 7Z" fill={color} />}
      {name === 'spark' && <><Path d="M12 2 14.8 9.2 22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z" stroke={color} strokeWidth={1.3} /><Circle cx={12} cy={12} r={2} fill={color} /></>}
      {name === 'hint' && <><Path d="M8 16c0-3-3-3.5-3-7a7 7 0 0 1 14 0c0 3.5-3 4-3 7Z" stroke={color} strokeWidth={1.6} /><Path d="M9 19h6 M10 22h4" stroke={color} strokeWidth={2} strokeLinecap="round" /><Path d="m9 9 3 3 3-3 M12 12v4" stroke={color} strokeWidth={1.5} strokeLinecap="round" /></>}
      {name === 'fire' && <><Path d="M12 22c4.5 0 7-3.2 7-7 0-2.7-1.3-5.1-3.4-7.4.1 2.3-.7 3.5-1.8 4.2C13.5 7.5 11.5 4.2 9 2c.3 3.2-1 4.9-2.5 6.7C5 10.4 5 12.3 5 15c0 3.8 2.5 7 7 7Z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" /><Path d="M12 21c2 0 3.1-1.5 3.1-3.2 0-1.5-.7-2.8-2.3-4.1-.1 1.4-.6 2.1-1.4 2.6-.2-1.3-.8-2.4-1.5-3.2-.1 1.3-.7 2.2-1.3 3.2-.4.6-.6 1.2-.6 2 0 1.8 1.2 2.7 4 2.7Z" fill={color} /></>}
      {name === 'levels' && [3, 14].flatMap(x => [3, 14].map(y => <Rect key={`${x}-${y}`} x={x} y={y} width={7} height={7} rx={2} stroke={color} strokeWidth={1.5} />))}
      {name === 'settings' && <><Path d="m9 3-.7 2.5-2 1.2-2.5-.6-2 3.5 1.8 1.8v2.3l-1.8 1.8 2 3.5 2.5-.6 2 1.2L9 22h5l.7-2.5 2-1.2 2.5.6 2-3.5-1.8-1.8v-2.3l1.8-1.8-2-3.5-2.5.6-2-1.2L14 3Z" stroke={color} strokeWidth={1.4} strokeLinejoin="round" /><Circle cx={11.5} cy={12.5} r={3.3} stroke={color} strokeWidth={1.4} /></>}
      {name === 'close' && <Path d="m6 6 12 12 M18 6 6 18" stroke={color} strokeWidth={1.7} strokeLinecap="round" />}
      {name === 'lock' && <><Path d="M7 10V7a5 5 0 0 1 10 0v3" stroke={color} strokeWidth={1.7} /><Rect x={4} y={10} width={16} height={12} rx={3} fill={color} /><Circle cx={12} cy={15} r={1.8} fill="#30294E" /></>}
      {name === 'trophy' && <><Path d="M6 3h12v6c0 5-3 7-6 7S6 14 6 9Z M10 16h4v4h-4Z M7 20h10v2H7Z" fill={color} /><Path d="M6 5H2v3q0 5 6 5 M18 5h4v3q0 5-6 5" stroke={color} strokeWidth={2} strokeLinejoin="round" /><Path d="m12 5 1.1 2.3 2.6.4-1.9 1.8.4 2.6-2.2-1.2-2.2 1.2.4-2.6-1.9-1.8 2.6-.4Z" fill="#BC7628" /></>}
    </Svg>
  );
}
