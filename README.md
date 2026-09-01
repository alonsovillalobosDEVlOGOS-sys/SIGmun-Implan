# SIGmun Delicias 2026 — Plataforma funcional con Supabase

Plataforma institucional del Gobierno Municipal de Delicias / IMPLAN Delicias para publicar y administrar Temas de Consulta, proyectos, información geográfica e indicadores estadísticos.

## Páginas principales

- `index.html` — landing pública institucional.
- `sigmun.html` — catálogo dinámico de Temas de Consulta y proyectos.
- `visor.html` — visor geográfico con capas precargadas desde Supabase/PostGIS.
- `dashboard.html` — visor estadístico de bases CSV almacenadas en Supabase.
- `admin.html` — acceso administrativo con Supabase Auth, roles y administración de contenidos.

## Acceso administrativo

`admin.html` valida la identidad con Supabase Auth y el rol guardado en `sigmun_user_profiles`.

Roles:

- **Administrador**: usuarios, roles, temas, proyectos, capas geográficas, capas estadísticas y auditoría.
- **Editor**: proyectos y capas geográficas/estadísticas. No puede administrar cuentas ni temas.
- **Consulta**: lectura pública; no tiene acceso al panel administrativo.

La primera cuenta administrativa se crea desde `admin.html` con una **clave de activación de un solo uso**. La clave no se almacena en los archivos del sitio; Supabase conserva solamente su hash. Una vez utilizada queda invalidada.

Los administradores pueden crear después nuevas cuentas desde **Usuarios y roles**. La creación y eliminación de usuarios se realiza en una Supabase Edge Function con privilegios de servidor; ninguna clave secreta se expone en HTML o JavaScript.

## Modelo geográfico

- `sigmun_geo_layers` — definición, estilo y publicación de capas.
- `sigmun_geo_points`
  - `lat double precision`
  - `lon double precision`
  - `geom geometry(Point,4326)` generado automáticamente
  - `attributes jsonb`
- `sigmun_geo_polygons`
  - `multipolygon geometry(MultiPolygon,4326)`
  - `attributes jsonb`

Formatos de precarga:

- CSV geográfico con columnas `lat` y `lon`.
- KML.
- KMZ.

Los demás campos de cada archivo se conservan como atributos.

## Modelo estadístico

- `sigmun_stat_layers` — metadatos, esquema de campos y configuración del dataset.
- `sigmun_stat_records` — una fila por registro, con datos en `attributes jsonb`.

Formato de precarga: CSV.

## Seguridad

La aplicación usa únicamente la publishable key en el navegador. La contraseña directa de PostgreSQL y las claves de servidor no forman parte de los archivos del sitio.

Supabase Row Level Security regula el acceso:

- Anónimo / Consulta: solo contenido activo y público.
- Editor: proyectos y capas.
- Administrador: administración completa.

La gestión de usuarios se ejecuta en las Edge Functions `sigmun-user-admin` y `sigmun-bootstrap-admin`.

## Publicación

Sube todo el contenido de esta carpeta al hosting. Las páginas requieren conexión a Internet para Supabase y las librerías CDN.

No publiques claves privadas, contraseña de PostgreSQL ni claves de servicio.
