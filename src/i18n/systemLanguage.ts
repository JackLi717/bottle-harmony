import { LANGUAGES, resolveLanguage, type Language } from './messages.ts';

export type LanguagePreference = Language | 'system';
export function languagePreference(value: string): LanguagePreference {
  return LANGUAGES.some(language => language.id === value) ? value as Language : 'system';
}
export function preferredLanguage(preference: LanguagePreference, readLocales: () => readonly { languageTag: string }[]): Language {
  return preference === 'system' ? systemLanguage(readLocales) : preference;
}

/** Missing or unreadable device locales must never prevent the app from opening. */
export function systemLanguage(readLocales: () => readonly { languageTag: string }[]): Language {
  try {
    return resolveLanguage(readLocales().map(locale => locale.languageTag));
  } catch {
    return 'en';
  }
}
