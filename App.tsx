import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoScreen } from './src/ui/DemoScreen';

export default function App() {
  return (
    <SafeAreaProvider><DemoScreen /></SafeAreaProvider>
  );
}
