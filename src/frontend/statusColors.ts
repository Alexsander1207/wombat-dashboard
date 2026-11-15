import type { CellStatus } from '../contract/types.ts'

/**
 * Rampa secuencial de un solo tono, no un semáforo: el color indica el lugar
 * en el orden de revisión sugerido, no un nivel de peligro. Los datos
 * insuficientes van en gris azulado, fuera de la rampa.
 */
export const STATUS_FILL: Record<CellStatus, string> = {
  review_high: '#f97532',
  review_medium: '#f7b27a',
  review_low: '#f3e2c4',
  insufficient_quality: '#7c8594',
}

/** Orden y nombre para el público de cada estado. */
export const STATUS_LEGEND: [CellStatus, string][] = [
  ['review_high', 'Check first'],
  ['review_medium', 'Check next'],
  ['review_low', 'Lower priority'],
  ['insufficient_quality', 'Not enough usable data'],
]
