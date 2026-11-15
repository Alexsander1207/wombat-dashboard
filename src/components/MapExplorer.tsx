/**
 * Mapa del Explorer.
 *
 * Diseño y maquetación: Mireyamd y Ximenacode (Mireyamd/Dashboard_Wambort,
 * src/components/MapExplorer.tsx). Aquí se conectó al bundle verificado:
 *
 * - Los rásteres t1, t2 y delta son los PNG del bundle, ya verificados.
 * - Las celdas, su estado y su puesto salen de los bloques `risk` firmados.
 * - El mapa base usa teselas de OpenStreetMap para dar contexto geográfico
 *   fuera del área cubierta por las imágenes satelitales.
 * - Los rásteres y las capas de análisis siguen saliendo del bundle verificado.
 *   Si no hay conexión, el análisis local sigue disponible sobre el fondo base.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  ArrowLeftRight,
  Crosshair,
  Minus,
  Plus,
  Triangle,
  SlidersHorizontal,
} from 'lucide-react'
import {
  TOP_COUNT,
  type ExplorerCell,
  type ExplorerData,
} from '../adapters/toExplorer.ts'
import { readableDate } from '../format.ts'
import { DataStatus } from './DataStatus'
import { MapLayerControls, type VisibleLayers } from './MapLayerControls'
import { getMapDisplay } from '../frontend/mapDisplay'
import { STATUS_FILL, STATUS_LEGEND } from '../frontend/statusColors.ts'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre v6 requires Vite to bundle its worker before any map is created.
maplibregl.setWorkerUrl(workerUrl)

/**
 * Paleta fija del diseño original oscuro de Mireya/Ximena. Las capas científicas
 * conservan sus colores de datos y no cambian según el tema del sistema.
 */
function mapPalette() {
  const ui = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) =>
    ui.getPropertyValue(name).trim() || fallback
  return {
    background: read('--map-background', '#14213c'),
    roads: read('--map-roads', '#9fd8e0'),
    gridLine: read('--map-grid-line', '#c8dfbd'),
    boundary: read('--map-boundary', '#e4cf60'),
    priority: read('--map-priority-line', '#fff0c2'),
    selectionHalo: read('--selected-halo', '#FFF8EA'),
    selection: read('--selected-outline', '#E97873'),
  }
}

/** Margen del encuadre: los paneles ya no flotan sobre el mapa. */
const MAP_PADDING = 36
let mapInstanceSequence = 0

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

interface Props {
  hidden: boolean
  bundle: ExplorerData
  selected: ExplorerCell | null
  onSelect: (c: ExplorerCell) => void
  compare: boolean
  onCompare: () => void
  controls: boolean
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
  const top = bundle.ranked.slice(0, TOP_COUNT)
  const cellsById = useMemo(
    () => new Map(bundle.cells.map((cell) => [cell.id, cell] as const)),
    [bundle.cells],
  )
  const [west, south, east, north] = bundle.bounds
  useEffect(() => {
    if (!controls) return
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return
      // El menú flotante abre y cierra este panel por su cuenta: si además
      // contara como clic afuera, lo cerraría y lo volvería a abrir.
      if (event.target.closest('.floating-navigation')) return
      if (!popover.current?.contains(event.target)) onControls()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onControls()
        document.querySelector<HTMLButtonElement>('.hamburger-trigger')?.focus()
      }
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape)
    }
  }, [controls, onControls])
  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])
  useEffect(() => {
    if (!baseContainer.current || (compare && !beforeContainer.current)) return
    let disposed = false,
      syncing = false
    const markers: maplibregl.Marker[] = []
    try {
      const palette = mapPalette()
      const [w, s, e, n] = bundle.bounds
      const topCells = bundle.ranked.slice(0, TOP_COUNT)
      const makeMap = (container: HTMLDivElement, before: boolean) => {
        const mapId = ++mapInstanceSequence
        const startedAt = `wombat:map:${mapId}:start`
        const loadedAt = `wombat:map:${mapId}:loaded`
        performance.mark(startedAt)
        const map = new maplibregl.Map({
          container,
          bounds: [
            [w, s],
            [e, n],
          ],
          fitBoundsOptions: { padding: MAP_PADDING },
          minZoom: 5,
          maxZoom: 17,
          attributionControl: {},
          style: {
            version: 8,
            sources: {},
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: { 'background-color': palette.background },
              },
            ],
          },
        })
        map.on('load', () => {
          if (disposed) return
          performance.mark(loadedAt)
          performance.measure(`wombat:map:${before ? 'comparison' : 'base'}:load`, startedAt, loadedAt)
          // Se agrega después del load inicial: si la red o el proveedor de
          // teselas falla, nunca bloquea el dibujo de las capas locales firmadas.
          map.addSource('basemap', {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 19,
            attribution: '© OpenStreetMap contributors',
          })
          map.addLayer({
            id: 'basemap',
            type: 'raster',
            source: 'basemap',
            paint: { 'raster-opacity': 1, 'raster-fade-duration': 150 },
          })
          // Capa satelital de contexto, como en el Explorer original de Mireya.
          // No forma parte del bundle ni de la evidencia firmada: solo es fondo.
          map.addSource('satellite-context', {
            type: 'raster',
            tiles: [
              'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 19,
            attribution: 'Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community',
          })
          map.addLayer({
            id: 'satellite-context',
            type: 'raster',
            source: 'satellite-context',
            paint: {
              'raster-opacity': 0.88,
              'raster-saturation': -0.25,
              'raster-brightness-max': 0.78,
              'raster-fade-duration': 150,
            },
          })
          map.on('error', (event) => {
            if ('sourceId' in event && event.sourceId === 'satellite-context') {
              if (map.getLayer('satellite-context'))
                map.setLayoutProperty('satellite-context', 'visibility', 'none')
            }
          })
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
              'line-color': palette.roads,
              'line-width': 0.7,
              'line-opacity': 0.45,
            },
          })
          map.addLayer({
            id: 'grid',
            type: 'line',
            source: 'grid',
            paint: {
              'line-color': palette.gridLine,
              'line-width': 0.5,
              'line-opacity': 0.22,
            },
          })
          map.addLayer({
            id: 'boundary',
            type: 'line',
            source: 'boundary',
            paint: {
              'line-color': palette.boundary,
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
            paint: { 'line-color': palette.priority, 'line-width': 2.5 },
          })
          map.addLayer({
            id: 'selected-halo',
            type: 'line',
            source: 'grid',
            filter: ['==', ['get', 'id'], ''],
            paint: {
              'line-color': palette.selectionHalo,
              'line-width': 6,
              'line-opacity': 0.95,
            },
          })
          map.addLayer({
            id: 'selected',
            type: 'line',
            source: 'grid',
            filter: ['==', ['get', 'id'], ''],
            paint: { 'line-color': palette.selection, 'line-width': 2.5 },
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
            const c = id == null ? undefined : cellsById.get(String(id))
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
              // Clases de src/styles/priorities.css (Ximenacode).
              el.className = `cell-marker is-top-ten ${cell.rank === 1 ? 'is-first' : ''}`
              el.textContent = String(cell.rank)
              el.setAttribute(
                'aria-label',
                `Ver ${cell.label}, puesto ${cell.rank} del orden de revisión`,
              )
              // El clic en el marcador no debe llegar además al mapa.
              for (const type of ['mousedown', 'mouseup', 'pointerdown'])
                el.addEventListener(type, (event) => event.stopPropagation())
              el.onclick = (event) => {
                event.stopPropagation()
                selectRef.current(cell)
              }
              markers.push(
                new maplibregl.Marker({
                  element: el,
                  anchor: 'center',
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
      const before = compare && beforeContainer.current
        ? makeMap(beforeContainer.current, true)
        : null
      maps.current = before ? [base, before] : [base]
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
      if (before) {
        base.on('move', () => sync(base, before))
        before.on('move', () => sync(before, base))
      }
      const observer = new ResizeObserver(() => {
        base.resize()
        before?.resize()
      })
      observer.observe(baseContainer.current)
      if (compare && beforeContainer.current) observer.observe(beforeContainer.current)
      return () => {
        disposed = true
        observer.disconnect()
        markers.forEach((m) => m.remove())
        base.remove()
        before?.remove()
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
  }, [bundle, compare])
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
  const pairNote =
    bundle.mode === 'simulated'
      ? 'Imágenes simuladas de prueba'
      : 'Imágenes reales del satélite NISAR'
  return (
    <section
      className={`map-explorer ${selected ? 'has-selection' : ''} ${hidden ? 'is-hidden' : ''}`}
      aria-label={`Mapa de cambios en superficie: ${bundle.aoiName}`}
    >
      <div className="map-stage">
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
              detail="Este navegador no pudo dibujar el mapa. Elige una zona de la lista para ver por qué se sugiere revisarla."
            />
            {top.map((c) => (
              <button key={c.id} onClick={() => onSelect(c)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
        {!ready && !mapError && (
          <div className="map-loading" role="status">
            Cargando el mapa…
          </div>
        )}
        {!bundle.compatible && (
          <div className="incompatible">
            <DataStatus
              kind="incompatible"
              title="Imágenes no comparables"
              detail="Las imágenes de antes y después no se pueden comparar entre sí."
            />
          </div>
        )}
        {controls && (
          <div
            className="left-panels floating-map-popovers"
            ref={popover}
            id="map-popovers"
          >
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
          </div>
        )}
        {compare && (
          <>
            <div className="comparison-label before">
              <strong>Antes</strong>
              <span>{readableDate(bundle.before.date)}</span>
            </div>
            <div className="comparison-label after">
              <strong>Después</strong>
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
                  !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(
                    event.key,
                  )
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
          </>
        )}
        <div className="map-tools">
          <button
            aria-label="Acercar"
            onClick={() => maps.current[0]?.zoomIn()}
          >
            <Plus size={18} />
          </button>
          <button
            aria-label="Alejar"
            onClick={() => maps.current[0]?.zoomOut()}
          >
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
      </div>
      {/* Barra inferior acoplada: fechas del par y leyenda. No tapa el mapa. */}
      <div className="map-dock">
        <section
          className="observation-bar panel"
          aria-label="Antes y después"
        >
          <div className="observation-heading">
            <span className="observation-icon">
              <SlidersHorizontal size={18} />
            </span>
            <div>
              <strong>Antes y después</strong>
              <span>{pairNote}</span>
            </div>
          </div>
          <div className="observation-dates">
            <span>
              <small>ANTES</small>
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
                    aria-label="Posición de la comparación"
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
                  aria-label="Comparar las imágenes de antes y después"
                >
                  <ArrowLeftRight size={16} /> Comparar
                </button>
              )}
            </div>
            <span>
              <small>DESPUÉS</small>
              <time dateTime={bundle.after.date}>
                {readableDate(bundle.after.date)}
              </time>
            </span>
          </div>
        </section>
        <section className="panel map-legend" aria-label="Leyenda del mapa">
          <div className="change-legend">
            {STATUS_LEGEND.map(([status, label]) => (
              <span key={status}>
                <i style={{ background: STATUS_FILL[status] }} /> {label}
              </span>
            ))}
          </div>
          <p>
            El color indica el orden de revisión sugerido. No es un pronóstico.
          </p>
        </section>
      </div>
    </section>
  )
}
