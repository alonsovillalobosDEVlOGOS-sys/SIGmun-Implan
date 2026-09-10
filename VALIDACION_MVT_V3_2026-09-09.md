# Validación MVT v3 · 2026-09-09

## Base de datos

Capa probada: `Edificaciones del municipio de Delicias del estado de Chihuahua 2025 3D`.
Total: 117,650 polígonos.

### Densidad real

- Tile z15/6784/13710: 5,111 edificios por centroide (tile más denso detectado).
- Tile z16/13569/27419: 1,490 edificios (máximo detectado en z16).

### Comparativa bajo rol `anon`

Consulta espacial anterior con RLS:
- revisó 117,650 filas;
- tiempo observado en EXPLAIN ANALYZE: ~12.4 s;
- resultado: susceptible a timeout 57014.

`sigmun_geo_layer_mvt_v3()` bajo `anon`:
- tile z15/6784/13710: 531,073 caracteres base64;
- primera ejecución observada: ~1.95 s;
- ejecución con bloques en caché: ~0.31 s;
- misma llamada con `statement_timeout = 5s`: completó correctamente.

Se probaron además 8 de los tiles z15 más densos y un tile z16; todos devolvieron MVT no vacío.
El zoom 14 devuelve vacío para esta capa porque `mvt_min_zoom = 15`, evitando tiles incompletos de más de 13 mil edificios.

## Frontend

- `supabase-service.js` llama primero a `sigmun_geo_layer_mvt_v3`.
- máximo 2 RPC MVT concurrentes;
- solicitudes idénticas se deduplican;
- cache LRU de 224 tiles;
- reintento único en timeout;
- fallback automático MVT → viewport;
- `massiveMinZoom()` respeta `metadata.mvt_min_zoom`;
- cache busting: `20260909r`.

## Validación estática

Todos los JavaScript pasan `node --check`.
Referencias HTML locales e IDs se validan antes de empaquetar.
