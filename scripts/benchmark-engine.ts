import { cpus, platform } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { benchmarkEngine } from '../src/game/engineBenchmark.ts';

const report = await benchmarkEngine(() => new Promise<void>(resolve => setImmediate(resolve)));
const output = { date: new Date().toISOString(), environment: { runtime: process.version, platform: platform(), arch: process.arch, cpu: cpus()[0]?.model }, ...report };
const path = resolve('builds/engine-upgrade/benchmark-node.json'); mkdirSync(resolve('builds/engine-upgrade'), { recursive: true });
writeFileSync(path, JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ path, operations: report.operations, history: report.history, searches: report.searches.map(r => ({ id: r.id, samples: r.samples.map(s => ({ status: s.status, activeMilliseconds: s.stats.activeMilliseconds, visited: s.stats.visited, maxSlice: s.slices.max })) })) }, null, 2));
