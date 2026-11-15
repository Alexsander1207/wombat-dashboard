/**
 * El tema lo decide el sistema operativo (prefers-color-scheme). El CSS ya
 * reacciona solo; este hook existe para lo que no es CSS: los lienzos WebGL de
 * MapLibre, que pintan con colores fijos y hay que avisarles del cambio.
 */
import { useSyncExternalStore } from 'react'

export type ColorScheme = 'light' | 'dark'

const LIGHT = '(prefers-color-scheme: light)'

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function subscribe(onChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {}
  const query = window.matchMedia(LIGHT)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

// Sin preferencia declarada (o sin matchMedia, como en los tests) el diseño
// es el oscuro original.
function snapshot(): ColorScheme {
  return hasMatchMedia() && window.matchMedia(LIGHT).matches ? 'light' : 'dark'
}

export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribe, snapshot, () => 'dark')
}
