import assert from 'node:assert/strict';
import test from 'node:test';
import { systemLanguage } from '../src/i18n/systemLanguage.ts';
import { LANGUAGES, localizedLanguageName, MESSAGES, resolveLanguage, translate } from '../src/i18n/messages.ts';

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
});
test('translations change presentation without changing numerical level identifiers', () => {
  assert.equal(translate('zh-Hans', 'continueLevel', { n: 419 }), '继续第 419 关');
  assert.equal(translate('ar', 'continueLevel', { n: 419 }), 'متابعة · 419');
  assert.equal(translate('de', 'goal', { done: 2, total: 11 }), '2 von 11 Farben sortiert');
});
test('language rows keep recognizable native names and localized secondary names', () => {
  assert.equal(LANGUAGES.find(language => language.id === 'es')!.name, 'Español');
  assert.equal(localizedLanguageName('es', 'zh-Hans'), '西班牙语');
  assert.equal(localizedLanguageName('zh-Hans', 'es'), 'Chino (simplificado)');
  assert.equal(localizedLanguageName('ar', 'en'), 'Arabic');
  for (const display of LANGUAGES) for (const target of LANGUAGES) assert.ok(localizedLanguageName(target.id, display.id));
});

test('system language reads preferred locales and falls back to English when unavailable', () => {
  assert.equal(systemLanguage(() => [{ languageTag: 'zh-Hans-AU' }]), 'zh-Hans');
  assert.equal(systemLanguage(() => [{ languageTag: 'pl-PL' }, { languageTag: 'de-AT' }]), 'de');
  assert.equal(systemLanguage(() => []), 'en');
  assert.equal(systemLanguage(() => [{ languageTag: 'pl-PL' }]), 'en');
  assert.equal(systemLanguage(() => { throw new Error('Locale service unavailable'); }), 'en');
});
