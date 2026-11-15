/**
 * Pruebas del adaptador canónico BundleContract.
 *
 * Corren contra el bundle sincronizado en public/bundles/piura-demo/v0/
 * y contra bundles manipulados creados en memoria.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, readdir, mkdtemp, rm, writeFile, stat, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAndVerify, releaseBundle } from "../src/bundle/contract.ts";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

const BUNDLE_DIR = join(process.cwd(), "public", "bundles", "piura-demo", "v0");
const TEST_FIXTURE_DIR = join(process.cwd(), "tests", "fixtures", "test-aoi", "v0");
const TRUSTED_ISSUERS = [
  {
    issuer: "ed25519:92b8169774b5f100de3f37b5ec63b9a10100ae6d1983c4bbdc9b9e7ca6f014be",
    roles: ["change", "context", "risk", "action"],
  },
];

beforeAll(() => {
  const url = globalThis.URL as { createObjectURL?: () => string };
  if (typeof url.createObjectURL === "undefined") {
    url.createObjectURL = () => "blob:mock";
  }
});

async function copyRecursive(src: string, dest: string): Promise<void> {
  const statEntry = await stat(src);
  if (statEntry.isDirectory()) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src);
    for (const entry of entries) {
      await copyRecursive(join(src, entry), join(dest, entry));
    }
  } else {
    await mkdir(join(dest, ".."), { recursive: true });
    await copyFile(src, dest);
  }
}

function makeReadBytes(dir: string) {
  return async (path: string): Promise<Uint8Array> =>
    new Uint8Array(await readFile(join(dir, path)));
}

async function updateIndexHash(dir: string, filePath: string): Promise<void> {
  const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
  const bytes = new Uint8Array(await readFile(join(dir, filePath)));
  const hex = bytesToHex(sha256(bytes));
  for (const entry of index.files) {
    if (entry.path === filePath) {
      entry.sha256 = hex;
      break;
    }
  }
  await writeFile(join(dir, "index.json"), JSON.stringify(index, null, 2));
}

/**
 * (a) Contrato: el fixture pasa verificación completa y produce el ranking dorado.
 */
describe("(a) contrato", () => {
  it("verifica el bundle completo (30 archivos, 21 bloques)", async () => {
    const bundle = await loadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, makeReadBytes(BUNDLE_DIR));

    expect(bundle.verification.filesChecked).toBe(30);
    expect(bundle.verification.filesOk).toBe(true);
    expect(bundle.verification.blocksChecked).toBe(21);
    expect(bundle.verification.blocksOk).toBe(true);
    expect(bundle.verification.chainOk).toBe(true);
    expect(bundle.verification.issuersOk).toBe(true);
    expect(bundle.verification.ttlOk).toBe(true);
    expect(bundle.verification.problems).toEqual([]);
    expect(bundle.verification.asOf).toBe("2026-11-14T17:00:00Z");
  });

  it("produce el ranking dorado: top 3 y mezcla de status", async () => {
    const bundle = await loadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, makeReadBytes(BUNDLE_DIR));

    expect(bundle.actions.length).toBeGreaterThanOrEqual(3);
    expect(bundle.actions[0]).toMatchObject({
      cellId: "piura-demo-r02c01",
      rank: 1,
      action: "field_verification_first",
    });
    expect(bundle.actions[1]).toMatchObject({
      cellId: "piura-demo-r01c01",
      rank: 2,
    });
    expect(bundle.actions[2]).toMatchObject({
      cellId: "piura-demo-r02c02",
      rank: 3,
    });

    const r02c01 = bundle.cells.find((c) => c.cellId === "piura-demo-r02c01");
    const r01c01 = bundle.cells.find((c) => c.cellId === "piura-demo-r01c01");
    const r02c02 = bundle.cells.find((c) => c.cellId === "piura-demo-r02c02");
    expect(r02c01?.scoreBp).toBe(7636);
    expect(r01c01?.scoreBp).toBe(6593);
    expect(r02c02?.scoreBp).toBe(6365);

    const high = bundle.cells.filter((c) => c.status === "review_high").length;
    const medium = bundle.cells.filter((c) => c.status === "review_medium").length;
    const low = bundle.cells.filter((c) => c.status === "review_low").length;
    const insufficient = bundle.cells.filter((c) => c.status === "insufficient_quality").length;
    expect(high).toBe(3);
    expect(medium).toBe(3);
    expect(low).toBe(9);
    expect(insufficient).toBe(1);
    expect(bundle.cells.length).toBe(16);
  });

  it("data_origin, t1 y t2 vienen del bloque change firmado", async () => {
    const bundle = await loadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, makeReadBytes(BUNDLE_DIR));
    expect(bundle.dataOrigin).toBe("simulated");
    expect(bundle.t1).toBe("2026-10-14T23:00:00Z");
    expect(bundle.t2).toBe("2026-10-26T23:00:00Z");
    expect(bundle.integrityWarning).toBeNull();
  });

  it("el fixture de test-aoi también verifica correctamente (multi-AOI)", async () => {
    const bundle = await loadAndVerify(TEST_FIXTURE_DIR, TRUSTED_ISSUERS, makeReadBytes(TEST_FIXTURE_DIR));
    expect(bundle.verification.filesOk).toBe(true);
    expect(bundle.verification.filesChecked).toBeGreaterThan(0);
    expect(bundle.verification.blocksOk).toBe(true);
    expect(bundle.verification.blocksChecked).toBeGreaterThan(0);
  });
});

/**
 * (b) Manipulación: 1 byte cambia → error nombrando el archivo.
 */
describe("(b) manipulación", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "wombat-test-"));
    await copyRecursive(BUNDLE_DIR, tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("cambiar 1 byte de un archivo → error de sha256 que nombra el archivo", async () => {
    // Modificar manifest.json (no es index.json ni un bloque WONB)
    const manifestPath = join(tmpDir, "manifest.json");
    const bytes = await readFile(manifestPath);
    bytes[0] = bytes[0] ^ 0xff;
    await writeFile(manifestPath, bytes);

    await expect(
      loadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir)),
    ).rejects.toThrow(/no coinciden/);
  });

  it("cambiar 1 byte de un bloque firmado → error de hash/firma", async () => {
    const riskPath = join(tmpDir, "wonb", "risk", "piura-demo-r02c01.json");
    const content = JSON.parse(await readFile(riskPath, "utf8"));
    content.payload.score_bp = 99999; // cambia el contenido del bloque
    await writeFile(riskPath, JSON.stringify(content));
    await updateIndexHash(tmpDir, "wonb/risk/piura-demo-r02c01.json");

    await expect(
      loadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir)),
    ).rejects.toThrow(/no coinciden|no verifican/);
  });

  it("bloque con issuer distinto → emisor no confiable", async () => {
    const riskPath = join(tmpDir, "wonb", "risk", "piura-demo-r02c01.json");
    const content = JSON.parse(await readFile(riskPath, "utf8"));
    content.issuer = "ed25519:0000000000000000000000000000000000000000000000000000000000000000";
    await writeFile(riskPath, JSON.stringify(content));
    await updateIndexHash(tmpDir, "wonb/risk/piura-demo-r02c01.json");

    await expect(
      loadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir)),
    ).rejects.toThrow(/no coinciden|emisores no autorizados|no verifican/);
  });
});

/**
 * (c) Confianza externa: bundle re-firmado por otra clave con SU PROPIA
 * lista interna de emisores debe ser rechazado (el dashboard usa sus propios
 * emisores pinneados, nunca los del bundle).
 */
describe("(c) confianza externa", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "wombat-test-"));
    await copyRecursive(BUNDLE_DIR, tmpDir);
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("emisor no en la lista pinneada → rechazo aunque el bundle traiga trusted-issuers.json", async () => {
    const riskPath = join(tmpDir, "wonb", "risk", "piura-demo-r02c01.json");
    const content = JSON.parse(await readFile(riskPath, "utf8"));
    content.issuer = "ed25519:1111111111111111111111111111111111111111111111111111111111111111";
    await writeFile(riskPath, JSON.stringify(content));
    await updateIndexHash(tmpDir, "wonb/risk/piura-demo-r02c01.json");

    await expect(
      loadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir)),
    ).rejects.toThrow(/emisores no autorizados|no verifican/);
  });
});

/**
 * (d) Versión: contract_version major 2 → rechazo claro.
 */
describe("(d) puerta de versión", () => {
  it("contract_version major 2 → error claro", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "wombat-test-"));
    await copyRecursive(BUNDLE_DIR, tmpDir);

    const index = JSON.parse(await readFile(join(tmpDir, "index.json"), "utf8"));
    index.contract_version = "2.0.0";
    await writeFile(join(tmpDir, "index.json"), JSON.stringify(index, null, 2));

    await expect(
      loadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir)),
    ).rejects.toThrow(/contrato no soportado/);

    await rm(tmpDir, { recursive: true, force: true });
  });
});

/**
 * (e) Desacople: ningún import fuera de esta repo ni de node_modules.
 */
describe("(e) desacople", () => {
  it("ningún módulo de src importa código de Wombat-core", async () => {
    const srcFiles = await readdir(join(process.cwd(), "src"), { recursive: true });
    const tsFiles = srcFiles.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

    let foundExternal = false;
    for (const file of tsFiles) {
      const fullPath = join(process.cwd(), "src", file);
      const content = await readFile(fullPath, "utf8");
      const importMatches = content.match(/from\s+["'](\.\.\/)?\.\.\/Wombat-core["']/);
      if (importMatches) {
        foundExternal = true;
        console.log(`Wombat-core import found in ${file}: ${importMatches[0]}`);
      }
    }
    expect(foundExternal).toBe(false);
  });
});

/**
 * (f) Estados: loading / ready / error y datos insuficientes renderizan sin romper.
 */
describe("(f) estados", () => {
  it("LoadedBundle contiene datos insuficientes como null, no 0", async () => {
    const bundle = await loadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, makeReadBytes(BUNDLE_DIR));
    const insufficient = bundle.cells.find((c) => c.status === "insufficient_quality");
    expect(insufficient).toBeDefined();
    expect(insufficient?.scoreBp).toBeNull();
    expect(insufficient?.rank).toBeNull();
  });

  it("verification summary tiene todos los campos", async () => {
    const bundle = await loadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, makeReadBytes(BUNDLE_DIR));
    const v = bundle.verification;
    expect(typeof v.filesChecked).toBe("number");
    expect(typeof v.filesOk).toBe("boolean");
    expect(typeof v.blocksChecked).toBe("number");
    expect(typeof v.blocksOk).toBe("boolean");
    expect(typeof v.chainOk).toBe("boolean");
    expect(typeof v.issuersOk).toBe("boolean");
    expect(typeof v.ttlOk).toBe("boolean");
    expect(typeof v.asOf).toBe("string");
    expect(Array.isArray(v.problems)).toBe(true);
  });

  it("releaseBundle no lanza con bundle válido", async () => {
    const bundle = await loadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, makeReadBytes(BUNDLE_DIR));
    expect(() => releaseBundle(bundle)).not.toThrow();
  });
});
