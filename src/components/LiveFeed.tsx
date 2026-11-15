/**
 * Panel "En vivo": el último evento que publica el gateway.
 *
 * Va aparte del mapa y de la insignia de verificación a propósito. Lo que se
 * muestra aquí no pasó por la verificación del navegador (ver
 * src/live/gateway.ts), y si el evento es simulado se dice en el mismo panel.
 */
import { Radio } from 'lucide-react'
import type { LiveEvent } from '../live/gateway.ts'
import type { LiveState } from '../hooks/useLiveEvents.ts'
import { readableDateTime } from '../format.ts'
import { es } from '../copy/es.ts'

/**
 * `issued_at` puede traer nanosegundos (…49.245961871Z). Se recorta a
 * milisegundos antes de formatear, que es lo que entiende `Date`.
 */
function toMillis(iso: string): string {
  return iso.replace(/(\.\d{3})\d+/, '$1')
}

function eventTypeLabel(type: string): string {
  return (es.live.types as Record<string, string>)[type] ?? type
}

function originLabel(event: LiveEvent): string {
  if (event.simulated) return es.origin.simulatedBadge
  return event.dataOrigin === 'nisar_real' ? es.origin.real : es.origin.unknown
}

function clockTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('es-PE', { hour12: false })
}

export function LiveFeed({
  state,
  pollSeconds,
}: {
  state: LiveState
  pollSeconds: number
}) {
  const [latest, ...earlier] = state.events
  const statusText =
    state.status === 'online'
      ? es.live.online
      : state.status === 'offline'
        ? es.live.offline
        : es.live.connecting

  return (
    <section className={`live-feed live-${state.status}`} aria-label={es.live.title}>
      <header className="live-head">
        <Radio size={15} aria-hidden="true" />
        <strong>{es.live.title}</strong>
        <span className="live-status" role="status">
          <i className="live-dot" aria-hidden="true" />
          {statusText}
        </span>
      </header>

      {latest ? (
        <div className="live-latest">
          <div className="live-line">
            <strong>{eventTypeLabel(latest.type)}</strong>
            <span className={`live-origin ${latest.simulated ? 'is-simulated' : ''}`}>
              {originLabel(latest)}
            </span>
          </div>
          <p className="live-meta">
            {es.live.area} {latest.aoiId} · {es.live.issued}{' '}
            {readableDateTime(toMillis(latest.issuedAt))}
          </p>
          <p className="live-trust">
            {latest.gatewayVerified ? es.live.gatewayVerified : es.live.gatewayUnverified}
          </p>
        </div>
      ) : (
        <p className="live-empty">
          {state.status === 'offline' ? es.live.offlineDetail : es.live.waiting}
        </p>
      )}

      {latest && state.status === 'offline' && (
        <p className="live-empty">{es.live.offlineDetail}</p>
      )}

      {earlier.length > 0 && (
        <ol className="live-history" aria-label={es.live.history}>
          {earlier.map((event) => (
            <li key={event.wonbId}>
              <span>{eventTypeLabel(event.type)}</span>
              <time dateTime={toMillis(event.issuedAt)}>
                {readableDateTime(toMillis(event.issuedAt))}
              </time>
            </li>
          ))}
        </ol>
      )}

      <p className="live-foot">
        {es.live.every(pollSeconds)} · {es.live.lastChecked} {clockTime(state.lastChecked)}
      </p>
    </section>
  )
}
