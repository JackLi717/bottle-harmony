import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('SQLite web sync bridge reuses successful buffers per worker and isolates late/error responses', () => {
  const source = readFileSync('node_modules/expo-sqlite/web/WorkerChannel.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  let allocations = 0, now = 0;
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  vm.runInNewContext(code, { exports, __DEV__: false, console, Atomics, Int32Array, Uint8Array, Uint32Array, DataView, TextEncoder, TextDecoder,
    SharedArrayBuffer: function (size: number) { allocations++; return new SharedArrayBuffer(size); },
    performance: { now: () => now += 20000 },
    require: (name: string) => name.includes('SyncSerializer') ? { serialize: JSON.stringify, deserialize: JSON.parse } : { Deferred: class {} },
  });
  type Message = { lockBuffer: SharedArrayBuffer; resultBuffer: SharedArrayBuffer; data: unknown };
  const reply = (m: Message, value: object) => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    new DataView(m.resultBuffer).setUint32(0, bytes.length, true);
    new Uint8Array(m.resultBuffer).set(bytes, 4); Atomics.store(new Int32Array(m.lockBuffer), 0, 2);
  };
  const received: Message[] = [];
  const worker = { postMessage(m: Message) { received.push(m); reply(m, { result: m.data }); } };
  const invoke = (w: object, data: string) => exports.invokeWorkerSync(w, 'test', data);
  for (let i = 0; i < 100; i++) assert.equal(invoke(worker, `row-${i}`), `row-${i}`);
  assert.equal(allocations, 2, '100 sequential small reads allocate only one lock and one response buffer');
  assert.equal(received[0].resultBuffer, received[99].resultBuffer);
  const other = { postMessage(m: Message) { reply(m, { result: m.data }); } };
  assert.equal(invoke(other, 'another-worker'), 'another-worker'); assert.equal(allocations, 4);
  let pending: Message | null = null;
  worker.postMessage = m => { pending = m; };
  assert.throws(() => invoke(worker, 'timeout'), /timeout/);
  worker.postMessage = m => {
    assert.notEqual(m.resultBuffer, pending!.resultBuffer);
    reply(pending!, { result: 'late-old-response' }); reply(m, { result: m.data });
  };
  assert.equal(invoke(worker, 'after-timeout'), 'after-timeout'); assert.equal(allocations, 6);
  worker.postMessage = m => { reply(m, { error: 'read-error' }); };
  assert.throws(() => invoke(worker, 'error'), /read-error/);
  worker.postMessage = m => { reply(m, { result: m.data }); };
  assert.equal(invoke(worker, 'after-error'), 'after-error'); assert.equal(allocations, 8);
});
