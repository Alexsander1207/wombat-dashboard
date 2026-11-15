/**
 * Tarjeta "Live": lo más reciente del área que se está viendo.
 *
 * Sigue al área elegida en "Area of interest". Muestra, por orden:
 *
 *  1. El último evento que el gateway publica para ESA área, si lo hay. No
 *     pasó por la verificación del navegador (ver src/live/gateway.ts), y la
 *     tarjeta lo dice.
 *  2. Si la red todavía no trae nada de esa área, el registro `change` firmado
 *     del propio paquete de datos, que este navegador sí verificó.
 *
 * La procedencia sale siempre del dato: "Real NISAR data" solo si el evento o
 * el paquete lo declaran real; lo demás se rotula como dato de demostración.
 *
 * Usa la clase `integrity-panel` para verse igual que las otras tarjetas del
 * pie del Explorer (Explorer.css); lo propio está en src/styles/live.css.
 */
import { Radio } from 'lucide-react'
import type { LiveState } from '../hooks/useLiveEvents.ts'
import { englishDateTime } from './explorerCopy.ts'

/** Lo que la tarjeta necesita saber del área que se está viendo. */
export interface LiveArea {
  aoiId: string
  /** `data_origin` del bloque `change` firmado del paquete. */
  dataOrigin: string
  /** `issued_at` del bloque `change` firmado del paquete. */
  issuedAt: string
}

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

/** Etiqueta de procedencia: real solo si el dato lo declara real. */
function originLabel(real: boolean, dataOrigin: string): string {
  if (real) return 'Real NISAR data'
  return dataOrigin === 'simulated' ? 'Demo data' : 'Unclassified source'
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
  area,
}: {
  state: LiveState
  pollSeconds: number
  area: LiveArea
}) {
  // Solo cuentan los eventos del área que se está viendo.
  const [latest, ...earlier] = state.events.filter((event) => event.aoiId === area.aoiId)

  const real = latest
    ? !latest.simulated
    : area.dataOrigin === 'nisar_real'
  const origin = originLabel(real, latest ? latest.dataOrigin : area.dataOrigin)

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

      <p className="integrity-line live-line">
        {eventTypeLabel(latest ? latest.type : 'change')}
        <span className={`live-origin ${real ? 'is-real' : ''}`}>{origin}</span>
      </p>
      <p className="explorer-summary-meta">
        Area: {area.aoiId} · issued{' '}
        {englishDateTime(toMillis(latest ? latest.issuedAt : area.issuedAt))}
      </p>

      {latest ? (
        <p className="explorer-summary-meta">
          {latest.gatewayVerified
            ? 'Checked by the gateway, not by this browser.'
            : 'The gateway does not mark it as checked.'}
        </p>
      ) : (
        <p className="explorer-summary-meta">
          Signed record, verified in this browser.
          {state.status === 'online' && ' No newer event on the network yet.'}
        </p>
      )}

      {state.status === 'offline' && (
        <p className="explorer-summary-meta">{OFFLINE_DETAIL}</p>
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
