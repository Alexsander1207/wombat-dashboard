/** Spatial keyboard movement for the four-card navigation grid. */
export function nextNavigationIndex(
  key: string,
  current: number,
): number | null {
  if (key === 'Home') return 0
  if (key === 'End') return 3
  if (key === 'ArrowRight') return (current + 1) % 4
  if (key === 'ArrowLeft') return (current + 3) % 4
  if (key === 'ArrowDown' || key === 'ArrowUp') return (current + 2) % 4
  return null
}
