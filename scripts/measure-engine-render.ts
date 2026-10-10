import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { androidFrameKey, parseAndroidFrames, type AndroidFrame } from './lib/androidFrameStats.ts';
import { measurement } from '../src/game/engineBenchmark.ts';

const [command, serial, argument, label] = process.argv.slice(2);
if (!['start', 'mark', 'stop'].includes(command) || !/^[a-zA-Z0-9_.:-]+$/.test(serial ?? '')) throw new Error('Usage: measure-engine-render.ts start <serial> <seconds:1-900> | mark <serial> <render_run_id> <phase> | stop <serial> <render_run_id>');
const adb = process.env.ADB ?? join(homedir(), 'Library/Android/sdk/platform-tools/adb'), application = 'com.bottleharmony.engineacceptance';
const run = (...args: string[]) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
if (command !== 'start') {
  if (!/^render_\d+$/.test(argument ?? '')) throw new Error('Invalid measurement run');
  const folder = resolve('builds/engine-upgrade', argument);
  if (!existsSync(join(folder, 'identity.json'))) throw new Error('No live measurement identity');
  if (JSON.parse(readFileSync(join(folder, 'identity.json'), 'utf8')).serial !== serial) throw new Error('Measurement device mismatch');
  if (existsSync(join(folder, 'report.json'))) throw new Error('Measurement already completed');
  if (command === 'stop') writeFileSync(join(folder, 'stop'), 'requested\n');
  else {
    if (!/^[a-zA-Z0-9:_-]{1,64}$/.test(label ?? '')) throw new Error('Invalid phase label');
    const raw = run('shell', 'dumpsys', 'gfxinfo', application), uptime = parseAndroidFrames(raw).uptimeMilliseconds;
    if (uptime === null) throw new Error('Missing Android uptime');
    appendFileSync(join(folder, 'markers.jsonl'), JSON.stringify({ label, uptimeMilliseconds: uptime, hostMilliseconds: Date.now() }) + '\n');
  }
} else {
  const seconds = Number(argument);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 900) throw new Error('Invalid measurement duration');
  const runId = `render_${Date.now()}`, folder = resolve('builds/engine-upgrade', runId); mkdirSync(join(folder, 'frames'), { recursive: true });
  const save = (name: string, text: string) => writeFileSync(join(folder, name), text);
  const pid = run('shell', 'pidof', application).trim();
  if (!/^\d+$/.test(pid)) throw new Error('Expected one isolated acceptance process');
  const apk = run('shell', 'pm', 'path', application).trim().replace(/^package:/, '');
  if (!/^\/data\/app\/[a-zA-Z0-9_~=+./-]+\/base\.apk$/.test(apk)) throw new Error('Unexpected acceptance APK path');
  save('apk-sha256.txt', run('shell', 'sha256sum', apk));
  save('identity.json', JSON.stringify({ serial, pid, application, runId, startHostMilliseconds: Date.now() }, null, 2));
  save('reset.txt', run('shell', 'dumpsys', 'gfxinfo', application, 'reset'));
  const initial = run('shell', 'dumpsys', 'gfxinfo', application, 'framestats'), since = parseAndroidFrames(initial).since;
  if (!since) throw new Error('Missing graphics reset boundary');
  save('initial.txt', initial); save('markers.jsonl', '');
  const unique = new Map<string, AndroidFrame>(); let observations = 0, invalidObservations = 0, final = initial;
  const start = Date.now(); let nextResourceSample = 0;
  console.log(JSON.stringify({ runId, folder, pid, status: 'collecting', seconds }));
  while (Date.now() - start < seconds * 1000 && !existsSync(join(folder, 'stop'))) {
    const begin = Date.now();
    final = run('shell', 'dumpsys', 'gfxinfo', application, 'framestats');
    if (!final.includes(`Graphics info for pid ${pid} [`)) throw new Error('Acceptance process changed during UI measurement');
    save(`frames/${String(observations).padStart(5, '0')}.txt`, final);
    const parsed = parseAndroidFrames(final); invalidObservations += parsed.invalidObservations;
    for (const frame of parsed.frames) if (BigInt(frame.intendedVsync) >= BigInt(since)) unique.set(androidFrameKey(frame), frame);
    observations++;
    if (Date.now() >= nextResourceSample) {
      save(`memory-${observations}.txt`, run('shell', 'dumpsys', 'meminfo', application));
      save(`battery-${observations}.txt`, run('shell', 'dumpsys', 'battery')); nextResourceSample = Date.now() + 30000;
    }
    await new Promise<void>(done => setTimeout(done, Math.max(1, 700 - (Date.now() - begin))));
  }
  save('final.txt', final);
  const markers = readFileSync(join(folder, 'markers.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as { label: string; uptimeMilliseconds: number }).sort((a, b) => a.uptimeMilliseconds - b.uptimeMilliseconds);
  const groups = new Map<string, AndroidFrame[]>(), frames = [...unique.values()];
  for (const frame of frames) {
    let phase = 'unmarked';
    for (const marker of markers) if (BigInt(Math.trunc(marker.uptimeMilliseconds)) * 1000000n <= BigInt(frame.intendedVsync)) phase = marker.label;
    const bucket = groups.get(phase) ?? []; bucket.push(frame); groups.set(phase, bucket);
  }
  const report = { format: 'engine-android-render-v1', runId, pid, wallMilliseconds: Date.now() - start, observations,
    note: 'Actual package frames under USB mirroring. FrameCompleted minus IntendedVsync in milliseconds. Flags=0 measured separately; flagged frames and raw rows retained. Recent native buffers are polled and deduplicated. Not display-present intervals, audio latency, power or peak-memory measurements.',
    invalidObservations, capturedFrames: frames.length, phases: [...groups].map(([phase, values]) => ({ phase,
      valid: measurement(values.filter(frame => frame.flags === 0).map(frame => frame.milliseconds)),
      allFlags: measurement(values.map(frame => frame.milliseconds)), flaggedFrames: values.filter(frame => frame.flags !== 0).length })) };
  save('frames.json', JSON.stringify(frames)); save('report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
