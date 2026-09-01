(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const state={topics:[],projects:[],project:null,layers:[],layer:null,rows:[],filtered:[],profiles:[],mapping:{time:'',dimension:'',series:'',values:[]},chart:null,sortables:[],suggestions:[]};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let toastTimer;
  function toast(m,e=false){const x=$('toast');x.textContent=m;x.classList.toggle('error',e);x.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove('show'),2800)}
  const profile=f=>state.profiles.find(p=>p.name===f);
  const label=f=>profile(f)?.label||f||'';

  async function init(){
    try{
      state.topics=await SigmunDB.topics();state.projects=await SigmunDB.projects();fillTopics();
      const slug=new URLSearchParams(location.search).get('project');const p=state.projects.find(x=>x.slug===slug)||state.projects.find(x=>x.project_type!=='map')||state.projects[0];
      if(p){$('topicSelect').value=p.topic_id;fillProjects(p.topic_id,p.id);await selectProject(p.id)}
    }catch(e){console.error(e);toast(e.message,true)}
  }
  function fillTopics(){$('topicSelect').innerHTML=state.topics.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');$('topicSelect').onchange=async e=>{fillProjects(e.target.value);if($('projectSelect').value)await selectProject($('projectSelect').value)}}
  function fillProjects(topicId,selected){const arr=state.projects.filter(p=>p.topic_id===topicId&&p.project_type!=='map');$('projectSelect').innerHTML=arr.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(p.name)}</option>`).join('');$('projectSelect').onchange=e=>selectProject(e.target.value)}
  async function selectProject(id){
    state.project=state.projects.find(p=>p.id===id);if(!state.project)return;$('headerTitle').textContent=state.project.name;$('heroTitle').textContent=state.project.name;$('heroDesc').textContent=state.project.description||'Explora los indicadores disponibles y construye comparaciones visuales.';$('mapLink').href=`visor.html?project=${encodeURIComponent(state.project.slug)}`;
    state.layers=await SigmunDB.statLayers(id);$('layerSelect').innerHTML=state.layers.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');$('layerSelect').onchange=e=>selectLayer(e.target.value);if(state.layers[0])await selectLayer(state.layers[0].id);else emptyDashboard();
  }
  function emptyDashboard(){state.layer=null;state.rows=[];state.filtered=[];state.profiles=[];renderKpis();renderShelf();renderSuggestions();renderChart();renderTable();$('builderMessage').textContent='Este proyecto todavía no tiene bases estadísticas públicas.'}
  async function selectLayer(id){
    state.layer=state.layers.find(x=>x.id===id);if(!state.layer)return;$('layerSelect').value=id;$('heroDesc').textContent=state.layer.description||state.project?.description||'Explora y compara los datos almacenados.';
    try{state.rows=await SigmunDB.statRecords(id);state.filtered=[...state.rows];const roles=state.layer.chart_config?.field_roles||{};state.profiles=SigmunData.profileFields(state.rows,roles).filter(p=>!p.hidden);renderShelf();renderSuggestions();applyInitialView();applySearch();renderDataQuality();}catch(e){toast(e.message,true)}
  }

  function renderShelf(){
    destroySortables();const groups=[['time','Tiempo','bi-calendar3'],['dimension','Dimensiones','bi-diagram-3'],['measure','Medidas','bi-123']];
    $('fieldShelf').innerHTML=groups.map(([role,title,icon])=>{const arr=state.profiles.filter(p=>p.role===role);return`<div class="field-group"><div class="field-group-title"><i class="bi ${icon}"></i>${title}<span>${arr.length}</span></div><div class="field-source" data-source-role="${role}">${arr.map(p=>`<div class="field-chip role-${role}" data-field="${esc(p.name)}" data-field-role="${role}" title="Arrastra o haz clic para agregar"><i class="bi ${icon}"></i><span>${esc(p.label||p.name)}</span><small>${p.unique} únicos</small></div>`).join('')||'<div class="field-group-empty">Sin campos detectados</div>'}</div></div>`}).join('');
    document.querySelectorAll('.field-chip[data-field]').forEach(c=>c.addEventListener('click',()=>quickAddField(c.dataset.field,c.dataset.fieldRole)));
    initSortables();renderMapping();
  }
  function destroySortables(){state.sortables.forEach(x=>{try{x.destroy()}catch(_){}});state.sortables=[]}
  function initSortables(){
    if(!window.Sortable)return;
    document.querySelectorAll('.field-source').forEach(src=>state.sortables.push(new Sortable(src,{group:{name:'analysis-fields',pull:'clone',put:false},sort:false,animation:130,filter:'.field-group-empty'})));
    document.querySelectorAll('.field-drop').forEach(zone=>state.sortables.push(new Sortable(zone,{group:{name:'analysis-fields',pull:true,put:true},animation:130,onAdd:evt=>handleDrop(evt,zone.dataset.role),onUpdate:()=>syncValueOrder()})));
  }
  function allowed(field,zone){const r=profile(field)?.role;if(zone==='time')return r==='time';if(zone==='dimension'||zone==='series')return r==='dimension'||r==='time';if(zone==='values')return r==='measure';return false}
  function removeFieldEverywhere(field){if(state.mapping.time===field)state.mapping.time='';if(state.mapping.dimension===field)state.mapping.dimension='';if(state.mapping.series===field)state.mapping.series='';state.mapping.values=state.mapping.values.filter(x=>x!==field)}
  function handleDrop(evt,zone){
    const field=evt.item.dataset.field;evt.item.remove();if(!field||!allowed(field,zone)){toast('Ese tipo de campo no corresponde a esta zona.',true);renderMapping();return}
    removeFieldEverywhere(field);
    if(zone==='time')state.mapping.time=field;if(zone==='dimension')state.mapping.dimension=field;if(zone==='series')state.mapping.series=field;if(zone==='values'){if(state.mapping.values.length>=4){toast('Puedes comparar hasta cuatro medidas a la vez.',true)}else state.mapping.values.push(field)}
    renderMapping();updateVisualization();
  }
  function quickAddField(field,role){if(role==='time')state.mapping.time=field;else if(role==='measure'){if(!state.mapping.values.includes(field)&&state.mapping.values.length<4)state.mapping.values.push(field)}else if(!state.mapping.dimension)state.mapping.dimension=field;else state.mapping.series=field;renderMapping();updateVisualization()}
  function mappingChip(field){return`<div class="mapped-chip" data-field="${esc(field)}"><span>${esc(label(field))}</span><button data-remove-field="${esc(field)}"><i class="bi bi-x"></i></button></div>`}
  function setZone(id,fields,placeholder){const z=$(id);z.innerHTML=(fields.length?fields.map(mappingChip).join(''):`<span class="drop-placeholder">${placeholder}</span>`);z.querySelectorAll('[data-remove-field]').forEach(b=>b.onclick=e=>{e.stopPropagation();removeFieldEverywhere(b.dataset.removeField);renderMapping();updateVisualization()})}
  function renderMapping(){setZone('dropTime',state.mapping.time?[state.mapping.time]:[],'Arrastra un campo temporal');setZone('dropDimension',state.mapping.dimension?[state.mapping.dimension]:[],'Ej. colonia, sector, tipo');setZone('dropSeries',state.mapping.series?[state.mapping.series]:[],'Ej. sexo, programa, zona');setZone('dropValues',state.mapping.values,'Arrastra una o varias medidas')}
  function syncValueOrder(){const vals=[...$('dropValues').querySelectorAll('[data-field]')].map(x=>x.dataset.field);if(vals.length)state.mapping.values=vals;renderMapping();updateVisualization()}

  function serverDefault(){const d=state.layer?.chart_config?.default_view||{};return{time:d.time||'',dimension:d.dimension||'',series:d.series||'',values:d.values||(d.value?[d.value]:[]),chart:d.chart||'auto',aggregation:d.aggregation||'sum',sort:'natural'}}
  function autoDefault(){
    const t=state.profiles.find(p=>p.role==='time'),m=state.profiles.find(p=>p.role==='measure'),d=state.profiles.find(p=>p.role==='dimension'&&p.unique>1&&p.unique<=40);
    if(t&&m)return{time:t.name,dimension:'',series:d&&d.unique<=12?d.name:'',values:[m.name],chart:'line',aggregation:'sum',sort:'natural'};
    if(d&&m)return{time:'',dimension:d.name,series:'',values:[m.name],chart:'bar',aggregation:'sum',sort:'natural'};
    if(d)return{time:'',dimension:d.name,series:'',values:[],chart:'doughnut',aggregation:'count',sort:'natural'};
    return{time:'',dimension:'',series:'',values:m?[m.name]:[],chart:'bar',aggregation:m?'sum':'count',sort:'natural'};
  }
  function validConfig(c){const fields=new Set(state.profiles.map(p=>p.name));return{time:fields.has(c.time)?c.time:'',dimension:fields.has(c.dimension)?c.dimension:'',series:fields.has(c.series)?c.series:'',values:(c.values||[]).filter(v=>fields.has(v)).slice(0,4),chart:c.chart||'auto',aggregation:c.aggregation||'sum',sort:c.sort||'natural'}}
  function applyConfig(c){c=validConfig(c);state.mapping={time:c.time,dimension:c.dimension,series:c.series,values:c.values};$('chartType').value=[...$('chartType').options].some(o=>o.value===c.chart)?c.chart:'auto';$('aggregation').value=[...$('aggregation').options].some(o=>o.value===c.aggregation)?c.aggregation:'sum';$('sortMode').value=[...$('sortMode').options].some(o=>o.value===c.sort)?c.sort:'natural';renderMapping();updateVisualization()}
  function applyInitialView(){const saved=localStorage.getItem(`sigmun-dashboard-view-${state.layer.id}`);let config;if(saved){try{config=JSON.parse(saved)}catch(_){}}config=config||serverDefault();if(!config.time&&!config.dimension&&!config.values?.length)config=autoDefault();applyConfig(config)}
  $('refreshFieldsBtn').onclick=()=>applyConfig(autoDefault());$('restoreViewBtn').onclick=()=>applyConfig(serverDefault());
  $('saveViewBtn').onclick=()=>{if(!state.layer)return;localStorage.setItem(`sigmun-dashboard-view-${state.layer.id}`,JSON.stringify(currentConfig()));toast('Vista guardada en este navegador.')};
  function currentConfig(){return{...state.mapping,chart:$('chartType').value,aggregation:$('aggregation').value,sort:$('sortMode').value}}
  ['chartType','aggregation','sortMode'].forEach(id=>$(id).addEventListener('change',updateVisualization));

  function renderSuggestions(){
    const t=state.profiles.find(p=>p.role==='time'),measures=state.profiles.filter(p=>p.role==='measure'),dims=state.profiles.filter(p=>p.role==='dimension'&&p.unique>1&&p.unique<=40),m=measures[0],d=dims[0],series=dims.find(x=>x.unique<=12);const s=[];
    if(t&&m)s.push({icon:'bi-graph-up-arrow',title:'Evolución en el tiempo',desc:`${label(m.name)} por ${label(t.name)}`,config:{time:t.name,dimension:'',series:'',values:[m.name],chart:'line',aggregation:'sum',sort:'natural'}});
    if(t&&m&&series)s.push({icon:'bi-bezier2',title:'Comparar series por año',desc:`${label(m.name)} según ${label(series.name)}`,config:{time:t.name,dimension:'',series:series.name,values:[m.name],chart:'line',aggregation:'sum',sort:'natural'}});
    if(d&&m)s.push({icon:'bi-bar-chart',title:'Comparar categorías',desc:`${label(m.name)} por ${label(d.name)}`,config:{time:'',dimension:d.name,series:'',values:[m.name],chart:'bar',aggregation:'sum',sort:'desc'}});
    if(d)s.push({icon:'bi-pie-chart',title:'Ver composición',desc:`Participación por ${label(d.name)}`,config:{time:'',dimension:d.name,series:'',values:m?[m.name]:[],chart:'doughnut',aggregation:m?'sum':'count',sort:'desc'}});
    if(measures.length>=2){const x=t||d;s.push({icon:'bi-columns-gap',title:'Comparar varios valores',desc:`${label(measures[0].name)} vs ${label(measures[1].name)}${x?' por '+label(x.name):''}`,config:{time:t?t.name:'',dimension:!t&&d?d.name:'',series:'',values:measures.slice(0,3).map(x=>x.name),chart:t?'line':'bar',aggregation:'sum',sort:'natural'}})}
    state.suggestions=s.slice(0,5);$('suggestionList').innerHTML=state.suggestions.map((x,i)=>`<button class="suggestion-item" data-suggestion="${i}"><i class="bi ${x.icon}"></i><span><b>${esc(x.title)}</b><small>${esc(x.desc)}</small></span><i class="bi bi-arrow-right"></i></button>`).join('')||'<div class="empty">Carga una base con más variables para generar recomendaciones.</div>';document.querySelectorAll('[data-suggestion]').forEach(b=>b.onclick=()=>applyConfig(state.suggestions[Number(b.dataset.suggestion)].config));
  }
  function renderDataQuality(){
    const rows=state.rows,fields=state.profiles;if(!rows.length||!fields.length){$('dataQuality').innerHTML='';return}let missing=0,total=rows.length*fields.length;for(const r of rows)for(const p of fields)if(r[p.name]===null||r[p.name]===undefined||r[p.name]==='')missing++;const complete=total?100-(missing/total*100):100;const temporal=fields.filter(p=>p.role==='time').length,measures=fields.filter(p=>p.role==='measure').length;$('dataQuality').innerHTML=`<div class="quality-head"><i class="bi bi-clipboard-data"></i><b>Lectura de la base</b></div><div class="quality-grid"><span><b>${complete.toFixed(0)}%</b> completitud</span><span><b>${measures}</b> medidas</span><span><b>${temporal}</b> campos temporales</span><span><b>${rows.length.toLocaleString('es-MX')}</b> registros</span></div>`;
  }

  $('searchInput').oninput=applySearch;
  function applySearch(){const term=$('searchInput').value.trim().toLowerCase();state.filtered=!term?[...state.rows]:state.rows.filter(r=>Object.entries(r).some(([k,v])=>!k.startsWith('__')&&String(v??'').toLowerCase().includes(term)));renderKpis();renderTable();updateVisualization()}
  function renderKpis(){
    const p=state.profiles,measures=p.filter(x=>x.role==='measure'),dims=p.filter(x=>x.role==='dimension'),times=p.filter(x=>x.role==='time');let timeText='Sin campo temporal';if(times[0]&&state.filtered.length){const vals=state.filtered.map(r=>r[times[0].name]).filter(v=>v!==null&&v!==undefined&&v!=='');const sorted=SigmunData.smartSort(new Set(vals.map(String)));if(sorted.length)timeText=sorted.length===1?sorted[0]:`${sorted[0]} – ${sorted[sorted.length-1]}`}
    const items=[['bi-database','Registros',state.filtered.length.toLocaleString('es-MX'),state.filtered.length===state.rows.length?'Base completa':`de ${state.rows.length.toLocaleString('es-MX')}`],['bi-layout-text-sidebar','Campos',p.length,`${dims.length} dimensiones`],['bi-123','Medidas',measures.length,'Campos numéricos'],['bi-calendar-range','Cobertura temporal',timeText,times[0]?label(times[0].name):'Detección automática']];$('dashKpis').innerHTML=items.map(x=>`<div class="dash-card"><i class="bi ${x[0]}"></i><span>${x[1]}</span><b>${esc(x[2])}</b><small>${esc(x[3])}</small></div>`).join('');
  }
  function renderTable(){
    $('recordCount').textContent=`${state.filtered.length.toLocaleString('es-MX')} registros`;if(!state.filtered.length){$('dataTable').innerHTML='<tbody><tr><td style="padding:16px">Sin registros para mostrar.</td></tr></tbody>';return}const fields=state.profiles.map(p=>p.name).slice(0,22);$('dataTable').innerHTML=`<thead><tr>${fields.map(f=>`<th>${esc(label(f))}</th>`).join('')}</tr></thead><tbody>${state.filtered.slice(0,800).map(r=>`<tr>${fields.map(f=>`<td title="${esc(r[f])}">${esc(r[f])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }

  function xKey(row,m){const parts=[];if(m.time)parts.push(String(row[m.time]??'Sin dato'));if(m.dimension)parts.push(String(row[m.dimension]??'Sin dato'));return parts.join(' · ')}
  function orderedLabels(rows,m){const set=new Set(rows.map(r=>xKey(r,m)));let labels=SigmunData.smartSort(set);return labels.slice(0,80)}
  function buildChartData(rows,mapping,aggregation,sortMode){
    const xExists=!!(mapping.time||mapping.dimension),values=mapping.values.length?mapping.values:[null],seriesVals=mapping.series?[...new Set(rows.map(r=>String(r[mapping.series]??'Sin dato')))].slice(0,16):[''];
    if(!xExists){if(mapping.values.length){return{labels:mapping.values.map(label),datasets:[{label:'Valor',data:mapping.values.map(v=>SigmunData.aggregate(rows.map(r=>r[v]),aggregation)),_field:null}]}}return{labels:['Registros'],datasets:[{label:'Conteo',data:[rows.length],_field:null}]}}
    let labels=orderedLabels(rows,mapping);const datasets=[];
    for(const sv of seriesVals){for(const valueField of values){const dsLabel=[mapping.series?sv:'',valueField?label(valueField):aggregation==='count'?'Registros':'Valor'].filter(Boolean).join(' · ');const data=labels.map(x=>{const subset=rows.filter(r=>xKey(r,mapping)===x&&(!mapping.series||String(r[mapping.series]??'Sin dato')===sv));return valueField?SigmunData.aggregate(subset.map(r=>r[valueField]),aggregation):subset.length});datasets.push({label:dsLabel,data,_field:valueField})}}
    if(sortMode!=='natural'&&labels.length){const totals=labels.map((_,i)=>datasets.reduce((s,d)=>s+(Number(d.data[i])||0),0));const idx=labels.map((_,i)=>i).sort((a,b)=>sortMode==='desc'?totals[b]-totals[a]:totals[a]-totals[b]);labels=idx.map(i=>labels[i]);datasets.forEach(d=>d.data=idx.map(i=>d.data[i]));}
    return{labels,datasets};
  }
  function resolvedChartType(){let t=$('chartType').value;if(t!=='auto')return t;if(state.mapping.time)return'line';const x=state.mapping.dimension?profile(state.mapping.dimension):null;if(x&&x.unique>12)return'horizontal';return'bar'}
  function updateVisualization(){renderChart();renderInsights()}
  function renderChart(){
    if(state.chart){state.chart.destroy();state.chart=null}const rows=state.filtered,m=state.mapping,agg=$('aggregation').value,ctype=resolvedChartType(),g=buildChartData(rows,m,agg,$('sortMode').value);$('chartRecordBadge').textContent=`${rows.length.toLocaleString('es-MX')} registros`;
    if(!rows.length){$('builderMessage').textContent='No hay registros con el filtro actual.';$('chartTitle').textContent='Sin datos para visualizar';$('chartSubtitle').textContent='Modifica la búsqueda o selecciona otra base.';return}
    if(!m.time&&!m.dimension&&!m.values.length&&agg!=='count')$('builderMessage').textContent='Arrastra una dimensión o una medida. También puedes usar una sugerencia.';else $('builderMessage').textContent=describeMapping();
    const type=ctype==='horizontal'||ctype==='stacked'?'bar':ctype==='area'?'line':ctype;let datasets;
    if(type==='doughnut'){
      const first=g.datasets[0]||{data:[]};datasets=[{label:first.label,data:first.data,backgroundColor:g.labels.map((_,i)=>SigmunTheme.colorAt(i,g.labels.length,'categorical')),borderWidth:1}];
    }else datasets=g.datasets.map((d,i)=>({label:d.label,data:d.data,borderColor:SigmunTheme.colorAt(i,g.datasets.length,'categorical'),backgroundColor:SigmunTheme.colorAt(i,g.datasets.length,'categorical'),borderWidth:2,tension:.25,fill:ctype==='area',pointRadius:ctype==='line'||ctype==='area'?2:0,borderRadius:type==='bar'?4:0}));
    const options={responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:datasets.length>1||type==='doughnut',position:'bottom'},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label||''}: ${SigmunData.formatNumber(ctx.parsed.y??ctx.parsed)}`}}},scales:type==='doughnut'?{}:{x:{stacked:ctype==='stacked',ticks:{maxRotation:45,minRotation:0,autoSkip:true,maxTicksLimit:28}},y:{stacked:ctype==='stacked',beginAtZero:true,ticks:{callback:v=>SigmunData.formatNumber(v)}}}};if(ctype==='horizontal')options.indexAxis='y';
    state.chart=new Chart($('mainChart'),{type,data:{labels:g.labels,datasets},options});$('chartTitle').textContent=chartTitle();$('chartSubtitle').textContent=`${g.labels.length} grupos · ${g.datasets.length} serie${g.datasets.length===1?'':'s'} · Operación: ${$('aggregation').selectedOptions[0].textContent}`;
  }
  function describeMapping(){const parts=[];if(state.mapping.time)parts.push(`Tiempo: ${label(state.mapping.time)}`);if(state.mapping.dimension)parts.push(`Dimensión: ${label(state.mapping.dimension)}`);if(state.mapping.series)parts.push(`Serie: ${label(state.mapping.series)}`);if(state.mapping.values.length)parts.push(`Valores: ${state.mapping.values.map(label).join(', ')}`);return parts.join(' · ')||'Conteo general de registros.'}
  function chartTitle(){const agg=$('aggregation').selectedOptions[0].textContent,vals=state.mapping.values.map(label).join(' y ');const x=[state.mapping.time&&label(state.mapping.time),state.mapping.dimension&&label(state.mapping.dimension)].filter(Boolean).join(' + ');return vals?`${agg} de ${vals}${x?' por '+x:''}`:`Conteo de registros${x?' por '+x:''}`}
  function renderInsights(){
    const rows=state.filtered,v=state.mapping.values[0],agg=$('aggregation').value;let html='';$('numericKpis').innerHTML='';if(!rows.length){$('insightText').innerHTML='<p>Sin datos disponibles.</p>';return}
    if(v){const n=SigmunData.numeric(rows,v);if(n){$('numericKpis').innerHTML=[['Suma',n.sum],['Promedio',n.avg],['Mínimo',n.min],['Máximo',n.max]].map(([k,val])=>`<div class="kpi"><span>${k}</span><b>${SigmunData.formatNumber(val)}</b></div>`).join('');html+=`<p><b>${esc(label(v))}</b> tiene ${n.count.toLocaleString('es-MX')} valores numéricos. El promedio es <strong>${SigmunData.formatNumber(n.avg)}</strong> y la mediana <strong>${SigmunData.formatNumber(n.median)}</strong>.</p>`}}
    const x=state.mapping.time||state.mapping.dimension;if(x){const groups=new Map();rows.forEach(r=>{const k=String(r[x]??'Sin dato'),val=v?Number(r[v]):1;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(v&&Number.isFinite(val)?val:1)});const vals=[...groups.entries()].map(([k,a])=>[k,v?SigmunData.aggregate(a,agg):a.length]).sort((a,b)=>b[1]-a[1]);if(vals.length){html+=`<p>El grupo con mayor resultado es <strong>${esc(vals[0][0])}</strong> con <strong>${SigmunData.formatNumber(vals[0][1])}</strong>${vals.length>1?`; el menor es <strong>${esc(vals[vals.length-1][0])}</strong> con <strong>${SigmunData.formatNumber(vals[vals.length-1][1])}</strong>`:''}.</p>`}}
    if(state.mapping.series)html+=`<p>La comparación está separada por <b>${esc(label(state.mapping.series))}</b>, lo que permite identificar diferencias entre series dentro de cada grupo.</p>`;
    $('insightText').innerHTML=html||'<p>Arrastra una medida o dimensión para generar una lectura automática de la comparación.</p>';
  }

  $('downloadBtn').onclick=()=>{if(!state.filtered.length)return;const rows=state.filtered.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>!k.startsWith('__'))));SigmunData.download(`${(state.layer?.name||'datos').replace(/\s+/g,'_')}.csv`,Papa.unparse(rows),'text/csv;charset=utf-8')};
  init();
})();
