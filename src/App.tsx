/**
 * Cascarón de la aplicación.
 *
 * Diseño y maquetación: Mireyamd y Ximenacode (Mireyamd/Dashboard_Wambort,
 * src/App.tsx). Aquí se conectó a la carga y verificación reales: el bundle
 * pasa por loadAndVerify (src/bundle/contract.ts, que usa src/verify) y solo
 * si verifica llega al diseño a través de toExplorer.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ShieldCheck, ChevronLeft, TriangleAlert } from 'lucide-react'
import {
  loadAndVerify,
  releaseBundle,
  type LoadedBundle,
} from './bundle/contract.ts'
import { toExplorer, type ExplorerCell } from './adapters/toExplorer.ts'
import { MapExplorer } from './components/MapExplorer.tsx'
import { BrandLogo } from './components/BrandLogo'
import { FloatingNavigation } from './components/FloatingNavigation'
import { EvidenceCard, EvidenceDetails } from './components/Evidence'
import { Methodology } from './pages/Methodology.tsx'
import { readableDateTime } from './format.ts'
import './App.css'
import './styles/mireya/theme.css'
import './styles/mireya/brand.css'
import './styles/mireya/navigation.css'
import './styles/mireya/header.css'
import './styles/integration.css'

type View = 'map' | 'evidence' | 'methodology'

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

/**
 * Insignia de procedencia, derivada del bloque `change` FIRMADO, nunca del
 * manifiesto: si los dos discrepan, contract.ts lo expone como
 * integrityWarning y la insignia sigue al dato firmado.
 */
function originBadge(dataOrigin: string, maturity: string): string {
  if (dataOrigin === 'nisar_real') return `NISAR real · ${maturity}`
  if (dataOrigin === 'simulated')
    return 'SIMULATED — fixture de desarrollo, no es un AOI real'
  return `Procedencia sin clasificar: ${dataOrigin} · ${maturity}`
}

function abbrIssuer(issuer: string): string {
  const hex = issuer.replace('ed25519:', '')
  return `${hex.slice(0, 12)}…${hex.slice(-8)}`
}

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
  const [priorityOpen, setPriorityOpen] = useState(false)
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
    setError(null)
    setSelected(null)

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
          setBundle(b)
          setLoading(false)
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

  useEffect(() => {
    // Bring explicitly requested evidence into view, including on narrow screens.
    if (view === 'evidence')
      document
        .querySelector<HTMLButtonElement>(
          '.evidence-details .evidence-top button, .evidence-empty button',
        )
        ?.focus()
  }, [view])

  const showMap = !loading && !error && bundle !== null && explorer !== null
  const verification = bundle?.verification
  const verified =
    verification !== undefined &&
    verification.filesOk &&
    verification.blocksOk &&
    verification.chainOk &&
    verification.issuersOk

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#explorer"
          onClick={() => setView('map')}
          aria-label="WOMBAT Explorer, inicio"
        >
          <BrandLogo />
        </a>
        <div className="header-context">
          <span className="subtitle">Preparación ante El Niño</span>
          <span className="study-area-metadata">
            {showMap ? explorer.aoiName : 'Orden de revisión sugerido'}
          </span>
        </div>
        <div className="header-actions">
          {showMap && verification && (
            <span
              className={`integrity-chip ${verified ? 'integrity-ok' : 'integrity-bad'}`}
              title="Hash SHA-256 y firma Ed25519 de cada bloque, comprobados en este navegador"
            >
              <ShieldCheck size={14} />
              {verified
                ? `${verification.blocksChecked} bloques firmados verificados`
                : 'Verificación con problemas'}
            </span>
          )}
          {showMap && (
            <span className={`data-badge origin-${bundle.dataOrigin}`}>
              {originBadge(bundle.dataOrigin, bundle.manifest.maturity)}
            </span>
          )}
          {config && selectedBundle && (
            <label className="aoi-picker">
              <select
                id="aoi-selector"
                aria-label="Área de interés"
                value={`${selectedBundle.aoi}/${selectedBundle.version}`}
                onChange={(e) => {
                  const [aoi, version] = e.target.value.split('/')
                  const entry = config.bundles.find(
                    (b) => b.aoi === aoi && b.version === version,
                  )
                  if (entry) setSelectedBundle(entry)
                }}
              >
                {config.bundles.map((b) => (
                  <option
                    key={`${b.aoi}/${b.version}`}
                    value={`${b.aoi}/${b.version}`}
                  >
                    {b.aoi} / {b.version}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            aria-label={
              view === 'methodology' ? 'Volver al mapa' : 'Abrir la metodología'
            }
            className={view === 'methodology' ? 'active' : ''}
            onClick={() =>
              setView(view === 'methodology' ? 'map' : 'methodology')
            }
          >
            <BookOpen size={15} /> <span>Metodología</span>
          </button>
        </div>
      </header>
      <div className="workspace">
        <main
          className={`main-workspace ${view === 'evidence' ? 'detail-view' : ''}`}
        >
          {view !== 'methodology' && !config && !error && (
            <section className="panel evidence-empty" role="status">
              <p>Cargando configuración…</p>
            </section>
          )}
          {view !== 'methodology' && config && loading && !error && (
            <section className="panel evidence-empty" role="status">
              <ShieldCheck size={25} />
              <p>Verificando y cargando el bundle…</p>
            </section>
          )}
          {view !== 'methodology' && error && (
            <section className="panel evidence-empty" role="alert">
              <TriangleAlert size={25} />
              <h2>No se pudo cargar el bundle</h2>
              <p>{error}</p>
              <button
                className="primary-button"
                onClick={() => window.location.reload()}
              >
                Reintentar
              </button>
            </section>
          )}
          {showMap && (
            <>
              <FloatingNavigation
                active={
                  view === 'methodology'
                    ? 'guide'
                    : view === 'evidence'
                      ? 'evidence'
                      : controls
                        ? 'layers'
                        : 'explore'
                }
                onNavigate={(destination) => {
                  setPriorityOpen(false)
                  if (destination === 'layers') {
                    setView('map')
                    setControls((value) => !value)
                  } else {
                    setControls(false)
                    setView(
                      destination === 'guide'
                        ? 'methodology'
                        : destination === 'evidence'
                          ? 'evidence'
                          : 'map',
                    )
                  }
                }}
              />
              <MapExplorer
                hidden={view === 'methodology'}
                bundle={explorer}
                selected={selected}
                onSelect={setSelected}
                compare={compare && view === 'map'}
                onCompare={() => setCompare(!compare)}
                controls={controls && view === 'map'}
                onControls={() => {
                  setControls((value) => !value)
                  setPriorityOpen(false)
                }}
                priorityOpen={priorityOpen && view === 'map'}
                onPriority={() => {
                  setPriorityOpen((value) => !value)
                  setControls(false)
                }}
              />
              {view === 'map' && selected && (
                <EvidenceCard
                  cell={selected}
                  before={explorer.before.date}
                  after={explorer.after.date}
                  onClose={() => setSelected(null)}
                  onExpand={() => setView('evidence')}
                />
              )}
              {view === 'evidence' && !selected && (
                <section className="panel evidence-empty" role="status">
                  <ShieldCheck size={25} />
                  <h2>No hay una celda seleccionada</h2>
                  <p>
                    Elige una celda en el mapa o una del orden de revisión
                    sugerido para ver su evidencia.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => setView('map')}
                  >
                    Explorar el mapa
                  </button>
                </section>
              )}
              {view === 'evidence' && selected && (
                <>
                  <button className="back-map" onClick={() => setView('map')}>
                    <ChevronLeft size={15} /> Volver al mapa
                  </button>
                  <EvidenceDetails
                    cell={selected}
                    onClose={() => setView('map')}
                  />
                </>
              )}
            </>
          )}
          {view === 'methodology' && (
            <Methodology onBack={() => setView('map')} />
          )}
        </main>
      </div>
      <footer className="app-footer">
        {/* Insignia de integridad: refleja el resultado real de la verificación. */}
        {showMap && verification ? (
          <span
            className={`integrity-line ${verified ? 'integrity-ok' : 'integrity-bad'}`}
          >
            <ShieldCheck size={12} />{' '}
            {verified ? 'Verificado' : 'Verificación con problemas'}:{' '}
            {verification.blocksChecked} bloques firmados por{' '}
            {selectedBundle ? abbrIssuer(selectedBundle.issuers[0]) : ''} ·
            bundle {bundle.aoiId}/{bundle.bundleVersion} · instantánea{' '}
            {readableDateTime(verification.asOf)} · contrato{' '}
            {bundle.contractVersion}
            {!verification.ttlOk && ' · hay bloques fuera de vigencia'}
            {bundle.integrityWarning && ` · ⚠ ${bundle.integrityWarning}`}
          </span>
        ) : (
          <span className="integrity-line">
            <ShieldCheck size={12} />{' '}
            {error ? 'Bundle no verificado' : 'Verificando el bundle…'}
          </span>
        )}
        <span>
          Orden de revisión sugerido para preparación · No es un pronóstico ·
          © OpenStreetMap contributors
        </span>
      </footer>
    </div>
  )
}
