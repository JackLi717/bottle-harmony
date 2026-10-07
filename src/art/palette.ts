import type { ColorId } from '../game/rules';

export const LIQUIDS: Record<ColorId, { light: string; main: string; dark: string; name: string }> = {
  jade: { light: '#9CFFE1', main: '#32D8B3', dark: '#087D84', name: '青绿色' },
  coral: { light: '#FFC1B0', main: '#FF857F', dark: '#B03D63', name: '珊瑚红' },
  amber: { light: '#FFECC0', main: '#EABD54', dark: '#94691D', name: '琥珀黄' },
  azure: { light: '#B5DFFF', main: '#599FDE', dark: '#245284', name: '天蓝色' },
  violet: { light: '#E3CDFF', main: '#A583D7', dark: '#604080', name: '紫罗兰' },
  rose: { light: '#FFBFE8', main: '#D950A1', dark: '#8C2867', name: '玫瑰粉' },
  tangerine: { light: '#FFD29D', main: '#EF9240', dark: '#AA521E', name: '橙色' },
  lime: { light: '#D5F7AE', main: '#8DB94A', dark: '#4B7320', name: '草绿色' },
  indigo: { light: '#BAC3FF', main: '#525EB9', dark: '#282D77', name: '靛蓝色' },
  cocoa: { light: '#DABBA5', main: '#AC795C', dark: '#654534', name: '可可棕' },
  silver: { light: '#F6F7EE', main: '#BEC7C8', dark: '#73868D', name: '银灰色' },
};

export const LIQUID_SYMBOLS: Record<ColorId, string> = { jade: '●', coral: '▲', amber: '■', azure: '◆', violet: '★', rose: '♥', tangerine: '✚', lime: '✿', indigo: '☾', cocoa: '≋', silver: '✦' };
