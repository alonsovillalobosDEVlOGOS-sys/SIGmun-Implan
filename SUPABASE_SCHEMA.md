# Modelo de datos y control de acceso — SIGmun Delicias

## Organización temática

### `sigmun_topics`
Temas de Consulta que estructuran la plataforma pública.

### `sigmun_projects`
Proyectos asociados a un tema. `project_type` puede ser:
- `map`
- `dashboard`
- `mixed`

Incluye centro cartográfico (`center_lat`, `center_lon`) y zoom inicial.

## Información geográfica

### `sigmun_geo_layers`
Metadatos, formato de origen, estilo, visibilidad y condición pública/privada.

### `sigmun_geo_points`
- `lat`
- `lon`
- `geom geometry(Point,4326)`
- `name`
- `attributes jsonb`

### `sigmun_geo_polygons`
- `multipolygon geometry(MultiPolygon,4326)`
- `name`
- `attributes jsonb`

## Información estadística

### `sigmun_stat_layers`
Define nombre, descripción, archivo de origen, `schema_fields`, metadatos, configuración de gráficas y publicación.

### `sigmun_stat_records`
Cada registro conserva los campos originales en `attributes jsonb`.

## Identidad y roles

### `auth.users`
Usuarios autenticados de Supabase Auth.

### `sigmun_user_profiles`
Perfil de autorización relacionado 1:1 con `auth.users`.

Campos principales:
- `id`
- `email`
- `full_name`
- `department`
- `role`: `admin`, `editor`, `viewer`
- `permissions jsonb`
- `is_active`
- `last_login_at`

La columna `role` no puede ser modificada directamente desde el navegador. Los cambios administrativos se realizan mediante una Edge Function validando primero que el solicitante sea un administrador activo.

### `sigmun_access_status`
Expone únicamente si SIGmun ya cuenta con un administrador. Permite que `admin.html` determine si debe mostrar el acceso normal o la configuración inicial.

### `sigmun_bootstrap_control`
Control interno de la clave de activación inicial. Tiene RLS y no posee lectura para `anon` ni `authenticated`. Solo la Edge Function de servidor puede verificar el hash.

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
| Crear/editar/eliminar temas | No | No | Sí |
| Administrar usuarios | No | No | Sí |
| Consultar auditoría | No | No | Sí |

## Edge Functions

### `sigmun-bootstrap-admin`
Creación segura de la primera cuenta administrativa mediante clave de activación de un solo uso.

### `sigmun-user-admin`
Lista, crea, actualiza y elimina cuentas. Valida el JWT del usuario solicitante y comprueba que su perfil sea `admin` y esté activo antes de usar las operaciones administrativas de Supabase Auth.

## RLS

Las tablas SIGmun tienen Row Level Security habilitado. El contenido público puede consultarse sin iniciar sesión; las escrituras dependen del rol almacenado en `sigmun_user_profiles`.
