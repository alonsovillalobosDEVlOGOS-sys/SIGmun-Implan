# Validación PMOTDU · Visor geográfico profesional

Fecha: 4 de septiembre de 2026

## Conclusión

No es necesario volver a cargar el KMZ PMOTDU actual para recuperar su simbología. Las 57,827 entidades ya almacenadas en Supabase fueron enriquecidas con el color, opacidad, borde, grosor e identificador de estilo KML resuelto. El visor actualizado consume esos valores directamente por entidad y mantiene el registro de estilos de la capa como respaldo.

Sí es necesario desplegar los archivos actualizados del visor y hacer una recarga forzada del navegador. Los HTML incluyen versión de recursos `v=20260904d` para evitar que GitHub Pages o el navegador sigan utilizando JavaScript/CSS anteriores.

## Por qué se veía gris

Se encontraron tres causas combinadas:

1. La importación anterior guardó `_kml_style`, pero muchas entidades ya almacenadas no tenían el estilo resuelto a nivel de atributo (`_kml_fill_color`, `_kml_line_color`, opacidades, etc.).
2. El navegador podía seguir cargando una versión anterior de `thematic-utils.js` / `visor.js`; en la captura aparecía “Símbolo único” aunque Supabase ya tenía `renderer = kml`.
3. Varias capas del PMOTDU son realmente grises o de contorno en el KML (`m_Clip3`, `urbano`, límites). Al encender casi todas simultáneamente podían cubrir visualmente a `Usos de Suelo`.

## Corrección aplicada en Supabase

Se resolvieron y almacenaron estilos KML en:

- 325 puntos
- 5,069 polígonos
- 52,433 líneas
- Total: 57,827 entidades
- Entidades con color original resuelto: 57,827
- Entidades con opacidad de origen resuelta: 57,827

`Usos de Suelo` queda clasificado explícitamente por `ZS`, no por una subcarpeta inexistente. El campo `ZS` es la relación semántica entre cada polígono y su clase de zonificación.

## Clasificación `Usos de Suelo` verificada

| ZS | Elementos | Estilo KML | Color original |
|---|---:|---|---|
| H2 | 1,505 | #PolyStyle00 | #f2ad3d |
| H1 | 1,482 | #PolyStyle0147 | #fac896 |
| Centro urbano | 314 | #PolyStyle0172 | #fac8af |
| equipamiento (recrativo y deporte) | 239 | #PolyStyle011 | #93c73f |
| Comercio | 158 | #PolyStyle0321 | #f05b5b |
| equipamiento público | 150 | #PolyStyle06 | #2470b3 |
| Industrial | 97 | #PolyStyle01422 / #PolyStyle0142 | #b35ee0 |
| Corredor primario | 10 | #PolyStyle0364 | #ff917f |
| corredor logístico | 4 | #PolyStyle03640 | #d11f5e |

Total: 3,959 polígonos.

Los dos Style ID utilizados por `Industrial` se fusionan visualmente en una sola categoría `Industrial`, porque el campo de clasificación es `ZS`.

## Capas de referencia y orden cartográfico

El orden inicial se reorganizó para que elementos puntuales, límites, infraestructura y corredores estén por encima de la zonificación. Capas de gran cobertura o de alto volumen que pueden ocultar otras capas quedan apagadas inicialmente.

Entre las capas que ahora arrancan desactivadas están `m_Clip3`, `urbano`, `H1`, `H1_Rural`, `RH24nb`, `RH24na`, `RH24kb`, `escurrimientos`, `agua` y otras capas densas. El usuario puede activarlas individualmente.

Los límites conservan su relleno transparente del KML. Por ejemplo, `límite_municipal` utiliza borde #828282, ancho 4 y relleno con opacidad 0.

## GroundOverlay

El KMZ contiene una cobertura ráster `cuerpos de agua y escurrimientos` que no es un Placemark vectorial. Se agregó soporte `RasterOverlay` y una capa específica en Supabase. Su imagen original se incluye en `assets/kml/PMOTDU_water_overlay.png` y se georreferencia con los límites declarados en el KML.

## Iconos KML

`localidades rurales` incluye un icono PNG dentro del KMZ. Se incorporó a `assets/kml/PMOTDU_locality_icon.png` y el visor lo utiliza con la escala KML original en lugar de sustituirlo por un círculo genérico.

## Pruebas realizadas

Se comprobó con el archivo PMOTDU adjunto que:

- `doc.kml` tiene 160,064,527 bytes descomprimidos y no contiene caracteres UTF-8 de reemplazo.
- Los colores KML ABGR se convierten correctamente a RGB web.
- H1 genera `fillColor #fac896`, fillOpacity 1 y borde original invisible.
- H2 genera `fillColor #f2ad3d` y borde #cccccc.
- `límite_municipal` genera fillOpacity 0, borde #828282 y ancho 4.
- Los dos estilos Industrial se agrupan en una sola clase por `ZS`.
- Los 57,827 registros existentes tienen Style ID, color resuelto y opacidad resuelta.
- El visor usa Canvas para las capas vectoriales grandes.

## Comportamiento del visor actualizado

- Activar/desactivar capa completa.
- Activar/desactivar cada categoría de `ZS`.
- Leyenda dinámica con color original y cantidad de elementos.
- Control de opacidad por capa.
- Ventana de atributos por elemento.
- Identificación de clasificación, documento, carpeta/subcarpeta y estilo de origen.
- Orden cartográfico por panes Leaflet.
- Mapa satelital híbrido con etiquetas como alternativa de base.
- RasterOverlay, puntos con icono, polígonos y líneas en la misma colección.

## Estado final de Supabase

La colección PMOTDU contiene ahora 23 capas registradas: 22 vectoriales y 1 `RasterOverlay`. Las 23 usan `renderer = kml`. Se dejaron 11 capas visibles por defecto para evitar que coberturas densas o duplicadas oculten la zonificación principal.

La migración `sigmun_kml_groundoverlay_support` amplió el catálogo de tipos geográficos para admitir `RasterOverlay` además de Point, MultiPolygon, MultiLineString y Mixed.

## Caché de despliegue

Los HTML principales referencian CSS y JavaScript locales con `?v=20260904d`. Esto es deliberado: después de sustituir los archivos en GitHub, la URL cambia para el navegador aunque el nombre físico sea el mismo. De esta manera la interfaz no debe seguir mostrando “Símbolo único” cuando Supabase ya declara `renderer = kml`.
