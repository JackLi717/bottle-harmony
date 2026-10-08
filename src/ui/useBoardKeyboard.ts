import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { Point } from '../art/liquidGeometry';
import { nextBottleFocus, type BoardDirection } from './boardNavigation';

export const bottleControlId = (index: number) => `board-bottle-${index}`;

export function useBoardKeyboard({ enabled, disabled, positions, onEscape }: { enabled: boolean; disabled: boolean; positions: readonly Point[]; onEscape: () => void }) {
  const lastFocus = useRef(-1);
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (Platform.OS === 'web' && enabled && wasDisabled.current && !disabled && document.activeElement === document.body && lastFocus.current >= 0) {
      document.getElementById(bottleControlId(lastFocus.current))?.focus();
    }
    wasDisabled.current = disabled;
  }, [disabled, enabled]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') { event.preventDefault(); onEscape(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const element = document.activeElement;
      const id = element?.id ?? '';
      if (!id.startsWith('board-bottle-') && element !== document.body && element?.getAttribute('role') === 'button') return;
      const current = id.startsWith('board-bottle-') ? Number(id.slice('board-bottle-'.length)) : -1;
      event.preventDefault();
      document.getElementById(bottleControlId(current < 0 ? 0 : nextBottleFocus(positions, current, event.key as BoardDirection)))?.focus();
    }
    function onFocus(event: FocusEvent) {
      const id = (event.target as HTMLElement)?.id ?? '';
      if (id.startsWith('board-bottle-')) lastFocus.current = Number(id.slice('board-bottle-'.length));
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('focusin', onFocus); };
  }, [enabled, positions, onEscape]);
}
