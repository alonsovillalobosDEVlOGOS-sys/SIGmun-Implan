# Hotfix MVT / MapLibre · 2026-09-09

Se corrigió la construcción de capas MVT 2D/3D para MapLibre GL 5.14. La propiedad `filter` ya no se envía como `undefined`; se omite cuando no hay filtro activo y sólo se agrega si es un arreglo válido.

El cambio aplica a polígonos 2D, extrusiones 3D, líneas y puntos MVT.

Se verificó que la RPC MVT de la capa `Edificaciones del municipio de Delicias del estado de Chihuahua 2025 3D` continúa devolviendo teselas válidas en zoom 15 (tile de Delicias centro: ~403,909 caracteres base64).
