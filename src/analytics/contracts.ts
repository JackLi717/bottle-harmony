export type AnalyticsParameters = Record<string, string | number>;
export const ANALYTICS_EVENTS = [
  'bh_credit_change', 'bh_credit_spend', 'bh_app_ready', 'bh_app_foreground', 'bh_app_background', 'bh_puzzle_start', 'bh_puzzle_visit',
  'bh_puzzle_leave', 'bh_attempt_end', 'bh_puzzle_complete', 'bh_puzzle_timing', 'bh_puzzle_operations',
  'bh_puzzle_action', 'bh_hint_request', 'bh_hint_result', 'bh_hint_execute', 'bh_stalled',
  'bh_stalled_recovery', 'bh_stalled_notice', 'bh_memory_answer', 'bh_memory_check', 'bh_preference',
  'bh_tutorial', 'bh_active_day', 'bh_milestone', 'bh_quality', 'bh_first_action',
] as const;
export type AnalyticsEventName = typeof ANALYTICS_EVENTS[number];
export interface AnalyticsGateway {
  /** Resolves only after native collection state has changed. */
  configure(enabled: boolean): Promise<boolean>;
  logEvent(name: AnalyticsEventName, params: AnalyticsParameters): Promise<void>;
  reset(): Promise<void>;
}
export const PARAMETER_NAMES = new Set([
  'event_id', 'event_at', 'mode', 'puzzle_id', 'level_number', 'content_version', 'rules_version',
  'metrics_version', 'app_version', 'build_environment', 'integrity', 'first_exposure',
  'action', 'result', 'reason', 'resource', 'duration_ms', 'foreground_ms', 'blocked_ms', 'available_ms',
  'observation_ms', 'peek_ms', 'hidden_ms', 'cleanup_ms', 'attempts', 'visits', 'pours', 'manual_pours',
  'hint_pours', 'undos', 'resets', 'peeks', 'melts', 'reserves', 'route_steps', 'route_position',
  'assistance', 'first_clear', 'answer', 'unassisted', 'credits_expected', 'credits_awarded', 'credits_capped',
  'credits_spent', 'balance', 'preference', 'value', 'stage', 'day', 'cohort_day', 'since_activation',
  'tier', 'wave_role', 'colors', 'operation', 'count', 'wait_ms', 'first_action_ms', 'phase', 'new_observation',
]);
/** Reject contract violations; never silently truncate parameters or attach arbitrary detail. */
export function validateParameters(name: AnalyticsEventName, params: AnalyticsParameters) {
  if (!(ANALYTICS_EVENTS as readonly string[]).includes(name) || Object.keys(params).length > 25) throw new Error('Analytics event contract');
  for (const [key, value] of Object.entries(params)) {
    if (!PARAMETER_NAMES.has(key) || key.length > 40 || typeof value === 'number' && !Number.isFinite(value)
      || typeof value === 'string' && value.length > 100) throw new Error(`Analytics parameter contract: ${key}`);
  }
}
