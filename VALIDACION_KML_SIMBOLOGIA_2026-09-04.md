# Validación de despliegue — 2026-09-04

## Cambios validados
- Importador KML/KMZ conserva Style, StyleMap, colores KML, alfa, rellenos, contornos y grosores.
- Importador registra documento, carpeta, subcarpeta, rutas jerárquicas y estilo de origen.
- Visor agrupa capas por colección KML/KMZ.
- Visor permite activar/desactivar capas y subcategorías/subcarpetas.
- Visor incorpora control independiente de opacidad por capa.
- Leyendas KML se generan con colores originales.
- Propiedades separan atributos de negocio de la procedencia KML.
- Leaflet usa preferCanvas/renderizador Canvas para capas vectoriales grandes.
- Gestor administrativo incluye modo “Estilo original KML/KMZ”.

## Validaciones técnicas
- Todos los archivos JavaScript pasaron `node --check`.
- No existen referencias locales HTML a archivos ausentes.
- No existen IDs HTML duplicados en las páginas principales.
- No se encontraron contraseñas PostgreSQL, service-role keys ni secret keys en el paquete.
- La clave incluida en `config.js` es la publishable key prevista para uso en navegador con RLS.

## Pruebas KML
- Conversión KML `ff3dadf2` → `#f2ad3d`.
- Conversión KML `ff3fc793` → `#93c73f`.
- Conversión KML `ffe05eb3` → `#b35ee0`.
- Parser sintético comprobado con Document + múltiples Folder + Polygon + Point.
- Se conservaron `_kml_document_path`, `_kml_folder_path`, `_kml_hierarchy` y `_kml_style`.

## Supabase
- Las 22 capas PMOTDU existentes fueron configuradas con `renderer = kml`.
- Las 57,827 entidades con `_kml_style` tienen correspondencia en el registro de estilos.
- 0 entidades quedaron con estilo KML faltante.
- “Usos de Suelo” utiliza `ZS` como campo preferente de leyenda.
