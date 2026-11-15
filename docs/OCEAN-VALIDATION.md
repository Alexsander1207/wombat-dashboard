# Ocean Edition validation

Work remains on `feat/mireya-explorer`, without commits or pushes.

## Automated checks

- `npx.cmd tsc -b`: passed.
- `npx.cmd eslint .`: passed.
- `npx.cmd vitest run`: 39 tests passed across 4 files.
- `npm.cmd run build`: passed. Vite reports its existing large-chunk warning.

Vitest retains cryptographic integrity/rejection tests and adds coverage for
verified selection, ranking order, exact geometry/assets, compact Evidence,
per-cell road units, map controls, external tile fallback and synchronized
comparison. No bundle, signature, index, cryptographic code or dependency was
changed for the Ocean restoration.

## Real browser checks

Chrome headless ran the actual Vite application and MapLibre worker, loading
`tailandia-01/v1` through `loadAndVerify`. It confirmed 600 source geometries and
signed status counts 248/151/104/97 (503 classified, 97 insufficient quality).

Passed interactions:

- Signed Top 10 selects/focuses its original polygon and updates Evidence.
- Actual mouse click at the projected centre of an original cell updates Evidence.
- Evidence folds/expands; the Layers and Guide navigation work, including return.
- Grid and roads toggles update their layers; cells remain selectable with grid hidden.
- Zoom in/out and fit-AOI controls work.
- Before/after uses t2 in the base map and t1 in the clipped synchronized map.
- Keyboard divider changes 50 to 51%; pointer drag changes it to 66%.
- Integrity explanation expands and remains accessible.
- Widths 1024, 768, 390 and 320px show no horizontal document overflow,
  including after selecting a cell, against documentElement.clientWidth.
- Blocking external imagery requests hides only the basemap; verified layers,
  evidence and the dark fallback remain. Restoring network loads the attributed
  Esri imagery. No JavaScript runtime exceptions were recorded.

Screenshots in `artifacts/ocean-edition/`:
`desktop.png`, `menu.png`, `evidence-fallback.png`, `comparison-fallback.png`,
`mobile.png`. Browser QA used development mode; production was build-validated.

## Comparison with supplied screenshots

Recovered: wombat logo, floating header, Ocean navy/teal/coral palette, compact
four-item menu, full-map composition, evidence card, discreet legend, zoom/reset,
observation bar and swipe comparison. Shared team styling and branding remain
untouched; new scopes and responsive container exceptions are documented in
`docs/EXPLORER-CSS.md` for Ximena.

The geographic content remains the real verified Thailand dataset. Its dense
delta raster, signed dates and full road/cell geometry intentionally have their
original appearance. The earlier Piura illustration and its synthetic previews
are not reproduced. Fine aesthetic review by Ximena can use the saved captures;
there is no remaining functional blocker from these checks.

## Clean English UI validation

Current revision: 40 tests passed across 4 files. TypeScript, ESLint and the final
production build passed. Vite still reports its large-chunk advisory. The built
HTML uses lang="en", an English title and an English description.

Chrome exercised the final source at 1600px and responsive widths 1024, 768, 390
and 320px. All earlier map interactions passed, including real polygon clicks,
Top 10, zoom/reset, layer toggles, evidence folding, navigation, keyboard and
pointer comparison, and external imagery fallback. No runtime exceptions or
horizontal overflow were detected. Additional appearance checks confirmed:

- no header status badge;
- English verification/area summaries and snapshot date;
- opaque comparison background, with title visible at each width;
- attribution in a small corner box, not a screen-wide strip;
- all 600 original Thailand geometries and 248/151/104/97 status counts intact.

Final screenshots: artifacts/clean-english/desktop.png, comparison.png, mobile.png.
The English UI test loads the real signed Thailand bundle and checks the 605
signed blocks, area/purpose text, calmer provisional-data note and missing badge.
Cryptographic tests and signed-data assertions were retained. Shared styles,
branding assets, copy ownership files, bundle/verification code and dependencies
were not edited. No commit or push was made.

## Final panel-spacing review

Chrome measured a 14px gap between Evidence and the expanded map key on desktop,
and 12px on mobile. It exercised all Evidence sections expanded, original map
selection, Top 10, layers, comparison, controls and navigation at widths 1600,
1024, 768, 390 and 320px. No relevant panel overlap, horizontal overflow or runtime
exception was detected. Credits were at most 300px wide; the compact title chip
measured 124–138px. White summary cards were preserved.

All 40 tests, TypeScript, ESLint and production build passed. Source data and
verification are unchanged. Screenshots: artifacts/panel-spacing/desktop.png,
mobile.png and overview.png. Work remains on feat/mireya-explorer without commits
or pushes.
