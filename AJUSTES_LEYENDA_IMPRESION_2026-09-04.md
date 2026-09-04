# Ajustes adicionales · impresión cartográfica · 2026-09-04

## Correcciones aplicadas

1. **Captura real del mapa para impresión**
   - La impresión ahora genera una imagen estática del mapa visible antes de abrir `window.print()`.
   - Se dibujan teselas, rásteres, canvases y marcadores visibles sobre un lienzo temporal.
   - La salida impresa usa esa captura para evitar páginas con el mapa en blanco.

2. **Capas base preparadas para exportación**
   - `OpenStreetMap`, `Esri` y `OpenTopoMap` se configuraron con `crossOrigin:true`.
   - Los `imageOverlay` ráster del proyecto también se preparan con `crossOrigin:true`.

3. **Leyenda simplificada refinada**
   - Se ignoran campos técnicos como `id`, `fid`, `gid`, `objectid`, `way`, `dist`, `buvf_*`, etc.
   - Si una capa termina usando un solo color visible, la leyenda se colapsa en una sola entrada general.
   - Solo las capas realmente temáticas y con colores diferenciados conservan clases visibles.

4. **Cuadro institucional redistribuido**
   - Se creó una hoja de impresión específica (`print-sheet`) separada del visor vivo.
   - Se amplió el cartucho inferior y se reorganizó la malla para que la simbología sea legible.
   - El logotipo de IMPLAN ahora usa la versión horizontal completa (`branding.png`) y la imagen municipal se conserva como apoyo institucional.

5. **Caché**
   - Recursos del visor actualizados a versión `20260904f`.
