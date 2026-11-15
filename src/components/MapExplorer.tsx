import { areaName } from './explorerCopy.ts';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { ArrowLeftRight, BookOpen, ChevronDown, Crosshair, Layers3, Map as MapIcon, Menu, Minus, Plus, ShieldCheck, SlidersHorizontal, Triangle, X } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExplorerData } from '../adapters/toExplorer.ts';
import type { OverlayKey } from './statusColors.ts';
import { STATUS_COLORS } from './statusColors.ts';
import { MapLayerControls, TopTen, type VisibleLayers } from './MapLayerControls.tsx';
import { EvidenceCard } from './Evidence.tsx';
import { DataStatus } from './DataStatus.tsx';
import './Explorer.css';

maplibregl.setWorkerUrl(workerUrl);
interface Props {
  bundle: ExplorerData;
  overlay: OverlayKey;
  onOverlayChange: (key: OverlayKey) => void;
  selectedCellId: string | null;
  onSelectCell: (id: string | null) => void;
  onGuide?: () => void;
}
type Panel = 'explore' | 'layers' | 'evidence' | null;
const satelliteSource: maplibregl.RasterSourceSpecification = {
  type: 'raster', tileSize: 256,
  tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  attribution: 'Imagery © Esri, Vantor, Earthstar Geographics, GIS User Community',
  maxzoom: 19,
};
export function MapExplorer({ bundle, overlay, onOverlayChange, selectedCellId, onSelectCell, onGuide }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const beforeContainer = useRef<HTMLDivElement>(null);
  const maps = useRef<maplibregl.Map[]>([]);
  const select = useRef(onSelectCell);
  const [ready, setReady] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [satelliteFailed, setSatelliteFailed] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [layers, setLayers] = useState<VisibleLayers>({ change: true, roads: true, grid: true });
  const [opacity, setOpacity] = useState(80);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('explore');
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [compare, setCompare] = useState(false);
  const [split, setSplit] = useState(50);
  const stage = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const selected = bundle.cells.find(cell => cell.cellId === selectedCellId);
  const t1 = Date.parse(bundle.t1), t2 = Date.parse(bundle.t2);
  const canCompare = bundle.compatible && Number.isFinite(t1) && Number.isFinite(t2) && t1 < t2 && Boolean(bundle.overlays.t1 && bundle.overlays.t2);
  const comparing = compare && canCompare;
  useEffect(() => { select.current = onSelectCell; }, [onSelectCell]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false); setPanel(null); menuButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('.explorer-navigation')) setMenuOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', close); document.removeEventListener('pointerdown', outside); };
  }, []);
  useEffect(() => {
    if (!container.current || !beforeContainer.current) return;
    const markers: maplibregl.Marker[] = [];
    const owned: maplibregl.Map[] = [];
    let disposed = false;
    let observer: ResizeObserver | undefined;
    try {
      const [w, s, e, n] = bundle.boundary;
      const topIds = bundle.cells.filter(c => c.rank !== null && c.status !== 'insufficient_quality').sort((a,b) => a.rank! - b.rank!).slice(0,10).map(c => c.cellId);
      const features = bundle.cells.filter(cell => cell.geometry !== null).map(cell => ({
        type: 'Feature' as const, geometry: cell.geometry!, properties: { cell_id: cell.cellId, rank: cell.rank, status: cell.status },
      }));
      const makeMap = (element: HTMLDivElement, before: boolean) => {
        const m = new maplibregl.Map({
          container: element,
          style: { version: 8, sources: { satellite: satelliteSource }, layers: [
            { id: 'background', type: 'background', paint: { 'background-color': '#16243e' } },
            { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-saturation': -0.25, 'raster-brightness-max': 0.78 } },
          ] },
          bounds: [[w, s], [e, n]], fitBoundsOptions: { padding: 56 }, attributionControl: false,
          interactive: !before,
        });
        owned.push(m);
        if (!before) m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        m.on('error', event => {
          if (disposed) return;
          if (('sourceId' in event && event.sourceId === 'satellite') || /services\.arcgisonline\.com/.test(event.error.message)) setSatelliteFailed(true);
          else setMapError(event.error.message);
        });
        m.on('load', () => {
          if (disposed) return;
          for (const key of ['t1', 't2', 'delta'] as const) {
            m.addSource(key, { type: 'image', url: bundle.overlays[key], coordinates: bundle.overlays.bounds });
            m.addLayer({ id: key, type: 'raster', source: key, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0 } });
          }
          // Draw the road network beneath cell borders and priority outlines.
          if (bundle.roadsGeoJson) {
            m.addSource('roads', { type: 'geojson', data: bundle.roadsGeoJson as maplibregl.GeoJSONSourceSpecification['data'] });
            m.addLayer({ id: 'roads', type: 'line', source: 'roads', paint: { 'line-color': '#76cfdf', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.35, 13, 0.8, 17, 1.3], 'line-opacity': 0.4 } });
          }
          m.addSource('cells', { type: 'geojson', data: { type: 'FeatureCollection', features } });
          m.addLayer({ id: 'cells-fill', type: 'fill', source: 'cells', paint: {
            'fill-color': ['match', ['get', 'status'], 'review_high', STATUS_COLORS.review_high, 'review_medium', STATUS_COLORS.review_medium, 'review_low', STATUS_COLORS.review_low, 'insufficient_quality', STATUS_COLORS.insufficient_quality, '#64748b'],
            'fill-opacity': ['case', ['==', ['get', 'status'], 'insufficient_quality'], 0.14, 0.035],
          } });
          m.addLayer({ id: 'grid', type: 'line', source: 'cells', paint: { 'line-color': '#e6edf1', 'line-width': 0.6, 'line-opacity': 0.32 } });
          m.addLayer({ id: 'top-ten', type: 'line', source: 'cells', filter: ['in', ['get', 'cell_id'], ['literal', topIds]], paint: { 'line-color': '#fff8ea', 'line-width': 2.3, 'line-opacity': 0.95 } });
          m.addLayer({ id: 'selected-halo', type: 'line', source: 'cells', filter: ['==', ['get', 'cell_id'], ''], paint: { 'line-color': '#fff8ea', 'line-width': 6 } });
          m.addLayer({ id: 'selected', type: 'line', source: 'cells', filter: ['==', ['get', 'cell_id'], ''], paint: { 'line-color': '#e97873', 'line-width': 3 } });
          m.addSource('boundary', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]] } } });
          m.addLayer({ id: 'boundary', type: 'line', source: 'boundary', paint: { 'line-color': '#d9c56a', 'line-width': 1.5, 'line-opacity': 0.8 } });
          if (!before) {
            for (const cell of bundle.cells.filter(c => topIds.includes(c.cellId) && c.center !== null)) {
              const el = document.createElement('button');
              el.className = 'explorer-rank-marker';
              el.textContent = `#${cell.rank}`;
              el.setAttribute('aria-label', `Select rank ${cell.rank}: ${cell.cellId}`);
              el.onclick = () => { select.current(cell.cellId); setEvidenceOpen(true); };
              markers.push(new maplibregl.Marker({ element: el }).setLngLat(cell.center!).addTo(m));
            }
            m.on('click', 'cells-fill', event => {
              const id = event.features?.[0]?.properties?.cell_id;
              if (typeof id === 'string') { select.current(id); setEvidenceOpen(true); }
            });
            m.on('mouseenter', 'cells-fill', () => { m.getCanvas().style.cursor = 'pointer'; });
            m.on('mouseleave', 'cells-fill', () => { m.getCanvas().style.cursor = ''; });
          }
          setReady(value => value + 1);
        });
        return m;
      };
      const base = makeMap(container.current, false);
      const before = makeMap(beforeContainer.current, true);
      maps.current = owned;
      base.on('move', () => before.jumpTo({ center: base.getCenter(), zoom: base.getZoom(), bearing: base.getBearing(), pitch: base.getPitch() }));
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => owned.forEach(m => m.resize()));
        observer.observe(container.current);
      }
    } catch (error) {
      queueMicrotask(() => { if (!disposed) setMapError(error instanceof Error ? error.message : String(error)); });
    }
    return () => {
      disposed = true;
      observer?.disconnect();
      markers.forEach(marker => marker.remove());
      owned.forEach(m => m.remove());
      maps.current = [];
    };
  }, [bundle]);
  useEffect(() => {
    for (const [index, m] of maps.current.entries()) {
      if (!ready || !m.getLayer('selected')) continue;
      const keyToShow = comparing ? index === 1 ? 't1' : 't2' : overlay;
      for (const key of ['t1', 't2', 'delta']) m.setPaintProperty(key, 'raster-opacity', (comparing || layers.change) && key === keyToShow ? opacity / 100 : 0);
      // Keep the transparent fill hit area enabled when the grid is hidden.
      m.setLayoutProperty('grid', 'visibility', layers.grid ? 'visible' : 'none');
      m.setPaintProperty('cells-fill', 'fill-opacity', layers.grid ? ['case', ['==', ['get', 'status'], 'insufficient_quality'], 0.14, 0.035] : 0);
      if (m.getLayer('roads')) m.setLayoutProperty('roads', 'visibility', layers.roads ? 'visible' : 'none');
      m.setLayoutProperty('satellite', 'visibility', satellite && !satelliteFailed ? 'visible' : 'none');
    }
  }, [ready, overlay, layers, opacity, comparing, satellite, satelliteFailed]);
  useEffect(() => {
    const base = maps.current[0];
    if (!base || !ready) return;
    for (const m of maps.current) if (m.getLayer('selected')) {
      m.setFilter('selected', ['==', ['get', 'cell_id'], selectedCellId ?? '']);
      m.setFilter('selected-halo', ['==', ['get', 'cell_id'], selectedCellId ?? '']);
    }
    if (selected?.geometry && base.getLayer('selected')) {
      const bounds = new maplibregl.LngLatBounds();
      selected.geometry.coordinates.flat().forEach(([lon, lat]) => bounds.extend([lon, lat]));
      const width = container.current?.clientWidth ?? 1200;
      base.fitBounds(bounds, { padding: width > 900 ? { top: 150, bottom: 150, left: 330, right: 380 } : 70, maxZoom: 15, duration: 500 });
    }
  }, [ready, selectedCellId, selected]);
  const choose = (id: string | null) => { onSelectCell(id); setEvidenceOpen(true); };
  const openPanel = (next: Panel) => { setPanel(current => current === next ? null : next); setMenuOpen(false); setEvidenceOpen(next === 'evidence'); };
  const reset = () => { const [w,s,e,n] = bundle.boundary; maps.current[0]?.fitBounds([[w,s],[e,n]], { padding: 56 }); };
  return <section className={`explorer-layout ${selected && evidenceOpen ? 'explorer-has-evidence' : ''}`} aria-label={`Explorer ${areaName(bundle)}`} ref={stage}>
    <div className="explorer-canvas" ref={container} role="region" aria-label="Area map" />
    <div className="explorer-before" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - split}% 0 0)`, visibility: comparing ? 'visible' : 'hidden' }}><div className="explorer-canvas" ref={beforeContainer} /></div>
    {mapError && <div className="explorer-map-message"><DataStatus kind="connection" title="The map could not load" detail={mapError} /></div>}
    <div className="explorer-action-bar">
      <div className="explorer-navigation">
        <button ref={menuButton} className="explorer-menu-trigger" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="explorer-menu" onClick={() => setMenuOpen(value => !value)}><Menu size={21} /></button>
        {menuOpen && <nav className="explorer-menu explorer-glass" id="explorer-menu" aria-label="WOMBAT Explorer">
          <span className="explorer-eyebrow">WOMBAT EXPLORER</span>
          <div>{([{ name: 'Explore', id: 'explore', Icon: MapIcon }, { name: 'Layers', id: 'layers', Icon: Layers3 }, { name: 'Evidence', id: 'evidence', Icon: ShieldCheck }] as const).map(({ name, id, Icon }) =>
            <button key={id} aria-pressed={panel === id} onClick={() => openPanel(id)}><Icon size={23} />{name}</button>)}
            <button onClick={() => { setMenuOpen(false); onGuide?.(); }}><BookOpen size={23} />Guide</button>
          </div>
        </nav>}
      </div>
      <button className="explorer-priority-trigger" aria-expanded={panel === 'explore'} aria-controls="explorer-left-panel" onClick={() => openPanel('explore')}><Triangle size={15} /> Top 10</button>
      <button className="explorer-compare-trigger" disabled={!canCompare} aria-pressed={comparing} onClick={() => setCompare(value => !value)}><ArrowLeftRight size={16} />{comparing ? 'Stop comparing' : 'Compare observations'}</button>
    </div>
    {panel && <aside className="explorer-left-panel explorer-glass" id="explorer-left-panel" aria-label="Explorer tools">
      <button className="explorer-panel-close" aria-label="Close tools" onClick={() => setPanel(null)}><X size={16} /></button>
      {panel === 'layers' && <MapLayerControls layers={layers} onChange={(key, value) => setLayers(current => ({ ...current, [key]: value }))} opacity={opacity} onOpacity={setOpacity} hasRoads={Boolean(bundle.roadsGeoJson)} overlay={overlay} onOverlayChange={onOverlayChange} compare={comparing} satellite={satellite} onSatellite={value => { setSatellite(value); if (value) setSatelliteFailed(false); }} />}
      {panel === 'explore' && <><TopTen bundle={bundle} selectedId={selectedCellId} onSelect={choose} /><p className="explorer-muted">A guide for what to check first, not a prediction.</p></>}
      {panel === 'evidence' && <><h2>Evidence</h2><p className="explorer-muted">Pick a cell on the map or find its ID to see its evidence.</p></>}
      {panel !== 'layers' && <label className="explorer-field">All cells<select aria-label="Choose a cell" value={selectedCellId ?? ''} onChange={e => choose(e.target.value || null)}>
        <option value="">Choose a cell</option>{bundle.cells.map(cell => <option key={cell.cellId} value={cell.cellId}>{cell.rank === null ? 'Not ranked' : `#${cell.rank}`} · {cell.cellId}</option>)}
      </select></label>}
      <p className="explorer-counts">{bundle.cells.length} cells · {bundle.cells.filter(cell => cell.rank !== null).length} ranked · {bundle.cells.filter(cell => cell.status === 'insufficient_quality').length} without enough usable data</p>
    </aside>}
    {selected && <button className="explorer-selection-chip" aria-expanded={evidenceOpen} onClick={() => setEvidenceOpen(value => !value)}><ShieldCheck size={13} /> {selected.cellId}<ChevronDown size={14} /></button>}
    <div className="explorer-map-tools explorer-glass" aria-label="Map controls"><button aria-label="Zoom in" onClick={() => maps.current[0]?.zoomIn()}><Plus size={19} /></button><button aria-label="Zoom out" onClick={() => maps.current[0]?.zoomOut()}><Minus size={19} /></button><button aria-label="Show whole area" onClick={reset}><Crosshair size={19} /></button></div>
    {comparing && <>
      <div className="explorer-compare-divider" style={{ left: `${split}%` }} role="slider" tabIndex={0} aria-label="Before/after divider" aria-valuemin={10} aria-valuemax={90} aria-valuenow={split}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = stage.current?.getBoundingClientRect(); if (rect?.width) setSplit(Math.round(Math.max(10, Math.min(90, (event.clientX - rect.left) / rect.width * 100)))); }}
        onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); setSplit(value => event.key === 'Home' ? 10 : event.key === 'End' ? 90 : Math.max(10, Math.min(90, value + (event.key === 'ArrowLeft' ? -1 : 1)))); } }}><span><ArrowLeftRight size={19} /></span></div>
      <div className="explorer-comparison-labels"><span>Before</span><span>After</span></div>
    </>}
    <section className="explorer-observation-bar explorer-glass" aria-label="Observation comparison">
      <div className="explorer-observation-title"><SlidersHorizontal size={21} /><span><strong>Observation comparison</strong><small className={satelliteFailed && satellite ? 'explorer-basemap-note' : undefined} role={satelliteFailed && satellite ? 'status' : undefined}>{satelliteFailed && satellite ? 'Satellite background unavailable. Your checked data is still here.' : bundle.mode === 'simulated' ? 'SIMULATED · Piura demo' : 'Real NISAR data · verified rasters'}</small></span></div>
      <span><small>Before</small><time dateTime={bundle.t1}>{bundle.t1.slice(0,10)}</time></span>
      {comparing ? <label className="explorer-split-label">Split {split}%<input aria-label="Comparison position" type="range" min="10" max="90" value={split} onChange={e => setSplit(Number(e.target.value))} /></label> : <button disabled={!canCompare} onClick={() => setCompare(true)}><ArrowLeftRight size={15} />Compare</button>}
      <span><small>After</small><time dateTime={bundle.t2}>{bundle.t2.slice(0,10)}</time></span>
      {!canCompare && <span className="explorer-muted">Comparison unavailable</span>}
    </section>
    <div className={`explorer-right-dock ${selected && evidenceOpen ? 'with-evidence' : ''}`}>
    {selected && evidenceOpen && <aside className="explorer-evidence-panel explorer-glass"><EvidenceCard cell={selected} bundle={bundle} onClose={() => { onSelectCell(null); }} /></aside>}
    <details className="explorer-legend explorer-glass"><summary>Map key</summary><div>
      {overlay === 'delta' && !comparing && <p>Change image: where the radar signal changed. It does not confirm flooding.</p>}
      <span><i className="explorer-key-top" />Top 10 · signed rank</span><span><i className="explorer-key-selected" />Selected cell</span>
      <span><i className="explorer-key-quality" />Not enough usable data · not ranked</span><span><i className="explorer-key-boundary" />Area boundary</span>
      {layers.roads && <span><i className="explorer-key-roads" />OSM roads · area network</span>}
    </div></details>
    </div>
    <div className="explorer-attribution" aria-label="Map credits">{satellite && !satelliteFailed && <><a href="https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer" target="_blank" rel="noreferrer">© Esri, Vantor, Earthstar Geographics, GIS User Community</a> · </>}{bundle.manifest.osmAttribution}</div>
  </section>;
}
