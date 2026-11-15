# Ocean Edition: Explorer presentation review for Ximena

## Scope and reference

The visual reference is the supplied Ocean Explorer screenshots, read alongside
`C:/Users/Lenovo/Dashboard_Wambort/src/demo/layout/DashboardShell.tsx`,
`src/demo/demo.css`, and the existing Mireya theme/header/navigation CSS in this
checkout. The old checkout was read only. Its simulated data, map geometry,
preview generation and loading logic were not copied.

Only `src/components/Explorer.css` supplies new styling. Shared `src/styles`,
`src/App.css`, `src/index.css`, copy files and branding assets were not edited.
The header reuses `public/brand/wombat-explorer-full-480.webp` unchanged.
`App.tsx` only supplies the Explorer presentation shell and callbacks; the
verified loading, AOI selection, badge and integrity controls remain in place.

## Recovered presentation

- Full-width map behind independent header cards and a navy/turquoise/coral menu.
- Floating Explore / Layers / Evidence / Guide navigation, signed Top 10 cards,
  cream rank labels, cream/coral selection outline and compact zoom/reset tools.
- Compact, foldable Evidence with separate metric, component/weight, signed
  explanation and provenance accordions. Preview images are the verified AOI
  rasters, explicitly labelled as AOI overviews rather than cell crops.
- Discreet legend (initially folded), bottom observation bar, synchronized t1/t2
  swipe comparison using original verified raster bounds and signed dates.
- Desktop and mobile layouts; small-screen evidence/tools alternate so they do
  not compete for the same column. Navigation remains accessible after selection.
- Always-visible verification summary, with expandable verification details and
  AOI status summary. The maturity and SIMULATED badges remain unchanged in meaning.

## Scoped CSS groups

- `explorer-app`, `explorer-header`, `explorer-brand`, `explorer-header-caption`:
  shell, logo and floating header.
- `explorer-layout`, `explorer-canvas`, `explorer-before`: MapLibre hosts.
- `explorer-navigation`, `explorer-menu`, `explorer-action-bar`,
  `explorer-left-panel`, `explorer-priorities`, `explorer-layer-*`: navigation,
  priorities, layer selection and control rows.
- `explorer-evidence-*`, `explorer-core-metrics`, `explorer-accordion`,
  `explorer-previews`, `explorer-provenance`: compact selected-cell evidence.
- `explorer-map-tools`, `explorer-selection-chip`, `explorer-rank-marker`:
  interaction affordances and accessible map labels.
- `explorer-observation-*`, `explorer-compare-*`, `explorer-comparison-labels`,
  `explorer-split-label`: verified observation comparison and its slider.
- `explorer-legend`, `explorer-key-*`, `explorer-attribution`,
  `explorer-basemap-note`: legend, attribution and external-basemap fallback.
- `explorer-integrity`, `explorer-bundle-summary`: compact verification footer.

Tokens use existing shared variables with local Ocean fallbacks. No global theme
is imported or overridden. Two container-only selectors need Ximena's review:
`#root:has(> .explorer-app)` sets width/max-width to 100%, and
`body:has(> #root > .explorer-app)` clears the shared 320px minimum. They apply
only while the Explorer shell is mounted, preventing the shared 100vw root and
Windows vertical scrollbar from producing horizontal overflow at narrow widths.
Component descendants use border-box sizing. Breakpoints: 1150, 760 and 380px;
reduced motion and visible keyboard focus styles are included.

## Geographic presentation and data boundaries

World Imagery is an external context basemap, not verified NISAR evidence.
The public service used by the former map is optional and has a dark fallback:
https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
Its current attribution (Esri, Vantor, Earthstar Geographics and the GIS User
Community) is visible whenever enabled; service attribution is also attached to
the MapLibre source. Provider information/terms:
https://goto.arcgisonline.com/maps/World_Imagery
A tile failure hides only the external source; bundle imagery, vectors and
Evidence remain available. The toggle can disable that external source.

Roads retain their verified source geometry but use a zoom-dependent thin line
at 0.4 opacity, below grid and signed-priority outlines. No road total is derived
from the displayed network. `roadMTotal` and `roadMNearChange` are signed cell
metrics. Labels explicitly say "en esta celda" and display the exact original
metres alongside the existing kilometre formatter (which truncates below 0.1 km).
The whole-AOI road network is not labelled with a fabricated total.

The authoritative ranking remains `LoadedBundle.cells[].rank`, not actions.
All 600 Thailand polygons remain: 248 high, 151 medium, 104 low, and 97
insufficient quality. The latter have no score or rank; 503 are classified.
No verified raster pixels, coordinates, metrics, explanations or dates were
reconstructed from the former Piura demo. The real Thailand delta raster is
visually denser than the old synthetic Piura highlights; its pixels are retained.

## Simple English UI revision

- Removed the top status pill entirely. Data status now lives under "About this
  data" in Area summary; real/simulated origin and maturity are still retained.
- Replaced the full-width blue integrity block with two compact light cards:
  Verified data and Area summary. Fingerprint/signature details remain available
  behind "How was this checked?". Snapshot dates use English and explicit UTC.
- Attribution now occupies a small bottom-right box, never a full-width strip.
  All provider credits remain visible when the external imagery is enabled.
- The comparison card has an opaque navy surface, a defined edge/shadow and
  separate title/date/action hierarchy. The title stays visible at every tested
  responsive width. The scale sits above the corner attribution on desktop.
- Navigation, map tools, Evidence, comparison, summaries, loading/error screens
  and the methodology guide use short English copy. Original signed explanations
  and values are preserved. English place names are presentation labels only;
  the bundle is not rewritten. English helpers are in components/explorerCopy.ts,
  leaving shared format/copy files untouched.
- New helper text explains signal units, p90 and score weights inside expandable
  Evidence sections. Exact road metres remain alongside kilometre formatting.
- Updated tests keep cryptographic rejection assertions and all 600/503/97 data
  checks. A real verified Thailand UI test checks the English summary, snapshot,
  605 signed blocks and absence of any header badge.

Chrome QA confirmed the requested appearance, corner attribution and opaque
comparison background, plus navigation, selection, zoom, grid/road toggles,
keyboard and pointer comparison, network fallback and zero horizontal overflow
at 320/390/768/1024px. Screenshots are in artifacts/clean-english/.

## Floating-panel spacing revision

- White Verified data and Area summary cards retain their existing content,
  alignment and styling.
- The dark title chip is approximately 124–138px wide with a subtle Ocean Edition
  subtitle. It remains visible on mobile rather than disappearing at a breakpoint.
- `explorer-right-dock` places Evidence and the map key in a single flex column,
  separated by 14px on desktop and 12px on mobile. Evidence shrinks and scrolls
  within the available space; the key stays accessible below it. Expanded key
  content has a bounded scroll area, so Evidence keeps the larger share of space.
- Mobile zoom controls occupy a horizontal row below that column. The selection
  button has a separate space beside them, above the comparison card.
- Satellite-background failure text is inside the comparison card subtitle,
  instead of a separate floating notice that could collide with other controls.
- Map credits retain the complete Esri/Vantor/Earthstar/GIS User Community and
  original OSM attribution text. The bottom-right dark pill is capped at 300px;
  extra explanatory wording was removed from this pill, with external-background
  context still available in Layers. Mobile credits retain readable 9px text.

Chrome checked the final layout with every Evidence section and the map key
expanded at 1600, 1024, 768, 390 and 320px. Measured gaps were 14px desktop and
12px mobile. Assertions confirmed no Evidence/key collision with each other,
comparison or zoom controls, no horizontal overflow, title width <=170px and
credits width <=302px/height <=48px. Online and offline imagery paths, original
600 geometries, status counts, Top 10, selection and comparison passed; no
JavaScript runtime exceptions were recorded. Browser QA exited successfully.

TypeScript, ESLint, all 40 Vitest tests and the production build passed. Vite's
large-chunk advisory remains. Final screenshots: artifacts/panel-spacing/.
No shared styles, branding assets, protected verification modules, signed bundle
data, dependency versions, ranking calculations or evidence values were changed.

## Compact dark summary panels

Presentation-only revision in Explorer.css. Both information panels now reuse
`--ocean-panel`, `--ocean-border`, `--ocean-text` and `--ocean-teal`, matching the
navy/slate controls. The pair's desktop width is 610px (previously 690px), with
9px/11px padding and an 8px gap. Headings stay bright, metadata is muted
blue-gray, and the two underlined links remain turquoise. Expanded verification
and area notes also use dark slate surfaces, keeping the same content.

Focused Chrome checks confirmed all existing copy, aligned desktop heights of
109.375px, functioning expandable links, no horizontal overflow at 320/390/1024/
1600px, and text/link contrast of at least 4.5:1 against the panel surface even
when composited over white. Production build passed, with the existing Vite
large-chunk advisory. No React structure, data flow, verification, signed values,
ranking, shared CSS or dependencies changed in this revision. No tests were
added for this reversible CSS-only adjustment; validation used the build and
focused real-browser appearance/interaction checks.
