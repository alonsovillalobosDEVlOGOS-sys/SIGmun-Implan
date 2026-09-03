# Validación de despliegue — SIGmun Delicias

Fecha: 3 de septiembre de 2026.

## Importador KML/KMZ

El parser actualizado fue validado contra `1 PMOTDU D (1).kmz`:

- 25 documentos KML declarados.
- 22 documentos con geometrías directas; estos son los que se convierten en capas SIGmun en modo separado.
- 325 puntos.
- 5,069 elementos poligonales.
- 52,433 elementos lineales.
- 57,827 elementos geográficos totales.

Los 3 documentos que no generan capa son contenedores o documentos sin geometría directa; no se crean capas vacías.

## Modos de importación

Al elegir KML/KMZ, `admin.html` analiza primero el archivo y permite:

1. Importar como una sola capa.
2. Separar automáticamente por documento. Esta opción se selecciona como recomendada cuando existen varios documentos con geometrías.

Las capas separadas comparten `import_group_id` y `source_collection`, reciben orden consecutivo, color inicial independiente y conservan el nombre del documento de origen.

## Visor

`visor.html` agrupa las capas generadas bajo su colección de origen. Permite:

- activar/desactivar cada capa con casilla;
- activar/desactivar una colección completa;
- activar todas o ninguna de las capas del proyecto;
- actualizar automáticamente mapa, simbología y leyenda.

## Validación técnica

- Todos los JavaScript pasan `node --check`.
- No existen referencias locales faltantes en index.html, sigmun.html, visor.html, dashboard.html o admin.html.
- No se detectaron IDs HTML duplicados en las páginas principales.
- No se incluyeron cadenas de conexión PostgreSQL, contraseñas de base de datos ni service-role keys en el paquete.

## Requisito PostGIS para líneas

Para importar documentos con `LineString/MultiLineString`, Supabase debe tener aplicada la migración:

`supabase/migrations/20260903_kml_kmz_multiline_support.sql`

El frontend detecta si el backend aún no soporta carga masiva/líneas y muestra un error explícito antes de dejar una importación separada incompleta.
