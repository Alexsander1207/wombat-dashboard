/**
 * Modo vivo: lectura del gateway de WOMBAT (el modo `live` del plan maestro).
 *
 * Es ADITIVO. El mapa, el ranking y la insignia de verificación siguen saliendo
 * del bundle estático, que este navegador verifica byte a byte (R17: el
 * dashboard funciona sin backend). Si el gateway no responde, no se rompe nada:
 * el panel en vivo lo dice y el resto sigue igual.
 *
 * Lo que llega por aquí NO se verifica en el navegador. La respuesta del
 * gateway trae `wonb_id` y un `verified: true` que es su propia afirmación,
 * pero no trae `issuer` ni `signature`, así que no hay nada que comprobar con
 * la clave pinneada. Por eso la UI lo rotula "comprobado por el gateway" y
 * nunca lo suma a "datos verificados".
 *
 * El navegador habla HTTP con el gateway; nunca libp2p (R18).
 */

/**
 * Ruta de los eventos, relativa a la URL base del gateway. El último evento de
 * un área se pide en `<EVENTS_PATH>/<aoi_id>`: así la tarjeta sigue al área que
 * se está viendo y no muestra el evento de otra.
 */
export const EVENTS_PATH = '/api/v1/events'

/** Un evento del gateway, ya validado y con nombres de la app. */
export interface LiveEvent {
  /** `sha256:<hex>` del bloque. Identifica el evento: sirve para no repetirlo. */
  wonbId: string
  aoiId: string
  /** `change` | `context` | `risk` | `action`, tal como lo declara el bloque. */
  type: string
  topic: string
  /** Instante de emisión, tal como llegó. */
  issuedAt: string
  /** El evento se declara simulado (`simulation: true` o `data_origin: "simulated"`). */
  simulated: boolean
  dataOrigin: string
  /** Lo que el gateway afirma de su propia verificación. No es la del navegador. */
  gatewayVerified: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`el evento del gateway no trae "${key}"`)
  }
  return value
}

/**
 * Valida un evento del gateway y lo pasa a `LiveEvent`.
 *
 * Lanza si falta un campo esencial: un evento a medias no se muestra.
 */
export function parseLatestEvent(raw: unknown): LiveEvent {
  if (!isRecord(raw)) throw new Error('el gateway no devolvió un objeto JSON')

  const wonbId = requireString(raw, 'wonb_id')
  if (!/^sha256:[0-9a-f]{64}$/.test(wonbId)) {
    throw new Error('el "wonb_id" del evento no es un sha256')
  }
  const dataOrigin = typeof raw.data_origin === 'string' ? raw.data_origin : 'unknown'

  return {
    wonbId,
    aoiId: requireString(raw, 'aoi_id'),
    type: requireString(raw, 'type'),
    topic: requireString(raw, 'topic'),
    issuedAt: requireString(raw, 'issued_at'),
    // Ante la duda, simulado: solo `nisar_real` sin marca de simulación es real.
    simulated: raw.simulation === true || dataOrigin !== 'nisar_real',
    dataOrigin,
    gatewayVerified: raw.verified === true,
  }
}

/** URL del último evento de un área a partir de la base configurada. */
export function areaEventUrl(baseUrl: string, aoiId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${EVENTS_PATH}/${encodeURIComponent(aoiId)}`
}

/**
 * Pide al gateway el último evento de un área.
 *
 * Devuelve `null` cuando el gateway responde que esa área todavía no tiene
 * eventos (HTTP 404 con `error: "no_verified_events"`): el gateway está vivo,
 * solo que no hay nada que mostrar. Lanza si no responde o responde mal.
 */
export async function fetchAreaEvent(
  baseUrl: string,
  aoiId: string,
  signal?: AbortSignal,
): Promise<LiveEvent | null> {
  const response = await fetch(areaEventUrl(baseUrl, aoiId), {
    cache: 'no-store',
    signal,
  })
  if (response.status === 404) {
    const body: unknown = await response.json().catch(() => null)
    if (isRecord(body) && body.error === 'no_verified_events') return null
    throw new Error('el gateway respondió HTTP 404')
  }
  if (!response.ok) throw new Error(`el gateway respondió HTTP ${response.status}`)
  const event = parseLatestEvent(await response.json())
  // Se pidió un área: un evento de otra no se muestra como si fuera de esta.
  return event.aoiId === aoiId ? event : null
}
