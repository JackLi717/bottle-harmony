import type { ColorId } from '../game/rules';

export const LIQUIDS: Record<ColorId, { light: string; main: string; dark: string; name: string }> = {
  jade: { light: '#9CFFE1', main: '#32D8B3', dark: '#087D84', name: '青绿色' },
  coral: { light: '#FFC1B0', main: '#FF857F', dark: '#B03D63', name: '珊瑚红' },
};
