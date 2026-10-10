import { unstable_cancelCallback, unstable_LowPriority, unstable_scheduleCallback } from 'scheduler';

/** Native runtime tasks, browser MessageChannel or Node immediates; never a microtask loop. */
export function scheduleCooperativeWork(work: () => void): () => void {
  const handle = unstable_scheduleCallback(unstable_LowPriority, () => { work(); });
  return () => unstable_cancelCallback(handle);
}
export function yieldToHost(): Promise<void> {
  return new Promise(resolve => { scheduleCooperativeWork(resolve); });
}
