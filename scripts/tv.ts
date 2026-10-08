import { cpSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const platform = process.argv[2] ?? 'all';
const run = process.argv.includes('--run');
if (!['all', 'ios', 'android'].includes(platform) || (run && platform === 'all')) throw new Error('Use tv.ts [all|ios|android] [--run]');
const project = resolve(import.meta.dirname, '..');
const target = resolve(project, 'builds/tv');
mkdirSync(target, { recursive: true });
for (const file of ['App.tsx', 'index.ts', 'package.json', 'package-lock.json', '.npmrc', 'app.json', 'app.config.js', 'tsconfig.json', 'babel.config.js', 'metro.config.js', 'src', 'assets', 'plugins']) {
  if (existsSync(resolve(project, file))) cpSync(resolve(project, file), resolve(target, file), { recursive: true });
}
if (!existsSync(resolve(target, 'node_modules'))) symlinkSync(resolve(project, 'node_modules'), resolve(target, 'node_modules'), 'dir');
const env = { ...process.env, EXPO_TV: '1' };
function expo(args: string[]) {
  const result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), ...args], { cwd: target, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Clean only this generated TV snapshot, preserving the mobile native projects.
expo(['prebuild', '--clean', '--platform', platform]);
if (run) expo([`run:${platform}`]);
console.log(`TV project: ${target}`);
