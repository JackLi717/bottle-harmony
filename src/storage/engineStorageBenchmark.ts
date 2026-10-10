/** Web CPU measurements cannot stand in for native Expo SQLite. */
export async function benchmarkEngineStorage(_cancelled: () => boolean) {
  return { status: 'unavailable' as const, reason: 'Native Expo SQLite measurement only' };
}
