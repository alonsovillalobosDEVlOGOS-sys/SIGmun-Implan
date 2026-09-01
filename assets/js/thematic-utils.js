(() => {
  'use strict';

  const PALETTES = {
    municipal: ['#dceafd','#9ec5f8','#5d9fe8','#2474c6','#0b3f78','#06294e','#031b35'],
    bluegreen: ['#e6f5f7','#b9e1e6','#78c8cf','#3aa9b5','#15818f','#0c5a66','#073c45'],
    warm: ['#fff1dc','#ffd59d','#f6ac59','#e3782c','#bd4d21','#87331e','#5d231a'],
    green: ['#e9f5e7','#c4e4bb','#8bca7d','#51aa52','#2b853a','#19632c','#104720'],
    purple: ['#f0eafa','#d7c9f1','#b49be2','#8b6dcc','#6646ad','#493288','#322363'],
    categorical: ['#0f4fa8','#11a0a8','#d48806','#7b61a8','#3f8f49','#c84f5a','#527aa3','#a16b3a','#6c7a89','#2f7d73','#a75087','#6366a8']
  };

  const DEFAULT_STYLE = {
    renderer: 'single',
    color: '#0f4fa8',
    weight: 2,
    opacity: 0.85,
    fillOpacity: 0.32,
    radius: 7,
    field: '',
    classification: 'equal_interval',
    classCount: 5,
    palette: 'municipal',
    categories: [],
    classes: [],
    noDataColor: '#b9c2cc',
    labelField: 'name',
    legend: { show: true, title: '', noDataLabel: 'Sin dato' }
  };

  function normalizeStyle(style = {}) {
    const legend = { ...DEFAULT_STYLE.legend, ...(style.legend || {}) };
    return { ...DEFAULT_STYLE, ...style, legend };
  }

  function colorAt(index, total, paletteName = 'municipal') {
    const p = PALETTES[paletteName] || PALETTES.municipal;
    if (total <= 1) return p[Math.floor((p.length - 1) / 2)];
    const pos = Math.round(index * (p.length - 1) / Math.max(1, total - 1));
    return p[Math.max(0, Math.min(p.length - 1, pos))];
  }

  function comparable(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : String(v).trim();
  }

  function uniqueValues(features, field, max = 50) {
    if (!field) return [];
    const seen = new Map();
    for (const f of features || []) {
      const v = f?.properties?.[field];
      if (v === null || v === undefined || v === '') continue;
      const key = String(v);
      if (!seen.has(key)) seen.set(key, v);
      if (seen.size >= max) break;
    }
    return [...seen.values()];
  }

  function numericValues(features, field) {
    return (features || []).map(f => Number(f?.properties?.[field])).filter(Number.isFinite).sort((a,b)=>a-b);
  }

  function prettyNumber(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? '');
    return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(n);
  }

  function buildCategories(features, field, paletteName = 'categorical', existing = []) {
    const values = uniqueValues(features, field, 40);
    const old = new Map((existing || []).map(x => [String(x.value), x]));
    return values.map((value, i) => {
      const prev = old.get(String(value));
      return {
        value,
        label: prev?.label || String(value),
        color: prev?.color || colorAt(i, values.length, paletteName)
      };
    });
  }

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos), rest = pos - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
  }

  function buildClasses(features, field, count = 5, method = 'equal_interval', paletteName = 'municipal') {
    const vals = numericValues(features, field);
    if (!vals.length) return [];
    const min = vals[0], max = vals[vals.length - 1];
    const n = Math.max(2, Math.min(9, Number(count) || 5));
    const bounds = [min];
    if (min === max) bounds.push(max);
    else if (method === 'quantile') {
      for (let i=1;i<n;i++) bounds.push(quantile(vals, i/n));
      bounds.push(max);
    } else {
      const step = (max - min) / n;
      for (let i=1;i<n;i++) bounds.push(min + step * i);
      bounds.push(max);
    }
    const classes = [];
    for (let i=0;i<bounds.length-1;i++) {
      const from = bounds[i], to = bounds[i+1];
      classes.push({
        min: Number(from.toPrecision(12)),
        max: Number(to.toPrecision(12)),
        label: `${prettyNumber(from)} – ${prettyNumber(to)}`,
        color: colorAt(i, bounds.length-1, paletteName)
      });
    }
    return classes;
  }

  function colorForValue(styleInput, value) {
    const style = normalizeStyle(styleInput);
    if (value === null || value === undefined || value === '') return style.noDataColor;
    if (style.renderer === 'categorized') {
      const match = (style.categories || []).find(c => String(c.value) === String(value));
      return match?.color || style.noDataColor;
    }
    if (style.renderer === 'graduated') {
      const n = Number(value);
      if (!Number.isFinite(n)) return style.noDataColor;
      const classes = style.classes || [];
      for (let i=0;i<classes.length;i++) {
        const c = classes[i];
        const last = i === classes.length - 1;
        if (n >= Number(c.min) && (last ? n <= Number(c.max) : n < Number(c.max))) return c.color;
      }
      return style.noDataColor;
    }
    return style.color;
  }

  function colorForFeature(styleInput, feature) {
    const style = normalizeStyle(styleInput);
    const value = style.field ? feature?.properties?.[style.field] : null;
    return style.renderer === 'single' ? style.color : colorForValue(style, value);
  }

  function leafletPathStyle(styleInput, feature) {
    const style = normalizeStyle(styleInput);
    const color = colorForFeature(style, feature);
    return {
      color: style.outlineColor || color,
      weight: Number(style.weight) || 2,
      opacity: Number(style.opacity ?? 0.85),
      fillColor: color,
      fillOpacity: Number(style.fillOpacity ?? 0.32)
    };
  }

  function leafletPointStyle(styleInput, feature) {
    const style = normalizeStyle(styleInput);
    const color = colorForFeature(style, feature);
    return {
      radius: Number(style.radius) || 7,
      color: style.outlineColor || color,
      weight: Number(style.weight) || 2,
      opacity: Number(style.opacity ?? 0.9),
      fillColor: color,
      fillOpacity: Number(style.fillOpacity ?? 0.72)
    };
  }

  function legendItems(styleInput) {
    const style = normalizeStyle(styleInput);
    if (style.renderer === 'categorized') {
      return (style.categories || []).map(c => ({ label: c.label || String(c.value), color: c.color, value: c.value }));
    }
    if (style.renderer === 'graduated') {
      return (style.classes || []).map(c => ({ label: c.label || `${prettyNumber(c.min)} – ${prettyNumber(c.max)}`, color: c.color, min: c.min, max: c.max }));
    }
    return [{ label: style.legend?.singleLabel || 'Elementos', color: style.color }];
  }

  function fieldList(features) {
    const set = new Set();
    (features || []).slice(0, 1000).forEach(f => Object.keys(f?.properties || {}).forEach(k => set.add(k)));
    return [...set].sort((a,b)=>a.localeCompare(b,'es'));
  }

  window.SigmunTheme = {
    PALETTES, DEFAULT_STYLE, normalizeStyle, colorAt, colorForValue, colorForFeature,
    leafletPathStyle, leafletPointStyle, legendItems, fieldList, uniqueValues, numericValues,
    buildCategories, buildClasses, prettyNumber, comparable
  };
})();
