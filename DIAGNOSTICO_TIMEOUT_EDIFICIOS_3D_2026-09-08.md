# Diagnóstico · timeout capa de edificios 3D · 2026-09-08

## Error observado

`PostgreSQL 57014: canceling statement due to statement timeout`

El error ocurre al solicitar desde `visor.html` la capa **Edificaciones del municipio de Delicias del estado de Chihuahua 2025 3D**.

## Causa

La versión anterior de `sigmun_geo_layer_geojson_page()` construía primero un CTE `all_features` que ejecutaba `ST_AsGeoJSON()` para **todas** las geometrías de la capa y sólo después aplicaba `LIMIT / OFFSET`.

Para la capa de edificios (más de 117 mil huellas) esto obliga a PostgreSQL a serializar prácticamente toda la capa antes de devolver la primera página. El statement timeout de Supabase cancela la consulta antes de terminar.

El problema no es la validez del KMZ ni la geometría 3D; es la estrategia de entrega desde PostGIS.

## Corrección

### Backend

Se crea `sigmun_geo_layer_geojson_page_v2()`:

- aplica `LIMIT / OFFSET` **antes** de `ST_AsGeoJSON()`;
- usa el tipo de geometría de la capa para consultar sólo la tabla necesaria;
- aprovecha `metadata.feature_count` para evitar contar toda la capa en cada página;
- añade índices `(layer_id,id)` para paginación estable;
- mantiene fallback para capas mixtas.

Se crea también `sigmun_geo_layer_geojson_bbox_page_v2()` para capas masivas:

- entrega sólo elementos que intersectan el área visible del mapa;
- pagina el viewport;
- evita transferir 117 mil edificios al navegador de una sola vez.

### Frontend

`supabase-service.js`:

- prefiere RPC v2;
- reduce automáticamente el tamaño de página si detecta error `57014`;
- soporta `geojsonViewport()`;
- permite muestras limitadas en administración.

`visor.js`:

- considera masivas las capas con 30,000+ elementos;
- edificios/polígonos masivos se visualizan desde zoom 14+;
- carga únicamente el viewport visible (máximo configurable);
- actualiza la capa al mover o acercar el mapa;
- la vista 3D usa el mismo conjunto espacial visible;
- evita congelar Leaflet/MapLibre intentando construir 117 mil objetos simultáneamente.

`admin.js`:

- nuevas importaciones grandes quedan marcadas `render_strategy=viewport`;
- el gestor muestra una muestra de hasta 6,000 entidades para edición/previsualización;
- evita descargar toda la capa sólo para abrir el editor.

## Resultado esperado

- Desaparece el error 57014 al abrir la capa.
- A escala municipal la capa informa que requiere zoom 14+.
- Al acercarse, se cargan los edificios del área visible.
- Al desplazarse, SIGmun reemplaza dinámicamente los edificios del viewport.
- En Vista 3D se extruyen únicamente los edificios visibles, manteniendo altura y clasificación.

## Requisito de despliegue

El frontend requiere que se aplique en Supabase:

`supabase/migrations/20260908_geojson_fast_large_layers.sql`

Sin esa migración, el navegador intentará recurrir a la RPC anterior y el timeout puede continuar.
