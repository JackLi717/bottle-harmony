import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { analyticsEnvironment } from '../src/analytics/environment.ts';

test('only explicit Test or Production can enter analytics delivery; malformed native null stays offline', () => {
  for (const value of [undefined, null, {}, [], true, 42, 'offline', 'unknown']) assert.equal(analyticsEnvironment(value), 'offline');
  assert.equal(analyticsEnvironment('production'), 'production'); assert.equal(analyticsEnvironment('test'), 'test');
});
test('offline Expo extra uses a string that survives native serialization, without adding Firebase configuration', () => {
  const require = createRequire(import.meta.url), configure = require('../app.config.js');
  const previous = { ...process.env };
  try {
    process.env.ANALYTICS_ENV = 'offline'; process.env.APP_VARIANT = ''; process.env.EXPO_PUBLIC_INTERNAL_TOOLS = 'true';
    const result = configure({ config: require('../app.json').expo });
    assert.equal(result.extra.analyticsEnvironment, 'offline'); assert.equal(result.extra.internalTools, true);
    assert.equal(result.android.googleServicesFile, undefined); assert.equal(result.ios.googleServicesFile, undefined);
    assert.equal(JSON.parse(JSON.stringify(result)).extra.analyticsEnvironment, 'offline');
  } finally { process.env = previous; }
});
test('engine acceptance uses an isolated app identity and stays offline even with production analytics requested', () => {
  const require = createRequire(import.meta.url), configure = require('../app.config.js'), previous = { ...process.env };
  try {
    process.env.APP_VARIANT = 'engine-acceptance'; process.env.ANALYTICS_ENV = 'production';
    const result = configure({ config: require('../app.json').expo });
    assert.equal(result.android.package, 'com.bottleharmony.engineacceptance');
    assert.equal(result.ios.bundleIdentifier, 'com.bottleharmony.engineacceptance');
    assert.equal(result.extra.analyticsEnvironment, 'offline'); assert.equal(result.extra.internalTools, true);
    delete process.env.APP_VARIANT; process.env.ANALYTICS_ENV = 'offline';
    assert.equal(configure({ config: require('../app.json').expo }).android.package, 'com.bottleharmony.app');
  } finally { process.env = previous; }
});
