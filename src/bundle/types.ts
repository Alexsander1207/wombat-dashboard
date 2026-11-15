/**
 * Tipos internos de la app. La UI consume exclusivamente LoadedBundle;
 * nunca toca el formato wire (index.json, bloques WONB, etc.).
 *
 * El único sitio que conoce el wire es src/bundle/contract.ts (BundleContract).
 */

import type { CellStatus } from "../contract/types.ts";

/** Resultado de la verificación del bundle. */
export interface BundleVerification {
  filesChecked: number;
  filesOk: boolean;
  blocksChecked: number;
  blocksOk: boolean;
  chainOk: boolean;
  issuersOk: boolean;
  ttlOk: boolean;
  /** Instante contra el que se evaluó el TTL: index.generated_at (instantánea). */
  asOf: string;
  problems: string[];
}

/** Datos descriptivos del manifiesto (no firman lo que se muestra). */
export interface BundleManifest {
  aoiName: string;
  maturity: string;
  frame: string;
  orbitDirection: string;
  mode: string;
  frequency: string;
  pixelSpacingM: number;
  t1Granule: string;
  t1Datetime: string;
  t2Granule: string;
  t2Datetime: string;
  comparable: boolean;
  operaProduct: string;
  operaDerivedFrom: string;
  operaStatus: string;
  osmAttribution: string;
  pipelineCommit: string;
  riskConfigVersion: string;
  /** [west, south, east, north] para ajustar el mapa. */
  bboxWgs84: [number, number, number, number];
}

/** Una esquina del overlay en WGS84: [lon, lat]. */
export type OverlayCorner = [number, number];

/** Overlays listos para el mapa (blobs de bytes ya verificados). */
export interface BundleOverlays {
  t1: string;
  t2: string;
  delta: string;
  /**
   * Las CUATRO ESQUINAS de la imagen, en el orden que declara
   * overlays/bounds.json: arriba-izquierda, arriba-derecha, abajo-derecha,
   * abajo-izquierda. Es el mismo orden que espera `coordinates` de una fuente
   * `image` de MapLibre, así que se pasa tal cual.
   *
   * NO es un bbox plano [oeste, sur, este, norte]: para eso está
   * `BundleManifest.bboxWgs84`. Confundirlos es lo que impedía que los tres
   * overlays se dibujaran.
   */
  bounds: [OverlayCorner, OverlayCorner, OverlayCorner, OverlayCorner];
}

/** Un registro de celda listo para la UI. */
export interface BundleCell {
  cellId: string;
  status: CellStatus;
  rank: number | null;
  scoreBp: number | null;
  /** Geometría del polígono (de cells.geojson). */
  geometry: { type: "Polygon"; coordinates: number[][][] } | null;
  componentsBp: {
    change: number;
    opera: number;
    road: number;
  };
  metrics: {
    validBp: number;
    decreaseBp: number;
    increaseBp: number;
    changedBp: number;
    p90AbsDeltaCdb: number;
    operaStatus: string;
    operaOverlapBp: number;
    roadMNearChange: number;
    roadMTotal: number;
  };
  explanation: string[];
}

/** Una acción publicada, ya ordenada por rank. */
export interface BundleAction {
  cellId: string;
  rank: number;
  action: string;
  audience: string;
}

/**
 * Un bloque WONB firmado, con el resultado REAL de su verificación.
 *
 * `hashOk` y `signatureOk` salen de verifyBlocks (src/verify), bloque por
 * bloque; no son constantes. `id` es el hash del bloque: "sha256:<hex>".
 */
export interface SignedBlockRef {
  type: "change" | "context" | "risk" | "action";
  id: string;
  path: string;
  issuer: string;
  issuedAt: string;
  validUntil: string | null;
  hashOk: boolean;
  signatureOk: boolean;
  /** Dentro de TTL, evaluado contra la instantánea (index.generated_at). */
  withinTtl: boolean;
}

/**
 * Los bloques firmados del bundle, indexados para armar la cadena de
 * evidencia de una celda: `change` y `context` son del AOI entero; `risk` y
 * `action` se buscan por cell_id. Solo las celdas con acción publicada tienen
 * bloque `action`.
 */
export interface SignedBlocks {
  change: SignedBlockRef;
  context: SignedBlockRef | null;
  risk: Record<string, SignedBlockRef>;
  action: Record<string, SignedBlockRef>;
}

/**
 * Umbrales de risk-config.json (archivo cubierto por el sha256 de index.json).
 * Solo se usan para redactar la explicación en español; no recalculan nada.
 */
export interface RiskConfig {
  deltaDbThreshold: number;
  minValidPercent: number;
  corroborationPercent: number;
  roadBufferM: number;
  operaMaxGapDays: number;
}

/** Contrato interno: todo lo que la UI necesita, verificado y decodificado. */
export interface LoadedBundle {
  aoiId: string;
  bundleVersion: string;
  contractVersion: string;
  /** Del bloque change FIRMADO (no del manifest). */
  dataOrigin: string;
  /** Del bloque change FIRMADO. */
  t1: string;
  /** Del bloque change FIRMADO. */
  t2: string;
  /** Si data_origin del manifest discrepa del cambio, este aviso se muestra. */
  integrityWarning: string | null;
  cells: BundleCell[];
  roadsGeoJson: unknown;
  overlays: BundleOverlays;
  manifest: BundleManifest;
  actions: BundleAction[];
  /** Bloques firmados con su hash y su estado de firma, para la cadena de evidencia. */
  signedBlocks: SignedBlocks;
  /** `null` si el bundle no trae risk-config.json. */
  riskConfig: RiskConfig | null;
  verification: BundleVerification;
}

/** Error de integridad del bundle. */
export class BundleContractError extends Error {
  readonly problems: string[];

  constructor(message: string, problems: string[] = []) {
    super(message);
    this.name = "BundleContractError";
    this.problems = problems;
  }
}
