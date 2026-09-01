# SIGmun Delicias 2026 — Plataforma funcional con Supabase

Plataforma institucional del Gobierno Municipal de Delicias / IMPLAN Delicias para publicar y administrar Temas de Consulta, proyectos, información geográfica e indicadores estadísticos.

## Páginas principales

- `index.html` — landing pública institucional.
- `sigmun.html` — catálogo dinámico de Temas de Consulta y proyectos.
- `visor.html` — visor geográfico con simbología temática y leyendas almacenadas en Supabase/PostGIS.
- `dashboard.html` — explorador estadístico visual con arrastrar y soltar.
- `admin.html` — acceso administrativo con Supabase Auth, roles y administración avanzada de contenidos.

## Acceso administrativo

`admin.html` valida la identidad con Supabase Auth y el rol guardado en `sigmun_user_profiles`.

Roles:

- **Administrador**: usuarios, roles, temas, proyectos, capas geográficas, capas estadísticas y auditoría.
- **Editor**: proyectos y capas geográficas/estadísticas. No puede administrar cuentas ni temas.
- **Consulta**: lectura pública; no tiene acceso al panel administrativo.

Los administradores pueden crear nuevas cuentas desde **Usuarios y roles**. La creación y eliminación de usuarios se realiza en una Supabase Edge Function con privilegios de servidor; ninguna clave secreta se expone en HTML o JavaScript.

## Gestor avanzado de capas geográficas

Cada registro de `sigmun_geo_layers` conserva la representación cartográfica dentro de `style jsonb`. El panel administrativo permite configurar sin cambiar el esquema de la base:

- símbolo único;
- categorías a partir de cualquier atributo;
- rangos graduados para campos numéricos;
- clasificación por intervalos iguales o cuantiles;
- paletas, color sin dato, borde, opacidad y tamaño de puntos;
- etiquetas de categorías/rangos editables;
- título y visibilidad de la leyenda;
- campo usado como etiqueta en el mapa;
- vista previa Leaflet antes de publicar;
- edición de `name` y `attributes` de cada elemento geográfico;
- orden de dibujo mediante arrastrar y soltar por proyecto.

`visor.html` interpreta directamente esta configuración. Por ello, los colores, categorías, rangos, orden y leyendas publicados en el administrador son los que se muestran a la ciudadanía.

### Estructura conceptual de `style`

```json
{
  "renderer": "single | categorized | graduated",
  "field": "campo_tematico",
  "color": "#0f4fa8",
  "palette": "municipal",
  "categories": [{"value":"A","label":"Categoría A","color":"#0f4fa8"}],
  "classes": [{"min":0,"max":100,"label":"0 – 100","color":"#dceafd"}],
  "noDataColor": "#b9c2cc",
  "labelField": "name",
  "legend": {"show":true,"title":"Título de leyenda"}
}
```

## Modelo geográfico

- `sigmun_geo_layers` — definición, estilo, orden y publicación de capas.
- `sigmun_geo_points`
  - `lat double precision`
  - `lon double precision`
  - `geom geometry(Point,4326)` generado automáticamente
  - `attributes jsonb`
- `sigmun_geo_polygons`
  - `multipolygon geometry(MultiPolygon,4326)`
  - `attributes jsonb`

Formatos de precarga: CSV geográfico con `lat`/`lon`, KML y KMZ. Los demás campos se conservan como atributos.

## Explorador estadístico visual

`dashboard.html` perfila automáticamente los campos de una base y los clasifica en:

- **Tiempo / año**: años, fechas y periodos;
- **Dimensión**: categorías utilizadas para agrupar;
- **Medida**: valores numéricos utilizados para sumar, promediar, obtener mínimos/máximos, etc.

La persona usuaria puede arrastrar campos a cuatro zonas: **Tiempo, Dimensión, Serie y Valores**. El dashboard genera gráficas de barras, líneas, área, barras horizontales, barras apiladas o dona y permite cambiar la operación entre suma, promedio, conteo, mínimo y máximo.

También incluye:

- comparaciones sugeridas automáticamente según los campos disponibles;
- lectura rápida de máximos, mínimos, promedio y mediana;
- resumen de calidad/completitud de la base;
- búsqueda que filtra simultáneamente tabla y visualización;
- hasta cuatro medidas comparables en una misma gráfica;
- vistas personales guardadas en el navegador;
- descarga del CSV filtrado.

## Configuración estadística en Supabase

`sigmun_stat_layers.chart_config` conserva el modelo visual de cada base:

```json
{
  "version": 2,
  "field_roles": {
    "Año": {"role":"time","label":"Año"},
    "Sector": {"role":"dimension","label":"Sector"},
    "Inversión": {"role":"measure","label":"Inversión total"}
  },
  "default_view": {
    "chart":"line",
    "aggregation":"sum",
    "time":"Año",
    "dimension":"",
    "series":"Sector",
    "value":"Inversión"
  }
}
```

Desde `admin.html` es posible corregir el rol detectado de cualquier campo, cambiar su etiqueta pública, ocultarlo del constructor y definir la visualización inicial sugerida.

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

## Ajuste Dashboard — septiembre 2026

`dashboard.html` incorpora una distribución de dos columnas donde la bandeja de campos funciona de manera independiente del flujo principal. Esto elimina espacios verticales provocados por bases con muchos campos y mantiene consecutivos el constructor, la visualización activa y la tabla de datos.

Se añadieron filtros inteligentes contextuales para Tiempo/Año, Dimensión y Serie, además de Top 5/10/20 categorías. Las Guías Inteligentes priorizan tendencias de crecimiento, series comparativas por tiempo, tendencias históricas cuando los años están almacenados como columnas, rankings, comparación de categorías y composición.

El lector de CSV/KML ahora intenta UTF-8 y, cuando detecta caracteres de reemplazo, utiliza automáticamente Windows-1252 como alternativa. El dashboard normaliza Unicode, corrige patrones frecuentes de texto previamente importado con codificación dañada y exporta CSV con BOM UTF-8 para mayor compatibilidad con Excel.
