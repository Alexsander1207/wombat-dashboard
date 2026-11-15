/**
 * Los tipos del contrato v1, tal como llegan en el bundle.
 *
 * Están escritos para LEER, no para calcular. Fijate que no hay ningún campo
 * `score` en float ni ningún `percent`: el contrato manda enteros (R16) y
 * convertirlos es cosa de la capa de presentación, no de los datos.
 */

/** Estado publicado de una celda. No se deriva: viene firmado. */
export type CellStatus = "review_high" | "review_medium" | "review_low" | "insufficient_quality";

/**
 * El payload de un bloque `risk`: lo único que manda sobre una celda.
 *
 * `rank` y `score_bp` son `null` cuando `status` es `insufficient_quality`.
 * No son 0: el 0 sería una afirmación sobre el riesgo, y acá justamente no se
 * puede afirmar nada (regla 4).
 */
export interface RiskPayload {
  cell_id: string;
  status: CellStatus;
  rank: number | null;
  score_bp: number | null;
  components_bp: {
    change: number;
    opera: number;
    road: number;
  };
  metrics: {
    valid_bp: number;
    decrease_bp: number;
    increase_bp: number;
    changed_bp: number;
    /** Centi-decibelios: 560 son 5.6 dB. */
    p90_abs_delta_cdb: number;
    opera_status: string;
    opera_overlap_bp: number;
    road_m_near_change: number;
    road_m_total: number;
  };
  explanation: string[];
}

/** El payload de un bloque `action`: el top 3 publicado, con su acción. */
export interface ActionPayload {
  cell_id: string;
  rank: number;
  action: string;
  audience: string;
}

/** El payload del bloque `change`: el cambio a escala de AOI. */
export interface ChangePayload {
  aoi_id: string;
  data_origin: string;
  t1: string;
  t2: string;
  polarization: string;
  frequency: string;
  pixel_spacing_m: number;
  delta_db_threshold_cdb: number;
  aoi_valid_bp: number;
  aoi_decrease_bp: number;
  aoi_increase_bp: number;
  overlay_sha256: Record<string, string>;
  cells_geojson_sha256: string;
}

/** El payload del bloque `context`: lo que aporta OSM. */
export interface ContextPayload {
  aoi_id: string;
  roads_total_m: number;
  road_buffer_m: number;
  osm_retrieved_at: string;
  roads_geojson_sha256: string;
}

/** manifest.json: la procedencia y la madurez de los datos. */
export interface Manifest {
  aoi_id: string;
  aoi_name: string;
  data_origin: string;
  crs_compute: string;
  bbox_wgs84: [number, number, number, number];
  nisar: {
    product: string;
    maturity: string;
    frame: string;
    orbit_direction: string;
    mode: string;
    frequency: string;
    polarization: string;
    pixel_spacing_m: number;
    t1: { granule: string; datetime: string };
    t2: { granule: string; datetime: string };
    comparable: boolean;
    comparable_checks: Record<string, boolean>;
  };
  opera: {
    product: string;
    /** Sentinel-1. El contrato lo declara y la UI tiene que mostrarlo (regla 5). */
    derived_from: string;
    status: string;
    t1: { granules: string[]; gap_days: number };
    t2: { granules: string[]; gap_days: number };
  };
  osm: {
    query: string;
    retrieved_at: string;
    /** © OpenStreetMap contributors. Atribución obligatoria. */
    attribution: string;
  };
  pipeline: {
    commit: string;
    risk_config_version: string;
  };
}

/** overlays/bounds.json: las 4 esquinas de la imagen, en orden. */
export interface OverlayBounds {
  crs: string;
  /** top-left, top-right, bottom-right, bottom-left. */
  coordinates: [number, number][];
  order: string;
}

/** Las propiedades de una celda en cells.geojson. */
export interface CellFeatureProperties {
  cell_id: string;
  [key: string]: unknown;
}

export interface CellsGeoJson {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: CellFeatureProperties;
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }[];
}
