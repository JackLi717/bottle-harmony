import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { PlayerRepository } from '../storage/playerRepository';
import { AnalyticsDelivery } from './delivery';
import { gateway } from './gateway';

let delivery: AnalyticsDelivery | null = null;
export function analyticsAvailable() { return !Platform.isTV && Platform.OS !== 'web' && !!Constants.expoConfig?.extra?.analyticsEnvironment; }
export async function initializeAnalytics(player: PlayerRepository) {
  const environment = analyticsAvailable() ? Constants.expoConfig!.extra!.analyticsEnvironment : 'offline';
  delivery = new AnalyticsDelivery(player, gateway, environment);
  await delivery.initialize();
}
export function flushAnalytics() { void delivery?.flush(); }
