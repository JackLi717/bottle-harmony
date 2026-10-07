import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from './src/i18n/I18n';
import { DemoScreen } from './src/ui/DemoScreen';

export default function App() {
  return (
    <SafeAreaProvider><I18nProvider><DemoScreen /></I18nProvider></SafeAreaProvider>
  );
}
