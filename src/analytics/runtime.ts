import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { PlayerRepository } from '../storage/playerRepository';
import { AnalyticsDelivery } from './delivery';
import { gateway } from './gateway';
import { analyticsEnvironment } from './environment';

let delivery: AnalyticsDelivery | null = null;
export function analyticsAvailable() { return !Platform.isTV && Platform.OS !== 'web' && analyticsEnvironment(Constants.expoConfig?.extra?.analyticsEnvironment) !== 'offline'; }
export async function initializeAnalytics(player: PlayerRepository) {
  const environment = analyticsAvailable() ? analyticsEnvironment(Constants.expoConfig?.extra?.analyticsEnvironment) : 'offline';
  delivery = new AnalyticsDelivery(player, gateway, environment);
  await delivery.initialize();
}
export function flushAnalytics() { void delivery?.flush(); }
