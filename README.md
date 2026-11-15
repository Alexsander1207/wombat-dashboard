# Wombat Dashboard

Panel de riesgo de movimiento en masa para el GORE Piura. Consume bundles
WONB v0 publicados e inmutables de Wombat-core, verificándolos antes de
renderizar. No hay dependencia de código de Wombat-core: solo se comparte el
formato del bundle (index.json + bloques WONB 0.2).

## Cómo conectar un bundle nuevo

1. Obtén la versión inmutable publicada de Wombat-core (data/<aoi>/<vN>/ o URL de Pages) y la clave pública de config/trusted-issuers.json.
2. Añade la entrada en dashboard.config.json ({ aoi, version, source, issuers: [clave pública] }).
3. Ejecuta `npm run sync-data -- --aoi <id> --version <vN>`.
4. Ejecuta `npm run build`.
5. Revisa el banner SIMULATED DATA y la madurez (PROVISIONAL/VALIDATED).

Cambiar de bundle = cambiar la entrada en dashboard.config.json, nunca tocar código.

## Scripts

- `npm run dev` — servidor de desarrollo
- `npm run build` — tsc + vite build (producción, sin red)
- `npm run lint` — ESLint
- `npm run sync-data -- --aoi <id> --version <vN>` — sincroniza y verifica un bundle
- `npm test` — suite de pruebas (vitest)

## Arquitectura

- `src/bundle/contract.ts` — único punto que conoce el formato wire (BundleContract).
- `src/bundle/types.ts` — LoadedBundle, tipos internos de la app.
- `src/components/MapView.tsx` — mapa MapLibre con overlays y celdas por estado.
- `scripts/sync-data.mjs` — descarga, verifica y publica bundles inmutables.
- `dashboard.config.json` — lista de bundles y emisores de confianza pinneados.
