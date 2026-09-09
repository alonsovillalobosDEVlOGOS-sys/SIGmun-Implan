# Validación · Massive Layers Engine · 2026-09-09

## Base de datos

Se verificó sobre la capa real `Edificaciones del municipio de Delicias del estado de Chihuahua 2025 3D` (117,650 polígonos).

Pruebas MVT compactas:

| Zoom | Tile probado | Base64 aprox. | Binario aprox. |
|---:|---|---:|---:|
| 14 | 3391 / 6853 | 706,223 caracteres | ~530 KB |
| 15 | 6783 / 13707 | 403,909 caracteres | ~303 KB |
| 16 | 13567 / 27415 | 115,191 caracteres | ~86 KB |

Una prueba z15 se generó en aproximadamente 0.31 s desde PostgreSQL durante la validación.

También se verificó ejecución con rol `anon` y consulta de atributos completos bajo demanda.

## Frontend

- Todos los archivos JavaScript pasaron `node --check`.
- No hay IDs HTML duplicados.
- No hay referencias locales faltantes.
- Los CSS mantienen balance estructural de llaves.
- Se cargan MapLibre 5.14.0 y PMTiles 4.5.0 desde CDN.
- Recursos locales versionados como `20260909m`.

## Limitación de la prueba

El entorno de validación disponible no permitió completar una prueba visual WebGL con Chromium headless por inicialización GPU/EGL. Las pruebas realizadas cubren sintaxis, estructura, RPC reales de Supabase, permisos RLS/anon y generación MVT. La comprobación visual final debe hacerse en Chrome/Edge/Safari del despliegue real.
