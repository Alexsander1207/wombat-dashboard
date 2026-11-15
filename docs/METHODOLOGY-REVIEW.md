# Methodology review against HEAD

Compared the working page with `git show HEAD:src/pages/Methodology.tsx`.
The shortened translation had lost essential methodological detail. The restored
component uses formatted imports, paragraphs, sections and verification steps,
while retaining the existing Ocean guide classes and palette.

## Preserved or restored explanations

| Original topic | Restored English content |
| --- | --- |
| NASA NISAR L2 GCOV | Radar/backscatter, mapped measurements, HHHH/HH polarization, t1/t2, frame, orbit, mode, frequency label, polarization and maturity compatibility. Pixel spacing is distinguished from the size of objects that can actually be resolved. |
| OPERA L3 DSWx-S1 | Derived from Sentinel-1, explicitly not NISAR; water extent rather than depth; spatial overlap is supporting context; separate observation dates and gaps in days matter; overlap does not establish flooding. |
| OpenStreetMap | Road geometry and highway tags, source filtering, per-cell nearby-road lengths, exposure rather than proven damage, selected-cell metrics versus the full-area network. |
| Change measurements | Plus/minus direction, decibels and their scale, declared detection threshold, Thailand v1's 3.00 dB, absolute p90 magnitude, neither sign identifies flooding, no frontend metric recalculation. |
| Signed evidence and review order | WONB change + context → risk → action chain, record contents, intended audience, authoritative signed risk rank rather than a secondary action rank, basis points, component values versus configured weights, versioned risk-config.json, no reranking or score recalculation. |
| Browser verification | File hashes against index.json; JCS/RFC 8785 body normalization excluding derived id/signature; SHA-256 record ID; Ed25519 signature over the hash; externally pinned trusted keys and allowed roles; complete parent references; TTL against snapshot generated_at rather than the current clock; fail-closed rendering. Signature verification does not establish scientific truth or ground conditions. |
| Data limitations | Less than 60% usable pixels means null rank/score, not zero or safe; comparability, origin and maturity; vegetation, soil moisture, roughness and viewing conditions; provisional real data, method validation, field checks, human judgement, no flood prediction/emergency alerts, no operational use of SIMULATED data. |

## Scientific correction

HEAD hard-coded 20 m spacing. The real, verified Thailand v1 package declares
10 m in both its signed change record and descriptive product metadata. The page
now receives the already loaded `LoadedBundle` as an optional read-only prop and
shows its metadata's actual pixel spacing, frequency label and maturity. No data
files or loader types were changed. If no verified bundle is available, that
metadata paragraph is absent and the general methodology remains accessible.
The 3.00 dB example is explicitly labelled as the published Thailand v1 setting,
rather than a universal threshold selected by the UI.

## Sources

All three original source links remain unchanged:

- https://nisar.jpl.nasa.gov/
- https://www.jpl.nasa.gov/go/opera/products/
- https://www.openstreetmap.org/about

Added a product guide for the GCOV terminology:
https://hyp3-docs.asf.alaska.edu/nisar-docs/gcov/

Cross-checked the Sentinel-1 product distinction with the NASA JPL DSWx guide:
https://www.jpl.nasa.gov/go/opera/products/dswx-product-suite/

## Code and validation

- `src/pages/Methodology.tsx`: restored scientific content and readable TSX.
- `src/App.tsx`: passes the existing verified bundle; loading/checking unchanged.
- `src/components/Explorer.css`: guide-only box sizing, root width and readable
  introduction line length to prevent overflow once the full text is restored.
- `tests/methodology.test.tsx`: real verified Thailand metadata, scientific
  qualifications, original links, verification steps and standalone back button.
- `tests/integrity-browser.test.ts`: App-level Methodology → Back to map check.

`npx.cmd tsc -b`, `npx.cmd eslint .`, `npx.cmd vitest run` (44 tests across 5 files)
and `npm.cmd run build` passed. Vite retains its large-chunk advisory.

Chrome headless verified header Methodology and menu Guide entry points, seven
sections, actual 10 m loaded metadata, Back to map returning to the same checked
Thailand bundle, and no horizontal overflow at 320/390/768/1440px. No runtime
exceptions were recorded. Production was build-validated; browser QA used Vite
development mode. Screenshots: artifacts/methodology/.

Verification algorithms, signed datasets, dependencies, branding and shared
stylesheets remain untouched. Work stays on feat/mireya-explorer, with no commit,
push or Pull Request created.
