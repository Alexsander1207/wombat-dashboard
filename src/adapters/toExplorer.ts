/**
 * Puente entre el bundle verificado y el Explorer de Mireya/Ximena.
 *
 * Regla: este adaptador SOLO traduce. No recalcula puntajes, no reordena el
 * ranking y no inventa valores donde el bundle no los trae.
 *
 * Original signed explanations and all raw evidence fields are retained.
 */
import type { FeatureCollection, Polygon } from "geojson";
import type { LoadedBundle } from "../bundle/contract.ts";
import type {
  BundleCell,
  OverlayCorner,
  SignedBlockRef,
} from "../bundle/types.ts";
import type { CellStatus } from "../contract/types.ts";
import { areaName, englishAction, englishStatus } from "../components/explorerCopy.ts";

/**
 * Cuántas zonas del orden de revisión se destacan: marcadores numerados en el
 * mapa y lista de la barra lateral. Para un top 10, basta cambiar este número.
 */
export const TOP_COUNT = 10;

/** Un eslabón de la cadena de evidencia de una celda. */
export interface EvidenceLink {
  type: "change" | "context" | "risk" | "action";
  /** Nombre para el público: "Qué cambió", "Qué hay alrededor", "Qué prioridad tiene", "Qué se recomienda". */
  title: string;
  /** Qué acredita ese bloque para esta celda, en una línea. */
  summary: string;
  /** Hash, emisor y estado de firma reales. `null` si la celda no tiene ese bloque. */
  block: SignedBlockRef | null;
}

/** Una celda lista para el Explorer. Todos los valores salen del bloque `risk` firmado. */
export interface ExplorerCell extends Omit<BundleCell, "explanation"> {
  signedExplanation: string[];
  /** Código técnico de la celda en el bundle, p. ej. "tailandia-01-r19c12". */
  id: string;
  /** Nombre para el público: "Zona 1" (por su puesto) o "Zona sin datos suficientes". */
  label: string;
  status: CellStatus;
  /** "Revisar primero", "Revisar después", "Sin prioridad de revisión", "Datos insuficientes". */
  statusLabel: string;
  /** Puesto en el orden de revisión sugerido. `null` si no hay calidad suficiente. */
  rank: number | null;
  /** 0..1, derivado de score_bp. `null` si el bundle no lo trae. */
  score: number | null;
  sufficientQuality: boolean;
  /** Porcentajes (0..100) y decibelios, ya convertidos desde enteros del contrato. */
  valid: number;
  changed: number;
  magnitude: number;
  increased: number;
  decreased: number;
  /** Contraste con OPERA DSWx-S1, en español. */
  water: string;
  /** Kilómetros de vía cerca del cambio. */
  roads: number;
  /** Explicación en español, redactada desde los campos numéricos. */
  explanation: string;
  /** Acción publicada en el bloque `action`, en español. `null` si no tiene. */
  action: string | null;
  center: [number, number];
  /** Los cuatro bloques firmados: cambio, contexto, riesgo y acción, en ese orden. */
  chain: [EvidenceLink, EvidenceLink, EvidenceLink, EvidenceLink];
}

export interface ExplorerData extends Omit<LoadedBundle, "cells"> {
  boundary: [number, number, number, number];
  mode: "verified" | "simulated";
  aoiId: string;
  aoiName: string;
  /** Todas las celdas, en el orden del bundle. */
  cells: ExplorerCell[];
  /** Solo las celdas con puesto, ordenadas por `rank` ascendente (1 primero). */
  ranked: ExplorerCell[];
  before: { date: string; label: string };
  after: { date: string; label: string };
  /** [oeste, sur, este, norte] */
  bounds: [number, number, number, number];
  /** Esquinas de los overlays, en el orden que pide MapLibre. */
  coordinates: [OverlayCorner, OverlayCorner, OverlayCorner, OverlayCorner];
  /** URLs blob de los PNG verificados. */
  overlays: LoadedBundle["overlays"];
  compatible: boolean;
  /** Polígonos de celda con `id`, `status` y `rank` en properties. */
  grid: FeatureCollection<Polygon>;
  /** roads.geojson del bundle, tal cual. */
  roads: unknown;
}

const pct = (bp: number): number => bp / 100;
/**
 * Metros → kilómetros con una décima, redondeando la mitad al par, que es como
 * redondea el pipeline al escribir el texto firmado (2150 m → "2.2", 50 m → "0.0").
 * Se hace con enteros para no depender del redondeo de coma flotante.
 */
const kmNum = (metres: number): number => {
  let tenths = Math.floor(metres / 100);
  const rest = metres % 100;
  if (rest > 50 || (rest === 50 && tenths % 2 === 1)) tenths += 1;
  return tenths / 10;
};

function operaLabel(cell: BundleCell): string {
  const overlap = pct(cell.metrics.operaOverlapBp);
  switch (cell.metrics.operaStatus) {
    case "corroborated": return `Water overlap found: ${overlap}%`;
    case "not_corroborated": return `Water overlap below the threshold: ${overlap}%`;
    case "unavailable": return "No matching Sentinel-1 image is available";
    default: return cell.metrics.operaStatus || "No data";
  }
}

/** Centro aproximado del polígono de la celda; cae al centro del AOI si no hay geometría. */
function centreOf(cell: BundleCell, fallback: [number, number]): [number, number] {
  const ring = cell.geometry?.coordinates[0];
  if (!ring || ring.length === 0) return fallback;
  const sum = ring.reduce<[number, number]>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
}

export function toExplorer(c: LoadedBundle): ExplorerData {
  const [west, south, east, north] = c.manifest.bboxWgs84;
  const centre: [number, number] = [(west + east) / 2, (south + north) / 2];
  const actions = new Map(c.actions.map((a) => [a.cellId, a]));

  const cells: ExplorerCell[] = c.cells.map((cell) => {
    const action = actions.get(cell.cellId);
    const m = cell.metrics;
    const water = operaLabel(cell);
    const rank = cell.status === "insufficient_quality" ? null : cell.rank;
    return {
      ...cell,
      signedExplanation: cell.explanation,
      id: cell.cellId,
      label: rank === null ? "Unranked cell" : `Zone ${rank}`,
      status: cell.status,
      statusLabel: englishStatus(cell.status),
      rank,
      score: cell.status === "insufficient_quality" || cell.scoreBp === null ? null : cell.scoreBp / 10000,
      sufficientQuality: cell.status !== "insufficient_quality",
      valid: pct(m.validBp),
      changed: pct(m.changedBp),
      magnitude: m.p90AbsDeltaCdb / 100,
      increased: pct(m.increaseBp),
      decreased: pct(m.decreaseBp),
      water,
      roads: kmNum(m.roadMNearChange),
      explanation: cell.explanation.join(" "),
      action: action ? englishAction(action.action) : null,
      center: centreOf(cell, centre),
      chain: [
        {
          type: "change",
          title: "What changed",
          summary: `${pct(m.changedBp)}% of this cell changed between the two NISAR observations`,
          block: c.signedBlocks.change,
        },
        {
          type: "context",
          title: "Water and roads nearby",
          summary: `Sentinel-1 water context: ${water}`,
          block: c.signedBlocks.context,
        },
        {
          type: "risk",
          title: "Review priority",
          summary:
            rank === null
              ? "Not ranked"
              : `Signed review rank: ${rank}`,
          block: c.signedBlocks.risk[cell.cellId] ?? null,
        },
        {
          type: "action",
          title: "Suggested action",
          summary: action
            ? englishAction(action.action)
            : "No action was published for this cell",
          block: c.signedBlocks.action[cell.cellId] ?? null,
        },
      ],
    };
  });

  return {
    ...c,
    boundary: c.manifest.bboxWgs84,
    mode: c.dataOrigin === "simulated" ? "simulated" : "verified",
    aoiId: c.aoiId,
    aoiName: areaName(c) + (c.aoiId === "tailandia-01" ? " · method validation" : ""),
    cells,
    ranked: cells
      .filter((cell) => cell.rank !== null)
      .sort((a, b) => (a.rank as number) - (b.rank as number)),
    before: { date: c.t1, label: "Before (t1)" },
    after: { date: c.t2, label: "After (t2)" },
    bounds: [west, south, east, north],
    coordinates: c.overlays.bounds,
    overlays: c.overlays,
    compatible: c.manifest.comparable,
    grid: {
      type: "FeatureCollection",
      features: c.cells
        .filter((cell) => cell.geometry !== null)
        .map((cell) => ({
          type: "Feature" as const,
          properties: { id: cell.cellId, status: cell.status, rank: cell.rank },
          geometry: cell.geometry as Polygon,
        })),
    },
    roads: c.roadsGeoJson,
  };
}
