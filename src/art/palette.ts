import type { ColorId } from '../game/rules';

// Fixed launch palette; logical IDs and symbols stay stable across visual changes.
// Shadows use 76% of the main RGB; highlights mix 55% white without shifting hue.
export const LIQUIDS: Record<ColorId, { light: string; main: string; dark: string; name: string }> = {
  jade: { light: '#9CEBDB', main: '#22D3B0', dark: '#1AA086', name: '薄荷青' },
  coral: { light: '#FDB0B7', main: '#FA5060', dark: '#BE3D49', name: '亮红' },
  amber: { light: '#FBECAC', main: '#F5D547', dark: '#BAA236', name: '柠檬黄' },
  azure: { light: '#A4E1F6', main: '#35BCEB', dark: '#288FB3', name: '晴空蓝' },
  violet: { light: '#DEC7F7', main: '#B682EE', dark: '#8A63B5', name: '明紫' },
  rose: { light: '#F8BCE1', main: '#F06BBD', dark: '#B65190', name: '莓果粉' },
  tangerine: { light: '#FFCEA1', main: '#FF912F', dark: '#C26E24', name: '鲜橙' },
  lime: { light: '#D1EEAE', main: '#98D94B', dark: '#74A539', name: '嫩草绿' },
  indigo: { light: '#AEBBED', main: '#4B68D8', dark: '#394FA4', name: '宝石蓝' },
  cocoa: { light: '#D8C0B0', main: '#A8734F', dark: '#80573C', name: '焦糖棕' },
  silver: { light: '#F0F3F2', main: '#DDE5E2', dark: '#A8AEAC', name: '珍珠白' },
};

export const LIQUID_SYMBOLS: Record<ColorId, string> = { jade: '●', coral: '▲', amber: '■', azure: '◆', violet: '★', rose: '♥', tangerine: '✚', lime: '✿', indigo: '☾', cocoa: '≋', silver: '✦' };
