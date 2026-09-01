# Ajustes de visualización y geometrías — SIGmun Delicias

## Dashboard
- Distribución independiente en tres columnas: campos, análisis y guías.
- `Visualización activa` aparece inmediatamente después del constructor sin depender de la altura de Guías Inteligentes.
- `Datos de origen` continúa inmediatamente debajo de la gráfica.
- Espaciado compacto y alineación estable en resoluciones de escritorio, laptop, tablet y móvil.
- Nuevos tipos: Radar y Área polar.
- Nuevas paletas: institucional multicolor, azul institucional, azul-verde, verdes, cálida, morados, alto contraste y pastel.
- Coloración automática, por categoría o por serie.
- Las gráficas de una sola serie pueden colorear cada categoría de forma independiente.
- Las series temporales usan colores, símbolos de punto y patrones diferenciados.

## CSV geográfico
Se admiten:
- Puntos con columnas `lat` y `lon`.
- `POINT`, `POLYGON` y `MULTIPOLYGON` WKT mediante columnas `wkt`, `geometry`, `geom`, `the_geom`, `polygon` o `multipolygon`.
- GeoJSON `MultiPolygon` serializado en una columna `multipolygon`.
- Coordenadas geográficas EPSG:4326.

Los `POLYGON` se normalizan a `MultiPolygon` antes de almacenarse en PostGIS. Los demás campos del CSV se mantienen como atributos y pueden utilizarse para filtros, simbología y leyendas.
