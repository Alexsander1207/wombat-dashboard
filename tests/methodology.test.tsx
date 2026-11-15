import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import React from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Methodology } from '../src/pages/Methodology.tsx';
import { loadAndVerify, releaseBundle, type LoadedBundle } from '../src/bundle/contract.ts';

let thailand: LoadedBundle;

beforeAll(async () => {
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:methodology-test';
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
  const config = JSON.parse(await readFile('dashboard.config.json', 'utf8')) as {
    bundles: { aoi: string; version: string; issuers: string[] }[];
  };
  const entry = config.bundles.find(item => item.aoi === 'tailandia-01')!;
  const dir = join(process.cwd(), 'public/bundles', entry.aoi, entry.version);
  thailand = await loadAndVerify(
    dir,
    entry.issuers.map(issuer => ({ issuer, roles: ['change', 'context', 'risk', 'action'] })),
    async path => new Uint8Array(await readFile(join(dir, path))),
  );
});

afterAll(() => {
  if (thailand) releaseBundle(thailand);
});

function section(heading: string) {
  return within(screen.getByRole('heading', { name: heading }).closest('article')!);
}

describe('Methodology scientific explanations', () => {
  it('shows product spacing from the verified bundle instead of the outdated 20 m claim', () => {
    render(<Methodology onBack={() => {}} bundle={thailand} />);
    const metadata = screen.getByLabelText('Loaded area metadata');
    expect(thailand.manifest.pixelSpacingM).toBe(10);
    expect(metadata).toHaveTextContent(`${thailand.manifest.pixelSpacingM} m pixel spacing`);
    expect(metadata).toHaveTextContent(`frequency label ${thailand.manifest.frequency}`);
    expect(metadata).toHaveTextContent(thailand.manifest.maturity);
    expect(metadata).not.toHaveTextContent('20 m pixel spacing');
  });

  it('retains compatibility, source distinctions, uncertainty and signed-ranking authority', () => {
    render(<Methodology onBack={() => {}} />);
    const radar = section('NISAR L2 GCOV: radar on a map');
    expect(radar.getByText(/HHHH/)).toBeInTheDocument();
    expect(radar.getByText(/orbit direction, acquisition mode, frequency label/)).toBeInTheDocument();
    const water = section('OPERA L3 DSWx-S1: water context');
    expect(water.getByText(/derived from Sentinel-1 radar, not from NISAR/)).toBeInTheDocument();
    expect(water.getByText(/gap in days/)).toHaveTextContent('water overlap alone does not establish that a flood happened');
    expect(section('OpenStreetMap: roads near change').getByText(/Proximity does not establish damage/)).toBeInTheDocument();
    expect(section('Evidence before the review order').getByText(/signed risk rank is authoritative/)).toHaveTextContent('an action list cannot replace it');
    expect(section('Know what the data can tell you').getByText(/60% usable pixels/)).toHaveTextContent('rank and score are null, meaning missing, not zero');
    expect(screen.getByText(/does not predict floods or issue emergency alerts/)).toHaveTextContent('must not be used for operational decisions');
  });

  it('keeps the verification steps, original source links and working back button without a loaded bundle', () => {
    const onBack = vi.fn();
    render(<Methodology onBack={onBack} />);
    expect(screen.queryByLabelText('Loaded area metadata')).not.toBeInTheDocument();
    const checks = section('How the data is checked');
    expect(checks.getByText(/RFC 8785/)).toHaveTextContent('Ed25519');
    expect(checks.getByText('dashboard.config.json').closest('li')).toHaveTextContent('untrusted key is still rejected');
    expect(checks.getByText(/time to live/)).toHaveTextContent("not the visitor's current clock");
    expect(checks.getByText(/If a required check fails/)).toHaveTextContent('does not render bundle data');
    for (const [name, href] of [
      ['About NISAR', 'https://nisar.jpl.nasa.gov/'],
      ['About OPERA', 'https://www.jpl.nasa.gov/go/opera/products/'],
      ['About OpenStreetMap', 'https://www.openstreetmap.org/about'],
    ]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Back to map' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
