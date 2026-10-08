import { Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from './src/i18n/I18n';
import { DemoScreen } from './src/ui/DemoScreen';

export default function App() {
  return (
    <SafeAreaProvider><I18nProvider>{Platform.OS === 'web' ? <ScrollView contentContainerStyle={styles.webContent}><DemoScreen /></ScrollView> : <DemoScreen />}</I18nProvider></SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ webContent: { flexGrow: 1, minWidth: 320, minHeight: 400 } });
