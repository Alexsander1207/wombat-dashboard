import { areaName, englishDateTime, englishRank, englishStatus } from './explorerCopy.ts';
import type { ExplorerCell, ExplorerData } from '../adapters/toExplorer.ts';
import { ChevronDown, ShieldCheck, X } from 'lucide-react';
import { decibelsFromCdb, kilometresFromMetres, metres, percentFromBp } from '../format.ts';
import { DataStatus } from './DataStatus.tsx';

export function EvidenceVerification({ bundle }: { bundle: ExplorerData }) {
  const v = bundle.verification;
  return <p className="explorer-verification-note"><ShieldCheck size={14} /> Checked: {v.filesChecked} files · {v.blocksChecked} blocks · snapshot {englishDateTime(v.asOf)}</p>;
}
function distance(value: number) {
  return value < 1000 ? `${metres(value)} (${kilometresFromMetres(value)})` : `${kilometresFromMetres(value)} (${metres(value)})`;
}
export function EvidenceCard({ cell, bundle, onClose }: { cell: ExplorerCell; bundle: ExplorerData; onClose: () => void }) {
  const m = cell.metrics;
  const rows: [string, string | number | null | undefined][] = [
    ['Changed area', m.changedBp == null ? null : percentFromBp(m.changedBp)],
    ['Stronger radar signal', m.increaseBp == null ? null : percentFromBp(m.increaseBp)],
    ['Weaker radar signal', m.decreaseBp == null ? null : percentFromBp(m.decreaseBp)],
    ['Large signal change (p90)', m.p90AbsDeltaCdb == null ? null : decibelsFromCdb(m.p90AbsDeltaCdb)],
    ['OPERA water check', m.operaStatus],
    ['OPERA water overlap', m.operaOverlapBp == null ? null : percentFromBp(m.operaOverlapBp)],
    ['Roads near change in this cell', m.roadMNearChange == null ? null : distance(m.roadMNearChange)],
    ['Total roads in this cell', m.roadMTotal == null ? null : distance(m.roadMTotal)],
  ];
  return <section className="explorer-evidence" aria-label={`Evidence for ${cell.cellId}`}>
    <button className="explorer-evidence-close" onClick={onClose} aria-label="Close evidence"><X size={17} /></button>
    <details className="explorer-evidence-fold" open key={cell.cellId}>
      <summary>Evidence <ChevronDown size={15} /></summary>
      <div className="explorer-evidence-body">
        <span className="explorer-eyebrow">SELECTED CELL · EVIDENCE</span>
        <div className="explorer-cell-heading"><h2>Cell {cell.cellId}</h2><span className="explorer-rank-badge">{englishRank(cell.rank)}</span></div>
        <p className="explorer-status-tag">{englishStatus(cell.status)}</p>
        {cell.status === 'insufficient_quality' && <DataStatus kind="quality" title="Not ranked: fewer than 60% of pixels are usable" />}
        <dl className="explorer-core-metrics">
          <div><dt>Signed status</dt><dd><code>{cell.status}</code></dd></div>
          <div><dt>Signed rank</dt><dd>{englishRank(cell.rank)}</dd></div>
          {cell.score !== null && cell.scoreBp !== null && <div><dt>Signed score</dt><dd>{percentFromBp(cell.scoreBp)} ({cell.scoreBp} bp)</dd></div>}
          {m.validBp != null && <div><dt>Usable data</dt><dd>{percentFromBp(m.validBp)}</dd></div>}
        </dl>
        <div className="explorer-previews">{(['t1', 't2'] as const).map(key => <figure key={key}>
          <img src={bundle.overlays[key]} alt={`Area overview ${key}, verified image`} />
          <figcaption>{key === 't1' ? 'Before' : 'After'}<time dateTime={bundle[key]}>{bundle[key].slice(0, 10)}</time></figcaption>
        </figure>)}</div>
        <small className="explorer-muted">These images show the whole area, not just this cell.</small>
        <details className="explorer-accordion"><summary>Cell details</summary>
          <dl className="explorer-core-metrics">{rows.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) =>
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className="explorer-muted">These road lengths belong to this cell. The map shows roads across the whole area.</p>
          <p className="explorer-muted">Radar measures signals bouncing off the ground. dB is the signal unit. p90 means 90% of measured changes are no larger than this value.</p>
        </details>
        {cell.componentsBp && <details className="explorer-accordion"><summary>Score parts and weights</summary>
          <table><caption>Signed values · set weights</caption><thead><tr><th>Part</th><th>Signed value</th><th>Weight</th></tr></thead><tbody>
            {(['change', 'opera', 'road'] as const).filter(key => cell.componentsBp[key] != null).map(key =>
              <tr key={key}><th scope="row">{{ change: 'Change', opera: 'OPERA', road: 'Roads' }[key]}</th><td>{percentFromBp(cell.componentsBp[key])}<small>{cell.componentsBp[key]} bp</small></td><td>{{ change: '0.45', opera: '0.35', road: '0.20' }[key]}</td></tr>)}
          </tbody></table>
          <p className="explorer-muted">Weights show how much each part counts. 100 bp means 1%.</p>
        </details>}
        {cell.explanation.length > 0 && <details className="explorer-accordion"><summary>Signed explanation</summary><ol>{cell.explanation.map((text, i) => <li key={i}>{text}</li>)}</ol></details>}
        <details className="explorer-accordion"><summary>Where the data came from</summary><dl className="explorer-provenance">
          {Object.entries(bundle.manifest).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) =>
            <div key={key}><dt>{key}</dt><dd>{key === 'aoiName' ? areaName(bundle) : String(value)}</dd></div>)}
          <dt>Signed source</dt><dd>{bundle.dataOrigin}</dd><dt>t1</dt><dd>{bundle.t1}</dd><dt>t2</dt><dd>{bundle.t2}</dd>
        </dl><EvidenceVerification bundle={bundle} /></details>
      </div>
    </details>
  </section>;
}
export const EvidenceDetails = EvidenceCard;
