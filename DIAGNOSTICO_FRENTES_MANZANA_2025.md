# Diagnóstico · Delicias_Chihuahua_Frentes_Manzana_2025.kmz

## Estructura real del archivo

- KMZ: ~1.55 MB comprimido.
- `doc.kml`: 28,050,088 bytes descomprimido.
- 16,159 `Placemark`.
- 16,159 `LineString`.
- 0 `Polygon` / `MultiPolygon`.
- 0 `Point`.
- 0 `MultiGeometry`.
- 1 `Document` y 1 `Folder` (`Delicias, Chihuahua`).
- 1 estilo KML: `#frenteManzana`.
- Simbología original: color KML `ff9b5a16` = `#165a9b`, ancho 2.
- 29 atributos por frente: EDICION, VERSION, TIPO_GEO, CVEGEO, CVE_ENT, CVE_MUN, CVE_LOC, CVE_AGEB, CVE_MZA, CVEVIAL, CVESEG, CVEFT, NOMVIAL, TIPOVIAL, referencias, etc.

**Importante:** es una capa de *frentes de manzana* (segmentos lineales), no una capa poligonal de manzanas. Por eso SIGmun debe almacenarla y dibujarla como `MultiLineString`.

## Causa del problema en visor.html

La importación sí se realizó. Supabase contiene 16,159 líneas por cada intento de carga y las coordenadas están correctamente dentro de Delicias (aprox. lon -105.5314 a -105.3909, lat 28.0958 a 28.2711).

El problema era de entrega/renderizado: `sigmun_geo_layer_geojson()` generaba un único GeoJSON de aproximadamente **24.2 MB por capa**. Además se detectaron dos cargas exactamente duplicadas del mismo KMZ, por lo que el visor intentaba recuperar/procesar aproximadamente 48 MB de GeoJSON antes de dibujar.

La igualdad de ambos intentos fue comprobada por geometría + nombre + atributos: 0 elementos diferentes entre uno y otro.

## Corrección

- Se creó `sigmun_geo_layer_geojson_page()` en Supabase.
- El frontend recupera capas grandes en páginas de 800 entidades en vez de una respuesta monolítica.
- Prueba real: 21 páginas recuperan exactamente 16,159 de 16,159 entidades.
- Primera página: ~1.20 MB en vez de 24.2 MB.
- Las capas configuradas como no visibles usan carga diferida y no se descargan hasta que el usuario las activa.
- El intento duplicado más antiguo quedó **oculto por defecto, no eliminado**, para evitar procesar dos veces la misma información.
- El visor muestra progreso durante la lectura de capas grandes.

## Resultado esperado

La capa visible debe aparecer como líneas color `#165a9b` con ancho KML 2. Al seleccionar la capa, sus 16,159 registros quedan disponibles para Datos/Análisis y la exportación GeoJSON utiliza la información ya cargada de forma paginada.
