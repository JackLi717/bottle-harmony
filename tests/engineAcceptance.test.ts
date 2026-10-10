import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
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
test('measurement keep-awake is Activity-local, idempotent and removed by public configuration', () => {
  const { acceptanceActivity } = require('../plugins/withEngineAcceptance.js');
  const original = 'override fun onCreate() {\n    super.onCreate(null)\n  }';
  const enabled = acceptanceActivity(original, true);
  assert.equal(acceptanceActivity(enabled, true), enabled);
  assert.equal(acceptanceActivity(enabled, false), original);
  assert.equal(acceptanceActivity('unrelated public Activity', false), 'unrelated public Activity');
  assert.throws(() => acceptanceActivity('new Activity template', true), /Review/);
});

test('optional SVG trace scopes are reversible, idempotent and forbidden for public packages', () => {
  const plugin = require('../plugins/withSvgTrace.js'), configure = plugin.configureSvgTracing;
  const installed = readFileSync(new URL('../node_modules/react-native-svg/android/src/main/java/com/horcrux/svg/SvgView.java', import.meta.url), 'utf8');
  const original = configure(installed, false), traced = configure(original, true);
  assert.ok(traced.includes('BH.SVG.allocate')); assert.ok(traced.includes('BH.SVG.children'));
  assert.equal(configure(traced, true), traced); assert.equal(configure(traced, false), original);
  assert.throws(() => configure(original + '\n// changed upstream', true), /Review/);
  assert.throws(() => plugin({ android: { package: 'com.bottleharmony.app' } }, { enabled: true }), /isolated/);
});

test('isolated picture recording and alpha layers restore the exact original native library', () => {
  const plugin = require('../plugins/withSvgTrace.js'), configure = plugin.configureSvgTracing;
  const { configurePictureGroup } = require('../plugins/svgPictureExperiment.js');
  const root = readFileSync(new URL('../node_modules/react-native-svg/android/src/main/java/com/horcrux/svg/SvgView.java', import.meta.url), 'utf8');
  const group = readFileSync(new URL('../node_modules/react-native-svg/android/src/main/java/com/horcrux/svg/GroupView.java', import.meta.url), 'utf8');
  const original = configure(root, false), originalGroup = configurePictureGroup(group, false);
  const picture = configure(original, false, true), both = configure(original, true, true);
  assert.equal(configure(picture, false, true), picture);
  assert.equal(configure(both, false), original);
  assert.equal(configure(picture, true), configure(original, true));
  assert.equal(configurePictureGroup(configurePictureGroup(originalGroup, true), false), originalGroup);
  assert.throws(() => plugin({ android: { package: 'com.bottleharmony.app' } }, { picture: true }), /isolated/);
  assert.throws(() => configurePictureGroup(originalGroup + '\n// upstream change', true), /Review/);
});
