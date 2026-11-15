/**
 * Sondeo del gateway: pide el último evento del área que se está viendo.
 *
 * No toca el bundle ni la verificación. Guarda en memoria los eventos que va
 * viendo en esta sesión, sin repetir (se distinguen por `wonb_id`), y dice si
 * el gateway responde o no. Si la configuración no trae gateway, no hace nada.
 */
import { useEffect, useState } from 'react'
import { fetchAreaEvent, type LiveEvent } from '../live/gateway.ts'

export interface GatewayConfig {
  /** URL base del gateway, sin la ruta del API. */
  url: string
  /** Cada cuántos segundos se consulta. Por defecto, 60. */
  pollSeconds?: number
}

export type LiveStatus = 'connecting' | 'online' | 'offline'

export interface LiveState {
  status: LiveStatus
  /** Eventos vistos en esta sesión, el más reciente primero. */
  events: LiveEvent[]
  /** Instante ISO de la última consulta que terminó, con o sin éxito. */
  lastChecked: string | null
  /** Por qué falló la última consulta, si falló. */
  error: string | null
}

export const DEFAULT_POLL_SECONDS = 60
/** Piso del intervalo: un valor menor en la configuración se sube hasta aquí. */
export const MIN_POLL_SECONDS = 15
/** Cuántos eventos se conservan en memoria. */
export const MAX_EVENTS = 10
/** Una consulta que no responde en este tiempo cuenta como fallida. */
const REQUEST_TIMEOUT_MS = 10_000

const INITIAL: LiveState = {
  status: 'connecting',
  events: [],
  lastChecked: null,
  error: null,
}

/** Segundos efectivos entre consultas, con el piso aplicado. */
export function pollSecondsOf(gateway: GatewayConfig): number {
  const requested = gateway.pollSeconds
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return DEFAULT_POLL_SECONDS
  }
  return Math.max(MIN_POLL_SECONDS, Math.round(requested))
}

/** Añade un evento al frente de la lista si todavía no estaba. */
export function mergeEvent(events: LiveEvent[], incoming: LiveEvent): LiveEvent[] {
  if (events.some((event) => event.wonbId === incoming.wonbId)) return events
  return [incoming, ...events].slice(0, MAX_EVENTS)
}

export function useLiveEvents(
  gateway: GatewayConfig | null | undefined,
  aoiId: string | null | undefined,
): LiveState {
  // El estado lleva el área a la que pertenece: al cambiar de área, lo visto
  // de la anterior deja de mostrarse en el mismo render, sin esperar a la red.
  const [state, setState] = useState<LiveState & { aoiId: string | null }>({
    ...INITIAL,
    aoiId: null,
  })
  const url = gateway?.url
  const seconds = gateway ? pollSecondsOf(gateway) : DEFAULT_POLL_SECONDS

  useEffect(() => {
    if (!url || !aoiId) return

    let cancelled = false
    let inFlight: AbortController | null = null

    const poll = async () => {
      // Con la pestaña en segundo plano no se consulta: nadie lo está mirando.
      if (document.visibilityState === 'hidden') return
      inFlight?.abort()
      const controller = new AbortController()
      inFlight = controller
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const event = await fetchAreaEvent(url, aoiId, controller.signal)
        if (cancelled) return
        setState((previous) => {
          const seen = previous.aoiId === aoiId ? previous.events : []
          return {
            aoiId,
            status: 'online',
            // `null`: el gateway responde, pero esta área aún no tiene eventos.
            events: event ? mergeEvent(seen, event) : seen,
            lastChecked: new Date().toISOString(),
            error: null,
          }
        })
      } catch (cause) {
        if (cancelled) return
        // Los eventos ya vistos del área se conservan: lo que cambia es el estado.
        setState((previous) => ({
          aoiId,
          events: previous.aoiId === aoiId ? previous.events : [],
          status: 'offline',
          lastChecked: new Date().toISOString(),
          error:
            cause instanceof DOMException && cause.name === 'AbortError'
              ? 'el gateway no respondió a tiempo'
              : cause instanceof Error
                ? cause.message
                : String(cause),
        }))
      } finally {
        clearTimeout(timeout)
      }
    }

    void poll()
    const interval = setInterval(() => void poll(), seconds * 1000)
    // Al volver a la pestaña se consulta enseguida: si no, quien abrió el
    // enlace en segundo plano vería "Connecting…" hasta el siguiente intervalo.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      inFlight?.abort()
    }
  }, [url, aoiId, seconds])

  if (!aoiId || state.aoiId !== aoiId) return INITIAL
  return {
    status: state.status,
    events: state.events,
    lastChecked: state.lastChecked,
    error: state.error,
  }
}
