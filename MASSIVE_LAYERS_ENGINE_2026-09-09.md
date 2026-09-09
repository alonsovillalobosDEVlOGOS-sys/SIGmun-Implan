# SIGmun Delicias · Massive Layers Engine · 2026-09-09

## Objetivo

Extender SIGmun sin sustituir los motores existentes. El visor conserva GeoJSON estándar, paginación y viewport PostGIS como compatibilidad, y agrega dos motores para capas extensas:

- **MVT dinámico**: teselas vectoriales generadas por PostGIS y renderizadas por MapLibre GL/WebGL.
- **PMTiles**: archivo teselado estático servido desde CDN/objeto con HTTP Range.

## Selección automática

El visor decide el motor sin modificar los datos geográficos almacenados:

| Condición aproximada | Motor |
|---|---|
| capa pequeña o mediana | GeoJSON estándar |
| 30,000+ entidades no elegibles para MVT | Viewport PostGIS |
| 100,000+ puntos/líneas/polígonos | MVT |
| 15,000+ líneas | MVT |
| URL PMTiles configurada | PMTiles |

La estrategia puede cambiarse desde `admin.html` por capa. `Automático recomendado` es la opción preferida.

## MVT dinámico

El frontend usa el protocolo interno `sigmvt://` de MapLibre. Cada tile solicita a Supabase únicamente su cuadrante `z/x/y`. PostGIS crea el PBF mediante `ST_TileEnvelope`, filtro espacial, `ST_AsMVTGeom` y `ST_AsMVT`.

Para minimizar tráfico, el tile contiene sólo los campos necesarios para simbología, 3D y selección. Al hacer clic sobre una entidad, SIGmun consulta sus atributos completos con una RPC separada.

### RPC instaladas

- `sigmun_geo_layer_mvt_v1(layer_id,z,x,y,feature_limit)`
- `sigmun_geo_feature_properties_v1(layer_id,feature_id)`

Ambas son `SECURITY INVOKER` y respetan las políticas RLS existentes. No se creó una copia de los datos ni se modificaron las geometrías existentes.

## 2D y 3D

- Leaflet continúa manejando mapas base, herramientas, capas normales, medición y dibujo.
- MapLibre transparente se superpone para MVT/PMTiles en 2D.
- La vista 3D reutiliza las mismas teselas y usa `fill-extrusion` según el campo de altura configurado.
- La leyenda, filtros por clase, opacidad y selección siguen vinculados a la definición original de la capa.

## Caché

SIGmun mantiene un LRU de teselas MVT en memoria y MapLibre conserva su propio caché de tiles. Esto evita volver a consultar PostgreSQL cuando el usuario regresa a un área ya visitada durante la sesión.

## PMTiles

PMTiles es opcional y está orientado a capas muy grandes que cambian poco, por ejemplo edificios de una edición censal, manzanas, AGEB, red vial histórica o una versión aprobada de un plan.

En `admin.html` se configura:

1. Estrategia: `PMTiles`.
2. URL pública del `.pmtiles`.
3. Source layer interno, recomendado: `sigmun`.
4. Zoom mínimo.

El archivo debe alojarse en un origen compatible con solicitudes HTTP Range y CORS.

## Compatibilidad

No se retiró ninguna función anterior. Si una capa no puede usar MVT/PMTiles, SIGmun mantiene `viewport_v3` o GeoJSON como fallback.
