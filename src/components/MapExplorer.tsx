/**
 * Mapa del Explorer.
 *
 * Diseño y maquetación: Mireyamd y Ximenacode (Mireyamd/Dashboard_Wambort,
 * src/components/MapExplorer.tsx). Aquí se conectó al bundle verificado:
 *
 * - Los rásteres t1, t2 y delta son los PNG del bundle, ya verificados.
 * - Las celdas, su estado y su puesto salen de los bloques `risk` firmados.
 * - NO hay teselas remotas: el diseño original pedía imágenes satelitales a un
 *   servidor externo, y el dashboard tiene que funcionar estático y sin red.
 *   El fondo es un color y encima van los bytes del bundle.
 */
import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Minus,
  Plus,
  X,
  Triangle,
  SlidersHorizontal,
} from 'lucide-react'
import type { ExplorerCell, ExplorerData } from '../adapters/toExplorer.ts'
import { readableDate } from '../format.ts'
import { DataStatus } from './DataStatus'
import { MapLayerControls, type VisibleLayers } from './MapLayerControls'
import { getMapDisplay } from '../frontend/mapDisplay'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre v6 requires Vite to bundle its worker before any map is created.
maplibregl.setWorkerUrl(workerUrl)

/** Deja libre la cabecera flotante (arriba) y la barra de observaciones (abajo). */
const MAP_PADDING = { top: 96, bottom: 116, left: 56, right: 56 }

/** Cuántas celdas del orden de revisión se destacan en el mapa y en el panel. */
const TOP_COUNT = 3

/**
 * Rampa secuencial de un solo tono, no un semáforo: el color indica el lugar
 * en el orden de revisión sugerido, no un nivel de peligro. Los datos
 * insuficientes van en gris, fuera de la rampa.
 */
const STATUS_FILL: Record<ExplorerCell['status'], string> = {
  review_high: '#f97532',
  review_medium: '#f7b27a',
  review_low: '#f3e2c4',
  insufficient_quality: '#7c8594',
}
/**
 * La opacidad también sigue el orden de revisión: lo que hay que mirar
 * primero es lo que más se ve; lo que no tiene prioridad casi no tapa el radar.
 */
const FILL_OPACITY: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'status'],
  'review_high',
  0.62,
  'review_medium',
  0.34,
  'review_low',
  0.1,
  0.3,
]
const STATUS_LEGEND: [ExplorerCell['status'], string][] = [
  ['review_high', 'Revisar primero'],
  ['review_medium', 'Revisar después'],
  ['review_low', 'Sin prioridad de revisión'],
  ['insufficient_quality', 'Datos insuficientes'],
]

interface Props {
  hidden: boolean
  bundle: ExplorerData
  selected: ExplorerCell | null
  onSelect: (c: ExplorerCell) => void
  compare: boolean
  onCompare: () => void
  controls: boolean
  priorityOpen: boolean
  onPriority: () => void
  onControls: () => void
}
export function MapExplorer({
  hidden,
  bundle,
  selected,
  onSelect,
  compare,
  onCompare,
  controls,
  onControls,
  priorityOpen,
  onPriority,
}: Props) {
  const baseContainer = useRef<HTMLDivElement>(null),
    beforeContainer = useRef<HTMLDivElement>(null)
  const maps = useRef<maplibregl.Map[]>([])
  const selectRef = useRef(onSelect)
  const [ready, setReady] = useState(0),
    [mapError, setMapError] = useState(false)
  const [layers, setLayers] = useState<VisibleLayers>({
    change: true,
    water: true,
    grid: true,
  })
  const [split, setSplit] = useState(50),
    [opacity, setOpacity] = useState(60)
  const popover = useRef<HTMLDivElement>(null)
  const priorityTrigger = useRef<HTMLButtonElement>(null)
  const [legendOpen, setLegendOpen] = useState(true)
  const top = bundle.ranked.slice(0, TOP_COUNT)
  const [west, south, east, north] = bundle.bounds
  useEffect(() => {
    if (!controls && !priorityOpen) return
    const close = () => {
      if (controls) onControls()
      if (priorityOpen) onPriority()
    }
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return
      if (
        !popover.current?.contains(event.target) &&
        !priorityTrigger.current?.contains(event.target)
      )
        close()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        ;(priorityOpen
          ? priorityTrigger.current
          : document.querySelector<HTMLButtonElement>('.hamburger-trigger')
        )?.focus()
      }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [controls, priorityOpen, onControls, onPriority])
  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])
  useEffect(() => {
    if (!baseContainer.current || !beforeContainer.current) return
    let disposed = false,
      syncing = false
    const markers: maplibregl.Marker[] = []
    try {
      const ui = getComputedStyle(document.documentElement)
      const selectionCoral =
        ui.getPropertyValue('--selected-outline').trim() || '#E97873'
      const selectionCream =
        ui.getPropertyValue('--selected-halo').trim() || '#FFF8EA'
      const mapBackground =
        ui.getPropertyValue('--map-background').trim() || '#14213c'
      const [w, s, e, n] = bundle.bounds
      const topCells = bundle.ranked.slice(0, TOP_COUNT)
      const makeMap = (container: HTMLDivElement, before: boolean) => {
        const map = new maplibregl.Map({
          container,
          bounds: [
            [w, s],
            [e, n],
          ],
          fitBoundsOptions: { padding: MAP_PADDING },
          minZoom: 8,
          maxZoom: 17,
          attributionControl: false,
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': mapBackground },
              },
            ],
          },
        })
        map.on('load', () => {
          if (disposed) return
          const coords = bundle.coordinates
          map.addSource('grid', { type: 'geojson', data: bundle.grid })
          map.addSource('roads', {
            type: 'geojson',
            data: bundle.roads as GeoJSON.FeatureCollection,
          })
          map.addSource('boundary', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [w, s],
                    [e, s],
                    [e, n],
                    [w, n],
                    [w, s],
                  ],
                ],
              },
            },
          })
          for (const id of ['t1', 't2', 'delta'] as const)
            map.addSource(id, {
              type: 'image',
              url: bundle.overlays[id],
              coordinates: coords,
            })
          map.addLayer({
            id: 't1',
            type: 'raster',
            source: 't1',
            paint: {
              'raster-opacity': before ? 0.78 : 0,
              'raster-fade-duration': 0,
            },
          })
          map.addLayer({
            id: 't2',
            type: 'raster',
            source: 't2',
            paint: {
              'raster-opacity': before ? 0 : 0.78,
              'raster-fade-duration': 0,
            },
          })
          map.addLayer({
            id: 'change',
            type: 'raster',
            source: 'delta',
            paint: {
              'raster-opacity': before ? 0 : 0.6,
              'raster-fade-duration': 0,
            },
          })
          map.addLayer({
            id: 'grid-fill',
            type: 'fill',
            source: 'grid',
            paint: {
              'fill-color': [
                'match',
                ['get', 'status'],
                'review_high',
                STATUS_FILL.review_high,
                'review_medium',
                STATUS_FILL.review_medium,
                'review_low',
                STATUS_FILL.review_low,
                STATUS_FILL.insufficient_quality,
              ],
              'fill-opacity': before ? 0 : FILL_OPACITY,
            },
          })
          map.addLayer({
            id: 'water',
            type: 'line',
            source: 'roads',
            paint: {
              'line-color': '#9fd8e0',
              'line-width': 0.7,
              'line-opacity': 0.45,
            },
          })
          map.addLayer({
            id: 'grid',
            type: 'line',
            source: 'grid',
            paint: {
              'line-color': '#c8dfbd',
              'line-width': 0.5,
              'line-opacity': 0.22,
            },
          })
          map.addLayer({
            id: 'boundary',
            type: 'line',
            source: 'boundary',
            paint: {
              'line-color': '#e4cf60',
              'line-width': 2,
              'line-opacity': 0.9,
            },
          })
          map.addLayer({
            id: 'priority',
            type: 'line',
            source: 'grid',
            filter: [
              'in',
              ['get', 'id'],
              ['literal', topCells.map((cell) => cell.id)],
            ],
            paint: { 'line-color': '#fff0c2', 'line-width': 2.5 },
          })
          map.addLayer({
            id: 'selected-halo',
            type: 'line',
            source: 'grid',
            filter: ['==', ['get', 'id'], ''],
            paint: {
              'line-color': selectionCream,
              'line-width': 6,
              'line-opacity': 0.95,
            },
          })
          map.addLayer({
            id: 'selected',
            type: 'line',
            source: 'grid',
            filter: ['==', ['get', 'id'], ''],
            paint: { 'line-color': selectionCoral, 'line-width': 2.5 },
          })
          map.addLayer({
            id: 'hit-area',
            type: 'fill',
            source: 'grid',
            paint: { 'fill-opacity': 0 },
          })
          map.on('click', (event) => {
            const id = map.queryRenderedFeatures(event.point, {
              layers: ['hit-area'],
            })[0]?.properties?.id
            const c = bundle.cells.find((cell) => cell.id === id)
            if (c) selectRef.current(c)
          })
          map.on('mouseenter', 'hit-area', () => {
            map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', 'hit-area', () => {
            map.getCanvas().style.cursor = ''
          })
          if (!before)
            for (const cell of topCells) {
              const el = document.createElement('button')
              el.className = 'cell-marker'
              el.textContent = `#${cell.rank}`
              el.setAttribute(
                'aria-label',
                `Seleccionar la celda ${cell.id}, puesto ${cell.rank}`,
              )
              // El marcador está desplazado respecto de su celda: si el clic
              // llegara al mapa, seleccionaría la celda que queda debajo.
              for (const type of ['mousedown', 'mouseup', 'pointerdown'])
                el.addEventListener(type, (event) => event.stopPropagation())
              el.onclick = (event) => {
                event.stopPropagation()
                selectRef.current(cell)
              }
              markers.push(
                new maplibregl.Marker({
                  element: el,
                  anchor: 'bottom-left',
                  offset: [12, -15],
                })
                  .setLngLat(cell.center)
                  .addTo(map),
              )
            }
          if (!before)
            map.addControl(
              new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
              'bottom-left',
            )
          setReady((count) => count + 1)
        })
        return map
      }
      const base = makeMap(baseContainer.current, false)
      maps.current = [base]
      const before = makeMap(beforeContainer.current, true)
      maps.current.push(before)
      const sync = (source: maplibregl.Map, target: maplibregl.Map) => {
        if (syncing) return
        syncing = true
        target.jumpTo({
          center: source.getCenter(),
          zoom: source.getZoom(),
          bearing: source.getBearing(),
          pitch: source.getPitch(),
        })
        syncing = false
      }
      base.on('move', () => sync(base, before))
      before.on('move', () => sync(before, base))
      const observer = new ResizeObserver(() => {
        base.resize()
        before.resize()
      })
      observer.observe(baseContainer.current)
      return () => {
        disposed = true
        observer.disconnect()
        markers.forEach((m) => m.remove())
        base.remove()
        before.remove()
        maps.current = []
        setReady(0)
      }
    } catch {
      queueMicrotask(() => {
        if (!disposed) setMapError(true)
      })
      maps.current.forEach((m) => m.remove())
      maps.current = []
    }
    return () => {
      disposed = true
    }
  }, [bundle])
  useEffect(() => {
    if (!ready) return
    for (const [i, map] of maps.current.entries()) {
      if (!map.getLayer('selected')) continue
      map.setFilter('selected', ['==', ['get', 'id'], selected?.id ?? ''])
      map.setFilter('selected-halo', ['==', ['get', 'id'], selected?.id ?? ''])
      const display = getMapDisplay({
        compare,
        before: i === 1,
        changes: layers.change,
        water: layers.water,
        grid: layers.grid,
        opacity,
      })
      map.setLayoutProperty('water', 'visibility', display.waterVisibility)
      map.setLayoutProperty('grid', 'visibility', display.gridVisibility)
      map.setLayoutProperty('grid-fill', 'visibility', display.gridVisibility)
      map.setPaintProperty(
        'grid-fill',
        'fill-opacity',
        compare ? 0 : FILL_OPACITY,
      )
      map.setPaintProperty('t1', 'raster-opacity', display.t1Opacity)
      map.setPaintProperty('t2', 'raster-opacity', display.t2Opacity)
      map.setPaintProperty('change', 'raster-opacity', display.changeOpacity)
    }
  }, [ready, layers, selected, opacity, compare])
  const select = (cell: ExplorerCell) => {
    onSelect(cell)
    if (priorityOpen) onPriority()
    maps.current[0]?.easeTo({ center: cell.center, duration: 650 })
  }
  const pairNote =
    bundle.mode === 'simulated' ? 'Par simulado (fixture)' : 'Par NISAR real'
  return (
    <section
      className={`map-explorer ${selected ? 'has-selection' : ''} ${hidden ? 'is-hidden' : ''}`}
      aria-label={`Mapa de cambios en superficie: ${bundle.aoiName}`}
    >
      <div className="map-canvas" ref={baseContainer} />
      <div
        className="comparison-map"
        style={{
          clipPath: `inset(0 ${100 - split}% 0 0)`,
          visibility: compare ? 'visible' : 'hidden',
        }}
      >
        <div className="map-canvas" ref={beforeContainer} />
      </div>
      {mapError && (
        <div className="map-fallback">
          <DataStatus
            kind="connection"
            title="El mapa interactivo no está disponible"
            detail="WebGL no pudo iniciarse. Elige una celda de la lista para ver su evidencia."
          />
          {top.map((c) => (
            <button key={c.id} onClick={() => select(c)}>
              {c.id} · Puesto {c.rank}
            </button>
          ))}
        </div>
      )}
      {!ready && !mapError && (
        <div className="map-loading" role="status">
          Cargando el mapa…
        </div>
      )}
      <div className="map-topline">
        <div className="map-mode">
          <button
            className={compare ? 'active' : ''}
            onClick={onCompare}
            disabled={!bundle.compatible}
          >
            <ArrowLeftRight size={15} />
            {compare ? 'Salir de la comparación' : 'Comparar observaciones'}
          </button>
        </div>
      </div>
      {!bundle.compatible && (
        <div className="incompatible">
          <DataStatus
            kind="incompatible"
            title="Observaciones no comparables"
            detail="Las observaciones de antes y después no se pueden comparar."
          />
        </div>
      )}
      <button
        ref={priorityTrigger}
        className="priority-toggle"
        aria-label={`Mostrar u ocultar el top ${TOP_COUNT} del orden de revisión`}
        aria-expanded={priorityOpen}
        aria-controls="map-popovers"
        onClick={onPriority}
      >
        <Triangle size={14} /> Top {TOP_COUNT}
      </button>
      {(controls || priorityOpen) && (
        <div
          className="left-panels floating-map-popovers"
          ref={popover}
          id="map-popovers"
        >
          {controls && (
            <MapLayerControls
              expanded={controls}
              onExpand={onControls}
              layers={layers}
              onChange={(key, checked) =>
                setLayers((current) => ({ ...current, [key]: checked }))
              }
              compare={compare}
              opacity={opacity}
              onOpacity={setOpacity}
            />
          )}
          {priorityOpen && (
            <section className="panel priority-panel">
              <button
                className="panel-heading"
                onClick={onPriority}
                aria-expanded={priorityOpen}
              >
                <span>
                  <Triangle size={14} /> Orden de revisión sugerido{' '}
                  <span className="count">{top.length}</span>
                </span>
                {priorityOpen ? (
                  <ChevronUp size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
              </button>
              {priorityOpen && (
                <div className="priority-body">
                  <p>Celdas para revisar primero en campo</p>
                  {top.map((c) => (
                    <button
                      className={`priority-row ${selected?.id === c.id ? 'selected' : ''}`}
                      key={c.id}
                      onClick={() => select(c)}
                    >
                      <span className={`rank rank-${c.rank}`}>{c.rank}</span>
                      <span>
                        <strong>{c.id}</strong>
                        <small>
                          Puntaje {c.score === null ? '—' : c.score.toFixed(2)}{' '}
                          · {c.statusLabel}
                        </small>
                      </span>
                      <span className="priority-arrow">↗</span>
                    </button>
                  ))}
                  <span className="list-note">
                    Orden publicado en los bloques firmados del bundle
                  </span>
                </div>
              )}
            </section>
          )}
          <details className="study-info panel">
            <summary>Área de estudio</summary>
            <span className="section-caption">ÁREA DE ESTUDIO</span>
            <strong>{bundle.aoiName}</strong>
            <span>Revisión de cambios en superficie</span>
            <span className="study-coordinates">
              {((south + north) / 2).toFixed(2)}° lat &nbsp;{' '}
              {((west + east) / 2).toFixed(2)}° lon
            </span>
          </details>
        </div>
      )}
      {compare && (
        <>
          <div className="comparison-label before">
            <strong>Antes (t1)</strong>
            <span>{readableDate(bundle.before.date)}</span>
          </div>
          <div className="comparison-label after">
            <strong>Después (t2)</strong>
            <span>{readableDate(bundle.after.date)}</span>
          </div>
          <div
            className="compare-divider"
            style={{ left: `${split}%` }}
            role="slider"
            tabIndex={0}
            aria-label="Arrastra el divisor de antes y después"
            aria-valuemin={10}
            aria-valuemax={90}
            aria-valuenow={Math.round(split)}
            onPointerDown={(event) => {
              event.preventDefault()
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId))
                return
              const rect = baseContainer.current?.getBoundingClientRect()
              if (rect?.width)
                setSplit(
                  Math.max(
                    10,
                    Math.min(
                      90,
                      ((event.clientX - rect.left) / rect.width) * 100,
                    ),
                  ),
                )
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId)
            }}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return
              event.preventDefault()
              setSplit((value) =>
                event.key === 'Home'
                  ? 10
                  : event.key === 'End'
                    ? 90
                    : Math.max(
                        10,
                        Math.min(
                          90,
                          value + (event.key === 'ArrowLeft' ? -1 : 1),
                        ),
                      ),
              )
            }}
          >
            <span>
              <ArrowLeftRight size={20} />
            </span>
          </div>
          <input
            className="compare-slider"
            aria-label="Divisor de la comparación de antes y después"
            type="range"
            min="10"
            max="90"
            value={split}
            onChange={(e) => setSplit(+e.target.value)}
          />
        </>
      )}
      <div className="map-tools">
        <button aria-label="Acercar" onClick={() => maps.current[0]?.zoomIn()}>
          <Plus size={18} />
        </button>
        <button aria-label="Alejar" onClick={() => maps.current[0]?.zoomOut()}>
          <Minus size={18} />
        </button>
        <span />
        <button
          aria-label="Volver a encuadrar el área de estudio"
          onClick={() =>
            maps.current[0]?.fitBounds(
              [
                [west, south],
                [east, north],
              ],
              { padding: MAP_PADDING, bearing: 0, pitch: 0 },
            )
          }
        >
          <Crosshair size={18} />
        </button>
      </div>
      <div className="north">
        <span>N</span>
        <Triangle size={19} fill="currentColor" />
      </div>
      <section
        className="observation-bar panel"
        aria-label="Comparación de observaciones"
      >
        <div className="observation-heading">
          <span className="observation-icon">
            <SlidersHorizontal size={18} />
          </span>
          <div>
            <strong>Comparación de observaciones</strong>
            <span>{pairNote}</span>
          </div>
        </div>
        <div className="observation-dates">
          <span>
            <small>ANTES · t1</small>
            <time dateTime={bundle.before.date}>
              {readableDate(bundle.before.date)}
            </time>
          </span>
          <div className="comparison-summary">
            {compare ? (
              <>
                <label htmlFor="observation-split">
                  División {Math.round(split)}%
                </label>
                <input
                  id="observation-split"
                  aria-label="Posición de comparación"
                  type="range"
                  min="10"
                  max="90"
                  value={split}
                  onChange={(event) => setSplit(+event.target.value)}
                />
              </>
            ) : (
              <button
                onClick={onCompare}
                disabled={!bundle.compatible}
                aria-label="Activar comparación de observaciones"
              >
                <ArrowLeftRight size={16} /> Comparar
              </button>
            )}
          </div>
          <span>
            <small>DESPUÉS · t2</small>
            <time dateTime={bundle.after.date}>
              {readableDate(bundle.after.date)}
            </time>
          </span>
        </div>
        <span className="pair-status">
          <span className="status-dot" /> {pairNote}
        </span>
      </section>
      <section className="panel map-legend">
        <button
          className="legend-heading"
          onClick={() => setLegendOpen(!legendOpen)}
          aria-expanded={legendOpen}
        >
          <span>Leyenda del mapa</span>
          {legendOpen ? <Minus size={12} /> : <Plus size={12} />}
        </button>
        {legendOpen && (
          <>
            {!compare && layers.grid ? (
              <>
                <div className="change-legend">
                  {STATUS_LEGEND.map(([status, label]) => (
                    <span key={status}>
                      <i style={{ background: STATUS_FILL[status] }} /> {label}
                    </span>
                  ))}
                </div>
                <p>Orden de revisión sugerido · No es un pronóstico</p>
              </>
            ) : (
              <p>
                {compare
                  ? 'Observaciones de antes y después'
                  : 'Las celdas de análisis están ocultas'}
              </p>
            )}
            <div className="legend-key">
              <span /> Límite del área{' '}
              {layers.water && (
                <>
                  <i /> Vías
                </>
              )}
            </div>
          </>
        )}
      </section>
      {selected && (
        <button className="selection-chip" onClick={() => onSelect(selected)}>
          <span className="status-dot" /> Seleccionada {selected.id}
          <X size={12} className="hidden-icon" />
        </button>
      )}
    </section>
  )
}
