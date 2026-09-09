# Despliegue · Fix timeout edificios 3D

1. Sustituir en GitHub los archivos de este paquete.
2. Aplicar una sola vez en Supabase la migración `supabase/migrations/20260908_geojson_fast_large_layers.sql`.
3. Publicar GitHub Pages.
4. Recargar con Ctrl+F5 / Cmd+Shift+R.
5. Abrir el proyecto de edificios.
6. La capa masiva se activa por viewport a partir de zoom 14.
7. Para Vista 3D, usar el botón 3D; SIGmun ajusta automáticamente el zoom mínimo y carga los edificios del área visible.

Los HTML actualizados usan versión de recursos `20260908b` para evitar caché de la versión anterior.
