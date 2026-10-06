import type { ColorId } from '../game/rules';

export const LIQUIDS: Record<ColorId, { light: string; main: string; dark: string; name: string }> = {
  jade: { light: '#9CFFE1', main: '#32D8B3', dark: '#087D84', name: '青绿色' },
  coral: { light: '#FFC1B0', main: '#FF857F', dark: '#B03D63', name: '珊瑚红' },
  amber: { light: '#FFECC0', main: '#EABD54', dark: '#94691D', name: '琥珀黄' },
  azure: { light: '#B5DFFF', main: '#599FDE', dark: '#245284', name: '天蓝色' },
  violet: { light: '#E3CDFF', main: '#A583D7', dark: '#604080', name: '紫罗兰' },
};
