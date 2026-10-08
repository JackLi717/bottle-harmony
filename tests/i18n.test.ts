import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { systemLanguage } from '../src/i18n/systemLanguage.ts';
import { LANGUAGES, localizedLanguageName, MESSAGES, resolveLanguage, translate } from '../src/i18n/messages.ts';

test('all public messages cover all languages and preserve interpolation fields', () => {
  const fields = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  assert.equal(new Set(LANGUAGES.map(language => language.id)).size, 21);
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
  assert.equal(resolveLanguage(['sv-SE', 'de-AT', 'en-US']), 'de');
  assert.equal(resolveLanguage(['pt-BR']), 'pt');
  assert.equal(resolveLanguage(['ar-EG']), 'ar');
  assert.equal(resolveLanguage(['unknown']), 'en');
  assert.equal(resolveLanguage([]), 'en');
});
test('new languages match regional system locales before later English preferences', () => {
  const locales = { 'tr-TR': 'tr', 'vi-VN': 'vi', 'th-TH': 'th', 'it-CH': 'it', 'pl-PL': 'pl', 'uk-UA': 'uk', 'ms-MY': 'ms', 'nl-BE': 'nl' } as const;
  for (const [tag, expected] of Object.entries(locales)) {
    assert.equal(resolveLanguage([tag, 'en-US']), expected);
    assert.equal(resolveLanguage([tag.replace('-', '_')]), expected);
    assert.equal(systemLanguage(() => [{ languageTag: tag }, { languageTag: 'en-US' }]), expected);
    assert.notEqual(translate(expected, 'memoryStep3'), translate('en', 'memoryStep3'));
    assert.notEqual(translate(expected, 'privacyPolicy'), translate('en', 'privacyPolicy'));
    const text = translate(expected, 'memoryBottle', { n: 3, layers: 2, space: 2, colors: translate(expected, 'coral') });
    assert.ok(text.includes('3'));
    assert.ok(text.includes(translate(expected, 'coral')));
    assert.doesNotMatch(text, /\{\w+\}/);
  }
  assert.equal(resolveLanguage(['pl-PL', 'de-AT']), 'pl');
});
test('native locale declarations match the complete public translation catalog', () => {
  const { expo } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  const localization = expo.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-localization');
  assert.deepEqual(localization[1].supportedLocales, LANGUAGES.map(language => language.id));
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
  assert.equal(systemLanguage(() => [{ languageTag: 'sv-SE' }, { languageTag: 'de-AT' }]), 'de');
  assert.equal(systemLanguage(() => []), 'en');
  assert.equal(systemLanguage(() => [{ languageTag: 'sv-SE' }]), 'en');
  assert.equal(systemLanguage(() => { throw new Error('Locale service unavailable'); }), 'en');
});
