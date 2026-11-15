/** Presentation-only layer visibility. Never changes evidence or priority scores. */
export function getMapDisplay({
  compare,
  before,
  changes,
  water,
  grid,
  opacity,
}: {
  compare: boolean
  before: boolean
  changes: boolean
  water: boolean
  grid: boolean
  opacity: number
}) {
  const alpha = Math.max(0, Math.min(100, opacity)) / 100
  return {
    t1Opacity: compare && before ? 0.85 : 0,
    t2Opacity: compare ? (before ? 0 : 0.85) : changes ? alpha : 0,
    changeOpacity: !compare && changes ? alpha * 0.8 : 0,
    waterVisibility: water ? ('visible' as const) : ('none' as const),
    gridVisibility: grid ? ('visible' as const) : ('none' as const),
  }
}
