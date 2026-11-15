import React from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { loadAndVerify, releaseBundle, type LoadedBundle } from '../src/bundle/contract.ts';
import { toExplorer, type ExplorerCell, type ExplorerData } from '../src/adapters/toExplorer.ts';
import { EvidenceCard } from '../src/components/Evidence.tsx';
import { OceanEvidence } from '../src/components/OceanEvidence.tsx';
import { TopTen } from '../src/components/MapLayerControls.tsx';

const { maps, FakeMap } = vi.hoisted(() => {
const maps: FakeMap[] = [];
class FakeMap {
  sources = new Map<string, unknown>();
  layers = new Map<string, unknown>();
  handlers = new Map<string, (...args: unknown[]) => void>();
  fitBounds = vi.fn();
  queryRenderedFeatures = vi.fn(() => [] as { properties: { id: string } }[]);
  setFilter = vi.fn();
  setPaintProperty = vi.fn();
  setLayoutProperty = vi.fn();
  jumpTo = vi.fn();
  zoomIn = vi.fn();
  zoomOut = vi.fn();
  getCenter() { return { lng: 100, lat: 18 }; }
  getZoom() { return 10; }
  getBearing() { return 0; }
  getPitch() { return 0; }
  addControl() {}
  addSource(id: string, value: unknown) { this.sources.set(id, value); }
  addLayer(layer: { id: string }) { this.layers.set(layer.id, layer); }
  getLayer(id: string) { return this.layers.get(id); }
  on(event: string, layerOrHandler: string | ((...args: unknown[]) => void), handler?: (...args: unknown[]) => void) {
    this.handlers.set(`${event}${typeof layerOrHandler === 'string' ? ':' + layerOrHandler : ''}`, handler ?? layerOrHandler as (...args: unknown[]) => void);
    if (event === 'load') queueMicrotask(() => this.handlers.get('load')?.());
  }
  resize() {}
  remove() {}
  getCanvas() { return { style: { cursor: '' } }; }
}
return { maps, FakeMap };
});
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: vi.fn(),
  Map: class extends FakeMap {
    constructor(options: { style: { sources: Record<string, unknown>; layers: { id: string }[] } }) {
      super();
      Object.entries(options.style.sources).forEach(([id, source]) => this.sources.set(id, source));
      options.style.layers.forEach(layer => this.layers.set(layer.id, layer));
      maps.push(this);
    }
  },
  NavigationControl: class {}, ScaleControl: class {},
  LngLatBounds: class {
    points: number[][] = [];
    extend(point: number[]) { this.points.push(point); return this; }
  },
  Marker: class {
    element: HTMLElement;
    constructor({ element }: { element: HTMLElement }) { this.element = element; }
    setLngLat() { return this; }
    addTo() { return this; }
    remove() {}
  },
}));
import { MapExplorer } from '../src/components/MapExplorer.tsx';
let thailand: LoadedBundle;
let piura: LoadedBundle;
beforeAll(async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  URL.createObjectURL = vi.fn(() => 'blob:verified-test');
  URL.revokeObjectURL = vi.fn();
  const config = JSON.parse(await readFile('dashboard.config.json', 'utf8')) as { bundles: { aoi: string; version: string; issuers: string[] }[] };
  const bundles = await Promise.all(config.bundles.map(entry => {
    const dir = join(process.cwd(), 'public/bundles', entry.aoi, entry.version);
    return loadAndVerify(dir, entry.issuers.map(issuer => ({ issuer, roles: ['change','context','risk','action'] })), async path => new Uint8Array(await readFile(join(dir, path))));
  }));
  thailand = bundles.find(b => b.aoiId === 'tailandia-01')!;
  piura = bundles.find(b => b.aoiId === 'piura-demo')!;
});
afterAll(() => { if (thailand) releaseBundle(thailand); if (piura) releaseBundle(piura); });

describe('verified Explorer adapter', () => {
  it('preserves 600 verified Thailand cells with signed status counts 248/151/104/97', () => {
    expect(thailand.cells).toHaveLength(600);
    const data = toExplorer(thailand);
    expect(data.cells).toHaveLength(600);
    expect(['review_high', 'review_medium', 'review_low', 'insufficient_quality'].map(
      status => thailand.cells.filter(cell => cell.status === status).length,
    )).toEqual([248, 151, 104, 97]);
  });
  it('preserves all Thailand cells, signed values, exact geometry, metrics, explanations and assets', () => {
    const data = toExplorer(thailand);
    expect(data.cells).toHaveLength(thailand.cells.length);
    data.cells.forEach((cell, i) => {
      const source = thailand.cells[i];
      expect(cell.cellId).toBe(source.cellId);
      expect(cell.status).toBe(source.status);
      expect(cell.rank).toBe(source.rank);
      expect(cell.scoreBp).toBe(source.scoreBp);
      expect(cell.score).toBe(source.scoreBp === null ? null : source.scoreBp / 10000);
      expect(cell.geometry).toBe(source.geometry);
      expect(cell.metrics).toEqual(source.metrics);
      expect(cell.componentsBp).toEqual(source.componentsBp);
      expect(cell.signedExplanation).toBe(source.explanation);
      expect(cell.explanation).toBe(source.explanation.join(" "));
    });
    expect(data.overlays).toBe(thailand.overlays);
    expect(data.roadsGeoJson).toBe(thailand.roadsGeoJson);
    expect(data.boundary).toEqual(thailand.manifest.bboxWgs84);
    expect([data.before.date, data.after.date]).toEqual([thailand.t1, thailand.t2]);
  });
  it('preserves the 503 ranked and 97 insufficient-quality Thailand cells', () => {
    const data = toExplorer(thailand);
    expect(data.cells.filter(c => c.rank !== null)).toHaveLength(503);
    expect(data.cells.filter(c => c.status === 'insufficient_quality')).toHaveLength(97);
    data.cells.filter(c => c.status === 'insufficient_quality').forEach(cell => {
      expect(cell.rank).toBeNull();
      expect(cell.score).toBeNull();
      expect(cell.scoreBp).toBeNull();
    });
  });
  it('never substitutes action rank for signed risk rank, including null', () => {
    const source = piura.cells.find(c => c.rank === 1)!;
    const bundle = { ...piura, actions: [{ cellId: source.cellId, rank: 999, action: 'monitor', audience: 'test' }] };
    expect(toExplorer(bundle).cells.find(c => c.cellId === source.cellId)?.rank).toBe(1);
    expect(toExplorer({ ...bundle, cells: [{ ...source, rank: null }] }).cells[0].rank).toBeNull();
  });
  it('keeps insufficient quality unranked with null display score and original scoreBp', () => {
    const source = piura.cells.find(c => c.status === 'insufficient_quality')!;
    const cell = toExplorer(piura).cells.find(c => c.cellId === source.cellId)!;
    expect(cell.rank).toBeNull(); expect(cell.score).toBeNull(); expect(cell.scoreBp).toBeNull();
    const inconsistent = toExplorer({ ...piura, cells: [{ ...source, scoreBp: 1234, rank: 9 }] }).cells[0];
    expect(inconsistent.rank).toBeNull(); expect(inconsistent.score).toBeNull(); expect(inconsistent.scoreBp).toBe(1234);
    render(<EvidenceCard cell={cell} before={piura.t1} after={piura.t2} onExpand={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Not ranked: fewer than 60% of pixels are usable')).toBeInTheDocument();
    expect(screen.queryByText('Signed score')).not.toBeInTheDocument();
  });
  it('preserves Piura golden rank 1, 7636 bp and status counts 3/3/9/1', () => {
    const data = toExplorer(piura);
    expect(data.cells.find(c => c.rank === 1)?.scoreBp).toBe(7636);
    expect(['review_high','review_medium','review_low','insufficient_quality'].map(status => data.cells.filter(c => c.status === status).length)).toEqual([3,3,9,1]);
  });
  it('orders Top 10 by signed risk ranks, independent of cell and action order', () => {
    const data = toExplorer({ ...thailand, cells: [...thailand.cells].reverse(), actions: [...thailand.actions].reverse() });
    const onSelect = vi.fn();
    render(<TopTen bundle={data} selectedId={null} onSelect={onSelect} />);
    const buttons = within(screen.getByRole('region', { name: 'Top 10' })).getAllByRole('button');
    const expected = thailand.cells.filter(c => c.rank !== null).sort((a,b) => a.rank! - b.rank!).slice(0,10);
    expect(buttons).toHaveLength(10);
    buttons.forEach((button, i) => {
      expect(button).toHaveAccessibleName(`Select rank ${expected[i].rank}: ${expected[i].cellId}`);
      expect(button).toHaveTextContent(`#${expected[i].rank}`);
      expect(button).toHaveTextContent(expected[i].cellId);
    });
    fireEvent.click(buttons[7]); expect(onSelect).toHaveBeenCalledWith(expected[7].cellId);
  });
  it('Evidence displays the selected signed cell and updates on selection', () => {
    const data = toExplorer(piura);
    const cell = data.cells.find(c => c.rank === 1)!;
    const second = data.cells.find(c => c.rank === 2)!;
    const view = render(<EvidenceCard cell={cell} before={data.before.date} after={data.after.date} onExpand={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: cell.label })).toBeInTheDocument();
    expect(screen.getByText('76.36 % (7636 bp)')).toBeInTheDocument();
    for (const text of cell.signedExplanation) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText('Change component (weight 0.45)')).toBeInTheDocument();
    expect(screen.getByText('OPERA component (weight 0.35)')).toBeInTheDocument();
    expect(screen.getByText('Roads component (weight 0.20)')).toBeInTheDocument();
    for (const value of Object.values(cell.componentsBp))
      expect(screen.getAllByText(new RegExp(`\\(${value} bp\\)`)).length).toBeGreaterThan(0);
    view.rerender(<EvidenceCard cell={second} before={data.before.date} after={data.after.date} onExpand={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: second.label })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: cell.label })).not.toBeInTheDocument();
  });
  it('wires verified assets, map clicks, Top 10 selection, geometry focus and controls', async () => {
    const data = toExplorer(thailand);
    const firstMap = maps.length;
    render(<MapHarness data={data} />);
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    expect(maps).toHaveLength(firstMap + 1);
    const map = maps.at(-1)!;
    expect(map.sources.get('delta')).toEqual({ type: 'image', url: thailand.overlays.delta, coordinates: thailand.overlays.bounds });
    const geo = map.sources.get('grid') as { data: { features: { geometry: unknown }[] } };
    expect(geo.data.features).toHaveLength(600);
    geo.data.features.forEach((feature, i) => expect(feature.geometry).toBe(thailand.cells[i].geometry));
    expect(map.sources.get('roads')).toEqual({ type: 'geojson', data: thailand.roadsGeoJson, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>' });
    const first = data.ranked[0];
    fireEvent.click(screen.getByRole('button', { name: `Select rank 1: ${first.id}` }));
    expect(screen.getByRole('heading', { name: `Cell ${first.id}` })).toBeVisible();
    expect(map.fitBounds).toHaveBeenLastCalledWith({ points: first.geometry!.coordinates.flat() }, { padding: 36, maxZoom: 15 });
    expect(map.setFilter).toHaveBeenCalledWith('selected', ['==', ['get', 'id'], first.id]);
    const second = data.ranked[1];
    map.queryRenderedFeatures.mockReturnValue([{ properties: { id: second.id } }]);
    act(() => map.handlers.get('click')?.({ point: { x: 10, y: 10 } }));
    expect(map.queryRenderedFeatures).toHaveBeenCalledWith({ x: 10, y: 10 }, { layers: ['hit-area'] });
    expect(screen.getByRole('heading', { name: `Cell ${second.id}` })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Open layers test' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Change opacity' }), { target: { value: '45' } });
    expect(map.setPaintProperty).toHaveBeenCalledWith('change', 'raster-opacity', 0.45 * 0.8);
    fireEvent.change(screen.getByRole('combobox', { name: 'Overlay' }), { target: { value: 't1' } });
    expect(map.setPaintProperty).toHaveBeenCalledWith('t1', 'raster-opacity', 0.45);
    expect(map.setPaintProperty).toHaveBeenCalledWith('change', 'raster-opacity', 0);
    fireEvent.change(screen.getByRole('combobox', { name: 'Overlay' }), { target: { value: 't2' } });
    expect(map.setPaintProperty).toHaveBeenCalledWith('t2', 'raster-opacity', 0.45);
    fireEvent.click(screen.getByRole('checkbox', { name: /OSM roads/ }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('water', 'visibility', 'none');
    fireEvent.click(screen.getByRole('checkbox', { name: /Cell outlines/ }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid', 'visibility', 'none');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid-fill', 'visibility', 'none');
    expect(map.getLayer('hit-area')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(map.zoomIn).toHaveBeenCalledOnce();
    expect(map.zoomOut).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Show whole area' }));
    expect(map.fitBounds).toHaveBeenLastCalledWith([[data.boundary[0], data.boundary[1]], [data.boundary[2], data.boundary[3]]], { padding: 36, bearing: 0, pitch: 0 });
  });
  it('creates comparison lazily, uses verified rasters, syncs both cameras and supports keyboard and exit', async () => {
    const data = toExplorer(thailand);
    const firstMap = maps.length;
    render(<MapHarness data={data} />);
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    expect(maps).toHaveLength(firstMap + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Compare observations' }));
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    const [base, before] = maps.slice(-2);
    expect(base.setPaintProperty).toHaveBeenCalledWith('t2', 'raster-opacity', 0.85);
    expect(before.setPaintProperty).toHaveBeenCalledWith('t1', 'raster-opacity', 0.85);
    expect(before.sources.get('t1')).toEqual({ type: 'image', url: data.overlays.t1, coordinates: data.overlays.bounds });
    const divider = screen.getByRole('slider', { name: 'Before/after divider' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(divider).toHaveAttribute('aria-valuenow', '51');
    fireEvent.keyDown(divider, { key: 'End' });
    expect(divider).toHaveAttribute('aria-valuenow', '90');
    act(() => base.handlers.get('move')?.());
    expect(before.jumpTo).toHaveBeenCalledWith({ center: base.getCenter(), zoom: base.getZoom(), bearing: 0, pitch: 0 });
    act(() => before.handlers.get('move')?.());
    expect(base.jumpTo).toHaveBeenCalledWith({ center: before.getCenter(), zoom: before.getZoom(), bearing: 0, pitch: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Stop comparing' }));
    expect(screen.queryByRole('slider', { name: 'Before/after divider' })).not.toBeInTheDocument();
    await waitFor(() => expect(maps.at(-1)?.setPaintProperty).toHaveBeenCalledWith('grid-fill', 'fill-opacity', expect.any(Array)));
  });
  it('disables comparison for invalid dates, incompatible observations or missing rasters', () => {
    const data = toExplorer(thailand);
    const view = render(<MapHarness data={{ ...data, before: { ...data.before, date: 'invalid' } }} />);
    expect(screen.getByRole('button', { name: 'Compare observations' })).toBeDisabled();
    view.rerender(<MapHarness data={{ ...data, compatible: false }} />);
    expect(screen.getByRole('button', { name: 'Compare observations' })).toBeDisabled();
    view.rerender(<MapHarness data={{ ...data, overlays: { ...data.overlays, t1: '' } }} />);
    expect(screen.getByRole('button', { name: 'Compare observations' })).toBeDisabled();
  });
  it('loads local verified sources independently of external OSM tiles, keeping priorities above roads', async () => {
    const data = toExplorer(thailand);
    render(<MapHarness data={data} />);
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    const base = maps.at(-1)!;
    expect(base.sources.get('basemap')).toMatchObject({ tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>' });
    act(() => base.handlers.get('error')?.({ sourceId: 'satellite', error: new Error('tile offline') }));
    expect(base.setLayoutProperty).toHaveBeenCalledWith('satellite', 'visibility', 'none');
    expect(base.setLayoutProperty).toHaveBeenCalledWith('basemap', 'visibility', 'visible');
    expect(screen.getByText(/Satellite background unavailable/)).toBeVisible();
    // No external tile load is delivered by this mock; all local sources still load.
    const geo = base.sources.get('grid') as { data: { features: { geometry: unknown }[] } };
    expect(geo.data.features).toHaveLength(600);
    expect(geo.data.features[0].geometry).toBe(data.cells[0].geometry);
    expect(base.layers.get('water')).toMatchObject({ source: 'roads', paint: { 'line-opacity': 0.45, 'line-width': 0.7 } });
    expect([...base.layers.keys()].indexOf('water')).toBeLessThan([...base.layers.keys()].indexOf('priority'));
    expect(base.layers.get('priority')).toMatchObject({ filter: ['in', ['get', 'id'], ['literal', data.ranked.slice(0, 10).map(c => c.id)]] });
  });
  it('labels signed road lengths as cell metrics and keeps exact metres visible', () => {
    const data = toExplorer(piura);
    const cell = data.cells.find(c => c.status === 'insufficient_quality')!;
    render(<EvidenceCard cell={cell} before={data.before.date} after={data.after.date} onExpand={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Total roads in this cell')).toBeVisible();
    expect(screen.getByText('800 m (0.8 km)')).toBeVisible();
    expect(screen.getByText(/These road lengths belong to this cell/)).toBeVisible();
  });
  it('opens an empty Evidence chooser from navigation and keeps it open on repeated navigation', async () => {
    const data = toExplorer(thailand);
    const { container } = render(<MapHarness data={data} />);
    const openEvidence = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Evidence' }));
    };
    openEvidence();
    expect(screen.getByText('Pick a cell on the map or find its ID to see its evidence.')).toBeVisible();
    expect(within(screen.getByRole('combobox', { name: 'Choose a cell' })).getAllByRole('option')).toHaveLength(601);
    expect(container.querySelectorAll('.explorer-left-panel')).toHaveLength(1);
    expect(container.querySelector('.explorer-evidence-panel')).toBeNull();
    openEvidence();
    expect(screen.getByRole('combobox', { name: 'Choose a cell' })).toBeVisible();
    expect(container.querySelector('.explorer-evidence-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('menuitem', { name: 'Evidence' })).toHaveAttribute('aria-current', 'page');
  });
  it('opens selected signed Evidence from navigation, closes Layers and reopens collapsed or closed details without a second chooser', async () => {
    const data = toExplorer(thailand);
    const cell = data.ranked[0];
    const { container } = render(<MapHarness data={data} />);
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: `Select rank ${cell.rank}: ${cell.cellId}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Open layers test' }));
    expect(screen.getByText('Choose what to show on the map.')).toBeVisible();
    const openEvidence = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Evidence' }));
    };
    openEvidence();
    expect(container.querySelector('.explorer-left-panel')).toBeNull();
    expect(container.querySelectorAll('.explorer-evidence-panel')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: `Cell ${cell.cellId}` })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Evidence cell' })).toHaveValue(cell.cellId);
    expect(within(screen.getByRole('combobox', { name: 'Evidence cell' })).getAllByRole('option')).toHaveLength(601);
    expect(screen.getByText('Signed score').nextElementSibling).toHaveTextContent(`${cell.scoreBp} bp`);
    expect(screen.queryByText('Pick a cell on the map or find its ID to see its evidence.')).not.toBeInTheDocument();
    const fold = container.querySelector<HTMLDetailsElement>('.explorer-evidence-fold')!;
    fireEvent.click(screen.getByText('Evidence', { selector: 'summary' }));
    expect(fold.open).toBe(false);
    openEvidence();
    expect(fold.open).toBe(true);
    expect(screen.getByRole('heading', { name: `Cell ${cell.cellId}` })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close evidence' }));
    expect(container.querySelector('.explorer-evidence-panel')).toBeNull();
    openEvidence();
    expect(screen.getByRole('heading', { name: `Cell ${cell.cellId}` })).toBeVisible();
    expect(container.querySelectorAll('.explorer-evidence-panel')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('menuitem', { name: 'Evidence' })).toHaveAttribute('aria-current', 'page');
  });
  it('offers all 600 signed cells in Evidence and synchronizes dropdown, map and Top 10 selections', async () => {
    const data = toExplorer(thailand);
    render(<MapHarness data={data} />);
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    const map = maps.at(-1)!;
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Evidence' }));
    expect(screen.getByText('Pick a cell on the map or find its ID to see its evidence.')).toBeVisible();
    const picker = screen.getByRole('combobox', { name: 'Choose a cell' });
    const options = within(picker).getAllByRole('option');
    expect(options).toHaveLength(601);
    data.cells.forEach((cell, index) => {
      expect(options[index + 1]).toHaveValue(cell.cellId);
      expect(options[index + 1]).toHaveTextContent(`${cell.rank === null ? 'Not ranked' : `#${cell.rank}`} · ${cell.cellId}`);
    });
    const first = data.ranked[0];
    fireEvent.change(picker, { target: { value: first.cellId } });
    const evidence = screen.getByRole('region', { name: `Evidence for ${first.cellId}` });
    expect(within(evidence).getByRole('heading', { name: `Cell ${first.cellId}` })).toBeVisible();
    expect(within(evidence).getByRole('combobox', { name: 'Evidence cell' })).toHaveValue(first.cellId);
    expect(within(evidence).getByText('Signed score').nextElementSibling).toHaveTextContent(`${first.scoreBp} bp`);
    expect(map.fitBounds).toHaveBeenLastCalledWith({ points: first.geometry!.coordinates.flat() }, { padding: 36, maxZoom: 15 });

    const quality = data.cells.find(cell => cell.status === 'insufficient_quality')!;
    fireEvent.change(screen.getByRole('combobox', { name: 'Evidence cell' }), { target: { value: quality.cellId } });
    const qualityEvidence = screen.getByRole('region', { name: `Evidence for ${quality.cellId}` });
    expect(within(qualityEvidence).getByRole('combobox', { name: 'Evidence cell' })).toHaveValue(quality.cellId);
    expect(within(qualityEvidence).getByText('Not ranked: fewer than 60% of pixels are usable')).toBeVisible();
    expect(within(qualityEvidence).queryByText('Signed score')).not.toBeInTheDocument();
    expect(map.setFilter).toHaveBeenCalledWith('selected', ['==', ['get', 'id'], quality.cellId]);
    expect(map.fitBounds).toHaveBeenLastCalledWith({ points: quality.geometry!.coordinates.flat() }, { padding: 36, maxZoom: 15 });

    const second = data.ranked[1];
    map.queryRenderedFeatures.mockReturnValue([{ properties: { id: second.cellId } }]);
    act(() => map.handlers.get('click')?.({ point: { x: 10, y: 10 } }));
    expect(screen.getByRole('combobox', { name: 'Evidence cell' })).toHaveValue(second.cellId);
    expect(screen.getByRole('heading', { name: `Cell ${second.cellId}` })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Top 10' }));
    const third = data.ranked[2];
    fireEvent.click(within(screen.getByRole('region', { name: 'Top 10' })).getByRole('button', { name: `Select rank ${third.rank}: ${third.cellId}` }));
    expect(screen.getByRole('combobox', { name: 'Evidence cell' })).toHaveValue(third.cellId);
    expect(screen.getByRole('combobox', { name: 'Choose a cell' })).toHaveValue(third.cellId);
    expect(screen.getByRole('heading', { name: `Cell ${third.cellId}` })).toBeVisible();
    expect(map.fitBounds).toHaveBeenLastCalledWith({ points: third.geometry!.coordinates.flat() }, { padding: 36, maxZoom: 15 });
  });
  it('restores compact Ocean Evidence without losing signed explanations, components or provenance', () => {
    const data = toExplorer(thailand);
    const first = data.ranked[0];
    const second = data.ranked[1];
    const props = { bundle: data, onClose: vi.fn(), onSelect: vi.fn() };
    const view = render(<OceanEvidence {...props} cell={first} />);
    expect(screen.getByRole('heading', { name: `Cell ${first.cellId}` })).toBeVisible();
    expect(screen.getByText(`${(first.scoreBp! / 100).toFixed(2)} % (${first.scoreBp} bp)`)).toBeVisible();
    fireEvent.click(screen.getByText('Score parts and weights'));
    expect(screen.getByRole('cell', { name: '0.45' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '0.35' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '0.20' })).toBeVisible();
    for (const value of Object.values(first.componentsBp)) expect(screen.getAllByText(`${value} bp`).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Signed explanation'));
    expect(within(screen.getByText('Signed explanation').parentElement!).getAllByRole('listitem').map(item => item.textContent)).toEqual(first.signedExplanation);
    fireEvent.click(screen.getByText('Signed evidence and checks'));
    for (const link of first.chain) if (link.block) expect(screen.getByTitle(link.block.id)).toBeVisible();
    fireEvent.click(screen.getByText('Evidence', { selector: 'summary' }));
    expect(screen.getByRole('heading', { name: `Cell ${first.cellId}`, hidden: true })).not.toBeVisible();
    view.rerender(<OceanEvidence {...props} cell={second} />);
    expect(screen.getByRole('heading', { name: `Cell ${second.cellId}` })).toBeVisible();
    expect(screen.queryByRole('heading', { name: `Cell ${first.cellId}` })).not.toBeInTheDocument();
  });
  it('keeps insufficient-quality Ocean Evidence unranked without score or fabricated components', () => {
    const data = toExplorer(thailand);
    const cell = data.cells.find(c => c.status === 'insufficient_quality')!;
    render(<OceanEvidence cell={cell} bundle={data} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getByText('Not ranked: fewer than 60% of pixels are usable')).toBeVisible();
    expect(screen.queryByText('Signed score')).not.toBeInTheDocument();
    expect(screen.queryByText('Score parts and weights')).not.toBeInTheDocument();
    expect(screen.getAllByText('Not ranked').length).toBeGreaterThan(0);
  });
});

// Match the integrated controlled API; App owns the sidebar and selected Evidence.
function MapHarness({ data }: { data: ExplorerData }) {
  const [selected, setSelected] = React.useState<ExplorerCell | null>(null);
  const [compare, setCompare] = React.useState(false);
  const [controls, setControls] = React.useState(false);
  return <>
    <button onClick={() => setControls(!controls)}>Open layers test</button>
    <MapExplorer hidden={false} bundle={data} selected={selected} onSelect={setSelected}
      compare={compare} onCompare={() => setCompare(!compare)} controls={controls} onControls={() => setControls(!controls)} />
  </>;
}
