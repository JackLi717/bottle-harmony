import { memo } from 'react';
import Svg, { Defs, Ellipse, G, RadialGradient, Stop } from 'react-native-svg';
import type { BoardLayout } from '../ui/boardLayout';

export const StageArt = memo(function StageArt({ layout }: { layout: BoardLayout }) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${layout.width} ${layout.height}`} pointerEvents="none">
      <Defs>
        <RadialGradient id="stage-halo" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#397E89" stopOpacity={0.15} />
          <Stop offset="1" stopColor="#397E89" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={layout.width / 2} cy={215} rx={layout.width / 2 - 8} ry={200} fill="url(#stage-halo)" />
      {layout.positions.map(({ x: left, y: top }, index) => {
        const x = left + 50, y = top + 175;
        return (
        <G key={index}>
          <Ellipse cx={x} cy={y - 1} rx={39} ry={7} fill="#020D19" opacity={0.45} />
          <Ellipse cx={x} cy={y} rx={32} ry={5} fill="none" stroke="#C3AE7F" strokeOpacity={0.13} />
        </G>
        );
      })}
    </Svg>
  );
});
