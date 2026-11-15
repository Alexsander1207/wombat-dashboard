/**
 * Tarjeta de "Cargando…" con barra de avance.
 *
 * Usa el mismo marcado y las mismas clases que la pantalla de carga estática
 * de index.html (allí están los estilos): al montar React la tarjeta no salta,
 * solo pasa de "esperando" a mostrar el avance real de la verificación.
 */
import type { CSSProperties } from 'react'
import type { LoadProgress } from '../bundle/contract.ts'

interface Props {
  /** null mientras aún no se sabe cuántos archivos hay. */
  progress: LoadProgress | null
}

export function LoadingProgress({ progress }: Props) {
  const known = progress !== null && progress.total > 0
  const fraction = known ? progress.fraction : 0
  // Hacia abajo: "100 %" solo cuando de verdad llegó todo.
  const percent = Math.floor(fraction * 100)

  const detail = !known
    ? 'Preparando los datos'
    : progress.stage === 'signatures'
      ? 'Comprobando las firmas de los bloques'
      : `Verificando archivos · ${progress.done} de ${progress.total}`

  return (
    <div className="boot-loader">
      <section
        className={`boot-loader-card ${known ? '' : 'is-indeterminate'}`}
        aria-label="Carga de los datos verificados"
      >
        <div className="boot-loader-head">
          <p className="boot-loader-title" role="status">
            Cargando…
          </p>
          {known && <span className="boot-loader-percent">{percent} %</span>}
        </div>
        <div
          className="boot-loader-track"
          role="progressbar"
          aria-label="Avance de la carga"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={known ? percent : undefined}
        >
          <span
            className="boot-loader-bar"
            style={{ '--progress': fraction } as CSSProperties}
          />
        </div>
        <p className="boot-loader-detail">{detail}</p>
      </section>
    </div>
  )
}
