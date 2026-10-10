import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { AnalyticsGateway } from './contracts';
import { analyticsEnvironment } from './environment';

async function native() {
  const sdk = await import('@react-native-firebase/analytics');
  return { sdk, analytics: sdk.getAnalytics() };
}
export const gateway: AnalyticsGateway = {
  async configure(enabled) {
    if (Platform.isTV || analyticsEnvironment(Constants.expoConfig?.extra?.analyticsEnvironment) === 'offline') return false;
    const { sdk, analytics } = await native();
    await sdk.setConsent(analytics, { analytics_storage: enabled, ad_storage: false, ad_user_data: false, ad_personalization: false });
    await sdk.setAnalyticsCollectionEnabled(analytics, enabled);
    return true;
  },
  async logEvent(name, params) { const { sdk, analytics } = await native(); await sdk.logEvent(analytics, name, params); },
  async reset() {
    if (Platform.isTV || analyticsEnvironment(Constants.expoConfig?.extra?.analyticsEnvironment) === 'offline') return;
    const { sdk, analytics } = await native(); await sdk.resetAnalyticsData(analytics);
  },
};
