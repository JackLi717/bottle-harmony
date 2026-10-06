import { mkdirSync, writeFileSync } from 'node:fs';
import { BOTTLE_INSIDE, BOTTLE_SHELL } from '../src/art/bottleDesign.ts';
import { liquidPath } from '../src/art/liquidGeometry.ts';
import { LIQUIDS } from '../src/art/palette.ts';
import type { ColorId } from '../src/game/rules.ts';

const definitions = `<linearGradient id="glass"><stop stop-color="#63B4C0" stop-opacity=".34"/><stop offset=".2" stop-color="#C0E7E7" stop-opacity=".09"/><stop offset=".7" stop-color="#091C35" stop-opacity=".08"/><stop offset="1" stop-color="#83BBD2" stop-opacity=".26"/></linearGradient><linearGradient id="rim" x2=".8" y2="1"><stop stop-color="#F2F1CE"/><stop offset=".4" stop-color="#8EC5CE"/><stop offset="1" stop-color="#315670"/></linearGradient><clipPath id="inside"><path d="${BOTTLE_INSIDE}"/></clipPath>` + Object.entries(LIQUIDS).map(([name, c]) => `<linearGradient id="${name}" x2="1" y2=".45"><stop stop-color="${c.dark}"/><stop offset=".22" stop-color="${c.main}"/><stop offset=".7" stop-color="${c.main}"/><stop offset="1" stop-color="${c.dark}"/></linearGradient>`).join('');

function bottle(colors: ColorId[], selected = false, completed = false, tilt = 0) {
  const liquid = colors.map((color, i) => colors[i + 1] === color ? '' : `<path d="${liquidPath(i + 1, tilt)}" fill="url(#${color})" stroke="#FFF" stroke-opacity=".075" stroke-width=".5"/>`).reverse().join('');
  return `<g transform="rotate(${tilt} 50 96)"><path d="${BOTTLE_SHELL}" fill="url(#glass)" stroke="${completed ? '#E8CB8C' : selected ? '#B8F7E2' : '#82B1C4'}" stroke-width="${selected ? 2.1 : 1.3}"/><g clip-path="url(#inside)">${liquid}${colors.length && !tilt ? `<ellipse cx="50" cy="${162 - 24 * colors.length}" rx="27.5" ry="3.5" fill="#FFF" opacity=".4"/>` : ''}</g><path d="M31 62 Q27 68 27 77 V147 Q27 155 33 157" fill="none" stroke="#E9FFFF" stroke-width="2.8" stroke-opacity=".25" stroke-linecap="round"/><path d="M73 80 V142" fill="none" stroke="#DEF6F7" stroke-width="1.4" stroke-opacity=".11" stroke-linecap="round"/><path d="M40 42 Q38 49 30 55" fill="none" stroke="#F0FFFF" stroke-width="1.8" stroke-opacity=".24"/><path d="M27 162 Q50 169 73 162" fill="none" stroke="#9FDEDC" stroke-width="1.7" stroke-opacity=".48"/><ellipse cx="50" cy="28" rx="17" ry="5.8" fill="#183447" stroke="url(#rim)" stroke-width="2.5"/><ellipse cx="50" cy="28" rx="11.5" ry="3.3" fill="#081C2C" stroke="#72ACBC" stroke-width=".7"/><path d="M34 27 Q50 19 66 27" fill="none" stroke="#EAF4E0" stroke-width="1.1" stroke-opacity=".75"/></g>`;
}

mkdirSync('assets/art', { recursive: true });
const samples: { colors: ColorId[]; label: string; selected?: boolean; completed?: boolean; tilt?: number }[] = [
  { colors: [], label: 'EMPTY' },
  { colors: ['jade', 'coral', 'jade', 'coral'], label: 'MIXED' },
  { colors: ['jade', 'coral', 'jade', 'coral'], label: 'SELECTED', selected: true },
  { colors: ['jade', 'jade', 'jade', 'jade'], label: 'COMPLETE', completed: true },
  { colors: ['jade', 'coral', 'jade'], label: 'POUR / 55°', tilt: 55 },
];
writeFileSync('assets/art/bottle-study.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="650" viewBox="0 0 1200 650"><defs>${definitions}<linearGradient id="bg" x2="0" y2="1"><stop stop-color="#102B37"/><stop offset="1" stop-color="#111C30"/></linearGradient></defs><rect width="1200" height="650" fill="url(#bg)"/><text x="64" y="73" fill="#EFE6CD" font-family="Helvetica,Arial,sans-serif" font-size="28" letter-spacing="5">BOTTLE HARMONY</text><text x="64" y="105" fill="#96ACA9" font-family="Helvetica,Arial,sans-serif" font-size="13" letter-spacing="3">GLASS / LIQUID / MOVEMENT</text>${samples.map((sample, i) => `<g transform="translate(${48 + i * 225} 177) scale(1.65)">${bottle(sample.colors, sample.selected, sample.completed, sample.tilt)}</g><text x="${130 + i * 225}" y="520" text-anchor="middle" fill="#B7C8C2" font-family="Helvetica,Arial,sans-serif" font-size="12" letter-spacing="2">${sample.label}</text>`).join('')}<circle cx="72" cy="594" r="8" fill="${LIQUIDS.jade.main}"/><text x="91" y="599" fill="#96ACA9" font-family="Helvetica,Arial,sans-serif" font-size="12">JADE</text><circle cx="190" cy="594" r="8" fill="${LIQUIDS.coral.main}"/><text x="209" y="599" fill="#96ACA9" font-family="Helvetica,Arial,sans-serif" font-size="12">CORAL</text><text x="1136" y="599" text-anchor="end" fill="#748D92" font-family="Helvetica,Arial,sans-serif" font-size="12">Original vector artwork · shared with the mobile demo</text></svg>\n`);

// Individual transparent glass asset for reuse and review. Liquid is dynamic.
writeFileSync('assets/art/bottle-glass.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="360" viewBox="0 0 100 180"><defs>${definitions}</defs>${bottle([])}</svg>\n`);
console.log('Wrote assets/art/bottle-study.svg and bottle-glass.svg');
