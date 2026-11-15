/**
 * Puente entre el bundle verificado y el Explorer de Mireya/Ximena.
 *
 * Lo escribió el equipo de verificación como punto de partida: devuelve datos
 * mínimos y compila. Mireya y Ximena lo completan con los campos que su UI
 * necesite. Ver docs/INTEGRACION-UI.md para el mapeo campo a campo.
 *
 * Regla: este adaptador SOLO traduce. No recalcula puntajes, no reordena el
 * ranking y no inventa valores donde el bundle no los trae.
 */
import type { LoadedBundle } from "../bundle/contract.ts";

/** Forma mínima que consume el Explorer. Equivale a su `ExplorerBundle`. */
export interface ExplorerCell {
  id: string;
  rank: number | null;
  /** 0..1, derivado de score_bp. `null` si el bundle no lo trae. */
  score: number | null;
  quality: string;
  valid: number;
  changed: number;
  magnitude: number;
  increased: number;
  decreased: number;
  water: string;
  /** Kilómetros de vía cerca del cambio. */
  roads: number;
  explanation: string;
  center: [number, number];
}

export interface ExplorerData {
  mode: "verified" | "simulated";
  cells: ExplorerCell[];
  before: { date: string; label: string };
  after: { date: string; label: string };
  boundary: [number, number, number, number];
  initialView: { center: [number, number]; zoom: number };
  compatible: boolean;
}

/** Centro aproximado del polígono de la celda; cae al centro del AOI si no hay geometría. */
function centreOf(cell: LoadedBundle["cells"][number], fallback: [number, number]): [number, number] {
  const ring = cell.geometry?.coordinates[0];
  if (!ring || ring.length === 0) return fallback;
  const sum = ring.reduce<[number, number]>((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / ring.length, sum[1] / ring.length];
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
