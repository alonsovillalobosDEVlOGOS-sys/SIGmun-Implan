# Modelo SIGmun

## Temas y proyectos
`sigmun_topics` organiza los Temas de Consulta. `sigmun_projects` pertenece a un tema y define si el proyecto es `map`, `dashboard` o `mixed`.

## Capas geográficas
`sigmun_geo_layers` define metadatos y estilo.

Puntos:
- `lat double precision`
- `lon double precision`
- `geom geometry(Point,4326)` generado automáticamente
- `attributes jsonb`

Polígonos:
- `multipolygon geometry(MultiPolygon,4326)`
- `attributes jsonb`

## Capas estadísticas
`sigmun_stat_layers` define el dataset y `schema_fields`.
`sigmun_stat_records` conserva cada fila del CSV en `attributes jsonb`.

## Seguridad
Lectura pública para contenidos marcados como públicos. Escritura únicamente para usuarios autenticados de Supabase Auth.
