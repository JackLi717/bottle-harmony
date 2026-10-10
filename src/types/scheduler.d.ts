// The three APIs used from the React 19.2 / scheduler 0.27 native entry point.
declare module 'scheduler' {
  export const unstable_LowPriority: number;
  export function unstable_scheduleCallback(priority: number, callback: () => void): unknown;
  export function unstable_cancelCallback(task: unknown): void;
}
