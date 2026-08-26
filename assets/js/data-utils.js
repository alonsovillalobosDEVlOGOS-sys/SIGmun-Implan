(() => {
  'use strict';

  const LAT_ALIASES = ['lat', 'latitude', 'latitud', 'y', 'coord_y', 'coordenada_y'];
  const LNG_ALIASES = ['lng', 'lon', 'long', 'longitude', 'longitud', 'x', 'coord_x', 'coordenada_x'];

  const cleanKey = (value) => String(value ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  function detectCoordinateKeys(rows) {
    if (!Array.isArray(rows) || !rows.length) return { latKey: null, lngKey: null };
    const keys = Object.keys(rows[0]);
    const normalized = new Map(keys.map((key) => [cleanKey(key), key]));
    const find = (aliases) => aliases.map(cleanKey).find((a) => normalized.has(a));
    const latAlias = find(LAT_ALIASES);
    const lngAlias = find(LNG_ALIASES);
    return {
      latKey: latAlias ? normalized.get(latAlias) : null,
      lngKey: lngAlias ? normalized.get(lngAlias) : null
    };
  }

  function rowsToGeoJSON(rows, options = {}) {
    const detected = detectCoordinateKeys(rows);
    const latKey = options.latKey || detected.latKey;
    const lngKey = options.lngKey || detected.lngKey;
    if (!latKey || !lngKey) {
      throw new Error('No se detectaron columnas de latitud y longitud. Usa encabezados como lat/latitud y lng/longitud.');
    }

    const features = rows.map((row, index) => {
      const lat = Number(String(row[latKey] ?? '').replace(',', '.'));
      const lng = Number(String(row[lngKey] ?? '').replace(',', '.'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
      return {
        type: 'Feature',
        id: index + 1,
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { ...row }
      };
    }).filter(Boolean);

    if (!features.length) throw new Error('No se encontraron coordenadas válidas.');
    return { type: 'FeatureCollection', features };
  }

  function geojsonToRows(geojson) {
    return (geojson?.features || []).map((feature, index) => ({
      _id: feature.id ?? index + 1,
      _geometry: feature.geometry?.type || '',
      ...(feature.properties || {})
    }));
  }

  function normalizeJsonPayload(payload) {
    if (payload?.type === 'FeatureCollection') {
      return { kind: 'geojson', geojson: payload, rows: geojsonToRows(payload) };
    }
    if (payload?.type === 'Feature') {
      const geojson = { type: 'FeatureCollection', features: [payload] };
      return { kind: 'geojson', geojson, rows: geojsonToRows(geojson) };
    }
    const rows = Array.isArray(payload) ? payload :
      (Array.isArray(payload?.data) ? payload.data :
      (Array.isArray(payload?.rows) ? payload.rows : null));
    if (rows) {
      let geojson = null;
      try { geojson = rowsToGeoJSON(rows); } catch (_) {}
      return { kind: geojson ? 'table+geojson' : 'table', rows, geojson };
    }
    throw new Error('El JSON no contiene un FeatureCollection ni un arreglo de registros reconocible.');
  }

  async function parseFile(file) {
    const name = file.name || 'archivo';
    const ext = name.toLowerCase().split('.').pop();

    if (['json', 'geojson'].includes(ext)) {
      return normalizeJsonPayload(JSON.parse(await file.text()));
    }
    if (ext === 'csv') {
      const parsed = Papa.parse(await file.text(), { header: true, skipEmptyLines: true, dynamicTyping: true });
      if (parsed.errors?.length && !parsed.data?.length) throw new Error(parsed.errors[0].message);
      const rows = parsed.data;
      let geojson = null;
      try { geojson = rowsToGeoJSON(rows); } catch (_) {}
      return { kind: geojson ? 'table+geojson' : 'table', rows, geojson };
    }
    if (['xlsx', 'xls'].includes(ext)) {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
      let geojson = null;
      try { geojson = rowsToGeoJSON(rows); } catch (_) {}
      return { kind: geojson ? 'table+geojson' : 'table', rows, geojson, sheetName };
    }
    if (ext === 'kml') {
      const xml = new DOMParser().parseFromString(await file.text(), 'text/xml');
      const geojson = toGeoJSON.kml(xml);
      return { kind: 'geojson', geojson, rows: geojsonToRows(geojson) };
    }
    if (ext === 'kmz') {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const kmlName = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.kml'));
      if (!kmlName) throw new Error('El KMZ no contiene un archivo KML.');
      const xml = new DOMParser().parseFromString(await zip.files[kmlName].async('text'), 'text/xml');
      const geojson = toGeoJSON.kml(xml);
      return { kind: 'geojson', geojson, rows: geojsonToRows(geojson) };
    }
    throw new Error(`Formato .${ext} no soportado por esta versión.`);
  }

  function sheetUrl(input, gid = '0') {
    const value = String(input || '').trim();
    if (!value) throw new Error('Ingresa la URL o ID de la hoja.');
    if (/^https?:\/\//i.test(value) && !value.includes('docs.google.com/spreadsheets')) return value;
    const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const id = match ? match[1] : value;
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(gid || '0')}`;
  }

  async function fetchDataset(url, options = {}) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json,text/csv,text/plain,*/*' },
      ...options
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: no se pudo cargar la fuente.`);
    const type = (response.headers.get('content-type') || '').toLowerCase();
    const text = await response.text();
    if (type.includes('json') || /^[\s\n]*[\[{]/.test(text)) {
      return normalizeJsonPayload(JSON.parse(text));
    }
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    const rows = parsed.data;
    let geojson = null;
    try { geojson = rowsToGeoJSON(rows); } catch (_) {}
    return { kind: geojson ? 'table+geojson' : 'table', rows, geojson };
  }

  function summarizeRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const fields = safeRows.length ? Object.keys(safeRows[0]) : [];
    const numericFields = fields.filter((field) => {
      const vals = safeRows.slice(0, 80).map((r) => r[field]).filter((v) => v !== '' && v !== null && v !== undefined);
      return vals.length > 0 && vals.filter((v) => Number.isFinite(Number(v))).length / vals.length >= 0.8;
    });
    const categoricalFields = fields.filter((field) => {
      const values = [...new Set(safeRows.map((r) => String(r[field] ?? '').trim()).filter(Boolean))];
      return values.length > 1 && values.length <= 15;
    });
    return { count: safeRows.length, fields, numericFields, categoricalFields };
  }

  function categorySeries(rows, field, max = 12) {
    const counts = new Map();
    rows.forEach((row) => {
      const key = String(row[field] ?? 'Sin dato').trim() || 'Sin dato';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  }

  function numericSummary(rows, field) {
    const nums = rows.map((r) => Number(r[field])).filter(Number.isFinite);
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return { count: nums.length, sum, avg: sum / nums.length, min: Math.min(...nums), max: Math.max(...nums) };
  }

  function downloadText(filename, text, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function downloadGeoJSON(filename, geojson) {
    downloadText(filename, JSON.stringify(geojson, null, 2), 'application/geo+json;charset=utf-8');
  }
  function downloadCSV(filename, rows) {
    downloadText(filename, Papa.unparse(rows), 'text/csv;charset=utf-8');
  }
  function downloadXLSX(filename, rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Datos');
    XLSX.writeFile(wb, filename);
  }

  window.SigmunData = {
    cleanKey, detectCoordinateKeys, rowsToGeoJSON, geojsonToRows,
    normalizeJsonPayload, parseFile, sheetUrl, fetchDataset,
    summarizeRows, categorySeries, numericSummary,
    downloadText, downloadGeoJSON, downloadCSV, downloadXLSX
  };
})();
