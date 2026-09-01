# Guía rápida — Gestor avanzado SIGmun Delicias

## 1. Publicar un mapa temático

1. Entra a `admin.html` y abre **Capas geográficas**.
2. Carga CSV (`lat`/`lon`), KML o KMZ.
3. En la capa creada pulsa el botón de **controles/deslizadores**.
4. Abre **Simbología y leyenda**.
5. Selecciona:
   - **Símbolo único**: todos los elementos usan el mismo color.
   - **Categorías**: elige un campo como `Tipo`, `Colonia`, `Estatus` o `Dependencia`.
   - **Rangos graduados**: elige un campo numérico como `Población`, `Monto`, `Índice` o `Beneficiarios`.
6. Pulsa **Generar clases**.
7. Edita colores y textos de la leyenda si lo deseas.
8. Revisa **Vista previa**.
9. Marca **Pública** únicamente cuando el resultado esté listo.
10. Guarda la configuración.

El `visor.html` aplicará automáticamente la simbología y mostrará la leyenda correspondiente.

## 2. Clasificación por categorías

Úsala para información nominal: tipo de obra, dependencia, sector, estatus, colonia, programa, cobertura, etc.

SIGmun obtiene los valores únicos del campo y propone un color distinto. La etiqueta visible puede ser modificada sin alterar el valor original almacenado.

## 3. Clasificación por rangos

Úsala para variables numéricas. Están disponibles:

- **Intervalos iguales**: divide el recorrido mínimo–máximo en tramos del mismo tamaño.
- **Cuantiles**: procura distribuir una cantidad similar de registros por clase.

Los límites generados pueden ajustarse manualmente antes de guardar.

## 4. Editar atributos

En el gestor de una capa abre **Atributos**:

- busca un elemento por nombre o cualquier atributo;
- modifica el nombre;
- cambia valores;
- agrega nuevos campos;
- elimina campos individuales.

La geometría no se altera desde este editor, reduciendo el riesgo de mover accidentalmente puntos o polígonos.

## 5. Orden de capas

En **Capas geográficas almacenadas**, las capas se agrupan por proyecto. Arrástralas con el ícono de agarre. La capa colocada más arriba tiene mayor prioridad visual y el mismo orden se usa en el panel/leyenda del visor.

## 6. Preparar una base estadística

1. Carga el CSV en **Capas estadísticas**.
2. Abre la configuración de la base.
3. En **Modelo de campos**, revisa la detección automática:
   - **Tiempo / año**: año, fecha, mes, periodo.
   - **Dimensión / categoría**: colonia, sexo, programa, sector, tipo, etc.
   - **Medida / valor**: inversión, población, beneficiarios, porcentaje, índice, cantidad.
   - **Ocultar**: campos técnicos que no deben aparecer al público.
4. Puedes cambiar la etiqueta pública sin renombrar la columna original.
5. En **Vista sugerida**, define la gráfica con la que abrirá el dashboard.

## 7. Explorar datos en `dashboard.html`

El dashboard ofrece dos caminos:

### Sugerencias
Pulsa una comparación recomendada, como:

- evolución en el tiempo;
- comparación de series por año;
- comparación de categorías;
- composición porcentual/categórica;
- comparación de varias medidas.

### Constructor visual
Arrastra campos hacia:

- **Tiempo / año** — eje temporal.
- **Dimensión** — agrupación principal.
- **Serie** — líneas o grupos comparables.
- **Valores** — hasta cuatro medidas numéricas.

Luego selecciona el tipo de gráfica y la operación: suma, promedio, conteo, mínimo o máximo.

## 8. Ejemplos de lectura

### Obras públicas
- Tiempo: `Año`
- Serie: `Categoría`
- Valor: `Monto total`
- Gráfica: línea o barras apiladas
- Operación: suma

### Población
- Dimensión: `Colonia`
- Valores: `Población`, `Hombres`, `Mujeres`
- Gráfica: barras
- Operación: suma

### Programas sociales
- Tiempo: `Año`
- Serie: `Programa`
- Valor: `Beneficiarios`
- Gráfica: línea
- Operación: suma

### Distribución de acciones
- Dimensión: `Tipo de acción`
- Gráfica: dona
- Operación: conteo

## 9. Persistencia

- Las configuraciones oficiales del administrador se guardan en Supabase (`style` y `chart_config`).
- Las exploraciones que realiza un visitante en `dashboard.html` no modifican la base.
- El botón **Guardar vista** conserva la combinación personal solamente en el navegador de ese usuario.


## Actualización — CSV geográfico WKT / MultiPolygon

El cargador geográfico admite CSV de puntos con `lat` y `lon`, y CSV de polígonos mediante columnas denominadas `wkt`, `geometry`, `geom`, `the_geom`, `polygon` o `multipolygon`. Se reconocen WKT `POINT`, `POLYGON` y `MULTIPOLYGON` en EPSG:4326. `POLYGON` se normaliza a `MultiPolygon` antes de enviarse a PostGIS. También se admite una geometría GeoJSON `MultiPolygon` serializada dentro del campo `multipolygon`. Las columnas restantes se conservan como atributos para filtros, simbología y ventanas de información del visor.
