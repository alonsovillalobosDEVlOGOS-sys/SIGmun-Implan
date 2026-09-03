(() => {
  'use strict';
  const $=id=>document.getElementById(id),cfg=SIGMUN_CONFIG;
  const state={topics:[],projects:[],project:null,defs:[],layers:new Map(),selected:null,rows:[],filtered:[],chart:null,currentBase:'osm',drawControl:null,drawVisible:false,measureMode:false};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let toastTimer;
  function toast(m,e=false){const x=$('toast');x.textContent=m;x.classList.toggle('error',e);x.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove('show'),2800)}

  const map=L.map('map',{center:cfg.defaultCenter,zoom:cfg.defaultZoom,zoomControl:false});
  const bases={
    osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}),
    satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'© Esri'}),
    terrain:L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenTopoMap'})
  };
  bases.osm.addTo(map);
  const drawings=L.featureGroup().addTo(map);
  state.drawControl=new L.Control.Draw({edit:{featureGroup:drawings},draw:{circle:false,circlemarker:false}});
  map.on(L.Draw.Event.CREATED,e=>{
    drawings.addLayer(e.layer);
    if(state.measureMode&&e.layer instanceof L.Polyline){
      const pts=e.layer.getLatLngs().flat(Infinity);let meters=0;for(let i=1;i<pts.length;i++)meters+=pts[i-1].distanceTo(pts[i]);
      toast(`Distancia: ${meters>=1000?(meters/1000).toFixed(2)+' km':Math.round(meters)+' m'}`);state.measureMode=false;
    }
  });

  async function init(){
    try{
      state.topics=await SigmunDB.topics();state.projects=await SigmunDB.projects();fillTopics();
      const slug=new URLSearchParams(location.search).get('project');
      const p=state.projects.find(x=>x.slug===slug)||state.projects.find(x=>x.project_type!=='dashboard')||state.projects[0];
      if(p){$('topicSelect').value=p.topic_id;fillProjects(p.topic_id,p.id);await selectProject(p.id)}
    }catch(e){console.error(e);toast(e.message,true)}
  }
  function fillTopics(){
    $('topicSelect').innerHTML=state.topics.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
    $('topicSelect').onchange=e=>{fillProjects(e.target.value);const id=$('projectSelect').value;if(id)selectProject(id)};
  }
  function fillProjects(topicId,sel){
    const arr=state.projects.filter(p=>p.topic_id===topicId&&p.project_type!=='dashboard');
    $('projectSelect').innerHTML=arr.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(p.name)}</option>`).join('');$('projectSelect').onchange=e=>selectProject(e.target.value);
  }
  async function selectProject(id){
    state.project=state.projects.find(p=>p.id===id);if(!state.project)return;clearProjectLayers();
    $('headerTitle').textContent=state.project.name;$('headerSubtitle').textContent=state.project.sigmun_topics?.name||'SIGmun Delicias';$('mapTitle').textContent=state.project.name;$('mapDesc').textContent=state.project.description||'';$('dashLink').href=`dashboard.html?project=${encodeURIComponent(state.project.slug)}`;
    map.setView([state.project.center_lat||cfg.defaultCenter[0],state.project.center_lon||cfg.defaultCenter[1]],state.project.default_zoom||cfg.defaultZoom);
    state.defs=await SigmunDB.geoLayers(id);await loadDefs();
  }
  function clearProjectLayers(){
    for(const x of state.layers.values()){if(map.hasLayer(x.leaflet))map.removeLayer(x.leaflet);if(x.pane&&map.getPane(x.pane))map.getPane(x.pane).remove()}
    state.layers.clear();state.selected=null;state.rows=[];state.filtered=[];renderLayerList();refreshData();renderMapLegend();
  }
  function makeLayer(def,gj,index){
    const style=SigmunTheme.normalizeStyle(def.style||{}),pane=`sigmun-${String(def.id).replace(/-/g,'').slice(0,12)}`;
    if(!map.getPane(pane)){map.createPane(pane);map.getPane(pane).style.zIndex=String(650-index*3)}
    const leaflet=L.geoJSON(gj,{
      pane,
      style:f=>({...SigmunTheme.leafletPathStyle(style,f),pane}),
      pointToLayer:(f,ll)=>L.circleMarker(ll,{...SigmunTheme.leafletPointStyle(style,f),pane}),
      onEachFeature:(f,l)=>{
        const label=style.labelField?f.properties?.[style.labelField]:f.properties?.name;
        if(label!==undefined&&label!==null&&label!=='')l.bindTooltip(String(label),{sticky:true,direction:'top'});
        l.on('click',()=>{showProps(f,def);selectLayer(def.id)});
      }
    });
    return{def,geojson:gj,leaflet,pane,style};
  }
  async function loadDefs(){
    if(!state.defs.length){renderLayerList();renderMapLegend();return}
    const sorted=[...state.defs].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.name.localeCompare(b.name,'es'));
    for(let i=0;i<sorted.length;i++){
      const d=sorted[i];try{const gj=await SigmunDB.geojson(d.id),obj=makeLayer(d,gj,i);if(d.is_visible!==false)obj.leaflet.addTo(map);state.layers.set(d.id,obj)}catch(e){console.error(e)}
    }
    renderLayerList();renderMapLegend();const first=sorted[0];if(first){selectLayer(first.id);fitAll()}
  }
  function rendererName(r){return r==='categorized'?'Categorías':r==='graduated'?'Rangos':'Símbolo único'}
  function miniLegend(obj){
    const s=obj.style,items=SigmunTheme.legendItems(s).slice(0,5);if(s.renderer==='single')return'';
    return`<div class="layer-mini-legend">${items.map(i=>`<span title="${esc(i.label)}"><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}${SigmunTheme.legendItems(s).length>5?`<em>+${SigmunTheme.legendItems(s).length-5}</em>`:''}</div>`;
  }
  function layerCollectionName(obj){const m=obj.def?.metadata||{};return m.source_collection||m.source_document||'Capas del proyecto'}
  function setLayerVisible(id,visible){const x=state.layers.get(id);if(!x)return;if(visible&&!map.hasLayer(x.leaflet))x.leaflet.addTo(map);if(!visible&&map.hasLayer(x.leaflet))map.removeLayer(x.leaflet)}
  function refreshLayerVisibilityUi(){const all=[...state.layers.values()],visible=all.filter(x=>map.hasLayer(x.leaflet)).length;if($('visibleLayerCount'))$('visibleLayerCount').textContent=`${visible} de ${all.length} visibles`}
  function renderLayerList(){
    const arr=[...state.layers.values()].sort((a,b)=>(a.def.sort_order||0)-(b.def.sort_order||0));
    const groups=[];const by=new Map();for(const x of arr){const name=layerCollectionName(x),key=(x.def.metadata?.import_group_id||name);if(!by.has(key)){const g={key,name,items:[]};by.set(key,g);groups.push(g)}by.get(key).items.push(x)}
    $('layerList').innerHTML=groups.length?groups.map(g=>{const vis=g.items.filter(x=>map.hasLayer(x.leaflet)).length,allOn=vis===g.items.length;return`<div class="viewer-layer-group"><div class="viewer-layer-group-head"><input class="group-check" type="checkbox" data-layer-group="${esc(g.key)}" ${allOn?'checked':''} ${vis>0&&!allOn?'data-indeterminate="1"':''}><div class="grow"><b>${esc(g.name)}</b><small>${vis} de ${g.items.length} capa${g.items.length===1?'':'s'} visibles</small></div><div class="layer-group-actions"><button data-group-on="${esc(g.key)}" title="Mostrar colección">Todas</button><button data-group-off="${esc(g.key)}" title="Ocultar colección">Ninguna</button></div></div><div class="viewer-layer-group-body">${g.items.map(x=>{const c=SigmunTheme.colorForFeature(x.style,x.geojson.features?.[0]||{}),isVisible=map.hasLayer(x.leaflet),source=x.def.metadata?.source_document;return`<div class="layer-item ${x.def.id===state.selected?'selected':''} ${isVisible?'is-visible':''}"><div class="layer-row"><input class="layer-check" type="checkbox" data-layer-toggle="${x.def.id}" ${isVisible?'checked':''} aria-label="Mostrar ${esc(x.def.name)}"><span class="dot" style="background:${c}"></span><button class="layer-name" data-select="${x.def.id}">${esc(x.def.name)}</button><div class="layer-tools"><button class="mini-icon" data-zoom="${x.def.id}" title="Acercar"><i class="bi bi-search"></i></button></div></div><div class="layer-meta">${esc(rendererName(x.style.renderer))}${x.style.field?' · '+esc(x.style.field):''} · ${x.geojson.features.length.toLocaleString('es-MX')} elementos${source&&source!==x.def.name?`<span class="layer-source-tag">${esc(source)}</span>`:''}</div>${miniLegend(x)}</div>`}).join('')}</div></div>`}).join(''):'<div class="empty">Este proyecto todavía no tiene capas geográficas publicadas.</div>';
    document.querySelectorAll('[data-indeterminate="1"]').forEach(x=>x.indeterminate=true);
    document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectLayer(b.dataset.select));
    document.querySelectorAll('[data-layer-toggle]').forEach(c=>c.onchange=()=>{setLayerVisible(c.dataset.layerToggle,c.checked);renderLayerList();renderMapLegend();fitVisibleIfNeeded()});
    document.querySelectorAll('[data-layer-group]').forEach(c=>c.onchange=()=>{const g=groups.find(x=>String(x.key)===String(c.dataset.layerGroup));g?.items.forEach(x=>setLayerVisible(x.def.id,c.checked));renderLayerList();renderMapLegend();fitVisibleIfNeeded()});
    document.querySelectorAll('[data-group-on]').forEach(b=>b.onclick=()=>{const g=groups.find(x=>String(x.key)===String(b.dataset.groupOn));g?.items.forEach(x=>setLayerVisible(x.def.id,true));renderLayerList();renderMapLegend();fitVisibleIfNeeded()});
    document.querySelectorAll('[data-group-off]').forEach(b=>b.onclick=()=>{const g=groups.find(x=>String(x.key)===String(b.dataset.groupOff));g?.items.forEach(x=>setLayerVisible(x.def.id,false));renderLayerList();renderMapLegend()});
    document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>zoomLayer(b.dataset.zoom));refreshLayerVisibilityUi();updateDataSelect();
  }
  function fitVisibleIfNeeded(){refreshLayerVisibilityUi()}
  if($('showAllLayers'))$('showAllLayers').onclick=()=>{state.layers.forEach((x,id)=>setLayerVisible(id,true));renderLayerList();renderMapLegend();fitAll()};
  if($('hideAllLayers'))$('hideAllLayers').onclick=()=>{state.layers.forEach((x,id)=>setLayerVisible(id,false));renderLayerList();renderMapLegend()};

  function renderMapLegend(){
    const visible=[...state.layers.values()].filter(x=>map.hasLayer(x.leaflet)&&x.style.legend?.show!==false).sort((a,b)=>(a.def.sort_order||0)-(b.def.sort_order||0));
    if(!visible.length){$('mapLegend').innerHTML='';$('mapLegend').classList.remove('show');return}
    $('mapLegend').innerHTML=`<div class="map-legend-head"><b>Leyenda</b><span>${visible.length} capa${visible.length===1?'':'s'} visible${visible.length===1?'':'s'}</span></div>`+visible.map(x=>`<div class="map-legend-block"><strong>${esc(x.style.legend?.title||x.def.name)}</strong>${x.style.field?`<small>${esc(x.style.field)}</small>`:''}<div>${SigmunTheme.legendItems(x.style).map(i=>`<span class="map-legend-item"><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div></div>`).join('');
    $('mapLegend').classList.add('show');
  }
  function selectLayer(id){
    state.selected=id;const x=state.layers.get(id);state.rows=(x?.geojson?.features||[]).map((f,i)=>({__fid:String(f.id??i+1),__geometry:f.geometry?.type,...(f.properties||{})}));state.filtered=[...state.rows];renderLayerList();refreshData();
  }
  function updateDataSelect(){
    $('dataLayer').innerHTML=[...state.layers.values()].sort((a,b)=>(a.def.sort_order||0)-(b.def.sort_order||0)).map(x=>`<option value="${x.def.id}" ${x.def.id===state.selected?'selected':''}>${esc(x.def.name)}</option>`).join('');$('dataLayer').onchange=e=>selectLayer(e.target.value);
  }
  function refreshData(){renderTable();setupFilters();renderAnalysis()}
  function applyFilters(){
    const term=$('searchInput').value.toLowerCase(),f=$('filterField').value,v=$('filterValue').value;state.filtered=state.rows.filter(r=>(!term||Object.values(r).some(x=>String(x??'').toLowerCase().includes(term)))&&(!f||!v||String(r[f]??'')===v));renderTable();renderAnalysis(false);
  }
  function setupFilters(){
    const fields=state.rows.length?Object.keys(state.rows[0]).filter(f=>!f.startsWith('__')):[];$('filterField').innerHTML='<option value="">Campo</option>'+fields.map(f=>`<option>${esc(f)}</option>`).join('');
    $('filterField').onchange=()=>{const f=$('filterField').value,vals=[...new Set(state.rows.map(r=>String(r[f]??'')).filter(Boolean))].slice(0,150);$('filterValue').innerHTML='<option value="">Todos</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');applyFilters()};$('filterValue').onchange=applyFilters;$('searchInput').oninput=applyFilters;
  }
  function renderTable(){
    if(!state.filtered.length){$('dataTable').innerHTML='<tbody><tr><td style="padding:15px">Sin registros.</td></tr></tbody>';return}const fields=Object.keys(state.filtered[0]).filter(f=>f!=='__fid').slice(0,14);$('dataTable').innerHTML=`<thead><tr>${fields.map(f=>`<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${state.filtered.slice(0,500).map(r=>`<tr>${fields.map(f=>`<td title="${esc(r[f])}">${esc(r[f])}</td>`).join('')}</tr>`).join('')}</tbody>`;
  }
  function renderAnalysis(resetField=true){
    if(state.chart){state.chart.destroy();state.chart=null}const s=SigmunData.summarize(state.filtered);$('analysisKpis').innerHTML=`<div class="kpi"><span>Elementos</span><b>${s.count}</b></div><div class="kpi"><span>Campos</span><b>${s.fields.length}</b></div><div class="kpi"><span>Numéricos</span><b>${s.numeric.length}</b></div><div class="kpi"><span>Filtrados</span><b>${state.rows.length-state.filtered.length}</b></div>`;
    const fields=s.categorical.length?s.categorical:s.fields.slice(0,8);if(resetField)$('chartField').innerHTML=fields.map(f=>`<option>${esc(f)}</option>`).join('');const f=$('chartField').value||fields[0];if(f)drawChart(f);
  }
  function drawChart(f){
    if(state.chart)state.chart.destroy();const counts=SigmunData.counts(state.filtered,f),layer=state.layers.get(state.selected),style=layer?.style||SigmunTheme.normalizeStyle({});
    const colors=counts.map((x,i)=>style.renderer==='categorized'&&style.field===f?SigmunTheme.colorForValue(style,x[0]):SigmunTheme.colorAt(i,counts.length,'categorical'));
    state.chart=new Chart($('chart'),{type:'bar',data:{labels:counts.map(x=>x[0]),datasets:[{data:counts.map(x=>x[1]),backgroundColor:colors,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:counts.length>8?'y':'x',plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:8}}},y:{ticks:{font:{size:8}}}}}});
  }
  $('chartField').onchange=e=>drawChart(e.target.value);
  function showProps(f,def){
    const style=SigmunTheme.normalizeStyle(def?.style||{}),sym=style.field?`<div class="prop thematic-prop"><span>Simbología</span><b><i style="background:${SigmunTheme.colorForFeature(style,f)}"></i>${esc(style.field)}: ${esc(f.properties?.[style.field]??'Sin dato')}</b></div>`:'';
    $('propertyBody').innerHTML=sym+Object.entries(f.properties||{}).map(([k,v])=>`<div class="prop"><span>${esc(k)}</span><b>${esc(typeof v==='object'?JSON.stringify(v):v)}</b></div>`).join('')||'<div class="empty">Sin atributos.</div>';$('propertyDrawer').classList.add('open');
  }
  $('closeProps').onclick=()=>$('propertyDrawer').classList.remove('open');
  function zoomLayer(id){const b=state.layers.get(id)?.leaflet.getBounds();if(b?.isValid())map.fitBounds(b,{padding:[35,35],maxZoom:17})}
  function fitAll(){const list=[...state.layers.values()].filter(x=>map.hasLayer(x.leaflet)).map(x=>x.leaflet);if(!list.length)return;const group=L.featureGroup(list),b=group.getBounds();if(b?.isValid())map.fitBounds(b,{padding:[30,30],maxZoom:16})}

  document.querySelectorAll('.viewer-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.viewer-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view-pane').forEach(x=>x.classList.toggle('active',x.dataset.pane===b.dataset.tab))});
  document.querySelectorAll('.base-btn').forEach(b=>b.onclick=()=>{map.removeLayer(bases[state.currentBase]);state.currentBase=b.dataset.base;bases[state.currentBase].addTo(map);document.querySelectorAll('.base-btn').forEach(x=>x.classList.toggle('active',x===b))});
  $('panelBtn').onclick=()=>$('viewerPanel').classList.toggle('open');map.on('mousemove',e=>$('coords').textContent=`Lat: ${e.latlng.lat.toFixed(6)} | Lon: ${e.latlng.lng.toFixed(6)}`);
  $('homeBtn').onclick=()=>state.project?map.setView([state.project.center_lat||cfg.defaultCenter[0],state.project.center_lon||cfg.defaultCenter[1]],state.project.default_zoom||cfg.defaultZoom):map.setView(cfg.defaultCenter,cfg.defaultZoom);
  $('fullBtn').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();$('printBtn').onclick=()=>window.print();
  $('locateBtn').onclick=()=>map.locate({setView:true,maxZoom:17});map.on('locationerror',()=>toast('No fue posible obtener tu ubicación.',true));
  $('drawBtn').onclick=()=>{state.drawVisible=!state.drawVisible;if(state.drawVisible)map.addControl(state.drawControl);else map.removeControl(state.drawControl);$('drawBtn').classList.toggle('active',state.drawVisible)};
  $('measureBtn').onclick=()=>{state.measureMode=true;new L.Draw.Polyline(map,{shapeOptions:{color:'#0f4fa8',weight:3}}).enable();toast('Traza una línea para medir la distancia.')};
  $('exportBtn').onclick=()=>{
    const x=state.layers.get(state.selected);if(!x)return;const ids=new Set(state.filtered.map(r=>String(r.__fid))),gj={type:'FeatureCollection',features:(x.geojson.features||[]).filter(f=>ids.has(String(f.id)))};SigmunData.download(`${(x.def.name||'capa').replace(/\s+/g,'_')}.geojson`,JSON.stringify(gj,null,2),'application/geo+json');
  };
  init();
})();
