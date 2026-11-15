/**
 * Pruebas de integridad en el navegador (UI real).
 *
 * Renderiza App.tsx con loadAndVerify mockeado para devolver bundles
 * reales del disco (válidos o manipulados). Verifica que el panel de
 * integridad muestra el estado real: OK, error por hash, error por firma,
 * error por emisor, y recuperación tras restaurar bytes.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { readFile, readdir, mkdtemp, rm, writeFile, stat, mkdir, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoadedBundle } from "../src/bundle/contract.ts";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

const BUNDLE_DIR = join(process.cwd(), "public", "bundles", "piura-demo", "v0");
const TRUSTED_ISSUERS = [{
  issuer: "ed25519:92b8169774b5f100de3f37b5ec63b9a10100ae6d1983c4bbdc9b9e7ca6f014be",
  roles: ["change", "context", "risk", "action"],
}];

beforeAll(() => {
  const url = globalThis.URL as { createObjectURL?: () => string };
  if (typeof url.createObjectURL === "undefined") {
    url.createObjectURL = () => "blob:mock";
  }

  // Mock de fetch para /dashboard.config.json (App.tsx lo carga primero)
  const configJson = JSON.stringify({
    bundles: [{
      aoi: "piura-demo",
      version: "v0",
      source: "../Wombat-core/contracts/v1/fixtures/bundle",
      // dashboard.config.json guarda las claves pinneadas como CADENAS, igual
      // que las consume scripts/sync-data.mjs. El mock tiene que usar esa misma
      // forma: cuando no lo hacía, App.tsx fallaba en producción con "emisores
      // no autorizados" y la suite seguía en verde.
      issuers: TRUSTED_ISSUERS.map((i) => i.issuer),
    }],
  });

  const mockedFetch = async (input: RequestInfo | URL): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : String(input);
    if (urlStr === "/dashboard.config.json" || urlStr.endsWith("/dashboard.config.json")) {
      return new Response(configJson, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`fetch no mockeado para: ${urlStr}`);
  };
  globalThis.fetch = mockedFetch as typeof globalThis.fetch;
});

// Mock de MapExplorer (sin WebGL)
vi.mock("../src/components/MapExplorer.tsx", () => ({
  MapExplorer: ({ bundle }: { bundle: { aoiId: string } }) =>
    React.createElement("div", { "data-testid": "map-view" },
      `Mapa: ${bundle.aoiId}`),
}));

// Mock de loadAndVerify
const mockLoadAndVerify = vi.fn();
vi.mock("../src/bundle/contract.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/bundle/contract.ts")>();
  return { ...actual, loadAndVerify: mockLoadAndVerify };
});

// loadAndVerify REAL (salta el mock) para crear bundles manipulados
async function realLoadAndVerify(
  baseUrl: string,
  trustedIssuers: { issuer: string; roles: string[] }[],
  readBytes: (path: string) => Promise<Uint8Array>,
): Promise<LoadedBundle> {
  const { loadAndVerify: real } = await vi.importActual("../src/bundle/contract.ts");
  return real(baseUrl, trustedIssuers, readBytes);
}

async function readAsUint8(path: string): Promise<Uint8Array> {
  const buf = await readFile(path);
  return new Uint8Array(buf);
}

async function createManipulatedBundle(modify: (dir: string) => Promise<void>): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "wombat-integrity-"));
  await copyRecursive(BUNDLE_DIR, tmpDir);
  await modify(tmpDir);
  return tmpDir;
}

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

async function updateIndexHash(dir: string, filePath: string): Promise<void> {
  const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
  const bytes = await readAsUint8(join(dir, filePath));
  const hex = bytesToHex(sha256(bytes));
  for (const entry of index.files) {
    if (entry.path === filePath) entry.sha256 = hex;
  }
  await writeFile(join(dir, "index.json"), JSON.stringify(index, null, 2));
}

function makeReadBytes(dir: string) {
  return async (path: string): Promise<Uint8Array> =>
    new Uint8Array(await readFile(join(dir, path)));
}

async function renderAppWithBundle(bundle: LoadedBundle) {
  mockLoadAndVerify.mockResolvedValue(bundle);
  const { default: App } = await import("../src/App.tsx");
  const { container } = render(React.createElement(App));
  return { container };
}

async function renderAppWithError(errorMessage: string) {
  mockLoadAndVerify.mockRejectedValue(new Error(errorMessage));
  const { default: App } = await import("../src/App.tsx");
  const { container } = render(React.createElement(App));
  return { container };
}

describe("(A) integridad en navegador", () => {
  it("A.1 bundle válido: panel de integridad muestra 'Verificado: 21 bloques...'", async () => {
    const bundle = await realLoadAndVerify(BUNDLE_DIR, TRUSTED_ISSUERS, makeReadBytes(BUNDLE_DIR));
    await renderAppWithBundle(bundle);
    await waitFor(() => expect(screen.getByTestId("map-view")).toBeInTheDocument(), { timeout: 10000 });
    const t = screen.getByText(/Verificado:/);
    expect(t).toBeInTheDocument();
    expect(t.textContent).toContain("21 bloques");
    expect(t.textContent).toContain("piura-demo/v0");
    expect(t.textContent).toContain("1.0.0");
  }, 30000);

  it("A.2 alterar 1 byte de un bloque SIN tocar index.json → error de sha256", async () => {
    const tmpDir = await createManipulatedBundle(async (dir) => {
      const riskPath = join(dir, "wonb", "risk", "piura-demo-r02c01.json");
      const bytes = await readAsUint8(riskPath);
      bytes[100] = bytes[100] ^ 0xff;
      await writeFile(riskPath, Buffer.from(bytes));
    });
    try {
      await realLoadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir));
    } catch (e) {
      await renderAppWithError((e as Error).message);
      await waitFor(() => expect(screen.getByText(/No se pudo cargar el bundle/)).toBeInTheDocument(), { timeout: 10000 });
      const t = screen.getByText(/no coinciden/);
      expect(t).toBeInTheDocument();
      expect(t.textContent).toContain("1 de 30 archivo(s)");
    }
    await rm(tmpDir, { recursive: true, force: true });
  }, 30000);

  it("A.3 alterar contenido + corregir sha256 en index.json → error de firma/hash", async () => {
    const tmpDir = await createManipulatedBundle(async (dir) => {
      const riskPath = join(dir, "wonb", "risk", "piura-demo-r02c01.json");
      const content = JSON.parse(await readFile(riskPath, "utf8"));
      content.payload.score_bp = 99999;
      await writeFile(riskPath, JSON.stringify(content));
      await updateIndexHash(dir, "wonb/risk/piura-demo-r02c01.json");
    });
    try {
      await realLoadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir));
    } catch (e) {
      await renderAppWithError((e as Error).message);
      await waitFor(() => expect(screen.getByText(/No se pudo cargar el bundle/)).toBeInTheDocument(), { timeout: 10000 });
      const t = screen.getByText(/no coinciden|no verifican/);
      expect(t).toBeInTheDocument();
    }
    await rm(tmpDir, { recursive: true, force: true });
  }, 30000);

  it("A.4 restaurar bytes sin reconstruir → vuelve a verificar", async () => {
    const tmpDir = await createManipulatedBundle(async (dir) => {
      const riskPath = join(dir, "wonb", "risk", "piura-demo-r02c01.json");
      const bytes = await readAsUint8(riskPath);
      bytes[100] = bytes[100] ^ 0xff;
      await writeFile(riskPath, Buffer.from(bytes));
    });
    try { await realLoadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir)); } catch { /* esperado */ }
    const riskPath = join(tmpDir, "wonb", "risk", "piura-demo-r02c01.json");
    const bytes = await readAsUint8(riskPath);
    bytes[100] = bytes[100] ^ 0xff;
    await writeFile(riskPath, Buffer.from(bytes));
    const restored = await realLoadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir));
    await renderAppWithBundle(restored);
    await waitFor(() => expect(screen.getByTestId("map-view")).toBeInTheDocument(), { timeout: 10000 });
    const t = screen.getByText(/Verificado:/);
    expect(t).toBeInTheDocument();
    expect(t.textContent).toContain("21 bloques");
    await rm(tmpDir, { recursive: true, force: true });
  }, 30000);
});

describe("(A.3bis) emisor no confiado", () => {
  it("rechaza bloque con issuer no fijado en dashboard.config.json", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "wombat-integrity-"));
    await copyRecursive(BUNDLE_DIR, tmpDir);
    const riskPath = join(tmpDir, "wonb", "risk", "piura-demo-r02c01.json");
    const content = JSON.parse(await readFile(riskPath, "utf8"));
    content.issuer = "ed25519:1111111111111111111111111111111111111111111111111111111111111111";
    await writeFile(riskPath, JSON.stringify(content));
    await updateIndexHash(tmpDir, "wonb/risk/piura-demo-r02c01.json");
    await expect(
      realLoadAndVerify(tmpDir, TRUSTED_ISSUERS, makeReadBytes(tmpDir)),
    ).rejects.toThrow(/emisores no autorizados|no verifican/);
    await rm(tmpDir, { recursive: true, force: true });
  }, 30000);
});
