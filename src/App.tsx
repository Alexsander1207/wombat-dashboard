import { useEffect, useMemo, useRef, useState } from "react";
import { loadAndVerify, releaseBundle, type LoadedBundle, type LoadProgress } from "./bundle/contract.ts";
import { MapExplorer } from "./components/MapExplorer.tsx";
import { toExplorer } from "./adapters/toExplorer.ts";
import { Methodology } from "./pages/Methodology.tsx";
import type { OverlayKey } from "./components/statusColors.ts";
import { areaName, englishDateTime, friendlyError } from "./components/explorerCopy.ts";
import { LoadingProgress } from "./components/LoadingProgress.tsx";
import { LiveFeed } from "./components/LiveFeed.tsx";
import { pollSecondsOf, useLiveEvents, type GatewayConfig } from "./hooks/useLiveEvents.ts";
import "./App.css";
import "./styles/live.css";

/** Vista activa. Sin react-router: una sola pantalla con dos modos. */
type View = "mapa" | "metodologia";

// Rutas relativas a la base del despliegue. En GitHub Pages el sitio vive en
// /wombat-dashboard/, así que una ruta absoluta como "/dashboard.config.json"
// da 404. import.meta.env.BASE_URL vale "/" en dev y "./" en el build.
const CONFIG_URL = `${import.meta.env.BASE_URL}dashboard.config.json`;

interface BundleEntry {
  aoi: string;
  version: string;
  source: string;
  /**
   * Claves públicas pinneadas, como cadenas "ed25519:<hex>".
   *
   * Este es el formato de dashboard.config.json y el que consume
   * scripts/sync-data.mjs, que es el verificador autoritativo del bundle.
   */
  issuers: string[];
}

/** Roles que se conceden a una clave pinneada, igual que en sync-data.mjs. */
const PINNED_ROLES = ["change", "context", "risk", "action"];

interface Config {
  bundles: BundleEntry[];
  /**
   * Gateway del modo vivo. Opcional: sin él, el dashboard es el de siempre,
   * solo con bundles estáticos (R17).
   */
  gateway?: GatewayConfig;
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [bundle, setBundle] = useState<LoadedBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [overlay, setOverlay] = useState<OverlayKey>("delta");
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<BundleEntry | null>(null);
  const [view, setView] = useState<View>("mapa");
  const [verificationOpen, setVerificationOpen] = useState(false);
  const explorer = useMemo(() => bundle ? toExplorer(bundle) : null, [bundle]);
  const abortRef = useRef<AbortController | null>(null);
  // Modo vivo: aditivo. No toca `bundle` ni la verificación de abajo.
  const gateway = config?.gateway ?? null;
  const live = useLiveEvents(gateway);

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
    setBundle(null);
    setSelectedCellId(null);
    setError(null);
    setProgress(null);

    const base = `${import.meta.env.BASE_URL}bundles/${selectedBundle.aoi}/${selectedBundle.version}`;
    // Las entradas de dashboard.config.json son cadenas de clave pública.
    // Se les concede el mismo conjunto de roles que en sync-data.mjs; los roles
    // NO se leen del trusted-issuers.json que viaja dentro del bundle, porque
    // entonces el bundle declararía sus propios permisos.
    const issuers = selectedBundle.issuers.map((pubkey) => ({
      issuer: pubkey,
      roles: PINNED_ROLES,
    }));

    // Cientos de archivos terminan en ráfaga: la barra se actualiza como mucho
    // una vez por cuadro, con el último avance, no una vez por archivo.
    let latest: LoadProgress | null = null;
    let frame = 0;
    const onProgress = (next: LoadProgress) => {
      latest = next;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!cancelled) setProgress(latest);
      });
    };

    loadAndVerify(base, issuers, undefined, controller.signal, onProgress)
      .then((b) => {
        if (!cancelled && !controller.signal.aborted) {
          const v = b.verification;
          if (!(v.filesOk && v.blocksOk && v.chainOk && v.issuersOk && v.ttlOk)) {
            releaseBundle(b);
            setError(`Verificación incompleta: ${v.problems.join(' / ')}`);
          } else {
            setBundle(b);
          }
          setLoading(false);
        } else {
          releaseBundle(b);
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
      if (frame) cancelAnimationFrame(frame);
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
    return <Methodology onBack={() => setView("mapa")} bundle={bundle} />;
  }

  // ── 5. Estados de error y carga ──────────────────────────────────────
  if (error) {
    return (
      <div className="error">
        <h2>We could not load this data</h2>
        <p>{friendlyError(error)}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
        <button type="button" onClick={() => setView("metodologia")}>
          View methodology
        </button>
      </div>
    );
  }
  // Una sola pantalla de carga para los tres pasos: no salta al avanzar.
  if (!config || !selectedBundle) return <LoadingProgress progress={null} />;
  if (loading || !bundle || !explorer) return <LoadingProgress progress={progress} />;

  // ── 6. Render principal ──────────────────────────────────────────────
  return (
    <div className="app explorer-app">
      <header className="toolbar explorer-header">
        <a className="explorer-brand" href="#explorer" aria-label="WOMBAT Explorer">
          <img src={`${import.meta.env.BASE_URL}brand/wombat-explorer-full-480.webp`} alt="WOMBAT Explorer" width="188" height="54" />
        </a>
        <span className="explorer-header-caption">Surface change analysis <small>OCEAN EDITION</small></span>
        <label htmlFor="aoi-selector">
          Area of interest:
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
        <button
          className="view-toggle"
          type="button"
          onClick={() => setView("metodologia")}
        >
          Methodology
        </button>
      </header>
      <MapExplorer
        key={`${bundle.aoiId}/${bundle.bundleVersion}`}
        bundle={explorer}
        overlay={overlay}
        onOverlayChange={setOverlay}
        selectedCellId={selectedCellId}
        onSelectCell={setSelectedCellId}
        onGuide={() => setView("metodologia")}
      />
      <aside className={`explorer-integrity ${gateway ? "has-live" : ""}`} aria-label="Data summaries">
        <section className="integrity-panel" aria-label="Verification summary">
          <h2>Verified data</h2>
          <p className="integrity-line">{bundle.verification.blocksChecked} signed blocks checked</p>
          <p className="explorer-summary-meta">Bundle: {bundle.aoiId}/{bundle.bundleVersion}</p>
          <p className="explorer-summary-meta">Snapshot: {englishDateTime(bundle.verification.asOf)}</p>
          <button className="verify-how" type="button" aria-expanded={verificationOpen} aria-controls="verification-detail" onClick={() => setVerificationOpen(open => !open)}>
            How was this checked?
          </button>
          <div id="verification-detail" className="verify-how-detail" hidden={!verificationOpen}>
            <strong>How the checks work</strong>
            <ol>
              <li>Each file is checked for changes using its SHA-256 fingerprint.</li>
              <li>Each digital signature is checked against a trusted signer.</li>
              <li>Linked records are checked to make sure none are missing.</li>
              <li>Expiry dates are checked against the snapshot date.</li>
            </ol>
            <p>{bundle.verification.filesChecked} files checked · Contract {bundle.contractVersion}</p>
            <p>Trusted signer: <code>{selectedBundle.issuers[0]}</code></p>
          </div>
          {bundle.integrityWarning && <p className="integrity-warning" role="status">The source note differs from the signed record. The signed record is used.</p>}
        </section>
        <section className="explorer-area-summary" aria-label="Area summary">
          <h2>Area summary</h2>
          <p>{areaName(bundle)}</p>
          {bundle.aoiId === 'tailandia-01' && <p className="explorer-summary-meta">Purpose: method validation</p>}
          <details className="explorer-data-note"><summary>About this data</summary>
            <p>Data status: {bundle.dataOrigin === 'simulated' ? 'SIMULATED — sample data' : bundle.manifest.maturity.charAt(0).toUpperCase() + bundle.manifest.maturity.slice(1).toLowerCase()}</p>
            <p>{bundle.dataOrigin === 'nisar_real' ? 'This is real satellite data, but still under review.' : bundle.dataOrigin === 'simulated' ? 'This is a demo, not real satellite data.' : `Source: ${bundle.dataOrigin}`}</p>
          </details>
        </section>
        {gateway && <LiveFeed state={live} pollSeconds={pollSecondsOf(gateway)} />}
      </aside>

    </div>
  );
}
