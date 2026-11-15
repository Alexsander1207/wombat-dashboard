import { useState } from 'react'
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
  ChevronRight,
} from 'lucide-react'
import {
  type CellEvidence,
  type VerificationResult,
  verifyEvidence,
} from '../frontend/demoAdapter'
import { DataStatus } from './DataStatus'

function Metrics({
  cell,
  expanded = false,
}: {
  cell: CellEvidence
  expanded?: boolean
}) {
  return (
    <dl className={expanded ? 'metrics expanded-metrics' : 'metrics'}>
      <div>
        <dt>Valid observations</dt>
        <dd>{cell.valid}%</dd>
      </div>
      <div>
        <dt>
          Backend score <span className="muted">(fixture)</span>
        </dt>
        <dd>{cell.score.toFixed(2)}</dd>
      </div>
      <div>
        <dt>Changed area</dt>
        <dd>{cell.changed}%</dd>
      </div>
      <div>
        <dt>Change magnitude</dt>
        <dd>
          {cell.magnitude > 0 ? '+' : ''}
          {cell.magnitude} <small>dB</small>
        </dd>
      </div>
      <div>
        <dt>Increased backscatter</dt>
        <dd>{cell.increased}%</dd>
      </div>
      <div>
        <dt>Decreased backscatter</dt>
        <dd>{cell.decreased}%</dd>
      </div>
      <div>
        <dt>OPERA corroboration</dt>
        <dd className="text-metric">{cell.water}</dd>
      </div>
      <div>
        <dt>Road exposure</dt>
        <dd>
          {cell.roads} <small>km</small>
        </dd>
      </div>
    </dl>
  )
}
function EvidenceHeading({ cell }: { cell: CellEvidence }) {
  return (
    <>
      <div className="evidence-identity">
        <div>
          <span className="section-caption">SELECTED CELL · EVIDENCE</span>
          <h2>Cell {cell.id}</h2>
        </div>
        <span className="rank-badge">RANK #{cell.rank}</span>
      </div>
      <div className="evidence-tags">
        <span
          className={
            cell.quality === 'Sufficient' ? 'quality-tag' : 'quality-tag low'
          }
        >
          <span className="status-dot" />
          {cell.quality}
        </span>
        <span className="fixture-tag">FIXTURE</span>
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
  cell: CellEvidence
  before: string
  after: string
  onClose: () => void
  onExpand: () => void
}) {
  return (
    <aside
      className="panel evidence-card"
      aria-label={`Evidence for ${cell.id}`}
    >
      <div className="evidence-top">
        <span>Cell evidence</span>
        <button aria-label="Close evidence card" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <EvidenceHeading cell={cell} />
      <div className="observation-previews">
        <div className="radar-preview before-preview">
          <span>BEFORE · t1</span>
          <small>{before} · Fixture</small>
        </div>
        <div className="radar-preview after-preview">
          <span>AFTER · t2</span>
          <small>{after} · Fixture</small>
        </div>
      </div>
      {cell.quality !== 'Sufficient' && (
        <DataStatus
          kind="quality"
          title="Insufficient quality"
          detail="Additional observations are needed."
        />
      )}
      <Metrics cell={cell} />
      <div className="explanation">
        <span className="section-caption">WHY THIS CELL?</span>
        <p>{cell.explanation}</p>
      </div>
      <div className="provenance-mini">
        <FileCheck2 size={15} />
        <span>Frontend fixture · Not verified</span>
      </div>
      <button className="primary-button" onClick={onExpand}>
        View Full Evidence <ArrowUpRight size={16} />
      </button>
    </aside>
  )
}
export function EvidenceVerification() {
  const [result, setResult] = useState<VerificationResult>({
    status: 'Not Checked',
    message: 'No signature verification has been performed.',
  })
  const [checking, setChecking] = useState(false)
  const verify = async () => {
    setChecking(true)
    try {
      setResult(await verifyEvidence())
    } catch {
      setResult({
        status: 'Failed',
        message:
          'The verification request failed. Evidence has not been verified.',
      })
    } finally {
      setChecking(false)
    }
  }
  return (
    <section className="verification">
      <div className="section-title">
        <span>
          <ShieldCheck size={16} /> Evidence verification
        </span>
        <span
          className={`verification-status verify-${result.status.toLowerCase().replace(' ', '-')}`}
        >
          {result.status === 'Verified' && <Check size={12} />} {result.status}
        </span>
      </div>
      <p role="status">{result.message}</p>
      <button className="primary-button" disabled={checking} onClick={verify}>
        <ShieldCheck size={16} />
        {checking ? 'Checking evidence…' : 'Verify Evidence'}
        <ChevronRight size={15} />
      </button>
      <small>
        Checks authenticity and integrity when a verifier is connected.
      </small>
    </section>
  )
}
export function EvidenceDetails({
  cell,
  onClose,
}: {
  cell: CellEvidence
  onClose: () => void
}) {
  return (
    <aside
      className="panel evidence-details"
      aria-label="Evidence details"
      key={cell.id}
    >
      <div className="evidence-top">
        <div>
          <h1>Evidence Details</h1>
          <p>From surface change to field investigation</p>
        </div>
        <button aria-label="Back to Map Explorer" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <EvidenceHeading cell={cell} />
      <div className="detail-section">
        <div className="section-title">
          <span>Evidence Metrics</span>
          <span className="section-caption">ILLUSTRATIVE VALUES</span>
        </div>
        <Metrics cell={cell} expanded />
      </div>
      <div className="detail-section">
        <h3>Why this cell was prioritized</h3>
        <p>{cell.explanation}</p>
      </div>
      <div className="wonb-sections">
        <section>
          <TrendingUp size={17} />
          <div>
            <h3>WONB Change</h3>
            <p>
              {cell.changed}% changed area · {cell.magnitude > 0 ? '+' : ''}
              {cell.magnitude} dB
            </p>
            <span>Demonstration surface change evidence</span>
          </div>
        </section>
        <section>
          <Waves size={17} />
          <div>
            <h3>WONB Context</h3>
            <p>{cell.water}</p>
            <span>Illustrative water extent; not a flood classification</span>
          </div>
        </section>
        <section>
          <Route size={17} />
          <div>
            <h3>WONB Risk</h3>
            <p>{cell.roads} km of illustrative road exposure</p>
            <span>Field investigation priority; no risk prediction</span>
          </div>
        </section>
      </div>
      <div className="detail-section provenance">
        <h3>Evidence provenance</h3>
        <p>
          Source: <code>src/frontend/demoAdapter.ts</code>
        </p>
        <p>
          Geometry, observation dates, metrics and priority order are declared
          frontend fixtures. No NISAR, OPERA, OSM road extract or signed WONB
          evidence has been ingested.
        </p>
        <a
          href="https://www.jpl.nasa.gov/go/opera/products/"
          target="_blank"
          rel="noreferrer"
        >
          About OPERA products <ExternalLink size={12} />
        </a>
      </div>
      <EvidenceVerification />
    </aside>
  )
}
