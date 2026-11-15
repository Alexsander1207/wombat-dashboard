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
        <dt>Imagen utilizable</dt>
        <dd>{cell.valid} %</dd>
      </div>
      <div>
        <dt>Prioridad (0 a 100)</dt>
        <dd>
          {cell.score === null ? 'Sin dato' : Math.round(cell.score * 100)}
        </dd>
      </div>
      <div>
        <dt>Superficie que cambió</dt>
        <dd>{cell.changed} %</dd>
      </div>
      <div>
        <dt>Intensidad del cambio</dt>
        <dd>
          {cell.magnitude} <small>dB</small>
        </dd>
      </div>
      <div>
        <dt>Señal de radar más fuerte</dt>
        <dd>{cell.increased} %</dd>
      </div>
      <div>
        <dt>Señal de radar más débil</dt>
        <dd>{cell.decreased} %</dd>
      </div>
      <div>
        <dt>¿Lo confirma otro satélite?</dt>
        <dd className="text-metric">{cell.water}</dd>
      </div>
      <div>
        <dt>Caminos cerca del cambio</dt>
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
          <span className="section-caption">ZONA SELECCIONADA</span>
          <h2>{cell.label}</h2>
          <small className="cell-code">Código {cell.id}</small>
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
      aria-label={`Por qué ${cell.label}`}
    >
      <div className="evidence-top">
        <span>Por qué esta zona</span>
        <button aria-label="Cerrar la ficha de la zona" onClick={onClose}>
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
          detail="La imagen no alcanza para ordenar esta zona. No es un cero: es que no se puede saber."
        />
      )}
      {/* Primero el porqué, en palabras; después los números que lo sostienen. */}
      <div className="explanation">
        <span className="section-caption">¿POR QUÉ ESTA ZONA?</span>
        <p>{cell.explanation}</p>
      </div>
      <Metrics cell={cell} expanded />
      <div className="provenance-mini">
        <FileCheck2 size={15} />
        <span>
          {allValid
            ? `Dato comprobado: ${signed.length} firmas digitales válidas`
            : 'Hay firmas que no se pudieron comprobar'}
        </span>
      </div>
      <button className="primary-button" onClick={onExpand}>
        Ver las pruebas firmadas <ArrowUpRight size={16} />
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
          <span>Para esta zona no se publicó este paso.</span>
        ) : (
          <>
            <span>
              <code title={block.id}>{shortHash(block.id)}</code>
            </span>
            <span
              className={`verification-status ${valid ? 'verify-verified' : 'verify-failed'}`}
            >
              {valid ? <Check size={12} /> : <TriangleAlert size={12} />}
              {block.hashOk ? 'Huella intacta' : 'La huella no coincide'} ·{' '}
              {block.signatureOk ? 'Firma válida' : 'Firma inválida'}
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
          <ShieldCheck size={16} /> De dónde sale este dato, paso a paso
        </span>
      </div>
      <p>
        Cada paso llega firmado digitalmente. Tu navegador acaba de comprobar
        su huella (SHA-256) y su firma (Ed25519): si alguien hubiera alterado
        un solo número, aquí se vería.
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
      aria-label="Pruebas de la zona"
      key={cell.id}
    >
      <div className="evidence-top">
        <div>
          <h1>Las pruebas de esta zona</h1>
          <p>Del cambio que vio el satélite a la revisión en campo</p>
        </div>
        <button aria-label="Volver al mapa" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <EvidenceHeading cell={cell} />
      <div className="detail-section">
        <div className="section-title">
          <span>Los números</span>
          <span className="section-caption">DEL DATO FIRMADO</span>
        </div>
        <Metrics cell={cell} expanded />
      </div>
      <div className="detail-section">
        <h3>Por qué esta zona tiene este puesto</h3>
        <p>{cell.explanation}</p>
      </div>
      <EvidenceChain cell={cell} />
      <div className="detail-section provenance">
        <h3>Procedencia</h3>
        <p>
          Los números y el puesto salen del dato firmado de esta zona. El orden
          es una sugerencia de revisión para preparación; no es un pronóstico
          ni dice que la zona esté inundada.
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
