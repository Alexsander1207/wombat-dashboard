#!/usr/bin/env node
/**
 * Sincroniza un bundle publicado e inmutable a public/bundles/<aoi>/<vN>/.
 *
 * Lee la lista de bundles y los emisores de confianza de dashboard.config.json.
 * Nunca confía en el trusted-issuers.json que viene dentro del bundle.
 *
 * Uso:
 *   node scripts/sync-data.mjs --aoi <id> --version <vN>
 *   node scripts/sync-data.mjs --aoi <id> --version <vN> --source <url|ruta>
 *   node scripts/sync-data.mjs --aoi <id> --version <vN> --issuer <pubkey>
 *
 * Paso 1 (obligatorio): verifica sha256 de cada archivo contra index.json.
 * Paso 2 (obligatorio): verifica firma Ed25519 de cada bloque WONB contra
 *   los emisores pinneados en dashboard.config.json.
 * Paso 3 (obligatorio): puerta de versión — contract_version major debe ser 1.
 * Paso 4 (solo si todo pasa): copia a public/bundles/<aoi>/<vN>/.
 */

import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyFileHashes,
  verifyBlocks,
  verifyChain,
  verifyIssuers,
  isExpired,
} from "../src/verify/bundle.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const CONFIG_PATH = join(ROOT, "dashboard.config.json");

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = process.argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function fail(message, detail) {
  console.error(`\n  ERROR  ${message}`);
  if (detail) console.error(detail);
  console.error("\n  No se copió nada.\n");
  process.exit(1);
}

async function readConfig() {
  let config;
  try {
    config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch (cause) {
    fail(
      `no se pudo leer ${relative(ROOT, CONFIG_PATH)}`,
      `    ${cause?.message ?? cause}`,
    );
  }
  if (!config || !Array.isArray(config.bundles) || config.bundles.length === 0) {
    fail(
      `dashboard.config.json no tiene una lista "bundles" válida`,
      `    revisa ${relative(ROOT, CONFIG_PATH)}`,
    );
  }
  return config;
}

function findBundleEntry(config, aoi, version) {
  const entry = config.bundles.find((b) => b.aoi === aoi && b.version === version);
  if (!entry) {
    const listed = config.bundles.map((b) => `${b.aoi}/${b.version}`).join(", ");
    fail(
      `bundle no encontrado en dashboard.config.json: ${aoi}/${version}`,
      `    disponibles: ${listed || "(ninguno)"}`,
    );
  }
  return entry;
}

function resolveSource(entry, override) {
  const base = override || entry.source;
  if (!base) {
    fail(
      `no hay source para ${entry.aoi}/${entry.version}`,
      `    define "source" en dashboard.config.json o pasa --source`,
    );
  }
  return resolve(ROOT, base, entry.aoi, entry.version);
}

function resolveIssuers(entry, overrideIssuer) {
  const issuers = overrideIssuer
    ? [overrideIssuer]
    : entry.issuers;
  if (!issuers || issuers.length === 0) {
    fail(
      `no hay emisores de confianza para ${entry.aoi}/${entry.version}`,
      `    añade "issuers" en dashboard.config.json o pasa --issuer`,
    );
  }
  return issuers;
}

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

async function main() {
  const args = parseArgs();
  const aoi = args.aoi;
  const version = args.version;

  if (!aoi || !version) {
    fail(
      "faltan --aoi y --version",
      `    uso: node scripts/sync-data.mjs --aoi <id> --version <vN> [--source <url|ruta>] [--issuer <pubkey>]`,
    );
  }

  const config = await readConfig();
  const entry = findBundleEntry(config, aoi, version);
  const source = resolveSource(entry, args.source);
  const issuers = resolveIssuers(entry, args.issuer);
  const destination = join(ROOT, "public", "bundles", aoi, version);

  try {
    await stat(source);
  } catch {
    fail(
      `no está el bundle de origen: ${source}`,
      `  Pasa la ruta con --source <dir que contiene <aoi>/<version>/>`,
    );
  }

  console.log(`\nWOMBAT sync-data  —  ${aoi}/${version}`);
  console.log(`origen:  ${relative(ROOT, source)}`);
  console.log(`destino: ${relative(ROOT, destination)}\n`);

  // ── 1. index.json y puerta de versión ──────────────────────────────
  const indexRaw = await readFile(join(source, "index.json"), "utf8");
  const index = JSON.parse(indexRaw);

  if (index.aoi_id !== aoi || index.bundle_version !== version) {
    fail(
      "el bundle de origen no coincide con la entrada de config",
      `  esperado ${aoi}/${version}, encontrado ${index.aoi_id}/${index.bundle_version}`,
    );
  }

  // Puerta de versión: major debe ser 1
  const major = Number(index.contract_version.split(".")[0]);
  if (major !== 1) {
    fail(
      `contrato no soportado: ${index.contract_version}`,
      `    este dashboard solo soporta contract_version major 1.`,
    );
  }

  // ── 2. Bytes: sha256 de cada archivo contra index.json ─────────────
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

  // ── 3. Nada fuera de la lista ──────────────────────────────────────
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

  // ── 4. Bloques: hash canónico + firma Ed25519 ──────────────────────
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
      `${verdicts.failures.length} bloque(s) no verifican (hash o firma)`,
      verdicts.failures
        .map((f) => `    ${f.path}  hash_ok=${f.hashOk} signature_ok=${f.signatureOk}${f.error ? ` (${f.error})` : ""}`)
        .join("\n"),
    );
  }
  console.log(`  OK  bloques          ${verdicts.checks.length} con hash y firma válidos`);

  // ── 5. Cadena de padres ────────────────────────────────────────────
  const chain = verifyChain(blocks);
  if (chain.length > 0) fail("la cadena de bloques está incompleta", chain.map((p) => `    ${p}`).join("\n"));
  console.log(`  OK  cadena           todos los parents existen`);

  // ── 6. Emisores pinneados (de dashboard.config.json, NO del bundle) ─
  const trusted = { version: 1, issuers: issuers.map((pubkey) => ({
    issuer: pubkey,
    name: "pinneado desde dashboard.config.json",
    roles: ["change", "context", "risk", "action"],
  })) };
  const issuerProblems = verifyIssuers(blocks, trusted);
  if (issuerProblems.length > 0) fail("hay bloques de emisores no autorizados", issuerProblems.map((p) => `    ${p}`).join("\n"));
  console.log(`  OK  emisores         todos firman con claves pinneadas`);

  // ── 7. TTL contra index.generated_at (instantánea, no "ahora") ─────
  const asOf = new Date(index.generated_at);
  const expired = blocks.filter(({ block }) => isExpired(block, asOf));
  if (expired.length > 0) {
    fail(
      `${expired.length} bloque(s) están fuera de su TTL en la instantánea`,
      expired.map(({ path, block }) => `    ${path}  valid_until=${block.valid_until}`).join("\n"),
    );
  }
  console.log(`  OK  TTL              vigentes a ${index.generated_at} (instantánea)`);

  // ── 8. Copiar (solo después de verificar todo) ─────────────────────
  await rm(destination, { recursive: true, force: true });
  for (const path of onDisk) {
    const target = join(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(join(source, path)));
  }

  // ── 9. Manifiesto local de sincronización ──────────────────────────
  const report = {
    synced_at: new Date().toISOString(),
    aoi_id: aoi,
    bundle_version: version,
    contract_version: index.contract_version,
    generated_at: index.generated_at,
    data_origin: index.data_origin,
    source: relative(ROOT, source).replaceAll("\\", "/"),
    issuers,
    files_checked: files.checks.length,
    blocks_verified: verdicts.checks.length,
    verdict: "ok",
  };
  await writeFile(join(destination, "sync-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\n  ${onDisk.length} archivos copiados a ${relative(ROOT, destination).replaceAll("\\", "/")}`);
  console.log(`  instantánea de ${index.generated_at}  |  data_origin: ${index.data_origin}\n`);
}

main().catch((cause) => fail("fallo inesperado", `    ${cause?.stack ?? cause}`));
