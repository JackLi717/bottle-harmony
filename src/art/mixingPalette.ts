import { LIQUIDS } from './palette';
import type { MixColor } from '../game/mixing';
function paint(main: string, name: string) {
  const rgb = [1, 3, 5].map(i => parseInt(main.slice(i, i + 2), 16));
  const hex = (values: number[]) => '#' + values.map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
  return { main, name, light: hex(rgb.map(n => n + (255 - n) * .55)), dark: hex(rgb.map(n => n * .76)) };
}
/** Curated recipe colors are independent of the eleven-color classic palette. */
export const MIXING_PALETTE: Record<MixColor, (typeof LIQUIDS)[string]> = {
  coral: paint('#ED566A', 'Red'), amber: paint('#F2CB52', 'Yellow'), indigo: paint('#5079D6', 'Blue'), silver: paint('#F1EFE5', 'White'),
  labOrange: paint('#ED9759', 'Apricot'), labGreen: paint('#72B58A', 'Sage'), labPurple: paint('#A28BD0', 'Lilac'),
  labPink: paint('#ECA4B9', 'Rose'), labSky: paint('#9BC7E7', 'Sky'), labCream: paint('#EAD99A', 'Cream'),
};

export const MIXING_SYMBOLS: Record<MixColor, string> = { coral: '▲', amber: '■', indigo: '☾', silver: '✦', labOrange: '✚', labGreen: '✿', labPurple: '★', labPink: '♥', labSky: '◆', labCream: '≋' };
