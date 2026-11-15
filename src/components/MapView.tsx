/**
 * El mapa: overlays t1/t2/delta y las celdas coloreadas por estado.
 *
 * Dos decisiones que conviene no deshacer sin pensarlas:
 *
 * 1. NO hay basemap de teselas remotas. La regla 7 pide modo estático primero,
 *    sin red, y un mapa que necesita bajar teselas de un servidor ajeno no lo
 *    es. El fondo es un color y encima van los bytes del bundle, que es
 *    exactamente lo que el producto puede acreditar.
 *
 * 2. La rampa de color es secuencial de un solo tono (violeta), no un semáforo.
 *    Rojo-amarillo-verde es lenguaje de alerta, y lo que publica el contrato
 *    es un ORDEN DE REVISIÓN (regla 5). El color indica "primero / después /
 *    sin prioridad", no "peligro / precaución / seguro". `insufficient_quality`
 *    sale en gris neutro, fuera de la rampa: no es un extremo bajo, es la
 *    ausencia de dato.
 */
import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre v6 necesita que Vite empaquete su worker y que se le diga dónde
// quedó. Sin esto el worker no carga, y como MapLibre parsea y dibuja ahí, el
// mapa queda en negro: ni overlays ni celdas, aunque el bundle verifique bien.
// La ruta la resuelve Vite contra la base del despliegue, así que también
// funciona servido bajo /wombat-dashboard/.
maplibregl.setWorkerUrl(workerUrl);

import type { LoadedBundle } from "../bundle/types.ts";
import type { OverlayKey } from "./statusColors.ts";
import { STATUS_COLORS } from "./statusColors.ts";

interface MapViewProps {
  bundle: LoadedBundle;
  overlay: OverlayKey;
  selectedCellId: string | null;
  onSelectCell: (cellId: string | null) => void;
}

export function MapView({ bundle, overlay, selectedCellId, onSelectCell }: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);

  // Montaje. Depende solo del bundle: cambiar de overlay o de selección no
  // reconstruye el mapa, solo ajusta propiedades de capa.
  useEffect(() => {
    if (!container.current) return;

    const [west, south, east, north] = bundle.manifest.bboxWgs84;
    const instance = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "fondo", type: "background", paint: { "background-color": "#0b1020" } }],
      },
      bounds: [
        [west, south],
        [east, north],
      ],
      fitBoundsOptions: { padding: 48 },
      attributionControl: false,
    });
    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    instance.on("load", () => {
      // Los tres overlays se cargan de una y se alternan con la opacidad. Sus
      // bytes ya están verificados y en memoria; volver a crear la fuente en
      // cada cambio obligaría a reconstruir el blob sin ninguna ganancia.
      for (const key of ["t1", "t2", "delta"] as OverlayKey[]) {
        instance.addSource(`overlay-${key}`, {
          type: "image",
          url: bundle.overlays[key],
          // Las esquinas vienen de overlays/bounds.json en el mismo orden que
          // pide MapLibre (arriba-izquierda, arriba-derecha, abajo-derecha,
          // abajo-izquierda), así que se pasan sin reordenar.
          coordinates: bundle.overlays.bounds,
        });
        instance.addLayer({
          id: `overlay-${key}`,
          type: "raster",
          source: `overlay-${key}`,
          paint: {
            "raster-opacity": key === overlay ? 1 : 0,
            "raster-opacity-transition": { duration: 220 },
            "raster-fade-duration": 0,
          },
        });
      }

      const features = bundle.cells.map((cell) => ({
        type: "Feature" as const,
        geometry: cell.geometry ?? { type: "Polygon", coordinates: [] },
        properties: {
          cell_id: cell.cellId,
          status: cell.status,
          rank: cell.rank,
          score_bp: cell.scoreBp,
        },
      }));

      instance.addSource("celdas", { type: "geojson", data: { type: "FeatureCollection", features } });

      instance.addLayer({
        id: "celdas-relleno",
        type: "fill",
        source: "celdas",
        paint: {
          "fill-color": [
            "match",
            ["get", "status"],
            "review_high",
            STATUS_COLORS.review_high,
            "review_medium",
            STATUS_COLORS.review_medium,
            "review_low",
            STATUS_COLORS.review_low,
            "insufficient_quality",
            STATUS_COLORS.insufficient_quality,
            "#64748b",
          ],
          "fill-opacity": [
            "case",
            ["==", ["get", "status"], "insufficient_quality"],
            0.3,
            0.45,
          ],
        },
      });

      instance.addLayer({
        id: "celdas-borde",
        type: "line",
        source: "celdas",
        paint: {
          "line-color": "#e2e8f5",
          "line-width": 0.6,
          "line-opacity": 0.5,
        },
      });

      instance.addLayer({
        id: "celdas-seleccion",
        type: "line",
        source: "celdas",
        filter: ["==", ["get", "cell_id"], ""],
        paint: { "line-color": "#fbbf24", "line-width": 3 },
      });

      instance.on("click", "celdas-relleno", (event: maplibregl.MapMouseEvent & { features?: unknown[] }) => {
        const feature = event.features?.[0] as { properties?: { cell_id?: string } } | undefined;
        if (feature) onSelectCell(String(feature.properties?.cell_id ?? ""));
      });
      instance.on("click", (event: maplibregl.MapMouseEvent) => {
        const hits = instance.queryRenderedFeatures(event.point, { layers: ["celdas-relleno"] });
        if (hits.length === 0) onSelectCell(null);
      });
      instance.on("mouseenter", "celdas-relleno", () => {
        instance.getCanvas().style.cursor = "pointer";
      });
      instance.on("mouseleave", "celdas-relleno", () => {
        instance.getCanvas().style.cursor = "";
      });

      ready.current = true;
    });

    return () => {
      ready.current = false;
      instance.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, onSelectCell]);

  // Cambio de overlay.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    for (const key of ["t1", "t2", "delta"] as OverlayKey[]) {
      if (instance.getLayer(`overlay-${key}`)) {
        instance.setPaintProperty(`overlay-${key}`, "raster-opacity", key === overlay ? 1 : 0);
      }
    }
  }, [overlay]);

  // Cambio de celda seleccionada.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready.current) return;
    if (instance.getLayer("celdas-seleccion")) {
      instance.setFilter("celdas-seleccion", ["==", ["get", "cell_id"], selectedCellId ?? ""]);
    }
  }, [selectedCellId]);

  return <div ref={container} className="mapa" role="application" aria-label="Mapa del área de interés" />;
}
