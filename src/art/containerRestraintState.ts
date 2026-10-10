import type { VisibleEngineContainer } from '../game/engine.ts';

export type ContainerRestraintState = 'concealed' | 'relocked' | 'receive-only' | 'sealed' | 'fixed' | 'none';

/** Gate disclosure takes precedence; being position-fixed never removes transfer permission. */
export function containerRestraintState(container: Pick<VisibleEngineContainer, 'locked' | 'count' | 'canSource' | 'canReceive' | 'fixed'>): ContainerRestraintState {
  if (container.locked) return container.count === null ? 'concealed' : 'relocked';
  if (!container.canSource) return container.canReceive ? 'receive-only' : 'sealed';
  return container.fixed ? 'fixed' : 'none';
}
