# Validación técnica · Edificios 3D · 2026-09-08

## Archivo fuente
El KML suministrado fue leído directamente. Contiene un `NetworkLink` y no contiene geometrías locales ni atributos de altura. El parser detectó correctamente 1 NetworkLink y generó la URL WFS esperada para el layer `geonode:mun_08021_27496d4410670ad0839a579da1645e27`.

## Prueba de enriquecimiento 3D
Se ejecutó una prueba controlada con polígonos y distintos tipos de información:
- edificio con `niveles = 3` → `ALTURA_M = 9.6`, `CONFIANZA_ALTURA = Media`, `RANGO_ALTURA = 8–12 m`;
- edificio con `altura = 18` → `ALTURA_M = 18`, `CONFIANZA_ALTURA = Alta`, `RANGO_ALTURA = 12–20 m`;
- edificio sin altura/niveles → `ALTURA_M = 3.2`, `CONFIANZA_ALTURA = Baja`, `ALTURA_ESTIMADA = Sí`.

La prueba calculó además `AREA_M2`, `RANGO_SUPERFICIE` y `VOLUMEN_M3_EST`.

## Salvaguarda de geometría
Se incorporó un diagnóstico de huellas para evitar extruir automáticamente un gran polígono municipal o una capa que no tenga características típicas de edificios. La activación 3D automática requiere una colección poligonal plausible; el administrador siempre puede revisar y activar manualmente el modo 3D.

## Código y paquete
- Los 10 archivos JavaScript del proyecto pasaron `node --check`.
- No existen referencias locales HTML faltantes.
- No existen IDs HTML duplicados.
- Los CSS mantienen balance estructural de reglas.
- El KMZ de entrega contiene un único `doc.kml`, el NetworkLink original y metadatos `SIGMUN_3D`.

## Validación visual automatizada
Se intentó una captura headless local con Chromium, pero el proceso no completó en el entorno de ejecución disponible. Por ello no se declara una prueba E2E visual automatizada; las validaciones realizadas son estructurales, sintácticas y de funciones de tratamiento geográfico/3D.
