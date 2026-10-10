import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { AppRegistry, Platform } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Shell-only native service exists exclusively in the isolated acceptance application.
if (Platform.OS === 'android' && Constants.expoConfig?.android?.package === 'com.bottleharmony.engineacceptance') {
  AppRegistry.registerHeadlessTask('EngineAcceptanceBenchmark', () => async (data: { runId: string }) => {
    const { runDeviceEngineBenchmark } = await import('./src/game/engineDeviceBenchmark');
    await runDeviceEngineBenchmark(data.runId);
  });
}
