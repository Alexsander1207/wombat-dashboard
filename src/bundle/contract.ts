/**
 * BundleContract — el único lugar que conoce el formato wire.
 *
 * Responsabilidades:
 * 1. Leer index.json y aplicar la puerta de versión (contract_version major == 1).
 * 2. Leer todos los archivos y verificar sha256 contra index.json.
 * 3. Verificar bloques WONB: hash canónico, firma Ed25519, cadena de padres,
 *    emisores de confianza, TTL contra index.generated_at.
 * 4. Decodificar a LoadedBundle (tipos internos de la app).
 *
 * data_origin, t1 y t2 se toman del bloque `change` FIRMADO, nunca del
 * manifest.json. El manifest solo aporta datos descriptivos. Si discrepan,
 * se genera un integrityWarning.
 *
 * `readBytes` se inyecta para permitir pruebas sin servidor HTTP.
 */

import {
  verifyFileHashes,
  verifyBlocks,
  verifyChain,
  verifyIssuers,
  isExpired,
  type BundleIndex,
} from "../verify/bundle.ts";
import type { WonbBlock } from "../verify/wonb.ts";
import type {
  BundleCell,
  BundleAction,
  BundleManifest,
  BundleOverlays,
} from "./types.ts";
import { BundleContractError, type LoadedBundle } from "./types.ts";

export type { LoadedBundle } from "./types.ts";

type ReadBytes = (path: string) => Promise<Uint8Array>;

async function defaultReadBytes(base: string): Promise<ReadBytes> {
  return async (path: string): Promise<Uint8Array> => {
    const response = await fetch(`${base}/${path}`, { cache: "no-store" });
    if (!response.ok) {
      throw new BundleContractError(
        `No se pudo leer ${path} (HTTP ${response.status})`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  };
}

function jsonOf<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder("utf-8").decode(bytes)) as T;
}

function checkContractVersion(index: BundleIndex): void {
  const major = Number(index.contract_version.split(".")[0]);
  if (major !== 1) {
    throw new BundleContractError(
      `contrato no soportado: ${index.contract_version}`,
      [`este dashboard solo soporta contract_version major 1`],
    );
  }
}

function decodeManifest(raw: unknown): BundleManifest {
  const m = raw as {
    aoi_name: string;
    bbox_wgs84: [number, number, number, number];
    nisar: {
      maturity: string;
      frame: string;
      orbit_direction: string;
      mode: string;
      frequency: string;
      pixel_spacing_m: number;
      t1: { granule: string; datetime: string };
      t2: { granule: string; datetime: string };
      comparable: boolean;
    };
    opera: {
      product: string;
      derived_from: string;
      status: string;
    };
    osm: { attribution: string };
    pipeline: { commit: string; risk_config_version: string };
  };
  return {
    aoiName: m.aoi_name,
    maturity: m.nisar.maturity,
    frame: m.nisar.frame,
    orbitDirection: m.nisar.orbit_direction,
    mode: m.nisar.mode,
    frequency: m.nisar.frequency,
    pixelSpacingM: m.nisar.pixel_spacing_m,
    t1Granule: m.nisar.t1.granule,
    t1Datetime: m.nisar.t1.datetime,
    t2Granule: m.nisar.t2.granule,
    t2Datetime: m.nisar.t2.datetime,
    comparable: m.nisar.comparable,
    operaProduct: m.opera.product,
    operaDerivedFrom: m.opera.derived_from,
    operaStatus: m.opera.status,
    osmAttribution: m.osm.attribution,
    pipelineCommit: m.pipeline.commit,
    riskConfigVersion: m.pipeline.risk_config_version,
    bboxWgs84: m.bbox_wgs84,
  };
}

function decodeOverlays(
  rawBounds: unknown,
  blobUrls: { t1: string; t2: string; delta: string },
): BundleOverlays {
  const b = rawBounds as { coordinates: unknown[] };
  const coords = b.coordinates as [number, number, number, number] | undefined;
  if (!coords || coords.length !== 4) {
    throw new BundleContractError("overlays/bounds.json malformado");
  }
  return {
    t1: blobUrls.t1,
    t2: blobUrls.t2,
    delta: blobUrls.delta,
    bounds: coords,
  };
}

function decodeCells(rawCells: unknown, risks: Map<string, unknown>): BundleCell[] {
  const features = (rawCells as { features: unknown[] }).features;
  return features.map((feature) => {
    const f = feature as {
      properties: Record<string, unknown>;
      geometry: { type: string; coordinates: unknown } | null;
    };
    const props = f.properties;
    const cellId = String(props.cell_id);
    const risk = risks.get(cellId);

    const geometry = f.geometry && f.geometry.type === "Polygon"
      ? (f.geometry as { type: "Polygon"; coordinates: number[][][] })
      : null;

    if (!risk) {
      return {
        cellId,
        status: "insufficient_quality",
        rank: null,
        scoreBp: null,
        geometry,
        componentsBp: { change: 0, opera: 0, road: 0 },
        metrics: {
          validBp: 0,
          decreaseBp: 0,
          increaseBp: 0,
          changedBp: 0,
          p90AbsDeltaCdb: 0,
          operaStatus: "",
          operaOverlapBp: 0,
          roadMNearChange: 0,
          roadMTotal: 0,
        },
        explanation: [],
      };
    }

    const rp = risk as {
      status: string;
      rank: number | null;
      score_bp: number | null;
      components_bp: { change: number; opera: number; road: number };
      metrics: {
        valid_bp: number;
        decrease_bp: number;
        increase_bp: number;
        changed_bp: number;
        p90_abs_delta_cdb: number;
        opera_status: string;
        opera_overlap_bp: number;
        road_m_near_change: number;
        road_m_total: number;
      };
      explanation: string[];
    };

    return {
      cellId,
      status: rp.status as CellStatus,
      rank: rp.rank,
      scoreBp: rp.score_bp,
      geometry,
      componentsBp: rp.components_bp,
      metrics: {
        validBp: rp.metrics.valid_bp,
        decreaseBp: rp.metrics.decrease_bp,
        increaseBp: rp.metrics.increase_bp,
        changedBp: rp.metrics.changed_bp,
        p90AbsDeltaCdb: rp.metrics.p90_abs_delta_cdb,
        operaStatus: rp.metrics.opera_status,
        operaOverlapBp: rp.metrics.opera_overlap_bp,
        roadMNearChange: rp.metrics.road_m_near_change,
        roadMTotal: rp.metrics.road_m_total,
      },
      explanation: rp.explanation,
    };
  });
}

function decodeActions(rawActions: unknown[]): BundleAction[] {
  return rawActions
    .map((a) => {
      const ap = a as {
        cell_id: string;
        rank: number;
        action: string;
        audience: string;
      };
      return {
        cellId: ap.cell_id,
        rank: ap.rank,
        action: ap.action,
        audience: ap.audience,
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

type CellStatus = "review_high" | "review_medium" | "review_low" | "insufficient_quality";

/**
 * Descarga, verifica y decodifica un bundle. Este es el único punto de
 * contacto con el formato wire. La UI nunca llama a las funciones de
 * verify directamente.
 *
 * @param baseUrl o ruta base donde está index.json
 * @param trustedIssuers emisores de confianza (claves públicas + roles)
 * @param readBytes función para leer bytes de un archivo (por defecto usa fetch)
 */
export async function loadAndVerify(
  baseUrl: string,
  trustedIssuers: { issuer: string; roles: string[] }[],
  readBytes?: ReadBytes,
): Promise<LoadedBundle> {
  const base = baseUrl.replace(/\/$/, "");
  const read = readBytes ?? (await defaultReadBytes(base));

  // ── 1. index.json + puerta de versión ──────────────────────────────
  const indexBytes = await read("index.json");
  const index = jsonOf<BundleIndex>(indexBytes);
  checkContractVersion(index);

  // ── 2. sha256 de cada archivo ──────────────────────────────────────
  const files = await verifyFileHashes(index, read);
  if (!files.ok) {
    throw new BundleContractError(
      `Integridad del bundle comprometida: ${files.failures.length} de ${files.checks.length} archivo(s) no coinciden`,
      files.failures.map((f) => `${f.path}: sha256 no coincide con index.json`),
    );
  }

  // ── 3. Parsear archivos (solo después de verificar bytes) ──────────
  const manifestRaw = jsonOf<unknown>(await read("manifest.json"));
  const cellsRaw = jsonOf<unknown>(await read("cells.geojson"));
  const boundsRaw = jsonOf<unknown>(await read("overlays/bounds.json"));
  const roadsRaw = jsonOf<unknown>(await read("roads.geojson"));

  const blockPaths = index.files
    .map((f) => f.path)
    .filter((p) => p.startsWith("wonb/") && p.endsWith(".json"))
    .sort();
  const blocks = await Promise.all(
    blockPaths.map(async (path) => ({
      path,
      block: jsonOf<WonbBlock>(await read(path)),
    })),
  );

  // ── 4. Verificar bloques (hash + firma) ────────────────────────────
  const verdicts = verifyBlocks(blocks);
  if (!verdicts.ok) {
    throw new BundleContractError(
      `${verdicts.failures.length} bloque(s) no verifican (hash o firma)`,
      verdicts.failures.map(
        (f) => `${f.path}: hash_ok=${f.hashOk} signature_ok=${f.signatureOk}`,
      ),
    );
  }

  // ── 5. Cadena de padres ────────────────────────────────────────────
  const chain = verifyChain(blocks);
  if (chain.length > 0) {
    throw new BundleContractError("cadena de bloques incompleta", chain);
  }

  // ── 6. Emisores de confianza (pinneados, no del bundle) ────────────
  const trusted = {
    version: 1,
    issuers: trustedIssuers.map((i) => ({
      issuer: i.issuer,
      name: "pinneado desde dashboard.config.json",
      roles: i.roles,
    })),
  };
  const issuerProblems = verifyIssuers(blocks, trusted);
  if (issuerProblems.length > 0) {
    throw new BundleContractError("emisores no autorizados", issuerProblems);
  }

  // ── 7. TTL contra index.generated_at (instantánea) ─────────────────
  const asOf = new Date(index.generated_at);
  const expired = blocks.filter(({ block }) => isExpired(block, asOf));
  const ttlOk = expired.length === 0;

  const problems: string[] = [];
  if (!ttlOk) {
    problems.push(...expired.map(({ path, block }) =>
      `${path}: fuera de TTL (valid_until ${block.valid_until})`,
    ));
  }

  // ── 8. Decodificar payloads ────────────────────────────────────────
  const changeBlocks = blocks.filter(({ block }) => block.type === "change");
  const riskBlocks = blocks.filter(({ block }) => block.type === "risk");
  const actionBlocks = blocks.filter(({ block }) => block.type === "action");

  if (changeBlocks.length === 0) {
    throw new BundleContractError("el bundle no trae bloque change");
  }

  const change = changeBlocks[0].block.payload as {
    aoi_id: string;
    data_origin: string;
    t1: string;
    t2: string;
  };

  const risks = new Map<string, unknown>();
  for (const rb of riskBlocks) {
    const p = rb.block.payload as { cell_id: string };
    risks.set(p.cell_id, rb.block.payload);
  }

  // ── 9. Integridad: manifest vs change (data_origin) ────────────────
  const manifestDataOrigin = (manifestRaw as { data_origin?: string })
    .data_origin;
  let integrityWarning: string | null = null;
  if (manifestDataOrigin && manifestDataOrigin !== change.data_origin) {
    integrityWarning = `data_origin del manifiesto (${manifestDataOrigin}) ` +
      `no coincide con el bloque change firmado (${change.data_origin})`;
  }

  // ── 10. Overlays (blobs sobre bytes verificados) ───────────────────
  const [t1Blob, t2Blob, deltaBlob] = await Promise.all([
    read("overlays/t1.png"),
    read("overlays/t2.png"),
    read("overlays/delta.png"),
  ]);
  const blobUrls = {
    t1: URL.createObjectURL(new Blob([t1Blob], { type: "image/png" })),
    t2: URL.createObjectURL(new Blob([t2Blob], { type: "image/png" })),
    delta: URL.createObjectURL(new Blob([deltaBlob], { type: "image/png" })),
  };

  const overlays = decodeOverlays(boundsRaw, blobUrls);

  // ── 11. Ensamblar LoadedBundle ─────────────────────────────────────
  return {
    aoiId: index.aoi_id,
    bundleVersion: index.bundle_version,
    contractVersion: index.contract_version,
    dataOrigin: change.data_origin,
    t1: change.t1,
    t2: change.t2,
    integrityWarning,
    cells: decodeCells(cellsRaw, risks),
    roadsGeoJson: roadsRaw,
    overlays,
    manifest: decodeManifest(manifestRaw),
    actions: decodeActions(
      actionBlocks.map((ab) => ab.block.payload),
    ),
    verification: {
      filesChecked: files.checks.length,
      filesOk: files.ok,
      blocksChecked: verdicts.checks.length,
      blocksOk: verdicts.ok,
      chainOk: chain.length === 0,
      issuersOk: issuerProblems.length === 0,
      ttlOk,
      asOf: index.generated_at,
      problems,
    },
  };
}

/** Libera los blobs de overlay cuando se descarta un bundle. */
export function releaseBundle(bundle: LoadedBundle): void {
  for (const url of [
    bundle.overlays.t1,
    bundle.overlays.t2,
    bundle.overlays.delta,
  ]) {
    URL.revokeObjectURL(url);
  }
}
