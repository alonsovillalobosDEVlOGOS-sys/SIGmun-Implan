#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -lt 2 ]; then
  echo "Uso: $0 entrada.geojson salida.pmtiles [minzoom] [maxzoom]"
  exit 1
fi
IN="$1"; OUT="$2"; MINZ="${3:-10}"; MAXZ="${4:-18}"
command -v tippecanoe >/dev/null || { echo "Falta tippecanoe"; exit 2; }
command -v pmtiles >/dev/null || { echo "Falta CLI pmtiles"; exit 3; }
TMP="${OUT%.pmtiles}.mbtiles"
tippecanoe -o "$TMP" -l sigmun -Z "$MINZ" -z "$MAXZ" --drop-densest-as-needed --extend-zooms-if-still-dropping "$IN"
pmtiles convert "$TMP" "$OUT"
echo "Generado: $OUT"
