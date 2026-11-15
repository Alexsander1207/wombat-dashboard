# Integración de UI: del bundle verificado al Explorer

Para **Mireya (@Mireyamd)** y **Ximena (@Ximenacode)**.

Este documento es el contrato entre las dos mitades del dashboard:

- **Lo que ya funciona** (rama `main`): carga y verificación del bundle WONB 0.2
  en el navegador — SHA-256 por archivo, firma Ed25519 por bloque, cadena de
  padres, TTL contra la instantánea. Entra una URL, sale un objeto tipado.
- **Lo que falta conectar** (su trabajo): el Explorer, los controles de capas y
  las tarjetas de evidencia, que hoy leen fixtures propios.

El PR que acompaña este documento **no monta nada de eso**. Solo deja los
archivos a mano, los estilos sin importar y este mapa para que ustedes decidan
qué conectar y cómo.

> **Nota de nombres.** En la conversación llamamos "BundleContract" al contrato
> de datos. En el código el tipo se llama **`LoadedBundle`** y vive en
> `src/bundle/types.ts`; `BundleContract` no existe como identificador. Donde
> este documento dice `LoadedBundle`, es ese contrato.

---

## 1. Qué devuelve exactamente `loadAndVerify`

```ts
// src/bundle/contract.ts
export async function loadAndVerify(
  baseUrl: string,                                        // p.ej. "/bundles/piura-demo/v0"
  trustedIssuers: { issuer: string; roles: string[] }[],  // de dashboard.config.json
  readBytes?: ReadBytes,                                  // inyectable para tests
  signal?: AbortSignal,
): Promise<LoadedBundle>;

export function releaseBundle(bundle: LoadedBundle): void; // revoca los blobs de overlay
```

Si algo no verifica, **lanza** `BundleContractError` con `message` y
`problems: string[]`. No devuelve un bundle "a medias". Esa es la regla: lo que
se dibuja, se verificó.

### `LoadedBundle`

```ts
interface LoadedBundle {
  aoiId: string;
  bundleVersion: string;
  contractVersion: string;
  dataOrigin: string;               // del bloque `change` FIRMADO, no del manifest
  t1: string;                       // ISO, del bloque `change` FIRMADO
  t2: string;                       // ISO, del bloque `change` FIRMADO
  integrityWarning: string | null;  // el manifest discrepa del bloque firmado
  cells: BundleCell[];
  roadsGeoJson: unknown;            // FeatureCollection<LineString> de OSM
  overlays: BundleOverlays;
  manifest: BundleManifest;
  actions: BundleAction[];
  verification: BundleVerification;
}
```

### `BundleCell` — una celda lista para la UI

```ts
interface BundleCell {
  cellId: string;
  status: "review_high" | "review_medium" | "review_low" | "insufficient_quality";
  rank: number | null;
  scoreBp: number | null;      // basis points: 7636 = 76,36 %
  geometry: { type: "Polygon"; coordinates: number[][][] } | null;
  componentsBp: { change: number; opera: number; road: number };
  metrics: {
    validBp: number;           // observaciones válidas
    decreaseBp: number;
    increaseBp: number;
    changedBp: number;
    p90AbsDeltaCdb: number;    // centi-decibelios: 560 = 5,60 dB
    operaStatus: string;
    operaOverlapBp: number;
    roadMNearChange: number;   // metros
    roadMTotal: number;        // metros
  };
  explanation: string[];       // frases ya redactadas, en orden
}
```

Dos unidades que conviene no confundir:

| sufijo | unidad | ejemplo | a porcentaje / dB |
| --- | --- | --- | --- |
| `...Bp` | basis points (1/10000) | `7636` | `7636 / 100 = 76,36 %` |
| `...Cdb` | centi-decibelios (1/100 dB) | `560` | `560 / 100 = 5,60 dB` |

Hay helpers listos en `src/format.ts`: `percentFromBp`, `roundPercentFromBp`,
`decibelsFromCdb`, `kilometresFromMetres`, `statusLabel`, `statusHint`,
`rankLabel`, `readableDate`, `readableDateTime`.

### `BundleAction`, `BundleOverlays`, `BundleManifest`, `BundleVerification`

```ts
interface BundleAction {
  cellId: string;
  rank: number;       // el orden de revisión publicado. NO lo recalculen.
  action: string;
  audience: string;
}

interface BundleOverlays {
  t1: string;         // object URL de la PNG ya verificada
  t2: string;
  delta: string;
  bounds: [number, number, number, number];   // [oeste, sur, este, norte]
}

interface BundleManifest {
  aoiName: string; maturity: string; frame: string; orbitDirection: string;
  mode: string; frequency: string; pixelSpacingM: number;
  t1Granule: string; t1Datetime: string;
  t2Granule: string; t2Datetime: string;
  comparable: boolean;                        // comparabilidad t1/t2
  operaProduct: string; operaDerivedFrom: string; operaStatus: string;
  osmAttribution: string;                     // hay que mostrarlo
  pipelineCommit: string; riskConfigVersion: string;
  bboxWgs84: [number, number, number, number];
}

interface BundleVerification {
  filesChecked: number; filesOk: boolean;
  blocksChecked: number; blocksOk: boolean;
  chainOk: boolean; issuersOk: boolean; ttlOk: boolean;
  asOf: string;          // index.generated_at: la instantánea, no el reloj
  problems: string[];
}
```

---

## 2. Qué consumen hoy sus componentes

Los cuatro archivos están en `src/components/_incoming/`, **tal como los
escribieron**, excluidos de `tsc` y de `eslint` para que no bloqueen el build.
No están importados desde ningún lado.

### `MapExplorer.tsx`

```ts
interface Props {
  hidden: boolean;
  bundle: ExplorerBundle;
  selected: CellEvidence | null;
  onSelect: (c: CellEvidence) => void;
  compare: boolean;
  onCompare: () => void;
  controls: boolean;
  priorityOpen: boolean;
  onPriority: () => void;
  onControls: () => void;
}
```

Dependencias propias: `maplibre-gl` (ya está en `main`, misma versión `^6.18.0`),
`lucide-react` (agregado en este PR), `../frontend/demoAdapter`, `./DataStatus`,
`./MapLayerControls`, `../frontend/mapDisplay`.

Ojo con una línea:

```ts
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
maplibregl.setWorkerUrl(workerUrl)
```

Eso es específico de Vite y funciona, pero `src/components/MapView.tsx` (el mapa
que hoy está en producción) no lo hace. Si montan los dos mapas a la vez,
unifiquen el arranque del worker en un solo lugar.

### `MapLayerControls.tsx`

```ts
export interface VisibleLayers { change: boolean; water: boolean; grid: boolean }

function MapLayerControls(props: {
  expanded: boolean;
  onExpand: () => void;
  layers: VisibleLayers;
  onChange: (key: keyof VisibleLayers, checked: boolean) => void;
  compare: boolean;
  opacity: number;                 // 0..100
  onOpacity: (value: number) => void;
}): JSX.Element
```

Sin dependencia de datos: es estado de UI puro. **Se puede conectar ya mismo.**

### `Evidence.tsx`

Tres componentes exportados:

```ts
function EvidenceCard(props: {
  cell: CellEvidence; before: string; after: string;
  onClose: () => void; onExpand: () => void;
}): JSX.Element

function EvidenceDetails(props: { cell: CellEvidence; onClose: () => void }): JSX.Element

function EvidenceVerification(): JSX.Element
```

`EvidenceVerification` llama a `verifyEvidence()` de `demoAdapter`, que hoy
devuelve siempre `status: 'Unavailable'` con el mensaje de que el servicio de
verificación no está conectado.

**Ese es el punto que más cambia.** Ya no es cierto: la verificación existe y
corre en el navegador. Reemplacen esa llamada por los campos de
`bundle.verification` (ver la tabla de la sección 3) y borren el texto de
"no connected" y el de "no signature verification has been performed".

### `DataStatus.tsx`

```ts
type DataState = 'loading' | 'static' | 'simulated' | 'empty'
              | 'connection' | 'incompatible' | 'quality' | 'verification'

function DataStatus(props: { kind: DataState; title: string; detail?: string }): JSX.Element
```

Presentacional puro. **Se puede conectar ya mismo.**

### La forma de los fixtures actuales

`demoAdapter.ts` → `CellEvidence`:

```ts
interface CellEvidence {
  id: string; rank: number; score: number;      // 0..1
  quality: string;                              // 'Sufficient' | 'Insufficient quality'
  valid: number; changed: number;               // porcentajes 0..100
  magnitude: number;                            // dB con signo
  increased: number; decreased: number;         // porcentajes
  water: string;                                // texto libre
  roads: number;                                // kilómetros
  explanation: string;                          // una sola cadena
  center: [number, number];
}
```

`demoAdapter.ts` → `ExplorerBundle` (es `typeof demoBundle`):

```ts
{ mode: 'simulated', cells, before: { date, label }, after: { date, label },
  coordinates: [[lon, lat] x 4], initialView: { center, zoom },
  compatible: boolean, grid, priorityGeo, boundary, water }
```

`piuraGrid.ts` → `mockGridMetadata` (EPSG:32717, celdas de 1000 m, 8x8) y
`projectedMockGrid` con `{ cell_id: "PIU-01", projectedRing: [...] }`.

`piuraEvidence.ts` → `mockRisks: readonly DemoRisk[]` con
`{ cellId, rank, score_bp, status, explanation, insufficientQuality,
sourcePath, quality: { usable_pct, note }, p90_abs_delta_cdb }`.

Dos avisos sobre esos fixtures, para que no pierdan tiempo:

1. Sus `cellId` son `PIU-01 … PIU-08`; los del bundle real son
   `piura-demo-r00c00 … piura-demo-r03c03` (4x4 = 16 celdas). No empatan por
   nombre.
2. Sus `status` son `priority_high` / `priority_medium`; el contrato usa
   `review_high` / `review_medium` / `review_low` / `insufficient_quality`. La
   diferencia no es cosmética: **`insufficient_quality` no es "riesgo bajo"**,
   es "todavía no se puede decir nada". Hay que mostrarlo distinto.

---

## 3. Mapeo campo a campo

### `CellEvidence` ← `BundleCell`

| su campo | nuestro origen | conversión | nota |
| --- | --- | --- | --- |
| `id` | `cell.cellId` | directa | ids distintos a los de los fixtures |
| `rank` | `actions[].rank` por `cellId`, si no `cell.rank` | directa | puede ser `null`: no toda celda tiene acción publicada |
| `score` | `cell.scoreBp` | `/ 10000` | `null` posible → no mostrar `0.00` |
| `quality` | `cell.status === 'insufficient_quality'` | `'Datos insuficientes'` / `'Suficiente'` | |
| `valid` | `cell.metrics.validBp` | `/ 100` | |
| `changed` | `cell.metrics.changedBp` | `/ 100` | |
| `magnitude` | `cell.metrics.p90AbsDeltaCdb` | `/ 100` | **es un valor absoluto (p90), no trae signo.** El signo está en `increaseBp` contra `decreaseBp` |
| `increased` | `cell.metrics.increaseBp` | `/ 100` | |
| `decreased` | `cell.metrics.decreaseBp` | `/ 100` | |
| `water` | `cell.metrics.operaStatus` + `operaOverlapBp` | texto | ahora hay número, no solo "overlap in demo" |
| `roads` | `cell.metrics.roadMNearChange` | `/ 1000` | además hay `roadMTotal` para dar proporción |
| `explanation` | `cell.explanation` | `.join(' ')` | es `string[]`; si quieren, una frase por línea |
| `center` | `cell.geometry.coordinates[0]` | promedio del anillo | `geometry` puede ser `null` |
| — | `cell.componentsBp` | **NUEVO** | aporte de change / opera / road al puntaje. Vale la pena mostrarlo: explica *por qué* esa celda está arriba |

### `ExplorerBundle` ← `LoadedBundle`

| su campo | nuestro origen | nota |
| --- | --- | --- |
| `mode` | `bundle.dataOrigin` | `'simulated'` o verificado |
| `cells` | `bundle.cells` | ver tabla anterior |
| `before.date` / `after.date` | `bundle.t1` / `bundle.t2` | ISO completo, vienen del bloque **firmado** |
| `before.label` / `after.label` | — | texto de UI, decisión de ustedes |
| `coordinates` | `bundle.manifest.bboxWgs84` | 4 esquinas desde `[oeste, sur, este, norte]` |
| `initialView.center` | centro de `bboxWgs84` | |
| `initialView.zoom` | **SIN EQUIVALENTE** | el bundle no opina de zoom. Dejen un valor fijo o calcúlenlo del bbox |
| `compatible` | `bundle.manifest.comparable` | directa. Hay además `comparable_checks` por criterio en el manifest crudo |
| `grid` | `bundle.cells[].geometry` | armen el `FeatureCollection<Polygon>` desde las celdas |
| `priorityGeo` | `bundle.cells` filtradas por `status` | |
| `boundary` | `bundle.manifest.bboxWgs84` | |
| `water` | **SIN EQUIVALENTE** | no hay LineString de río. OPERA llega como **overlay ráster** (`overlays.t1/t2/delta`) más `operaOverlapBp` por celda. Propuesta: cambien la capa "contexto de agua" de línea a overlay con opacidad, y en la celda muestren el porcentaje de solapamiento |
| — | `bundle.roadsGeoJson` | **NUEVO**: capa real de vías OSM. Reemplaza al río ilustrativo como capa vectorial |
| — | `bundle.overlays.{t1,t2,delta}` | **NUEVO**: PNG georreferenciadas ya verificadas, con `bounds`. Sustituyen a `observationImage()`, que hoy pinta un canvas sintético |

### `VerificationResult` ← `BundleVerification`

Aquí está el cambio de fondo. `verifyEvidence()` devolvía `'Unavailable'`
siempre; ahora hay datos reales:

| su campo | nuestro origen |
| --- | --- |
| `status: 'Verified'` | `filesOk && blocksOk && chainOk && issuersOk && ttlOk` |
| `status: 'Failed'` | alguno de `filesOk`, `blocksOk`, `chainOk`, `issuersOk` en `false` |
| `status: 'Expired'` | `ttlOk === false` (evaluado contra `asOf`, no contra el reloj) |
| `status: 'Not Checked'` | solo antes de que `loadAndVerify` resuelva |
| `status: 'Unavailable'` | ya no aplica: si no verifica, `loadAndVerify` **lanza** |
| `message` | `bundle.verification.problems.join(' · ')` |
| — | `blocksChecked`, `filesChecked` — **NUEVO**: cuántos bloques y archivos se comprobaron. Es el número que mira el jurado |
| — | `asOf` — **NUEVO**: la instantánea contra la que se evaluó la vigencia |
| — | `bundle.integrityWarning` — **NUEVO**: el manifest discrepa del bloque firmado. Si no es `null`, hay que mostrarlo |

Texto a eliminar de `Evidence.tsx` y de cualquier copy:

- "No signature verification has been performed."
- "The evidence verification service is not connected…"
- "Risk configuration unavailable" → `risk-config.json` **sí** viaja en el
  bundle, con su versión en `manifest.riskConfigVersion`.

Y una cuestión de vocabulario que no es menor: en este proyecto se dice
**"preparación"** y **"revisión en campo"**. Nunca "alerta". WOMBAT no emite
alertas de emergencia y el texto no debe sugerir que lo hace.

---

## 4. El adaptador

Ya está escrito y compila: **`src/adapters/toExplorer.ts`**.

```ts
import type { LoadedBundle } from "../bundle/contract.ts";

export interface ExplorerCell { /* id, rank, score, quality, valid, changed,
  magnitude, increased, decreased, water, roads, explanation, center */ }

export interface ExplorerData {
  mode: "verified" | "simulated";
  cells: ExplorerCell[];
  before: { date: string; label: string };
  after: { date: string; label: string };
  boundary: [number, number, number, number];
  initialView: { center: [number, number]; zoom: number };
  compatible: boolean;
}

export function toExplorer(c: LoadedBundle): ExplorerData {
  const [west, south, east, north] = c.manifest.bboxWgs84;
  const centre: [number, number] = [(west + east) / 2, (south + north) / 2];
  const ranked = new Map(c.actions.map((a) => [a.cellId, a.rank]));

  return {
    mode: c.dataOrigin === "simulated" ? "simulated" : "verified",
    before: { date: c.t1, label: "Antes (t1)" },
    after: { date: c.t2, label: "Después (t2)" },
    boundary: [west, south, east, north],
    initialView: { center: centre, zoom: 11.5 },
    compatible: c.manifest.comparable,
    cells: c.cells.map((cell) => ({
      id: cell.cellId,
      rank: ranked.get(cell.cellId) ?? cell.rank,
      score: cell.scoreBp === null ? null : cell.scoreBp / 10000,
      quality: cell.status === "insufficient_quality" ? "Datos insuficientes" : "Suficiente",
      valid: cell.metrics.validBp / 100,
      changed: cell.metrics.changedBp / 100,
      magnitude: cell.metrics.p90AbsDeltaCdb / 100,
      increased: cell.metrics.increaseBp / 100,
      decreased: cell.metrics.decreaseBp / 100,
      water: `${cell.metrics.operaStatus} · ${cell.metrics.operaOverlapBp / 100}% de solapamiento`,
      roads: cell.metrics.roadMNearChange / 1000,
      explanation: cell.explanation.join(" "),
      center: centreOf(cell, centre),
    })),
  };
}
```

Diferencias a propósito respecto de su `CellEvidence`:

- `rank` y `score` son `number | null`. Un `0` dibujado donde el bundle no trae
  dato es un dato inventado.
- No hay `grid`, `priorityGeo` ni `water` todavía: las dos primeras se derivan de
  `cells[].geometry` cuando decidan el formato, y la tercera no tiene
  equivalente (ver sección 3).

### Cómo usarlo

```tsx
import { loadAndVerify } from "./bundle/contract.ts";
import { toExplorer } from "./adapters/toExplorer.ts";

const bundle = await loadAndVerify("/bundles/piura-demo/v0", issuers);
const data = toExplorer(bundle);   // listo para el Explorer
```

Los emisores confiables salen de `dashboard.config.json` por AOI. No los
escriban a mano en un componente: una clave fuera de esa lista debe ser
rechazada, y ese es justamente el punto.

---

## Qué trae este PR y qué no

| | |
| --- | --- |
| ✅ `public/brand/` | marca de Mireya/Ximena, favicons ya conectados en `index.html` |
| ✅ `src/pages/Methodology.tsx` | su página, con el texto reescrito para describir la verificación real. Toggle en `App.tsx`, sin react-router |
| ✅ `src/styles/mireya/` | `theme.css`, `header.css`, `navigation.css` — **copiados, no importados** |
| ✅ `src/components/_incoming/` | sus 4 componentes de referencia, fuera de `tsc` y de `eslint` |
| ✅ `src/adapters/toExplorer.ts` | el puente, compilando |
| ✅ `.gitattributes` | los bundles firmados ya no se corrompen al clonar en Windows |
| ❌ `src/data/mock/`, `public/mock/`, `src/demo/`, `bootstrap.ts`, `?demo=piura` | no entran: el bundle verificado reemplaza al fixture |
| ❌ `src/verify/integrity.ts`, `src/services/` | su loader solo hace SHA-256 y por defecto lanza `CONTRACT_UNAVAILABLE`. Lo de `main` ya hace eso **y** Ed25519 |
| ❌ versiones mayores | seguimos en vite 7, typescript 5.8, eslint 9, `@vitejs/plugin-react` 5 |

**Créditos.** El trabajo de frontend es de Mireyamd y Ximenacode. Sus commits
originales están en `Mireyamd/Dashboard_Wambort`, rama
`integration/wombat-combined`, con autoría intacta.
