/**
 * Presentación de los enteros del contrato.
 *
 * El contrato no manda floats (R16): los porcentajes vienen en puntos base
 * (0–10000) y los decibelios en centi-decibelios. Acá se convierten a texto
 * para la pantalla, y en ningún otro sitio.
 *
 * La conversión se hace con aritmética entera a propósito. `7636 / 100` en
 * coma flotante no es exactamente 76.36, y aunque `toFixed(2)` lo disimule,
 * sería gratuito introducir un float justo en la capa que existe para no
 * tenerlos. Dividir con `trunc` y `%` da el dígito exacto, siempre.
 */

/** Un entero que representa centésimas → texto decimal exacto. */
function fromHundredths(value: number, decimals: 1 | 2): string {
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const whole = Math.trunc(magnitude / 100);
  const hundredths = magnitude % 100;
  const sign = negative ? "-" : "";

  if (decimals === 2) {
    return `${sign}${whole},${String(hundredths).padStart(2, "0")}`;
  }
  // Una décima: se redondea la centésima al vecino más cercano, mitad arriba.
  const tenths = Math.trunc((hundredths + 5) / 10);
  return tenths === 10 ? `${sign}${whole + 1},0` : `${sign}${whole},${tenths}`;
}

/** Formatea cualquier número o texto decimal con coma. */
export function formatDecimal(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(".", ",");
}

/** Puntos base → porcentaje. 7636 → "76,36 %". */
export function percentFromBp(bp: number): string {
  return `${fromHundredths(bp, 2)} %`;
}

/** Puntos base → porcentaje corto, para etiquetas. 7636 → "76 %". */
export function roundPercentFromBp(bp: number): string {
  return `${Math.trunc((bp + 50) / 100)} %`;
}

/** Centi-decibelios → decibelios. 560 → "5,6 dB". */
export function decibelsFromCdb(cdb: number): string {
  return `${fromHundredths(cdb, 1)} dB`;
}

/** Metros → kilómetros con una décima. 16242 → "16,2 km". */
export function kilometresFromMetres(metres: number): string {
  const whole = Math.trunc(metres / 1000);
  const tenths = Math.trunc((metres % 1000) / 100);
  return `${whole},${tenths} km`;
}

/** Metros, tal cual, cuando la escala es pequeña. 300 → "300 m". */
export function metres(value: number): string {
  return `${value} m`;
}

/**
 * El score de una celda, listo para mostrar.
 *
 * Regla 4: cuando `status` es `insufficient_quality` el score es `null`, y eso
 * se dice con palabras. Mostrar "0 %" sería afirmar que no hay riesgo, cuando
 * lo que pasa es que no se puede afirmar nada.
 */
export function scoreLabel(scoreBp: number | null): string {
  return scoreBp === null ? "datos insuficientes" : percentFromBp(scoreBp);
}

/** El puesto de una celda, o la ausencia de puesto. */
export function rankLabel(rank: number | null): string {
  return rank === null ? "sin puesto" : `#${rank}`;
}

/**
 * Nombre del estado en lenguaje de PREPARACIÓN, no de alerta (regla 5).
 *
 * No dice "peligro alto" ni "riesgo crítico". Una anomalía de deformación
 * superficial no confirma ni predice un deslizamiento: lo que el producto
 * puede ofrecer honestamente es un orden en el que mirar, no un pronóstico.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case "review_high":
      return "Revisar primero";
    case "review_medium":
      return "Revisar después";
    case "review_low":
      return "Sin prioridad de revisión";
    case "insufficient_quality":
      return "Datos insuficientes";
    default:
      return status;
  }
}

/** Una línea corta que explica qué significa el estado, en el mismo registro. */
export function statusHint(status: string): string {
  switch (status) {
    case "review_high":
      return "Encabeza el orden de revisión sugerido.";
    case "review_medium":
      return "Conviene revisarla tras las de prioridad alta.";
    case "review_low":
      return "No destaca sobre el resto del área.";
    case "insufficient_quality":
      return "La calidad del dato no permite ordenarla. No es un cero.";
    default:
      return "";
  }
}

/** La acción publicada en el bloque `action`, en castellano. */
export function actionLabel(action: string): string {
  switch (action) {
    case "field_verification_first":
      return "Verificación en campo, primero";
    case "field_verification":
      return "Verificación en campo";
    case "monitor":
      return "Seguimiento";
    default:
      return action;
  }
}

/** Una fecha ISO del contrato → algo legible, en UTC para no mover el dato. */
export function readableDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-PE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Fecha y hora ISO → legible, en UTC y diciéndolo. */
export function readableDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const text = date.toLocaleString("es-PE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${text} UTC`;
}

/** Días entre dos instantes ISO, para el intervalo t1 → t2. */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}
