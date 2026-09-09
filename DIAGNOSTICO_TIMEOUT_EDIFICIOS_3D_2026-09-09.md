# Arreglo definitivo · edificios 3D masivos · 2026-09-09

## Causa confirmada
El RPC `sigmun_geo_layer_geojson_bbox_page_v2()` se paginaba repetidamente con OFFSET. Para un viewport urbano con miles de edificios cada página repetía el filtrado espacial y la serialización; tras varias páginas algunas llamadas excedían el `statement_timeout` de PostgREST y devolvían HTTP 500 / PostgreSQL 57014.

## Solución aplicada
- Nuevo RPC `sigmun_geo_layer_geojson_viewport_v3()`.
- Una sola consulta por viewport, sin bucle OFFSET.
- Límite duro por vista (900–1800 entidades según zoom).
- Simplificación geométrica adaptativa por zoom.
- `has_more=true` indica que el usuario debe acercarse; no dispara más páginas.
- `SECURITY INVOKER`, conservando RLS.
- Índices espaciales compuestos disponibles con `btree_gist`.
- El cliente usa `viewport_v3` y solo recurre a `bbox_v2` si la función no existe.
- En timeout de v3 hace un único reintento con menor límite y mayor simplificación; no entra en bucle.

## Prueba en la capa real
Capa: `Edificaciones del municipio de Delicias del estado de Chihuahua 2025 3D`.
Total: 117,650 polígonos.
Prueba `viewport_v3`: 1,200 edificios devueltos en ~0.52 s en consulta SQL bajo rol `anon`, respuesta ~1.8 MB.
Prueba 1,800 edificios: ~0.47 s con caché caliente, respuesta ~2.7 MB.

Este patrón evita el error 57014 y mantiene la vista 2D/3D fluida.
