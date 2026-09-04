(() => {
  'use strict';
  const $=id=>document.getElementById(id),cfg=SIGMUN_CONFIG;
  const state={topics:[],projects:[],project:null,defs:[],layers:new Map(),selected:null,rows:[],filtered:[],chart:null,currentBase:'osm',drawControl:null,drawVisible:false,measureMode:false};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let toastTimer;function toast(m,e=false){const x=$('toast');x.textContent=m;x.classList.toggle('error',e);x.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove('show'),2800)}
  const map=L.map('map',{center:cfg.defaultCenter,zoom:cfg.defaultZoom,zoomControl:false,preferCanvas:true});
  const satelliteImagery=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'© Esri',crossOrigin:true});
  const satelliteLabels=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'© Esri',crossOrigin:true});
  const bases={
    osm:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap',crossOrigin:true}),
    satellite:L.layerGroup([satelliteImagery,satelliteLabels]),
    terrain:L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenTopoMap',crossOrigin:true})
  };bases.osm.addTo(map);
  const drawings=L.featureGroup().addTo(map);state.drawControl=new L.Control.Draw({edit:{featureGroup:drawings},draw:{circle:false,circlemarker:false}});
  map.on(L.Draw.Event.CREATED,e=>{drawings.addLayer(e.layer);if(state.measureMode&&e.layer instanceof L.Polyline){const pts=e.layer.getLatLngs().flat(Infinity);let meters=0;for(let i=1;i<pts.length;i++)meters+=pts[i-1].distanceTo(pts[i]);toast(`Distancia: ${meters>=1000?(meters/1000).toFixed(2)+' km':Math.round(meters)+' m'}`);state.measureMode=false}});

  async function init(){try{state.topics=await SigmunDB.topics();state.projects=await SigmunDB.projects();fillTopics();const slug=new URLSearchParams(location.search).get('project'),p=state.projects.find(x=>x.slug===slug)||state.projects.find(x=>x.project_type!=='dashboard')||state.projects[0];if(p){$('topicSelect').value=p.topic_id;fillProjects(p.topic_id,p.id);await selectProject(p.id)}}catch(e){console.error(e);toast(e.message,true)}}
  function fillTopics(){$('topicSelect').innerHTML=state.topics.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');$('topicSelect').onchange=e=>{fillProjects(e.target.value);const id=$('projectSelect').value;if(id)selectProject(id)}}
  function fillProjects(topicId,sel){const arr=state.projects.filter(p=>p.topic_id===topicId&&p.project_type!=='dashboard');$('projectSelect').innerHTML=arr.map(p=>`<option value="${p.id}" ${p.id===sel?'selected':''}>${esc(p.name)}</option>`).join('');$('projectSelect').onchange=e=>selectProject(e.target.value)}
  async function selectProject(id){state.project=state.projects.find(p=>p.id===id);if(!state.project)return;clearProjectLayers();$('headerTitle').textContent=state.project.name;$('headerSubtitle').textContent=state.project.sigmun_topics?.name||'SIGmun Delicias';$('mapTitle').textContent=state.project.name;$('mapDesc').textContent=state.project.description||'';$('dashLink').href=`dashboard.html?project=${encodeURIComponent(state.project.slug)}`;map.setView([state.project.center_lat||cfg.defaultCenter[0],state.project.center_lon||cfg.defaultCenter[1]],state.project.default_zoom||cfg.defaultZoom);state.defs=await SigmunDB.geoLayers(id);await loadDefs()}
  function clearProjectLayers(){for(const x of state.layers.values()){if(map.hasLayer(x.leaflet))map.removeLayer(x.leaflet)}state.layers.clear();state.selected=null;state.rows=[];state.filtered=[];renderLayerList();refreshData();renderMapLegend()}
  function featureId(f,i=0){return String(f?.id??f?.properties?.id??i)}
  function makeLayer(def,gj,index){
    const style=SigmunTheme.normalizeStyle(def.style||{}),pane=`sigmun-${String(def.id).replace(/-/g,'').slice(0,12)}`;
    if(!map.getPane(pane)){map.createPane(pane);map.getPane(pane).style.zIndex=String(650-index*3)}
    const features=gj?.features||[],canvas=L.canvas({pane,padding:.35,tolerance:4}),subgroups=SigmunTheme.layerSubgroups(features,style),fidToGroup=new Map();
    subgroups.forEach(g=>g.featureIds.forEach(id=>fidToGroup.set(String(id),g.key)));
    const leaflet=L.featureGroup(),vector=L.geoJSON(gj||{type:'FeatureCollection',features:[]},{
      pane,renderer:canvas,
      style:f=>({...SigmunTheme.leafletPathStyle(style,f,1),pane,renderer:canvas}),
      pointToLayer:(f,ll)=>{
        const k=SigmunTheme.kmlResolvedStyle(style,f),iconUrl=SigmunTheme.isKmlRenderer(style)?k.iconDataUrl:null;
        if(iconUrl){
          const scale=Math.max(.25,Math.min(2.5,Number(k.iconScale)||1)),size=Math.max(7,Math.min(48,32*scale));
          const marker=L.marker(ll,{pane,opacity:SigmunTheme.clamp01(k.iconOpacity??1)*SigmunTheme.clamp01(style.kmlOpacity),icon:L.icon({iconUrl,iconSize:[size,size],iconAnchor:[size/2,size/2]})});
          marker.__sigmunIconBaseOpacity=SigmunTheme.clamp01(k.iconOpacity??1)*SigmunTheme.clamp01(style.kmlOpacity);
          return marker;
        }
        return L.circleMarker(ll,{...SigmunTheme.leafletPointStyle(style,f,1),pane,renderer:canvas});
      },
      onEachFeature:(f,l)=>{
        l.__sigmunFeature=f;l.__sigmunGroup=fidToGroup.get(featureId(f))||'';
        const label=style.labelField?f.properties?.[style.labelField]:f.properties?.name;
        if(label!==undefined&&label!==null&&label!=='')l.bindTooltip(String(label),{sticky:true,direction:'top'});
        l.on('click',()=>{showProps(f,def);selectLayer(def.id)});
      }
    });
    vector.eachLayer(l=>leaflet.addLayer(l));
    const rasterOverlays=Array.isArray(def.metadata?.raster_overlays)?def.metadata.raster_overlays:[];
    rasterOverlays.forEach((ov,i)=>{
      const url=ov.dataUrl||ov.image_href||ov.imageUrl||'';
      if(!url||![ov.south,ov.west,ov.north,ov.east].every(v=>Number.isFinite(Number(v))))return;
      const baseOpacity=SigmunTheme.clamp01(ov.opacity??1)*SigmunTheme.clamp01(style.kmlOpacity??1);
      const img=L.imageOverlay(url,[[Number(ov.south),Number(ov.west)],[Number(ov.north),Number(ov.east)]],{pane,opacity:baseOpacity,interactive:true,crossOrigin:true});
      img.__sigmunRaster=true;img.__sigmunRasterBaseOpacity=baseOpacity;img.__sigmunRasterInfo=ov;
      img.on('click',()=>showRasterProps(ov,def));
      leaflet.addLayer(img);
    });
    const children=[];leaflet.eachLayer(l=>children.push(l));
    return{def,geojson:gj||{type:'FeatureCollection',features:[]},leaflet,pane,style,canvas,opacity:1,subgroups,fidToGroup,disabledSubgroups:new Set(),children,overlayCount:rasterOverlays.length};
  }
  async function loadDefs(){
    if(!state.defs.length){renderLayerList();renderMapLegend();return}
    const sorted=[...state.defs].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.name.localeCompare(b.name,'es'));
    for(let i=0;i<sorted.length;i++){
      const d=sorted[i];
      try{
        const gj=d.geometry_type==='RasterOverlay'?{type:'FeatureCollection',features:[]}:await SigmunDB.geojson(d.id),obj=makeLayer(d,gj,i);
        if(d.is_visible!==false)obj.leaflet.addTo(map);
        state.layers.set(d.id,obj);
      }catch(e){console.error('Capa',d.name,e)}
    }
    renderLayerList();renderMapLegend();const first=sorted.find(d=>state.layers.has(d.id));
    if(first){selectLayer(first.id);fitAll()}
  }
  function rendererName(r,type=''){if(type==='RasterOverlay')return'Cobertura ráster';return r==='kml'?'Estilo KML original':r==='categorized'?'Categorías':r==='graduated'?'Rangos':'Símbolo único'}
  function rendererDetail(x){const s=x.style;if(s.renderer==='kml'){const f=s.kmlLegendField||SigmunTheme.inferKmlLegendField(x.geojson.features||[]);return f?`${f} · ${x.subgroups.length} clases`:`${x.subgroups.length} estilos`}if(s.renderer==='categorized')return s.field?`${s.field} · ${x.subgroups.length||s.categories?.length||0} clases`:'';if(s.renderer==='graduated')return s.field?`${s.field} · ${s.classes?.length||0} rangos`:'';return''}
  function visibleFeatures(x){if(!x)return[];if(!x.disabledSubgroups.size)return x.geojson.features||[];return(x.geojson.features||[]).filter((f,i)=>{const key=x.fidToGroup?.get(featureId(f,i));return!key||!x.disabledSubgroups.has(key)})}
  function legendColorKey(item){return `${String(item?.color||'#64748b').toLowerCase()}|${Math.round(SigmunTheme.clamp01(item?.opacity??1)*100)}`}
  function isTechnicalLegendField(field=''){return /^(id|fid|gid|oid|objectid|way|shape|shape_leng|shape_area|length|lengthm|area|area_ha|dist|distance|draworder|zindex|sort|buf_|buvf_|num_|no_|index)/i.test(String(field).trim())||/_dist$/i.test(String(field).trim())}
  function isTechnicalLegendLabel(label=''){const s=String(label??'').trim();return !s||/^[-+]?\d+(?:[.,]\d+)?$/.test(s)||/^way\//i.test(s)||/^fid\b/i.test(s)||/^(gid|id|oid|objectid)$/i.test(s)}
  function meaningfulLegendField(x){
    const s=x.style||{};let field='';
    if(s.renderer==='categorized'||s.renderer==='graduated')field=s.field||'';
    else if(s.renderer==='kml')field=s.kmlLegendField||SigmunTheme.inferKmlLegendField(x.geojson.features||[])||'';
    return field&&!isTechnicalLegendField(field)?field:'';
  }
  function simplifiedLegendItems(x){
    if(!x)return[];
    const features=visibleFeatures(x),raw=SigmunTheme.legendItems(x.style,features),field=meaningfulLegendField(x),thematic=!!field&&(x.style.renderer==='kml'||x.style.renderer==='categorized'||x.style.renderer==='graduated');
    if(x.def.geometry_type==='RasterOverlay')return[{label:x.def.name,color:'#62b5e5',opacity:x.opacity,count:x.overlayCount||1}];
    if(!raw.length)return[];
    if(thematic){
      const byLabel=new Map();
      for(const item of raw){
        const label=String(item.label??'Sin dato').trim()||'Sin dato',key=label.toLocaleLowerCase('es-MX');
        if(!byLabel.has(key))byLabel.set(key,{...item,label,count:0});
        const hit=byLabel.get(key);hit.count+=(Number(item.count)||0);if(!hit.color&&item.color)hit.color=item.color;
      }
      const grouped=[...byLabel.values()].sort((a,b)=>String(a.label).localeCompare(String(b.label),'es',{numeric:true}));
      const colors=new Set(grouped.map(legendColorKey));
      if(colors.size<=1)return[{...grouped[0],label:x.def.name,count:features.length+(x.overlayCount||0)}];
      return grouped;
    }
    const byColor=new Map();
    for(const item of raw){const key=legendColorKey(item);if(!byColor.has(key))byColor.set(key,{...item,count:0});byColor.get(key).count+=(Number(item.count)||0)}
    const merged=[...byColor.values()];
    if(merged.length===1)return[{...merged[0],label:x.def.name,count:features.length+(x.overlayCount||0)}];
    return merged.slice(0,8).map((item,i)=>({...item,label:(!isTechnicalLegendLabel(item.label))?String(item.label):`${x.def.name} · símbolo ${i+1}`}));
  }
  function legendGeometryKind(x){const t=x?.def?.geometry_type||'';if(t==='RasterOverlay')return'raster';if(/Point/i.test(t))return'point';if(/Line/i.test(t))return'line';return'polygon'}
  function legendSymbolHtml(x,item,cls='legend-symbol'){
    const kind=legendGeometryKind(x),opacity=SigmunTheme.clamp01(item?.opacity??1)*SigmunTheme.clamp01(x?.opacity??1),color=item?.color||'#64748b';
    return`<i class="${cls} ${cls}-${kind}" style="--legend-color:${color};--legend-opacity:${opacity}"></i>`;
  }
  function miniLegend(obj){const all=simplifiedLegendItems(obj),items=all.slice(0,6);if((obj.style.renderer==='single'&&all.length<=1)||!items.length)return'';return`<div class="layer-mini-legend">${items.map(i=>`<span title="${esc(i.label)}">${legendSymbolHtml(obj,i,'mini-symbol')}${esc(i.label)}</span>`).join('')}${all.length>6?`<em>+${all.length-6}</em>`:''}</div>`}
  function collectionGroups(arr){const mapg=new Map();for(const x of arr){const m=x.def.metadata||{},key=m.import_group_id?`g:${m.import_group_id}`:'standalone',title=m.source_collection||'Capas independientes';if(!mapg.has(key))mapg.set(key,{key,title,layers:[]});mapg.get(key).layers.push(x)}return[...mapg.values()]}
  function subgroupRows(x){
    if(!x.subgroups.length)return'';
    const mode=x.subgroups[0]?.mode||{},field=mode.field||x.style.field||x.style.kmlLegendField||'',title=field?`Clasificación · ${field}`:'Categorías / subcarpetas';
    return`<details class="layer-subgroups" ${x.def.id===state.selected?'open':''}><summary><span>${esc(title)}</span><b>${x.subgroups.length}</b></summary><div class="subgroup-actions"><button type="button" data-sub-all="${x.def.id}">Todas</button><button type="button" data-sub-none="${x.def.id}">Ninguna</button></div><div class="subgroup-list">${x.subgroups.map(g=>`<label class="subgroup-row"><input type="checkbox" data-sub-toggle="${x.def.id}" data-sub-key="${esc(g.key)}" ${x.disabledSubgroups.has(g.key)?'':'checked'}><i style="background:${g.color};opacity:${g.opacity??1}"></i><span title="${esc(g.displayLabel||g.label)}">${esc(g.displayLabel||g.label)}</span><em>${g.count.toLocaleString('es-MX')}</em></label>`).join('')}</div></details>`;
  }
  function layerCard(x){
    const active=map.hasLayer(x.leaflet),features=visibleFeatures(x),c=x.def.geometry_type==='RasterOverlay'?'#62b5e5':SigmunTheme.colorForFeature(x.style,features[0]||x.geojson.features?.[0]||{}),detail=rendererDetail(x),total=(x.geojson.features||[]).length+(x.overlayCount||0);
    return`<div class="layer-item ${x.def.id===state.selected?'selected':''}" data-layer-card="${x.def.id}"><div class="layer-row"><label class="layer-check" title="Mostrar/ocultar capa"><input type="checkbox" data-toggle="${x.def.id}" ${active?'checked':''}><span></span></label><span class="dot" style="background:${c}"></span><button class="layer-name" data-select="${x.def.id}">${esc(x.def.name)}</button><div class="layer-tools"><button class="mini-icon" data-zoom="${x.def.id}" title="Acercar"><i class="bi bi-search"></i></button></div></div><div class="layer-meta"><b>${esc(rendererName(x.style.renderer,x.def.geometry_type))}</b>${detail?` · ${esc(detail)}`:''} · ${(features.length+(x.overlayCount||0)).toLocaleString('es-MX')} / ${total.toLocaleString('es-MX')} elementos</div><div class="layer-opacity-row"><span>Opacidad</span><input type="range" data-opacity="${x.def.id}" min="0" max="100" value="${Math.round(x.opacity*100)}" aria-label="Opacidad de ${esc(x.def.name)}"><b>${Math.round(x.opacity*100)}%</b></div>${subgroupRows(x)}${miniLegend(x)}</div>`;
  }
  function renderLayerList(){
    const arr=[...state.layers.values()].sort((a,b)=>(a.def.sort_order||0)-(b.def.sort_order||0)),groups=collectionGroups(arr);$('layerList').innerHTML=arr.length?groups.map(g=>`<section class="viewer-layer-group"><div class="viewer-layer-group-head"><div><i class="bi bi-collection"></i><b>${esc(g.title)}</b><span>${g.layers.length} capa${g.layers.length===1?'':'s'}</span></div><div><button type="button" data-group-show="${esc(g.key)}">Todas</button><button type="button" data-group-hide="${esc(g.key)}">Ninguna</button></div></div>${g.layers.map(layerCard).join('')}</section>`).join(''):'<div class="empty">Este proyecto todavía no tiene capas geográficas publicadas.</div>';
    document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectLayer(b.dataset.select));document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>zoomLayer(b.dataset.zoom));
    document.querySelectorAll('[data-toggle]').forEach(inp=>inp.onchange=()=>setLayerVisible(inp.dataset.toggle,inp.checked));
    document.querySelectorAll('[data-opacity]').forEach(inp=>inp.oninput=()=>{const x=state.layers.get(inp.dataset.opacity);if(!x)return;x.opacity=Number(inp.value)/100;inp.nextElementSibling.textContent=`${inp.value}%`;applyLayerStyle(x);renderMapLegend()});
    document.querySelectorAll('[data-sub-toggle]').forEach(inp=>inp.onchange=()=>toggleSubgroup(inp.dataset.subToggle,inp.dataset.subKey,inp.checked));
    document.querySelectorAll('[data-sub-all]').forEach(b=>b.onclick=()=>setAllSubgroups(b.dataset.subAll,true));document.querySelectorAll('[data-sub-none]').forEach(b=>b.onclick=()=>setAllSubgroups(b.dataset.subNone,false));
    document.querySelectorAll('[data-group-show]').forEach(b=>b.onclick=()=>setCollectionVisible(b.dataset.groupShow,true));document.querySelectorAll('[data-group-hide]').forEach(b=>b.onclick=()=>setCollectionVisible(b.dataset.groupHide,false));
    updateDataSelect();updateVisibleCount();
  }
  function setLayerVisible(id,on,rerender=true){const x=state.layers.get(id);if(!x)return;if(on){if(!map.hasLayer(x.leaflet))x.leaflet.addTo(map)}else if(map.hasLayer(x.leaflet))map.removeLayer(x.leaflet);if(rerender){renderLayerList();renderMapLegend()}}
  function setCollectionVisible(key,on){for(const x of state.layers.values()){const m=x.def.metadata||{},k=m.import_group_id?`g:${m.import_group_id}`:'standalone';if(k===key)setLayerVisible(x.def.id,on,false)}renderLayerList();renderMapLegend()}
  function setAllSubgroups(id,on){const x=state.layers.get(id);if(!x)return;x.disabledSubgroups.clear();if(!on)x.subgroups.forEach(g=>x.disabledSubgroups.add(g.key));syncSubgroups(x);afterSubgroupChange(x)}
  function toggleSubgroup(id,key,on){const x=state.layers.get(id);if(!x)return;on?x.disabledSubgroups.delete(key):x.disabledSubgroups.add(key);syncSubgroups(x);afterSubgroupChange(x)}
  function syncSubgroups(x){for(const child of x.children){const key=child.__sigmunGroup,should=!key||!x.disabledSubgroups.has(key),has=x.leaflet.hasLayer(child);if(should&&!has)x.leaflet.addLayer(child);else if(!should&&has)x.leaflet.removeLayer(child)}applyLayerStyle(x)}
  function afterSubgroupChange(x){if(state.selected===x.def.id)selectLayer(x.def.id,false);renderLayerList();renderMapLegend()}
  function applyLayerStyle(x){
    for(const child of x.children){
      if(child.__sigmunRaster){if(child.setOpacity)child.setOpacity((child.__sigmunRasterBaseOpacity??1)*x.opacity);continue}
      const f=child.__sigmunFeature;if(!f)continue;
      if(child.setStyle){
        const opt=f.geometry?.type==='Point'?SigmunTheme.leafletPointStyle(x.style,f,x.opacity):SigmunTheme.leafletPathStyle(x.style,f,x.opacity);
        child.setStyle(opt);if(f.geometry?.type==='Point'&&child.setRadius&&opt.radius)child.setRadius(opt.radius);
      }else if(child.setOpacity){
        child.setOpacity((child.__sigmunIconBaseOpacity??1)*x.opacity);
      }
    }
  }
  function updateVisibleCount(){const total=state.layers.size,visible=[...state.layers.values()].filter(x=>map.hasLayer(x.leaflet)).length;if($('visibleLayerCount'))$('visibleLayerCount').textContent=`${visible} de ${total} visibles`}
  $('showAllLayers').onclick=()=>{for(const x of state.layers.values()){x.disabledSubgroups.clear();syncSubgroups(x);setLayerVisible(x.def.id,true,false)}renderLayerList();renderMapLegend();fitAll()};
  $('hideAllLayers').onclick=()=>{for(const x of state.layers.values())setLayerVisible(x.def.id,false,false);renderLayerList();renderMapLegend()};
  function renderMapLegend(){
    const visible=[...state.layers.values()].filter(x=>map.hasLayer(x.leaflet)&&x.style.legend?.show!==false).sort((a,b)=>(a.def.sort_order||0)-(b.def.sort_order||0));
    if(!visible.length){$('mapLegend').innerHTML='';$('mapLegend').classList.remove('show');updateVisibleCount();return}
    const blocks=visible.map(x=>{
      const items=simplifiedLegendItems(x),field=meaningfulLegendField(x);
      if(!items.length)return'';
      if(items.length===1){const item=items[0];return`<div class="map-legend-compact">${legendSymbolHtml(x,item)}<span><strong>${esc(x.def.name)}</strong>${field?`<small>${esc(field)}</small>`:''}</span></div>`}
      return`<div class="map-legend-block"><strong>${esc(x.style.legend?.title||x.def.name)}</strong>${field?`<small>Clasificación · ${esc(field)}</small>`:''}<div>${items.slice(0,28).map(i=>`<span class="map-legend-item">${legendSymbolHtml(x,i)}${esc(i.label)}${i.count?` <em>${i.count.toLocaleString('es-MX')}</em>`:''}</span>`).join('')}${items.length>28?`<span class="map-legend-more">+${items.length-28} clases visibles</span>`:''}</div></div>`;
    }).join('');
    $('mapLegend').innerHTML=`<div class="map-legend-head"><b>Leyenda</b><span>${visible.length} capa${visible.length===1?'':'s'} visible${visible.length===1?'':'s'}</span></div>${blocks}`;
    $('mapLegend').classList.add('show');updateVisibleCount();
  }

  const PRINT_PAPERS={letter:{label:'Carta',w:216,h:279},a4:{label:'A4',w:210,h:297},oficio:{label:'Oficio',w:216,h:340},legal:{label:'Legal',w:216,h:356},tabloid:{label:'Tabloide',w:279,h:432},a3:{label:'A3',w:297,h:420}};
  let printSnapshot=null;
  function currentBaseName(){return({osm:'Calles · OpenStreetMap',satellite:'Satélite · Esri',terrain:'Relieve · OpenTopoMap'})[state.currentBase]||state.currentBase}
  function niceScaleRatio(raw){if(!Number.isFinite(raw)||raw<=0)return null;const e=Math.floor(Math.log10(raw)),n=raw/10**e,base=n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10;return Math.round(base*10**e)}
  function currentScaleRatio(){const c=map.getCenter(),z=map.getZoom(),mpp=156543.03392*Math.cos(c.lat*Math.PI/180)/(2**z);return niceScaleRatio(mpp*3779.527559)}
  function defaultPlanCode(){const slug=String(state.project?.slug||'mapa').split('-').filter(Boolean).map(x=>x[0]).join('').toUpperCase().slice(0,6)||'MAP';return`SIG-${slug}-${String(new Date().getFullYear()).slice(-2)}`}
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function currentPrintTitle(){return $('printTitleInput')?.value?.trim()||state.project?.name||'Visor geográfico'}
  function visibleProjectLayers(){return[...state.layers.values()].filter(x=>map.hasLayer(x.leaflet)&&x.style.legend?.show!==false).sort((a,b)=>(a.def.sort_order||0)-(b.def.sort_order||0))}
  function printableLegendEntries(x){
    const items=simplifiedLegendItems(x);
    if(!items.length)return[];
    const colors=new Set(items.map(legendColorKey));
    if(items.length===1||colors.size<=1)return[{...items[0],label:x.def.name}];
    return items.slice(0,12);
  }
  function printLegendHtml(){
    const visible=visibleProjectLayers(),groups=[];
    for(const x of visible){
      const items=printableLegendEntries(x);if(!items.length)continue;
      if(items.length===1){groups.push(`<div class="print-symbol-single">${legendSymbolHtml(x,items[0],'print-symbol')}<span>${esc(items[0].label||x.def.name)}</span></div>`);continue}
      const field=meaningfulLegendField(x);groups.push(`<div class="print-symbol-group"><b>${esc(x.def.name)}${field?` · ${esc(field)}`:''}</b><div>${items.map(i=>`<span>${legendSymbolHtml(x,i,'print-symbol')}${esc(i.label)}</span>`).join('')}${simplifiedLegendItems(x).length>items.length?`<em>+${simplifiedLegendItems(x).length-items.length} clases</em>`:''}</div></div>`)
    }
    return groups.slice(0,18).join('')+(groups.length>18?`<div class="print-symbol-single"><span>+${groups.length-18} capas visibles</span></div>`:'');
  }
  function preparePrintCartouche(){
    const title=currentPrintTitle(),code=$('printCodeInput')?.value?.trim()||defaultPlanCode(),ratio=currentScaleRatio(),visible=visibleProjectLayers();
    $('printTopicTitle').textContent=(state.project?.sigmun_topics?.name||'Información territorial').toUpperCase();
    $('printProjectTitle').textContent=title;
    $('printProjectDescription').textContent=state.project?.description||'Consulta cartográfica del Sistema de Información Geográfica y Estadística de Delicias.';
    $('printPlanCode').textContent=code;
    $('printLegendGrid').innerHTML=printLegendHtml();
    $('printBaseMap').textContent=currentBaseName();
    $('printLayerSummary').textContent=`${visible.length} de ${state.layers.size} capas`;
    $('printDate').textContent=new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'long',year:'numeric'}).format(new Date());
    $('printScaleText').textContent=ratio?`Escala aprox. 1:${ratio.toLocaleString('es-MX')}`:'Escala gráfica';
    $('printMapCaptionTitle').textContent=title;
    $('printMapCaptionSubtitle').textContent=(state.project?.sigmun_topics?.name||'Información territorial')+' · vista cartográfica actual';
  }
  function applyPrintPaper(){const key=$('printPaper')?.value||'letter',p=PRINT_PAPERS[key]||PRINT_PAPERS.letter,margin=6,style=document.getElementById('sigmunDynamicPrintStyle')||document.head.appendChild(Object.assign(document.createElement('style'),{id:'sigmunDynamicPrintStyle'}));style.textContent=`@page{size:${p.w}mm ${p.h}mm;margin:${margin}mm}@media print{:root{--print-page-width:${p.w-margin*2}mm;--print-page-height:${p.h-margin*2}mm}}`;return p}
  function openPrintDialog(){if(!state.project)return toast('Selecciona un proyecto antes de imprimir.',true);$('printTitleInput').value=state.project.name||'';$('printCodeInput').value=defaultPlanCode();const d=$('printDialog');if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','')}
  function elementOpacity(el,mapEl){let node=el,alpha=1;while(node&&node!==mapEl){const o=parseFloat(getComputedStyle(node).opacity||'1');if(Number.isFinite(o))alpha*=o;node=node.parentElement}return Math.max(0,Math.min(1,alpha||1))}
  async function drawSvgNode(ctx,svg,dx,dy,w,h,alpha){const xml=new XMLSerializer().serializeToString(svg),img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(xml)});ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(img,dx,dy,w,h);ctx.restore()}
  async function captureMapImage(){
    const mapEl=$('map'),rect=mapEl.getBoundingClientRect(),scale=Math.max(2,Math.min(3,window.devicePixelRatio||2));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(rect.width*scale));canvas.height=Math.max(1,Math.round(rect.height*scale));
    const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle='#ffffff';ctx.fillRect(0,0,rect.width,rect.height);
    const drawables=[...mapEl.querySelectorAll('.leaflet-pane canvas, .leaflet-pane img, .leaflet-pane svg')].filter(el=>{const r=el.getBoundingClientRect(),cs=getComputedStyle(el);return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden'&&parseFloat(cs.opacity||'1')>0});
    drawables.sort((a,b)=>{const az=parseInt(getComputedStyle(a.closest('.leaflet-pane')||a).zIndex||'0',10)||0,bz=parseInt(getComputedStyle(b.closest('.leaflet-pane')||b).zIndex||'0',10)||0;return az-bz});
    for(const el of drawables){
      const r=el.getBoundingClientRect(),dx=r.left-rect.left,dy=r.top-rect.top,alpha=elementOpacity(el,mapEl); if(r.width<=0||r.height<=0||alpha<=0)continue;
      try{
        if(el.tagName==='IMG'){
          if(el.complete&&el.naturalWidth){ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(el,dx,dy,r.width,r.height);ctx.restore()}
        }else if(el.tagName==='CANVAS'){
          ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(el,dx,dy,r.width,r.height);ctx.restore()
        }else if(el.tagName==='SVG')await drawSvgNode(ctx,el,dx,dy,r.width,r.height,alpha);
      }catch(err){console.warn('Elemento no exportado en impresión',err,el)}
    }
    return canvas.toDataURL('image/png');
  }
  async function preparePrintImage(){
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await sleep(220);
    const url=await captureMapImage();
    const img=$('printMapImage');
    await new Promise((resolve,reject)=>{img.onload=()=>resolve();img.onerror=reject;img.src=url});
    return url;
  }
  async function startPrint(){
    try{
      applyPrintPaper();preparePrintCartouche();printSnapshot={center:map.getCenter(),zoom:map.getZoom(),bounds:map.getBounds()};
      const d=$('printDialog');if(d?.open)d.close();
      document.body.classList.add('print-ready');
      await preparePrintImage();
      await sleep(120);
      window.print();
    }catch(e){console.error(e);document.body.classList.remove('print-ready');toast('No fue posible generar la captura del mapa para imprimir.',true)}
  }
  window.addEventListener('beforeprint',()=>{preparePrintCartouche();document.body.classList.add('print-ready')});
  window.addEventListener('afterprint',()=>{document.body.classList.remove('print-ready');if(printSnapshot){try{map.setView(printSnapshot.center,printSnapshot.zoom,{animate:false})}catch(e){}}printSnapshot=null});
  function selectLayer(id,rerender=true){state.selected=id;const x=state.layers.get(id),features=visibleFeatures(x);state.rows=features.map((f,i)=>({__fid:featureId(f,i),__geometry:f.geometry?.type,...Object.fromEntries(Object.entries(f.properties||{}).filter(([k])=>!k.startsWith('_kml_')))}));state.filtered=[...state.rows];if(rerender)renderLayerList();refreshData()}
  function updateDataSelect(){$('dataLayer').innerHTML=[...state.layers.values()].sort((a,b)=>(a.def.sort_order||0)-(b.def.sort_order||0)).map(x=>`<option value="${x.def.id}" ${x.def.id===state.selected?'selected':''}>${esc(x.def.name)}</option>`).join('');$('dataLayer').onchange=e=>selectLayer(e.target.value)}
  function refreshData(){renderTable();setupFilters();renderAnalysis()}
  function applyFilters(){const term=$('searchInput').value.toLowerCase(),f=$('filterField').value,v=$('filterValue').value;state.filtered=state.rows.filter(r=>(!term||Object.values(r).some(x=>String(x??'').toLowerCase().includes(term)))&&(!f||!v||String(r[f]??'')===v));renderTable();renderAnalysis(false)}
  function setupFilters(){const fields=state.rows.length?Object.keys(state.rows[0]).filter(f=>!f.startsWith('__')):[];$('filterField').innerHTML='<option value="">Campo</option>'+fields.map(f=>`<option>${esc(f)}</option>`).join('');$('filterField').onchange=()=>{const f=$('filterField').value,vals=[...new Set(state.rows.map(r=>String(r[f]??'')).filter(Boolean))].slice(0,300);$('filterValue').innerHTML='<option value="">Todos</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');applyFilters()};$('filterValue').onchange=applyFilters;$('searchInput').oninput=applyFilters}
  function renderTable(){if(!state.filtered.length){$('dataTable').innerHTML='<tbody><tr><td style="padding:15px">Sin registros.</td></tr></tbody>';return}const fields=Object.keys(state.filtered[0]).filter(f=>f!=='__fid').slice(0,18);$('dataTable').innerHTML=`<thead><tr>${fields.map(f=>`<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${state.filtered.slice(0,750).map(r=>`<tr>${fields.map(f=>`<td title="${esc(r[f])}">${esc(r[f])}</td>`).join('')}</tr>`).join('')}</tbody>`}
  function renderAnalysis(resetField=true){if(state.chart){state.chart.destroy();state.chart=null}const s=SigmunData.summarize(state.filtered);$('analysisKpis').innerHTML=`<div class="kpi"><span>Elementos</span><b>${s.count}</b></div><div class="kpi"><span>Campos</span><b>${s.fields.length}</b></div><div class="kpi"><span>Numéricos</span><b>${s.numeric.length}</b></div><div class="kpi"><span>Filtrados</span><b>${state.rows.length-state.filtered.length}</b></div>`;const fields=s.categorical.length?s.categorical:s.fields.slice(0,8);if(resetField)$('chartField').innerHTML=fields.map(f=>`<option>${esc(f)}</option>`).join('');const f=$('chartField').value||fields[0];if(f)drawChart(f)}
  function drawChart(f){if(state.chart)state.chart.destroy();const counts=SigmunData.counts(state.filtered,f),layer=state.layers.get(state.selected),style=layer?.style||SigmunTheme.normalizeStyle({}),legend=SigmunTheme.legendItems(style,visibleFeatures(layer));const colors=counts.map((x,i)=>{if(style.renderer==='categorized'&&style.field===f)return SigmunTheme.colorForValue(style,x[0]);if(style.renderer==='kml'){const hit=legend.find(l=>String(l.label).replace(/ · estilo \d+$/,'')===String(x[0]));if(hit)return hit.color}return SigmunTheme.colorAt(i,counts.length,'categorical')});state.chart=new Chart($('chart'),{type:'bar',data:{labels:counts.map(x=>x[0]),datasets:[{data:counts.map(x=>x[1]),backgroundColor:colors,borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:counts.length>8?'y':'x',plugins:{legend:{display:false}},scales:{x:{ticks:{font:{size:8}}},y:{ticks:{font:{size:8}}}}}})}
  $('chartField').onchange=e=>drawChart(e.target.value);
  function showRasterProps(ov,def){
    const rows=[['Tipo','Cobertura ráster KML/KMZ'],['Capa',def?.name||''],['Nombre',ov?.name||''],['Orden de dibujo',ov?.drawOrder??0],['Opacidad original',`${Math.round(SigmunTheme.clamp01(ov?.opacity??1)*100)}%`],['Norte',ov?.north],['Sur',ov?.south],['Este',ov?.east],['Oeste',ov?.west]];
    $('propertyBody').innerHTML=rows.filter(([,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>`<div class="prop"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    $('propertyDrawer').classList.add('open');
  }
  function showProps(f,def){
    const style=SigmunTheme.normalizeStyle(def?.style||{}),k=SigmunTheme.kmlResolvedStyle(style,f),isKml=SigmunTheme.isKmlRenderer(style),p=f.properties||{},classField=isKml?(style.kmlLegendField||SigmunTheme.inferKmlLegendField([f])):style.field;
    const classRow=classField&&p[classField]!==undefined?`<div class="prop thematic-prop"><span>Clasificación · ${esc(classField)}</span><b><i style="background:${isKml?(k.fillColor||k.lineColor):SigmunTheme.colorForFeature(style,f)}"></i>${esc(p[classField]??'Sin dato')}</b></div>`:'';
    const origin=isKml?`${classRow}<div class="prop thematic-prop"><span>Estilo de origen</span><b><i style="background:${k.fillColor||k.lineColor}"></i>${esc(p._kml_style||'Estilo KML')}</b></div>${p._kml_document?`<div class="prop"><span>Documento KML</span><b>${esc(p._kml_document)}</b></div>`:''}${(p._kml_folder_path||p._kml_folder)?`<div class="prop"><span>Carpeta / subcarpeta</span><b>${esc(p._kml_folder_path||p._kml_folder)}</b></div>`:''}`:classRow;
    const attrs=Object.entries(p).filter(([key])=>!key.startsWith('_kml_'));
    $('propertyBody').innerHTML=origin+(attrs.map(([key,v])=>`<div class="prop"><span>${esc(key)}</span><b>${esc(typeof v==='object'?JSON.stringify(v):v)}</b></div>`).join('')||'<div class="empty">Sin atributos.</div>');
    $('propertyDrawer').classList.add('open');
  }
  $('closeProps').onclick=()=>$('propertyDrawer').classList.remove('open');
  function zoomLayer(id){const b=state.layers.get(id)?.leaflet.getBounds();if(b?.isValid())map.fitBounds(b,{padding:[35,35],maxZoom:17})}
  function fitAll(){const list=[...state.layers.values()].filter(x=>map.hasLayer(x.leaflet));if(!list.length)return;const b=L.featureGroup(list.map(x=>x.leaflet)).getBounds();if(b?.isValid())map.fitBounds(b,{padding:[30,30],maxZoom:16})}

  document.querySelectorAll('.viewer-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.viewer-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view-pane').forEach(x=>x.classList.toggle('active',x.dataset.pane===b.dataset.tab))});
  document.querySelectorAll('.base-btn').forEach(b=>b.onclick=()=>{map.removeLayer(bases[state.currentBase]);state.currentBase=b.dataset.base;bases[state.currentBase].addTo(map);document.querySelectorAll('.base-btn').forEach(x=>x.classList.toggle('active',x===b))});
  $('panelBtn').onclick=()=>$('viewerPanel').classList.toggle('open');map.on('mousemove',e=>$('coords').textContent=`Lat: ${e.latlng.lat.toFixed(6)} | Lon: ${e.latlng.lng.toFixed(6)}`);
  $('homeBtn').onclick=()=>state.project?map.setView([state.project.center_lat||cfg.defaultCenter[0],state.project.center_lon||cfg.defaultCenter[1]],state.project.default_zoom||cfg.defaultZoom):map.setView(cfg.defaultCenter,cfg.defaultZoom);
  $('fullBtn').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();$('printBtn').onclick=openPrintDialog;$('confirmPrintBtn').onclick=startPrint;$('locateBtn').onclick=()=>map.locate({setView:true,maxZoom:17});map.on('locationerror',()=>toast('No fue posible obtener tu ubicación.',true));
  $('drawBtn').onclick=()=>{state.drawVisible=!state.drawVisible;if(state.drawVisible)map.addControl(state.drawControl);else map.removeControl(state.drawControl);$('drawBtn').classList.toggle('active',state.drawVisible)};$('measureBtn').onclick=()=>{state.measureMode=true;new L.Draw.Polyline(map,{shapeOptions:{color:'#0f4fa8',weight:3}}).enable();toast('Traza una línea para medir la distancia.')};
  $('exportBtn').onclick=()=>{const x=state.layers.get(state.selected);if(!x)return;const ids=new Set(state.filtered.map(r=>String(r.__fid))),gj={type:'FeatureCollection',features:visibleFeatures(x).filter((f,i)=>ids.has(featureId(f,i)))};SigmunData.download(`${(x.def.name||'capa').replace(/\s+/g,'_')}.geojson`,JSON.stringify(gj,null,2),'application/geo+json')};
  init();
})();
