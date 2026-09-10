# SIGmun Delicias · Corrección MVT 2D anclado · 2026-09-10

## Diagnóstico

El video de prueba confirma que la geometría MVT sí estaba georreferenciada en la base de datos, pero la representación 2D se dibujaba en un segundo mapa MapLibre transparente superpuesto sobre Leaflet. Durante pan y zoom las dos cámaras no conservaban exactamente la misma transformación visual, por lo que la geometría parecía deslizarse respecto del mapa base.

La vista 3D no presenta este problema porque en ese modo MapLibre controla por sí solo la cámara completa.

## Cambio de arquitectura

Las capas MVT de la vista 2D ya no se representan en `#mapMvtOverlay`.

Ahora se dibujan mediante `Leaflet.VectorGrid` dentro del mismo mapa Leaflet que contiene el mapa base. De esta forma:

- el mapa base y las geometrías usan el mismo CRS Web Mercator;
- comparten el mismo zoom, centro, panes y ciclo de teselas;
- el paneo y el zoom son transformados por una sola instancia de Leaflet;
- no existe una segunda cámara que sincronizar;
- las teselas siguen obteniéndose desde `SigmunDB.mvtTile()` y el motor MVT v3 de Supabase;
- la vista 3D conserva MapLibre y no se modifica.

## Cobertura

La corrección se aplica automáticamente a capas masivas MVT de:
- MultiPolygon
- MultiLineString
- Point

Por tanto cubre edificios, frentes de manzana, redes lineales extensas y futuras capas que SIGmun clasifique como MVT.

## Dependencia

Se fijó `leaflet.vectorgrid@1.3.0` y se usa el renderer Canvas nativo de VectorGrid.

## Caché

Versión de frontend: `20260910a`.

No requiere migración de Supabase ni reimportar capas existentes.
