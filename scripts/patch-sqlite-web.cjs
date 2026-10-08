/* global __dirname */
// expo-sqlite 57.0.4 writes the sync response length into one byte, truncating JSON
// above 255 bytes. Keep this narrow upstream correction reproducible after npm ci.
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const path = resolve(__dirname, '../node_modules/expo-sqlite/web/WorkerChannel.ts');
const before = 'resultArray.set(new Uint32Array([length]), 0);';
const after = 'new DataView(resultBuffer).setUint32(0, length, true);';
let source = readFileSync(path, 'utf8');
if (source.includes(before)) {
  source = source.replace(before, after);
  console.log('Applied expo-sqlite web sync length correction');
} else if (!source.includes(after)) {
  throw new Error('Review expo-sqlite WorkerChannel after dependency update');
}
// The iteration limit can expire before a worker is scheduled on a busy host.
// Use elapsed time for the existing timeout instead of CPU iteration counts.
if (!source.includes('const deadline = performance.now() + 30000;')) {
  if (!source.includes('let i = 0;') || !source.includes('i > 1_000_000') || !source.includes('i > 1000_000_000')) throw new Error('Review expo-sqlite sync timeout after update');
  source = source.replace('let i = 0;', 'let i = 0;\n  const deadline = performance.now() + 30000;')
    .replace('i > 1_000_000', 'i % 1024 === 0 && performance.now() > deadline')
    .replace('i > 1000_000_000', 'i % 1024 === 0 && performance.now() > deadline');
}
writeFileSync(path, source);
