import { useEffect, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider, UiText, useI18n } from './src/i18n/I18n';
import { DemoScreen } from './src/ui/DemoScreen';
import { GameButton } from './src/ui/GameButton';
import { getPlayer, initializeStorage } from './src/storage/runtime';
import { languagePreference } from './src/i18n/systemLanguage';
import { flushAnalytics } from './src/analytics/runtime';

function StorageGate() {
  const { t, setLanguagePreference } = useI18n();
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    initializeStorage().then(() => { if (alive) { setLanguagePreference(languagePreference(getPlayer().preference('language'))); setReady(true); } }).catch(error => {
      console.error('SQLite initialization failed', error);
      if (alive) setFailed(true);
    });
    return () => { alive = false; };
  }, [attempt, setLanguagePreference]);
  useEffect(() => {
    if (!ready) return;
    const player = getPlayer();
    const session = (kind: 'ready' | 'foreground' | 'background') => {
      void player.enqueueWrite(revision => player.metrics.session(revision, Date.now(), kind));
      flushAnalytics();
    };
    session('ready');
    let active = AppState.currentState === 'active';
    const listener = AppState.addEventListener('change', state => {
      const next = state === 'active';
      if (next !== active) { active = next; session(next ? 'foreground' : 'background'); }
    });
    const timer = setInterval(flushAnalytics, 30000);
    return () => { listener.remove(); clearInterval(timer); session('background'); };
  }, [ready]);
  if (!ready) return <View style={styles.loading}><UiText style={styles.message}>{t(failed ? 'storageUnavailable' : 'loading')}</UiText>{failed && <GameButton icon="reset" label={t('retry')} onPress={() => { setFailed(false); setAttempt(value => value + 1); }} />}</View>;
  return Platform.OS === 'web' ? <ScrollView contentContainerStyle={styles.webContent}><DemoScreen /></ScrollView> : <DemoScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider><I18nProvider><StorageGate /></I18nProvider></SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ webContent: { flexGrow: 1, minWidth: 320, minHeight: 400 }, loading: { flex: 1, backgroundColor: '#090E16', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }, message: { color: '#BDCDD3' } });
