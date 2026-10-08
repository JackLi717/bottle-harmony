import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider, UiText, useI18n } from './src/i18n/I18n';
import { DemoScreen } from './src/ui/DemoScreen';
import { GameButton } from './src/ui/GameButton';
import { initializeStorage } from './src/storage/runtime';

function StorageGate() {
  const { t } = useI18n();
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    initializeStorage().then(() => { if (alive) setReady(true); }).catch(error => {
      console.error('SQLite initialization failed', error);
      if (alive) setFailed(true);
    });
    return () => { alive = false; };
  }, [attempt]);
  if (!ready) return <View style={styles.loading}><UiText style={styles.message}>{t(failed ? 'storageUnavailable' : 'loading')}</UiText>{failed && <GameButton icon="reset" label={t('retry')} onPress={() => { setFailed(false); setAttempt(value => value + 1); }} />}</View>;
  return Platform.OS === 'web' ? <ScrollView contentContainerStyle={styles.webContent}><DemoScreen /></ScrollView> : <DemoScreen />;
}

export default function App() {
  return (
    <SafeAreaProvider><I18nProvider><StorageGate /></I18nProvider></SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ webContent: { flexGrow: 1, minWidth: 320, minHeight: 400 }, loading: { flex: 1, backgroundColor: '#090E16', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 24 }, message: { color: '#BDCDD3' } });
