/**
 * Cascarón de la aplicación.
 *
 * Diseño y maquetación: Mireyamd y Ximenacode (Mireyamd/Dashboard_Wambort,
 * src/App.tsx). Aquí se conectó a la carga y verificación reales: el bundle
 * pasa por loadAndVerify (src/bundle/contract.ts, que usa src/verify) y solo
 * si verifica llega al diseño a través de toExplorer.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ShieldCheck, TriangleAlert } from 'lucide-react'
import {
  loadAndVerify,
  releaseBundle,
  type LoadedBundle,
} from './bundle/contract.ts'
import { toExplorer, type ExplorerCell } from './adapters/toExplorer.ts'
import { MapExplorer } from './components/MapExplorer.tsx'
import { BrandLogo } from './components/BrandLogo'
import { Methodology } from './pages/Methodology.tsx'
import { englishDateTime as readableDateTime, areaName, friendlyError } from './components/explorerCopy.ts'
import './App.css'
import './styles/mireya/theme.css'
import './styles/mireya/brand.css'
import './styles/mireya/navigation.css'
import './styles/mireya/header.css'
import './styles/integration.css'
import './styles/interaction.css'
// Keep the shared theme available; scoped Ocean styles below own the Explorer.
import './styles/theme-light.css'
import './components/Explorer.css'

type View = 'map' | 'methodology'

// Rutas relativas a la base del despliegue. En GitHub Pages el sitio vive en
// /wombat-dashboard/, así que una ruta absoluta como "/dashboard.config.json"
// da 404. import.meta.env.BASE_URL vale "/" en dev y "./" en el build.
const CONFIG_URL = `${import.meta.env.BASE_URL}dashboard.config.json`

interface BundleEntry {
  aoi: string
  version: string
  source: string
  /**
   * Claves públicas pinneadas, como cadenas "ed25519:<hex>": el formato de
   * dashboard.config.json y el que consume scripts/sync-data.mjs.
   */
  issuers: string[]
}

interface Config {
  bundles: BundleEntry[]
}

/** Roles que se conceden a una clave pinneada, igual que en sync-data.mjs. */
const PINNED_ROLES = ['change', 'context', 'risk', 'action']

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [bundle, setBundle] = useState<LoadedBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedBundle, setSelectedBundle] = useState<BundleEntry | null>(null)
  const [view, setView] = useState<View>('map')
  const [selected, setSelected] = useState<ExplorerCell | null>(null)
  const [compare, setCompare] = useState(false)
  const [controls, setControls] = useState(false)
  const [verificationOpen, setVerificationOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // ── 1. Cargar configuración de bundles ───────────────────────────────
  useEffect(() => {
    let cancelled = false
    fetch(CONFIG_URL, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo leer ${CONFIG_URL}`)
        return r.json() as Promise<Config>
      })
      .then((data) => {
        if (!cancelled) {
          setConfig(data)
          if (data.bundles.length > 0) setSelectedBundle(data.bundles[0])
        }
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── 2. Cargar y VERIFICAR el bundle cuando cambia el AOI ─────────────
  useEffect(() => {
    if (!config || !selectedBundle) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    let cancelled = false
    setLoading(true)
    setBundle(null)
    setError(null)
    setSelected(null)
    // Lo que se eligió para un área no vale para la siguiente.
    setCompare(false)
    setControls(false)
    setVerificationOpen(false)

    const base = `${import.meta.env.BASE_URL}bundles/${selectedBundle.aoi}/${selectedBundle.version}`
    // Los roles NO se leen del trusted-issuers.json que viaja dentro del
    // bundle, porque entonces el bundle declararía sus propios permisos.
    const issuers = selectedBundle.issuers.map((pubkey) => ({
      issuer: pubkey,
      roles: PINNED_ROLES,
    }))

    loadAndVerify(base, issuers, undefined, controller.signal)
      .then((b) => {
        if (!cancelled && !controller.signal.aborted) {
          const v = b.verification
          if (v.filesOk && v.blocksOk && v.chainOk && v.issuersOk && v.ttlOk) {
            setBundle(b)
          } else {
            releaseBundle(b)
            setError(`Verification incomplete: ${v.problems.join(' / ')}`)
          }
          setLoading(false)
        } else {
          releaseBundle(b)
        }
      })
      .catch((cause) => {
        if (!cancelled && !controller.signal.aborted) {
          if (cause instanceof DOMException && cause.name === 'AbortError')
            return
          setLoading(false)
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedBundle, config])

  // ── 3. Liberar blobs al descartar un bundle ──────────────────────────
  useEffect(() => {
    return () => {
      if (bundle) releaseBundle(bundle)
    }
  }, [bundle])

  // El adaptador solo traduce; se memoiza para no reconstruir el mapa.
  const explorer = useMemo(() => (bundle ? toExplorer(bundle) : null), [bundle])

  const verification = bundle?.verification
  const verified =
    verification !== undefined &&
    verification.filesOk &&
    verification.blocksOk &&
    verification.chainOk &&
    verification.issuersOk &&
    verification.ttlOk
  const showMap = !loading && !error && bundle !== null && explorer !== null && verified

  return (
    <div className={`explorer-app ${view === 'methodology' ? 'ocean-guide-open' : ''}`}>
      <header className="toolbar explorer-header" hidden={view === 'methodology'}>
        <a className="explorer-brand" href="#explorer" aria-label="WOMBAT Explorer, home" onClick={() => setView('map')}>
          <BrandLogo />
        </a>
        <span className="explorer-header-caption">
          Surface change analysis <small>OCEAN EDITION</small>
        </span>
        {config && selectedBundle && (
          <label htmlFor="aoi-selector">
            Area of interest:
            <select id="aoi-selector" aria-label="Area of interest"
              value={`${selectedBundle.aoi}/${selectedBundle.version}`}
              onChange={(event) => {
                const [aoi, version] = event.target.value.split('/')
                const entry = config.bundles.find(b => b.aoi === aoi && b.version === version)
                if (entry) setSelectedBundle(entry)
              }}>
              {config.bundles.map(b => (
                <option key={`${b.aoi}/${b.version}`} value={`${b.aoi}/${b.version}`}>
                  {b.aoi} / {b.version}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="view-toggle" aria-label="Methodology" onClick={() => setView('methodology')}>
          <BookOpen size={15} /> Methodology
        </button>
      </header>
      {view !== 'methodology' && !error && !showMap && (
        <section className="ocean-load-state explorer-glass" role="status">
          <ShieldCheck size={24} />
          <p>{!config ? 'Loading settings…' : 'Checking the data before showing it…'}</p>
        </section>
      )}
      {view !== 'methodology' && error && (
        <section className="ocean-load-state explorer-glass" role="alert">
          <TriangleAlert size={24} />
          <h2>We could not load this data</h2>
          <p>{friendlyError(error)}</p>
          <button onClick={() => window.location.reload()}>Try again</button>
        </section>
      )}
      {showMap && (
        <>
          <MapExplorer hidden={view === 'methodology'} bundle={explorer}
            selected={selected} onSelect={setSelected} onClearSelection={() => setSelected(null)}
            compare={compare} onCompare={() => setCompare(value => !value)}
            controls={controls} onControls={() => setControls(value => !value)}
            onGuide={() => setView('methodology')} />
          <aside className="explorer-integrity" aria-label="Data summaries" hidden={view === 'methodology'}>
            <section className="integrity-panel" role="status" aria-label="Verification summary">
              <h2>Verified data</h2>
              <p className="integrity-line">{verification!.blocksChecked} signed blocks checked</p>
              <p className="explorer-summary-meta">Bundle: {bundle.aoiId}/{bundle.bundleVersion}</p>
              <p className="explorer-summary-meta">Snapshot: {readableDateTime(verification!.asOf)}</p>
              <button className="verify-how" aria-expanded={verificationOpen} aria-controls="verification-detail"
                onClick={() => setVerificationOpen(value => !value)}>How was this checked?</button>
              <div id="verification-detail" className="verify-how-detail" hidden={!verificationOpen}>
                <strong>How the checks work</strong>
                <ol>
                  <li>Each file is checked for changes using its SHA-256 fingerprint.</li>
                  <li>Each digital signature is checked against a trusted signer.</li>
                  <li>Linked records are checked to make sure none are missing.</li>
                  <li>Expiry dates are checked against the snapshot date.</li>
                </ol>
                <p>{verification!.filesChecked} files checked · Contract {bundle.contractVersion}</p>
                <p>Trusted signer: <code>{selectedBundle?.issuers[0]}</code></p>
                <p>A valid signature confirms the signer and unchanged bytes. It does not prove that a scientific interpretation is correct.</p>
              </div>
              {bundle.integrityWarning && <p role="status">The source note differs from the signed record. The signed record is used.</p>}
            </section>
            <section className="explorer-area-summary" aria-label="Area summary">
              <h2>Area summary</h2>
              <p>{areaName(bundle)}</p>
              {bundle.aoiId === 'tailandia-01' && <p className="explorer-summary-meta">Purpose: method validation</p>}
              <details className="explorer-data-note">
                <summary>About this data</summary>
                <p>Data status: {bundle.dataOrigin === 'simulated' ? 'SIMULATED — sample data' : bundle.manifest.maturity.charAt(0).toUpperCase() + bundle.manifest.maturity.slice(1).toLowerCase()}</p>
                <p>{bundle.dataOrigin === 'nisar_real' ? 'This is real satellite data, but still under review.' : bundle.dataOrigin === 'simulated' ? 'This is a demo, not real satellite data.' : `Source: ${bundle.dataOrigin}`}</p>
                <p>{explorer.cells.length} cells · {explorer.ranked.length} ranked · {explorer.cells.filter(c => c.status === 'insufficient_quality').length} without enough usable data</p>
              </details>
            </section>
          </aside>
        </>
      )}
      {view === 'methodology' && <Methodology onBack={() => setView('map')} bundle={showMap ? bundle : null} />}
    </div>
  )
}
