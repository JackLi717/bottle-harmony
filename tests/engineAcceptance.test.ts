import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { acceptanceManifest } = require('../plugins/withEngineAcceptance.js');

test('headless device measurement is shell-protected, service-private, idempotent and removed from public manifests', () => {
  const receiver: { $: Record<string, string> }[] = [{ $: { 'android:name': 'unrelated.Receiver' } }];
  const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' }, receiver }] } };
  acceptanceManifest(manifest, true); acceptanceManifest(manifest, true);
  const application = manifest.manifest.application[0] as typeof manifest.manifest.application[0] & { service: { $: Record<string, string> }[] };
  assert.equal(application.receiver.length, 2); assert.equal(application.service.length, 1);
  assert.equal(application.receiver[1].$['android:permission'], 'android.permission.DUMP');
  assert.equal(application.service[0].$['android:exported'], 'false');
  acceptanceManifest(manifest, false);
  assert.equal(application.service.length, 0); assert.deepEqual(application.receiver, [{ $: { 'android:name': 'unrelated.Receiver' } }]);
});
test('headless measurement cannot be configured against the public package', () => {
  const plugin = require('../plugins/withEngineAcceptance.js');
  assert.throws(() => plugin({ android: { package: 'com.bottleharmony.app' } }, { enabled: true }), /isolated application ID/);
});
