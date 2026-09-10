(() => {
  'use strict';
  const $=id=>document.getElementById(id),cfg=SIGMUN_CONFIG;
  const state={topics:[],projects:[],project:null,defs:[],layers:new Map(),selected:null,rows:[],filtered:[],chart:null,currentBase:'osm',drawControl:null,drawVisible:false,measureMode:false,view3d:false,map3d:null,map3dReady:false,map3dLayerIds:new Map(),mapMvt:null,mapMvtReady:false,mvtLayerIds:new Map(),mvtSyncRaf:0};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let toastTimer;function toast(m,e=false){const x=$('toast');x.textContent=m;x.classList.toggle('error',e);x.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>x.classList.remove('show'),2800)}
  SigmunDB.registerMapLibreProtocols?.(window.maplibregl);
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
  function clearProjectLayers(){for(const x of state.layers.values()){if(state.map3dReady)remove3dLayer(x);if(state.mapMvtReady&&isTileEngine(x))removeMvtFromMaplibre(state.mapMvt,x,'sigmvt2d');if(map.hasLayer(x.leaflet))map.removeLayer(x.leaflet)}state.layers.clear();state.mvtLayerIds.clear();state.selected=null;state.rows=[];state.filtered=[];renderLayerList();refreshData();renderMapLegend()}
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
  function declaredFeatureCount(def){
    const m=def?.metadata||{},candidates=[m.feature_count,m.total_features,m.polygon_count,m.line_count,m.point_count];
    for(const v of candidates){const n=Number(v);if(Number.isFinite(n)&&n>0)return n}
    return 0;
  }
  function supportedTileGeometry(def){return ['Point','MultiLineString','MultiPolygon'].includes(String(def?.geometry_type||''))}
  function resolveRenderEngine(def){
    const m=def?.metadata||{},count=declaredFeatureCount(def),requested=String(m.render_strategy||'auto').toLowerCase(),pm=String(m.pmtiles_url||'').trim();
    if(pm)return'pmtiles';
    if(requested==='full')return'full';
    if(requested==='pmtiles')return supportedTileGeometry(def)?'mvt':'viewport';
    if(requested==='mvt')return supportedTileGeometry(def)?'mvt':'viewport';
    if(requested==='viewport'&&count<100000)return'viewport';
    if(supportedTileGeometry(def)&&(count>=100000||(/Line/i.test(def?.geometry_type||'')&&count>=15000)))return'mvt';
    if(count>=30000)return'viewport';
    return'full';
  }
  function isTileEngine(x){return x?.tileEngine==='mvt'||x?.tileEngine==='pmtiles'}
  function tileSourceLayer(x){return String(x?.def?.metadata?.pmtiles_source_layer||'sigmun')}
  function massiveStyleField(x){return x?.style?.field||x?.style?.threeD?.bandField||x?.def?.metadata?.three_d?.band_field||x?.def?.metadata?.three_d?.bandField||''}
  function massiveBandItems(x){
    const defs=x?.def?.metadata?.three_d?.definitions||[];
    if(Array.isArray(x?.style?.categories)&&x.style.categories.length)return x.style.categories.map(c=>({label:String(c.label??c.value),value:String(c.value),color:c.color||x.style.color||'#0f4fa8'}));
    if(Array.isArray(defs)&&defs.length)return defs.filter(d=>d?.label).map(d=>({label:String(d.label),value:String(d.label),color:d.color||'#2a9d8f'}));
    return[];
  }
  function massiveColorExpression(x){
    const items=massiveBandItems(x),field=massiveStyleField(x),fallback=x?.style?.color||'#0f4fa8';
    if(!items.length||!field)return fallback;
    const expr=['match',['to-string',['get',field]]];for(const i of items)expr.push(String(i.value),i.color);expr.push(fallback);return expr;
  }
  function massiveSubgroups(x){
    const field=massiveStyleField(x),items=massiveBandItems(x);if(!field||!items.length)return[];
    return items.map(i=>({key:`cat:${i.value}`,label:i.label,displayLabel:i.label,color:i.color,opacity:1,count:0,featureIds:new Set(),category:i.value,mode:{type:'field',field,label:field}}));
  }
  function massiveFilterExpression(x){
    const field=massiveStyleField(x);if(!field||!x?.disabledSubgroups?.size)return null;
    const allowed=massiveBandItems(x).filter(i=>!x.disabledSubgroups.has(`cat:${i.value}`)).map(i=>String(i.value));
    if(!allowed.length)return['==',1,0];
    return['in',['to-string',['get',field]],['literal',allowed]];
  }
  function tileSourceSpec(x){
    const minzoom=x.minZoom||massiveMinZoom(x.def),maxzoom=Math.max(minzoom,Math.min(20,Number(x.def?.metadata?.max_zoom)||20));
    if(x.tileEngine==='pmtiles')return{type:'vector',url:`pmtiles://${String(x.def.metadata.pmtiles_url||'').trim()}`,minzoom,maxzoom};
    return{type:'vector',tiles:[`sigmvt://${x.def.id}/{z}/{x}/{y}`],minzoom,maxzoom};
  }
  function mvtLayerNames(x,prefix='sigmvt2d'){
    const id=safe3dId(x.def.id);return{source:`${prefix}-src-${id}`,fill:`${prefix}-fill-${id}`,line:`${prefix}-line-${id}`,circle:`${prefix}-circle-${id}`};
  }
  function mvtOverlayStyle(){return{version:8,sources:{},layers:[{id:'sigmvt-transparent-bg',type:'background',paint:{'background-color':'rgba(0,0,0,0)'}}]}}
  function ensureMvtOverlay(){
    if(state.mapMvt)return state.mapMvt;if(!window.maplibregl)return null;SigmunDB.registerMapLibreProtocols?.(window.maplibregl);
    const c=map.getCenter();state.mapMvt=new maplibregl.Map({container:'mapMvtOverlay',style:mvtOverlayStyle(),center:[c.lng,c.lat],zoom:map.getZoom(),bearing:0,pitch:0,interactive:false,attributionControl:false,antialias:true,preserveDrawingBuffer:true});
    state.mapMvt.on('load',()=>{state.mapMvtReady=true;syncMvtOverlayAll();syncMvtOverlayCamera()});return state.mapMvt;
  }
  function syncMvtOverlayCamera(){
    if(!state.mapMvtReady||state.view3d)return;cancelAnimationFrame(state.mvtSyncRaf);state.mvtSyncRaf=requestAnimationFrame(()=>{const c=map.getCenter();state.mapMvt.jumpTo({center:[c.lng,c.lat],zoom:map.getZoom(),bearing:0,pitch:0});state.mapMvt.resize()});
  }
  function removeMvtFromMaplibre(target,x,prefix='sigmvt2d'){
    if(!target||!x)return;const n=mvtLayerNames(x,prefix);for(const id of [n.line,n.circle,n.fill])try{if(target.getLayer(id))target.removeLayer(id)}catch(_){}try{if(target.getSource(n.source))target.removeSource(n.source)}catch(_){}if(prefix==='sigmvt2d'){state.mvtLayerIds.delete(n.fill);state.mvtLayerIds.delete(n.line);state.mvtLayerIds.delete(n.circle)}else{state.map3dLayerIds.delete(n.fill);state.map3dLayerIds.delete(n.line);state.map3dLayerIds.delete(n.circle)}
  }
  function mvtLayerSpec(base,filter){
    // MapLibre GL v5 valida `filter` estrictamente: si la propiedad existe debe ser un array.
    // No enviar `filter: undefined`; omitir por completo la propiedad cuando no hay filtro activo.
    if(Array.isArray(filter))base.filter=filter;
    return base;
  }
  function addMvtToMaplibre(target,x,prefix='sigmvt2d',extrude=false){
    if(!target||!x||!isTileEngine(x)||!map.hasLayer(x.leaflet))return;const n=mvtLayerNames(x,prefix),sourceLayer=tileSourceLayer(x),opacity=Math.max(.05,Math.min(1,x.opacity??1)),color=massiveColorExpression(x),filter=massiveFilterExpression(x),type=String(x.def.geometry_type||'');
    if(!target.getSource(n.source))target.addSource(n.source,tileSourceSpec(x));
    if(/Polygon/i.test(type)){
      if(extrude){
        const st=x.style?.threeD||{},m3=x.def?.metadata?.three_d||{},hf=st.heightField||m3.height_field||'ALTURA_M',bf=st.baseHeightField||m3.base_height_field||'ALTURA_BASE_M';
        target.addLayer(mvtLayerSpec({id:n.fill,type:'fill-extrusion',source:n.source,'source-layer':sourceLayer,minzoom:x.minZoom||14,paint:{'fill-extrusion-color':color,'fill-extrusion-height':['to-number',['get',hf],3.2],'fill-extrusion-base':['to-number',['get',bf],0],'fill-extrusion-opacity':Math.max(.16,Math.min(.96,opacity*.88)),'fill-extrusion-vertical-gradient':true}},filter));
        target.addLayer(mvtLayerSpec({id:n.line,type:'line',source:n.source,'source-layer':sourceLayer,minzoom:x.minZoom||14,paint:{'line-color':'rgba(25,45,65,.34)','line-width':.65,'line-opacity':Math.max(.12,Math.min(.75,opacity*.45))}},filter));
      }else{
        target.addLayer(mvtLayerSpec({id:n.fill,type:'fill',source:n.source,'source-layer':sourceLayer,minzoom:x.minZoom||14,paint:{'fill-color':color,'fill-opacity':Math.max(.08,Math.min(.9,opacity*(x.style?.fillOpacity??.62)))}},filter));
        target.addLayer(mvtLayerSpec({id:n.line,type:'line',source:n.source,'source-layer':sourceLayer,minzoom:x.minZoom||14,paint:{'line-color':x.style?.outlineColor||'#36556f','line-width':Math.max(.35,Number(x.style?.weight)||.8),'line-opacity':Math.max(.08,Math.min(.9,opacity*(x.style?.opacity??.65)))}},filter));
      }
      (prefix==='sigmvt2d'?state.mvtLayerIds:state.map3dLayerIds).set(n.fill,x.def.id);(prefix==='sigmvt2d'?state.mvtLayerIds:state.map3dLayerIds).set(n.line,x.def.id);
    }else if(/Line/i.test(type)){
      target.addLayer(mvtLayerSpec({id:n.line,type:'line',source:n.source,'source-layer':sourceLayer,minzoom:x.minZoom||12,paint:{'line-color':color,'line-width':Math.max(.6,Number(x.style?.weight)||1.5),'line-opacity':opacity}},filter));(prefix==='sigmvt2d'?state.mvtLayerIds:state.map3dLayerIds).set(n.line,x.def.id);
    }else if(/Point/i.test(type)){
      target.addLayer(mvtLayerSpec({id:n.circle,type:'circle',source:n.source,'source-layer':sourceLayer,minzoom:x.minZoom||11,paint:{'circle-color':color,'circle-radius':Math.max(2,Number(x.style?.radius)||5),'circle-opacity':opacity,'circle-stroke-color':'#ffffff','circle-stroke-width':.6}},filter));(prefix==='sigmvt2d'?state.mvtLayerIds:state.map3dLayerIds).set(n.circle,x.def.id);
    }
  }
  function syncMvtOverlayLayer(x){if(!isTileEngine(x))return;const m=ensureMvtOverlay();if(!m||!state.mapMvtReady)return;removeMvtFromMaplibre(m,x,'sigmvt2d');if(map.hasLayer(x.leaflet))addMvtToMaplibre(m,x,'sigmvt2d',false)}
  function syncMvtOverlayAll(){if(!state.mapMvtReady)return;for(const x of state.layers.values())if(isTileEngine(x))syncMvtOverlayLayer(x)}
  async function handleMvt2dClick(e){
    if(!state.mapMvtReady||state.view3d||!state.mvtLayerIds.size)return;const p=state.mapMvt.project([e.latlng.lng,e.latlng.lat]),ids=[...state.mvtLayerIds.keys()].filter(id=>state.mapMvt.getLayer(id));if(!ids.length)return;const hit=state.mapMvt.queryRenderedFeatures(p,{layers:ids})[0];if(!hit)return;const layerId=state.mvtLayerIds.get(hit.layer.id),x=state.layers.get(layerId);if(!x)return;let props=hit.properties||{};const fid=props._sigmun_id||props.feature_id;try{if(fid){const full=await SigmunDB.geoFeatureProperties(layerId,fid);if(full)props=full}}catch(err){console.warn('Atributos MVT',err)}showProps({type:'Feature',properties:props,geometry:hit.geometry},x.def);selectLayer(x.def.id,false)
  }
  function massiveLayer(def){return declaredFeatureCount(def)>=30000&&def?.geometry_type!=='RasterOverlay'}
  function massiveMinZoom(def){
    const m=def?.metadata||{};
    const explicit=Number(m.mvt_min_zoom??def?.style?.threeD?.minZoom??m.min_zoom);
    if(Number.isFinite(explicit))return Math.max(10,Math.min(19,explicit));
    return /Polygon/i.test(def?.geometry_type||'')?14:13;
  }
  function massiveLabel(x){
    if(!x?.massive)return'';
    const total=declaredFeatureCount(x.def),loaded=(x.geojson?.features||[]).length,minz=x.minZoom||massiveMinZoom(x.def),engine=x.tileEngine||'viewport';
    if(engine==='mvt')return` · <span class="massive-engine-pill"><i class="bi bi-grid-3x3-gap"></i>MVT</span><span class="massive-engine-note"><strong>${total.toLocaleString('es-MX')}</strong> elementos · teselas vectoriales WebGL · zoom ${minz}+</span>`;
    if(engine==='pmtiles')return` · <span class="massive-engine-pill pmtiles"><i class="bi bi-box-seam"></i>PMTiles</span><span class="massive-engine-note"><strong>${total.toLocaleString('es-MX')}</strong> elementos · archivo teselado por rangos HTTP</span>`;
    if(map.getZoom()<minz)return` · <span class="massive-engine-pill viewport">Viewport</span> visible desde zoom ${minz}+`;
    return` · <span class="massive-engine-pill viewport">Viewport</span> ${loaded.toLocaleString('es-MX')} / ${total.toLocaleString('es-MX')}`;
  }
  async function loadDefs(){
    if(!state.defs.length){renderLayerList();renderMapLegend();return}
    const sorted=[...state.defs].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.name.localeCompare(b.name,'es'));
    for(let i=0;i<sorted.length;i++){
      const d=sorted[i];
      try{
        const engine=resolveRenderEngine(d),massive=engine!=='full',tileEngine=engine==='mvt'||engine==='pmtiles',shouldFullLoad=engine==='full'&&(d.geometry_type==='RasterOverlay'||d.is_visible!==false);
        const gj=shouldFullLoad&&d.geometry_type!=='RasterOverlay'?await SigmunDB.geojson(d.id,{geometryType:d.geometry_type,expectedTotal:declaredFeatureCount(d),onProgress:(done,total)=>{$('mapDesc').textContent=`Cargando ${d.name}: ${done.toLocaleString('es-MX')} / ${total.toLocaleString('es-MX')} elementos…`;}}):{type:'FeatureCollection',features:[]};
        const obj=makeLayer(d,gj,i);obj.loaded=shouldFullLoad||d.geometry_type==='RasterOverlay'||tileEngine;obj.index=i;obj.massive=massive;obj.tileEngine=tileEngine?engine:null;obj.viewportMode=engine==='viewport';obj.minZoom=massiveMinZoom(d);obj.featureTotal=declaredFeatureCount(d);obj.viewportToken=0;obj.loading=false;obj.truncated=false;
        if(tileEngine&&!obj.subgroups.length){obj.subgroups=massiveSubgroups(obj);obj.fidToGroup=new Map()}
        if(d.is_visible!==false)obj.leaflet.addTo(map);
        state.layers.set(d.id,obj);
      }catch(e){console.error('Capa',d.name,e);toast(`No fue posible cargar ${d.name}: ${e.message}`,true)}
    }
    $('mapDesc').textContent=state.project?.description||'';
    if([...state.layers.values()].some(isTileEngine)){ensureMvtOverlay();setTimeout(syncMvtOverlayAll,50)}
    renderLayerList();renderMapLegend();
    await refreshMassiveLayers(map.getBounds(),map.getZoom(),false);
    const first=sorted.find(d=>state.layers.get(d.id)?.loaded&&map.hasLayer(state.layers.get(d.id).leaflet))||sorted.find(d=>state.layers.has(d.id));
    if(first){selectLayer(first.id);fitAll()}
  }
  async function replaceViewportLayer(obj,gj,token){
    if(!obj||token!==obj.viewportToken)return obj;
    const wasVisible=map.hasLayer(obj.leaflet),wasSelected=state.selected===obj.def.id,oldDisabled=new Set(obj.disabledSubgroups||[]),oldOpacity=obj.opacity??1,index=obj.index||0;
    if(wasVisible)map.removeLayer(obj.leaflet);if(state.map3dReady)remove3dLayer(obj);
    const fresh=makeLayer(obj.def,gj,index);fresh.loaded=true;fresh.index=index;fresh.massive=true;fresh.viewportMode=true;fresh.minZoom=obj.minZoom;fresh.featureTotal=obj.featureTotal;fresh.viewportToken=token;fresh.loading=false;fresh.truncated=!!gj?._sigmun?.truncated;fresh.opacity=oldOpacity;fresh.disabledSubgroups=oldDisabled;
    syncSubgroups(fresh);applyLayerStyle(fresh);state.layers.set(obj.def.id,fresh);if(wasVisible)fresh.leaflet.addTo(map);if(state.map3dReady)sync3dLayer(fresh);if(wasSelected)selectLayer(fresh.def.id,false);return fresh;
  }
  async function refreshMassiveLayer(obj,bounds,zoom,force=false){
    if(!obj?.massive||!map.hasLayer(obj.leaflet)||isTileEngine(obj))return obj;
    const minz=obj.minZoom||massiveMinZoom(obj.def);
    if(!force&&Number(zoom)<minz){
      if((obj.geojson?.features||[]).length){obj.viewportToken=(obj.viewportToken||0)+1;await replaceViewportLayer(obj,{type:'FeatureCollection',features:[],_sigmun:{viewport:true,truncated:false}},obj.viewportToken)}
      $('mapDesc').textContent=`${state.project?.description||''} · ${obj.def.name}: acércate a zoom ${minz}+ para visualizar la capa masiva.`;
      return state.layers.get(obj.def.id)||obj;
    }
    if(obj.loading){obj.pendingViewport={bounds,zoom};return obj}
    obj.loading=true;const token=(obj.viewportToken||0)+1;obj.viewportToken=token;
    try{
      const polygon=/Polygon/i.test(obj.def.geometry_type||''),z=Number(zoom)||minz;
      const limit=polygon?(z<=14?900:z<=15?1300:1800):(z<=14?1200:1800);
      const simplify=polygon?(z<=14?.000008:z<=15?.000004:z<=16?.000002:0):(z<=14?.000006:0);
      const gj=await SigmunDB.geojsonViewport(obj.def.id,bounds,{limit,simplify,onProgress:(done,max)=>{$('mapDesc').textContent=`${obj.def.name}: ${done.toLocaleString('es-MX')} elementos visibles…`;}});
      const pending=obj.pendingViewport;obj.pendingViewport=null;const fresh=await replaceViewportLayer(obj,gj,token);
      $('mapDesc').textContent=fresh?.truncated?`${state.project?.description||''} · ${obj.def.name}: muestra optimizada del área visible; acércate para cargar todos los edificios.`:(state.project?.description||'');
      if(pending)setTimeout(()=>refreshMassiveLayer(fresh,pending.bounds,pending.zoom,false),80);return fresh;
    }catch(e){obj.loading=false;obj.pendingViewport=null;console.error('Viewport capa',obj.def.name,e);$('mapDesc').textContent=state.project?.description||'';toast(`No fue posible actualizar ${obj.def.name}: ${e.message}`,true);return obj}
  }
  async function refreshMassiveLayers(bounds=map.getBounds(),zoom=map.getZoom(),force=false){
    const arr=[...state.layers.values()].filter(x=>x.massive&&!isTileEngine(x)&&map.hasLayer(x.leaflet));
    for(const x of arr)await refreshMassiveLayer(state.layers.get(x.def.id)||x,bounds,zoom,force);
    renderLayerList();renderMapLegend();update3dBadge();
  }
  let massiveRefreshTimer=null;
  function scheduleMassiveRefresh(){clearTimeout(massiveRefreshTimer);massiveRefreshTimer=setTimeout(()=>{const use3d=state.view3d&&state.map3dReady&&state.map3d,b=use3d?state.map3d.getBounds():map.getBounds(),z=use3d?state.map3d.getZoom():map.getZoom();refreshMassiveLayers(b,z,false)},260)}
  async function activateMvtFallback(layerId,reason=''){
    const x=state.layers.get(layerId);if(!x||x.mvtFallback||x.tileEngine!=='mvt')return;
    x.mvtFallback=true;
    try{if(state.mapMvtReady)removeMvtFromMaplibre(state.mapMvt,x,'sigmvt2d')}catch(_){}
    try{if(state.map3dReady)removeMvtFromMaplibre(state.map3d,x,'sigmvt3d')}catch(_){}
    x.tileEngine=null;x.viewportMode=true;x.massive=true;x.minZoom=Math.max(15,massiveMinZoom(x.def));
    toast(`${x.def.name}: se activó el modo de respaldo por viewport para mantener la visualización.`,true);
    const b=state.view3d&&state.map3dReady?state.map3d.getBounds():map.getBounds(),z=state.view3d&&state.map3dReady?state.map3d.getZoom():map.getZoom();
    await refreshMassiveLayer(x,b,z,true);renderLayerList();renderMapLegend();update3dBadge();
    if(reason)console.warn('MVT → viewport fallback',x.def.name,reason);
  }
  window.addEventListener('sigmun:mvt-failed',e=>{const d=e.detail||{};activateMvtFallback(d.layerId,d.message||d.code||'timeout').catch(err=>console.warn('Fallback MVT',err))});
  async function ensureLayerLoaded(obj){
    if(!obj)return obj;
    if(isTileEngine(obj))return obj;
    if(obj.massive){await refreshMassiveLayer(obj,state.view3d&&state.map3dReady?state.map3d.getBounds():map.getBounds(),state.view3d&&state.map3dReady?state.map3d.getZoom():map.getZoom(),false);return state.layers.get(obj.def.id)||obj}
    if(obj.loaded)return obj;
    const d=obj.def,index=obj.index||0,oldOpacity=obj.opacity??1;
    $('mapDesc').textContent=`Cargando ${d.name}…`;
    const gj=await SigmunDB.geojson(d.id,{geometryType:d.geometry_type,expectedTotal:declaredFeatureCount(d),onProgress:(done,total)=>{$('mapDesc').textContent=`Cargando ${d.name}: ${done.toLocaleString('es-MX')} / ${total.toLocaleString('es-MX')} elementos…`;}});
    const fresh=makeLayer(d,gj,index);fresh.loaded=true;fresh.index=index;fresh.opacity=oldOpacity;fresh.featureTotal=declaredFeatureCount(d);applyLayerStyle(fresh);state.layers.set(d.id,fresh);$('mapDesc').textContent=state.project?.description||'';return fresh;
  }
  function rendererName(r,type=''){if(type==='RasterOverlay')return'Cobertura ráster';return r==='kml'?'Estilo KML original':r==='categorized'?'Categorías':r==='graduated'?'Rangos':'Símbolo único'}
  function rendererDetail(x){const s=x.style;if(isTileEngine(x)){const f=massiveStyleField(x),n=massiveBandItems(x).length;return`${x.tileEngine==='pmtiles'?'PMTiles':'MVT'}${f?` · ${f}`:''}${n?` · ${n} clases`:''}`}if(s.renderer==='kml'){const f=s.kmlLegendField||SigmunTheme.inferKmlLegendField(x.geojson.features||[]);return f?`${f} · ${x.subgroups.length} clases`:`${x.subgroups.length} estilos`}if(s.renderer==='categorized')return s.field?`${s.field} · ${x.subgroups.length||s.categories?.length||0} clases`:'';if(s.renderer==='graduated')return s.field?`${s.field} · ${s.classes?.length||0} rangos`:'';return''}
  function visibleFeatures(x){if(!x)return[];if(!x.disabledSubgroups.size)return x.geojson.features||[];return(x.geojson.features||[]).filter((f,i)=>{const key=x.fidToGroup?.get(featureId(f,i));return!key||!x.disabledSubgroups.has(key)})}
  function legendColorKey(item){return `${String(item?.color||'#64748b').toLowerCase()}|${Math.round(SigmunTheme.clamp01(item?.opacity??1)*100)}`}
  function isTechnicalLegendField(field=''){return /^(id|fid|gid|oid|objectid|way|shape|shape_leng|shape_area|length|lengthm|area|area_ha|dist|distance|draworder|zindex|sort|buf_|buvf_|num_|no_|index)/i.test(String(field).trim())||/_dist$/i.test(String(field).trim())}
  function isTechnicalLegendLabel(label=''){const s=String(label??'').trim();return !s||/^[-+]?\d+(?:[.,]\d+)?$/.test(s)||/^way\//i.test(s)||/^fid\b/i.test(s)||/^(gid|id|oid|objectid)$/i.test(s)}
  function meaningfulLegendField(x){
    if(isTileEngine(x))return massiveStyleField(x)||'';
    const s=x.style||{};let field='';
    if(s.renderer==='categorized'||s.renderer==='graduated')field=s.field||'';
    else if(s.renderer==='kml')field=s.kmlLegendField||SigmunTheme.inferKmlLegendField(x.geojson.features||[])||'';
    return field&&!isTechnicalLegendField(field)?field:'';
  }
  function simplifiedLegendItems(x){
    if(!x)return[];
    if(isTileEngine(x)){const items=massiveBandItems(x);if(items.length)return items.filter(i=>!x.disabledSubgroups?.has(`cat:${i.value}`)).map(i=>({label:i.label,color:i.color,opacity:1,value:i.value,count:0}));return[{label:x.def.name,color:x.style?.color||'#0f4fa8',opacity:1,count:declaredFeatureCount(x.def)}]}
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
    const active=map.hasLayer(x.leaflet),features=visibleFeatures(x),c=x.def.geometry_type==='RasterOverlay'?'#62b5e5':SigmunTheme.colorForFeature(x.style,features[0]||x.geojson.features?.[0]||{}),detail=rendererDetail(x),total=x.featureTotal||declaredFeatureCount(x.def)||((x.geojson.features||[]).length+(x.overlayCount||0)),loadedCount=features.length+(x.overlayCount||0),massiveInfo=massiveLabel(x);
    return`<div class="layer-item ${x.def.id===state.selected?'selected':''}" data-layer-card="${x.def.id}"><div class="layer-row"><label class="layer-check" title="Mostrar/ocultar capa"><input type="checkbox" data-toggle="${x.def.id}" ${active?'checked':''}><span></span></label><span class="dot" style="background:${c}"></span><button class="layer-name" data-select="${x.def.id}">${esc(x.def.name)}</button><div class="layer-tools"><button class="mini-icon" data-zoom="${x.def.id}" title="Acercar"><i class="bi bi-search"></i></button></div></div><div class="layer-meta"><b>${esc(rendererName(x.style.renderer,x.def.geometry_type))}</b>${detail?` · ${esc(detail)}`:''}${(x.style?.threeD?.enabled||x.def?.metadata?.three_d?.enabled)?'<span class="three-d-layer-pill"><i class="bi bi-buildings"></i>3D</span>':''}${x.loaded?'':' · carga diferida'}${massiveInfo} · ${loadedCount.toLocaleString('es-MX')} / ${total.toLocaleString('es-MX')} elementos</div><div class="layer-opacity-row"><span>Opacidad</span><input type="range" data-opacity="${x.def.id}" min="0" max="100" value="${Math.round(x.opacity*100)}" aria-label="Opacidad de ${esc(x.def.name)}"><b>${Math.round(x.opacity*100)}%</b></div>${subgroupRows(x)}${miniLegend(x)}</div>`;
  }
  function renderLayerList(){
    const arr=[...state.layers.values()].sort((a,b)=>(a.def.sort_order||0)-(b.def.sort_order||0)),groups=collectionGroups(arr);$('layerList').innerHTML=arr.length?groups.map(g=>`<section class="viewer-layer-group"><div class="viewer-layer-group-head"><div><i class="bi bi-collection"></i><b>${esc(g.title)}</b><span>${g.layers.length} capa${g.layers.length===1?'':'s'}</span></div><div><button type="button" data-group-show="${esc(g.key)}">Todas</button><button type="button" data-group-hide="${esc(g.key)}">Ninguna</button></div></div>${g.layers.map(layerCard).join('')}</section>`).join(''):'<div class="empty">Este proyecto todavía no tiene capas geográficas publicadas.</div>';
    document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>selectLayer(b.dataset.select));document.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>zoomLayer(b.dataset.zoom));
    document.querySelectorAll('[data-toggle]').forEach(inp=>inp.onchange=()=>setLayerVisible(inp.dataset.toggle,inp.checked));
    document.querySelectorAll('[data-opacity]').forEach(inp=>inp.oninput=()=>{const x=state.layers.get(inp.dataset.opacity);if(!x)return;x.opacity=Number(inp.value)/100;inp.nextElementSibling.textContent=`${inp.value}%`;applyLayerStyle(x);if(state.map3dReady)sync3dLayer(x);renderMapLegend()});
    document.querySelectorAll('[data-sub-toggle]').forEach(inp=>inp.onchange=()=>toggleSubgroup(inp.dataset.subToggle,inp.dataset.subKey,inp.checked));
    document.querySelectorAll('[data-sub-all]').forEach(b=>b.onclick=()=>setAllSubgroups(b.dataset.subAll,true));document.querySelectorAll('[data-sub-none]').forEach(b=>b.onclick=()=>setAllSubgroups(b.dataset.subNone,false));
    document.querySelectorAll('[data-group-show]').forEach(b=>b.onclick=()=>setCollectionVisible(b.dataset.groupShow,true));document.querySelectorAll('[data-group-hide]').forEach(b=>b.onclick=()=>setCollectionVisible(b.dataset.groupHide,false));
    updateDataSelect();updateVisibleCount();
  }
  async function setLayerVisible(id,on,rerender=true){let x=state.layers.get(id);if(!x)return;if(on){try{if(!map.hasLayer(x.leaflet))x.leaflet.addTo(map);if(isTileEngine(x)){syncMvtOverlayLayer(x)}else if(x.massive){if(map.getZoom()>=x.minZoom)x=await refreshMassiveLayer(x,map.getBounds(),map.getZoom(),false);else toast(`${x.def.name}: acércate a zoom ${x.minZoom}+ para cargar los elementos.`)}else{x=await ensureLayerLoaded(x);if(!map.hasLayer(x.leaflet))x.leaflet.addTo(map)}}catch(e){toast(`No fue posible activar ${x.def.name}: ${e.message}`,true);return}}else{if(map.hasLayer(x.leaflet))map.removeLayer(x.leaflet);if(isTileEngine(x)&&state.mapMvtReady)syncMvtOverlayLayer(x)}if(state.map3dReady)sync3dLayer(x);if(rerender){renderLayerList();renderMapLegend()}}
  async function setCollectionVisible(key,on){const targets=[...state.layers.values()].filter(x=>{const m=x.def.metadata||{},k=m.import_group_id?`g:${m.import_group_id}`:'standalone';return k===key});for(const x of targets)await setLayerVisible(x.def.id,on,false);renderLayerList();renderMapLegend()}
  function setAllSubgroups(id,on){const x=state.layers.get(id);if(!x)return;x.disabledSubgroups.clear();if(!on)x.subgroups.forEach(g=>x.disabledSubgroups.add(g.key));syncSubgroups(x);afterSubgroupChange(x)}
  function toggleSubgroup(id,key,on){const x=state.layers.get(id);if(!x)return;on?x.disabledSubgroups.delete(key):x.disabledSubgroups.add(key);syncSubgroups(x);afterSubgroupChange(x)}
  function syncSubgroups(x){if(isTileEngine(x)){syncMvtOverlayLayer(x);if(state.map3dReady)sync3dLayer(x);return}for(const child of x.children){const key=child.__sigmunGroup,should=!key||!x.disabledSubgroups.has(key),has=x.leaflet.hasLayer(child);if(should&&!has)x.leaflet.addLayer(child);else if(!should&&has)x.leaflet.removeLayer(child)}applyLayerStyle(x)}
  function afterSubgroupChange(x){if(state.selected===x.def.id)selectLayer(x.def.id,false);if(state.map3dReady)sync3dLayer(x);renderLayerList();renderMapLegend()}
  function applyLayerStyle(x){
    if(isTileEngine(x)){syncMvtOverlayLayer(x);if(state.map3dReady)sync3dLayer(x);return}
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
  $('showAllLayers').onclick=async()=>{for(const x0 of [...state.layers.values()]){x0.disabledSubgroups.clear();syncSubgroups(x0);await setLayerVisible(x0.def.id,true,false)}renderLayerList();renderMapLegend();fitAll()};
  $('hideAllLayers').onclick=async()=>{for(const x of state.layers.values())await setLayerVisible(x.def.id,false,false);renderLayerList();renderMapLegend()};
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


  function safe3dId(id){return String(id||'layer').replace(/[^a-z0-9_-]/gi,'').slice(0,32)}
  function feature3dHeight(f,x){const p=f?.properties||{},st=x?.style?.threeD||{},keys=[st.heightField,'ALTURA_M','height_m','altura_m','height','altura','_sigmun_height_m'].filter(Boolean);for(const k of keys){const n=Number(p[k]);if(Number.isFinite(n)&&n>0)return Math.max(2.4,Math.min(250,n))}return null}
  function feature3dBase(f,x){const p=f?.properties||{},st=x?.style?.threeD||{},keys=[st.baseHeightField,'ALTURA_BASE_M','base_height_m','min_height','_sigmun_base_height_m'].filter(Boolean);for(const k of keys){const n=Number(p[k]);if(Number.isFinite(n)&&n>=0)return Math.max(0,Math.min(240,n))}return 0}
  function threeDCompatible(x){if(isTileEngine(x))return /Polygon/i.test(x?.def?.geometry_type||'')&&!!(x?.style?.threeD?.enabled||x?.def?.metadata?.three_d?.enabled);return !!x?.loaded&&(x.geojson?.features||[]).some(f=>/Polygon/i.test(f.geometry?.type||'')&&feature3dHeight(f,x)!==null)}
  function map3dStyle(){return{version:8,sources:{osm:{type:'raster',tiles:['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png','https://b.tile.openstreetmap.org/{z}/{x}/{y}.png','https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap'},satellite:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'© Esri'},terrain:{type:'raster',tiles:['https://a.tile.opentopomap.org/{z}/{x}/{y}.png','https://b.tile.opentopomap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenTopoMap'}},layers:[{id:'base-osm',type:'raster',source:'osm',layout:{visibility:state.currentBase==='osm'?'visible':'none'}},{id:'base-satellite',type:'raster',source:'satellite',layout:{visibility:state.currentBase==='satellite'?'visible':'none'}},{id:'base-terrain',type:'raster',source:'terrain',layout:{visibility:state.currentBase==='terrain'?'visible':'none'}}]}}
  function update3dBasemap(){if(!state.map3dReady)return;for(const key of ['osm','satellite','terrain']){const id=`base-${key}`;if(state.map3d.getLayer(id))state.map3d.setLayoutProperty(id,'visibility',state.currentBase===key?'visible':'none')}}
  function threeDFeatureCollection(x){const features=visibleFeatures(x).filter(f=>/Polygon/i.test(f.geometry?.type||'')).map((f,i)=>{const h=feature3dHeight(f,x);if(h===null)return null;const p={...(f.properties||{})},color=p._sigmun_height_color||SigmunTheme.colorForFeature(x.style,f)||'#2a9d8f';p._sigmun_height_m=h;p._sigmun_base_height_m=feature3dBase(f,x);p._sigmun_color=color;p._sigmun_layer=x.def.name;p._sigmun_layer_id=x.def.id;return{type:'Feature',id:f.id??i,geometry:f.geometry,properties:p}}).filter(Boolean);return{type:'FeatureCollection',features}}
  function remove3dLayer(x){if(!state.map3dReady||!x)return;if(isTileEngine(x)){removeMvtFromMaplibre(state.map3d,x,'sigmvt3d');return}const sid=`sig3d-src-${safe3dId(x.def.id)}`,fill=`sig3d-fill-${safe3dId(x.def.id)}`,line=`sig3d-line-${safe3dId(x.def.id)}`;try{if(state.map3d.getLayer(line))state.map3d.removeLayer(line);if(state.map3d.getLayer(fill))state.map3d.removeLayer(fill);if(state.map3d.getSource(sid))state.map3d.removeSource(sid)}catch(e){}state.map3dLayerIds.delete(fill)}
  function sync3dLayer(x){
    if(!state.map3dReady||!x)return;remove3dLayer(x);if(!map.hasLayer(x.leaflet)||!threeDCompatible(x))return;
    if(isTileEngine(x)){addMvtToMaplibre(state.map3d,x,'sigmvt3d',true);return}
    const data=threeDFeatureCollection(x);if(!data.features.length)return;const sid=`sig3d-src-${safe3dId(x.def.id)}`,fill=`sig3d-fill-${safe3dId(x.def.id)}`,line=`sig3d-line-${safe3dId(x.def.id)}`;state.map3d.addSource(sid,{type:'geojson',data,generateId:true});state.map3d.addLayer({id:fill,type:'fill-extrusion',source:sid,minzoom:11.5,paint:{'fill-extrusion-color':['get','_sigmun_color'],'fill-extrusion-height':['get','_sigmun_height_m'],'fill-extrusion-base':['get','_sigmun_base_height_m'],'fill-extrusion-opacity':Math.max(.16,Math.min(.96,(x.opacity??1)*.88)),'fill-extrusion-vertical-gradient':true}});state.map3d.addLayer({id:line,type:'line',source:sid,minzoom:11.5,paint:{'line-color':'rgba(25,45,65,.34)','line-width':.65,'line-opacity':Math.max(.12,Math.min(.8,(x.opacity??1)*.45))}});state.map3dLayerIds.set(fill,x.def.id)
  }
  function update3dBadge(){if(!$('map3dBadge'))return;let count=0,min=Infinity,max=0,tiled=0;for(const x of state.layers.values()){if(!map.hasLayer(x.leaflet)||!threeDCompatible(x))continue;if(isTileEngine(x)){tiled++;continue}for(const f of visibleFeatures(x)){const h=feature3dHeight(f,x);if(h!==null){count++;min=Math.min(min,h);max=Math.max(max,h)}}}const small=$('map3dBadge').querySelector('small');if(small)small.textContent=tiled?`${tiled} capa${tiled===1?'':'s'} MVT/PMTiles · 3D por teselas`:count?`${count.toLocaleString('es-MX')} edificios · ${min.toFixed(1)}–${max.toFixed(1)} m`:'Sin edificios 3D visibles'}
  function sync3dAll(){if(!state.map3dReady)return;for(const x of state.layers.values())sync3dLayer(x);update3dBasemap();update3dBadge()}
  function ensure3dMap(){if(state.map3d)return state.map3d;if(!window.maplibregl){toast('No fue posible cargar el motor WebGL 3D.',true);return null}const c=map.getCenter();state.map3d=new maplibregl.Map({container:'map3d',style:map3dStyle(),center:[c.lng,c.lat],zoom:map.getZoom(),pitch:56,bearing:-18,antialias:true,preserveDrawingBuffer:true,attributionControl:false});state.map3d.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-left');state.map3d.addControl(new maplibregl.ScaleControl({maxWidth:120,unit:'metric'}),'bottom-left');state.map3d.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');state.map3d.on('load',()=>{state.map3dReady=true;sync3dAll();scheduleMassiveRefresh()});state.map3d.on('moveend',scheduleMassiveRefresh);state.map3d.on('click',async e=>{const layerIds=[...state.map3dLayerIds.keys()].filter(id=>state.map3d.getLayer(id));if(!layerIds.length)return;const hit=state.map3d.queryRenderedFeatures(e.point,{layers:layerIds})[0];if(!hit)return;const layerId=state.map3dLayerIds.get(hit.layer.id),x=state.layers.get(layerId);let p=hit.properties||{};const fid=p._sigmun_id||p.feature_id;try{if(fid){const full=await SigmunDB.geoFeatureProperties(layerId,fid);if(full)p=full}}catch(err){console.warn('Atributos MVT 3D',err)}const st=x?.style?.threeD||{},hf=st.heightField||x?.def?.metadata?.three_d?.height_field||'ALTURA_M',h=Number(p[hf]??p.ALTURA_M??p._sigmun_height_m)||0,band=p.RANGO_ALTURA||p._sigmun_height_band||'Edificio';new maplibregl.Popup({closeButton:true,maxWidth:'300px'}).setLngLat(e.lngLat).setHTML(`<div class="sigmun-3d-popup"><b>${esc(p.name||p.nombre||x?.def?.name||'Edificio')}</b><span><strong>${h.toFixed(1)} m</strong> · ${esc(band)}</span><span>${p.NIVELES_EST?`${esc(p.NIVELES_EST)} nivel${Number(p.NIVELES_EST)===1?'':'es'} · `:''}${p.AREA_M2?`${Number(p.AREA_M2).toLocaleString('es-MX',{maximumFractionDigits:0})} m² de huella`:''}</span>${p.RANGO_SUPERFICIE?`<span>${esc(p.RANGO_SUPERFICIE)}</span>`:''}${p.CONFIANZA_ALTURA?`<span>Altura ${p.ALTURA_ESTIMADA==='Sí'?'estimada':'de fuente'} · confianza ${esc(p.CONFIANZA_ALTURA)}</span>`:''}</div>`).addTo(state.map3d);if(x)showProps({type:'Feature',properties:p,geometry:hit.geometry},x.def)});state.map3d.on('mouseenter',e=>{const ids=[...state.map3dLayerIds.keys()].filter(id=>state.map3d.getLayer(id));if(ids.length&&state.map3d.queryRenderedFeatures(e.point,{layers:ids}).length)state.map3d.getCanvas().style.cursor='pointer'});state.map3d.on('mouseleave',()=>{state.map3d.getCanvas().style.cursor=''});return state.map3d}
  async function toggle3d(){if(!state.view3d){state.view3d=true;$('map')?.closest('.map-wrap')?.classList.add('mode-3d');const m=ensure3dMap();if(!m){state.view3d=false;$('map')?.closest('.map-wrap')?.classList.remove('mode-3d');return}setTimeout(()=>{m.resize();const c=map.getCenter(),massive3d=[...state.layers.values()].filter(x=>x.massive&&map.hasLayer(x.leaflet)&&(x.style?.threeD?.enabled||x.def?.metadata?.three_d?.enabled)),targetZoom=massive3d.length?Math.max(map.getZoom(),...massive3d.map(x=>x.minZoom||14)):map.getZoom();m.jumpTo({center:[c.lng,c.lat],zoom:targetZoom,pitch:56,bearing:-18});sync3dAll();scheduleMassiveRefresh();if(![...state.layers.values()].some(x=>map.hasLayer(x.leaflet)&&threeDCompatible(x))&&!massive3d.length)toast('Vista 3D activa. Enciende una capa poligonal con ALTURA_M para extruir edificios.')},60)}else{state.view3d=false;const c=state.map3d?.getCenter();if(c)map.setView([c.lat,c.lng],state.map3d.getZoom(),{animate:false});$('map')?.closest('.map-wrap')?.classList.remove('mode-3d');setTimeout(()=>{map.invalidateSize({animate:false});syncMvtOverlayCamera();syncMvtOverlayAll()},40)}}

  const PRINT_PAPERS={letter:{label:'Carta',w:216,h:279},a4:{label:'A4',w:210,h:297},oficio:{label:'Oficio',w:216,h:340},legal:{label:'Legal',w:216,h:356},tabloid:{label:'Tabloide',w:279,h:432},a3:{label:'A3',w:297,h:420}};
  let printSnapshot=null;
  function currentBaseName(){return({osm:'Calles · OpenStreetMap',satellite:'Satélite · Esri',terrain:'Relieve · OpenTopoMap'})[state.currentBase]||state.currentBase}
  function niceScaleRatio(raw){if(!Number.isFinite(raw)||raw<=0)return null;const e=Math.floor(Math.log10(raw)),n=raw/10**e,base=n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10;return Math.round(base*10**e)}
  function currentScaleRatio(){const c=state.view3d&&state.map3d?state.map3d.getCenter():map.getCenter(),z=state.view3d&&state.map3d?state.map3d.getZoom():map.getZoom(),mpp=156543.03392*Math.cos(c.lat*Math.PI/180)/(2**z);return niceScaleRatio(mpp*3779.527559)}
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
    if(state.view3d&&state.map3dReady&&state.map3d){try{return state.map3d.getCanvas().toDataURL('image/png')}catch(e){console.warn('Captura 3D',e)}}
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
    if(state.mapMvtReady&&state.mapMvt&&!state.view3d){try{const gl=state.mapMvt.getCanvas();if(gl?.width&&gl?.height){ctx.save();ctx.globalAlpha=1;ctx.drawImage(gl,0,0,rect.width,rect.height);ctx.restore()}}catch(e){console.warn('Captura MVT 2D',e)}}
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
  async function selectLayer(id,rerender=true){state.selected=id;let x=state.layers.get(id);if(!x)return;try{x=await ensureLayerLoaded(x)}catch(e){toast(`No fue posible consultar ${x.def.name}: ${e.message}`,true);return}let features=visibleFeatures(x);if(isTileEngine(x)&&!features.length&&map.getZoom()>=(x.minZoom||14)){try{const sample=await SigmunDB.geojsonViewport(x.def.id,map.getBounds(),{limit:300,simplify:.000004});features=sample.features||[]}catch(e){console.warn('Muestra analítica MVT',e)}}state.rows=features.map((f,i)=>({__fid:featureId(f,i),__geometry:f.geometry?.type,...Object.fromEntries(Object.entries(f.properties||{}).filter(([k])=>!k.startsWith('_kml_')))}));state.filtered=[...state.rows];if(rerender)renderLayerList();refreshData()}
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
  async function zoomLayer(id){let x=state.layers.get(id);if(!x)return;if(x.massive&&map.getZoom()<x.minZoom){const c=state.project?[state.project.center_lat||cfg.defaultCenter[0],state.project.center_lon||cfg.defaultCenter[1]]:cfg.defaultCenter;map.setView(c,x.minZoom,{animate:true});return}try{x=await ensureLayerLoaded(x)}catch(e){toast(e.message,true);return}const b=x.leaflet.getBounds();if(b?.isValid())map.fitBounds(b,{padding:[35,35],maxZoom:17})}
  function fitAll(){const list=[...state.layers.values()].filter(x=>map.hasLayer(x.leaflet));if(!list.length)return;const b=L.featureGroup(list.map(x=>x.leaflet)).getBounds();if(!b?.isValid())return;if(state.view3d&&state.map3d)state.map3d.fitBounds([[b.getWest(),b.getSouth()],[b.getEast(),b.getNorth()]],{padding:45,maxZoom:16,pitch:56,bearing:-18});else map.fitBounds(b,{padding:[30,30],maxZoom:16})}

  document.querySelectorAll('.viewer-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.viewer-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.view-pane').forEach(x=>x.classList.toggle('active',x.dataset.pane===b.dataset.tab))});
  document.querySelectorAll('.base-btn').forEach(b=>b.onclick=()=>{map.removeLayer(bases[state.currentBase]);state.currentBase=b.dataset.base;bases[state.currentBase].addTo(map);update3dBasemap();document.querySelectorAll('.base-btn').forEach(x=>x.classList.toggle('active',x===b))});
  $('panelBtn').onclick=()=>$('viewerPanel').classList.toggle('open');map.on('mousemove',e=>$('coords').textContent=`Lat: ${e.latlng.lat.toFixed(6)} | Lon: ${e.latlng.lng.toFixed(6)}`);map.on('move zoom resize',()=>{if(!state.view3d)syncMvtOverlayCamera()});map.on('moveend zoomend',()=>{if(!state.view3d){scheduleMassiveRefresh();syncMvtOverlayCamera()}});map.on('click',handleMvt2dClick);
  $('homeBtn').onclick=()=>{const c=state.project?[state.project.center_lon||cfg.defaultCenter[1],state.project.center_lat||cfg.defaultCenter[0]]:[cfg.defaultCenter[1],cfg.defaultCenter[0]],z=state.project?.default_zoom||cfg.defaultZoom;if(state.view3d&&state.map3d)state.map3d.flyTo({center:c,zoom:z,pitch:56,bearing:-18});else map.setView([c[1],c[0]],z)};
  $('fullBtn').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();$('view3dBtn').onclick=toggle3d;$('printBtn').onclick=openPrintDialog;$('confirmPrintBtn').onclick=startPrint;$('locateBtn').onclick=()=>map.locate({setView:true,maxZoom:17});map.on('locationerror',()=>toast('No fue posible obtener tu ubicación.',true));
  $('drawBtn').onclick=()=>{state.drawVisible=!state.drawVisible;if(state.drawVisible)map.addControl(state.drawControl);else map.removeControl(state.drawControl);$('drawBtn').classList.toggle('active',state.drawVisible)};$('measureBtn').onclick=()=>{state.measureMode=true;new L.Draw.Polyline(map,{shapeOptions:{color:'#0f4fa8',weight:3}}).enable();toast('Traza una línea para medir la distancia.')};
  $('exportBtn').onclick=async()=>{const x=state.layers.get(state.selected);if(!x)return;let features=visibleFeatures(x);if(isTileEngine(x)){try{const sample=await SigmunDB.geojsonViewport(x.def.id,map.getBounds(),{limit:1800,simplify:0});features=sample.features||[];if(sample._sigmun?.truncated)toast('Exportación limitada al área visible. Acércate para exportar una zona más específica.')}catch(e){toast(`No fue posible exportar: ${e.message}`,true);return}}const ids=new Set(state.filtered.map(r=>String(r.__fid))),filtered=ids.size?features.filter((f,i)=>ids.has(featureId(f,i))):features,gj={type:'FeatureCollection',features:filtered};SigmunData.download(`${(x.def.name||'capa').replace(/\s+/g,'_')}.geojson`,JSON.stringify(gj,null,2),'application/geo+json')};
  init();
})();
