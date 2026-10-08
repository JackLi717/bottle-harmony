import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, StyleSheet, Text, type TextProps } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createProgressWriter } from '../storage/progressWriter';
import { LANGUAGES, parsePreference, resolveLanguage, translate, type LanguagePreference, type MessageKey } from './messages';

const LANGUAGE_KEY = 'bottle-harmony.language.v1';
const write = createProgressWriter(value => AsyncStorage.setItem(LANGUAGE_KEY, value));
function useLanguage() {
  const [preference, updatePreference] = useState<LanguagePreference>('system');
  const [locales, setLocales] = useState(() => getLocales().map(locale => locale.languageTag));
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(LANGUAGE_KEY).then(value => { if (alive) updatePreference(parsePreference(value)); }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setLocales(getLocales().map(locale => locale.languageTag));
    });
    return () => { alive = false; subscription.remove(); };
  }, []);
  const language = preference === 'system' ? resolveLanguage(locales) : preference;
  const t = useCallback((key: MessageKey, params?: Record<string, string | number>) => translate(language, key, params), [language]);
  const setPreference = useCallback((next: LanguagePreference) => {
    updatePreference(next);
    void write(next).then(setSaved);
  }, []);
  return useMemo(() => ({ language, preference, ready, saved, setPreference, t, rtl: language === 'ar', languageName: preference === 'system' ? t('system') : LANGUAGES.find(item => item.id === language)!.name }), [language, preference, ready, saved, setPreference, t]);
}
const I18nContext = createContext<ReturnType<typeof useLanguage> | null>(null);
export function I18nProvider({ children }: PropsWithChildren) {
  const value = useLanguage();
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('I18nProvider is required');
  return context;
}
/** Keep board coordinates fixed; mirror only UI copy and navigation rows. */
export function UiText({ style, ...props }: TextProps) {
  const { rtl } = useI18n();
  const flat = StyleSheet.flatten(style);
  const tv = Platform.isTV ? { fontSize: (flat?.fontSize ?? 14) * 1.4, ...(flat?.lineHeight ? { lineHeight: flat.lineHeight * 1.4 } : {}) } : undefined;
  return <Text {...props} style={[{ writingDirection: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }, style, tv]} />;
}
