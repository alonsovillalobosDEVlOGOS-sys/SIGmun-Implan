# Despliegue · MVT v3

La migración de Supabase ya fue aplicada al proyecto **Sigmun IMPLAN**. No ejecutes SQL manualmente y no vuelvas a importar el KMZ.

1. Sustituye los archivos incluidos en el ZIP Hotfix respetando sus rutas.
2. Commit + push al repositorio.
3. Espera el despliegue.
4. Haz recarga fuerte del navegador.
5. En Network confirma `visor.js?v=20260909r` y `supabase-service.js?v=20260909r`.
6. Abre el proyecto de edificios y acércate a zoom 15 o superior.
7. Verifica primero 2D y luego Vista 3D.

No es necesario modificar ningún registro de la capa desde `admin.html`.
