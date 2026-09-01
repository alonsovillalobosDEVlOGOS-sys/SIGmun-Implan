# SIGmun Delicias 2026 — Plataforma funcional con Supabase

Esta versión integra la landing institucional, `sigmun.html`, `visor.html` y `dashboard.html` con el proyecto Supabase **Sigmun IMPLAN**.

## Estructura

- `index.html`: landing institucional.
- `sigmun.html`: selector dinámico de Temas de Consulta, proyectos y panel administrativo.
- `visor.html`: visor geográfico dinámico con Leaflet.
- `dashboard.html`: panel estadístico dinámico.
- `assets/js/config.js`: URL y publishable key de Supabase (clave pública).
- `assets/js/supabase-service.js`: acceso a base de datos y autenticación.
- `assets/js/data-utils.js`: importación y normalización de CSV/KML/KMZ.

## Base de datos

El proyecto utiliza estas tablas:

- `sigmun_topics`
- `sigmun_projects`
- `sigmun_geo_layers`
- `sigmun_geo_points`
- `sigmun_geo_polygons`
- `sigmun_stat_layers`
- `sigmun_stat_records`

Los puntos usan columnas explícitas `lat` y `lon` y además una geometría PostGIS `Point(4326)` generada automáticamente. Los polígonos se almacenan en `multipolygon geometry(MultiPolygon,4326)`. Los atributos adicionales se guardan en JSONB para preservar los campos propios de cada dataset.

## Formatos de administración

### Geográficos
- CSV: requiere columnas `lat` y `lon`; los demás campos se conservan como atributos.
- KML / KMZ: admite Point, Polygon y MultiPolygon. Los Polygon se normalizan a MultiPolygon.

### Estadísticos
- CSV: todos los campos se conservan en `attributes` y el esquema de columnas se registra en `schema_fields`.

## Administración

En `sigmun.html`, pulsa **Administración** e inicia sesión con una cuenta de Supabase Auth. Las operaciones de escritura están restringidas a usuarios autenticados mediante RLS.

Desde el panel se pueden:
- crear/eliminar Temas de Consulta;
- crear/eliminar proyectos;
- precargar/eliminar capas geográficas;
- precargar/eliminar capas estadísticas.

## Publicación

Los archivos son compatibles con un hosting estático, pero requieren acceso a Internet para Supabase y las librerías CDN. No uses la contraseña de PostgreSQL en HTML/JS; la aplicación utiliza únicamente la publishable key.
