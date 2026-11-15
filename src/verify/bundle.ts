/**
 * Verificación a nivel de bundle: los bytes antes que los datos.
 *
 * Regla 2 del encargo: se comprueba el sha256 de cada archivo contra
 * index.json ANTES de usarlo. Un hash que no cuadra no es una advertencia que
 * se pueda ignorar y seguir pintando el mapa; es un "no cargo nada".
 */
// La extensión explícita no es cosmética: este módulo lo importa también
// scripts/sync-data.mjs con el Node de serie, y el ESM de Node no adivina
// extensiones. Requiere allowImportingTsExtensions en tsconfig.
import { sha256Hex, verifyBlock, type BlockVerdict, type WonbBlock } from "./wonb.ts";

/** Una entrada de index.json. */
export interface FileEntry {
  path: string;
  sha256: string;
}

/** index.json: la lista de bytes que el bundle promete. */
export interface BundleIndex {
  contract_version: string;
  bundle_version: string;
  aoi_id: string;
  data_origin: string;
  generated_at: string;
  core_commit: string;
  files: FileEntry[];
}

/** Cómo leer un archivo del bundle, sea desde fetch o desde el disco. */
export type ReadBytes = (path: string) => Promise<Uint8Array>;

export interface FileCheck {
  path: string;
  ok: boolean;
  /** Lo que decía index.json. */
  expected: string;
  /** Lo que salió de los bytes reales, o null si no se pudo leer. */
  actual: string | null;
  problem?: string;
}

export interface BundleFileReport {
  ok: boolean;
  checks: FileCheck[];
  get failures(): FileCheck[];
}

/**
 * Comprueba los bytes de cada archivo listado en index.json.
 *
 * No corta en el primer fallo a propósito: si alguien manipuló el bundle,
 * quien lo mire querrá saber CUÁNTOS archivos y cuáles, no solo el primero.
 */
export async function verifyFileHashes(
  index: BundleIndex,
  readBytes: ReadBytes,
  concurrency = 12,
): Promise<BundleFileReport> {
  const checks: FileCheck[] = new Array(index.files.length);
  const workerCount = Math.max(1, Math.min(index.files.length, Math.floor(concurrency)));
  let nextIndex = 0;

  // Pool acotado: evita el waterfall secuencial sin lanzar cientos de
  // solicitudes simultáneas. Los resultados conservan el orden del índice.
  const worker = async (): Promise<void> => {
    while (true) {
      const current = nextIndex++;
      if (current >= index.files.length) return;
      const entry = index.files[current];

      try {
        const bytes = await readBytes(entry.path);
        const actual = sha256Hex(bytes);
        checks[current] = {
          path: entry.path,
          ok: actual === entry.sha256,
          expected: entry.sha256,
          actual,
          ...(actual === entry.sha256 ? {} : { problem: "sha256 distinto al declarado en index.json" }),
        };
      } catch (cause) {
        checks[current] = {
          path: entry.path,
          ok: false,
          expected: entry.sha256,
          actual: null,
          problem: `no se pudo leer: ${String(cause)}`,
        };
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    ok: checks.every((c) => c.ok),
    checks,
    get failures() {
      return checks.filter((c) => !c.ok);
    },
  };
}

export interface BlockCheck extends BlockVerdict {
  path: string;
  id: string;
  type: string;
  ok: boolean;
}

export interface BundleBlockReport {
  ok: boolean;
  checks: BlockCheck[];
  get failures(): BlockCheck[];
}

/** Verifica hash y firma de cada bloque WONB del bundle. */
export function verifyBlocks(blocks: { path: string; block: WonbBlock }[]): BundleBlockReport {
  const checks: BlockCheck[] = blocks.map(({ path, block }) => {
    const verdict = verifyBlock(block);
    return {
      path,
      id: block.id,
      type: block.type,
      ok: verdict.hashOk && verdict.signatureOk,
      ...verdict,
    };
  });

  return {
    ok: checks.every((c) => c.ok),
    checks,
    get failures() {
      return checks.filter((c) => !c.ok);
    },
  };
}

/**
 * Comprueba que cada `parents` apunta a un bloque que existe en el bundle.
 *
 * Es la cadena de 7.4: un bloque risk cuelga del change y del context que lo
 * originaron. Un padre ausente significa que el bundle llegó incompleto.
 */
export function verifyChain(blocks: { path: string; block: WonbBlock }[]): string[] {
  const present = new Set(blocks.map(({ block }) => block.id));
  const problems: string[] = [];

  for (const { path, block } of blocks) {
    for (const parent of block.parents) {
      if (!present.has(parent)) {
        problems.push(`${path}: el padre ${parent.slice(0, 19)}… no está en el bundle`);
      }
    }
  }

  return problems;
}

/**
 * Comprueba el TTL de un bloque contra un instante dado.
 *
 * Regla 6: en modo estático el instante NO es "ahora", es
 * `index.generated_at`. Un bundle publicado es una FOTO: evaluarlo contra el
 * reloj de hoy marcaría como expirado todo lo que se publicó ayer, lo cual no
 * dice nada sobre su validez como evidencia histórica.
 */
export function isExpired(block: WonbBlock, asOf: Date): boolean {
  if (block.valid_until === null) return false;
  const issued = new Date(block.issued_at).getTime();
  const until = new Date(block.valid_until).getTime();
  const at = asOf.getTime();
  return !(issued <= at && at < until);
}

/** Emisores de confianza, con los tipos de bloque que cada uno puede firmar. */
export interface TrustedIssuers {
  version: number;
  issuers: { issuer: string; name: string; roles: string[] }[];
}

/** Comprueba que el emisor de cada bloque está autorizado para ESE tipo. */
export function verifyIssuers(
  blocks: { path: string; block: WonbBlock }[],
  trusted: TrustedIssuers,
): string[] {
  const roles = new Map(trusted.issuers.map((i) => [i.issuer, new Set(i.roles)]));
  const problems: string[] = [];

  for (const { path, block } of blocks) {
    const allowed = roles.get(block.issuer);
    if (!allowed) {
      problems.push(`${path}: emisor no confiable (${block.issuer.slice(0, 24)}…)`);
    } else if (!allowed.has(block.type)) {
      problems.push(`${path}: el emisor no tiene el rol "${block.type}"`);
    }
  }

  return problems;
}
