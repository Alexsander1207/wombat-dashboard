import { useEffect, useState } from "react";
import { loadAndVerify, releaseBundle, type LoadedBundle } from "./bundle/contract.ts";
import { MapView } from "./components/MapView.tsx";
import type { OverlayKey } from "./components/statusColors.ts";
import { readableDateTime, percentFromBp, statusLabel } from "./format.ts";
import "./App.css";

const BUNDLE_BASE = "/bundles/piura-demo/v0";

const TRUSTED_ISSUERS: { issuer: string; roles: string[] }[] = [
  {
    issuer: "ed25519:92b8169774b5f100de3f37b5ec63b9a10100ae6d1983c4bbdc9b9e7ca6f014be",
    roles: ["change", "context", "risk", "action"],
  },
];

const OVERLAY_LABELS: Record<OverlayKey, string> = {
  t1: "T1",
  t2: "T2",
  delta: "Delta",
};

export default function App() {
  const [bundle, setBundle] = useState<LoadedBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayKey>("delta");
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadAndVerify(BUNDLE_BASE, TRUSTED_ISSUERS)
      .then((b) => {
        if (!cancelled) {
          setBundle(b);
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoading(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (bundle) releaseBundle(bundle);
    };
  }, [bundle]);

  if (error) {
    return (
      <div className="error">
        <h2>No se pudo cargar el bundle</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Reintentar</button>
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

  const top3 = bundle.actions.slice(0, 3);
  const simulated = bundle.dataOrigin === "simulated";
  const highCount = bundle.cells.filter((c: { status: string }) => c.status === "review_high").length;
  const mediumCount = bundle.cells.filter((c: { status: string }) => c.status === "review_medium").length;
  const lowCount = bundle.cells.filter((c: { status: string }) => c.status === "review_low").length;
  const insufficientCount = bundle.cells.filter((c: { status: string }) => c.status === "insufficient_quality").length;

  return (
    <div className="app">
      {simulated && (
        <div className="banner simulated">
          SIMULATED DATA — fixture de desarrollo, no es un AOI real
        </div>
      )}
      <header className="toolbar">
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
          {bundle.aoiId} / {bundle.bundleVersion} ·
          {readableDateTime(bundle.verification.asOf)} · instantánea
        </span>
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
        <h2>Top 3 — orden de revisión sugerido</h2>
        <p>
          Madurez: <strong>{bundle.manifest.maturity}</strong> ·
          Intervalo: {readableDateTime(bundle.t1)} → {readableDateTime(bundle.t2)} ·
          OPERA derivado de Sentinel-1 ({bundle.manifest.operaDerivedFrom})
        </p>
        {bundle.integrityWarning && (
          <div className="integrity-warning">
            ⚠ {bundle.integrityWarning}
          </div>
        )}
        <ul>
          {top3.map((action: { cellId: string; rank: number; action: string; audience: string }) => {
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
