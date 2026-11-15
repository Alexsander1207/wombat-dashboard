import { ChevronDown, ChevronUp, Layers3, ArrowUpRight } from 'lucide-react'
import type { ExplorerData } from '../adapters/toExplorer.ts'
import { englishPercentFromBp } from './explorerCopy.ts'

export interface VisibleLayers {
  change: boolean
  water: boolean
  grid: boolean
}

const options = [
  {
    id: 'change',
    label: 'Surface changes',
    description:
      'Shows how the radar signal changed between the two NISAR visits.',
  },
  {
    id: 'water',
    label: 'OSM roads',
    description: 'Shows the OpenStreetMap roads included in this bundle.',
  },
  {
    id: 'grid',
    label: 'Cell outlines',
    description:
      'Shows cells colored by review priority. Choose a cell to see its evidence.',
  },
] as const

export function MapLayerControls({
  expanded,
  onExpand,
  layers,
  onChange,
  compare,
  opacity,
  onOpacity,
  overlay,
  onOverlay,
  basemap,
  onBasemap,
}: {
  expanded: boolean
  onExpand: () => void
  layers: VisibleLayers
  onChange: (key: keyof VisibleLayers, checked: boolean) => void
  compare: boolean
  opacity: number
  onOpacity: (value: number) => void
  overlay?: 'delta' | 't1' | 't2'
  onOverlay?: (value: 'delta' | 't1' | 't2') => void
  basemap?: 'satellite' | 'streets' | 'none'
  onBasemap?: (value: 'satellite' | 'streets' | 'none') => void
}) {
  return (
    <section className="panel layer-panel ocean-layer-panel">
      <button
        className="panel-heading"
        onClick={onExpand}
        aria-expanded={expanded}
        aria-controls="map-layer-options"
      >
        <span>
          <Layers3 size={15} /> Map layers
        </span>
        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {expanded && (
        <div className="layer-body" id="map-layer-options">
          <p className="layer-intro">
            Choose what to show on the map.
          </p>
          {basemap && onBasemap && <label className="explorer-field">Map background
            <select value={basemap} onChange={event => onBasemap(event.target.value as 'satellite' | 'streets' | 'none')}>
              <option value="satellite">Satellite · Esri</option>
              <option value="streets">Streets · OpenStreetMap</option>
              <option value="none">Plain background</option>
            </select>
            <small>Background only, not part of the verified evidence.</small>
          </label>}
          {compare && (
            <p className="comparison-help" role="status">
              Showing before and after images. Stop comparing to
              adjust the surface change layer.
            </p>
          )}
          {options.map(({ id, label, description }) => {
            const disabled = compare && id === 'change'
            return (
              <label
                className={`layer-row ${disabled ? 'layer-disabled' : ''}`}
                key={id}
              >
                <span>
                  <span className={`layer-swatch swatch-${id}`} />
                  <span>
                    {label}
                    <small id={`layer-${id}-description`}>{description}</small>
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={!disabled && layers[id]}
                  disabled={disabled}
                  aria-describedby={`layer-${id}-description`}
                  onChange={(e) => onChange(id, e.target.checked)}
                />
                <span className="switch" aria-hidden="true" />
              </label>
            )
          })}
          {overlay && onOverlay && <label className="explorer-field">Overlay
            <select value={overlay} disabled={compare}
              onChange={event => onOverlay(event.target.value as 'delta' | 't1' | 't2')}>
              <option value="delta">Change</option>
              <option value="t1">Before</option>
              <option value="t2">After</option>
            </select>
          </label>}
          <div className="change-opacity">
            <div className="opacity-row">
              <label htmlFor="change-opacity">Change opacity</label>
              <output htmlFor="change-opacity">{opacity}%</output>
            </div>
            <input
              id="change-opacity"
              type="range"
              min="0"
              max="100"
              step="1"
              value={opacity}
              disabled={compare || !layers.change}
              onChange={(e) => onOpacity(Number(e.target.value))}
              aria-describedby="change-opacity-help"
            />
            <p id="change-opacity-help">
              {compare
                ? 'Available when comparison is off.'
                : !layers.change
                  ? 'Turn on Surface changes to adjust opacity.'
                  : 'Lower it to see the cells more clearly.'}
            </p>
          </div>
          <p className="fixture-note">
            Verified layers · a saved snapshot, not live data
          </p>
        </div>
      )}
    </section>
  )
}

export function TopTen({ bundle, selectedId, onSelect }: {
  bundle: ExplorerData
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const cells = bundle.cells
    .filter(c => c.rank !== null && c.status !== 'insufficient_quality')
    .sort((a, b) => a.rank! - b.rank!)
    .slice(0, 10)
  return (
    <section className="explorer-priorities" aria-label="Top 10">
      <h2>Top 10 <span>signed order</span></h2>
      <ol>
        {cells.map(cell => (
          <li key={cell.id}>
            <button
              aria-pressed={selectedId === cell.id}
              aria-label={`Select rank ${cell.rank}: ${cell.id}`}
              onClick={() => onSelect(cell.id)}
            >
              <span className="explorer-list-rank">#{cell.rank}</span>
              <span>
                <strong>{cell.id}</strong>
                {cell.score !== null && (
                  <small>{englishPercentFromBp(cell.scoreBp!)} · signed score</small>
                )}
              </span>
              <ArrowUpRight size={15} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
