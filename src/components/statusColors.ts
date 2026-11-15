import type { CellStatus } from "../contract/types.ts";

/** Qué overlay se está mirando. */
export type OverlayKey = "t1" | "t2" | "delta";

/**
 * La rampa de color, en un solo sitio para que la leyenda no pueda discrepar
 * con el mapa.
 *
 * Es un solo tono (violeta), no un semáforo: el contrato publica un orden de
 * revisión, no niveles de alerta (regla 5).
 */
export const STATUS_COLORS: Record<CellStatus, string> = {
  review_high: "#6d28d9",
  review_medium: "#8b5cf6",
  review_low: "#c4b5fd",
  insufficient_quality: "#9ca3af",
};
