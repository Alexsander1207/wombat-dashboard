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
import { verifyFileHashes } from "../src/verify/bundle.ts";
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


describe("(g) rendimiento de carga", () => {
  it("descarga cada recurso del bundle una sola vez y reutiliza los bytes verificados", async () => {
    const reads = new Map<string, number>();
    const readBytes = async (path: string): Promise<Uint8Array> => {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return new Uint8Array(await readFile(join(BUNDLE_DIR, path)));
    };

    const bundle = await loadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, readBytes);

    expect(bundle.verification.filesOk).toBe(true);
    expect(reads.get("index.json")).toBe(1);
    expect([...reads.values()].every((count) => count === 1)).toBe(true);
    expect(reads.size).toBe(bundle.verification.filesChecked + 1);
  });

  it("verifica archivos con concurrencia acotada y conserva el orden", async () => {
    const files = Array.from({ length: 30 }, (_, i) => ({
      path: `file-${i}.bin`,
      sha256: "no-coincide",
    }));
    let active = 0;
    let maxActive = 0;
    const report = await verifyFileHashes(
      {
        contract_version: "1.0.0",
        bundle_version: "test",
        aoi_id: "test",
        data_origin: "test",
        generated_at: "2026-01-01T00:00:00Z",
        core_commit: "test",
        files,
      },
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return new Uint8Array([1, 2, 3]);
      },
      12,
    );

    expect(report.checks).toHaveLength(30);
    expect(report.checks.map((check) => check.path)).toEqual(files.map((file) => file.path));
    expect(maxActive).toBe(12);
    expect(report.ok).toBe(false);
    expect(report.failures).toHaveLength(30);
  });

  it("informa el avance una vez por archivo, también por los que fallan", async () => {
    const files = Array.from({ length: 5 }, (_, i) => ({ path: `f-${i}.bin`, sha256: "x" }));
    const seen: [number, number][] = [];
    await verifyFileHashes(
      {
        contract_version: "1.0.0",
        bundle_version: "test",
        aoi_id: "test",
        data_origin: "test",
        generated_at: "2026-01-01T00:00:00Z",
        core_commit: "test",
        files,
      },
      async (path) => {
        if (path === "f-2.bin") throw new Error("404");
        return new Uint8Array([1]);
      },
      2,
      (done, total) => seen.push([done, total]),
    );

    expect(seen).toEqual([[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]]);
  });

  it("loadAndVerify avisa el avance de archivos y luego el de firmas", async () => {
    const stages: { stage: string; done: number; total: number }[] = [];
    const bundle = await loadAndVerify(
      BUNDLE_DIR,
      TRUSTED_ISSUERS,
      makeReadBytes(BUNDLE_DIR),
      undefined,
      (p) => stages.push(p),
    );
    const total = bundle.verification.filesChecked;

    expect(stages[0]).toEqual({ stage: "files", done: 0, total, fraction: 0 });
    expect(stages.filter((p) => p.stage === "files").at(-1)).toEqual({ stage: "files", done: total, total, fraction: 1 });
    expect(stages.at(-1)).toEqual({ stage: "signatures", done: total, total, fraction: 1 });
    // Ni el contador ni la barra retroceden.
    const dones = stages.map((p) => p.done);
    expect(dones).toEqual([...dones].sort((a, b) => a - b));
    const fractions = stages.map((p) => p.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  });

  it("con fetch real lee por partes, mide bytes y verifica los mismos bytes", async () => {
    // Cada archivo llega en trozos de 700 bytes, como en una red real; los
    // PNG sin compresión anuncian su tamaño, el resto no (como Vercel con br).
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      const path = String(url).slice(BUNDLE_DIR.length + 1);
      const bytes = new Uint8Array(await readFile(join(BUNDLE_DIR, path)));
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < bytes.length; i += 700) controller.enqueue(bytes.slice(i, i + 700));
          controller.close();
        },
      });
      const headers = path.endsWith(".png")
        ? { "content-length": String(bytes.length) }
        : { "content-encoding": "br" };
      return new Response(body, { status: 200, headers });
    }) as typeof fetch;

    try {
      const fractions: number[] = [];
      const bundle = await loadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, undefined, undefined, (p) =>
        fractions.push(p.fraction),
      );

      expect(bundle.verification.filesOk).toBe(true);
      expect(bundle.verification.blocksOk).toBe(true);
      // Hubo avance en medio de los archivos, no solo al terminar cada uno.
      expect(fractions.length).toBeGreaterThan(bundle.verification.filesChecked * 2);
      expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
      expect(fractions.at(-1)).toBe(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
