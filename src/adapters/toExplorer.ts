/**
 * Puente entre el bundle verificado y el Explorer de Mireya/Ximena.
 *
 * Regla: este adaptador SOLO traduce. No recalcula puntajes, no reordena el
 * ranking y no inventa valores donde el bundle no los trae.
 *
 * La explicación de cada celda viene en inglés DENTRO del bloque `risk`
 * firmado. Ese texto no se puede tocar (cambiaría el hash), así que acá se
 * redacta la misma frase en español a partir de los campos numéricos del
 * mismo bloque firmado y de los umbrales de risk-config.json.
 */
import type { FeatureCollection, Polygon } from "geojson";
import type { LoadedBundle } from "../bundle/contract.ts";
import type {
  BundleCell,
  OverlayCorner,
  RiskConfig,
  SignedBlockRef,
} from "../bundle/types.ts";
import type { CellStatus } from "../contract/types.ts";
import { actionLabel, statusLabel } from "../format.ts";

/**
 * Cuántas zonas del orden de revisión se destacan: marcadores numerados en el
 * mapa y lista de la barra lateral. Para un top 10, basta cambiar este número.
 */
export const TOP_COUNT = 3;

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
export interface ExplorerCell {
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

export interface ExplorerData {
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
  overlays: { t1: string; t2: string; delta: string };
  compatible: boolean;
  /** Polígonos de celda con `id`, `status` y `rank` en properties. */
  grid: FeatureCollection<Polygon>;
  /** roads.geojson del bundle, tal cual. */
  roads: unknown;
}

const pct = (bp: number): number => bp / 100;
const roundPct = (bp: number): number => Math.trunc((bp + 50) / 100);
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

const km = (metres: number): string => {
  let tenths = Math.floor(metres / 100);
  const rest = metres % 100;
  if (rest > 50 || (rest === 50 && tenths % 2 === 1)) tenths += 1;
  return `${Math.floor(tenths / 10)},${tenths % 10}`;
};

function operaLabel(cell: BundleCell): string {
  const overlap = roundPct(cell.metrics.operaOverlapBp);
  switch (cell.metrics.operaStatus) {
    case "corroborated":
      return `Sí: ve agua nueva en ${overlap} % de lo que cambió`;
    case "not_corroborated":
      return `No: solo ve agua nueva en ${overlap} % de lo que cambió`;
    case "unavailable":
      return "No hay imagen de otro satélite para comparar";
    default:
      return cell.metrics.operaStatus || "Sin dato";
  }
}

/**
 * La explicación en español. Reproduce, campo por campo, las frases que el
 * pipeline escribe en inglés en `payload.explanation` del bloque `risk`.
 */
export function explainInSpanish(cell: BundleCell, config: RiskConfig | null): string {
  const m = cell.metrics;
  if (cell.status === "insufficient_quality") {
    const minimum = config ? ` (hace falta al menos ${config.minValidPercent} %)` : "";
    return `Solo ${roundPct(m.validBp)} % de esta zona tiene imagen de radar utilizable${minimum}, así que queda fuera del orden de revisión. No significa que no haya cambios: significa que no se puede saber.`;
  }
  const db = config ? ` (${config.deltaDbThreshold} dB o más)` : "";
  const parts = [
    `Entre las dos pasadas del satélite, la señal de radar bajó con fuerza${db} en ${roundPct(m.decreaseBp)} % de la superficie observada de esta zona y subió en ${roundPct(m.increaseBp)} %.`,
  ];
  const overlap = roundPct(m.operaOverlapBp);
  if (m.operaStatus === "corroborated") {
    const threshold = config ? ` (se pide al menos ${config.corroborationPercent} %)` : "";
    parts.push(
      `Un segundo satélite lo respalda: Sentinel-1 (producto OPERA de la NASA) ve agua nueva en ${overlap} % de lo que cambió${threshold}.`,
    );
  } else if (m.operaStatus === "not_corroborated") {
    const threshold = config ? `, por debajo del ${config.corroborationPercent} % que se pide` : "";
    parts.push(
      `Un segundo satélite no lo respalda: Sentinel-1 (producto OPERA de la NASA) ve agua nueva en solo ${overlap} % de lo que cambió${threshold}.`,
    );
  } else if (m.operaStatus === "unavailable") {
    const gap = config ? ` a menos de ${config.operaMaxGapDays} días` : "";
    parts.push(
      `No hay imagen de un segundo satélite (Sentinel-1, producto OPERA)${gap} para comparar.`,
    );
  }
  const buffer = config ? `a menos de ${config.roadBufferM} m` : "cerca";
  parts.push(`Hay ${km(m.roadMNearChange)} km de caminos ${buffer} de lo que cambió.`);
  return parts.join(" ");
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
    return {
      id: cell.cellId,
      label: cell.rank === null ? "Zona sin datos suficientes" : `Zona ${cell.rank}`,
      status: cell.status,
      statusLabel: statusLabel(cell.status),
      rank: cell.rank,
      score: cell.scoreBp === null ? null : cell.scoreBp / 10000,
      sufficientQuality: cell.status !== "insufficient_quality",
      valid: pct(m.validBp),
      changed: pct(m.changedBp),
      magnitude: m.p90AbsDeltaCdb / 100,
      increased: pct(m.increaseBp),
      decreased: pct(m.decreaseBp),
      water,
      roads: kmNum(m.roadMNearChange),
      explanation: explainInSpanish(cell, c.riskConfig),
      action: action ? actionLabel(action.action) : null,
      center: centreOf(cell, centre),
      chain: [
        {
          type: "change",
          title: "Qué cambió",
          summary: `${pct(m.changedBp)} % de la zona cambió entre las dos pasadas del satélite NISAR`,
          block: c.signedBlocks.change,
        },
        {
          type: "context",
          title: "Qué hay alrededor (agua y caminos)",
          summary: `¿Lo confirma otro satélite? ${water}`,
          block: c.signedBlocks.context,
        },
        {
          type: "risk",
          title: "Qué prioridad tiene",
          summary:
            cell.rank === null
              ? "Sin puesto: no hay datos suficientes"
              : `Puesto ${cell.rank} en el orden de revisión sugerido`,
          block: c.signedBlocks.risk[cell.cellId] ?? null,
        },
        {
          type: "action",
          title: "Qué se recomienda",
          summary: action
            ? actionLabel(action.action)
            : "Sin recomendación publicada para esta zona",
          block: c.signedBlocks.action[cell.cellId] ?? null,
        },
      ],
    };
  });

  return {
    mode: c.dataOrigin === "simulated" ? "simulated" : "verified",
    aoiId: c.aoiId,
    aoiName: c.manifest.aoiName,
    cells,
    ranked: cells
      .filter((cell) => cell.rank !== null)
      .sort((a, b) => (a.rank as number) - (b.rank as number)),
    before: { date: c.t1, label: "Antes (t1)" },
    after: { date: c.t2, label: "Después (t2)" },
    bounds: [west, south, east, north],
    coordinates: c.overlays.bounds,
    overlays: { t1: c.overlays.t1, t2: c.overlays.t2, delta: c.overlays.delta },
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
