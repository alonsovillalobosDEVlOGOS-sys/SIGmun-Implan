(() => {
  'use strict';
  const palette = ['#0f4fa8','#0a9148','#ed8500','#7c3aed','#d93c55','#0891b2','#5b6c7c'];
  const params = new URLSearchParams(location.search);
  const projectId = params.get('project') || 'territorio';
  const project = window.SIGMUN_PROJECT_CONFIG?.[projectId] || window.SIGMUN_PROJECT_CONFIG?.territorio || {};
  const startCenter = project.center || [28.1908,-105.4701], startZoom = project.zoom || 13;

  document.title = `${project.title || 'Visor SIG'} | SIGmun Delicias`;
  projectTitle.textContent = project.title || 'Visor Territorial';
  projectSubtitle.textContent = project.subtitle || 'Sistema de Información Geográfica Municipal';
  mapBadgeTitle.textContent = project.title || 'SIGmun Delicias';
  mapBadgeSubtitle.textContent = project.subtitle || 'Carga una capa para comenzar.';

  const map = L.map('map',{center:startCenter,zoom:startZoom,zoomControl:false,minZoom:5,maxZoom:20});
  const bases = {
    osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}),
    satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}),
    terrain:L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenTopoMap'})
  };
  let currentBase='osm'; bases.osm.addTo(map);
  const layers=new Map(); let selectedLayerId=null, activeChart=null, colorIndex=0, currentStyleLayerId=null, measureState=null;

  const drawnItems=new L.FeatureGroup().addTo(map);
  const drawControl=new L.Control.Draw({position:'topleft',edit:{featureGroup:drawnItems,remove:true},draw:{polygon:true,polyline:true,rectangle:true,circle:false,circlemarker:false,marker:true}});
  let drawControlVisible=false;
  map.on(L.Draw.Event.CREATED,(e)=>{drawnItems.addLayer(e.layer);syncDrawings()});
  map.on(L.Draw.Event.EDITED,syncDrawings); map.on(L.Draw.Event.DELETED,syncDrawings);

  const esc=(v)=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const uid=(p='layer')=>`${p}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  const nextColor=()=>palette[colorIndex++%palette.length];

  function toast(msg,error=false){
    const el=document.getElementById('toast');el.textContent=msg;el.classList.toggle('error',error);el.classList.add('show');
    clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3200)
  }
  function makeGeoLayer(geojson,color,opacity=.82,weight=2){
    return L.geoJSON(geojson,{
      style:()=>({color,weight,opacity,fillColor:color,fillOpacity:opacity*.32}),
      pointToLayer:(_f,ll)=>L.circleMarker(ll,{radius:7,color,weight:2,fillColor:color,opacity,fillOpacity:opacity*.72}),
      onEachFeature:(feature,layer)=>layer.on('click',(e)=>{L.DomEvent.stopPropagation(e);showProperties(feature)})
    })
  }
  function addGeoDataset(name,dataset,opt={}){
    if(!dataset.geojson) throw new Error('La fuente no contiene geometría. CSV/XLSX requieren columnas de latitud y longitud.');
    const id=opt.id||uid(),color=opt.color||nextColor(),opacity=opt.opacity??.82,weight=opt.weight??2;
    const leaflet=makeGeoLayer(dataset.geojson,color,opacity,weight).addTo(map);
    layers.set(id,{id,name:name||`Capa ${layers.size+1}`,leaflet,geojson:dataset.geojson,rows:dataset.rows||SigmunData.geojsonToRows(dataset.geojson),color,opacity,weight,type:opt.type||'vector',source:opt.source||'local'});
    selectedLayerId=id;renderLayerList();refreshDataViews();
    try{const b=leaflet.getBounds();if(b.isValid())map.fitBounds(b,{padding:[35,35],maxZoom:17})}catch(_){}
    toast(`Capa “${name}” cargada.`);return id
  }
  function addWmsLayer(name,url,layerName){
    const id=uid('wms'),leaflet=L.tileLayer.wms(url,{layers:layerName,transparent:true,format:'image/png',version:'1.3.0',opacity:.82}).addTo(map);
    layers.set(id,{id,name:name||layerName,leaflet,geojson:null,rows:[],color:'#0f4fa8',opacity:.82,weight:2,type:'wms',source:url});
    selectedLayerId=id;renderLayerList();refreshDataViews();toast(`WMS “${name||layerName}” agregado.`)
  }
  function syncDrawings(){
    const geojson=drawnItems.toGeoJSON(),id='__drawings__';
    if(!geojson.features.length){layers.delete(id);selectedLayerId=null}
    else{layers.set(id,{id,name:'Dibujos del usuario',leaflet:drawnItems,geojson,rows:SigmunData.geojsonToRows(geojson),color:'#ed8500',opacity:.9,weight:3,type:'draw'});selectedLayerId=id}
    renderLayerList();refreshDataViews()
  }
  function renderLayerList(){
    if(!layers.size){layerList.innerHTML='<div class="empty-state"><i class="bi bi-layers"></i><b>Sin capas cargadas</b><p>Agrega archivos, Google Sheets, Apps Script o WMS.</p></div>';updateSelects();return}
    layerList.innerHTML=[...layers.values()].map(l=>{
      const visible=map.hasLayer(l.leaflet);
      return `<div class="layer-item" data-id="${l.id}"><div class="layer-row"><span class="layer-dot" style="background:${l.color}"></span>
      <button class="layer-name" data-action="select" style="border:0;background:none;text-align:left;padding:0">${esc(l.name)}</button>
      <div class="layer-actions"><button data-action="toggle"><i class="bi ${visible?'bi-eye':'bi-eye-slash'}"></i></button>
      ${l.type!=='wms'&&l.id!=='__drawings__'?'<button data-action="style"><i class="bi bi-palette"></i></button>':''}
      <button data-action="export"><i class="bi bi-download"></i></button>${l.id!=='__drawings__'?'<button data-action="remove"><i class="bi bi-x-lg"></i></button>':''}</div></div>
      <div class="layer-meta">${l.type.toUpperCase()} · ${l.rows?.length||0} registros</div></div>`
    }).join('');
    layerList.querySelectorAll('.layer-item').forEach(item=>item.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>handleAction(item.dataset.id,btn.dataset.action))));
    updateSelects()
  }
  function handleAction(id,action){
    const l=layers.get(id);if(!l)return;
    if(action==='select'){selectedLayerId=id;refreshDataViews();if(l.leaflet?.getBounds){const b=l.leaflet.getBounds();if(b?.isValid?.())map.fitBounds(b,{padding:[30,30],maxZoom:17})}}
    if(action==='toggle'){map.hasLayer(l.leaflet)?map.removeLayer(l.leaflet):l.leaflet.addTo(map);renderLayerList()}
    if(action==='remove'){map.removeLayer(l.leaflet);layers.delete(id);if(selectedLayerId===id)selectedLayerId=[...layers.keys()][0]||null;renderLayerList();refreshDataViews()}
    if(action==='style')openStyle(id);if(action==='export')exportLayer(id)
  }
  function updateSelects(){
    const items=[...layers.values()].filter(l=>l.rows?.length);
    dataLayerSelect.innerHTML=items.length?items.map(l=>`<option value="${l.id}" ${l.id===selectedLayerId?'selected':''}>${esc(l.name)}</option>`).join(''):'<option value="">Sin datos</option>'
  }
  function refreshDataViews(){
    const l=layers.get(selectedLayerId)||[...layers.values()].find(x=>x.rows?.length)||null;
    if(l&&selectedLayerId!==l.id)selectedLayerId=l.id;renderTable(l);renderAnalysis(l);updateSelects()
  }
  function renderTable(l){
    if(!l?.rows?.length){dataTable.innerHTML='<tbody><tr><td style="padding:18px">No hay datos tabulares.</td></tr></tbody>';return}
    const rows=l.rows.slice(0,100),fields=Object.keys(rows[0]||{}).slice(0,12);
    dataTable.innerHTML=`<thead><tr>${fields.map(f=>`<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${fields.map(f=>`<td title="${esc(r[f])}">${esc(r[f])}</td>`).join('')}</tr>`).join('')}</tbody>`
  }
  function renderAnalysis(l){
    if(activeChart){activeChart.destroy();activeChart=null}
    if(!l?.rows?.length){analysisKpis.innerHTML='<div class="kpi"><span>Registros</span><b>0</b></div><div class="kpi"><span>Campos</span><b>0</b></div>';chartField.innerHTML='<option>Sin campos</option>';return}
    const s=SigmunData.summarizeRows(l.rows);
    analysisKpis.innerHTML=`<div class="kpi"><span>Registros</span><b>${s.count.toLocaleString('es-MX')}</b></div><div class="kpi"><span>Campos</span><b>${s.fields.length}</b></div><div class="kpi"><span>Numéricos</span><b>${s.numericFields.length}</b></div><div class="kpi"><span>Geometría</span><b>${l.geojson?.features?.length||0}</b></div>`;
    const fields=s.categoricalFields.length?s.categoricalFields:s.fields.slice(0,8);
    chartField.innerHTML=fields.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');if(fields[0])drawChart(l.rows,fields[0])
  }
  function drawChart(rows,field){
    const series=SigmunData.categorySeries(rows,field);if(activeChart)activeChart.destroy();
    activeChart=new Chart(document.getElementById('layerChart'),{type:'bar',data:{labels:series.map(x=>x[0]),datasets:[{data:series.map(x=>x[1]),backgroundColor:'#0f4fa8',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:series.length>7?'y':'x',plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:9}}},y:{ticks:{font:{size:9}}}}}})
  }
  function showProperties(feature){propertiesBody.innerHTML=Object.entries(feature.properties||{}).map(([k,v])=>`<div class="property-row"><span>${esc(k)}</span><b>${esc(typeof v==='object'?JSON.stringify(v):v)}</b></div>`).join('')||'<div class="empty-state"><b>Sin atributos</b></div>';propertiesDrawer.classList.add('open')}
  function openStyle(id){const l=layers.get(id);if(!l)return;currentStyleLayerId=id;styleColor.value=l.color;styleOpacity.value=Math.round(l.opacity*100);styleWeight.value=l.weight;styleModal.classList.add('open')}
  function closeStyle(){styleModal.classList.remove('open');currentStyleLayerId=null}
  function applyStyle(){
    const l=layers.get(currentStyleLayerId);if(!l)return;l.color=styleColor.value;l.opacity=+styleOpacity.value/100;l.weight=+styleWeight.value;
    if(l.leaflet?.setStyle)l.leaflet.setStyle({color:l.color,fillColor:l.color,opacity:l.opacity,fillOpacity:l.opacity*.32,weight:l.weight});
    renderLayerList();closeStyle()
  }
  function exportLayer(id){
    const l=layers.get(id);if(!l)return;if(l.type==='wms'){toast('Las capas WMS no se exportan desde el navegador.',true);return}
    const safe=l.name.replace(/[^a-z0-9_-]+/gi,'_')||'capa';if(l.geojson)SigmunData.downloadGeoJSON(`${safe}.geojson`,l.geojson);else SigmunData.downloadCSV(`${safe}.csv`,l.rows)
  }
  function openData(){dataModal.classList.add('open')}function closeData(){dataModal.classList.remove('open')}
  async function loadSource(){
    const active=document.querySelector('.form-tab.active')?.dataset.formTab||'file',name=sourceName.value.trim();
    loadSourceBtn.disabled=true;loadSourceBtn.textContent='Cargando…';
    try{
      if(active==='file'){const f=fileInput.files[0];if(!f)throw new Error('Selecciona un archivo.');addGeoDataset(name||f.name.replace(/\.[^.]+$/,''),await SigmunData.parseFile(f),{source:'file'})}
      else if(active==='sheet'){const url=SigmunData.sheetUrl(sheetInput.value,sheetGid.value);addGeoDataset(name||'Google Sheet',await SigmunData.fetchDataset(url),{source:url})}
      else if(active==='url'){const url=urlInput.value.trim();if(!url)throw new Error('Ingresa una URL.');addGeoDataset(name||'Fuente remota',await SigmunData.fetchDataset(url),{source:url})}
      else{if(!wmsUrl.value.trim()||!wmsLayer.value.trim())throw new Error('Completa URL y capa WMS.');addWmsLayer(name||wmsLayer.value.trim(),wmsUrl.value.trim(),wmsLayer.value.trim())}
      closeData()
    }catch(e){console.error(e);toast(e.message||'No se pudo cargar.',true)}finally{loadSourceBtn.disabled=false;loadSourceBtn.textContent='Cargar fuente'}
  }
  function measure(){
    if(measureState){map.off('click',measureState.click);map.off('dblclick',measureState.dbl);map.removeLayer(measureState.group);measureState=null;measureBtn.classList.remove('active');map.doubleClickZoom.enable();return}
    const group=L.featureGroup().addTo(map),pts=[];
    const click=e=>{pts.push(e.latlng);L.circleMarker(e.latlng,{radius:5,color:'#0f4fa8',fillColor:'#fff',fillOpacity:1}).addTo(group);if(pts.length>1){const a=pts.at(-2),b=pts.at(-1),d=a.distanceTo(b);L.polyline([a,b],{color:'#0f4fa8',weight:3,dashArray:'7,7'}).addTo(group);const mid=L.latLng((a.lat+b.lat)/2,(a.lng+b.lng)/2);L.marker(mid,{icon:L.divIcon({className:'',html:`<span style="background:#09284f;color:white;padding:4px 7px;border-radius:7px;font:10px Inter">${d<1000?d.toFixed(0)+' m':(d/1000).toFixed(2)+' km'}</span>`})}).addTo(group)}};
    const dbl=()=>{map.off('click',click);map.off('dblclick',dbl);measureState=null;measureBtn.classList.remove('active');map.doubleClickZoom.enable()};
    map.on('click',click);map.on('dblclick',dbl);map.doubleClickZoom.disable();measureState={group,click,dbl};measureBtn.classList.add('active');toast('Medición activa: clic para tramos y doble clic para terminar.')
  }
  function locate(){if(!navigator.geolocation){toast('Geolocalización no disponible.',true);return}navigator.geolocation.getCurrentPosition(p=>{const ll=[p.coords.latitude,p.coords.longitude];map.setView(ll,16);L.circleMarker(ll,{radius:8,color:'#0f4fa8',fillColor:'#0a9148',fillOpacity:1}).addTo(map).bindPopup('Tu ubicación').openPopup()},()=>toast('No se pudo obtener la ubicación.',true),{enableHighAccuracy:true,timeout:10000})}

  document.querySelectorAll('.panel-tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.panel-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.panel-view').forEach(v=>v.classList.toggle('active',v.dataset.view===b.dataset.panel));refreshDataViews()}));
  document.querySelectorAll('.base-btn').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.base;if(key===currentBase)return;map.removeLayer(bases[currentBase]);bases[key].addTo(map);currentBase=key;document.querySelectorAll('.base-btn').forEach(x=>x.classList.toggle('active',x===b))}));
  document.querySelectorAll('.form-tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.form-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.form-pane').forEach(p=>p.classList.toggle('active',p.dataset.formPane===b.dataset.formTab))}));
  addDataBtn.onclick=openData;addDataBtnPanel.onclick=openData;document.querySelectorAll('[data-close-modal]').forEach(b=>b.onclick=closeData);loadSourceBtn.onclick=loadSource;
  document.querySelectorAll('[data-close-style]').forEach(b=>b.onclick=closeStyle);applyStyleBtn.onclick=applyStyle;closeProperties.onclick=()=>propertiesDrawer.classList.remove('open');
  zoomHomeBtn.onclick=()=>map.setView(startCenter,startZoom);locateBtn.onclick=locate;measureBtn.onclick=measure;fullscreenBtn.onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();printBtn.onclick=()=>window.print();
  drawBtn.onclick=()=>{drawControlVisible?map.removeControl(drawControl):map.addControl(drawControl);drawControlVisible=!drawControlVisible;drawBtn.classList.toggle('active',drawControlVisible)};
  panelToggle.onclick=()=>sidePanel.classList.toggle('open');chartField.onchange=e=>{const l=layers.get(selectedLayerId);if(l?.rows?.length)drawChart(l.rows,e.target.value)};dataLayerSelect.onchange=e=>{selectedLayerId=e.target.value||null;refreshDataViews()};exportBtn.onclick=()=>selectedLayerId?exportLayer(selectedLayerId):toast('Selecciona una capa.',true);
  map.on('mousemove',e=>coordinates.textContent=`Lat: ${e.latlng.lat.toFixed(6)} | Lng: ${e.latlng.lng.toFixed(6)}`);map.on('click',()=>propertiesDrawer.classList.remove('open'));
  dropzone.onclick=()=>fileInput.click();['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag')}));['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag')}));dropzone.addEventListener('drop',e=>{if(e.dataTransfer.files[0]){fileInput.files=e.dataTransfer.files;sourceName.value=e.dataTransfer.files[0].name.replace(/\.[^.]+$/,'')}});fileInput.onchange=()=>{if(fileInput.files[0])sourceName.value=fileInput.files[0].name.replace(/\.[^.]+$/,'')};

  renderLayerList();refreshDataViews();
  (async()=>{for(const s of(project.dataSources||[])){try{s.type==='wms'?addWmsLayer(s.name,s.url,s.layer):addGeoDataset(s.name,await SigmunData.fetchDataset(s.url),{source:s.url,color:s.color})}catch(e){console.warn('Fuente configurada no disponible',e)}}})();
})();
