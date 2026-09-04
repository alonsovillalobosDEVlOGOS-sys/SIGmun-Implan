(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = {
    topics: [], projects: [], project: null, layers: [], layer: null,
    rows: [], searchRows: [], filtered: [], profiles: [],
    mapping: { time: '', dimension: '', series: '', values: [] },
    filters: { time: '', dimension: '', series: '', topN: 'all' },
    chart: null, sortables: [], suggestions: []
  };

  const replacements = [
    ['Sub�ndice','Subíndice'],['�ndice','Índice'],['�Mas es mejor?','¿Más es mejor?'],['S�','Sí'],
    ['Direcci�n','Dirección'],['P�blica','Pública'],['Fiscal�a','Fiscalía'],['Innovaci�n','Innovación'],
    ['Econ�mico','Económico'],['Econ�micos','Económicos'],['Secretar�a','Secretaría'],['Educaci�n','Educación'],
    ['Subdirecci�n','Subdirección'],['Coordinaci�n','Coordinación'],['Protecci�n','Protección'],['Bi�n Com�n','Bien Común'],
    ['Com�n','Común'],['Administraci�n','Administración'],['Art�culo','Artículo'],['Expansi�n','Expansión'],
    ['Legislaci�n','Legislación'],['Bar�metro','Barómetro'],['g�nero','género'],['poblaci�n','población'],
    ['Poblaci�n','Población'],['operaci�n','operación'],['investigaci�n','investigación'],['Cr�dito','Crédito'],
    ['cr�dito','crédito'],['Cr�ditos','Créditos'],['Diversificaci�n','Diversificación'],['m�s','más'],['M�s','Más'],
    ['l�neas','líneas'],['telef�nicas','telefónicas'],['m�viles','móviles'],['energ�tica','energética'],
    ['econom�a','economía'],['Econom�a','Economía'],['Inversi�n','Inversión'],['inversi�n','inversión'],
    ['p�blico','público'],['extracci�n','extracción'],['refinaci�n','refinación'],['Ocupaci�n','Ocupación'],
    ['Participaci�n','Participación'],['Percepci�n','Percepción'],['corrupci�n','corrupción'],['l�nea','línea'],
    ['veh�culos','vehículos'],['Tama�o','Tamaño'],['A�os','Años'],['a�os','años'],['a�o','año'],
    ['par�metros','parámetros'],['Observaci�n','Observación'],['D�lares','Dólares'],['d�lares','dólares'],
    ['mill�n','millón'],['c�bicos','cúbicos'],['c�pita','cápita'],['N�mero','Número'],['est�n','están'],
    ['d�bito','débito'],['hect�rea','hectárea'],['pr�cticas','prácticas'],['categor�rica','categórica'],
    ['pol�tico','político'],['pol�tica','política'],['energ�a','energía'],['informaci�n','información'],
    ['econ�mica','económica'],['econ�micas','económicas'],['superior','superior']
  ];

  function fixText(value) {
    if (value === null || value === undefined) return '';
    let s = String(value);
    if (/[ÃÂâ]/.test(s)) {
      try { s = decodeURIComponent(escape(s)); } catch (_) {}
    }
    if (s.includes('�')) {
      replacements.forEach(([from, to]) => { s = s.split(from).join(to); });
    }
    return s.normalize ? s.normalize('NFC') : s;
  }
  const esc = v => fixText(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rawString = v => String(v ?? 'Sin dato');
  let toastTimer;
  function toast(message, error=false) {
    const x = $('toast'); if (!x) return;
    x.textContent = fixText(message); x.classList.toggle('error', error); x.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => x.classList.remove('show'), 2800);
  }
  const profile = field => state.profiles.find(p => p.name === field);
  const label = field => fixText(profile(field)?.label || field || '');
  const extractYear = field => { const m = label(field).match(/(?:19|20)\d{2}/); return m ? Number(m[0]) : null; };
  const yearMeasures = () => state.profiles.filter(p => p.role === 'measure' && extractYear(p.name)).sort((a,b) => extractYear(a.name)-extractYear(b.name));
  const unitsField = () => state.profiles.find(p => /(^|\b)unidades?($|\b)/i.test(fixText(p.label||p.name)))?.name || '';
  function smartNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value === null || value === undefined || value === '') return null;
    let s = fixText(value).trim().replace(/\s/g,'');
    const percent = s.endsWith('%');
    if (percent) s = s.slice(0,-1);
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g,'');
    else if (/^-?\d+,\d+$/.test(s) && !s.includes('.')) s = s.replace(',','.');
    s = s.replace(/[$€£]/g,'');
    const n = Number(s); return Number.isFinite(n) ? {value:n,percent} : null;
  }
  function rowNumber(row, field) {
    const parsed = smartNumber(row?.[field]); if (parsed === null) return null;
    let n = typeof parsed === 'number' ? parsed : parsed.value; const explicitPercent = typeof parsed === 'object' && parsed.percent;
    const uf = unitsField(), units = uf ? fixText(row?.[uf]).toLocaleLowerCase('es-MX') : '';
    if (!explicitPercent && /porcentaje|%/.test(units) && Math.abs(n) <= 1 && n !== 0) n *= 100;
    return n;
  }
  function aggregateField(rows, field, method='sum') {
    if (method === 'count') return rows.filter(r => r?.[field] !== null && r?.[field] !== undefined && r?.[field] !== '').length;
    const nums = rows.map(r => rowNumber(r, field)).filter(Number.isFinite); if (!nums.length) return 0;
    if (method === 'avg') return nums.reduce((a,b)=>a+b,0)/nums.length; if (method === 'min') return Math.min(...nums); if (method === 'max') return Math.max(...nums); return nums.reduce((a,b)=>a+b,0);
  }
  function numericFieldStats(rows, field) {
    const a=rows.map(r=>rowNumber(r,field)).filter(Number.isFinite); if(!a.length)return null; const sum=a.reduce((x,y)=>x+y,0),sorted=[...a].sort((x,y)=>x-y),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2; return{sum,avg:sum/a.length,min:Math.min(...a),max:Math.max(...a),median,count:a.length};
  }

  async function init() {
    try {
      state.topics = await SigmunDB.topics();
      state.projects = await SigmunDB.projects();
      fillTopics();
      const slug = new URLSearchParams(location.search).get('project');
      const p = state.projects.find(x => x.slug === slug) || state.projects.find(x => x.project_type !== 'map') || state.projects[0];
      if (p) {
        $('topicSelect').value = p.topic_id;
        fillProjects(p.topic_id, p.id);
        await selectProject(p.id);
      }
    } catch (e) { console.error(e); toast(e.message, true); }
  }

  function fillTopics() {
    $('topicSelect').innerHTML = state.topics.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    $('topicSelect').onchange = async e => {
      fillProjects(e.target.value);
      if ($('projectSelect').value) await selectProject($('projectSelect').value);
    };
  }
  function fillProjects(topicId, selected) {
    const arr = state.projects.filter(p => p.topic_id === topicId && p.project_type !== 'map');
    $('projectSelect').innerHTML = arr.map(p => `<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');
    $('projectSelect').onchange = e => selectProject(e.target.value);
  }
  async function selectProject(id) {
    state.project = state.projects.find(p => p.id === id); if (!state.project) return;
    $('headerTitle').textContent = fixText(state.project.name);
    $('heroTitle').textContent = fixText(state.project.name);
    $('heroDesc').textContent = fixText(state.project.description || 'Explora los indicadores disponibles y construye comparaciones visuales.');
    $('mapLink').href = `visor.html?project=${encodeURIComponent(state.project.slug)}`;
    state.layers = await SigmunDB.statLayers(id);
    $('layerSelect').innerHTML = state.layers.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    $('layerSelect').onchange = e => selectLayer(e.target.value);
    if (state.layers[0]) await selectLayer(state.layers[0].id); else emptyDashboard();
  }
  function emptyDashboard() {
    state.layer = null; state.rows = []; state.searchRows = []; state.filtered = []; state.profiles = [];
    state.mapping = {time:'',dimension:'',series:'',values:[]}; resetSmartFilters();
    renderKpis(); renderShelf(); renderSuggestions(); renderSmartFilters(); renderChart(); renderTable();
    $('builderMessage').textContent = 'Este proyecto todavía no tiene bases estadísticas públicas.';
  }
  async function selectLayer(id) {
    state.layer = state.layers.find(x => x.id === id); if (!state.layer) return;
    $('layerSelect').value = id;
    $('heroDesc').textContent = fixText(state.layer.description || state.project?.description || 'Explora y compara los datos almacenados.');
    try {
      state.rows = await SigmunDB.statRecords(id);
      const roles = state.layer.chart_config?.field_roles || {};
      state.profiles = SigmunData.profileFields(state.rows, roles).filter(p => !p.hidden);
      renderShelf(); renderSuggestions(); renderDataQuality(); applyInitialView();
    } catch (e) { toast(e.message, true); }
  }

  function renderShelf() {
    destroySortables();
    const groups = [['time','Tiempo','bi-calendar3'],['dimension','Dimensiones','bi-diagram-3'],['measure','Medidas','bi-123']];
    $('fieldShelf').innerHTML = groups.map(([role,title,icon]) => {
      const arr = state.profiles.filter(p => p.role === role);
      return `<div class="field-group"><div class="field-group-title"><i class="bi ${icon}"></i>${title}<span>${arr.length}</span></div><div class="field-source" data-source-role="${role}">${arr.map(p => `<div class="field-chip role-${role}" data-field="${esc(p.name)}" data-field-role="${role}" title="Arrastra o haz clic para agregar"><i class="bi ${icon}"></i><span>${esc(p.label||p.name)}</span><small>${p.unique} únicos</small></div>`).join('') || '<div class="field-group-empty">Sin campos detectados</div>'}</div></div>`;
    }).join('');
    document.querySelectorAll('.field-chip[data-field]').forEach(c => c.addEventListener('click', () => quickAddField(c.dataset.field, c.dataset.fieldRole)));
    initSortables(); renderMapping();
  }
  function destroySortables() { state.sortables.forEach(x => { try { x.destroy(); } catch (_) {} }); state.sortables = []; }
  function initSortables() {
    if (!window.Sortable) return;
    document.querySelectorAll('.field-source').forEach(src => state.sortables.push(new Sortable(src, {group:{name:'analysis-fields',pull:'clone',put:false},sort:false,animation:130,filter:'.field-group-empty'})));
    document.querySelectorAll('.field-drop').forEach(zone => state.sortables.push(new Sortable(zone, {group:{name:'analysis-fields',pull:true,put:true},animation:130,onAdd:evt=>handleDrop(evt,zone.dataset.role),onUpdate:()=>syncValueOrder()})));
  }
  function allowed(field, zone) {
    const r = profile(field)?.role;
    if (zone === 'time') return r === 'time';
    if (zone === 'dimension' || zone === 'series') return r === 'dimension' || r === 'time';
    if (zone === 'values') return r === 'measure';
    return false;
  }
  function removeFieldEverywhere(field) {
    if (state.mapping.time === field) state.mapping.time = '';
    if (state.mapping.dimension === field) state.mapping.dimension = '';
    if (state.mapping.series === field) state.mapping.series = '';
    state.mapping.values = state.mapping.values.filter(x => x !== field);
  }
  function handleDrop(evt, zone) {
    const field = evt.item.dataset.field; evt.item.remove();
    if (!field || !allowed(field, zone)) { toast('Ese tipo de campo no corresponde a esta zona.', true); renderMapping(); return; }
    removeFieldEverywhere(field);
    if (zone === 'time') state.mapping.time = field;
    if (zone === 'dimension') state.mapping.dimension = field;
    if (zone === 'series') state.mapping.series = field;
    if (zone === 'values') {
      if (state.mapping.values.length >= 12) toast('Puedes comparar hasta doce medidas a la vez.', true);
      else state.mapping.values.push(field);
    }
    resetSmartFilters(); renderMapping(); updateVisualization();
  }
  function quickAddField(field, role) {
    if (role === 'time') state.mapping.time = field;
    else if (role === 'measure') { if (!state.mapping.values.includes(field) && state.mapping.values.length < 12) state.mapping.values.push(field); }
    else if (!state.mapping.dimension) state.mapping.dimension = field; else state.mapping.series = field;
    resetSmartFilters(); renderMapping(); updateVisualization();
  }
  function mappingChip(field) { return `<div class="mapped-chip" data-field="${esc(field)}"><span>${esc(label(field))}</span><button data-remove-field="${esc(field)}"><i class="bi bi-x"></i></button></div>`; }
  function setZone(id, fields, placeholder) {
    const z = $(id); z.innerHTML = fields.length ? fields.map(mappingChip).join('') : `<span class="drop-placeholder">${placeholder}</span>`;
    z.querySelectorAll('[data-remove-field]').forEach(b => b.onclick = e => { e.stopPropagation(); removeFieldEverywhere(b.dataset.removeField); resetSmartFilters(); renderMapping(); updateVisualization(); });
  }
  function renderMapping() {
    setZone('dropTime', state.mapping.time?[state.mapping.time]:[], 'Arrastra un campo temporal');
    setZone('dropDimension', state.mapping.dimension?[state.mapping.dimension]:[], 'Ej. indicador, colonia, sector');
    setZone('dropSeries', state.mapping.series?[state.mapping.series]:[], 'Ej. subíndice, sexo, programa');
    setZone('dropValues', state.mapping.values, 'Arrastra una o varias medidas');
  }
  function syncValueOrder() {
    const vals = [...$('dropValues').querySelectorAll('[data-field]')].map(x => x.dataset.field);
    if (vals.length) state.mapping.values = vals.slice(0,12);
    renderMapping(); updateVisualization();
  }

  function serverDefault() {
    const d = state.layer?.chart_config?.default_view || {};
    return {time:d.time||'',dimension:d.dimension||'',series:d.series||'',values:d.values||(d.value?[d.value]:[]),chart:d.chart||'auto',aggregation:d.aggregation||'sum',sort:d.sort||'natural',palette:d.palette||'categorical',colorMode:d.colorMode||'auto',filters:d.filters||{}};
  }
  function autoDefault() {
    const t = state.profiles.find(p=>p.role==='time');
    const m = state.profiles.find(p=>p.role==='measure');
    const d = state.profiles.find(p=>p.role==='dimension'&&p.unique>1&&p.unique<=40);
    if (t && m) return {time:t.name,dimension:'',series:d&&d.unique<=12?d.name:'',values:[m.name],chart:'line',aggregation:'sum',sort:'natural'};
    if (d && m) return {time:'',dimension:d.name,series:'',values:[m.name],chart:'bar',aggregation:'sum',sort:'desc'};
    if (d) return {time:'',dimension:d.name,series:'',values:[],chart:'doughnut',aggregation:'count',sort:'desc'};
    return {time:'',dimension:'',series:'',values:m?[m.name]:[],chart:'bar',aggregation:m?'sum':'count',sort:'natural'};
  }
  function validConfig(c) {
    const fields = new Set(state.profiles.map(p=>p.name));
    return {
      time: fields.has(c.time)?c.time:'', dimension: fields.has(c.dimension)?c.dimension:'', series: fields.has(c.series)?c.series:'',
      values: (c.values||[]).filter(v=>fields.has(v)).slice(0,12), chart:c.chart||'auto', aggregation:c.aggregation||'sum', sort:c.sort||'natural',
      palette:c.palette||'categorical', colorMode:c.colorMode||'auto', filters:c.filters||{}
    };
  }
  function applyConfig(c) {
    c = validConfig(c);
    state.mapping = {time:c.time,dimension:c.dimension,series:c.series,values:c.values};
    state.filters = {time:c.filters?.time||'',dimension:c.filters?.dimension||'',series:c.filters?.series||'',topN:c.filters?.topN||'all'};
    $('chartType').value = [...$('chartType').options].some(o=>o.value===c.chart)?c.chart:'auto';
    $('aggregation').value = [...$('aggregation').options].some(o=>o.value===c.aggregation)?c.aggregation:'sum';
    $('sortMode').value = [...$('sortMode').options].some(o=>o.value===c.sort)?c.sort:'natural';
    if($('chartPalette')) $('chartPalette').value=[...$('chartPalette').options].some(o=>o.value===c.palette)?c.palette:'categorical';
    if($('chartColorMode')) $('chartColorMode').value=[...$('chartColorMode').options].some(o=>o.value===c.colorMode)?c.colorMode:'auto';
    renderMapping(); updateVisualization();
  }
  function applyInitialView() {
    const saved = localStorage.getItem(`sigmun-dashboard-view-${state.layer.id}`); let config;
    if (saved) { try { config = JSON.parse(saved); } catch (_) {} }
    config = config || serverDefault();
    if (!config.time && !config.dimension && !config.values?.length) config = autoDefault();
    applyConfig(config);
  }
  $('refreshFieldsBtn').onclick = () => applyConfig(state.suggestions[0]?.config || autoDefault());
  $('restoreViewBtn').onclick = () => applyConfig(serverDefault());
  $('saveViewBtn').onclick = () => {
    if (!state.layer) return;
    localStorage.setItem(`sigmun-dashboard-view-${state.layer.id}`, JSON.stringify(currentConfig()));
    toast('Vista y filtros guardados en este navegador.');
  };
  function currentConfig() { return {...state.mapping,chart:$('chartType').value,aggregation:$('aggregation').value,sort:$('sortMode').value,palette:$('chartPalette')?.value||'categorical',colorMode:$('chartColorMode')?.value||'auto',filters:{...state.filters}}; }
  ['chartType','aggregation','sortMode','chartPalette','chartColorMode'].forEach(id => $(id)?.addEventListener('change', updateVisualization));

  function findDimension(regex) { return state.profiles.find(p => p.role==='dimension' && regex.test(fixText(p.label||p.name))); }
  function renderSuggestions() {
    const t = state.profiles.find(p=>p.role==='time');
    const measures = state.profiles.filter(p=>p.role==='measure');
    const dims = state.profiles.filter(p=>p.role==='dimension'&&p.unique>1&&p.unique<=80);
    const m = measures[0], d = dims[0], series = dims.find(x=>x.unique<=12), years = yearMeasures();
    const indicator = findDimension(/indicador/i) || dims.find(x=>x.unique>12&&x.unique<=150);
    const s = [];

    if (t && m) s.push({icon:'bi-graph-up-arrow',title:'Tendencia de crecimiento',desc:`Evolución de ${label(m.name)} a través de ${label(t.name)}.`,config:{time:t.name,dimension:'',series:'',values:[m.name],chart:'line',aggregation:'sum',sort:'natural'}});
    if (t && m && series) s.push({icon:'bi-bezier2',title:'Series comparativas por tiempo',desc:`Compara ${label(m.name)} por ${label(series.name)} en cada periodo.`,config:{time:t.name,dimension:'',series:series.name,values:[m.name],chart:'line',aggregation:'sum',sort:'natural'}});
    if (!t && years.length>=3 && indicator) s.push({icon:'bi-activity',title:'Tendencia histórica por indicador',desc:`Usa ${label(indicator.name)} como filtro y compara ${extractYear(years[0].name)}–${extractYear(years[years.length-1].name)}.`,config:{time:'',dimension:indicator.name,series:'',values:years.slice(0,12).map(x=>x.name),chart:'line',aggregation:'avg',sort:'natural'}});
    if (t && measures.length>=2) s.push({icon:'bi-graph-up',title:'Comparar indicadores en el tiempo',desc:`Contrasta ${label(measures[0].name)} y ${label(measures[1].name)} por periodo.`,config:{time:t.name,dimension:'',series:'',values:measures.slice(0,4).map(x=>x.name),chart:'line',aggregation:'sum',sort:'natural'}});
    if (d && m) s.push({icon:'bi-bar-chart-steps',title:'Ranking de categorías',desc:`Identifica los mayores y menores valores de ${label(m.name)} por ${label(d.name)}.`,config:{time:'',dimension:d.name,series:'',values:[m.name],chart:'horizontal',aggregation:'sum',sort:'desc',filters:{topN:'10'}}});
    if (d && m) s.push({icon:'bi-bar-chart',title:'Comparar categorías',desc:`Compara ${label(m.name)} entre los grupos de ${label(d.name)}.`,config:{time:'',dimension:d.name,series:'',values:[m.name],chart:'bar',aggregation:'sum',sort:'desc'}});
    if (d) s.push({icon:'bi-pie-chart',title:'Participación y composición',desc:`Observa cómo se distribuye el total entre ${label(d.name)}.`,config:{time:'',dimension:d.name,series:'',values:m?[m.name]:[],chart:'doughnut',aggregation:m?'sum':'count',sort:'desc',filters:{topN:'10'}}});
    if (measures.length>=2 && !t) s.push({icon:'bi-columns-gap',title:'Comparar varios valores',desc:`Contrasta ${label(measures[0].name)} y ${label(measures[1].name)} en una sola vista.`,config:{time:'',dimension:d?d.name:'',series:'',values:measures.slice(0,4).map(x=>x.name),chart:'bar',aggregation:'sum',sort:'desc'}});

    state.suggestions = s.slice(0,6);
    $('suggestionList').innerHTML = state.suggestions.map((x,i)=>`<button class="suggestion-item" data-suggestion="${i}"><i class="bi ${x.icon}"></i><span><b>${esc(x.title)}</b><small>${esc(x.desc)}</small></span><i class="bi bi-arrow-right"></i></button>`).join('') || '<div class="empty">Carga una base con más variables para generar recomendaciones.</div>';
    document.querySelectorAll('[data-suggestion]').forEach(b => b.onclick = () => applyConfig(state.suggestions[Number(b.dataset.suggestion)].config));
  }
  function renderDataQuality() {
    const rows=state.rows, fields=state.profiles; if(!rows.length||!fields.length){$('dataQuality').innerHTML='';return;}
    let missing=0,total=rows.length*fields.length;
    for(const r of rows) for(const p of fields) if(r[p.name]===null||r[p.name]===undefined||r[p.name]==='') missing++;
    const complete=total?100-(missing/total*100):100, temporal=fields.filter(p=>p.role==='time').length, measures=fields.filter(p=>p.role==='measure').length;
    $('dataQuality').innerHTML=`<div class="quality-head"><i class="bi bi-clipboard-data"></i><b>Lectura de la base</b></div><div class="quality-grid"><span><b>${complete.toFixed(0)}%</b> completitud</span><span><b>${measures}</b> medidas</span><span><b>${temporal}</b> campos temporales</span><span><b>${rows.length.toLocaleString('es-MX')}</b> registros</span></div>`;
  }

  function resetSmartFilters() { state.filters = {time:'',dimension:'',series:'',topN:'all'}; }
  $('clearSmartFiltersBtn').onclick = () => { resetSmartFilters(); updateVisualization(); };
  $('searchInput').oninput = updateVisualization;

  function searchBaseRows() {
    const term = fixText($('searchInput').value).trim().toLocaleLowerCase('es-MX');
    return !term ? [...state.rows] : state.rows.filter(r => Object.entries(r).some(([k,v]) => !k.startsWith('__') && (`${fixText(k)} ${fixText(v)}`).toLocaleLowerCase('es-MX').includes(term)));
  }
  function uniqueRaw(rows, field) {
    const seen=new Map();
    rows.forEach(r=>{const raw=rawString(r[field]); if(!seen.has(raw)) seen.set(raw,fixText(raw));});
    return [...seen.entries()].sort((a,b)=>fixText(a[1]).localeCompare(fixText(b[1]),'es-MX',{numeric:true,sensitivity:'base'}));
  }
  function ensureValidFilter(field, key, rows) {
    if (!field) { state.filters[key]=''; return; }
    if (state.filters[key] && !rows.some(r=>rawString(r[field])===state.filters[key])) state.filters[key]='';
  }
  function filterSelect(key, field, icon, allLabel, rows) {
    if (!field) return '';
    const vals=uniqueRaw(rows,field), selected=state.filters[key]||'';
    return `<div class="smart-filter-field"><label><i class="bi ${icon}"></i>${esc(label(field))}${selected?'<span class="filter-status">Activo</span>':''}</label><select class="control" data-smart-filter="${key}"><option value="">${esc(allLabel)}</option>${vals.map(([raw,shown])=>`<option value="${esc(raw)}" ${raw===selected?'selected':''}>${esc(shown)}</option>`).join('')}</select></div>`;
  }
  function renderSmartFilters() {
    const rows=state.searchRows.length||state.rows.length?state.searchRows:[];
    ensureValidFilter(state.mapping.time,'time',rows); ensureValidFilter(state.mapping.dimension,'dimension',rows); ensureValidFilter(state.mapping.series,'series',rows);
    let html='';
    html += filterSelect('time',state.mapping.time,'bi-calendar3','Todos los periodos',rows);
    html += filterSelect('dimension',state.mapping.dimension,'bi-funnel','Todas las categorías',rows);
    html += filterSelect('series',state.mapping.series,'bi-layers','Todas las series',rows);
    if (state.mapping.dimension) {
      html += `<div class="smart-filter-field"><label><i class="bi bi-trophy"></i>Mostrar categorías</label><select class="control" data-smart-filter="topN"><option value="all" ${state.filters.topN==='all'?'selected':''}>Todas</option><option value="5" ${state.filters.topN==='5'?'selected':''}>Top 5</option><option value="10" ${state.filters.topN==='10'?'selected':''}>Top 10</option><option value="20" ${state.filters.topN==='20'?'selected':''}>Top 20</option></select></div>`;
    }
    $('smartFilters').innerHTML=html;
    $('smartFilterPanel').classList.toggle('is-empty',!html);
    document.querySelectorAll('[data-smart-filter]').forEach(sel=>sel.onchange=()=>{state.filters[sel.dataset.smartFilter]=sel.value;updateVisualization();});
  }
  function applySmartFilters() {
    state.searchRows = searchBaseRows();
    renderSmartFilters();
    state.filtered = state.searchRows.filter(r => {
      if(state.mapping.time && state.filters.time && rawString(r[state.mapping.time])!==state.filters.time) return false;
      if(state.mapping.dimension && state.filters.dimension && rawString(r[state.mapping.dimension])!==state.filters.dimension) return false;
      if(state.mapping.series && state.filters.series && rawString(r[state.mapping.series])!==state.filters.series) return false;
      return true;
    });
  }

  function renderKpis() {
    const p=state.profiles, measures=p.filter(x=>x.role==='measure'), dims=p.filter(x=>x.role==='dimension'), times=p.filter(x=>x.role==='time');
    let timeText='Sin campo temporal';
    if(times[0]&&state.filtered.length){const vals=state.filtered.map(r=>r[times[0].name]).filter(v=>v!==null&&v!==undefined&&v!=='');const sorted=SigmunData.smartSort(new Set(vals.map(String)));if(sorted.length)timeText=sorted.length===1?fixText(sorted[0]):`${fixText(sorted[0])} – ${fixText(sorted[sorted.length-1])}`;}
    else if(yearMeasures().length>=2){const y=yearMeasures();timeText=`${extractYear(y[0].name)} – ${extractYear(y[y.length-1].name)}`;}
    const items=[
      ['bi-database','Registros',state.filtered.length.toLocaleString('es-MX'),state.filtered.length===state.rows.length?'Base completa':`de ${state.rows.length.toLocaleString('es-MX')}`],
      ['bi-layout-text-sidebar','Campos',p.length,`${dims.length} dimensiones`],['bi-123','Medidas',measures.length,'Campos numéricos'],
      ['bi-calendar-range','Cobertura temporal',timeText,times[0]?label(times[0].name):(yearMeasures().length?'Años detectados en medidas':'Detección automática')]
    ];
    $('dashKpis').innerHTML=items.map(x=>`<div class="dash-card"><i class="bi ${x[0]}"></i><span>${x[1]}</span><b>${esc(x[2])}</b><small>${esc(x[3])}</small></div>`).join('');
  }
  function renderTable() {
    $('recordCount').textContent=`${state.filtered.length.toLocaleString('es-MX')} registros`;
    if(!state.filtered.length){$('dataTable').innerHTML='<tbody><tr><td style="padding:16px">Sin registros para mostrar.</td></tr></tbody>';return;}
    const fields=state.profiles.map(p=>p.name).slice(0,22);
    $('dataTable').innerHTML=`<thead><tr>${fields.map(f=>`<th>${esc(label(f))}</th>`).join('')}</tr></thead><tbody>${state.filtered.slice(0,800).map(r=>`<tr>${fields.map(f=>`<td title="${esc(r[f])}">${esc(r[f])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }

  function xKey(row,m) {
    const parts=[]; if(m.time)parts.push(fixText(row[m.time]??'Sin dato')); if(m.dimension)parts.push(fixText(row[m.dimension]??'Sin dato')); return parts.join(' · ');
  }
  function orderedLabels(rows,m) { return SigmunData.smartSort(new Set(rows.map(r=>xKey(r,m)))).map(fixText).slice(0,100); }
  function isWideYearMode(mapping) { return !mapping.time && mapping.values.length>=2 && mapping.values.every(v=>extractYear(v)); }

  function buildWideYearData(rows,mapping,aggregation) {
    const fields=[...mapping.values].sort((a,b)=>extractYear(a)-extractYear(b));
    const labels=fields.map(v=>String(extractYear(v)));
    const groupField=mapping.series||mapping.dimension;
    if(!groupField){return{labels,datasets:[{label:aggregation==='avg'?'Promedio':'Valor',data:fields.map(f=>aggregateField(rows,f,aggregation)),_field:null}],wideTime:true};}
    let groups=[...new Set(rows.map(r=>rawString(r[groupField])))]
      .sort((a,b)=>fixText(a).localeCompare(fixText(b),'es-MX',{numeric:true,sensitivity:'base'}));
    let notice='';
    if(groups.length>10){groups=groups.slice(0,10);notice=`Se muestran 10 series. Usa el filtro ${label(groupField)} para analizar una categoría específica.`;}
    const datasets=groups.map(g=>({label:fixText(g),data:fields.map(f=>{const subset=rows.filter(r=>rawString(r[groupField])===g);return aggregateField(subset,f,aggregation);}),_field:null}));
    return{labels,datasets,wideTime:true,notice};
  }
  function buildChartData(rows,mapping,aggregation,sortMode) {
    if(isWideYearMode(mapping)) return buildWideYearData(rows,mapping,aggregation);
    const xExists=!!(mapping.time||mapping.dimension), values=mapping.values.length?mapping.values:[null];
    const seriesVals=mapping.series?[...new Set(rows.map(r=>rawString(r[mapping.series])))].slice(0,18):[''];
    if(!xExists){
      if(mapping.values.length)return{labels:mapping.values.map(v=>label(v)),datasets:[{label:'Valor',data:mapping.values.map(v=>aggregateField(rows,v,aggregation)),_field:null}]};
      return{labels:['Registros'],datasets:[{label:'Conteo',data:[rows.length],_field:null}]};
    }
    let labels=orderedLabels(rows,mapping); const datasets=[];
    for(const sv of seriesVals){
      for(const valueField of values){
        const dsLabel=[mapping.series?fixText(sv):'',valueField?label(valueField):aggregation==='count'?'Registros':'Valor'].filter(Boolean).join(' · ');
        const data=labels.map(x=>{const subset=rows.filter(r=>xKey(r,mapping)===x&&(!mapping.series||rawString(r[mapping.series])===sv));return valueField?aggregateField(subset,valueField,aggregation):subset.length;});
        datasets.push({label:dsLabel,data,_field:valueField});
      }
    }
    if(sortMode!=='natural'&&labels.length){const totals=labels.map((_,i)=>datasets.reduce((s,d)=>s+(Number(d.data[i])||0),0));const idx=labels.map((_,i)=>i).sort((a,b)=>sortMode==='desc'?totals[b]-totals[a]:totals[a]-totals[b]);labels=idx.map(i=>labels[i]);datasets.forEach(d=>d.data=idx.map(i=>d.data[i]));}
    const topN=Number(state.filters.topN); if(Number.isFinite(topN)&&topN>0&&labels.length>topN){const totals=labels.map((_,i)=>datasets.reduce((s,d)=>s+(Number(d.data[i])||0),0));const idx=labels.map((_,i)=>i).sort((a,b)=>totals[b]-totals[a]).slice(0,topN);labels=idx.map(i=>labels[i]);datasets.forEach(d=>d.data=idx.map(i=>d.data[i]));}
    return{labels,datasets};
  }
  function resolvedChartType() {
    let t=$('chartType').value; if(t!=='auto')return t; if(state.mapping.time||isWideYearMode(state.mapping))return'line';
    const x=state.mapping.dimension?profile(state.mapping.dimension):null; if(x&&x.unique>12)return'horizontal'; return'bar';
  }
  function activeFilterCount(){return ['time','dimension','series'].filter(k=>state.filters[k]).length+(state.filters.topN!=='all'?1:0);}
  function updateVisualization() {
    applySmartFilters(); renderKpis(); renderTable(); renderChart(); renderInsights();
  }
  function withAlpha(hex,alpha=.2){
    const h=String(hex||'#0f4fa8').replace('#','').trim();
    if(!/^[0-9a-f]{6}$/i.test(h)) return hex;
    const n=parseInt(h,16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function chartPalette(){return $('chartPalette')?.value||'categorical';}
  function chartColorMode(datasetCount){
    const configured=$('chartColorMode')?.value||'auto';
    if(configured!=='auto')return configured;
    return datasetCount<=1?'category':'series';
  }
  function parsedTooltipValue(ctx){
    const p=ctx?.parsed;
    if(typeof p==='number')return p;
    if(p&&typeof p==='object'){
      if(Number.isFinite(Number(p.y)))return Number(p.y);
      if(Number.isFinite(Number(p.x)))return Number(p.x);
      if(Number.isFinite(Number(p.r)))return Number(p.r);
    }
    return ctx?.raw;
  }
  function renderChart() {
    if(state.chart){state.chart.destroy();state.chart=null;}
    const rows=state.filtered,m=state.mapping,agg=$('aggregation').value,ctype=resolvedChartType(),g=buildChartData(rows,m,agg,$('sortMode').value);
    $('chartRecordBadge').textContent=`${rows.length.toLocaleString('es-MX')} registros${activeFilterCount()?` · ${activeFilterCount()} filtro${activeFilterCount()===1?'':'s'}`:''}`;
    if(!rows.length){$('builderMessage').textContent='No hay registros con los filtros actuales.';$('chartTitle').textContent='Sin datos para visualizar';$('chartSubtitle').textContent='Modifica la búsqueda o limpia los filtros inteligentes.';return;}
    if(!m.time&&!m.dimension&&!m.values.length&&agg!=='count')$('builderMessage').textContent='Arrastra una dimensión o una medida. También puedes usar una Guía Inteligente.';
    else $('builderMessage').textContent=g.notice||describeMapping();

    const type=ctype==='horizontal'||ctype==='stacked'?'bar':ctype==='area'?'line':ctype;
    const palette=chartPalette(),mode=chartColorMode(g.datasets.length);
    const categoryColors=g.labels.map((_,i)=>SigmunTheme.colorAt(i,g.labels.length,palette));
    const pointStyles=['circle','rectRounded','triangle','rectRot','star','crossRot'];
    let datasets=[];

    if(type==='doughnut'||type==='polarArea'){
      const first=g.datasets[0]||{data:[]};
      datasets=[{
        label:fixText(first.label||'Valor'),
        data:first.data,
        backgroundColor:categoryColors,
        borderColor:'#ffffff',
        borderWidth:2,
        hoverOffset:type==='doughnut'?8:4
      }];
    }else{
      datasets=g.datasets.map((d,i)=>{
        const seriesColor=SigmunTheme.colorAt(i,g.datasets.length,palette);
        const byCategory=mode==='category' && type==='bar';
        const background=byCategory?categoryColors:(ctype==='area'||type==='radar'?withAlpha(seriesColor,.20):seriesColor);
        const border=byCategory?categoryColors:seriesColor;
        return {
          label:fixText(d.label),
          data:d.data,
          borderColor:border,
          backgroundColor:background,
          borderWidth:type==='line'||type==='radar'?2.4:1.4,
          tension:type==='line'?0.28:0,
          fill:ctype==='area'||type==='radar',
          pointRadius:type==='line'||type==='radar'?3:0,
          pointHoverRadius:type==='line'||type==='radar'?5:0,
          pointStyle:pointStyles[i%pointStyles.length],
          pointBackgroundColor:(mode==='category'&&(type==='line'||type==='radar'))?categoryColors:seriesColor,
          borderDash:(type==='line'&&g.datasets.length>3&&i%3===2)?[6,3]:[],
          borderRadius:type==='bar'?5:0,
          maxBarThickness:type==='bar'?52:undefined
        };
      });
    }

    const radial=type==='radar'||type==='polarArea'||type==='doughnut';
    const options={
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:type==='doughnut'||type==='polarArea'?'nearest':'index',intersect:false},
      animation:{duration:280},
      plugins:{
        legend:{
          display:datasets.length>1||['doughnut','polarArea','radar'].includes(type),
          position:'bottom',
          labels:{boxWidth:10,boxHeight:10,usePointStyle:type==='line'||type==='radar',font:{size:9},padding:12}
        },
        tooltip:{callbacks:{label:ctx=>`${fixText(ctx.dataset.label||ctx.label||'')}: ${SigmunData.formatNumber(parsedTooltipValue(ctx))}`}}
      },
      scales:radial?{}:{
        x:{stacked:ctype==='stacked',grid:{display:false},ticks:{maxRotation:45,minRotation:0,autoSkip:true,maxTicksLimit:28}},
        y:{stacked:ctype==='stacked',beginAtZero:true,grid:{color:'rgba(87,110,135,.10)'},ticks:{callback:v=>SigmunData.formatNumber(v)}}
      }
    };
    if(type==='radar') options.scales={r:{beginAtZero:true,grid:{color:'rgba(87,110,135,.12)'},angleLines:{color:'rgba(87,110,135,.12)'},ticks:{display:false}}};
    if(ctype==='horizontal')options.indexAxis='y';

    state.chart=new Chart($('mainChart'),{type,data:{labels:g.labels.map(fixText),datasets},options});
    $('chartTitle').textContent=chartTitle();
    const paletteLabel=$('chartPalette')?.selectedOptions?.[0]?.textContent||'Multicolor';
    $('chartSubtitle').textContent=`${g.labels.length} grupos · ${g.datasets.length} serie${g.datasets.length===1?'':'s'} · ${$('aggregation').selectedOptions[0].textContent} · ${paletteLabel}`;
  }
  function describeMapping() {
    const parts=[];if(state.mapping.time)parts.push(`Tiempo: ${label(state.mapping.time)}`);if(state.mapping.dimension)parts.push(`Dimensión: ${label(state.mapping.dimension)}`);if(state.mapping.series)parts.push(`Serie: ${label(state.mapping.series)}`);if(state.mapping.values.length)parts.push(`Valores: ${state.mapping.values.map(label).join(', ')}`);return parts.join(' · ')||'Conteo general de registros.';
  }
  function chartTitle() {
    const agg=$('aggregation').selectedOptions[0].textContent, vals=state.mapping.values.map(label).join(' y ');
    if(isWideYearMode(state.mapping)){const y=state.mapping.values.map(extractYear).filter(Boolean).sort((a,b)=>a-b), group=state.mapping.series||state.mapping.dimension;return `Tendencia ${y[0]}–${y[y.length-1]}${group?' por '+label(group):''}`;}
    const x=[state.mapping.time&&label(state.mapping.time),state.mapping.dimension&&label(state.mapping.dimension)].filter(Boolean).join(' + ');
    return vals?`${agg} de ${vals}${x?' por '+x:''}`:`Conteo de registros${x?' por '+x:''}`;
  }
  function renderInsights() {
    const rows=state.filtered,v=state.mapping.values[0],agg=$('aggregation').value;let html='';$('numericKpis').innerHTML='';
    if(!rows.length){$('insightText').innerHTML='<p>Sin datos disponibles.</p>';return;}
    if(isWideYearMode(state.mapping)){
      const fields=[...state.mapping.values].sort((a,b)=>extractYear(a)-extractYear(b)), groupField=state.mapping.series||state.mapping.dimension;
      const subset=groupField&&state.filters[groupField===state.mapping.dimension?'dimension':'series']?rows:rows;
      const first=aggregateField(subset,fields[0],agg),last=aggregateField(subset,fields[fields.length-1],agg),delta=Number(last)-Number(first),pct=Number(first)!==0?delta/Math.abs(Number(first))*100:null;
      html+=`<p>La serie cubre de <strong>${extractYear(fields[0])}</strong> a <strong>${extractYear(fields[fields.length-1])}</strong>. El valor pasa de <strong>${SigmunData.formatNumber(first)}</strong> a <strong>${SigmunData.formatNumber(last)}</strong>${Number.isFinite(pct)?`, una variación de <strong>${pct>=0?'+':''}${pct.toFixed(1)}%</strong>`:''}.</p>`;
      if(groupField&&!state.filters[groupField===state.mapping.dimension?'dimension':'series'])html+=`<p>Para una lectura más clara, selecciona una opción en el filtro <b>${esc(label(groupField))}</b> y compara su trayectoria histórica.</p>`;
    } else if(v){
      const n=numericFieldStats(rows,v);if(n){$('numericKpis').innerHTML=[['Suma',n.sum],['Promedio',n.avg],['Mínimo',n.min],['Máximo',n.max]].map(([k,val])=>`<div class="kpi"><span>${k}</span><b>${SigmunData.formatNumber(val)}</b></div>`).join('');html+=`<p><b>${esc(label(v))}</b> tiene ${n.count.toLocaleString('es-MX')} valores numéricos. El promedio es <strong>${SigmunData.formatNumber(n.avg)}</strong> y la mediana <strong>${SigmunData.formatNumber(n.median)}</strong>.</p>`;}
    }
    const x=state.mapping.time||state.mapping.dimension;
    if(x&&!isWideYearMode(state.mapping)){const groups=new Map();rows.forEach(r=>{const k=fixText(r[x]??'Sin dato');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);});const vals=[...groups.entries()].map(([k,a])=>[k,v?aggregateField(a,v,agg):a.length]).sort((a,b)=>b[1]-a[1]);if(vals.length){html+=`<p>El grupo con mayor resultado es <strong>${esc(vals[0][0])}</strong> con <strong>${SigmunData.formatNumber(vals[0][1])}</strong>${vals.length>1?`; el menor es <strong>${esc(vals[vals.length-1][0])}</strong> con <strong>${SigmunData.formatNumber(vals[vals.length-1][1])}</strong>`:''}.</p>`;}}
    if(state.mapping.series&&!isWideYearMode(state.mapping))html+=`<p>La comparación está separada por <b>${esc(label(state.mapping.series))}</b>, lo que permite identificar diferencias entre series dentro de cada grupo.</p>`;
    $('insightText').innerHTML=html||'<p>Usa una Guía Inteligente o arrastra una medida y una dimensión para generar una lectura automática.</p>';
  }

  $('downloadBtn').onclick = () => {
    if(!state.filtered.length)return;
    const rows=state.filtered.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith('__')).map(([k,v])=>[fixText(k),typeof v==='string'?fixText(v):v])));
    SigmunData.download(`${fixText(state.layer?.name||'datos').replace(/\s+/g,'_')}.csv`, '\uFEFF'+Papa.unparse(rows), 'text/csv;charset=utf-8');
  };

  init();
})();
