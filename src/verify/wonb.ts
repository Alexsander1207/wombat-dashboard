/**
 * Verificación de bloques WONB 0.2.
 *
 * Es el mismo enfoque que contracts/v1/tools/verify-js/verify.mjs del repo
 * Wombat-core, deliberadamente: JCS (RFC 8785) sobre el cuerpo sin `id` ni
 * `signature`, SHA-256 de esos bytes, y Ed25519 sobre el digest de 32 bytes.
 *
 * Este archivo corre TAL CUAL en el navegador y en Node (el script sync-data lo
 * importa). Una sola implementación: si el dashboard y el script discreparan,
 * uno de los dos estaría mintiendo.
 */
import * as ed from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { sha512 } from "@noble/hashes/sha512";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import canonicalize from "canonicalize";

// @noble/ed25519 v2 solo verifica de forma síncrona si se le inyecta sha512.
// Sin esto, `ed.verify` lanza en vez de devolver false, que es peor: un error
// de configuración se vería como un bloque corrupto.
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

/** Un bloque WONB tal como vive en disco. */
export interface WonbBlock {
  wonb_version: string;
  id: string;
  type: "change" | "context" | "risk" | "action";
  topic: string;
  issued_at: string;
  valid_until: string | null;
  issuer: string;
  parents: string[];
  payload: Record<string, unknown>;
  provenance: Record<string, unknown>;
  signature: string;
}

export interface BlockVerdict {
  /** El `id` declarado coincide con sha256(JCS(cuerpo)). */
  hashOk: boolean;
  /** La firma Ed25519 valida contra la clave pública del `issuer`. */
  signatureOk: boolean;
  /** Motivo, cuando algo no se pudo ni evaluar (hex inválido, clave rota). */
  error?: string;
}

/** `ed25519:<64 hex>` → los 32 bytes de la clave pública. */
function publicKeyOf(issuer: string): Uint8Array {
  const prefix = "ed25519:";
  if (!issuer.startsWith(prefix)) {
    throw new Error(`issuer sin prefijo ${prefix}: ${issuer}`);
  }
  return hexToBytes(issuer.slice(prefix.length));
}

/**
 * El digest que se firma: SHA-256 de la forma canónica del cuerpo.
 *
 * `id` y `signature` quedan fuera porque se derivan del resto; incluirlos sería
 * circular. El orden de las claves lo fija JCS, no el orden de inserción, así
 * que dos serializaciones distintas del mismo bloque dan el mismo digest.
 */
export function blockDigest(block: WonbBlock): Uint8Array {
  const { id: _id, signature: _signature, ...body } = block;
  void _id;
  void _signature;
  const canonical = canonicalize(body);
  if (canonical === undefined) {
    throw new Error("el cuerpo del bloque no es canonicalizable");
  }
  return sha256(new TextEncoder().encode(canonical));
}

/**
 * Verifica un bloque: hash y firma, por separado.
 *
 * Devuelve los dos resultados en vez de un booleano porque distinguen dos
 * fallos muy distintos: `hashOk: false` es contenido alterado; `signatureOk:
 * false` con `hashOk: true` es un firmante que no es quien dice ser.
 */
export function verifyBlock(block: WonbBlock): BlockVerdict {
  let digest: Uint8Array;
  try {
    digest = blockDigest(block);
  } catch (cause) {
    return { hashOk: false, signatureOk: false, error: String(cause) };
  }

  const hashOk = `sha256:${bytesToHex(digest)}` === block.id;

  let signatureOk = false;
  try {
    signatureOk = ed.verify(hexToBytes(block.signature), digest, publicKeyOf(block.issuer));
  } catch (cause) {
    return { hashOk, signatureOk: false, error: String(cause) };
  }

  return { hashOk, signatureOk };
}

/** SHA-256 en hexadecimal minúscula de unos bytes cualesquiera. */
export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}
