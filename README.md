# SIGmun Delicias — Prototipo estático

Propuesta para Gobierno Municipal de Delicias / IMPLAN Delicias construida con HTML, CSS y JavaScript para poder alojarse en GitHub Pages u otro hosting estático.

## Qué se reutiliza del SIG PHP existente

Se conserva el enfoque funcional del visor previo: Leaflet, mapas base, panel de capas, geolocalización, medición, consulta de propiedades, estilos, impresión y GeoJSON como formato interno.

## Qué no puede ejecutarse directamente en GitHub Pages

- Sesiones y roles PHP.
- `sig-api.php` y operaciones CRUD contra una base de datos.
- Escritura en el gestor de archivos del servidor.
- Rutas físicas de Windows/IIS.
- Secretos o credenciales.

En un sitio estático esas funciones se sustituyen con procesamiento local y fuentes públicas externas. Si después se necesita administración privada o escritura multiusuario, deberá agregarse un backend separado.

## Archivos principales

- `index.html`: landing / galería de proyectos.
- `visor.html`: visor SIG reutilizable.
- `dashboard.html`: visor estadístico reutilizable.
- `assets/js/projects.js`: catálogo y configuración.
- `assets/js/data-utils.js`: lectura y transformación de datos.
- `integrations/google-apps-script/Code.gs`: ejemplo de endpoint de lectura.

## Formatos

Geográficos: GeoJSON/JSON, KML, KMZ, CSV y XLSX con coordenadas, WMS.
Estadísticos: CSV, XLSX/XLS, JSON, GeoJSON, Google Sheets y Apps Script.

En CSV/XLSX se detectan encabezados como `lat`, `latitude`, `latitud`, `lng`, `lon`, `longitud`, `x`, `y`.

## Google Sheets

En el visor/dashboard selecciona Google Sheets, pega la URL o ID y el `gid` de la pestaña. La hoja debe ser pública.

Alternativamente despliega `integrations/google-apps-script/Code.gs` y usa su URL `/exec` como fuente URL/Apps Script.

## Agregar un nuevo proyecto

Edita `assets/js/projects.js`. Agrega la tarjeta y, si es un mapa, agrega una entrada en `SIGMUN_PROJECT_CONFIG`.

Ejemplo:

```js
window.SIGMUN_PROJECT_CONFIG.mi_proyecto = {
  title: 'Mi proyecto',
  subtitle: 'Descripción',
  center: [28.1908, -105.4701],
  zoom: 13,
  dataSources: [
    {
      name: 'Capa pública',
      type: 'geojson',
      url: 'https://dominio/capa.geojson',
      color: '#0f4fa8'
    }
  ]
};
```

Después abre `visor.html?project=mi_proyecto`.

## Publicar en GitHub Pages

1. Crea un repositorio.
2. Sube el contenido de esta carpeta a `main`.
3. Ve a Settings > Pages.
4. Selecciona Deploy from a branch.
5. Usa `main` y `/ (root)`.
6. Guarda.

## Seguridad

Todo HTML/JS y toda fuente pública puede inspeccionarse. No publiques claves privadas, contraseñas ni datos personales. GitHub Pages no ofrece autenticación de aplicación ni backend.

## Landing institucional 2026

La página pública principal es `index.html`. El botón **Ingresar a SIGmun** abre `sigmun.html`, una interfaz unificada desde la cual se puede cambiar entre `visor.html` y `dashboard.html` conservando la misma identidad visual institucional.

El pie de página identifica el desarrollo como: **Desarrollado por Planeación Estratégica del IMPLAN Delicias 2026.**
