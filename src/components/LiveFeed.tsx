/**
 * Tarjeta "Live": el último evento que publica el gateway.
 *
 * Va aparte del mapa y de "Verified data" a propósito. Lo que se muestra aquí
 * no pasó por la verificación del navegador (ver src/live/gateway.ts), y si el
 * evento es simulado se dice en la misma tarjeta.
 *
 * Usa la clase `integrity-panel` para verse igual que las otras tarjetas del
 * pie del Explorer (Explorer.css); lo propio está en src/styles/live.css.
 */
import { Radio } from 'lucide-react'
import type { LiveEvent } from '../live/gateway.ts'
import type { LiveState } from '../hooks/useLiveEvents.ts'
import { englishDateTime } from './explorerCopy.ts'

const EVENT_TYPES: Record<string, string> = {
  change: 'Change observed',
  context: 'Road context',
  risk: 'Cell priority',
  action: 'Suggested check',
}

const STATUS_TEXT: Record<LiveState['status'], string> = {
  connecting: 'Connecting…',
  online: 'Connected',
  offline: 'Offline',
}

const OFFLINE_DETAIL =
  'The gateway is not responding. The map still shows the verified data.'

/**
 * `issued_at` puede traer nanosegundos (…49.245961871Z). Se recorta a
 * milisegundos antes de formatear, que es lo que entiende `Date`.
 */
function toMillis(iso: string): string {
  return iso.replace(/(\.\d{3})\d+/, '$1')
}

function eventTypeLabel(type: string): string {
  return EVENT_TYPES[type] ?? type
}

function originLabel(event: LiveEvent): string {
  if (event.simulated) return 'Simulated'
  return event.dataOrigin === 'nisar_real' ? 'Real NISAR data' : 'Unclassified source'
}

function clockTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-GB', { hour12: false })
}

export function LiveFeed({
  state,
  pollSeconds,
}: {
  state: LiveState
  pollSeconds: number
}) {
  const [latest, ...earlier] = state.events

  return (
    <section className={`integrity-panel live-feed live-${state.status}`} aria-label="Live feed">
      <header className="live-head">
        <Radio size={13} aria-hidden="true" />
        <h2>Live</h2>
        <span className="live-status" role="status">
          <i className="live-dot" aria-hidden="true" />
          {STATUS_TEXT[state.status]}
        </span>
      </header>

      {latest ? (
        <>
          <p className="integrity-line live-line">
            {eventTypeLabel(latest.type)}
            <span className={`live-origin ${latest.simulated ? 'is-simulated' : ''}`}>
              {originLabel(latest)}
            </span>
          </p>
          <p className="explorer-summary-meta">
            Area: {latest.aoiId} · issued {englishDateTime(toMillis(latest.issuedAt))}
          </p>
          <p className="explorer-summary-meta">
            {latest.gatewayVerified
              ? 'Checked by the gateway, not by this browser.'
              : 'The gateway does not mark it as checked.'}
          </p>
          {state.status === 'offline' && (
            <p className="explorer-summary-meta">{OFFLINE_DETAIL}</p>
          )}
        </>
      ) : (
        <p className="explorer-summary-meta">
          {state.status === 'offline'
            ? OFFLINE_DETAIL
            : 'Waiting for the first event from the gateway…'}
        </p>
      )}

      {earlier.length > 0 && (
        <ol className="live-history" aria-label="Earlier events in this session">
          {earlier.map((event) => (
            <li key={event.wonbId}>
              <span>{eventTypeLabel(event.type)}</span>
              <time dateTime={toMillis(event.issuedAt)}>
                {englishDateTime(toMillis(event.issuedAt))}
              </time>
            </li>
          ))}
        </ol>
      )}

      <p className="explorer-summary-meta live-foot">
        Updates every {pollSeconds} s · last check {clockTime(state.lastChecked)}
      </p>
    </section>
  )
}
