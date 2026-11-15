/**
 * Carga del bundle en el navegador: verificar primero, usar después.
 *
 * Regla 2 del encargo, al pie de la letra. Se descargan los bytes de TODOS los
 * archivos listados en index.json, se comprueba el sha256 de cada uno, y solo
 * si todos cuadran se parsea algo. Si uno falla, no se carga nada y el error
 * dice qué archivo y qué hash se esperaba.
 *
 * Las imágenes de overlay se sirven al mapa como blobs construidos a partir de
 * ESOS MISMOS bytes verificados, no con una segunda petición a la URL. Pedirlas
 * otra vez abriría una ventana —pequeña, pero real— en la que el mapa podría
 * pintar bytes distintos de los que se verificaron.
 */
import {
  isExpired,
  verifyBlocks,
  verifyChain,
  verifyFileHashes,
  verifyIssuers,
  type BundleIndex,
  type FileCheck,
  type TrustedIssuers,
} from "../verify/bundle.ts";
import type { WonbBlock } from "../verify/wonb.ts";
import type {
  ActionPayload,
  CellsGeoJson,
  ChangePayload,
  ContextPayload,
  Manifest,
  OverlayBounds,
  RiskPayload,
} from "../contract/types.ts";

/** Qué se comprobó y cómo salió. La UI lo muestra tal cual (entregable c). */
export interface VerificationSummary {
  filesChecked: number;
  filesOk: boolean;
  blocksChecked: number;
  blocksOk: boolean;
  chainOk: boolean;
  issuersOk: boolean;
  ttlOk: boolean;
  /** El instante contra el que se evaluó el TTL: la instantánea, no "ahora". */
  asOf: string;
  problems: string[];
}

export interface VerifiedBundle {
  index: BundleIndex;
  manifest: Manifest;
  cells: CellsGeoJson;
  /** Los payloads `risk`, por cell_id. La única fuente de rank/score/status. */
  risks: Map<string, RiskPayload>;
  /** Los bloques `action`: el top publicado, en el orden que ellos declaran. */
  actions: ActionPayload[];
  change: ChangePayload;
  context: ContextPayload;
  bounds: OverlayBounds;
  /** URLs de blob sobre los bytes ya verificados. */
  overlays: { t1: string; t2: string; delta: string };
  verification: VerificationSummary;
}

/** Un fallo de integridad. Lleva el detalle para poder mostrarlo en pantalla. */
export class BundleIntegrityError extends Error {
  readonly failures: FileCheck[];
  readonly problems: string[];

  constructor(message: string, failures: FileCheck[] = [], problems: string[] = []) {
    super(message);
    this.name = "BundleIntegrityError";
    this.failures = failures;
    this.problems = problems;
  }
}

const textOf = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes);
const jsonOf = <T>(bytes: Uint8Array): T => JSON.parse(textOf(bytes)) as T;

/**
 * Descarga y verifica el bundle servido en `baseUrl`.
 *
 * @param baseUrl ruta donde vive index.json, por ejemplo `/data/piura-demo/v0`
 */
export async function loadBundle(baseUrl: string): Promise<VerifiedBundle> {
  const base = baseUrl.replace(/\/$/, "");

  const indexResponse = await fetch(`${base}/index.json`, { cache: "no-store" });
  if (!indexResponse.ok) {
    throw new BundleIntegrityError(
      `No se pudo leer index.json (HTTP ${indexResponse.status}). ` +
        `¿Corriste \`npm run sync-data\`?`,
    );
  }
  const index = (await indexResponse.json()) as BundleIndex;

  // Un solo fetch por archivo: los bytes que se verifican son los que se usan.
  const bytesByPath = new Map<string, Uint8Array>();
  const fetchBytes = async (path: string): Promise<Uint8Array> => {
    const cached = bytesByPath.get(path);
    if (cached) return cached;
    const response = await fetch(`${base}/${path}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    bytesByPath.set(path, bytes);
    return bytes;
  };

  const files = await verifyFileHashes(index, fetchBytes);
  if (!files.ok) {
    const names = files.failures.map((f) => f.path).join(", ");
    throw new BundleIntegrityError(
      `Integridad del bundle comprometida: ${files.failures.length} de ` +
        `${files.checks.length} archivo(s) no coinciden con su sha256 en index.json (${names}). ` +
        `No se cargó ningún dato.`,
      files.failures,
    );
  }

  // Desde acá se parsea, y no antes.
  const bytes = (path: string): Uint8Array => {
    const found = bytesByPath.get(path);
    if (!found) throw new BundleIntegrityError(`falta ${path} tras la verificación`);
    return found;
  };

  const manifest = jsonOf<Manifest>(bytes("manifest.json"));
  const cells = jsonOf<CellsGeoJson>(bytes("cells.geojson"));
  const bounds = jsonOf<OverlayBounds>(bytes("overlays/bounds.json"));
  const trusted = jsonOf<TrustedIssuers>(bytes("trusted-issuers.json"));

  const blockPaths = index.files
    .map((f) => f.path)
    .filter((p) => p.startsWith("wonb/") && p.endsWith(".json"))
    .sort();
  const blocks = blockPaths.map((path) => ({ path, block: jsonOf<WonbBlock>(bytes(path)) }));

  const verdicts = verifyBlocks(blocks);
  const chain = verifyChain(blocks);
  const issuerProblems = verifyIssuers(blocks, trusted);

  // Regla 6: el TTL se mide contra index.generated_at, no contra el reloj.
  const asOf = new Date(index.generated_at);
  const expired = blocks.filter(({ block }) => isExpired(block, asOf));

  const problems = [
    ...verdicts.failures.map(
      (f) => `${f.path}: hash_ok=${f.hashOk} signature_ok=${f.signatureOk}`,
    ),
    ...chain,
    ...issuerProblems,
    ...expired.map(({ path, block }) => `${path}: fuera de TTL (valid_until ${block.valid_until})`),
  ];

  if (problems.length > 0) {
    throw new BundleIntegrityError(
      `El bundle no verifica: ${problems.length} problema(s) en hash, firma, cadena, ` +
        `emisores o TTL. No se cargó ningún dato.`,
      [],
      problems,
    );
  }

  const payloadsOfType = <T>(type: string): T[] =>
    blocks.filter(({ block }) => block.type === type).map(({ block }) => block.payload as T);

  const risks = new Map<string, RiskPayload>();
  for (const payload of payloadsOfType<RiskPayload>("risk")) {
    risks.set(payload.cell_id, payload);
  }

  // Se ordena por el `rank` PUBLICADO, que es leerlo, no recalcularlo. La regla
  // 1 prohíbe inventar un orden propio; respetar el que viene firmado es lo
  // contrario de eso.
  const actions = payloadsOfType<ActionPayload>("action").sort((a, b) => a.rank - b.rank);

  const [change] = payloadsOfType<ChangePayload>("change");
  const [context] = payloadsOfType<ContextPayload>("context");
  if (!change || !context) {
    throw new BundleIntegrityError("el bundle no trae bloque change o context");
  }

  const blobUrl = (path: string): string =>
    URL.createObjectURL(new Blob([bytes(path) as BlobPart], { type: "image/png" }));

  return {
    index,
    manifest,
    cells,
    risks,
    actions,
    change,
    context,
    bounds,
    overlays: {
      t1: blobUrl("overlays/t1.png"),
      t2: blobUrl("overlays/t2.png"),
      delta: blobUrl("overlays/delta.png"),
    },
    verification: {
      filesChecked: files.checks.length,
      filesOk: files.ok,
      blocksChecked: verdicts.checks.length,
      blocksOk: verdicts.ok,
      chainOk: chain.length === 0,
      issuersOk: issuerProblems.length === 0,
      ttlOk: expired.length === 0,
      asOf: index.generated_at,
      problems,
    },
  };
}

/** Libera los blobs de overlay cuando se descarta un bundle. */
export function releaseBundle(bundle: VerifiedBundle): void {
  for (const url of Object.values(bundle.overlays)) {
    URL.revokeObjectURL(url);
  }
}
