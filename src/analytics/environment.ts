/** Native Expo config may normalize null to an object; never pass it to SQLite or the SDK. */
export function analyticsEnvironment(value: unknown): 'production' | 'test' | 'offline' {
  return value === 'production' || value === 'test' ? value : 'offline';
}
