import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { Point } from './liquidGeometry';
import type { ContainerRestraintState } from './containerRestraintState';

/** Shared floor fixture: never covers the mouth or the known liquid. */
export function RestraintBase({ width, height, fill, edge, children }: {
  width: number; height: number; fill: string; edge: string; children?: ReactNode;
}) {
  return <G>
    <Ellipse cx={width / 2} cy={height - 3.5} rx={width / 2 - 2} ry={3.2} fill={fill} stroke={edge} strokeWidth={.75} />
    {[3, width - 7].map(x => <G key={x}>
      <Rect x={x} y={height - 18} width={4} height={15} rx={1} fill={fill} stroke={edge} strokeWidth={.65} />
      <Circle cx={x + 2} cy={height - 6} r={.9} fill="#152736" stroke="#D2DCE0" strokeWidth={.35} />
    </G>)}
    {children}
  </G>;
}

/** Permanent permission fixture, independent of key/cloth triggers and animation clocks. */
export const ContainerRestraint = memo(function ContainerRestraint({ state, position, scale, id }: {
  state: ContainerRestraintState; position: Point; scale: number; id: string;
}) {
  if (state !== 'receive-only' && state !== 'sealed' && state !== 'fixed') return null;
  const metal = id + '-fixture-metal';
  return <View pointerEvents="none" style={{ position: 'absolute', left: (position.x + 18) * scale, top: (position.y + 16) * scale, width: 64 * scale, height: 158 * scale, zIndex: 2 }}>
    <Svg width="100%" height="100%" viewBox="0 0 64 158">
      <Defs><LinearGradient id={metal} x1="0" y1="0" x2="1" y2=".1">
        <Stop stopColor="#233746" /><Stop offset=".3" stopColor="#A8BCC7" /><Stop offset=".55" stopColor="#D9E3E6" /><Stop offset="1" stopColor="#425969" />
      </LinearGradient></Defs>
      <RestraintBase width={64} height={158} fill={'url(#' + metal + ')'} edge="#8EA6B3">
        {state !== 'fixed' && <G transform="translate(54 143)">
          <Path d="M-3.5 -3 V-8 A3.5 3.5 0 0 1 3.5 -8 V-3" fill="none" stroke="#273F50" strokeWidth={2.6} />
          <Path d="M-3.5 -3 V-8 A3.5 3.5 0 0 1 3.5 -8 V-3" fill="none" stroke="#C9D6DB" strokeWidth={1.3} />
          <Rect x={-6.3} y={-3} width={12.6} height={11} rx={1.8} fill={'url(#' + metal + ')'} stroke="#273F50" strokeWidth={.7} />
          <Path d="M0 0 V4" stroke="#213A4B" strokeWidth={1.5} strokeLinecap="round" />
        </G>}
        {state === 'receive-only' && <G>
          <Path d="M32 139 V150 M28.5 146.5 L32 150 L35.5 146.5" fill="none" stroke="#D5F0E7" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M27 153 H37" stroke="#1B3D47" strokeWidth={.8} />
        </G>}
      </RestraintBase>
    </Svg>
  </View>;
});
