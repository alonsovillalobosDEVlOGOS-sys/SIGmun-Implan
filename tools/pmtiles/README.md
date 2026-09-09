# Preparar PMTiles para SIGmun

PMTiles es opcional. Úsalo para una capa grande que sea relativamente estática.

## Requisitos recomendados

- `tippecanoe`
- CLI `pmtiles`
- Un GeoJSON en EPSG:4326
- Hosting/CDN que soporte HTTP Range y CORS (por ejemplo un bucket/CDN correctamente configurado)

## Flujo recomendado (macOS, Linux o WSL)

```bash
# 1) GeoJSON -> MBTiles. El source-layer se llama "sigmun".
tippecanoe \
  -o capa.mbtiles \
  -l sigmun \
  -Z 10 -z 18 \
  --drop-densest-as-needed \
  --extend-zooms-if-still-dropping \
  capa.geojson

# 2) MBTiles -> PMTiles
pmtiles convert capa.mbtiles capa.pmtiles
```

Ajusta `-Z` y `-z` según la capa. Para edificios urbanos suele ser preferible no mostrarlos a escalas demasiado bajas.

## Publicar

Sube `capa.pmtiles` a un origen público que acepte `Range` y CORS. Después, en `admin.html`:

- Motor: **PMTiles**
- URL: URL pública del archivo
- Source layer: `sigmun`
- Zoom mínimo: el usado al producir el archivo

No elimines la geometría de Supabase si necesitas seguir consultando atributos, editar la capa o conservar MVT como fallback.
