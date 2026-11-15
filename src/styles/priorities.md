# Integración pendiente para Mireya

`priorities.css` se importa desde `index.css`. No genera posiciones ni modifica datos.

## Clases y contenido

En cada fila usar `priority-row`; en cada marcador DOM, `cell-marker`.
Añadir los modificadores a ese mismo elemento:

| Clase | Condición desde el bundle verificado |
| --- | --- |
| `is-top-ten` | Calidad distinta de `insufficient_quality`, rank entero entre 1 y 10 |
| `is-first` | Cumple Top 10 y `BundleCell.rank === 1` |
| `is-selected` | Su cellId coincide con la selección activa |
| `is-insufficient` | `BundleCell.status === 'insufficient_quality'` |

El número visible debe ser texto real en `priority-rank` (o `.rank` existente),
tomado de `BundleCell.rank`, procedente del payload risk firmado.
El score, cuando exista, va en `priority-score` y viene de `BundleCell.scoreBp`.
No usar el índice del array, contadores CSS, `action.rank` ni valores de fixtures
para sustituir al rank del bloque risk en esta vista.

Agrupar ID y detalle en `priority-content`. Mostrar la etiqueta de calidad en
`priority-quality`. Conectar las etiquetas de `es.priorities` y mantener el ID
visible. Para selección usar también `aria-pressed` en botones y un nombre
accesible que incluya celda, puesto real y estado de selección.

Para calidad insuficiente no renderizar puesto ni puntaje, tampoco en ARIA o
tooltips. Mostrar «Datos insuficientes · sin puesto ni puntaje». CSS oculta
defensivamente los elementos de métricas identificados, pero no puede separar
el score del texto mixto que hoy usa el componente de referencia.

## Límites de la interfaz actual

- App.tsx muestra `bundle.actions.slice(0, 3)` y un título Top 3. Debe conectar
  la nueva lista a las celdas elegibles y sus puestos risk publicados, sin
  recalcular puestos, puntajes ni desempates. No llenar huecos con posiciones
  inventadas ni forzar que siempre existan diez celdas.
- Sus `li` actuales no tienen clases. El estilo neutro mejora su legibilidad;
  no los presenta como Top 10 ni deduce su puesto por su posición DOM.
- MapView usa capas WebGL de MapLibre, no elementos DOM por celda. Una clase en
  el contenedor del canvas no permite estilizar polígonos individuales. Mireya
  debe integrar marcadores DOM con estas clases o estilos equivalentes en el
  renderer: número risk visible para Top 10, doble borde para el primer puesto,
  halo de selección independiente y borde punteado/trama para calidad insuficiente.
  Mantener las demás celdas visibles y sin números/score para calidad insuficiente.
- `_incoming/MapExplorer` tiene marcadores y filas, pero aún no está montado y
  usa referencias a fixtures. No debe conectarse sin adaptar su fuente al bundle
  verificado. Los marcadores actuales muestran ID; hace falta añadir el número
  real como contenido DOM, no mediante CSS.
- Conservar procedencia, SIMULATED, PROVISIONAL y resultado de integridad.

## Comprobación responsive al integrar

Revisar 1920 × 1080, 1366 × 768 y 390 px de ancho con datos verificados:
puestos 1 y 10, otra celda, selección y calidad insuficiente. Comprobar el mapa
con todos sus marcadores para detectar colisiones; CSS no resuelve colisiones
geográficas ni puede validar la visibilidad de elementos todavía no montados.
