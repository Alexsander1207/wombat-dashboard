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

/** Ruta del último evento, relativa a la URL base del gateway. */
export const LATEST_EVENT_PATH = '/api/v1/events/latest'

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
  /** Aviso que el productor adjunta en la procedencia, si lo hay. */
  message: string | null
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

/** El primer `message` de `provenance.sources`, si existe y es texto. */
function provenanceMessage(raw: Record<string, unknown>): string | null {
  const provenance = raw.provenance
  if (!isRecord(provenance) || !Array.isArray(provenance.sources)) return null
  for (const source of provenance.sources) {
    if (isRecord(source) && typeof source.message === 'string' && source.message) {
      return source.message
    }
  }
  return null
}

/**
 * Valida la respuesta de `/api/v1/events/latest` y la pasa a `LiveEvent`.
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
    message: provenanceMessage(raw),
  }
}

/** URL del último evento a partir de la base configurada. */
export function latestEventUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${LATEST_EVENT_PATH}`
}

/** Pide el último evento al gateway. Lanza si no responde o responde mal. */
export async function fetchLatestEvent(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<LiveEvent> {
  const response = await fetch(latestEventUrl(baseUrl), {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`el gateway respondió HTTP ${response.status}`)
  return parseLatestEvent(await response.json())
}
