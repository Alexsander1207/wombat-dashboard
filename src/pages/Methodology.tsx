/**
 * Página de metodología.
 *
 * Estructura y maquetación: Mireyamd / Ximenacode (Mireyamd/Dashboard_Wambort,
 * src/pages/Methodology.tsx). El texto se reescribió para describir la
 * verificación WONB 0.2 que este dashboard ejecuta de verdad en el navegador.
 *
 * Vocabulario: "preparación" y "revisión en campo". WOMBAT no emite alertas.
 */
import {
  ArrowLeft,
  ArrowUpRight,
  Activity,
  BookOpen,
  FileCheck2,
  Route,
  Satellite,
  ShieldCheck,
  TriangleAlert,
  Waves,
} from "lucide-react";

export function Methodology({ onBack }: { onBack: () => void }) {
  return (
    <section className="methodology-page">
      <button className="text-button" type="button" onClick={onBack}>
        <ArrowLeft size={16} /> Volver al mapa
      </button>

      <div className="methodology-intro">
        <span className="section-caption">CÓMO SE CONSTRUYE EL ORDEN DE REVISIÓN</span>
        <h1>
          Observar el cambio.
          <br />
          <span>Revisar con contexto y evidencia verificable.</span>
        </h1>
        <p>
          WOMBAT reúne cambio de superficie, contexto de agua y exposición de
          infraestructura para proponer un orden de revisión en campo durante la
          preparación ante El Niño. Cada dato que ves llega dentro de un bundle
          firmado y se verifica en tu navegador antes de dibujarse.
        </p>
      </div>

      <div className="method-grid">
        <article>
          <Satellite />
          <span className="section-caption">01 / OBSERVACIONES</span>
          <h2>NASA NISAR L2 GCOV</h2>
          <p>
            Retrodispersión de radar en dos fechas (t1 y t2), polarización HHHH,
            frecuencia A y espaciado de píxel de 20 m. El bundle declara la
            comparabilidad entre ambas tomas (mismo frame, órbita, modo,
            frecuencia, polarización y madurez); si alguna no coincide, el
            dashboard lo muestra en lugar de ocultarlo.
          </p>
          <a href="https://nisar.jpl.nasa.gov/" target="_blank" rel="noreferrer">
            Ver NISAR <ArrowUpRight size={14} />
          </a>
        </article>

        <article>
          <Waves />
          <span className="section-caption">02 / CONTEXTO DE AGUA</span>
          <h2>NASA OPERA L3 DSWx-S1</h2>
          <p>
            Extensión dinámica de agua superficial derivada de Sentinel-1. Aporta
            corroboración espacial como contexto, con su propio desfase en días
            respecto de cada toma NISAR. Un solapamiento con agua por sí solo no
            establece una inundación.
          </p>
          <a
            href="https://www.jpl.nasa.gov/go/opera/products/"
            target="_blank"
            rel="noreferrer"
          >
            Ver OPERA <ArrowUpRight size={14} />
          </a>
        </article>

        <article>
          <Route />
          <span className="section-caption">03 / INFRAESTRUCTURA</span>
          <h2>OpenStreetMap</h2>
          <p>
            Extracto de vías (<code>highway=*</code>) para medir cuántos metros de
            camino quedan cerca del cambio detectado en cada celda. Sirve para
            estimar exposición, no para afirmar daño.
          </p>
          <a
            href="https://www.openstreetmap.org/about"
            target="_blank"
            rel="noreferrer"
          >
            Sobre OpenStreetMap <ArrowUpRight size={14} />
          </a>
        </article>

        <article>
          <Activity />
          <span className="section-caption">04 / DETECCIÓN DE CAMBIO</span>
          <h2>Cambio con signo (Δ dB)</h2>
          <p>
            El signo indica si la retrodispersión aumentó o disminuyó entre t1 y
            t2, con un umbral declarado en el bloque <code>change</code> firmado
            (3,00 dB en el bundle actual). Ningún signo por sí solo identifica una
            inundación. El dashboard muestra los valores que vienen firmados y no
            recalcula métricas científicas.
          </p>
          <div className="method-scale">
            <span>Retrodispersión menor</span>
            <span>Retrodispersión mayor</span>
          </div>
        </article>

        <article>
          <BookOpen />
          <span className="section-caption">05 / ORDEN DE REVISIÓN</span>
          <h2>Evidencia antes del orden</h2>
          <p>
            La cadena WONB organiza la evidencia:{" "}
            <strong>change y context → risk → action</strong>. Cada bloque
            <code>risk</code> trae el estado de la celda, su puntaje en basis
            points y la explicación en texto; cada bloque <code>action</code> trae
            el rango y a quién va dirigido. La configuración de pesos viaja en{" "}
            <code>risk-config.json</code> con su versión. El navegador respeta ese
            orden: no lo recalcula ni lo reordena.
          </p>
        </article>

        <article>
          <ShieldCheck />
          <span className="section-caption">06 / VERIFICACIÓN EN EL NAVEGADOR</span>
          <h2>WONB 0.2: JCS → SHA-256 → Ed25519</h2>
          <p>
            Cada bloque se canonicaliza con JCS (RFC 8785), se le calcula SHA-256
            y el resultado debe coincidir con su propio campo <code>id</code>.
            Después se verifica su firma <strong>Ed25519</strong> contra el emisor
            fijado para ese AOI en <code>dashboard.config.json</code>: una clave
            que no esté en esa lista se rechaza, aunque la firma sea válida.
          </p>
          <p>
            Además se comprueba el SHA-256 de cada archivo del bundle contra{" "}
            <code>index.json</code>, que la cadena de padres esté completa, y la
            vigencia de cada bloque contra la fecha de la instantánea
            (<code>generated_at</code>), no contra el reloj de quien mira. Si algo
            falla, el panel de integridad lo dice y el dato no se presenta como
            verificado.
          </p>
        </article>

        <article>
          <FileCheck2 />
          <span className="section-caption">07 / CALIDAD DEL DATO</span>
          <h2>Conocer los límites</h2>
          <p>
            Antes de interpretar, revisá observaciones válidas, comparabilidad
            entre tomas, procedencia (<code>data_origin</code>) y madurez del
            producto. Una celda marcada como <em>datos insuficientes</em> no es
            una celda sin riesgo: es una celda donde todavía no se puede decir
            nada.
          </p>
          <p>
            La respuesta del radar varía con vegetación, humedad del suelo,
            rugosidad de la superficie y condiciones de toma. La validación en
            campo sigue siendo necesaria.
          </p>
        </article>
      </div>

      <div className="limitations">
        <TriangleAlert size={24} />
        <div>
          <h2>Una guía para investigar. El juicio humano decide.</h2>
          <p>
            WOMBAT ayuda a priorizar revisiones en campo como parte de la
            preparación. No predice inundaciones ni sustituye a los avisos oficiales de emergencia.
            Cuando el bundle declara <code>data_origin: simulated</code>, el
            dashboard lo muestra en pantalla y esa evidencia no debe usarse para
            decisiones operativas.
          </p>
        </div>
      </div>
    </section>
  );
}
