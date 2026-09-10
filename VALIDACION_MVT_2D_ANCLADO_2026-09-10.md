# Validación · MVT 2D anclado

Se realizaron las siguientes verificaciones:

1. Revisión cuadro a cuadro del video aportado por el usuario: se confirmó desplazamiento relativo entre la geometría del overlay y el mapa Leaflet durante cambios de zoom/pan.
2. Revisión del código anterior: MVT 2D usaba una instancia `maplibregl.Map` independiente dentro de `#mapMvtOverlay` y sincronizaba su cámara con `jumpTo()`.
3. El código corregido deja `#mapMvtOverlay` exclusivamente como compatibilidad para PMTiles; las capas `tileEngine === "mvt"` pasan a `L.vectorGrid.protobuf`.
4. VectorGrid usa `rendererFactory: L.canvas.tile` y el mismo pane Leaflet asignado a la capa.
5. Se comprobó que MultiPolygon, MultiLineString y Point tienen estilos MVT nativos.
6. Los filtros por subcategoría provocan `redraw()` de las teselas Leaflet.
7. Los cambios de opacidad provocan `redraw()` y conservan la clasificación.
8. La selección de elementos sigue consultando atributos completos mediante `geoFeatureProperties`.
9. Al entrar a 3D se retira el VectorGrid 2D; al volver a 2D se restaura.
10. Todos los JavaScript del paquete pasan `node --check`.
11. `visor.html` carga `leaflet.vectorgrid@1.3.0` y fuerza versión `20260910a`.

La validación visual automatizada mediante Chromium headless no pudo completarse en este entorno por fallos del runtime gráfico/DBus de Chromium. La corrección elimina estructuralmente la causa del desplazamiento: ya no hay dos cámaras en la vista 2D.
