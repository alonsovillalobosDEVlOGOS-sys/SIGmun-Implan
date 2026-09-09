# Despliegue · Massive Layers Engine · 2026-09-09

## Estado de Supabase

Las migraciones `massive_layers_mvt_engine` y `massive_layers_mvt_compact` ya fueron aplicadas al proyecto **Sigmun IMPLAN**. No las ejecutes nuevamente.

## Despliegue del frontend

1. Haz una copia del repositorio actual como respaldo.
2. Sustituye los archivos del sitio con el ZIP completo o usa el ZIP de archivos modificados respetando exactamente la estructura de carpetas.
3. Publica los cambios en GitHub Pages/hosting habitual.
4. Espera a que finalice el despliegue.
5. Abre `visor.html` y haz recarga fuerte (`Ctrl+F5` en Windows / `Cmd+Shift+R` en macOS) o prueba en ventana privada.
6. En DevTools > Network/Console confirma que se carga `visor.js?v=20260909m`.
7. Abre el proyecto de edificios 3D. La capa de 117,650 edificios debe indicar motor **MVT** sin volver a importar el KMZ.
8. Prueba 2D, Vista 3D, opacidad, clasificación por altura y selección de un edificio.

## Para futuras capas

No necesitas preparar nada especial para MVT. Importa KML/KMZ/CSV como hasta ahora. Si la capa supera los umbrales, `admin.html` recomendará MVT automáticamente.

PMTiles es opcional. Sólo se requiere para capas estáticas que quieras servir directamente desde CDN. Consulta `tools/pmtiles/README.md`.
