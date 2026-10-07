/** Presentation actions mirror mainline boundaries without granting new progression. */
export function finishPresentation(mode: 'mainline' | 'replay' | 'preview', number: number, total = 1000) {
  if (mode !== 'mainline') return { title: 'finished' as const, label: 'home' as const, action: 'home' as const };
  if (number === total) return { title: 'finalFinished' as const, label: 'replayLevels' as const, action: 'levels' as const };
  return { title: 'finished' as const, label: 'next' as const, action: 'next' as const };
}
