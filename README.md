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

## Modo vivo (gateway)

Opcional. Si `dashboard.config.json` declara un `gateway`, el panel "En vivo"
de la barra lateral consulta `<url>/api/v1/events/latest` cada `pollSeconds`
(60 por defecto, 15 como mínimo) y muestra el último evento que publica el
gateway de Wombat-core:

```json
"gateway": { "url": "https://<host-del-gateway>", "pollSeconds": 60 }
```

- **Es aditivo.** El mapa, el ranking y la insignia "Datos verificados" siguen
  saliendo del bundle estático verificado en el navegador. Sin `gateway`, o si
  el gateway no responde, el dashboard funciona igual (R17); el panel dice
  "Sin conexión".
- **No es verificación del navegador.** La respuesta del gateway no trae
  `issuer` ni `signature`, así que el panel rotula el evento como "comprobado
  por el gateway" y nunca lo suma a las firmas comprobadas.
- **Lo simulado se rotula.** Un evento con `simulation: true`, o cuya
  procedencia no sea `nisar_real`, lleva la insignia "Simulado".
- **La URL va en los dos archivos.** `dashboard.config.json` y
  `public/dashboard.config.json` deben ser idénticos (lo comprueba
  `tests/config.test.ts`). Debe ser `https`: el sitio se sirve por https y el
  navegador bloquearía un gateway `http`.
- **Un túnel `trycloudflare.com` es temporal.** Su dirección cambia cada vez
  que se reinicia; hay que actualizar la URL y volver a desplegar.

El navegador habla HTTP con el gateway; nunca libp2p (R18).

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

## Créditos

- **Verificación y contrato de datos** — Alexsander1207.
- **Frontend: identidad visual, Explorer de mapa y página de metodología** —
  Mireya (`@Mireyamd`) y Ximena (`@Ximenacode`).

El trabajo de frontend se desarrolló originalmente en el repositorio
`Mireyamd/Dashboard_Wambort`, rama `integration/wombat-combined`. Ese
repositorio y este tienen historias de git independientes: no hay ancestro
común entre ambos.

Los archivos traídos desde allí están identificados en el encabezado de cada
uno y en `docs/INTEGRACION-UI.md`.
