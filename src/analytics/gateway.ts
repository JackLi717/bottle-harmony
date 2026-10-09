import type { AnalyticsGateway } from './contracts';
/** Web/TV remain offline; no web tag or identifier is created. */
export const gateway: AnalyticsGateway = {
  configure: async () => false,
  logEvent: async () => { throw new Error('Analytics unavailable'); },
  reset: async () => {},
};
