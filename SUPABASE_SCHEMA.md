# Modelo de datos y control de acceso — SIGmun Delicias

## Organización temática

### `sigmun_topics`
Temas de Consulta que estructuran la plataforma pública.

### `sigmun_projects`
Proyectos asociados a un tema. `project_type`: `map`, `dashboard` o `mixed`. Incluye centro cartográfico y zoom inicial.

## Información geográfica

### `sigmun_geo_layers`
Metadatos, formato de origen, orden, publicación y configuración temática. `style jsonb` funciona como contrato entre `admin.html` y `visor.html`.

Propiedades utilizadas dentro de `style`:

| Propiedad | Uso |
|---|---|
| `renderer` | `single`, `categorized`, `graduated` |
| `field` | atributo que controla la simbología |
| `categories` | valores, etiquetas y colores para categorías |
| `classes` | límites, etiquetas y colores para rangos |
| `classification` | `equal_interval` o `quantile` |
| `palette` | paleta usada para generar clases |
| `weight`, `fillOpacity`, `radius` | apariencia geométrica |
| `noDataColor` | color para registros sin valor temático |
| `labelField` | atributo de etiqueta/tooltip |
| `legend` | título y visibilidad de leyenda |

`sort_order` controla el orden de capas dentro de cada proyecto. El administrador puede modificarlo por drag & drop.

### `sigmun_geo_points`
`lat`, `lon`, `geom geometry(Point,4326)`, `name`, `attributes jsonb`.

### `sigmun_geo_polygons`
`multipolygon geometry(MultiPolygon,4326)`, `name`, `attributes jsonb`.

Los atributos pueden editarse desde el gestor avanzado. Las operaciones de escritura continúan sujetas a RLS.

## Información estadística

### `sigmun_stat_layers`
Define nombre, descripción, archivo de origen, `schema_fields`, metadatos, orden, publicación y `chart_config`.

`schema_fields` puede almacenar `name`, `label`, `type` y `role` detectados/configurados.

`chart_config` utiliza esta estructura:

- `version`
- `field_roles`
  - `auto`
  - `time`
  - `dimension`
  - `measure`
  - `hidden`
- `default_view`
  - `chart`
  - `aggregation`
  - `time`
  - `dimension`
  - `series`
  - `value`

El dashboard público usa esta información como orientación, pero mantiene el análisis exploratorio: cada visitante puede reorganizar campos sin escribir cambios en Supabase.

### `sigmun_stat_records`
Cada registro conserva los campos originales dentro de `attributes jsonb`.

## Identidad y roles

### `auth.users`
Usuarios autenticados de Supabase Auth.

### `sigmun_user_profiles`
Perfil de autorización 1:1 con `auth.users`. Roles: `admin`, `editor`, `viewer`.

### `sigmun_access_status`
Indica si existe un administrador.

### `sigmun_bootstrap_control`
Control interno de la activación inicial.

### `sigmun_access_audit`
Bitácora de altas, cambios de rol y bajas de cuentas.

## Matriz de permisos

| Operación | Consulta | Editor | Administrador |
|---|---:|---:|---:|
| Ver temas/proyectos públicos | Sí | Sí | Sí |
| Ver capas públicas | Sí | Sí | Sí |
| Ver capas privadas | No | Sí | Sí |
| Crear/editar proyectos | No | Sí | Sí |
| Eliminar proyectos | No | No | Sí |
| Cargar/editar/eliminar capas | No | Sí | Sí |
| Editar atributos geográficos | No | Sí | Sí |
| Configurar simbología/leyendas | No | Sí | Sí |
| Configurar modelo estadístico | No | Sí | Sí |
| Explorar dashboard público | Sí | Sí | Sí |
| Crear/editar/eliminar temas | No | No | Sí |
| Administrar usuarios | No | No | Sí |
| Consultar auditoría | No | No | Sí |

## Edge Functions

### `sigmun-bootstrap-admin`
Creación segura de la primera cuenta administrativa.

### `sigmun-user-admin`
Lista, crea, actualiza y elimina cuentas tras validar al administrador.

## RLS

Las tablas SIGmun mantienen Row Level Security. El contenido público puede consultarse sin iniciar sesión; las escrituras dependen del rol almacenado en `sigmun_user_profiles`.
