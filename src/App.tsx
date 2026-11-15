import { useEffect, useRef, useState } from "react";
import { loadAndVerify, releaseBundle, type LoadedBundle } from "./bundle/contract.ts";
import { MapView } from "./components/MapView.tsx";
import { Methodology } from "./pages/Methodology.tsx";
import type { OverlayKey } from "./components/statusColors.ts";
import { readableDateTime, percentFromBp, statusLabel } from "./format.ts";
import "./App.css";

/** Vista activa. Sin react-router: una sola pantalla con dos modos. */
type View = "mapa" | "metodologia";

// Rutas relativas a la base del despliegue. En GitHub Pages el sitio vive en
// /wombat-dashboard/, así que una ruta absoluta como "/dashboard.config.json"
// da 404. import.meta.env.BASE_URL vale "/" en dev y "./" en el build.
const CONFIG_URL = `${import.meta.env.BASE_URL}dashboard.config.json`;

const OVERLAY_LABELS: Record<OverlayKey, string> = {
  t1: "T1",
  t2: "T2",
  delta: "Delta",
};

interface BundleEntry {
  aoi: string;
  version: string;
  source: string;
  issuers: { issuer: string; roles: string[] }[];
}

interface Config {
  bundles: BundleEntry[];
}

function abbrIssuer(issuer: string): string {
  const hex = issuer.replace("ed25519:", "");
  return `${hex.slice(0, 12)}…${hex.slice(-8)}`;
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [bundle, setBundle] = useState<LoadedBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayKey>("delta");
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<BundleEntry | null>(null);
  const [view, setView] = useState<View>("mapa");
  const abortRef = useRef<AbortController | null>(null);

  // ── 1. Cargar configuración de bundles ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch(CONFIG_URL, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo leer ${CONFIG_URL}`);
        return r.json() as Promise<Config>;
      })
      .then((data) => {
        if (!cancelled) {
          setConfig(data);
          if (data.bundles.length > 0) {
            setSelectedBundle(data.bundles[0]);
          }
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 2. Cargar bundle cuando cambia la selección de AOI ───────────────
  useEffect(() => {
    if (!config || !selectedBundle) return;

    // Abort carga anterior al cambiar de AOI
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const base = `${import.meta.env.BASE_URL}bundles/${selectedBundle.aoi}/${selectedBundle.version}`;
    const issuers = selectedBundle.issuers.map((i) => ({ issuer: i.issuer, roles: i.roles }));

    loadAndVerify(base, issuers, undefined, controller.signal)
      .then((b) => {
        if (!cancelled && !controller.signal.aborted) {
          setBundle(b);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (!cancelled && !controller.signal.aborted) {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setLoading(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedBundle, config]);

  // ── 3. Liberar blobs al desmontar bundle ─────────────────────────────
  useEffect(() => {
    return () => {
      if (bundle) releaseBundle(bundle);
    };
  }, [bundle]);

  // ── 4. Metodología: no depende del bundle, se lee siempre ────────────
  if (view === "metodologia") {
    return <Methodology onBack={() => setView("mapa")} />;
  }

  // ── 5. Estados de error y carga ──────────────────────────────────────
  if (!config) {
    return (
      <div className="loading">
        <p>Cargando configuración…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="error">
        <h2>No se pudo cargar el bundle</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Reintentar</button>
        <button type="button" onClick={() => setView("metodologia")}>
          Ver metodología
        </button>
      </div>
    );
  }
  if (!selectedBundle) {
    return (
      <div className="loading">
        <p>Seleccionando área de interés…</p>
      </div>
    );
  }
  if (loading || !bundle) {
    return (
      <div className="loading">
        <p>Verificando y cargando el bundle…</p>
      </div>
    );
  }

  // ── 6. Render principal ──────────────────────────────────────────────
  const top3 = bundle.actions.slice(0, 3);
  const simulated = bundle.dataOrigin === "simulated";
  const highCount = bundle.cells.filter((c) => c.status === "review_high").length;
  const mediumCount = bundle.cells.filter((c) => c.status === "review_medium").length;
  const lowCount = bundle.cells.filter((c) => c.status === "review_low").length;
  const insufficientCount = bundle.cells.filter((c) => c.status === "insufficient_quality").length;
  const issuerAbbr = abbrIssuer(selectedBundle.issuers[0].issuer);

  return (
    <div className="app">
      {simulated && (
        <div className="banner simulated">
          SIMULATED DATA — fixture de desarrollo, no es un AOI real
        </div>
      )}
      {!simulated && (
        <div className="banner maturity">
          Madurez: {bundle.manifest.maturity} · {bundle.manifest.aoiName}
        </div>
      )}
      <header className="toolbar">
        <label htmlFor="aoi-selector">
          Área de interés:
          <select
            id="aoi-selector"
            value={`${selectedBundle.aoi}/${selectedBundle.version}`}
            onChange={(e) => {
              const [aoi, version] = e.target.value.split("/");
              const entry = config.bundles.find((b) => b.aoi === aoi && b.version === version);
              if (entry) setSelectedBundle(entry);
            }}
          >
            {config.bundles.map((b) => (
              <option key={`${b.aoi}/${b.version}`} value={`${b.aoi}/${b.version}`}>
                {b.aoi} / {b.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Overlay:
          <select
            value={overlay}
            onChange={(e) => setOverlay(e.target.value as OverlayKey)}
          >
            {Object.entries(OVERLAY_LABELS).map(([key, label]) => (
              <option key={key} value={key as OverlayKey}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="meta">
          {bundle.manifest.aoiName} · {bundle.bundleVersion} ·
          {readableDateTime(bundle.verification.asOf)} · instantánea
        </span>
        <button
          className="view-toggle"
          type="button"
          onClick={() => setView("metodologia")}
        >
          Metodología
        </button>
      </header>
      <div className="mapa">
        <MapView
          bundle={bundle}
          overlay={overlay}
          selectedCellId={selectedCellId}
          onSelectCell={setSelectedCellId}
        />
      </div>
      <aside className="panel">
        {/* Panel de integridad, visible sin hacer clic */}
        <div className="integrity-panel">
          <p className="integrity-line">
            Verificado: {bundle.verification.blocksChecked} bloques firmados por
            <span className="issuer-abbr">{issuerAbbr}</span> ·
            bundle {bundle.aoiId}/{bundle.bundleVersion} ·
            instantánea {readableDateTime(bundle.verification.asOf)} ·
            contrato {bundle.contractVersion}
          </p>
          <button className="verify-how" type="button" aria-expanded="false">
            ¿Cómo se verificó?
          </button>
          <div className="verify-how-detail" hidden>
            <ol>
              <li>sha256 de cada archivo contra index.json.</li>
              <li>Firma Ed25519 de cada bloque con la clave fijada en dashboard.config.json.</li>
              <li>Cadena de padres: cada bloque apunta a padres presentes.</li>
              <li>TTL contra la fecha de la instantánea (generated_at), no contra el reloj.</li>
            </ol>
          </div>
          {bundle.integrityWarning && (
            <div className="integrity-warning">
              ⚠ {bundle.integrityWarning}
            </div>
          )}
        </div>

        <h2>Top 3 — orden de revisión sugerido</h2>
        <p>
          Madurez: <strong>{bundle.manifest.maturity}</strong> ·
          Intervalo: {readableDateTime(bundle.t1)} → {readableDateTime(bundle.t2)} ·
          OPERA derivado de Sentinel-1 ({bundle.manifest.operaDerivedFrom})
        </p>
        <ul>
          {top3.map((action) => {
            const cell = bundle.cells.find((c) => c.cellId === action.cellId);
            return (
              <li key={action.cellId}>
                <strong>#{action.rank} {action.cellId}</strong> —
                {statusLabel(cell ? cell.status : "insufficient_quality")}
                {cell && cell.scoreBp !== null ? ` (${percentFromBp(cell.scoreBp)})` : ""}
                <p className="explanation">{cell ? cell.explanation.join(" ") : ""}</p>
              </li>
            );
          })}
        </ul>
        <div className="status-summary">
          <span>{highCount} revisar primero</span>
          <span>{mediumCount} revisar después</span>
          <span>{lowCount} sin prioridad</span>
          <span>{insufficientCount} datos insuficientes</span>
        </div>
        <p className="attribution">
          © OpenStreetMap contributors
        </p>
      </aside>
      {selectedCellId && (
        <div className="cell-info">
          <button className="close" onClick={() => setSelectedCellId(null)}>
            ×
          </button>
          <p>Celda: {selectedCellId}</p>
        </div>
      )}
    </div>
  );
}
