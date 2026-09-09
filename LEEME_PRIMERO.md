# Hotfix MVT MapLibre · 2026-09-09

Corrige el error de MapLibre GL 5.14:

`filter: array expected, undefined found`

## Causa
El objeto de capa enviado a `map.addLayer()` incluía explícitamente `filter: undefined` cuando no había filtros de categorías activos. MapLibre GL 5 valida el Style Specification y rechaza esa propiedad.

## Solución
`visor.js` ahora omite por completo la propiedad `filter` cuando no existe un filtro. Sólo se agrega cuando `massiveFilterExpression()` devuelve un arreglo válido.

## Archivos a sustituir
- `visor.html`
- `assets/js/visor.js`

No requiere migración ni recarga del KMZ. El MVT de Supabase ya responde correctamente.

Versión de caché esperada: `visor.js?v=20260909n`.
