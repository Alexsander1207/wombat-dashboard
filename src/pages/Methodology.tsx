import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  FileCheck2,
  Route,
  Satellite,
  ShieldCheck,
  TriangleAlert,
  Waves,
} from 'lucide-react';
import type { LoadedBundle } from '../bundle/contract.ts';
import { areaName } from '../components/explorerCopy.ts';

/**
 * Methodology layout adapted from Mireyamd / Ximenacode.
 * Restores the scientific explanations from HEAD in plain English.
 * This page describes the existing checks; it never runs or changes them.
 */
interface MethodologyProps {
  onBack: () => void;
  bundle?: LoadedBundle | null;
}

export function Methodology({ onBack, bundle = null }: MethodologyProps) {
  return (
    <section className="methodology-page explorer-guide">
      <button className="text-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to map
      </button>

      <div className="methodology-intro">
        <span className="section-caption">HOW TO READ THE MAP</span>
        <h1>
          See what changed.
          <br />
          <span>Choose where to look more closely.</span>
        </h1>
        <p>
          WOMBAT brings satellite change measurements, water clues and nearby
          roads together to help people choose places to check in the field.
          It supports preparedness, including El Niño planning where relevant.
          A bundle is a package of data files and signed records. The browser
          checks that package before showing its data on the map.
        </p>
        {bundle && (
          <p aria-label="Loaded area metadata">
            <strong>Loaded area: {areaName(bundle)}.</strong>{' '}
            Its product metadata lists {bundle.manifest.pixelSpacingM} m pixel
            spacing, frequency label {bundle.manifest.frequency}, and maturity{' '}
            {bundle.manifest.maturity}. Pixel spacing is the distance between
            neighbouring grid points; it is not a guarantee that every object
            that size can be seen. These settings belong to this bundle and may
            differ for another area.
          </p>
        )}
      </div>

      <div className="method-grid">
        <article>
          <Satellite aria-hidden="true" />
          <span className="section-caption">01 / SATELLITE IMAGES</span>
          <h2>NISAR L2 GCOV: radar on a map</h2>
          <p>
            Radar sends a signal and measures what comes back. That returned
            signal is called backscatter. NISAR L2 GCOV means Level-2 Geocoded
            Polarimetric Covariance: processed radar measurements placed on a
            map grid, including measurements of signal strength. The channel
            label HHHH describes the intensity of the HH radar return.
            Polarization describes the orientation of the transmitted and
            received waves; HH uses horizontal waves for both.
          </p>
          <p>
            We compare a before image (t1) and an after image (t2). The bundle
            reports whether they match in frame (the same mapped scene), orbit
            direction, acquisition mode, frequency label such as A, polarization
            and maturity. These are the viewing and processing settings needed
            for a fair comparison. The dashboard does not offer comparison when
            the bundle says the observations are not comparable.
          </p>
          <a href="https://nisar.jpl.nasa.gov/" target="_blank" rel="noreferrer">
            About NISAR <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <p>
            <a
              href="https://hyp3-docs.asf.alaska.edu/nisar-docs/gcov/"
              target="_blank"
              rel="noreferrer"
            >
              GCOV product guide <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </p>
        </article>

        <article>
          <Waves aria-hidden="true" />
          <span className="section-caption">02 / WATER CLUES</span>
          <h2>OPERA L3 DSWx-S1: water context</h2>
          <p>
            NASA OPERA DSWx-S1 means Dynamic Surface Water Extent from Sentinel-1.
            It is a Level-3 water-mapping product derived from Sentinel-1 radar,
            not from NISAR. Water extent means where surface water is mapped,
            rather than how deep it is.
          </p>
          <p>
            A water overlap is a supporting clue in the same place. OPERA and
            NISAR may have different observation dates, so the source metadata
            also records the gap in days for each pair. Timing matters: water
            overlap alone does not establish that a flood happened.
          </p>
          <a
            href="https://www.jpl.nasa.gov/go/opera/products/"
            target="_blank"
            rel="noreferrer"
          >
            About OPERA <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </article>

        <article>
          <Route aria-hidden="true" />
          <span className="section-caption">03 / ROADS</span>
          <h2>OpenStreetMap: roads near change</h2>
          <p>
            OpenStreetMap supplies road geometry, or the mapped shapes of roads.
            The source extract uses the <code>highway=*</code> road tags, with
            the bundle's filtering rules. The signed evidence reports metres of
            road near detected change in each cell. A cell is one small area of
            the analysis grid.
          </p>
          <p>
            This describes exposure: roads that may need closer inspection.
            Proximity does not establish damage. The road network drawn across
            the whole area is different from the road-length metrics for one
            selected cell; the browser does not invent a network-wide total.
          </p>
          <a
            href="https://www.openstreetmap.org/about"
            target="_blank"
            rel="noreferrer"
          >
            About OpenStreetMap <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </article>

        <article>
          <Activity aria-hidden="true" />
          <span className="section-caption">04 / CHANGE</span>
          <h2>Signal change: stronger or weaker</h2>
          <p>
            Delta (Δ) means the difference between the two dates. A positive
            or negative change tells us whether backscatter increased or
            decreased. Decibels (dB) compare signal strengths on a logarithmic
            scale: equal steps mean multiplying the signal by the same factor.
            Here, a signed change means a change with a plus or minus
            sign; a digital signature is a separate check on the record.
          </p>
          <p>
            The detection threshold is declared in the signed <code>change</code>{' '}
            record, not chosen by the map. The published Thailand v1 bundle
            declares 3.00 dB. Neither direction alone identifies a flood. The
            dashboard displays supplied metrics without recalculating them. An absolute
            p90 magnitude describes the size of change, not its direction:
            90% of measured absolute changes are no larger than that value.
          </p>
          <div className="method-scale">
            <span>Weaker radar return</span>{' · '}
            <span>Stronger radar return</span>
          </div>
        </article>

        <article>
          <BookOpen aria-hidden="true" />
          <span className="section-caption">05 / SIGNED EVIDENCE</span>
          <h2>Evidence before the review order</h2>
          <p>
            WONB is the linked record format used by this project. Its chain is{' '}
            <strong>change + context → risk → action</strong>. Change and context
            records describe the observations and supporting information. Each{' '}
            <code>risk</code> record supplies a cell's status, rank, score,
            score parts, metrics and explanation. An <code>action</code> record
            adds a suggested action, its review rank and intended audience.
          </p>
          <p>
            The signed risk rank is authoritative for the Explorer and Top 10;
            an action list cannot replace it. Scores use basis points (bp):
            100 bp equals 1%, and 10,000 bp equals 100%. The configured weights
            travel in <code>risk-config.json</code> with a version. A weight says
            how much a score part counts; it is not the part's measured value.
            The dashboard does not recompute scores, change statuses or assign
            new ranks.
          </p>
        </article>

        <article>
          <ShieldCheck aria-hidden="true" />
          <span className="section-caption">06 / BROWSER VERIFICATION</span>
          <h2>How the data is checked</h2>
          <p>
            A digital signature helps check who signed a record and whether its
            content changed. WONB 0.2 uses the following checks:
          </p>
          <ol>
            <li>
              Each file's SHA-256 fingerprint must match <code>index.json</code>.
              A fingerprint is a value calculated from the exact file bytes;
              changed bytes fail this check.
            </li>
            <li>
              Each record body is put into a standard JSON form using JCS
              (RFC 8785), so key order cannot change the result. Its derived{' '}
              <code>id</code> and <code>signature</code> fields are left out.
              SHA-256 of that body must match the record's <code>id</code>.
              The Ed25519 signature is then checked over that hash.
            </li>
            <li>
              The signer must be pinned in <code>dashboard.config.json</code>{' '}
              and allowed to sign that record type. A valid signature from an
              untrusted key is still rejected. The bundle cannot grant itself
              trust. All parent records referenced by the chain must be present.
            </li>
            <li>
              The validity window, also called TTL or time to live, is checked
              against the snapshot's <code>generated_at</code> date, not the
              visitor's current clock. This describes the saved snapshot; it
              does not mean that the data shows live conditions.
            </li>
          </ol>
          <p>
            If a required check fails, the Explorer shows an error and does not
            render bundle data. Passing these checks does not prove a scientific
            interpretation or confirm a hazard on the ground.
          </p>
        </article>

        <article>
          <FileCheck2 aria-hidden="true" />
          <span className="section-caption">07 / DATA LIMITS</span>
          <h2>Know what the data can tell you</h2>
          <p>
            Check usable observations, comparability, source and maturity before
            interpreting a cell. A pixel is one image sample. With fewer than
            60% usable pixels, the cell has insufficient quality: its rank and
            score are null, meaning missing, not zero. This does not mean the
            place is safe or has low risk; there is not enough good data to
            rank it.
          </p>
          <p>
            Radar returns can vary with vegetation, soil moisture, surface
            roughness and viewing conditions. Real satellite data can still be
            provisional, meaning under review. The signed <code>data_origin</code>{' '}
            identifies real or simulated observations; product metadata describes
            maturity. The Thailand area is used for method validation. Field
            checks and human judgement remain necessary.
          </p>
        </article>
      </div>

      <div className="limitations">
        <TriangleAlert size={24} aria-hidden="true" />
        <div>
          <h2>A guide for field checks, not an emergency warning.</h2>
          <p>
            WOMBAT supports preparedness and field investigation. It does not
            predict floods or issue emergency alerts. Data marked SIMULATED is
            sample data and must not be used for operational decisions. People
            make the final decision.
          </p>
        </div>
      </div>
    </section>
  );
}
