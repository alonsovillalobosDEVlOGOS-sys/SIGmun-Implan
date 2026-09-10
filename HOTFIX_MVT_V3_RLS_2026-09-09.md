# Hotfix MVT v3 · Edificaciones 3D · 2026-09-09

## Causa real del error 57014

La función MVT anterior era correcta geométricamente, pero al ejecutarse como `anon` heredaba RLS sobre `sigmun_geo_polygons`.
El plan de PostgreSQL terminaba usando el índice B-tree por `layer_id` y filtrando espacialmente después, llegando a revisar los 117,650 edificios para construir una sola tesela densa. En la prueba del tile z15/6784/13710, el plan RLS tardó aproximadamente 12.4 s y revisó 117,650 filas, por lo que PostgREST cancelaba la llamada con `57014`.

## Arreglo definitivo

1. Se añadió `sigmun_geo_layer_mvt_v3()`.
2. La función valida una sola vez que la capa sea pública o que el usuario tenga rol editor/admin.
3. Después ejecuta la consulta espacial con privilegios controlados, evitando la penalización RLS por cada geometría.
4. `search_path` queda vacío y las relaciones/funciones PostGIS relevantes están calificadas explícitamente.
5. Se revocó `EXECUTE` a `PUBLIC` y se concedió únicamente a `anon` y `authenticated`.
6. Las capas 3D masivas empiezan en zoom MVT 15 para garantizar tiles completos; a z16+ el número de edificios por tile cae de forma importante.
7. El frontend limita a 2 las solicitudes MVT concurrentes, deduplica solicitudes idénticas, conserva caché LRU y reintenta una vez con límite reducido si hubiera un timeout excepcional.
8. Si aun así una capa MVT falla, `visor.js` cambia automáticamente esa capa al motor de respaldo `viewport` en lugar de dejar el mapa vacío.

## Otros mensajes de consola

- `/favicon.ico 404`: corregido con favicon vacío embebido en `visor.html`.
- `AbortError: play() request was interrupted by pause()`: no existe ninguna llamada `play()`/`pause()` ni elemento `<video>` en SIGmun; no corresponde al motor GIS y no bloquea la capa MVT.
