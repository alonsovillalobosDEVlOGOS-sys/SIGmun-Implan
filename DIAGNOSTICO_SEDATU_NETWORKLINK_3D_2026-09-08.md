# Diagnóstico del KML SEDATU y soporte 3D · 2026-09-08

## Archivo analizado
`geonode-mun_08021_27496d4410670ad0839a579da1645e27.kml`

## Hallazgo principal
El archivo suministrado **no contiene Placemark, Polygon, MultiPolygon ni atributos de altura**. Es un KML de enlace remoto (`NetworkLink`) que apunta a una capa de GeoServer/IDE SEDATU mediante WMS.

El enlace original solicita KML dinámico del layer:
`geonode:mun_08021_27496d4410670ad0839a579da1645e27`.

Por ello, abrir únicamente el archivo KML no permite conocer desde el archivo local si la capa remota representa edificios, límites u otra geometría, ni si posee campos de altura. La nueva versión de SIGmun transforma este tipo de enlace WMS/GeoServer a una consulta WFS GeoJSON para intentar recuperar las entidades vectoriales y sus atributos.

## Tratamiento en admin.html
1. Detecta `NetworkLink`.
2. Reconoce la URL GeoServer y el nombre de layer.
3. Construye una consulta WFS 2.0 en EPSG:4326.
4. Descarga por páginas cuando la fuente remota lo permite.
5. Convierte Point/LineString/Polygon a las estructuras SIGmun.
6. Si hay polígonos, presenta el panel **Preparación tridimensional**.
7. Evalúa si la geometría parece una colección de huellas de edificios antes de activar 3D automáticamente.

## Altura y procedencia
La altura se resuelve en este orden:
1. campo de altura explícito (`altura`, `height`, `altura_m`, etc.);
2. niveles/pisos × altura por nivel (3.2 m predeterminado configurable);
3. coordenada Z del KML cuando existe y es interpretable;
4. altura predeterminada configurable.

Los valores 2 y 4 se marcan como estimados. Cada entidad recibe:
- `ALTURA_M`
- `ALTURA_BASE_M`
- `NIVELES_EST`
- `RANGO_ALTURA`
- `FUENTE_ALTURA`
- `CONFIANZA_ALTURA`
- `ALTURA_ESTIMADA`
- `AREA_M2`
- `RANGO_SUPERFICIE`
- `VOLUMEN_M3_EST`

## Rangos de altura
- Hasta 4 m
- 4–8 m
- 8–12 m
- 12–20 m
- 20–35 m
- Más de 35 m

## Segmentación por huella
- Huella pequeña · ≤60 m²
- Huella media · 60–120 m²
- Huella amplia · 120–250 m²
- Huella grande · 250–500 m²
- Huella muy grande · >500 m²

## Vista 3D
`visor.html` mantiene Leaflet para el SIG 2D e incorpora MapLibre GL para la vista tridimensional. Las geometrías se extruyen usando `ALTURA_M` y se colorean por `RANGO_ALTURA`. La representación utiliza una fuente GeoJSON y una capa `fill-extrusion` por capa SIGmun para reducir objetos WebGL y mantener el visor limpio.

## Limitación de la fuente
El KML local no demuestra que el recurso remoto sea una capa de edificios. Si el WFS remoto devuelve un límite municipal u otra geometría no edificatoria, SIGmun evita activar la extrusión 3D automáticamente. En ese caso se requiere una capa real de huellas de edificios para obtener un modelo urbano 3D significativo.
