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
import { englishDate as readableDate, englishPercentFromBp, englishKilometresFromMetres } from './explorerCopy.ts'
import { DataStatus } from './DataStatus'

const fmt = (n: number | null | undefined): string =>
  n === null || n === undefined ? '' : String(n)

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
        <dt>Usable pixels</dt>
        <dd>{fmt(cell.valid)} %</dd>
      </div>
      {cell.score !== null && cell.scoreBp !== null && (
        <div>
          <dt>Signed score</dt>
          <dd>{englishPercentFromBp(cell.scoreBp)} ({cell.scoreBp} bp)</dd>
        </div>
      )}
      <div>
        <dt>Changed surface</dt>
        <dd>{fmt(cell.changed)} %</dd>
      </div>
      <div>
        <dt>Change strength</dt>
        <dd>
          {fmt(cell.magnitude)} <small>dB</small>
        </dd>
      </div>
      <div>
        <dt>Stronger radar signal</dt>
        <dd>{fmt(cell.increased)} %</dd>
      </div>
      <div>
        <dt>Weaker radar signal</dt>
        <dd>{fmt(cell.decreased)} %</dd>
      </div>
      <div>
        <dt>Sentinel-1 water context</dt>
        <dd className="text-metric">{cell.water}</dd>
      </div>
      <div>
        <dt>Roads near change in this cell</dt>
        <dd>
          {cell.metrics.roadMNearChange} m ({englishKilometresFromMetres(cell.metrics.roadMNearChange)})
        </dd>
      </div>
      <div>
        <dt>Total roads in this cell</dt>
        <dd>{cell.metrics.roadMTotal} m ({englishKilometresFromMetres(cell.metrics.roadMTotal)})</dd>
      </div>
      {expanded && cell.componentsBp && (['change', 'opera', 'road'] as const).map((part) => (
        <div key={part}>
          <dt>{part === 'change' ? 'Change' : part === 'opera' ? 'OPERA' : 'Roads'} component (weight {part === 'change' ? '0.45' : part === 'opera' ? '0.35' : '0.20'})</dt>
          <dd>{englishPercentFromBp(cell.componentsBp[part])} ({cell.componentsBp[part]} bp)</dd>
        </div>
      ))}
    </dl>
  )
}

function EvidenceHeading({ cell }: { cell: ExplorerCell }) {
  return (
    <>
      <div className="evidence-identity">
        <div>
          <span className="section-caption">SELECTED CELL</span>
          <h2>{cell.label}</h2>
          <small className="cell-code">Cell ID: {cell.id}</small>
        </div>
        <span className="rank-badge">
          {cell.rank === null ? 'NOT RANKED' : `RANK #${cell.rank}`}
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
      aria-label={`Evidence for ${cell.label}`}
    >
      <div className="evidence-top">
        <span>Why this cell</span>
        <button aria-label="Close cell evidence" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <EvidenceHeading cell={cell} />
      {/* El diseño original traía aquí dos miniaturas decorativas de radar.
          No eran datos: se muestran solo las fechas reales del par. */}
      <p className="observation-pair">
        <span>BEFORE · t1</span> {readableDate(before)} <span>→</span>{' '}
        <span>AFTER · t2</span> {readableDate(after)}
      </p>
      {!cell.sufficientQuality && (
        <DataStatus
          kind="quality"
          title="Not enough usable data"
          detail="Not ranked: fewer than 60% of pixels are usable"
        />
      )}
      {/* Primero el porqué, en palabras; después los números que lo sostienen. */}
      <div className="explanation">
        <span className="section-caption">SIGNED EXPLANATION</span>
        <p>{cell.signedExplanation.map((text, i) => <span key={i}>{text}{i < cell.signedExplanation.length - 1 ? " " : ""}</span>)}</p>
      </div>
      <Metrics cell={cell} expanded />
      <p>These road lengths belong to this cell, not the whole road network.</p>
      <div className="provenance-mini">
        <FileCheck2 size={15} />
        <span>
          {allValid
            ? `Verified evidence: ${signed.length} valid digital signatures`
            : 'Some signatures could not be checked'}
        </span>
      </div>
      <button className="primary-button" onClick={onExpand}>
        View signed evidence <ArrowUpRight size={16} />
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
          <span>This step was not published for this cell.</span>
        ) : (
          <>
            <span>
              <code title={block.id}>{shortHash(block.id)}</code>
            </span>
            <span
              className={`verification-status ${valid ? 'verify-verified' : 'verify-failed'}`}
            >
              {valid ? <Check size={12} /> : <TriangleAlert size={12} />}
              {block.hashOk ? 'Hash matches' : 'Hash mismatch'} ·{' '}
              {block.signatureOk ? 'Valid signature' : 'Invalid signature'}
              {!block.withinTtl && ' · expired'}
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
          <ShieldCheck size={16} /> Where this evidence comes from
        </span>
      </div>
      <p>
        Each step has a digital signature. Your browser checked its file
        fingerprint (SHA-256) and signature (Ed25519). These checks detect
        changes and confirm who signed the evidence.
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
      aria-label="Cell evidence"
      key={cell.id}
    >
      <div className="evidence-top">
        <div>
          <h1>Evidence for this cell</h1>
          <p>From satellite observations to field checks</p>
        </div>
        <button aria-label="Back to map" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <EvidenceHeading cell={cell} />
      <div className="detail-section">
        <div className="section-title">
          <span>The measurements</span>
          <span className="section-caption">FROM SIGNED DATA</span>
        </div>
        <Metrics cell={cell} expanded />
      <p>These road lengths belong to this cell, not the whole road network.</p>
      </div>
      <div className="detail-section">
        <h3>Why this cell has this rank</h3>
        <p>{cell.signedExplanation.map((text, i) => <span key={i}>{text}{i < cell.signedExplanation.length - 1 ? " " : ""}</span>)}</p>
      </div>
      <EvidenceChain cell={cell} />
      <div className="detail-section provenance">
        <h3>Sources</h3>
        <p>
          These measurements and ranks come from this cell’s signed evidence.
          The order helps plan field checks. It is not a forecast and does
          not confirm flooding.
        </p>
        <a
          href="https://www.jpl.nasa.gov/go/opera/products/"
          target="_blank"
          rel="noreferrer"
        >
          About OPERA products <ExternalLink size={12} />
        </a>
      </div>
    </aside>
  )
}
