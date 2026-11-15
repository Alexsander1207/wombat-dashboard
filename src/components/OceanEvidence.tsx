import { ChevronDown, ShieldCheck, X } from 'lucide-react'
import type { ExplorerCell, ExplorerData } from '../adapters/toExplorer.ts'
import { DataStatus } from './DataStatus.tsx'
import { EvidenceChain } from './Evidence.tsx'
import { CellSelector } from './CellSelector.tsx'
import { areaName, englishDateTime, englishKilometresFromMetres, englishPercentFromBp, englishRank } from './explorerCopy.ts'

/** Ocean Edition presentation of the current adapter; never reconstructs evidence. */
export function OceanEvidence({ cell, bundle, onClose, onSelect }: {
  cell: ExplorerCell
  bundle: ExplorerData
  onClose: () => void
  onSelect: (cell: ExplorerCell) => void
}) {
  const m = cell.metrics
  const distance = (metres: number) => `${metres} m (${englishKilometresFromMetres(metres)})`
  const rows: [string, string | number | null | undefined][] = [
    ['Changed area', m.changedBp == null ? null : englishPercentFromBp(m.changedBp)],
    ['Stronger radar signal', m.increaseBp == null ? null : englishPercentFromBp(m.increaseBp)],
    ['Weaker radar signal', m.decreaseBp == null ? null : englishPercentFromBp(m.decreaseBp)],
    ['Large signal change (p90)', m.p90AbsDeltaCdb == null ? null : `${m.p90AbsDeltaCdb / 100} dB`],
    ['OPERA water check', m.operaStatus],
    ['OPERA water overlap', m.operaOverlapBp == null ? null : englishPercentFromBp(m.operaOverlapBp)],
    ['Roads near change in this cell', m.roadMNearChange == null ? null : distance(m.roadMNearChange)],
    ['Total roads in this cell', m.roadMTotal == null ? null : distance(m.roadMTotal)],
  ]
  return (
    <section className="explorer-evidence" aria-label={`Evidence for ${cell.cellId}`}>
      <button className="explorer-evidence-close" onClick={onClose} aria-label="Close evidence"><X size={17} /></button>
      <details className="explorer-evidence-fold" open key={cell.cellId}>
        <summary>Evidence <ChevronDown size={15} /></summary>
        <div className="explorer-evidence-body">
          <CellSelector bundle={bundle} selected={cell} onSelect={onSelect} accessibleName="Evidence cell" />
          <span className="explorer-eyebrow">SELECTED CELL · EVIDENCE</span>
          <div className="explorer-cell-heading">
            <h2>Cell {cell.cellId}</h2><span className="explorer-rank-badge">{englishRank(cell.rank)}</span>
          </div>
          <p className="explorer-status-tag">{cell.statusLabel}</p>
          {cell.status === 'insufficient_quality' && <DataStatus kind="quality" title="Not ranked: fewer than 60% of pixels are usable" />}
          <dl className="explorer-core-metrics">
            <div><dt>Signed status</dt><dd><code>{cell.status}</code></dd></div>
            <div><dt>Signed rank</dt><dd>{englishRank(cell.rank)}</dd></div>
            {cell.score !== null && cell.scoreBp !== null && <div><dt>Signed score</dt><dd>{englishPercentFromBp(cell.scoreBp)} ({cell.scoreBp} bp)</dd></div>}
            {m.validBp != null && <div><dt>Usable data</dt><dd>{englishPercentFromBp(m.validBp)}</dd></div>}
          </dl>
          <div className="explorer-previews">
            {(['t1', 't2'] as const).map(key => <figure key={key}>
              <img src={bundle.overlays[key]} loading="lazy" alt={`Verified area overview: ${key === 't1' ? 'before' : 'after'}`} />
              <figcaption>{key === 't1' ? 'Before' : 'After'}<time dateTime={bundle[key]}>{bundle[key].slice(0, 10)}</time></figcaption>
            </figure>)}
          </div>
          <small className="explorer-muted">These images show the whole area, not just this cell.</small>
          <details className="explorer-accordion"><summary>Cell details</summary>
            <dl className="explorer-core-metrics">
              {rows.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <p className="explorer-muted">These road lengths belong to this cell. The map shows roads across the whole area.</p>
            <p className="explorer-muted">Radar measures signals bouncing off the ground. dB is the signal unit. p90 means 90% of measured changes are no larger than this value.</p>
          </details>
          {cell.componentsBp && <details className="explorer-accordion"><summary>Score parts and weights</summary>
            <table>
              <caption>Signed component values · configured weights</caption>
              <thead><tr><th>Part</th><th>Signed value</th><th>Weight</th></tr></thead>
              <tbody>{(['change', 'opera', 'road'] as const).filter(part => cell.componentsBp[part] != null).map(part => <tr key={part}>
                <th scope="row">{{ change: 'Change', opera: 'OPERA', road: 'Roads' }[part]}</th>
                <td>{englishPercentFromBp(cell.componentsBp[part])}<small>{cell.componentsBp[part]} bp</small></td>
                <td>{{ change: '0.45', opera: '0.35', road: '0.20' }[part]}</td>
              </tr>)}</tbody>
            </table>
            <p className="explorer-muted">Weights show how much each part counts. 100 bp means 1%. These values are not calculated again here.</p>
          </details>}
          {cell.signedExplanation.length > 0 && <details className="explorer-accordion"><summary>Signed explanation</summary>
            <ol>{cell.signedExplanation.map((text, index) => <li key={index}>{text}</li>)}</ol>
          </details>}
          <details className="explorer-accordion"><summary>Signed evidence and checks</summary>
            <EvidenceChain cell={cell} />
            <dl className="explorer-provenance">
              {cell.chain.filter(link => link.block !== null).map(({ type, block }) => <div key={type}>
                <dt>{type} record · signer</dt><dd><code>{block!.issuer}</code></dd>
                <dt>Issued</dt><dd>{englishDateTime(block!.issuedAt)}</dd>
                {block!.validUntil && <><dt>Valid until</dt><dd>{englishDateTime(block!.validUntil)}</dd></>}
                <dt>Snapshot expiry check</dt><dd>{block!.withinTtl ? 'Passed' : 'Expired'}</dd>
              </div>)}
            </dl>
          </details>
          <details className="explorer-accordion"><summary>Where the data came from</summary>
            <dl className="explorer-provenance">
              {Object.entries(bundle.manifest).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => <div key={key}>
                <dt>{key}</dt><dd>{key === 'aoiName' ? areaName(bundle) : String(value)}</dd>
              </div>)}
              <dt>Signed source</dt><dd>{bundle.dataOrigin}</dd>
            </dl>
            <p className="explorer-verification-note"><ShieldCheck size={14} /> Checked: {bundle.verification.filesChecked} files · {bundle.verification.blocksChecked} blocks · snapshot {englishDateTime(bundle.verification.asOf)}</p>
          </details>
          <p className="explorer-muted">A guide for field checks, not a forecast or confirmation of flooding.</p>
        </div>
      </details>
    </section>
  )
}
