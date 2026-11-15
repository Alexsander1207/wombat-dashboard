import { ChevronDown, ChevronUp, Layers3 } from 'lucide-react'

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
      'Highlight changes: orange means increased backscatter; blue means decreased backscatter.',
  },
  {
    id: 'water',
    label: 'Water context',
    description: 'Show the illustrative river to help locate nearby cells.',
  },
  {
    id: 'grid',
    label: 'Analysis grid',
    description:
      'Show approximate 1 km cells. Select a labeled priority cell to see its evidence.',
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
}: {
  expanded: boolean
  onExpand: () => void
  layers: VisibleLayers
  onChange: (key: keyof VisibleLayers, checked: boolean) => void
  compare: boolean
  opacity: number
  onOpacity: (value: number) => void
}) {
  return (
    <section className="panel layer-panel">
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
            Choose what appears over the satellite map.
          </p>
          {compare && (
            <p className="comparison-help" role="status">
              Comparing before and after observations. Exit comparison to adjust
              surface changes.
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
                ? 'Available outside comparison mode.'
                : !layers.change
                  ? 'Turn on Surface changes to adjust their opacity.'
                  : 'Lower it to see more satellite detail underneath.'}
            </p>
          </div>
          <p className="fixture-note">
            Demo overlays · Not live satellite measurements
          </p>
        </div>
      )}
    </section>
  )
}
