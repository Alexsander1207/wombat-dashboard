import { ArrowUpRight } from 'lucide-react';
import type { ExplorerData } from '../adapters/toExplorer.ts';
import type { OverlayKey } from './statusColors.ts';
import { percentFromBp } from '../format.ts';

export interface VisibleLayers { change: boolean; roads: boolean; grid: boolean }
export function MapLayerControls({ layers, onChange, opacity, onOpacity, hasRoads, overlay, onOverlayChange, compare, satellite, onSatellite }: {
  layers: VisibleLayers;
  onChange: (key: keyof VisibleLayers, checked: boolean) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  hasRoads: boolean;
  overlay: OverlayKey;
  onOverlayChange: (key: OverlayKey) => void;
  compare: boolean;
  satellite: boolean;
  onSatellite: (value: boolean) => void;
}) {
  return <section className="explorer-layer-controls" aria-label="Map layers"><h2>Layers</h2>
    <p className="explorer-muted">Choose what you see on the map.</p>
    <label className="explorer-layer-row"><span>Satellite background<small>Esri · background only, not checked with the data</small></span><input type="checkbox" checked={satellite} onChange={e => onSatellite(e.target.checked)} /></label>
    {(['change', 'roads', 'grid'] as const).filter(key => key !== 'roads' || hasRoads).map(key =>
      <label className="explorer-layer-row" key={key}><span>{{ change: 'Verified image', roads: 'OSM roads', grid: 'Cell outlines' }[key]}<small>{{ change: 'Checked before, after and change images', roads: 'Roads across this area', grid: 'Original cell shapes' }[key]}</small></span>
        <input type="checkbox" checked={layers[key]} disabled={compare && key === 'change'} onChange={e => onChange(key, e.target.checked)} /></label>)}
    <label className="explorer-field">Overlay<select aria-label="Verified overlay" value={overlay} disabled={compare} onChange={e => onOverlayChange(e.target.value as OverlayKey)}>
      <option value="delta">Change</option><option value="t1">Before</option><option value="t2">After</option>
    </select></label>
    {compare && <p className="explorer-muted">Showing before and after. Stop comparing to choose one image.</p>}
    <label className="explorer-field">Image opacity <output>{opacity}%</output><input aria-label="Image opacity" type="range" min="0" max="100" value={opacity} onChange={e => onOpacity(Number(e.target.value))} /></label>
  </section>;
}
export function TopTen({ bundle, selectedId, onSelect }: {
  bundle: ExplorerData; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const cells = bundle.cells.filter(c => c.rank !== null && c.status !== 'insufficient_quality')
    .sort((a, b) => a.rank! - b.rank!).slice(0, 10);
  return <section className="explorer-priorities" aria-label="Top 10"><h2>Top 10 <span>signed order</span></h2><ol>
    {cells.map(cell => <li key={cell.cellId}><button aria-pressed={selectedId === cell.cellId}
      aria-label={`Select rank ${cell.rank}: ${cell.cellId}`} onClick={() => onSelect(cell.cellId)}>
      <span className="explorer-list-rank">#{cell.rank}</span><span><strong>{cell.cellId}</strong>{cell.scoreBp !== null && <small>{percentFromBp(cell.scoreBp)} · signed score</small>}</span><ArrowUpRight size={15} /></button></li>)}
  </ol></section>;
}
