import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const serial = process.argv[2];
const diagnose = process.argv[3] === '--diagnose';
if (!serial || !/^[a-zA-Z0-9_.:-]+$/.test(serial) || (process.argv[3] && !diagnose) || process.argv.length > 4) throw new Error('Usage: node --experimental-strip-types scripts/benchmark-engine-android.ts <adb-serial> [--diagnose]');
const adb = process.env.ADB ?? join(homedir(), 'Library/Android/sdk/platform-tools/adb');
const application = 'com.bottleharmony.engineacceptance', runId = `${diagnose ? 'diagnostic' : 'engine'}_${Date.now()}`;
const output = resolve('builds/engine-upgrade', runId); mkdirSync(output, { recursive: true });
const run = (...args: string[]) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
const save = (name: string, value: string) => writeFileSync(join(output, name), value);
const packageInfo = run('shell', 'dumpsys', 'package', application);
if (!packageInfo.includes('EngineBenchmarkReceiver')) throw new Error('Install the isolated headless acceptance Release before measuring');
save('package.txt', packageInfo);
const apkPath = run('shell', 'pm', 'path', application).trim().replace(/^package:/, '');
if (!/^\/data\/app\/[a-zA-Z0-9_~=+./-]+\/base\.apk$/.test(apkPath)) throw new Error('Unexpected acceptance APK path');
save('apk-sha256.txt', run('shell', 'sha256sum', apkPath));
save('start.txt', run('shell', 'am', 'start', '-W', '-n', `${application}/.MainActivity`));
const pid = run('shell', 'pidof', application).trim();
if (!/^\d+$/.test(pid)) throw new Error('Expected exactly one acceptance process');
save('memory-before.txt', run('shell', 'dumpsys', 'meminfo', application));
save('battery-before.txt', run('shell', 'dumpsys', 'battery'));
save('broadcast.txt', run('shell', 'am', 'broadcast', '-a', `${application}.BENCHMARK`, '-n', `${application}/.EngineBenchmarkReceiver`, '--es', 'runId', runId));
console.log(JSON.stringify({ runId, output, serial, pid, status: 'running' }));
const begin = Date.now(); let logs = '';
for (;;) {
  logs = run('logcat', '-d', `--pid=${pid}`, '-v', 'brief'); save('logcat.txt', logs);
  if (logs.includes('FATAL EXCEPTION')) throw new Error('Acceptance process crashed; raw logs retained');
  const failure = logs.split('\n').find(line => line.includes(`ENGINE_DEVICE_ERROR ${runId} `));
  if (failure) throw new Error(failure);
  if (logs.includes(`ENGINE_DEVICE_DONE ${runId}`)) break;
  if (Date.now() - begin > 125000) throw new Error('Native benchmark timed out; raw logs retained');
  await new Promise<void>(done => setTimeout(done, 1000));
}
const chunks = new Map<number, string>(); let count = 0;
for (const line of logs.split('\n')) {
  const marker = `ENGINE_DEVICE_CHUNK ${runId} `, offset = line.indexOf(marker);
  if (offset < 0) continue;
  const match = /^(\d+)\/(\d+) (.*)$/.exec(line.slice(offset + marker.length));
  if (!match) throw new Error('Malformed native benchmark chunk');
  const index = Number(match[1]), total = Number(match[2]);
  if (total > 128 || index >= total || (count && count !== total) || chunks.has(index)) throw new Error('Invalid or duplicate native benchmark chunk');
  count = total; chunks.set(index, match[3]);
}
if (!count || chunks.size !== count) throw new Error('Incomplete native benchmark output');
const report = JSON.parse(Array.from({ length: count }, (_, i) => chunks.get(i)).join(''));
if (report.runtime !== 'android' || report.hermes !== true || report.appState !== 'active' || report.storage?.status !== 'measured') throw new Error('Native runtime/storage evidence missing');
save('report.json', JSON.stringify(report, null, 2));
save('memory-after.txt', run('shell', 'dumpsys', 'meminfo', application));
save('battery-after.txt', run('shell', 'dumpsys', 'battery'));
console.log(JSON.stringify({ output, appState: report.appState, operations: report.operations, history: report.history, storage: report.storage,
  searches: report.searches.map((s: { id: string; samples: { status: string }[] }) => ({ id: s.id, statuses: s.samples.map(r => r.status) })), hints: report.hints }, null, 2));
