export type PreviewPosition = { kind: 'main'; number: number } | { kind: 'side'; number: number };

/** Walk the playable order without changing the saved mainline position. */
export function adjacentPreview(
  position: PreviewPosition,
  direction: -1 | 1,
  mainCount: number,
  sideAfter: readonly number[],
): PreviewPosition | null {
  if (position.kind === 'side') {
    const after = sideAfter[position.number - 1];
    if (after === undefined) return null;
    return direction === -1 ? { kind: 'main', number: after }
      : after < mainCount ? { kind: 'main', number: after + 1 } : null;
  }

  const adjacentNumber = position.number + direction;
  if (direction === 1) {
    const sideIndex = sideAfter.indexOf(position.number);
    if (sideIndex !== -1) return { kind: 'side', number: sideIndex + 1 };
  } else {
    const sideIndex = sideAfter.indexOf(adjacentNumber);
    if (sideIndex !== -1) return { kind: 'side', number: sideIndex + 1 };
  }
  return adjacentNumber >= 1 && adjacentNumber <= mainCount
    ? { kind: 'main', number: adjacentNumber } : null;
}
