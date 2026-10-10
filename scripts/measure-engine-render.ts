import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { androidFrameKey, parseAndroidFrames, type AndroidFrame } from './lib/androidFrameStats.ts';
import { parseRenderEvent, partitionRenderFrames } from './lib/androidRenderMarkers.ts';
import { measurement } from '../src/game/engineBenchmark.ts';

const [command, serial, argument, label] = process.argv.slice(2);
if (!['start', 'mark', 'stop'].includes(command) || !/^[a-zA-Z0-9_.:-]+$/.test(serial ?? '')) throw new Error('Usage: measure-engine-render.ts start <serial> <seconds:1-1800> [render_auto_id] | mark <serial> <render_run_id> <phase> | stop <serial> <render_run_id>');
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
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800) throw new Error('Invalid measurement duration');
  const attachedRunId = label;
  if (attachedRunId && !/^render_auto_\d+$/.test(attachedRunId)) throw new Error('Invalid attached workload identity');
  const runId = `render_${Date.now()}`, folder = resolve('builds/engine-upgrade', runId); mkdirSync(join(folder, 'frames'), { recursive: true });
  const save = (name: string, text: string) => writeFileSync(join(folder, name), text);
  const pid = run('shell', 'pidof', application).trim();
  if (!/^\d+$/.test(pid)) throw new Error('Expected one isolated acceptance process');
  const apk = run('shell', 'pm', 'path', application).trim().replace(/^package:/, '');
  if (!/^\/data\/app\/[a-zA-Z0-9_~=+./-]+\/base\.apk$/.test(apk)) throw new Error('Unexpected acceptance APK path');
  save('apk-sha256.txt', run('shell', 'sha256sum', apk));
  save('identity.json', JSON.stringify({ serial, pid, application, runId, attachedRunId, startHostMilliseconds: Date.now() }, null, 2));
  save('reset.txt', attachedRunId ? 'Attached read-only; existing native buffer preserved.\n' : run('shell', 'dumpsys', 'gfxinfo', application, 'reset'));
  const initial = run('shell', 'dumpsys', 'gfxinfo', application, 'framestats'), since = parseAndroidFrames(initial).since;
  if (!since) throw new Error('Missing graphics reset boundary');
  save('initial.txt', initial); save('markers.jsonl', '');
  const unique = new Map<string, AndroidFrame>(); let observations = 0, invalidObservations = 0, final = initial;
  const initialUptime = parseAndroidFrames(initial).uptimeMilliseconds;
  if (initialUptime === null) throw new Error('Missing initial native uptime');
  const log = spawn(adb, ['-s', serial, 'logcat', '-T', '1', '--pid=' + pid, '-s', 'ReactNativeJS:I', '-v', 'raw'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const liveRuns = new Set<string>(attachedRunId ? [attachedRunId] : []); let logBuffer = '', logError = '', renderEvents = 0, autoTerminal: string | null = null;
  save('render-events.jsonl', '');
  log.on('error', error => { logError = String(error); });
  log.on('exit', (code, signal) => { if (signal !== 'SIGTERM' && !logError) logError = `Render log ended unexpectedly (${code ?? signal})`; });
  log.stderr.on('data', chunk => { logError = (logError + chunk.toString()).slice(-4096); });
  log.stdout.on('data', chunk => {
    logBuffer += chunk.toString();
    if (logBuffer.length > 262144) { logError = 'Render log line exceeded bound'; logBuffer = ''; return; }
    const lines = logBuffer.split('\n'); logBuffer = lines.pop()!;
    for (const line of lines) {
      const event = parseRenderEvent(line);
      if (!event) continue;
      if (event.label === 'start:render') liveRuns.add(event.runId!);
      if (!liveRuns.has(event.runId!)) continue;
      if (renderEvents >= 4096) { logError = 'Render event budget exceeded'; continue; }
      appendFileSync(join(folder, 'render-events.jsonl'), JSON.stringify(event) + '\n'); renderEvents++;
      if (['complete:render', 'failed:render', 'cancel:render'].includes(event.label)) autoTerminal = event.label;
    }
  });
  const start = Date.now(); let nextResourceSample = 0, collectionError = '';
  console.log(JSON.stringify({ runId, folder, pid, status: 'collecting', seconds }));
  try {
    while (Date.now() - start < seconds * 1000 && !existsSync(join(folder, 'stop')) && !autoTerminal && !logError) {
      const begin = Date.now();
      const sample = run('shell', 'dumpsys', 'gfxinfo', application, 'framestats');
      if (!sample.includes(`Graphics info for pid ${pid} [`)) throw new Error('Acceptance process changed during UI measurement');
      final = sample;
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
  } catch (error) { collectionError = String(error); }
  finally { log.kill('SIGTERM'); await new Promise<void>(done => { log.once('close', () => done()); setTimeout(done, 1000); }); }
  try {
    const sample = run('shell', 'dumpsys', 'gfxinfo', application, 'framestats');
    if (!sample.includes(`Graphics info for pid ${pid} [`)) throw new Error('Acceptance process changed at render completion');
    final = sample;
  }
  catch (error) { collectionError ||= String(error); }
  const terminalFrames = parseAndroidFrames(final); invalidObservations += terminalFrames.invalidObservations;
  for (const frame of terminalFrames.frames) if (BigInt(frame.intendedVsync) >= BigInt(since)) unique.set(androidFrameKey(frame), frame);
  save('render-log-status.json', JSON.stringify({ renderEvents, logError, collectionError, exitCode: log.exitCode, signalCode: log.signalCode }));
  save('final.txt', final);
  const markers = readFileSync(join(folder, 'markers.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as { label: string; uptimeMilliseconds: number }).sort((a, b) => a.uptimeMilliseconds - b.uptimeMilliseconds);
  const automatic = readFileSync(join(folder, 'render-events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const finalUptime = parseAndroidFrames(final).uptimeMilliseconds;
  if (finalUptime === null) throw new Error('Missing final native uptime');
  const frames = [...unique.values()], groups = partitionRenderFrames(frames, [...markers, ...automatic], initialUptime, finalUptime);
  const report = { format: 'engine-android-render-v2', runId, pid, wallMilliseconds: Date.now() - start, observations,
    renderEvents, autoTerminal, attachedRunId, renderLogError: logError, collectionError,
    note: 'Actual package frames; mirror:on/off markers identify USB mirroring intervals, otherwise unknown. FrameCompleted minus IntendedVsync in milliseconds. Flags=0 measured separately; flagged frames and raw rows retained. Recent native buffers are polled and deduplicated. Not display-present intervals, audio latency, power or peak-memory measurements.',
    invalidObservations, capturedFrames: frames.length, phases: groups.map(({ phase, mirroring, frames: values }) => ({ phase, mirroring,
      valid: measurement(values.filter(frame => frame.flags === 0).map(frame => frame.milliseconds)),
      allFlags: measurement(values.map(frame => frame.milliseconds)), flaggedFrames: values.filter(frame => frame.flags !== 0).length })) };
  save('frames.json', JSON.stringify(frames)); save('report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
