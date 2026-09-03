# Despliegue

1. Publica el contenido de esta carpeta en la raíz de GitHub Pages/Vercel/hosting estático.
2. Conserva `assets/`, `index.html`, `sigmun.html`, `visor.html`, `dashboard.html` y `admin.html` en sus rutas relativas actuales.
3. Si todavía no se ha aplicado soporte de líneas en Supabase, ejecuta `supabase/migrations/20260903_kml_kmz_multiline_support.sql` desde SQL Editor antes de importar KMZ que contengan LineString/MultiLineString.
4. La publishable key de Supabase puede residir en `assets/js/config.js`; no publiques contraseñas PostgreSQL ni secret/service-role keys.
