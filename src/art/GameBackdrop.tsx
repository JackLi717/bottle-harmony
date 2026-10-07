import { memo } from 'react';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

/** Soft light over charcoal, without illustrated objects or ornamental outlines. */
export const GameBackdrop = memo(function GameBackdrop({ width, height }: { width: number; height: number }) {
  return <Svg pointerEvents="none" width={width} height={height} viewBox="0 0 400 860" preserveAspectRatio="xMidYMid slice">
    <Defs>
      <RadialGradient id="game-atmosphere"><Stop offset="0" stopColor="#25424B" stopOpacity={.24} /><Stop offset="1" stopColor="#172A36" stopOpacity={0} /></RadialGradient>
      <RadialGradient id="game-top-light"><Stop offset="0" stopColor="#BCA578" stopOpacity={.045} /><Stop offset="1" stopColor="#BCA578" stopOpacity={0} /></RadialGradient>
    </Defs>
    <Ellipse cx={200} cy={430} rx={265} ry={320} fill="url(#game-atmosphere)" />
    <Ellipse cx={200} cy={95} rx={225} ry={180} fill="url(#game-top-light)" />
  </Svg>;
});
