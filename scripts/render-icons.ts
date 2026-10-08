import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const background = '#061F3E';
const size = 1024;
// Android guarantees the central 66 dp circle of the 108 dp layer.
const safeRadius = Math.floor(size * 33 / 108) - 8;

async function adaptiveLayer(input: Buffer) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let radius = 1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 8) {
        radius = Math.max(radius, Math.hypot(x - info.width / 2, y - info.height / 2));
      }
    }
  }
  const factor = safeRadius / radius;
  const width = Math.floor(info.width * factor);
  const height = Math.floor(info.height * factor);
  return sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
    .composite([{ input: await sharp(input).resize(width, height).png().toBuffer(), gravity: 'centre' }])
    .png().toBuffer();
}

export async function renderIcons() {
  const master = 'assets/brand/icon-master.png';
  await sharp(master).resize(size, size).flatten({ background }).removeAlpha().png().toFile('assets/icon.png');
  await sharp(master).resize(512, 512).flatten({ background }).ensureAlpha().png({ compressionLevel: 9 }).toFile('store/google-play/icon-512.png');
  await sharp(master).resize(64, 64).flatten({ background }).removeAlpha().png().toFile('assets/favicon.png');
  const foreground = await adaptiveLayer(readFileSync('assets/brand/icon-foreground-source.png'));
  await sharp(foreground).toFile('assets/android-icon-foreground.png');
  await sharp({ create: { width: size, height: size, channels: 3, background } }).png().toFile('assets/android-icon-background.png');

  // Convert the generated black/white source to an alpha-only system tint mask.
  const mono = await sharp('assets/brand/icon-monochrome-source.png').removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(mono.info.width * mono.info.height * 4, 255);
  for (let i = 0; i < mono.data.length; i++) {
    rgba[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, (mono.data[i] - 32) / 191)) * 255);
  }
  const monoSource = await sharp(rgba, { raw: { width: mono.info.width, height: mono.info.height, channels: 4 } }).png().toBuffer();
  const monochrome = await adaptiveLayer(monoSource);
  await sharp(monochrome).toFile('assets/android-icon-monochrome.png');

  const windowSize = Math.round(size * 72 / 108);
  const inset = Math.floor((size - windowSize) / 2);
  const composited = await sharp('assets/android-icon-background.png').composite([{ input: foreground }]).png().toBuffer();
  const launcher = await sharp(composited)
    .extract({ left: inset, top: inset, width: windowSize, height: windowSize }).resize(256, 256).png().toBuffer();
  const circle = Buffer.from('<svg width="256" height="256"><circle cx="128" cy="128" r="128" fill="white"/></svg>');
  const round = await sharp(launcher).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  const tinted = await sharp({ create: { width: size, height: size, channels: 4, background: '#2C4842' } })
    .composite([{ input: monochrome }]).png().toBuffer();
  const themeSquare = await sharp(tinted).extract({ left: inset, top: inset, width: windowSize, height: windowSize })
    .resize(256, 256).png().toBuffer();
  const themed = await sharp(themeSquare).composite([{ input: circle, blend: 'dest-in' }]).png().toBuffer();
  const store = await sharp(master).resize(256, 256).png().toBuffer();
  await sharp({ create: { width: 1120, height: 320, channels: 3, background: '#E8ECEF' } })
    .composite([store, launcher, round, themed].map((input, i) => ({ input, left: 16 + i * 280, top: 16 })))
    .png().toFile('assets/brand/icon-export-preview.png');

  const paths = ['assets/icon.png', 'assets/android-icon-foreground.png', 'assets/android-icon-background.png', 'assets/android-icon-monochrome.png', 'assets/favicon.png', 'store/google-play/icon-512.png'];
  const outputs = await Promise.all(paths.map(async (path) => {
    const bytes = readFileSync(path);
    const metadata = await sharp(bytes).metadata();
    return { path, width: metadata.width, height: metadata.height, channels: metadata.channels, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  writeFileSync('assets/brand/icon-exports.json', JSON.stringify({ design: 'Selected graphic comparison candidate 4', background, adaptiveSafeRadius: safeRadius, outputs }, null, 2) + '\n');
  console.log('Approved icon exports generated; build and Console upload are separate steps.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await renderIcons();
