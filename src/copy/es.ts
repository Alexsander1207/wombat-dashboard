/** Copy for Mireya to connect to JSX. Never replace signed bundle text. */
export const es = {
  brand: { name: 'WOMBAT Explorer', purpose: 'Evidencia para la preparación y la revisión en campo' },
  navigation: { map: 'Mapa', methodology: 'Metodología', backToMap: 'Volver al mapa' },
  controls: {
    aoi: 'Área de interés', overlay: 'Capa de observación', t1: 'Antes (T1)', t2: 'Después (T2)',
    delta: 'Cambio de retrodispersión', layers: 'Capas', compare: 'Comparar observaciones', opacity: 'Opacidad',
    priorities: 'Orden de revisión sugerido', close: 'Cerrar', retry: 'Reintentar',
  },
  origin: {
    simulatedBadge: 'Simulado', simulated: 'Datos simulados de desarrollo; no usar para decisiones operativas.',
    provisionalBadge: 'Provisional',
    provisional: 'Datos NISAR en etapa provisional: útiles para priorizar, no para medir daños.',
    real: 'NISAR real', unknown: 'Procedencia sin clasificar', snapshot: 'Instantánea',
  },
  attribution: {
    osm: '© Colaboradores de OpenStreetMap',
    note: 'Orden de revisión sugerido para preparación · No es un pronóstico',
  },
  integrity: {
    title: 'Integridad del bundle', verified: 'Verificado', notChecked: 'Sin verificar', how: '¿Cómo se verificó?',
    issuer: 'Emisor', blocks: 'Bloques firmados', files: 'Archivos comprobados', contract: 'Versión del contrato',
    asOf: 'Instantánea de verificación',
    steps: [
      'SHA-256 de cada archivo contra index.json.',
      'Firma Ed25519 de cada bloque con la clave fijada para el área de interés.',
      'Cadena de padres completa: cada bloque apunta a padres presentes.',
      'Vigencia contra la fecha de la instantánea, no contra el reloj actual.',
    ],
  },
  states: {
    loading: { title: 'Cargando', detail: 'Verificando y cargando el bundle…' },
    configuration: 'Cargando configuración…', selectingAoi: 'Seleccionando área de interés…',
    verificationFailed: { title: 'La verificación falló', detail: 'No se puede presentar este bundle como verificado. Revisa el detalle del error.' },
    loadFailed: { title: 'No se pudo cargar el bundle', detail: 'Revisa el detalle del error e inténtalo de nuevo.' },
    emptyAoi: { title: 'Área de interés sin datos', detail: 'No hay datos disponibles para mostrar en esta área de interés.' },
    insufficient: { title: 'Datos insuficientes', detail: 'La calidad del dato no permite priorizar esta celda. No equivale a un valor cero.' },
  },
  status: {
    review_high: 'Revisar primero', review_medium: 'Revisar después',
    review_low: 'Sin prioridad de revisión', insufficient_quality: 'Datos insuficientes',
  },
  priorities: {
    title: 'Top 10 · orden de revisión',
    description: 'Hasta diez celdas con mejor puesto publicado en el bloque risk firmado.',
    first: 'Primer puesto de revisión',
    rank: 'Puesto de revisión',
    selected: 'Celda seleccionada',
    otherCells: 'Otras celdas del área de interés',
    insufficient: 'Datos insuficientes · sin puesto ni puntaje',
    note: 'El puesto orienta la preparación y la revisión en campo; no confirma daños.',
  },
  evidence: {
    title: 'Evidencia de la celda', selected: 'Celda seleccionada', why: '¿Por qué revisar esta celda?',
    valid: 'Observaciones válidas', changed: 'Superficie con cambio de retrodispersión',
    magnitude: 'Magnitud del cambio de retrodispersión (p90 absoluto)',
    increased: 'Aumento de retrodispersión', decreased: 'Disminución de retrodispersión',
    roads: 'Exposición vial', water: 'Contexto de agua', provenance: 'Procedencia',
    score: 'Puntaje publicado', rank: 'Puesto de revisión', noRank: 'Sin puesto',
  },
  limitations: 'WOMBAT ayuda a priorizar revisiones en campo durante la preparación. No predice inundaciones, no emite alertas de emergencia ni confirma daños.',
} as const;
