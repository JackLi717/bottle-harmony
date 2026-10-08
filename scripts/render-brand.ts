import sharp from 'sharp';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { BOTTLE_INSIDE, BOTTLE_SHELL } from '../src/art/bottleDesign.ts';
import { liquidPath } from '../src/art/liquidGeometry.ts';
import { renderIcons } from './render-icons.ts';

const colors = ['#36D6B1', '#ECBA62', '#8D91EE', '#F08087'];
const defs = `<radialGradient id="bg"><stop stop-color="#254E5C"/><stop offset="1" stop-color="#091927"/></radialGradient><linearGradient id="glass"><stop stop-color="#D3F5ED" stop-opacity=".3"/><stop offset=".35" stop-color="#B7E9F2" stop-opacity=".07"/><stop offset="1" stop-color="#84CDDC" stop-opacity=".23"/></linearGradient><linearGradient id="gold" x2="1" y2="1"><stop stop-color="#FFF3C7"/><stop offset=".5" stop-color="#D8B777"/><stop offset="1" stop-color="#9E793D"/></linearGradient><clipPath id="cavity"><path d="${BOTTLE_INSIDE}"/></clipPath>`;
function vessel(x: number, y: number, scale: number, layers: number[], complete = false) {
  const liquid = layers.map((color, i) => `<path d="${liquidPath(i + 1, 0)}" fill="${colors[color]}"/>`).reverse().join('');
  return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="${BOTTLE_SHELL}" fill="url(#glass)" stroke="${complete ? 'url(#gold)' : '#A4CED7'}" stroke-width="1.7"/><g clip-path="url(#cavity)">${liquid}</g><path d="M30 63 Q27 70 27 79 V146 Q27 154 33 157" stroke="#EAFFFF" stroke-opacity=".45" stroke-width="2.6" stroke-linecap="round" fill="none"/><path d="M72 77 V145" stroke="#FFF" stroke-opacity=".19" fill="none"/><ellipse cx="50" cy="28" rx="16" ry="5" fill="#152E3E" stroke="url(#gold)" stroke-width="1.8"/><ellipse cx="50" cy="28" rx="10.5" ry="2.6" fill="#071823"/><path d="M29 163 Q50 169 71 163" stroke="#C8F7EF" stroke-opacity=".5" fill="none"/></g>`;
}
function svg(body: string, width = 1024, height = 1024) { return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${body}</svg>`; }
mkdirSync('assets/brand', { recursive: true });
mkdirSync('store/google-play', { recursive: true });
await renderIcons();
const feature = svg('<rect width="1024" height="500" fill="url(#bg)"/><circle cx="800" cy="260" r="202" fill="none" stroke="#DEC797" stroke-opacity=".15"/><text x="58" y="202" fill="#EBD8AD" font-family="Georgia, serif" font-size="57">Bottle Harmony</text><text x="62" y="252" fill="#B9D1D3" font-family="sans-serif" font-size="23">Sort. Think. Unwind.</text><path d="M62 280H405" stroke="#DEC797" stroke-opacity=".35"/>' + vessel(550, 63, 2.15, [0, 3, 2, 1]) + vessel(690, 43, 2.15, [0, 0, 0, 0], true) + vessel(830, 63, 2.15, [1, 2, 3, 1]), 1024, 500);
writeFileSync('assets/brand/feature.svg', feature);
await sharp(Buffer.from(feature)).flatten({ background: '#091927' }).removeAlpha().png().toFile('store/google-play/feature-1024x500.png');
// A local standalone page shares the exact policy content shown inside the app.
const policy = JSON.parse(readFileSync('src/config/privacy.json', 'utf8'));
const info = JSON.parse(readFileSync('src/config/publishing.json', 'utf8'));
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sections = () => `<section lang="en"><h2>${escape(policy.en.title)}</h2><p>${escape(policy.en.introduction)}</p>${policy.en.sections.map((s: { title: string; body: string }) => `<h3>${escape(s.title)}</h3><p>${escape(s.body)}</p>`).join('')}</section>`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Bottle Harmony — Privacy Policy</title><style>body{margin:0;background:#0b1b2f;color:#d7e3e7;font:17px/1.7 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:40px 22px}h1,h2,h3{color:#ebd8ad;line-height:1.3}h1{font-size:34px}h2{margin-top:40px}h3{font-size:20px;margin-bottom:8px}p{margin-top:8px}a{color:#bde9d8}footer{border-top:1px solid #355364;margin-top:36px;padding-top:20px}section+section{border-top:1px solid #355364;margin-top:50px}</style><main><h1>Bottle Harmony</h1><p>${escape(info.developer)} · Updated ${escape(info.policyDate)}</p>${sections()}<footer>Contact: <a href="mailto:${escape(info.supportEmail)}">${escape(info.supportEmail)}</a></footer></main></html>`;
mkdirSync('store/website/bottle-harmony', { recursive: true });
writeFileSync('store/website/bottle-harmony/privacy.html', html);
console.log('Approved icon, Play feature graphic and English privacy page generated.');
