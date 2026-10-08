import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, StyleSheet, Text, type TextProps } from 'react-native';
import { getLocales } from 'expo-localization';
import { translate, type MessageKey } from './messages';
import { systemLanguage } from './systemLanguage';

function useLanguage() {
  const [language, setLanguage] = useState(() => systemLanguage(getLocales));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setLanguage(systemLanguage(getLocales));
    });
    return () => subscription.remove();
  }, []);
  const t = useCallback((key: MessageKey, params?: Record<string, string | number>) => translate(language, key, params), [language]);
  return useMemo(() => ({ language, t, rtl: language === 'ar' }), [language, t]);
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
