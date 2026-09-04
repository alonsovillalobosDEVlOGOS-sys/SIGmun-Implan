# SIGmun Delicias — simbología KML/KMZ, subcarpetas y transparencia

## Importación
- Lee `Style`, `StyleMap` y estilos inline de KML/KMZ.
- Convierte correctamente el color KML `aabbggrr` a CSS `#rrggbb` y conserva el canal alfa.
- Conserva color de relleno, color y ancho de línea, `fill`, `outline`, color/escala de icono y etiquetas cuando están definidos.
- Registra documento, ruta de documento, carpeta, ruta de carpeta, subcarpeta y jerarquía completa por elemento.
- Permite importar como una sola capa o separar por documentos KML.
- Los documentos separados conservan el registro de estilos original dentro de la configuración de la capa.

## Visor
- Las capas se agrupan por la colección KML/KMZ de origen.
- Cada capa puede encenderse o apagarse individualmente.
- Una capa KML con varias subcarpetas, categorías o estilos muestra controles internos para cada grupo.
- En `Usos de Suelo`, SIGmun identifica `ZS` y permite controlar H1, H2, Industrial, Comercio, Centro urbano, equipamientos y corredores de forma independiente.
- El control `Opacidad` trabaja como multiplicador sobre el alfa original del KML; no reemplaza la transparencia original.
- La leyenda se reconstruye con los estilos originales y sólo refleja los grupos actualmente visibles.
- Al seleccionar un elemento se muestran sus atributos de negocio y, aparte, su documento/carpeta y estilo KML de origen.
- Se usa renderizado Canvas de Leaflet para mejorar el desempeño en capas con miles de geometrías.

## Administrador
- Nuevo modo `Estilo original KML/KMZ` en el gestor avanzado de simbología.
- La vista previa usa los estilos originales.
- Se puede seleccionar un campo de agrupación/leyenda para archivos KML; si no se define, SIGmun intenta detectarlo automáticamente.
- El control de opacidad global permite hacer más transparente una capa respetando su alfa original.

## Estado del PMOTDU en Supabase
- 22 capas de la colección existente fueron actualizadas a `renderer = kml`.
- 57,827 entidades poseen `_kml_style` y 0 quedaron sin correspondencia en el registro de estilos.
- `Usos de Suelo` tiene `kmlLegendField = ZS`.
