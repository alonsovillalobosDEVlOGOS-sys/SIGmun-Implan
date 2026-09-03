# Diagnóstico del archivo `1 PMOTDU D (1).kmz`

## Resultado

El archivo **no está vacío ni carece de geometrías**. El mensaje de SIGmun
`No se encontraron puntos o polígonos compatibles` se produce principalmente por dos condiciones del KML interno.

### 1. Error XML real: namespace `xsi` no declarado

El archivo `doc.kml` utiliza el atributo `xsi:schemaLocation` en elementos `Document`,
pero el elemento raíz `<kml>` no declara `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`.

Esto hace que un parser XML estricto devuelva **`unbound prefix`**. En navegador,
`DOMParser` produce un `parsererror` y el convertidor KML→GeoJSON termina sin geometrías.

La versión corregida incluida en esta entrega añade el namespace faltante sin cambiar
coordenadas ni atributos.

### 2. Predominan geometrías lineales y `MultiGeometry`

- KMZ comprimido: **12.13 MB**
- KML interno sin comprimir: **152.65 MB**
- Placemark: **57,827**
- Placemark de puntos: **325**
- Placemark de polígonos: **5,069**
- Placemark de líneas: **52,433**
- Etiquetas Polygon: **6,685**
- Etiquetas LineString: **52,476**
- MultiGeometry: **57,502**
- Document internos detectados: **25**
- Styles KML: **36**

El importador anterior solamente guardaba `Point`, `Polygon` y `MultiPolygon`.
Además no expandía correctamente `GeometryCollection`/`MultiGeometry`.
Por eso, incluso con XML reparado, una parte importante del contenido quedaba fuera.

### 3. El KML es grande

`doc.kml` tiene aproximadamente **152.65 MB** descomprimido.
Cargarlo completo con `DOMParser` y después duplicarlo como GeoJSON puede consumir
varias veces ese tamaño en memoria. Se añadió un parser progresivo para archivos KML
grandes, que recorre cada `Placemark`, cede tiempo al navegador y muestra progreso.

### 4. Los atributos están dentro de `description`

Este archivo fue exportado desde software GIS que guarda numerosos atributos dentro
de una tabla HTML en `<description><![CDATA[ ... ]]></description>`, no únicamente
en `ExtendedData`. Ejemplos observados:

`FID`, `CVEGEO`, `AMBITO`, `ZS`, `AREA_ha`, `CUS`, `COS`, `CAS`,
`NOMBRE`, `POBTOT`, `TIPO_VIAL`, `COND_PAV`, entre muchos otros.

El importador corregido extrae esos pares campo/valor y los conserva en `attributes`
para filtros, simbología, etiquetas y consulta en el visor.

## Correcciones implementadas

1. Reparación automática de `xmlns:xsi` cuando el KML usa `xsi:` sin declararlo.
2. Detección explícita de `parsererror`.
3. Parser progresivo para KML/KMZ grandes.
4. Expansión de `MultiGeometry` y `GeometryCollection`.
5. Soporte de `Point`, `Polygon`, `MultiPolygon`, `LineString` y `MultiLineString`.
6. Lectura de atributos en `description` y `ExtendedData`.
7. Diagnóstico guardado en los metadatos de cada capa.
8. Carga masiva por lotes para evitar decenas de miles de solicitudes individuales.
9. Migración PostGIS opcional incluida para almacenar líneas como
   `geometry(MultiLineString,4326)`.
10. Si el backend todavía no tiene soporte de líneas, SIGmun puede importar puntos y
    polígonos y mostrar un aviso preciso en lugar del error genérico.

## Extensión espacial observada

Las coordenadas se encuentran dentro de rangos geográficos válidos y no se detectaron
tokens de coordenadas inválidos durante el análisis. La extensión aproximada es:

- Longitud mínima: **-106.0880245608**
- Longitud máxima: **-104.9894399231**
- Latitud mínima: **27.3062431692**
- Latitud máxima: **28.6041816888**

## Documentos/layers internos

El KMZ contiene múltiples documentos temáticos, entre ellos:

- Usos de Suelo
- H1_Rural
- H1
- límite_municipal
- Centro Historico Municipal (Centro Urbano)
- localidades rurales
- Fundo_legal
- corredor logístico
- corredor primario
- corredor PRIMARIO COPIA
- corredor  barrial
- RH24nb
- RH24na
- RH24kb
- escurrimientos
- canal_20k
- agua
- cuerpos de agua y escurrimientos
- redferroviaria
- alta tensión
- red vial municipio de Delicias
- m_Clip3
- m
- l_mgeo22
- urbano

Para una siguiente mejora puede incorporarse una opción de importación
**“Separar documentos KML como capas SIGmun”**, de modo que un KMZ compuesto como éste
se convierta automáticamente en varias capas administrables.
