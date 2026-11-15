/**
 * Ficha y detalle de evidencia de una celda.
 *
 * Diseño y maquetación: Ximenacode (Mireyamd/Dashboard_Wambort,
 * src/components/Evidence.tsx). Aquí se conectó a los datos del bundle
 * verificado y se pasó a español.
 *
 * `EvidenceChain` es el componente que recibe la celda con sus cuatro bloques
 * firmados (cambio, contexto, riesgo, acción), cada uno con su hash y su
 * estado de firma reales. Ver docs/INTEGRACION-UI.md.
 */
import {
  ArrowUpRight,
  Check,
  FileCheck2,
  ShieldCheck,
  X,
  ExternalLink,
  TrendingUp,
  Waves,
  Route,
  ClipboardCheck,
  TriangleAlert,
} from 'lucide-react'
import type { EvidenceLink, ExplorerCell } from '../adapters/toExplorer.ts'
import { readableDate } from '../format.ts'
import { DataStatus } from './DataStatus'

function Metrics({
  cell,
  expanded = false,
}: {
  cell: ExplorerCell
  expanded?: boolean
}) {
  return (
    <dl className={expanded ? 'metrics expanded-metrics' : 'metrics'}>
      <div>
        <dt>Píxeles válidos</dt>
        <dd>{cell.valid} %</dd>
      </div>
      <div>
        <dt>Puntaje de prioridad</dt>
        <dd>
          {cell.score === null ? 'Sin puntaje' : cell.score.toFixed(2)}
        </dd>
      </div>
      <div>
        <dt>Área con cambio</dt>
        <dd>{cell.changed} %</dd>
      </div>
      <div>
        <dt>Magnitud del cambio (p90)</dt>
        <dd>
          {cell.magnitude} <small>dB</small>
        </dd>
      </div>
      <div>
        <dt>Retrodispersión en aumento</dt>
        <dd>{cell.increased} %</dd>
      </div>
      <div>
        <dt>Retrodispersión en descenso</dt>
        <dd>{cell.decreased} %</dd>
      </div>
      <div>
        <dt>Contraste con OPERA</dt>
        <dd className="text-metric">{cell.water}</dd>
      </div>
      <div>
        <dt>Vías cerca del cambio</dt>
        <dd>
          {cell.roads} <small>km</small>
        </dd>
      </div>
    </dl>
  )
}

function EvidenceHeading({ cell }: { cell: ExplorerCell }) {
  return (
    <>
      <div className="evidence-identity">
        <div>
          <span className="section-caption">CELDA SELECCIONADA · EVIDENCIA</span>
          <h2>Celda {cell.id}</h2>
        </div>
        <span className="rank-badge">
          {cell.rank === null ? 'SIN PUESTO' : `PUESTO #${cell.rank}`}
        </span>
      </div>
      <div className="evidence-tags">
        <span
          className={cell.sufficientQuality ? 'quality-tag' : 'quality-tag low'}
        >
          <span className="status-dot" />
          {cell.statusLabel}
        </span>
        {cell.action && <span className="fixture-tag">{cell.action}</span>}
      </div>
    </>
  )
}

export function EvidenceCard({
  cell,
  before,
  after,
  onClose,
  onExpand,
}: {
  cell: ExplorerCell
  before: string
  after: string
  onClose: () => void
  onExpand: () => void
}) {
  const signed = cell.chain.filter((link) => link.block !== null)
  const allValid = signed.every(
    (link) => link.block?.hashOk && link.block.signatureOk,
  )
  return (
    <aside
      className="panel evidence-card"
      aria-label={`Evidencia de la celda ${cell.id}`}
    >
      <div className="evidence-top">
        <span>Evidencia de la celda</span>
        <button aria-label="Cerrar la ficha de evidencia" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <EvidenceHeading cell={cell} />
      {/* El diseño original traía aquí dos miniaturas decorativas de radar.
          No eran datos: se muestran solo las fechas reales del par. */}
      <p className="observation-pair">
        <span>ANTES · t1</span> {readableDate(before)} <span>→</span>{' '}
        <span>DESPUÉS · t2</span> {readableDate(after)}
      </p>
      {!cell.sufficientQuality && (
        <DataStatus
          kind="quality"
          title="Datos insuficientes"
          detail="La calidad del dato no permite ordenar esta celda. No es un cero."
        />
      )}
      {/* Primero el porqué, en palabras; después los números que lo sostienen. */}
      <div className="explanation">
        <span className="section-caption">¿POR QUÉ ESTA CELDA?</span>
        <p>{cell.explanation}</p>
      </div>
      <Metrics cell={cell} expanded />
      <div className="provenance-mini">
        <FileCheck2 size={15} />
        <span>
          {allValid
            ? `${signed.length} bloques firmados · hash y firma válidos`
            : 'Hay bloques que no verifican'}
        </span>
      </div>
      <button className="primary-button" onClick={onExpand}>
        Ver la evidencia completa <ArrowUpRight size={16} />
      </button>
    </aside>
  )
}

const LINK_ICONS = {
  change: TrendingUp,
  context: Waves,
  risk: Route,
  action: ClipboardCheck,
} as const

/** "sha256:2706faf4…54e72a5c": lo bastante corto para leerse, completo en el title. */
function shortHash(id: string): string {
  const hex = id.replace('sha256:', '')
  return `sha256:${hex.slice(0, 8)}…${hex.slice(-8)}`
}

function ChainLink({ link }: { link: EvidenceLink }) {
  const Icon = LINK_ICONS[link.type]
  const block = link.block
  const valid = block !== null && block.hashOk && block.signatureOk
  return (
    <section data-block-type={link.type}>
      <Icon size={17} />
      <div>
        <h3>{link.title}</h3>
        <p>{link.summary}</p>
        {block === null ? (
          <span>Esta celda no tiene bloque de este tipo en el bundle.</span>
        ) : (
          <>
            <span>
              <code title={block.id}>{shortHash(block.id)}</code>
            </span>
            <span
              className={`verification-status ${valid ? 'verify-verified' : 'verify-failed'}`}
            >
              {valid ? <Check size={12} /> : <TriangleAlert size={12} />}
              {block.hashOk ? 'Hash válido' : 'Hash no coincide'} ·{' '}
              {block.signatureOk ? 'Firma Ed25519 válida' : 'Firma inválida'}
              {!block.withinTtl && ' · fuera de vigencia'}
            </span>
          </>
        )}
      </div>
    </section>
  )
}

/**
 * La cadena de evidencia de una celda: cambio → contexto → riesgo → acción.
 *
 * Recibe la celda con `cell.chain`, cuatro eslabones en ese orden, cada uno
 * con `block.id` (el hash) y `block.hashOk` / `block.signatureOk` tal como
 * los calculó src/verify en este navegador.
 */
export function EvidenceChain({ cell }: { cell: ExplorerCell }) {
  return (
    <section className="verification">
      <div className="section-title">
        <span>
          <ShieldCheck size={16} /> Cadena de evidencia firmada
        </span>
      </div>
      <p>
        Cada bloque se verificó en este navegador: su hash SHA-256 y su firma
        Ed25519 contra la clave fijada en la configuración del dashboard.
      </p>
      <div className="wonb-sections">
        {cell.chain.map((link) => (
          <ChainLink key={link.type} link={link} />
        ))}
      </div>
    </section>
  )
}

export function EvidenceDetails({
  cell,
  onClose,
}: {
  cell: ExplorerCell
  onClose: () => void
}) {
  return (
    <aside
      className="panel evidence-details"
      aria-label="Detalle de la evidencia"
      key={cell.id}
    >
      <div className="evidence-top">
        <div>
          <h1>Detalle de la evidencia</h1>
          <p>Del cambio en superficie a la revisión en campo</p>
        </div>
        <button aria-label="Volver al mapa" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <EvidenceHeading cell={cell} />
      <div className="detail-section">
        <div className="section-title">
          <span>Métricas de la evidencia</span>
          <span className="section-caption">DEL BLOQUE DE RIESGO FIRMADO</span>
        </div>
        <Metrics cell={cell} expanded />
      </div>
      <div className="detail-section">
        <h3>Por qué esta celda tiene este puesto</h3>
        <p>{cell.explanation}</p>
      </div>
      <EvidenceChain cell={cell} />
      <div className="detail-section provenance">
        <h3>Procedencia</h3>
        <p>
          Las métricas y el puesto salen del bloque de riesgo firmado de esta
          celda. El orden es una sugerencia de revisión para preparación; no
          es un pronóstico ni una clasificación de inundación.
        </p>
        <a
          href="https://www.jpl.nasa.gov/go/opera/products/"
          target="_blank"
          rel="noreferrer"
        >
          Sobre los productos OPERA <ExternalLink size={12} />
        </a>
      </div>
    </aside>
  )
}
