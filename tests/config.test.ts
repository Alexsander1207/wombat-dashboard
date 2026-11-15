/**
 * Pruebas del ancla de confianza: dashboard.config.json.
 *
 * Estas pruebas leen el ARCHIVO REAL, no un mock. Existen porque el defecto
 * que corrigen se escondió exactamente ahí: el mock de
 * tests/integrity-browser.test.ts declaraba los emisores como objetos mientras
 * el archivo real los declara como cadenas, así que App.tsx rechazaba todos los
 * bloques en producción con la suite en verde.
 */

import { describe, it, expect } from "vitest";
import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const PUBKEY = /^ed25519:[0-9a-f]{64}$/;

interface BundleEntry {
  aoi: string;
  version: string;
  source: string;
  issuers: string[];
}

async function readConfig(path: string): Promise<{ bundles: BundleEntry[] }> {
  return JSON.parse(await readFile(join(ROOT, path), "utf8"));
}

describe("dashboard.config.json", () => {
  it("declara cada emisor como cadena ed25519:<64 hex>", async () => {
    const config = await readConfig("dashboard.config.json");
    expect(config.bundles.length).toBeGreaterThan(0);

    for (const entry of config.bundles) {
      expect(entry.issuers.length, `${entry.aoi}: sin emisores pinneados`).toBeGreaterThan(0);
      for (const issuer of entry.issuers) {
        // Si esto fuese un objeto, App.tsx y sync-data.mjs lo leerían como
        // undefined y la verificación rechazaría el bundle entero.
        expect(typeof issuer, `${entry.aoi}: emisor que no es cadena`).toBe("string");
        expect(issuer).toMatch(PUBKEY);
      }
    }
  });

  it("la copia servida al navegador es idéntica a la raíz", async () => {
    const [root, served] = await Promise.all([
      readFile(join(ROOT, "dashboard.config.json"), "utf8"),
      readFile(join(ROOT, "public", "dashboard.config.json"), "utf8"),
    ]);
    // sync-data.mjs lee la de la raíz; el navegador lee la de public/.
    // Si se separan, se verifica contra una lista de claves y se muestra otra.
    expect(JSON.parse(served)).toEqual(JSON.parse(root));
  });

  it("cada bundle configurado existe en public/bundles/", async () => {
    const config = await readConfig("dashboard.config.json");
    for (const entry of config.bundles) {
      const dir = join(ROOT, "public", "bundles", entry.aoi, entry.version);
      await expect(
        access(join(dir, "index.json")),
        `falta public/bundles/${entry.aoi}/${entry.version}/index.json`,
      ).resolves.toBeUndefined();
    }
  });

  it("los bloques del bundle vienen firmados por una clave pinneada", async () => {
    const config = await readConfig("dashboard.config.json");

    for (const entry of config.bundles) {
      const dir = join(ROOT, "public", "bundles", entry.aoi, entry.version);
      const pinned = new Set(entry.issuers);

      for (const block of ["wonb/change.json", "wonb/context.json"]) {
        const raw = JSON.parse(await readFile(join(dir, block), "utf8"));
        expect(
          pinned.has(raw.issuer),
          `${entry.aoi}/${block}: firmado por ${raw.issuer}, que no está pinneado en dashboard.config.json`,
        ).toBe(true);
      }
    }
  });

  it("la procedencia declarada en index.json es una que la UI sabe mostrar", async () => {
    const config = await readConfig("dashboard.config.json");
    const known = new Set(["nisar_real", "simulated"]);

    for (const entry of config.bundles) {
      const index = JSON.parse(
        await readFile(join(ROOT, "public", "bundles", entry.aoi, entry.version, "index.json"), "utf8"),
      );
      expect(
        known.has(index.data_origin),
        `${entry.aoi}: data_origin "${index.data_origin}" cae en la insignia genérica`,
      ).toBe(true);
    }
  });
});
