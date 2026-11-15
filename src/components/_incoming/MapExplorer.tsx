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
  MapPin,
  Triangle,
  SlidersHorizontal,
} from 'lucide-react'
import type { CellEvidence, ExplorerBundle } from '../frontend/demoAdapter'
import { observationImage } from '../frontend/demoAdapter'
import { DataStatus } from './DataStatus'
import { MapLayerControls, type VisibleLayers } from './MapLayerControls'
import { getMapDisplay } from '../frontend/mapDisplay'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre v6 requires Vite to bundle its worker before any map is created.
maplibregl.setWorkerUrl(workerUrl)

interface Props {
  hidden: boolean
  bundle: ExplorerBundle
  selected: CellEvidence | null
  onSelect: (c: CellEvidence) => void
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
    [mapError, setMapError] = useState(false),
    [connection, setConnection] = useState(false)
  const [layers, setLayers] = useState<VisibleLayers>({
    change: true,
    water: true,
    grid: true,
  })
  const [split, setSplit] = useState(50),
    [opacity, setOpacity] = useState(78)
  const popover = useRef<HTMLDivElement>(null)
  const priorityTrigger = useRef<HTMLButtonElement>(null)
  const [legendOpen, setLegendOpen] = useState(true)
  const [emptyCell, setEmptyCell] = useState(false)
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
      const makeMap = (container: HTMLDivElement, before: boolean) => {
        const map = new maplibregl.Map({
          container,
          ...bundle.initialView,
          minZoom: 8,
          maxZoom: 17,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: {
              satellite: {
                type: 'raster',
                tiles: [
                  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                ],
                tileSize: 256,
                attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
              },
            },
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': mapBackground },
              },
              {
                id: 'satellite',
                type: 'raster',
                source: 'satellite',
                paint: {
                  'raster-saturation': -0.35,
                  'raster-brightness-max': 0.76,
                },
              },
            ],
          },
        })
        map.on('error', () => {
          if (!disposed) setConnection(true)
        })
        map.on('load', () => {
          if (disposed) return
          const coords = bundle.coordinates
          for (const [id, data] of Object.entries({
            grid: bundle.grid,
            priority: bundle.priorityGeo,
            boundary: bundle.boundary,
            water: bundle.water,
          }))
            map.addSource(id, { type: 'geojson', data })
          map.addSource('t1', {
            type: 'image',
            url: observationImage(false),
            coordinates: coords,
          })
          map.addSource('t2', {
            type: 'image',
            url: observationImage(true),
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
            type: 'fill',
            source: 'priority',
            paint: {
              'fill-color': [
                'case',
                ['>', ['get', 'magnitude'], 0],
                '#f97532',
                '#29b6d6',
              ],
              'fill-opacity': before ? 0 : 0.6,
            },
          })
          map.addLayer({
            id: 'water',
            type: 'line',
            source: 'water',
            paint: {
              'line-color': '#50c5d4',
              'line-width': 6,
              'line-opacity': 0.7,
            },
          })
          map.addLayer({
            id: 'grid',
            type: 'line',
            source: 'grid',
            paint: {
              'line-color': '#c8dfbd',
              'line-width': 0.65,
              'line-opacity': 0.42,
            },
          })
          map.addLayer({
            id: 'grid-hit',
            type: 'fill',
            source: 'grid',
            paint: { 'fill-opacity': 0 },
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
            source: 'priority',
            paint: { 'line-color': '#fff0c2', 'line-width': 2 },
          })
          map.addLayer({
            id: 'selected-halo',
            type: 'line',
            source: 'priority',
            filter: ['==', 'id', ''],
            paint: {
              'line-color': selectionCream,
              'line-width': 6,
              'line-opacity': 0.95,
            },
          })
          map.addLayer({
            id: 'selected',
            type: 'line',
            source: 'priority',
            filter: ['==', 'id', ''],
            paint: { 'line-color': selectionCoral, 'line-width': 2.5 },
          })
          map.addLayer({
            id: 'hit-area',
            type: 'fill',
            source: 'priority',
            paint: { 'fill-opacity': 0 },
          })
          map.on('click', (e) => {
            const features = map.queryRenderedFeatures(e.point, {
              layers: ['hit-area', 'grid-hit'],
            })
            const id = features.find((f) => f.layer.id === 'hit-area')
              ?.properties?.id
            const c = bundle.cells.find((c) => c.id === id)
            if (c) {
              setEmptyCell(false)
              selectRef.current(c)
            } else if (features.length) setEmptyCell(true)
          })
          map.on('mouseenter', 'hit-area', () => {
            map.getCanvas().style.cursor = 'pointer'
          })
          map.on('mouseleave', 'hit-area', () => {
            map.getCanvas().style.cursor = ''
          })
          if (!before)
            for (const cell of bundle.cells) {
              const el = document.createElement('button')
              el.className = 'cell-marker'
              el.textContent = cell.id
              el.setAttribute('aria-label', `Select cell ${cell.id}`)
              el.onclick = () => selectRef.current(cell)
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
      map.setFilter('selected', ['==', 'id', selected?.id ?? ''])
      map.setFilter('selected-halo', ['==', 'id', selected?.id ?? ''])
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
      map.setLayoutProperty('grid-hit', 'visibility', display.gridVisibility)
      map.setPaintProperty('t1', 'raster-opacity', display.t1Opacity)
      map.setPaintProperty('t2', 'raster-opacity', display.t2Opacity)
      map.setPaintProperty('change', 'fill-opacity', display.changeOpacity)
    }
  }, [ready, layers, selected, opacity, compare])
  const select = (cell: CellEvidence) => {
    setEmptyCell(false)
    onSelect(cell)
    if (priorityOpen) onPriority()
    maps.current[0]?.easeTo({ center: cell.center, duration: 650 })
  }
  return (
    <section
      className={`map-explorer ${selected ? 'has-selection' : ''} ${hidden ? 'is-hidden' : ''}`}
      aria-label="Piura surface change map"
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
            title="Interactive map unavailable"
            detail="WebGL could not initialize. Select a fixture cell below to explore its evidence."
          />
          {bundle.cells.map((c) => (
            <button key={c.id} onClick={() => select(c)}>
              {c.id} · Rank {c.rank}
            </button>
          ))}
        </div>
      )}
      {!ready && !mapError && (
        <div className="map-loading" role="status">
          Loading interactive map…
        </div>
      )}
      {emptyCell && (
        <div className="empty-cell panel">
          <DataStatus
            kind="empty"
            title="No evidence available for this cell"
            detail="This demo contains evidence for PIU-001, PIU-002 and PIU-003 only."
          />
          <button
            onClick={() => setEmptyCell(false)}
            aria-label="Dismiss missing evidence message"
          >
            <X size={14} />
          </button>
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
            {compare ? 'Exit comparison' : 'Compare observations'}
          </button>
        </div>
      </div>
      {!bundle.compatible && (
        <div className="incompatible">
          <DataStatus
            kind="incompatible"
            title="Incompatible observations"
            detail="Before and after observations cannot be compared."
          />
        </div>
      )}
      <button
        ref={priorityTrigger}
        className="priority-toggle"
        aria-label="Toggle Top 3 priorities"
        aria-expanded={priorityOpen}
        aria-controls="map-popovers"
        onClick={onPriority}
      >
        <Triangle size={14} /> Top 3
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
                  <Triangle size={14} /> Top 3 priorities{' '}
                  <span className="count">3</span>
                </span>
                {priorityOpen ? (
                  <ChevronUp size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
              </button>
              {priorityOpen && (
                <div className="priority-body">
                  <p>Cells to investigate first</p>
                  {bundle.cells.map((c) => (
                    <button
                      className={`priority-row ${selected?.id === c.id ? 'selected' : ''}`}
                      key={c.id}
                      onClick={() => select(c)}
                    >
                      <span className={`rank rank-${c.rank}`}>{c.rank}</span>
                      <span>
                        <strong>{c.id}</strong>
                        <small>
                          Score {c.score.toFixed(2)} ·{' '}
                          {c.quality === 'Sufficient'
                            ? 'Sufficient quality'
                            : 'Low quality'}
                        </small>
                      </span>
                      <span className="priority-arrow">↗</span>
                    </button>
                  ))}
                  <span className="list-note">
                    Demo ranking · supplied by fixture
                  </span>
                </div>
              )}
            </section>
          )}
          <details className="study-info panel">
            <summary>Study area</summary>
            <span className="section-caption">STUDY AREA</span>
            <strong>Piura River Basin</strong>
            <span>Surface change investigation</span>
            <span className="study-coordinates">5.14° S &nbsp; 80.61° W</span>
          </details>
        </div>
      )}
      {compare && (
        <>
          <div className="comparison-label before">
            <strong>Before (t1)</strong>
            <span>{bundle.before.date} · Fixture</span>
          </div>
          <div className="comparison-label after">
            <strong>After (t2)</strong>
            <span>{bundle.after.date} · Fixture</span>
          </div>
          <div
            className="compare-divider"
            style={{ left: `${split}%` }}
            role="slider"
            tabIndex={0}
            aria-label="Drag before and after divider"
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
            aria-label="Before and after comparison divider"
            type="range"
            min="10"
            max="90"
            value={split}
            onChange={(e) => setSplit(+e.target.value)}
          />
        </>
      )}
      <div className="map-tools">
        <button aria-label="Zoom in" onClick={() => maps.current[0]?.zoomIn()}>
          <Plus size={18} />
        </button>
        <button
          aria-label="Zoom out"
          onClick={() => maps.current[0]?.zoomOut()}
        >
          <Minus size={18} />
        </button>
        <span />
        <button
          aria-label="Reset map to Piura"
          onClick={() =>
            maps.current[0]?.easeTo({
              ...bundle.initialView,
              bearing: 0,
              pitch: 0,
            })
          }
        >
          <Crosshair size={18} />
        </button>
      </div>
      <div className="north">
        <span>N</span>
        <Triangle size={19} fill="currentColor" />
      </div>
      <div
        className="map-status-stack"
        aria-label="Location and basemap status"
      >
        <div className="location-label">
          <MapPin size={15} />
          <span>Piura</span>
          <small>PERU</small>
        </div>
        {connection && !mapError && (
          <div className="connection-note">
            <DataStatus
              kind="connection"
              title="Basemap connection unavailable"
              detail="Local fixture overlays remain available. Satellite imagery could not load."
            />
          </div>
        )}
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
            <span>Par NISAR ilustrativo</span>
          </div>
        </div>
        <div className="observation-dates">
          <span>
            <small>ANTES · t1</small>
            <time dateTime={bundle.before.date}>{bundle.before.date}</time>
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
            <time dateTime={bundle.after.date}>{bundle.after.date}</time>
          </span>
        </div>
        <span className="pair-status">
          <span className="status-dot" /> Par de demostración
        </span>
      </section>
      <section className="panel map-legend">
        <button
          className="legend-heading"
          onClick={() => setLegendOpen(!legendOpen)}
          aria-expanded={legendOpen}
        >
          <span>Map legend</span>
          {legendOpen ? <Minus size={12} /> : <Plus size={12} />}
        </button>
        {legendOpen && (
          <>
            {!compare && layers.change ? (
              <>
                <div className="change-legend">
                  <span>
                    <i className="decrease-key" /> Decreased backscatter
                  </span>
                  <span>
                    <i className="increase-key" /> Increased backscatter
                  </span>
                </div>
                <p>Demo changes · Not a flood classification</p>
              </>
            ) : (
              <p>
                {compare
                  ? 'Before / after observations · Demo'
                  : 'Surface change highlights are hidden'}
              </p>
            )}
            <div className="legend-key">
              <span /> Study boundary{' '}
              {layers.water && (
                <>
                  <i /> Water context
                </>
              )}
            </div>
          </>
        )}
      </section>
      {selected && (
        <button className="selection-chip" onClick={() => onSelect(selected)}>
          <span className="status-dot" /> Selected {selected.id}
          <X size={12} className="hidden-icon" />
        </button>
      )}
    </section>
  )
}
