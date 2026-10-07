import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGES, MESSAGES, parsePreference, resolveLanguage, translate } from '../src/i18n/messages.ts';

test('all public messages cover all languages and preserve interpolation fields', () => {
  const fields = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  assert.equal(new Set(LANGUAGES.map(language => language.id)).size, 13);
  for (const [key, row] of Object.entries(MESSAGES)) {
    assert.equal(row.length, LANGUAGES.length, key);
    for (const value of row) {
      assert.ok(value.trim(), key);
      assert.deepEqual(fields(value), fields(row[0]), key);
    }
  }
});
test('language selection respects scripts, regions and ordered system fallbacks', () => {
  for (const tag of ['zh-TW','zh_HK','zh-MO','zh-Hant-CN']) assert.equal(resolveLanguage([tag]), 'zh-Hant');
  for (const tag of ['zh-CN','zh-SG','zh','zh-Hans-TW']) assert.equal(resolveLanguage([tag]), 'zh-Hans');
  assert.equal(resolveLanguage(['pl-PL', 'de-AT', 'en-US']), 'de');
  assert.equal(resolveLanguage(['pt-BR']), 'pt');
  assert.equal(resolveLanguage(['ar-EG']), 'ar');
  assert.equal(resolveLanguage(['unknown']), 'en');
  assert.equal(resolveLanguage([]), 'en');
  for (const language of LANGUAGES) assert.equal(parsePreference(language.id), language.id);
  for (const invalid of [null, '', 'pl', '{}', 12]) assert.equal(parsePreference(invalid), 'system');
});
test('translations change presentation without changing numerical level identifiers', () => {
  assert.equal(translate('zh-Hans', 'continueLevel', { n: 419 }), '继续第 419 关');
  assert.equal(translate('ar', 'continueLevel', { n: 419 }), 'متابعة · 419');
  assert.equal(translate('de', 'goal', { done: 2, total: 11 }), '2 von 11 Farben sortiert');
});
