/**
 * Pantalla de "Loading…": el wombat, el texto y la barra de avance, sin tarjeta.
 *
 * Usa el mismo marcado y las mismas clases que la pantalla de carga estática
 * de index.html (allí están los estilos): al montar React nada salta, la barra
 * solo pasa de "esperando" a mostrar el avance real de la verificación.
 */
import type { CSSProperties } from 'react'
import type { LoadProgress } from '../bundle/contract.ts'

/** El wombat animado (public/brand), el mismo que pinta index.html. */
const MASCOT = import.meta.env.BASE_URL + 'brand/'

interface Props {
  /** null mientras aún no se sabe cuántos archivos hay. */
  progress: LoadProgress | null
}

export function LoadingProgress({ progress }: Props) {
  const known = progress !== null && progress.total > 0
  const fraction = known ? progress.fraction : 0
  // Hacia abajo: 100 solo cuando de verdad llegó todo. No se muestra; lo lee
  // el lector de pantalla en la barra.
  const percent = Math.floor(fraction * 100)

  return (
    <div className="boot-loader">
      <section
        className={`boot-loader-card ${known ? '' : 'is-indeterminate'}`}
        aria-label="Loading the verified data"
      >
        <picture className="boot-loader-mascot" aria-hidden="true">
          <source
            srcSet={`${MASCOT}wombat-loading-still.webp`}
            media="(prefers-reduced-motion: reduce)"
          />
          <img src={`${MASCOT}wombat-loading.webp`} width={120} height={80} alt="" />
        </picture>
        <p className="boot-loader-title" role="status">
          Loading…
        </p>
        <div
          className="boot-loader-track"
          role="progressbar"
          aria-label="Loading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={known ? percent : undefined}
        >
          <span
            className="boot-loader-bar"
            style={{ '--progress': fraction } as CSSProperties}
          />
        </div>
      </section>
    </div>
  )
}
