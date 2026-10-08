import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { VESSELS } from '../src/art/vesselDesigns.ts';
import { boardLayout, bottleHitWidth, fitBoard } from '../src/ui/boardLayout.ts';

// Input is measured from the running web app via the browser's viewport and DOM.
// This audits resting geometry only; it does not replace native interaction tests.
const input = process.argv[2] ?? 'builds/device-compatibility/browser-matrix.json';
type Measurement = { size: { width: number; height: number }; stage: { width: number; height: number; y: number } };
const measurements = JSON.parse(readFileSync(input, 'utf8')) as Measurement[];
const bounds = [];
for (const vessel of VESSELS) {
  const details = vessel.details.filter(detail => detail.glass).map(detail => `<path d="${detail.path}" fill="white"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1800" viewBox="0 0 100 180"><path d="${vessel.shell}" fill="white"/>${details}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = 0, top = info.height, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 0) {
      left = Math.min(left, x); right = Math.max(right, x + 1);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
  }
  bounds.push({ id: vessel.id, left: left / 10, right: right / 10, top: top / 10, bottom: bottom / 10 });
}
let cases = 0;
let minimumGap = Infinity;
for (const measurement of measurements) for (let count = 4; count <= 12; count++) {
  const layout = boardLayout(count);
  const { scale } = fitBoard(layout, measurement.stage, 0);
  const hit = bottleHitWidth(layout, scale);
  for (const vessel of bounds) {
    for (const [index, p] of layout.positions.entries()) {
      assert.ok((p.x + vessel.left) * scale >= 0, `${vessel.id} left edge`);
      assert.ok((p.x + vessel.right) * scale <= layout.width * scale, `${vessel.id} right edge`);
      assert.ok((p.y + vessel.bottom) * scale <= layout.height * scale, `${vessel.id} bottom edge`);
      const next = layout.positions[index + 1];
      if (next?.y === p.y) {
        const gap = (next.x + vessel.left - p.x - vessel.right) * scale;
        assert.ok(gap > 0, `${vessel.id} resting overlap`);
        assert.ok((next.x - p.x) * scale >= hit, 'hit region overlap');
        minimumGap = Math.min(minimumGap, gap);
      }
    }
    cases++;
  }
}
const result = { input, cases, minimumVisibleGap: minimumGap, bounds, scope: 'Resting filled silhouettes; excludes outlines, glow, moving art, native focus and physical devices.' };
writeFileSync('builds/device-compatibility/vessel-geometry.json', JSON.stringify(result, null, 2) + '\n');
console.log(`${cases} resting geometry cases passed; minimum visible gap ${minimumGap.toFixed(2)} logical units.`);
