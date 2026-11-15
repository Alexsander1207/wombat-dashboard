import { useEffect, useState } from "react";
import { loadBundle, releaseBundle, type VerifiedBundle } from "./data/loadBundle.ts";
import { MapView } from "./components/MapView.tsx";
import type { OverlayKey } from "./components/statusColors.ts";
import { readableDateTime } from "./format.ts";
import "./App.css";

const BUNDLE_BASE = "/data/piura-demo/v0";

const OVERLAY_LABELS: Record<OverlayKey, string> = {
  t1: "T1",
  t2: "T2",
  delta: "Delta",
};

export default function App() {
  const [bundle, setBundle] = useState<VerifiedBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayKey>("delta");
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadBundle(BUNDLE_BASE)
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

  return (
    <div className="app">
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
          {bundle.index.aoi_id} / {bundle.index.bundle_version} ·
          {readableDateTime(bundle.index.generated_at)}
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
      {selectedCellId && (
        <aside className="cell-info">
          <button className="close" onClick={() => setSelectedCellId(null)}>
            ×
          </button>
          <p>Celda: {selectedCellId}</p>
        </aside>
      )}
    </div>
  );
}
