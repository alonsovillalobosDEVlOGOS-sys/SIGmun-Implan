(() => {
  'use strict';
  const cfg = window.SIGMUN_CONFIG;
  if (!window.supabase || !cfg) throw new Error('Supabase o configuración no disponible.');

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const chunk = (arr,size=250)=>Array.from({length:Math.ceil(arr.length/size)},(_,i)=>arr.slice(i*size,(i+1)*size));
  const clean = v => String(v ?? '').trim();
  const slugify = s => clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');

  async function topics(){ const {data,error}=await client.from('sigmun_topics').select('*').order('sort_order').order('name'); if(error)throw error; return data||[]; }
  async function projects(topicId){ let q=client.from('sigmun_projects').select('*,sigmun_topics(name,slug)').order('sort_order').order('name'); if(topicId) q=q.eq('topic_id',topicId); const {data,error}=await q; if(error)throw error; return data||[]; }
  async function projectBySlug(slug){ const {data,error}=await client.from('sigmun_projects').select('*,sigmun_topics(name,slug)').eq('slug',slug).maybeSingle(); if(error)throw error; return data; }
  async function geoLayers(projectId){ let q=client.from('sigmun_geo_layers').select('*').order('sort_order').order('name'); if(projectId)q=q.eq('project_id',projectId); const {data,error}=await q; if(error)throw error; return data||[]; }
  async function statLayers(projectId){ let q=client.from('sigmun_stat_layers').select('*').order('sort_order').order('name'); if(projectId)q=q.eq('project_id',projectId); const {data,error}=await q; if(error)throw error; return data||[]; }
  async function geojson(layerId){ const {data,error}=await client.rpc('sigmun_geo_layer_geojson',{p_layer_id:layerId}); if(error)throw error; return data||{type:'FeatureCollection',features:[]}; }
  async function statRecords(layerId){ const {data,error}=await client.from('sigmun_stat_records').select('id,record_order,attributes').eq('layer_id',layerId).order('record_order').range(0,9999); if(error)throw error; return (data||[]).map(r=>({__id:r.id,...(r.attributes||{})})); }

  async function session(){ const {data,error}=await client.auth.getSession(); if(error)throw error; return data.session; }
  async function signIn(email,password){ const {data,error}=await client.auth.signInWithPassword({email,password}); if(error)throw error; return data; }
  async function signUp(email,password,metadata={}){ const {data,error}=await client.auth.signUp({email,password,options:{data:metadata}}); if(error)throw error; return data; }
  async function signOut(){ const {error}=await client.auth.signOut(); if(error)throw error; }
  async function adminStatus(){ const {data,error}=await client.from('sigmun_access_status').select('has_admin,updated_at').eq('id',1).single(); if(error)throw error; return data; }
  async function myProfile(){ const s=await session(); if(!s?.user) return null; const {data,error}=await client.from('sigmun_user_profiles').select('id,email,full_name,department,role,is_active,last_login_at,created_at').eq('id',s.user.id).maybeSingle(); if(error)throw error; return data; }
  async function bootstrapAdmin(payload){
    const res=await fetch(`${cfg.supabaseUrl}/functions/v1/sigmun-bootstrap-admin`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabaseKey},body:JSON.stringify(payload||{})});
    const body=await res.json().catch(()=>({})); if(!res.ok)throw new Error(body.error||`Error HTTP ${res.status}`); return body;
  }
  async function auditLogs(limit=100){ const {data,error}=await client.from('sigmun_access_audit').select('*').order('created_at',{ascending:false}).limit(limit); if(error)throw error; return data||[]; }
  async function manageUsers(payload){
    const s=await session(); if(!s?.access_token) throw new Error('La sesión administrativa expiró.');
    const res=await fetch(`${cfg.supabaseUrl}/functions/v1/sigmun-user-admin`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':cfg.supabaseKey,'Authorization':`Bearer ${s.access_token}`},
      body:JSON.stringify(payload||{})
    });
    const body=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(body.error||`Error HTTP ${res.status}`);
    return body;
  }

  async function saveTopic(payload){ const row={...payload}; row.slug=row.slug||slugify(row.name); const {data,error}=await client.from('sigmun_topics').upsert(row).select().single(); if(error)throw error; return data; }
  async function saveProject(payload){ const row={...payload}; row.slug=row.slug||slugify(row.name); const {data,error}=await client.from('sigmun_projects').upsert(row).select().single(); if(error)throw error; return data; }
  async function deleteTopic(id){ const {error}=await client.from('sigmun_topics').delete().eq('id',id); if(error)throw error; }
  async function deleteProject(id){ const {error}=await client.from('sigmun_projects').delete().eq('id',id); if(error)throw error; }

  async function createGeoLayer(payload){ const {data,error}=await client.from('sigmun_geo_layers').insert(payload).select().single(); if(error)throw error; return data; }
  async function updateGeoLayer(id,payload){ const {data,error}=await client.from('sigmun_geo_layers').update({...payload,updated_at:new Date().toISOString()}).eq('id',id).select().single(); if(error)throw error; return data; }
  async function createStatLayer(payload){ const {data,error}=await client.from('sigmun_stat_layers').insert(payload).select().single(); if(error)throw error; return data; }
  async function updateStatLayer(id,payload){ const {data,error}=await client.from('sigmun_stat_layers').update({...payload,updated_at:new Date().toISOString()}).eq('id',id).select().single(); if(error)throw error; return data; }
  async function deleteGeoLayer(id){ const {error}=await client.from('sigmun_geo_layers').delete().eq('id',id); if(error)throw error; }
  async function deleteStatLayer(id){ const {error}=await client.from('sigmun_stat_layers').delete().eq('id',id); if(error)throw error; }
  async function insertPoints(layerId, rows){ for(const part of chunk(rows,150)){ for(const r of part){ const {error}=await client.rpc('sigmun_insert_geo_point',{p_layer_id:layerId,p_lat:r.lat,p_lon:r.lon,p_name:r.name||null,p_attributes:r.attributes||{}}); if(error)throw error; } } }
  async function insertPolygons(layerId, rows){ for(const r of rows){ const {error}=await client.rpc('sigmun_insert_geo_polygon',{p_layer_id:layerId,p_geometry:r.geometry,p_name:r.name||null,p_attributes:r.attributes||{}}); if(error)throw error; } }
  async function insertLines(layerId, rows){ for(const r of rows){ const {error}=await client.rpc('sigmun_insert_geo_line',{p_layer_id:layerId,p_geometry:r.geometry,p_name:r.name||null,p_attributes:r.attributes||{}}); if(error)throw error; } }
  async function insertGeoBatch(layerId, groups={},onProgress){
    const parts=[
      ...(groups.points||[]).map(r=>({kind:'Point',lat:r.lat,lon:r.lon,name:r.name||null,attributes:r.attributes||{}})),
      ...(groups.polygons||[]).map(r=>({kind:'MultiPolygon',geometry:r.geometry,name:r.name||null,attributes:r.attributes||{}})),
      ...(groups.lines||[]).map(r=>({kind:'MultiLineString',geometry:r.geometry,name:r.name||null,attributes:r.attributes||{}}))
    ];
    let done=0;for(const part of chunk(parts,120)){const {error}=await client.rpc('sigmun_insert_geo_batch',{p_layer_id:layerId,p_items:part});if(error)throw error;done+=part.length;if(typeof onProgress==='function')onProgress(done,parts.length);}
  }
  async function geoBatchAvailable(layerId){
    const {error}=await client.rpc('sigmun_insert_geo_batch',{p_layer_id:layerId,p_items:[]});
    return !error;
  }
  async function insertStatRecords(layerId, rows){ let offset=0; for(const part of chunk(rows,400)){ const payload=part.map((r,i)=>({layer_id:layerId,record_order:offset+i,attributes:r})); const {error}=await client.from('sigmun_stat_records').insert(payload); if(error)throw error; offset+=part.length; } }
  async function updateGeoStyle(id,style){ return updateGeoLayer(id,{style}); }
  async function updateGeoFeature(layerId,featureId,geometryType,payload={}){
    const table=geometryType==='Point'?'sigmun_geo_points':(['LineString','MultiLineString'].includes(geometryType)?'sigmun_geo_lines':'sigmun_geo_polygons');
    const patch={};
    if('name' in payload)patch.name=payload.name||null;
    if('attributes' in payload)patch.attributes=payload.attributes||{};
    const {data,error}=await client.from(table).update(patch).eq('id',featureId).eq('layer_id',layerId).select('id').maybeSingle();
    if(error)throw error;if(!data)throw new Error('No fue posible localizar el elemento geográfico.');return data;
  }
  async function updateGeoLayerOrders(items){
    for(const item of items||[]){const {error}=await client.from('sigmun_geo_layers').update({sort_order:item.sort_order,updated_at:new Date().toISOString()}).eq('id',item.id);if(error)throw error;}
  }
  async function updateStatLayerOrders(items){
    for(const item of items||[]){const {error}=await client.from('sigmun_stat_layers').update({sort_order:item.sort_order,updated_at:new Date().toISOString()}).eq('id',item.id);if(error)throw error;}
  }

  window.SigmunDB={client,topics,projects,projectBySlug,geoLayers,statLayers,geojson,statRecords,session,signIn,signUp,signOut,adminStatus,myProfile,bootstrapAdmin,auditLogs,manageUsers,saveTopic,saveProject,deleteTopic,deleteProject,createGeoLayer,updateGeoLayer,createStatLayer,updateStatLayer,deleteGeoLayer,deleteStatLayer,insertPoints,insertPolygons,insertLines,insertGeoBatch,geoBatchAvailable,insertStatRecords,updateGeoStyle,updateGeoFeature,updateGeoLayerOrders,updateStatLayerOrders,slugify};
})();
