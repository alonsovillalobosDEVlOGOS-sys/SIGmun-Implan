# Guía rápida · Edificios 3D en SIGmun Delicias

## Carga
1. Abre `admin.html` → Capas geográficas.
2. Selecciona el proyecto.
3. Carga KML/KMZ, CSV/WKT o un KML `NetworkLink` de GeoServer/GeoNode.
4. Si SIGmun detecta polígonos, aparecerá **Preparación tridimensional**.
5. Utiliza `Automático recomendado` o selecciona explícitamente el campo de altura o niveles.
6. Revisa la vista previa 2D y **Vista 3D** antes de publicar.

## Interpretación de altura
- `CONFIANZA_ALTURA = Alta`: altura directa de la fuente o Z utilizable.
- `CONFIANZA_ALTURA = Media`: altura calculada a partir de niveles/pisos.
- `CONFIANZA_ALTURA = Baja`: altura predeterminada; es una aproximación visual y no debe interpretarse como levantamiento arquitectónico.

## Visor público
En `visor.html`, pulsa **Vista 3D**. El mapa conserva coordenadas XY en EPSG:4326 y utiliza Z como extrusión vertical. Al seleccionar un edificio se muestran altura, rango, niveles estimados, superficie de huella y confianza de la estimación.

## Archivo preparado
`ejemplos/Delicias_Chihuahua_Edificios_3D_SIGmun.kmz` conserva el NetworkLink original y añade metadatos SIGmun para solicitar preparación 3D. El archivo depende de que el GeoServer remoto sea accesible y permita WFS/CORS desde el navegador.
