# Despliegue · arreglo definitivo de edificios 3D · 2026-09-09

1. Sustituye el contenido del sitio por este paquete.
2. La migración `geojson_viewport_v3_composite_spatial` ya fue aplicada en Supabase Sigmun IMPLAN.
3. No vuelvas a importar el KMZ de edificios: los 117,650 polígonos existentes son válidos.
4. Verifica en Chrome que `visor.js` y `supabase-service.js` carguen con `?v=20260909c`.
5. La vista masiva usa una sola llamada `sigmun_geo_layer_geojson_viewport_v3` por movimiento, sin paginación OFFSET.
6. A zoom 14–15 se usa simplificación geométrica y límite controlado; si hay más edificios que el límite, el visor solicita acercarse en vez de hacer más llamadas.
