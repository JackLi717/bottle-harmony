import { resolveLanguage, type Language } from './messages.ts';

/** Missing or unreadable device locales must never prevent the app from opening. */
export function systemLanguage(readLocales: () => readonly { languageTag: string }[]): Language {
  try {
    return resolveLanguage(readLocales().map(locale => locale.languageTag));
  } catch {
    return 'en';
  }
}
