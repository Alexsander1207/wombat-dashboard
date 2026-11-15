import React from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { loadAndVerify, releaseBundle, type LoadedBundle } from '../src/bundle/contract.ts';
import { toExplorer } from '../src/adapters/toExplorer.ts';
import { EvidenceCard } from '../src/components/Evidence.tsx';
import { TopTen } from '../src/components/MapLayerControls.tsx';

const { maps, FakeMap } = vi.hoisted(() => {
const maps: FakeMap[] = [];
class FakeMap {
  sources = new Map<string, unknown>();
  layers = new Map<string, unknown>();
  handlers = new Map<string, (...args: unknown[]) => void>();
  fitBounds = vi.fn();
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
  LngLatBounds: class { extend() { return this; } },
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
      expect(cell.explanation).toEqual(source.explanation);
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
    render(<EvidenceCard cell={cell} bundle={toExplorer(piura)} onClose={() => {}} />);
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
    const view = render(<EvidenceCard cell={cell} bundle={data} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: `Cell ${cell.cellId}` })).toBeInTheDocument();
    expect(screen.getByText('76.36 % (7636 bp)')).toBeInTheDocument();
    for (const text of cell.explanation) expect(screen.getByText(text)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Score parts and weights'));
    expect(screen.getByRole('cell', { name: '0.45' })).toBeInTheDocument();
    view.rerender(<EvidenceCard cell={second} bundle={data} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: `Cell ${second.cellId}` })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: `Cell ${cell.cellId}` })).not.toBeInTheDocument();
  });
  it('wires verified MapLibre assets, map clicks, Top 10 selection, focus and raster controls', async () => {
    const data = toExplorer(thailand);
    function Harness() {
      const [selected, setSelected] = React.useState<string | null>(null);
      const [overlay, setOverlay] = React.useState<'delta' | 't1' | 't2'>('delta');
      return <><button onClick={() => setOverlay('t1')}>T1 test</button><MapExplorer bundle={data} overlay={overlay} onOverlayChange={setOverlay} selectedCellId={selected} onSelectCell={setSelected} /></>;
    }
    render(<Harness />);
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    const map = maps.at(-2)!;
    expect(map.sources.get('delta')).toEqual({ type: 'image', url: thailand.overlays.delta, coordinates: thailand.overlays.bounds });
    const geo = map.sources.get('cells') as { data: { features: { geometry: unknown }[] } };
    expect(geo.data.features[0].geometry).toEqual(thailand.cells[0].geometry);
    expect(map.sources.get('roads')).toEqual({ type: 'geojson', data: thailand.roadsGeoJson });
    fireEvent.click(within(screen.getByRole('region', { name: 'Top 10' })).getAllByRole('button')[0]);
    const first = data.cells.find(c => c.rank === 1)!;
    expect(screen.getByRole('heading', { name: `Cell ${first.cellId}` })).toBeInTheDocument();
    expect(map.fitBounds).toHaveBeenCalled();
    const second = data.cells.find(c => c.rank === 2)!;
    act(() => map.handlers.get('click:cells-fill')?.({ features: [{ properties: { cell_id: second.cellId } }] }));
    expect(screen.getByRole('heading', { name: `Cell ${second.cellId}` })).toBeInTheDocument();
    fireEvent.click(screen.getByText('T1 test'));
    expect(map.setPaintProperty).toHaveBeenCalledWith('t1', 'raster-opacity', 0.8);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    fireEvent.change(screen.getByRole('slider', { name: 'Image opacity' }), { target: { value: '45' } });
    expect(map.setPaintProperty).toHaveBeenCalledWith('t1', 'raster-opacity', 0.45);
    fireEvent.click(screen.getByRole('checkbox', { name: /OSM roads/ }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('roads', 'visibility', 'none');
    fireEvent.click(screen.getByRole('checkbox', { name: /Cell outlines/ }));
    expect(map.setLayoutProperty).toHaveBeenCalledWith('grid', 'visibility', 'none');
    expect(map.setPaintProperty).toHaveBeenCalledWith('cells-fill', 'fill-opacity', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(map.zoomIn).toHaveBeenCalled();
    expect(map.zoomOut).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show whole area' }));
    expect(map.fitBounds).toHaveBeenLastCalledWith([[data.boundary[0], data.boundary[1]], [data.boundary[2], data.boundary[3]]], { padding: 56 });
  });
  it('compares the verified t1/t2 rasters, synchronizes cameras and supports the keyboard divider', async () => {
    const data = toExplorer(thailand);
    render(<MapExplorer bundle={data} overlay="delta" onOverlayChange={() => {}} selectedCellId={null} onSelectCell={() => {}} />);
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    const [base, before] = maps.slice(-2);
    fireEvent.click(screen.getByRole('button', { name: 'Compare observations' }));
    expect(base.setPaintProperty).toHaveBeenCalledWith('t2', 'raster-opacity', 0.8);
    expect(before.setPaintProperty).toHaveBeenCalledWith('t1', 'raster-opacity', 0.8);
    expect(before.sources.get('t1')).toEqual({ type: 'image', url: data.overlays.t1, coordinates: data.overlays.bounds });
    const divider = screen.getByRole('slider', { name: 'Before/after divider' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    expect(divider).toHaveAttribute('aria-valuenow', '51');
    fireEvent.keyDown(divider, { key: 'End' });
    expect(divider).toHaveAttribute('aria-valuenow', '90');
    act(() => base.handlers.get('move')?.());
    expect(before.jumpTo).toHaveBeenCalledWith({ center: base.getCenter(), zoom: base.getZoom(), bearing: 0, pitch: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Stop comparing' }));
    expect(screen.queryByRole('slider', { name: 'Before/after divider' })).not.toBeInTheDocument();
    expect(base.setPaintProperty).toHaveBeenLastCalledWith('cells-fill', 'fill-opacity', expect.any(Array));
  });
  it('disables comparison when signed dates are invalid or observations are incompatible', () => {
    const data = toExplorer(thailand);
    const view = render(<MapExplorer bundle={{ ...data, t1: 'invalid' }} overlay="delta" onOverlayChange={() => {}} selectedCellId={null} onSelectCell={() => {}} />);
    expect(screen.getByRole('button', { name: 'Compare observations' })).toBeDisabled();
    view.rerender(<MapExplorer bundle={{ ...data, compatible: false }} overlay="delta" onOverlayChange={() => {}} selectedCellId={null} onSelectCell={() => {}} />);
    expect(screen.getByRole('button', { name: 'Compare observations' })).toBeDisabled();
  });
  it('fails only the external basemap on tile errors and keeps original verified sources', async () => {
    const data = toExplorer(thailand);
    const onGuide = vi.fn();
    render(<MapExplorer bundle={data} overlay="delta" onOverlayChange={() => {}} selectedCellId={null} onSelectCell={() => {}} onGuide={onGuide} />);
    await waitFor(() => expect(maps.at(-1)?.getLayer('selected')).toBeTruthy());
    const [base, before] = maps.slice(-2);
    act(() => base.handlers.get('error')?.({ sourceId: 'satellite', error: new Error('tile offline') }));
    expect(screen.getByText(/Satellite background unavailable/)).toBeVisible();
    expect(base.setLayoutProperty).toHaveBeenCalledWith('satellite', 'visibility', 'none');
    expect(before.setLayoutProperty).toHaveBeenCalledWith('satellite', 'visibility', 'none');
    const geo = base.sources.get('cells') as { data: { features: { geometry: unknown }[] } };
    expect(geo.data.features).toHaveLength(600);
    expect(geo.data.features[0].geometry).toBe(data.cells[0].geometry);
    expect(base.layers.get('roads')).toMatchObject({ paint: { 'line-opacity': 0.4 } });
    expect([...base.layers.keys()].indexOf('roads')).toBeLessThan([...base.layers.keys()].indexOf('top-ten'));
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guide' }));
    expect(onGuide).toHaveBeenCalledOnce();
  });
  it('labels signed road lengths as cell metrics and keeps exact metres visible', () => {
    const data = toExplorer(piura);
    const cell = data.cells.find(c => c.status === 'insufficient_quality')!;
    render(<EvidenceCard cell={cell} bundle={data} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Cell details'));
    expect(screen.getByText('Total roads in this cell')).toBeVisible();
    expect(screen.getByText('800 m (0.8 km)')).toBeVisible();
    expect(screen.getByText(/These road lengths belong to this cell/)).toBeVisible();
  });
});
