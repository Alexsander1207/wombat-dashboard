#!/usr/bin/env node
/**
 * Copia una versión FIJA del bundle publicado a public/data/, verificándolo
 * antes de escribir un solo byte.
 *
 * El orden importa y es deliberado: primero se verifica en origen, y solo si
 * todo cuadra se copia. Copiar y después verificar dejaría un bundle corrupto
 * servido por el dev server durante el rato que tarde la comprobación, y un
 * dashboard que carga datos manipulados aunque luego se queje.
 *
 * La versión está fijada en el código (AOI_ID / BUNDLE_VERSION), no se descubre
 * sola. R28 dice que un bundle publicado es inmutable para una versión dada, así
 * que "la última" no es una referencia estable: si mañana sale v1, este
 * dashboard sigue mostrando v0 hasta que alguien lo cambie a mano y revise el
 * diff.
 *
 *   node scripts/sync-data.mjs
 *   node scripts/sync-data.mjs --from ../Wombat-core/contracts/v1/fixtures/bundle
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyBlocks,
  verifyChain,
  verifyFileHashes,
  verifyIssuers,
  isExpired,
} from "../src/verify/bundle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/** La versión fija que este dashboard sirve. Cambiarla es un cambio revisable. */
const AOI_ID = "piura-demo";
const BUNDLE_VERSION = "v0";

const DEFAULT_SOURCE = resolve(ROOT, "../Wombat-core/contracts/v1/fixtures/bundle");
const DESTINATION = join(ROOT, "public", "data", AOI_ID, BUNDLE_VERSION);

function sourceRoot() {
  const flag = process.argv.indexOf("--from");
  const base = flag === -1 ? DEFAULT_SOURCE : resolve(process.argv[flag + 1]);
  return join(base, AOI_ID, BUNDLE_VERSION);
}

/** Recorre el bundle entero, no solo lo que index.json dice que hay. */
async function walk(dir, prefix = "") {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...(await walk(join(dir, entry.name), rel)));
    } else {
      found.push(rel);
    }
  }
  return found.sort();
}

function fail(message, detail) {
  console.error(`\n  ERROR  ${message}`);
  if (detail) console.error(detail);
  console.error("\n  No se copió nada. public/data/ queda como estaba.\n");
  process.exit(1);
}

async function main() {
  const source = sourceRoot();

  try {
    await stat(source);
  } catch {
    fail(
      `no está el bundle de origen: ${source}`,
      "  Pasa la ruta con --from <dir que contiene <aoi>/<version>/>, por ejemplo:\n" +
        "    node scripts/sync-data.mjs --from ../Wombat-core/contracts/v1/fixtures/bundle",
    );
  }

  console.log(`\nWOMBAT sync-data  —  ${AOI_ID}/${BUNDLE_VERSION}`);
  console.log(`origen:  ${source}`);
  console.log(`destino: ${relative(ROOT, DESTINATION)}\n`);

  const index = JSON.parse(await readFile(join(source, "index.json"), "utf8"));

  if (index.aoi_id !== AOI_ID || index.bundle_version !== BUNDLE_VERSION) {
    fail(
      "el bundle de origen no es el que este script fija",
      `  esperado ${AOI_ID}/${BUNDLE_VERSION}, encontrado ${index.aoi_id}/${index.bundle_version}`,
    );
  }

  // 1. Los bytes. Cada archivo listado en index.json contra su sha256.
  const files = await verifyFileHashes(index, async (path) =>
    new Uint8Array(await readFile(join(source, path))),
  );
  if (!files.ok) {
    fail(
      `${files.failures.length} archivo(s) no coinciden con su sha256 en index.json`,
      files.failures
        .map((f) => `    ${f.path}\n      index.json dice: ${f.expected}\n      los bytes dan:   ${f.actual ?? "(ilegible)"}\n      ${f.problem}`)
        .join("\n"),
    );
  }
  console.log(`  OK  bytes            ${files.checks.length} archivos coinciden con index.json`);

  // 2. Nada fuera de la lista. Un archivo no listado no tiene hash que lo avale.
  const onDisk = await walk(source);
  const listed = new Set([...index.files.map((f) => f.path), "index.json"]);
  const unlisted = onDisk.filter((p) => !listed.has(p));
  if (unlisted.length > 0) {
    fail(
      `${unlisted.length} archivo(s) en el bundle no están en index.json`,
      unlisted.map((p) => `    ${p}`).join("\n"),
    );
  }
  console.log(`  OK  inventario       ningún archivo sin declarar`);

  // 3. Los bloques: hash canónico y firma Ed25519.
  const blockPaths = onDisk.filter((p) => p.startsWith("wonb/") && p.endsWith(".json"));
  const blocks = await Promise.all(
    blockPaths.map(async (path) => ({
      path,
      block: JSON.parse(await readFile(join(source, path), "utf8")),
    })),
  );

  const verdicts = verifyBlocks(blocks);
  if (!verdicts.ok) {
    fail(
      `${verdicts.failures.length} bloque(s) no verifican`,
      verdicts.failures
        .map((f) => `    ${f.path}  hash_ok=${f.hashOk} signature_ok=${f.signatureOk}${f.error ? ` (${f.error})` : ""}`)
        .join("\n"),
    );
  }
  console.log(`  OK  bloques          ${verdicts.checks.length} con hash y firma válidos`);

  // 4. La cadena y los emisores.
  const chain = verifyChain(blocks);
  if (chain.length > 0) fail("la cadena de bloques está incompleta", chain.map((p) => `    ${p}`).join("\n"));
  console.log(`  OK  cadena           todos los parents existen`);

  const trusted = JSON.parse(await readFile(join(source, "trusted-issuers.json"), "utf8"));
  const issuers = verifyIssuers(blocks, trusted);
  if (issuers.length > 0) fail("hay bloques de emisores no autorizados", issuers.map((p) => `    ${p}`).join("\n"));
  console.log(`  OK  emisores         todos confiables y con el rol correcto`);

  // 5. TTL contra generated_at, no contra el reloj de hoy (regla 6).
  const asOf = new Date(index.generated_at);
  const expired = blocks.filter(({ block }) => isExpired(block, asOf));
  if (expired.length > 0) {
    fail(
      `${expired.length} bloque(s) están fuera de su TTL en la instantánea`,
      expired.map(({ path, block }) => `    ${path}  valid_until=${block.valid_until}`).join("\n"),
    );
  }
  console.log(`  OK  TTL              vigentes a ${index.generated_at} (instantánea)`);

  // Verificado. Ahora, y solo ahora, se copia.
  await rm(DESTINATION, { recursive: true, force: true });
  for (const path of onDisk) {
    const target = join(DESTINATION, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(join(source, path)));
  }

  // El navegador vuelve a verificar por su cuenta; esto es el acta de lo que
  // vio sync-data, para poder comparar y para que la UI pueda decir cuándo se
  // sincronizó sin tener que confiar en su propia memoria.
  const report = {
    synced_at: new Date().toISOString(),
    aoi_id: AOI_ID,
    bundle_version: BUNDLE_VERSION,
    contract_version: index.contract_version,
    generated_at: index.generated_at,
    data_origin: index.data_origin,
    source: relative(ROOT, source).replaceAll("\\", "/"),
    files_checked: files.checks.length,
    blocks_verified: verdicts.checks.length,
    verdict: "ok",
  };
  await writeFile(join(DESTINATION, "sync-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\n  ${onDisk.length} archivos copiados a ${relative(ROOT, DESTINATION).replaceAll("\\", "/")}`);
  console.log(`  instantánea de ${index.generated_at}  |  data_origin: ${index.data_origin}\n`);
}

main().catch((cause) => fail("fallo inesperado", `    ${cause?.stack ?? cause}`));
