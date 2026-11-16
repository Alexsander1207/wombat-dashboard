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
  ShieldCheck,
  ChevronDown,
  X,
} from 'lucide-react'
import {
  TOP_COUNT,
  type ExplorerCell,
  type ExplorerData,
} from '../adapters/toExplorer.ts'
import { FloatingNavigation } from './FloatingNavigation.tsx'
import { OceanEvidence } from './OceanEvidence.tsx'
import { CellSelector } from './CellSelector.tsx'
import { DataStatus } from './DataStatus'
import { MapLayerControls, TopTen, type VisibleLayers } from './MapLayerControls'
import { getMapDisplay } from '../frontend/mapDisplay'
import { STATUS_FILL } from '../frontend/statusColors.ts'
import { useColorScheme } from '../hooks/useColorScheme.ts'
import 'maplibre-gl/dist/maplibre-gl.css'

// MapLibre v6 requires Vite to bundle its worker before any map is created.
maplibregl.setWorkerUrl(workerUrl)

/**
 * Paleta fija del diseño original oscuro de Mireya/Ximena. Las capas científicas
 * conservan sus colores de datos y no cambian según el tema del sistema.
 */
function mapPalette() {
  const ui = getComputedStyle(document.querySelector('.explorer-app') ?? document.documentElement)
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

/** Default camera padding; selection reserves room for the floating panels. */
const MAP_PADDING = 36
let mapInstanceSequence = 0
const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'

/**
 * Keep cell fills subtle so the verified radar raster remains visible.
 * Signed priorities are distinguished by numbered markers and boundaries.
 */
const FILL_OPACITY: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'status'],
  'review_high',
  0.035,
  'review_medium',
  0.035,
  'review_low',
  0.035,
  0.14,
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
  onGuide?: () => void
  onClearSelection?: () => void
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
  onGuide,
  onClearSelection,
}: Props) {
  const baseContainer = useRef<HTMLDivElement>(null),
    beforeContainer = useRef<HTMLDivElement>(null)
  const maps = useRef<maplibregl.Map[]>([])
  const evidencePanel = useRef<HTMLElement>(null)
  const [panel, setPanel] = useState<'explore' | 'evidence' | null>('explore')
  const [evidenceOpen, setEvidenceOpen] = useState(true)
  const [overlay, setOverlay] = useState<'delta' | 't1' | 't2'>('delta')
  const [basemap, setBasemap] = useState<'satellite' | 'streets' | 'none'>('satellite')
  const [satelliteFailed, setSatelliteFailed] = useState(false)
  const selectRef = useRef(onSelect)
  const [ready, setReady] = useState(0),
    [mapError, setMapError] = useState(false)
  const [layers, setLayers] = useState<VisibleLayers>({
    change: true,
    water: true,
    grid: true,
  })
  const [split, setSplit] = useState(50),
    [opacity, setOpacity] = useState(80)
  const scheme = useColorScheme()
  const popover = useRef<HTMLDivElement>(null)
  const canCompare = bundle.compatible && Boolean(bundle.overlays.t1 && bundle.overlays.t2) &&
    Number.isFinite(Date.parse(bundle.before.date)) && Number.isFinite(Date.parse(bundle.after.date)) &&
    Date.parse(bundle.before.date) < Date.parse(bundle.after.date)
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
    selectRef.current = (cell) => {
      onSelect(cell)
      setEvidenceOpen(true)
      setPanel(current => window.innerWidth <= 760 || current === 'evidence' ? null : current)
    }
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
        map.on('error', (event) => {
          if (!disposed && (('sourceId' in event && event.sourceId === 'satellite') || /services\.arcgisonline\.com/.test(event.error.message))) setSatelliteFailed(true)
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
            attribution: OSM_ATTRIBUTION,
          })
          map.addLayer({
            id: 'basemap',
            type: 'raster',
            source: 'basemap',
            paint: { 'raster-opacity': 1, 'raster-fade-duration': 150 },
            layout: { visibility: 'none' },
          })
          // Context imagery is added after load, so an external outage cannot
          // delay the verified local layers. The street basemap remains a fallback.
          map.addSource('satellite', {
            type: 'raster', tileSize: 256, maxzoom: 19,
            tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            attribution: 'Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community',
          })
          map.addLayer({
            id: 'satellite', type: 'raster', source: 'satellite',
            paint: { 'raster-saturation': -0.25, 'raster-brightness-max': 0.78 },
          })
          const coords = bundle.coordinates
          map.addSource('grid', { type: 'geojson', data: bundle.grid })
          map.addSource('roads', {
            type: 'geojson',
            data: bundle.roads as GeoJSON.FeatureCollection,
            attribution: OSM_ATTRIBUTION,
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
              el.className = 'explorer-rank-marker'
              el.textContent = `#${cell.rank}`
              el.setAttribute(
                'aria-label',
                `Select rank ${cell.rank}: ${cell.id}`,
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
  }, [bundle, compare, cellsById])
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
      map.setPaintProperty('t1', 'raster-opacity', compare ? display.t1Opacity : layers.change && overlay === 't1' ? opacity / 100 : 0)
      map.setPaintProperty('t2', 'raster-opacity', compare ? display.t2Opacity : layers.change && overlay === 't2' ? opacity / 100 : 0)
      map.setPaintProperty('change', 'raster-opacity', overlay === 'delta' ? display.changeOpacity : 0)
    }
  }, [ready, layers, selected, opacity, compare, overlay])
  useEffect(() => {
    if (!ready || !selected?.geometry) return
    const bounds = new maplibregl.LngLatBounds()
    for (const ring of selected.geometry.coordinates)
      for (const [lng, lat] of ring) bounds.extend([lng, lat])
    const container = baseContainer.current
    const width = container?.clientWidth ?? 0
    // With the docked sidebar (ocean-polish.css sets --map-docked) nothing
    // covers the map, so the cell is framed with room to see its surroundings.
    const docked = container !== null
      && getComputedStyle(container).getPropertyValue('--map-docked').trim() === '1'
    const padding = docked
      ? Math.round(Math.min(width, container.clientHeight) * 0.3)
      : width > 1100
      ? { top: 140, bottom: 230, left: 320, right: 380 }
      : width > 0 && width <= 760
        ? { top: Math.min(520, (baseContainer.current?.clientHeight ?? 820) * 0.62), bottom: 180, left: 24, right: 24 }
        : MAP_PADDING
    for (const map of maps.current)
      if (map.getLayer('selected')) map.fitBounds(bounds, { padding, maxZoom: 15 })
  }, [ready, selected])
  // El tema del sistema cambió: los lienzos no leen CSS, se les repinta.
  useEffect(() => {
    if (!ready) return
    const palette = mapPalette()
    for (const map of maps.current) {
      if (!map.getLayer('selected')) continue
      map.setPaintProperty('background', 'background-color', palette.background)
      map.setPaintProperty('water', 'line-color', palette.roads)
      map.setPaintProperty('grid', 'line-color', palette.gridLine)
      map.setPaintProperty('boundary', 'line-color', palette.boundary)
      map.setPaintProperty('priority', 'line-color', palette.priority)
      map.setPaintProperty('selected-halo', 'line-color', palette.selectionHalo)
      map.setPaintProperty('selected', 'line-color', palette.selection)
    }
  }, [ready, scheme])
  useEffect(() => {
    if (!hidden) for (const map of maps.current) map.resize()
  }, [hidden])
  useEffect(() => {
    for (const map of maps.current) {
      if (!ready || !map.getLayer('satellite')) continue
      map.setLayoutProperty('satellite', 'visibility', basemap === 'satellite' && !satelliteFailed ? 'visible' : 'none')
      map.setLayoutProperty('basemap', 'visibility', basemap === 'streets' || (basemap === 'satellite' && satelliteFailed) ? 'visible' : 'none')
    }
  }, [ready, basemap, satelliteFailed])

  const choose = (cell: ExplorerCell) => {
    onSelect(cell)
    setEvidenceOpen(true)
    setPanel(current => window.innerWidth <= 760 || current === 'evidence' ? null : current)
    if (controls) onControls()
  }
  // `panel === 'evidence'` is the empty chooser; detailed Evidence uses the
  // existing right panel. Opening Evidence routes to exactly one of these.
  const showingEvidence = selected !== null && evidenceOpen && !controls && panel !== 'evidence'
  const openEvidence = () => {
    if (controls) onControls()
    setPanel(selected ? null : 'evidence')
    setEvidenceOpen(true)
    const fold = evidencePanel.current?.querySelector<HTMLDetailsElement>('.explorer-evidence-fold')
    if (fold) fold.open = true
  }
  const togglePanel = (next: 'explore' | 'evidence') => {
    if (controls) onControls()
    setPanel(current => current === next ? null : next)
  }
  return (
    <section className={`explorer-layout map-explorer ${showingEvidence ? 'explorer-has-evidence' : ''}`}
      aria-label={`Surface change map: ${bundle.aoiName}`} hidden={hidden}>
      <div className="explorer-canvas" ref={baseContainer} role="region" aria-label="Area map" />
      <div className="explorer-before" aria-hidden="true"
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)`, visibility: compare ? 'visible' : 'hidden' }}>
        <div className="explorer-canvas" ref={beforeContainer} />
      </div>
      {mapError && <div className="explorer-map-message">
        <DataStatus kind="connection" title="The interactive map is unavailable"
          detail="Choose a cell from Top 10 or the cell list to see its checked evidence." />
      </div>}
      {!ready && !mapError && <div className="explorer-map-message" role="status">Loading map…</div>}
      <div className="explorer-action-bar">
        <FloatingNavigation active={controls ? 'layers' : panel === 'evidence' || (showingEvidence && panel === null) ? 'evidence' : 'explore'}
          onNavigate={destination => {
            if (destination === 'guide') onGuide?.()
            else if (destination === 'layers') { setPanel(null); onControls() }
            else if (destination === 'evidence') openEvidence()
            else togglePanel(destination)
          }} />
        <button className="explorer-priority-trigger" aria-expanded={panel === 'explore' && !controls}
          aria-controls="explorer-left-panel" onClick={() => togglePanel('explore')}>
          <Triangle size={15} /> Top 10
        </button>
        <button className="explorer-compare-trigger" disabled={!canCompare} aria-pressed={compare}
          aria-label={compare ? 'Stop comparing' : 'Compare observations'} onClick={onCompare}>
          <ArrowLeftRight size={16} /> {compare ? 'Stop comparing' : 'Compare observations'}
        </button>
      </div>
      {(controls || panel) && <aside className="explorer-left-panel explorer-glass" id="explorer-left-panel"
        aria-label="Explorer tools" ref={popover}>
        <button className="explorer-panel-close" aria-label="Close tools" onClick={() => {
          setPanel(null)
          if (controls) onControls()
        }}><X size={16} /></button>
        {controls ? <MapLayerControls expanded onExpand={onControls} layers={layers}
          onChange={(key, value) => setLayers(current => ({ ...current, [key]: value }))}
          compare={compare} opacity={opacity} onOpacity={setOpacity} overlay={overlay} onOverlay={setOverlay}
          basemap={basemap} onBasemap={value => { setBasemap(value); setSatelliteFailed(false) }} /> : <>
          {panel === 'explore' ? <>
            <TopTen bundle={bundle} selectedId={selected?.id ?? null} onSelect={id => choose(cellsById.get(id)!)} />
            <p className="explorer-muted">A guide for what to check first, not a forecast.</p>
          </> : <><h2>Evidence</h2><p className="explorer-muted">Pick a cell on the map or find its ID to see its evidence.</p></>}
          <CellSelector bundle={bundle} selected={selected} onSelect={choose} />
        </>}
        <p className="explorer-counts">{bundle.cells.length} cells · {bundle.ranked.length} ranked · {bundle.cells.filter(c => c.status === 'insufficient_quality').length} without enough usable data</p>
      </aside>}
      {selected && <button className="explorer-selection-chip" aria-expanded={showingEvidence} onClick={() => {
        if (controls) onControls()
        setPanel(null)
        setEvidenceOpen(value => !showingEvidence || !value)
      }}><ShieldCheck size={13} /> {selected.id}<ChevronDown size={14} /></button>}
      <div className="explorer-map-tools explorer-glass" aria-label="Map controls">
        <button aria-label="Zoom in" onClick={() => maps.current[0]?.zoomIn()}><Plus size={19} /></button>
        <button aria-label="Zoom out" onClick={() => maps.current[0]?.zoomOut()}><Minus size={19} /></button>
        <button aria-label="Show whole area" onClick={() => maps.current[0]?.fitBounds(
          [[west, south], [east, north]], { padding: MAP_PADDING, bearing: 0, pitch: 0 },
        )}><Crosshair size={19} /></button>
      </div>
      {compare && <>
        <div className="explorer-compare-divider" style={{ left: `${split}%` }} role="slider" tabIndex={0}
          aria-label="Before/after divider" aria-valuemin={10} aria-valuemax={90} aria-valuenow={Math.round(split)}
          onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId) }}
          onPointerMove={event => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
            const rect = baseContainer.current?.getBoundingClientRect()
            if (rect?.width) setSplit(Math.round(Math.max(10, Math.min(90, (event.clientX - rect.left) / rect.width * 100))))
          }}
          onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            setSplit(value => event.key === 'Home' ? 10 : event.key === 'End' ? 90 : Math.max(10, Math.min(90, value + (event.key === 'ArrowLeft' ? -1 : 1))))
          }}><span><ArrowLeftRight size={19} /></span></div>
        <div className="explorer-comparison-labels"><span>Before</span><span>After</span></div>
      </>}
      <section className="explorer-observation-bar explorer-glass" aria-label="Observation comparison">
        <div className="explorer-observation-title"><SlidersHorizontal size={21} /><span>
          <strong>Observation comparison</strong>
          <small role={satelliteFailed ? 'status' : undefined}>{satelliteFailed && basemap === 'satellite' ? 'Satellite background unavailable. Checked data is still here.' : bundle.mode === 'simulated' ? 'Demo data · Piura demo' : 'Real NISAR data · verified rasters'}</small>
        </span></div>
        <span><small>Before</small><time dateTime={bundle.before.date}>{bundle.before.date.slice(0, 10)}</time></span>
        {compare ? <label className="explorer-split-label">Split {Math.round(split)}%
          <input aria-label="Comparison position" type="range" min="10" max="90" value={split} onChange={event => setSplit(Number(event.target.value))} />
        </label> : <button disabled={!canCompare} onClick={onCompare}><ArrowLeftRight size={15} />Compare</button>}
        <span><small>After</small><time dateTime={bundle.after.date}>{bundle.after.date.slice(0, 10)}</time></span>
        {!canCompare && <small>Comparison unavailable: matching images and valid dates are needed.</small>}
      </section>
      <div className={`explorer-right-dock ${showingEvidence ? 'with-evidence' : ''}`}>
        {showingEvidence && <aside className="explorer-evidence-panel explorer-glass" ref={evidencePanel}>
          <OceanEvidence cell={selected} bundle={bundle} onSelect={choose}
            onClose={() => { setEvidenceOpen(false); onClearSelection?.() }} />
        </aside>}
        <details className="explorer-legend explorer-glass"><summary>Map key</summary><div>
          <p>Radar signal change does not confirm flooding. Review ranks help plan field checks.</p>
          <span><i className="explorer-key-top" />Top 10 · signed rank</span>
          <span><i className="explorer-key-selected" />Selected cell</span>
          <span><i className="explorer-key-quality" />Not enough usable data · not ranked</span>
          <span><i className="explorer-key-boundary" />Area boundary</span>
          {layers.water && <span><i className="explorer-key-roads" />OSM roads · area network</span>}
        </div></details>
      </div>
    </section>
  )
}
