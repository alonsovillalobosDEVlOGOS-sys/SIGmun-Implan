(() => {
  'use strict';
  const cfg = window.SIGMUN_CONFIG;
  if (!window.supabase || !cfg) throw new Error('Supabase o configuración no disponible.');
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
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
  async function signOut(){ const {error}=await client.auth.signOut(); if(error)throw error; }
  async function saveTopic(payload){ payload={...payload,slug:payload.slug||slugify(payload.name)}; const {data,error}=await client.from('sigmun_topics').upsert(payload).select().single(); if(error)throw error; return data; }
  async function saveProject(payload){ payload={...payload,slug:payload.slug||slugify(payload.name)}; const {data,error}=await client.from('sigmun_projects').upsert(payload).select().single(); if(error)throw error; return data; }
  async function deleteTopic(id){ const {error}=await client.from('sigmun_topics').delete().eq('id',id); if(error)throw error; }
  async function deleteProject(id){ const {error}=await client.from('sigmun_projects').delete().eq('id',id); if(error)throw error; }
  async function createGeoLayer(payload){ const {data,error}=await client.from('sigmun_geo_layers').insert(payload).select().single(); if(error)throw error; return data; }
  async function createStatLayer(payload){ const {data,error}=await client.from('sigmun_stat_layers').insert(payload).select().single(); if(error)throw error; return data; }
  async function deleteGeoLayer(id){ const {error}=await client.from('sigmun_geo_layers').delete().eq('id',id); if(error)throw error; }
  async function deleteStatLayer(id){ const {error}=await client.from('sigmun_stat_layers').delete().eq('id',id); if(error)throw error; }
  async function insertPoints(layerId, rows){ for(const part of chunk(rows,150)){ for(const r of part){ const {error}=await client.rpc('sigmun_insert_geo_point',{p_layer_id:layerId,p_lat:r.lat,p_lon:r.lon,p_name:r.name||null,p_attributes:r.attributes||{}}); if(error)throw error; } } }
  async function insertPolygons(layerId, rows){ for(const r of rows){ const {error}=await client.rpc('sigmun_insert_geo_polygon',{p_layer_id:layerId,p_geometry:r.geometry,p_name:r.name||null,p_attributes:r.attributes||{}}); if(error)throw error; } }
  async function insertStatRecords(layerId, rows){ let offset=0; for(const part of chunk(rows,400)){ const payload=part.map((r,i)=>({layer_id:layerId,record_order:offset+i,attributes:r})); const {error}=await client.from('sigmun_stat_records').insert(payload); if(error)throw error; offset+=part.length; } }
  async function updateGeoStyle(id,style){ const {error}=await client.from('sigmun_geo_layers').update({style}).eq('id',id); if(error)throw error; }

  window.SigmunDB={client,topics,projects,projectBySlug,geoLayers,statLayers,geojson,statRecords,session,signIn,signOut,saveTopic,saveProject,deleteTopic,deleteProject,createGeoLayer,createStatLayer,deleteGeoLayer,deleteStatLayer,insertPoints,insertPolygons,insertStatRecords,updateGeoStyle,slugify};
})();
