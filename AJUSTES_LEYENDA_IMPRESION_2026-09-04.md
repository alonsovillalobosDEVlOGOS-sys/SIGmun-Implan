# SIGmun Delicias · Leyenda e impresión cartográfica profesional

## Leyenda simplificada

- Una capa con un solo estilo/color se representa con **una sola entrada general**, sin listar FID, gid, way u otros identificadores de cada entidad.
- Las capas temáticas conservan una entrada por **clase significativa**. En `Usos de Suelo`, el campo `ZS` mantiene H1, H2, Centro urbano, Comercio, Industrial, equipamientos y corredores como clases independientes.
- Style IDs duplicados que representan la misma clase dejan de multiplicar renglones de leyenda.
- Los campos técnicos `FID`, `gid`, `way`, `objectid`, `length`, `area`, etc. ya no se seleccionan automáticamente como campos de clasificación de leyenda.
- La muestra de simbología diferencia visualmente puntos, líneas, polígonos y coberturas ráster.

## Impresión / PDF

El botón de impresión ya no llama directamente a `window.print()`. Abre un configurador cartográfico con:

- Carta, A4, Oficio, Legal, Tabloide y A3.
- Orientación vertical.
- Título editable del plano.
- Clave editable del plano.
- Una sola página.
- Extensión cartográfica tomada de la vista actual.
- Capas y subcapas visibles en ese momento.
- Opacidades actuales.
- Leyenda simplificada correspondiente a la vista.

El cuadro cartográfico inferior incluye:

- IMPLAN Delicias y Municipio de Delicias.
- Tema y proyecto.
- Descripción del proyecto.
- Simbología temática visible.
- Norte.
- Clave de plano.
- Escala aproximada.
- WGS 84 / EPSG:4326.
- Mapa base utilizado.
- Número de capas visibles.
- Fecha de impresión.
- Crédito de Planeación Estratégica · IMPLAN Delicias 2026.

## Comportamiento de escala y extensión

Antes de imprimir se conserva el `bounds` de la vista actual. Al entrar al modo de impresión Leaflet recalcula su tamaño y ajusta la hoja a esos límites para evitar que el PDF muestre una extensión distinta. Al cerrar el diálogo de impresión el mapa vuelve al centro y zoom originales.
