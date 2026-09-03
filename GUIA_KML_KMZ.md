# Guía KML/KMZ — SIGmun Delicias

## Qué corrige esta versión

El importador ahora:
- repara automáticamente el namespace `xsi` cuando un KML usa `xsi:schemaLocation` sin declararlo;
- detecta errores XML antes de convertir geometrías;
- utiliza un parser progresivo para KML grandes;
- expande `MultiGeometry` y `GeometryCollection`;
- reconoce `Point`, `Polygon`, `MultiPolygon`, `LineString` y `MultiLineString`;
- recupera atributos almacenados en tablas HTML dentro de `<description>` y en `ExtendedData`;
- conserva `_kml_document`, `_kml_folder` y `_kml_style` como atributos auxiliares;
- registra diagnóstico, conteos y parser utilizado dentro de `sigmun_geo_layers.metadata`.

## Soporte de líneas

Para almacenar líneas en PostGIS se añade la tabla:

`public.sigmun_geo_lines`

con geometría:

`geometry(MultiLineString,4326)`

La migración está en:

`supabase/migrations/20260903_kml_kmz_multiline_support.sql`

También crea `sigmun_insert_geo_line`, `sigmun_insert_geo_batch` y actualiza
`sigmun_geo_layer_geojson()` para que `visor.html` reciba puntos, polígonos y líneas
dentro del mismo FeatureCollection.

Si esta migración todavía no está aplicada, el administrador mantiene compatibilidad:
puede importar puntos y polígonos, y muestra un aviso exacto sobre las líneas omitidas
en vez del antiguo error genérico.

## Archivo PMOTDU analizado

El archivo original contiene 57,827 Placemark:
- 325 de punto
- 5,069 Placemark con polígonos
- 52,433 Placemark con líneas

Además contiene 57,502 `MultiGeometry` y 25 documentos KML internos.

El KML interno pesa aproximadamente 152.65 MB sin comprimir, por lo que se procesa con
el modo progresivo.

Consulta `diagnostico/DIAGNOSTICO_PMOTDU_KMZ.md` para el análisis completo.

## Separación automática por documento

Después de seleccionar el archivo, SIGmun hace un inventario previo. Si detecta más de un `Document`, se habilitan dos modos:

- **Una sola capa:** conserva todo el archivo dentro de una capa.
- **Separar por documento:** crea automáticamente una capa independiente por cada `Document` con geometrías, atributos, metadatos y color inicial propio.

Las capas creadas comparten un `import_group_id` y `source_collection`, por lo que el visor las muestra agrupadas bajo la misma colección y permite encender/apagar cada una o toda la colección.
