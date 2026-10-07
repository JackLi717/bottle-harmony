import { memo } from 'react';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import type { BoardLayout } from '../ui/boardLayout';

export const StageArt = memo(function StageArt({ layout }: { layout: BoardLayout }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${layout.width} ${layout.height}`} pointerEvents="none">
      <Defs>
        <RadialGradient id="stage-halo" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#3F8F91" stopOpacity={0.13} />
          <Stop offset="1" stopColor="#3F8F91" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={layout.width / 2} cy={215} rx={layout.width / 2 - 8} ry={200} fill="url(#stage-halo)" />
      <Circle cx={layout.width / 2} cy={205} r={148} fill="none" stroke="#A4CDB9" strokeOpacity={0.055} />
      <Circle cx={layout.width / 2} cy={205} r={123} fill="none" stroke="#A4CDB9" strokeOpacity={0.035} />
      {layout.positions.map(({ x: left, y: top }, index) => {
        const x = left + 50, y = top + 175;
        return (
        <G key={index}>
          <Ellipse cx={x} cy={y - 1} rx={39} ry={7} fill="#020D19" opacity={0.45} />
          <Ellipse cx={x} cy={y} rx={43} ry={10} fill="none" stroke="#9DB9BA" strokeOpacity={0.1} />
          <Line x1={x - 56} y1={y + 10} x2={x + 56} y2={y + 10} stroke="#B5C4AA" strokeOpacity={0.075} />
        </G>
        );
      })}
      {[[172, 33], [323, 112], [37, 264], [296, 337], [64, 23]].map(([x, y], index) => (
        <Path key={index} d={`M${x - 3} ${y} H${x + 3} M${x} ${y - 3} V${y + 3}`} stroke="#EDD7A2" strokeOpacity={0.25} strokeWidth={0.8} />
      ))}
    </Svg>
  );
});
