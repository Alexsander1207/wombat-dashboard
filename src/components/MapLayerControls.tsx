import { ChevronDown, ChevronUp, Layers3 } from 'lucide-react'

export interface VisibleLayers {
  change: boolean
  water: boolean
  grid: boolean
}

const options = [
  {
    id: 'change',
    label: 'Cambios en superficie',
    description:
      'Muestra la capa de cambio del radar (diferencia entre las dos pasadas del satélite NISAR).',
  },
  {
    id: 'water',
    label: 'Caminos',
    description: 'Muestra los caminos de OpenStreetMap incluidos en los datos.',
  },
  {
    id: 'grid',
    label: 'Zonas de revisión',
    description:
      'Muestra las zonas coloreadas según su lugar en el orden de revisión sugerido. Toca una zona para ver por qué.',
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
          <Layers3 size={15} /> Capas del mapa
        </span>
        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {expanded && (
        <div className="layer-body" id="map-layer-options">
          <p className="layer-intro">
            Elige qué se muestra sobre el mapa.
          </p>
          {compare && (
            <p className="comparison-help" role="status">
              Comparando las observaciones de antes y después. Sal de la
              comparación para ajustar los cambios en superficie.
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
              <label htmlFor="change-opacity">Opacidad del cambio</label>
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
                ? 'Disponible fuera del modo de comparación.'
                : !layers.change
                  ? 'Activa Cambios en superficie para ajustar su opacidad.'
                  : 'Bájala para ver mejor las zonas.'}
            </p>
          </div>
          <p className="fixture-note">
            Capas de los datos verificados · imagen fija, no en vivo
          </p>
        </div>
      )}
    </section>
  )
}
