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
import {
  TOP_COUNT,
  toExplorer,
  type ExplorerCell,
} from './adapters/toExplorer.ts'
import { STATUS_FILL, STATUS_LEGEND } from './frontend/statusColors.ts'
import { MapExplorer } from './components/MapExplorer.tsx'
import { BrandLogo } from './components/BrandLogo'
import { FloatingNavigation } from './components/FloatingNavigation'
import { EvidenceCard, EvidenceDetails } from './components/Evidence'
import { LiveFeed } from './components/LiveFeed.tsx'
import {
  pollSecondsOf,
  useLiveEvents,
  type GatewayConfig,
} from './hooks/useLiveEvents.ts'
import { Methodology } from './pages/Methodology.tsx'
import { readableDateTime } from './format.ts'
import { es } from './copy/es.ts'
import './App.css'
import './styles/mireya/theme.css'
import './styles/mireya/brand.css'
import './styles/mireya/navigation.css'
import './styles/mireya/header.css'
import './styles/integration.css'
import './styles/interaction.css'
import './styles/live.css'
// El último: tema claro cuando el sistema lo pide (el oscuro no cambia).
import './styles/theme-light.css'

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
  /**
   * Gateway del modo vivo. Opcional: sin él, el dashboard es el de siempre,
   * solo con bundles estáticos (R17).
   */
  gateway?: GatewayConfig
}

/** Roles que se conceden a una clave pinneada, igual que en sync-data.mjs. */
const PINNED_ROLES = ['change', 'context', 'risk', 'action']

/**
 * Insignia de procedencia, derivada del bloque `change` FIRMADO, nunca del
 * manifiesto: si los dos discrepan, contract.ts lo expone como
 * integrityWarning y la insignia sigue al dato firmado.
 */
function originBadge(dataOrigin: string, maturity: string): string {
  if (dataOrigin === 'nisar_real') {
    const mat = maturity === 'PROVISIONAL' ? 'etapa provisional' : maturity.toLowerCase()
    return `Datos reales del satélite NISAR · ${mat}`
  }
  if (dataOrigin === 'simulated')
    return 'Datos simulados de prueba · no es un lugar real'
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
  const abortRef = useRef<AbortController | null>(null)
  // Modo vivo: aditivo. No toca `bundle` ni la verificación de abajo.
  const gateway = config?.gateway ?? null
  const live = useLiveEvents(gateway)

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
    // Lo que se eligió para un área no vale para la siguiente.
    setCompare(false)
    setControls(false)

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
            {!showMap
              ? 'Orden de revisión sugerido'
              : bundle.dataOrigin === 'simulated'
                ? 'Área de demostración'
                : explorer.aoiName}
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
                ? `Datos verificados · ${verification.blocksChecked} firmas comprobadas`
                : 'Los datos no pasaron la verificación'}
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
                aria-label="Área de estudio"
                value={`${selectedBundle.aoi}/${selectedBundle.version}`}
                onChange={(e) => {
                  const [aoi, version] = e.target.value.split('/')
                  const entry = config.bundles.find(
                    (b) => b.aoi === aoi && b.version === version,
                  )
                  if (entry) setSelectedBundle(entry)
                }}
              >
                {config.bundles.map((b) => {
                  const label =
                    b.aoi === 'tailandia-01'
                      ? 'Tailandia (oeste de Ayutthaya)'
                      : b.aoi === 'piura-demo'
                        ? 'Piura demo'
                        : b.aoi
                  return (
                    <option
                      key={`${b.aoi}/${b.version}`}
                      value={`${b.aoi}/${b.version}`}
                    >
                      {label} · {b.version}
                    </option>
                  )
                })}
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
              <p>Verificando y cargando los datos…</p>
            </section>
          )}
          {view !== 'methodology' && error && (
            <section className="panel evidence-empty" role="alert">
              <TriangleAlert size={25} />
              <h2>No se pudieron cargar los datos</h2>
              <p>No se pudo cargar el bundle: {error}</p>
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
              <div
                className={`stage ${view === 'methodology' ? 'is-hidden' : ''}`}
              >
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
                    if (destination === 'layers') {
                      setView('map')
                      setControls((value) => !value)
                    } else {
                      setControls(false)
                      setView(
                        destination === 'guide'
                          ? 'methodology'
                          : destination === 'evidence' && selected
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
                  compare={compare && view !== 'methodology'}
                  onCompare={() => setCompare(!compare)}
                  controls={controls && view !== 'methodology'}
                  onControls={() => setControls((value) => !value)}
                />
              </div>
              {/* Barra lateral acoplada: no flota sobre el mapa. */}
              {view !== 'methodology' && (
                <aside
                  className={`side-dock ${selected ? 'has-card' : ''}`}
                  aria-label="Orden de revisión sugerido"
                >
                  {view === 'evidence' && selected ? (
                    <>
                      <button
                        className="dock-back"
                        onClick={() => setView('map')}
                      >
                        <ChevronLeft size={15} /> Volver al resumen
                      </button>
                      <EvidenceDetails
                        cell={selected}
                        onClose={() => setView('map')}
                      />
                    </>
                  ) : (
                    <>
                      <div className="dock-intro">
                        <h2>Dónde revisar primero</h2>
                        <p>
                          El satélite miró esta área dos veces. Estas son las
                          zonas donde más cambió la superficie: el orden
                          sugerido para ir a revisar en campo.
                        </p>
                        <ul className="dock-counts">
                          {STATUS_LEGEND.map(([status, label]) => (
                            <li key={status}>
                              <i style={{ background: STATUS_FILL[status] }} />
                              <strong>
                                {
                                  explorer.cells.filter(
                                    (cell) => cell.status === status,
                                  ).length
                                }
                              </strong>{' '}
                              {label.toLowerCase()}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {gateway && (
                        <LiveFeed
                          state={live}
                          pollSeconds={pollSecondsOf(gateway)}
                        />
                      )}
                      <div className="dock-top">
                        {explorer.ranked.slice(0, TOP_COUNT).map((cell) => (
                          <button
                            className={`priority-row is-top-ten ${cell.rank === 1 ? 'is-first' : ''} ${selected?.id === cell.id ? 'selected is-selected' : ''}`}
                            key={cell.id}
                            aria-pressed={selected?.id === cell.id}
                            onClick={() => setSelected(cell)}
                          >
                            <span className={`rank rank-${cell.rank}`}>
                              {cell.rank}
                            </span>
                            <span>
                              <strong>{cell.label}</strong>
                              <small>
                                Prioridad{' '}
                                {cell.score === null
                                  ? 'sin dato'
                                  : `${Math.round(cell.score * 100)} de 100`}{' '}
                                · {cell.statusLabel}
                              </small>
                            </span>
                            <span className="priority-arrow">↗</span>
                          </button>
                        ))}
                      </div>
                      {selected ? (
                        <EvidenceCard
                          cell={selected}
                          before={explorer.before.date}
                          after={explorer.after.date}
                          onClose={() => setSelected(null)}
                          onExpand={() => setView('evidence')}
                        />
                      ) : (
                        <p className="dock-hint">
                          Toca una zona del mapa o de la lista para ver por
                          qué se sugiere revisarla.
                        </p>
                      )}
                    </>
                  )}
                </aside>
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
            área {bundle.aoiId}/{bundle.bundleVersion} · instantánea{' '}
            {readableDateTime(verification.asOf)} · contrato{' '}
            {bundle.contractVersion}
            {!verification.ttlOk && ' · hay bloques fuera de vigencia'}
            {bundle.integrityWarning && ` · ⚠ ${bundle.integrityWarning}`}
          </span>
        ) : (
          <span className="integrity-line">
            <ShieldCheck size={12} />{' '}
            {error ? 'Datos no verificados' : 'Verificando los datos…'}
          </span>
        )}
        <span>
          Orden de revisión sugerido para preparación · No es un pronóstico ·{' '}
          {es.attribution.osm}
        </span>
      </footer>
    </div>
  )
}
