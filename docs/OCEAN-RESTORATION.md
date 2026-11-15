# Ocean Edition frontend restoration

Visual reference: `198e99c` and the supplied Thailand screenshots.

The restored shell uses the existing `Explorer.css` floating layout rather than
the merged permanent sidebar. `App.tsx` retains the current loading, cancellation,
blob cleanup and complete verification gate. `MapExplorer.tsx` retains the worker,
timing marks, local verified sources, transparent hit area, polygon focus, camera
sync and lazy comparison map. Backend modules and shared styles are unchanged.

For Ximena's review:

- `Explorer.css` ends with scoped restoration overrides; no shared CSS is replaced.
- `explorer-header` and `explorer-action-bar` reuse branding and the accessible
  floating navigation. `explorer-integrity` holds compact navy summary cards.
- `explorer-right-dock` reserves separate space for collapsible Evidence and key.
- `OceanEvidence.tsx` uses signed adapter fields, existing `EvidenceChain`, and
  expandable measurements, component weights, explanation and provenance.
- The existing layer component gains verified-overlay and basemap selectors.
- Satellite context is added after map load, with an OSM street fallback and a
  plain-background option. Provider credits remain in MapLibre's corner control.
- The attribution background override uses `!important` only to override the
  existing shared attribution rule, which also uses `!important`.
- Below 760 px, controls stack and summaries follow the map. Below 1100 px, the
  redundant selection chip hides while Evidence is open; its header still
  collapses. When a cell remains selected but Evidence is hidden, for example
  while Layers is open, the chip can reopen its evidence.

Scientific imagery, geometry, ranks and scores always come from `toExplorer`.
Basemap imagery is geographic context only and is labeled as unverified context.
