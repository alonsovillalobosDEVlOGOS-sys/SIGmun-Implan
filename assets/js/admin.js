(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { session:null, profile:null, topics:[], projects:[], geo:[], stats:[], users:[], audit:[], editingUser:null };
  const roleName = {admin:'Administrador',editor:'Editor',viewer:'Consulta'};
  const sectionName = {overview:'Resumen',users:'Usuarios y roles',topics:'Temas de consulta',projects:'Proyectos',geo:'Capas geográficas',stats:'Capas estadísticas',audit:'Registro de accesos'};
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = v => v ? new Date(v).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'}) : '—';
  const show = (id,on=true) => $(id)?.classList.toggle('hidden',!on);
  const openModal = id => $(id)?.classList.add('open');
  const closeModal = id => $(id)?.classList.remove('open');
  let toastTimer;
  function toast(msg,error=false){const e=$('toast');e.textContent=msg;e.classList.toggle('error',error);e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>e.classList.remove('show'),3200)}
  function setBusy(btn,busy,label){if(!btn)return; if(busy){btn.dataset.original=btn.innerHTML;btn.disabled=true;btn.innerHTML=`<span class="loader-mini"></span>${label||'Procesando…'}`}else{btn.disabled=false;btn.innerHTML=btn.dataset.original||btn.innerHTML}}
  function clearGate(){['loadingCard','bootstrapCard','loginCard','deniedCard'].forEach(id=>show(id,false))}
  function showGate(id){clearGate();show('authGate',true);show('adminApp',false);show('headerLogout',false);show(id,true)}
  function profileIsAllowed(){return state.profile?.is_active && ['admin','editor'].includes(state.profile?.role)}
  function isAdmin(){return state.profile?.role==='admin'}

  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal.open').forEach(m=>closeModal(m.id))});

  async function init(){
    try{
      const [status,session]=await Promise.all([SigmunDB.adminStatus(),SigmunDB.session()]);
      state.session=session;
      if(!status.has_admin){showGate('bootstrapCard');return;}
      if(!session){showGate('loginCard');return;}
      state.profile=await SigmunDB.myProfile();
      if(!profileIsAllowed()){showDenied();return;}
      await enterAdmin();
    }catch(e){console.error(e);showGate('loginCard');$('loginError').textContent='No fue posible validar el acceso: '+e.message}
  }

  $('bootstrapExistingLogin').onclick=()=>showGate('loginCard');
  $('bootstrapSubmit').onclick=async()=>{
    const btn=$('bootstrapSubmit'),name=$('bootstrapName').value.trim(),department=$('bootstrapDepartment').value.trim(),email=$('bootstrapEmail').value.trim(),password=$('bootstrapPassword').value,key=$('bootstrapKey').value.trim();
    $('bootstrapError').textContent='';
    if(!name||!email||!password||!key)return $('bootstrapError').textContent='Completa nombre, correo, contraseña y clave de activación.';
    if(password!==$('bootstrapPassword2').value)return $('bootstrapError').textContent='Las contraseñas no coinciden.';
    if(password.length<10)return $('bootstrapError').textContent='La contraseña debe tener al menos 10 caracteres.';
    setBusy(btn,true,'Creando acceso…');
    try{
      await SigmunDB.bootstrapAdmin({activation_key:key,email,password,full_name:name,department});
      await SigmunDB.signIn(email,password); state.session=await SigmunDB.session(); state.profile=await SigmunDB.myProfile();
      toast('Administrador inicial creado correctamente.'); await enterAdmin();
    }catch(e){$('bootstrapError').textContent=e.message}
    finally{setBusy(btn,false)}
  };

  $('loginSubmit').onclick=async()=>{
    const btn=$('loginSubmit'),email=$('loginEmail').value.trim(),password=$('loginPassword').value;$('loginError').textContent='';
    if(!email||!password)return $('loginError').textContent='Ingresa correo y contraseña.';
    setBusy(btn,true,'Validando…');
    try{await SigmunDB.signIn(email,password);state.session=await SigmunDB.session();state.profile=await SigmunDB.myProfile();if(!profileIsAllowed()){showDenied();return}await enterAdmin()}
    catch(e){$('loginError').textContent=e.message}
    finally{setBusy(btn,false)}
  };
  $('loginPassword').addEventListener('keydown',e=>{if(e.key==='Enter')$('loginSubmit').click()});
  $('headerLogout').onclick=logout;$('deniedLogout').onclick=logout;
  async function logout(){try{await SigmunDB.signOut()}catch(_){}state.session=null;state.profile=null;showGate('loginCard');toast('Sesión cerrada.')}
  function showDenied(){showGate('deniedCard');$('deniedText').textContent=state.profile?`La cuenta ${state.profile.email} tiene rol “${roleName[state.profile.role]||state.profile.role}” o se encuentra inactiva.`:'No existe un perfil administrativo válido para esta cuenta.'}

  async function enterAdmin(){
    clearGate();show('authGate',false);show('adminApp',true);show('headerLogout',true);
    $('profileName').textContent=state.profile.full_name||state.profile.email;$('profileMeta').textContent=`${state.profile.department||'SIGmun'} · ${roleName[state.profile.role]||state.profile.role}`;$('profileAvatar').textContent=(state.profile.full_name||state.profile.email||'A').trim()[0].toUpperCase();
    document.querySelectorAll('[data-admin-only]').forEach(el=>el.classList.toggle('hidden',!isAdmin()));
    $('permissionTitle').textContent=isAdmin()?'Acceso de administrador':'Acceso de editor';
    $('permissionText').textContent=isAdmin()?'Puedes administrar usuarios, temas, proyectos y todas las capas publicadas en SIGmun.':'Puedes crear y editar proyectos y administrar capas geográficas y estadísticas. No puedes administrar usuarios ni temas de consulta.';
    switchSection('overview');await refreshAll();
  }

  document.querySelectorAll('.admin-nav button[data-section]').forEach(b=>b.onclick=()=>switchSection(b.dataset.section));
  function switchSection(name){
    if((name==='users'||name==='topics'||name==='audit')&&!isAdmin())name='overview';
    document.querySelectorAll('.admin-nav button[data-section]').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
    document.querySelectorAll('.admin-section').forEach(p=>p.classList.toggle('active',p.dataset.sectionPane===name));
    $('mobileSectionTitle').textContent=sectionName[name]||'Administración';$('adminSidebar').classList.remove('open');
  }
  $('adminMenuBtn').onclick=()=>$('adminSidebar').classList.toggle('open');
  $('refreshAllBtn').onclick=()=>refreshAll(true);$('refreshAuditBtn').onclick=()=>loadAudit(true);

  async function refreshAll(notify=false){
    try{
      const [topics,projects,geo,stats]=await Promise.all([SigmunDB.topics(),SigmunDB.projects(),SigmunDB.geoLayers(),SigmunDB.statLayers()]);
      state.topics=topics;state.projects=projects;state.geo=geo;state.stats=stats;
      fillProjectSelectors();renderTopics();renderProjects();renderGeo();renderStats();
      if(isAdmin())await Promise.all([loadUsers(),loadAudit()]);
      renderOverview();if(notify)toast('Información actualizada.');
    }catch(e){console.error(e);toast(e.message,true)}
  }
  function fillProjectSelectors(){
    const topics=state.topics.map(t=>`<option value="${t.id}">${esc(t.name)}${t.is_active?'':' · Inactivo'}</option>`).join('');$('projectTopic').innerHTML=topics;
    const projects=state.projects.map(p=>`<option value="${p.id}">${esc(p.name)}${p.is_active?'':' · Inactivo'}</option>`).join('');$('geoProject').innerHTML=projects;$('statProject').innerHTML=projects;
  }
  function projectName(id){return state.projects.find(p=>p.id===id)?.name||'Proyecto'}
  function topicName(id){return state.topics.find(t=>t.id===id)?.name||'Tema'}

  function renderOverview(){
    const userVal=isAdmin()?state.users.length:'—';
    const kpis=[['bi-folder2-open','Temas',state.topics.length,'Áreas de consulta'],['bi-grid-1x2','Proyectos',state.projects.length,'Sistemas temáticos'],['bi-map','Capas geográficas',state.geo.length,'Mapas almacenados'],['bi-bar-chart-line','Capas estadísticas',state.stats.length,'Bases de indicadores'],['bi-people','Usuarios',userVal,isAdmin()?'Cuentas registradas':'Solo administradores']];
    $('overviewKpis').innerHTML=kpis.map(x=>`<article class="admin-kpi"><i class="bi ${x[0]}"></i><span>${x[1]}</span><b>${x[2]}</b><small>${x[3]}</small></article>`).join('');
    $('overviewTopics').innerHTML=state.topics.map(t=>{const n=state.projects.filter(p=>p.topic_id===t.id).length;return`<div class="overview-item"><span class="status-dot ${t.is_active?'on':''}" style="background:${t.color}"></span><div class="grow"><b>${esc(t.name)}</b><span>${esc(t.description||'')}</span></div><span class="overview-number">${n}</span></div>`}).join('')||'<div class="empty">Sin temas.</div>';
    const recent=[...state.geo.map(x=>({...x,_kind:'Geográfica'})),...state.stats.map(x=>({...x,_kind:'Estadística'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6);
    $('overviewRecent').innerHTML=recent.map(l=>`<div class="overview-item"><span class="status-dot on"></span><div class="grow"><b>${esc(l.name)}</b><span>${esc(l._kind)} · ${esc(projectName(l.project_id))}</span></div><span>${fmtDate(l.created_at).split(',')[0]}</span></div>`).join('')||'<div class="empty">Aún no hay capas.</div>';
  }

  async function loadUsers(silent=false){if(!isAdmin())return;try{const r=await SigmunDB.manageUsers({action:'list'});state.users=r.users||[];renderUsers()}catch(e){if(!silent)toast(e.message,true)}}
  function renderUsers(){
    $('userCount').textContent=state.users.length;
    $('userList').innerHTML=state.users.map(u=>`<div class="rich-row"><span class="status-dot ${u.is_active?'on':''}"></span><div class="grow"><div class="primary"><b>${esc(u.full_name||u.email)}</b><span class="role-pill ${u.role}">${esc(roleName[u.role]||u.role)}</span>${u.id===state.profile.id?'<span class="type-pill">Tu cuenta</span>':''}</div><div class="secondary">${esc(u.email)} · ${esc(u.department||'Sin área')} · Alta ${fmtDate(u.created_at)}</div></div><div class="row-actions"><button class="mini-icon" title="Editar" data-edit-user="${u.id}"><i class="bi bi-pencil"></i></button>${u.id!==state.profile.id?`<button class="mini-icon danger" title="Eliminar" data-delete-user="${u.id}"><i class="bi bi-trash"></i></button>`:''}</div></div>`).join('')||'<div class="empty">Sin usuarios.</div>';
    document.querySelectorAll('[data-edit-user]').forEach(b=>b.onclick=()=>editUser(b.dataset.editUser));
    document.querySelectorAll('[data-delete-user]').forEach(b=>b.onclick=()=>deleteUser(b.dataset.deleteUser));
  }
  $('createUserBtn').onclick=async()=>{
    const btn=$('createUserBtn'),payload={action:'create',full_name:$('newUserName').value.trim(),department:$('newUserDepartment').value.trim(),email:$('newUserEmail').value.trim(),role:$('newUserRole').value,password:$('newUserPassword').value,is_active:$('newUserActive').checked};$('newUserError').textContent='';
    if(!payload.full_name||!payload.email||!payload.password)return $('newUserError').textContent='Completa nombre, correo y contraseña inicial.';
    setBusy(btn,true,'Creando…');try{await SigmunDB.manageUsers(payload);['newUserName','newUserDepartment','newUserEmail','newUserPassword'].forEach(id=>$(id).value='');$('newUserRole').value='viewer';$('newUserActive').checked=true;await loadUsers();renderOverview();toast('Usuario creado.')}catch(e){$('newUserError').textContent=e.message}finally{setBusy(btn,false)}
  };
  function editUser(id){const u=state.users.find(x=>x.id===id);if(!u)return;$('editUserId').value=u.id;$('editUserName').value=u.full_name||'';$('editUserDepartment').value=u.department||'';$('editUserRole').value=u.role;$('editUserActive').checked=!!u.is_active;$('editUserPassword').value='';$('editUserError').textContent='';openModal('userEditModal')}
  $('saveUserEditBtn').onclick=async()=>{const btn=$('saveUserEditBtn'),payload={action:'update',user_id:$('editUserId').value,full_name:$('editUserName').value.trim(),department:$('editUserDepartment').value.trim(),role:$('editUserRole').value,is_active:$('editUserActive').checked};if($('editUserPassword').value)payload.password=$('editUserPassword').value;setBusy(btn,true,'Guardando…');try{await SigmunDB.manageUsers(payload);closeModal('userEditModal');await loadUsers();state.profile=await SigmunDB.myProfile();if(!profileIsAllowed()){showDenied();return}renderOverview();toast('Permisos actualizados.')}catch(e){$('editUserError').textContent=e.message}finally{setBusy(btn,false)}};
  async function deleteUser(id){const u=state.users.find(x=>x.id===id);if(!u||!confirm(`¿Eliminar definitivamente la cuenta ${u.email}?`))return;try{await SigmunDB.manageUsers({action:'delete',user_id:id});await loadUsers();renderOverview();toast('Usuario eliminado.')}catch(e){toast(e.message,true)}}

  function renderTopics(){
    if(!isAdmin())return;$('topicCount').textContent=state.topics.length;
    $('adminTopicList').innerHTML=state.topics.map(t=>`<div class="rich-row"><span class="status-dot ${t.is_active?'on':''}" style="background:${t.color}"></span><div class="grow"><div class="primary"><b>${esc(t.name)}</b>${t.is_active?'':'<span class="privacy-pill private">Inactivo</span>'}</div><div class="secondary">${esc(t.slug)} · Orden ${t.sort_order||0} · ${esc(t.description||'Sin descripción')}</div></div><div class="row-actions"><button class="mini-icon" data-edit-topic="${t.id}"><i class="bi bi-pencil"></i></button><button class="mini-icon danger" data-delete-topic="${t.id}"><i class="bi bi-trash"></i></button></div></div>`).join('')||'<div class="empty">Sin temas.</div>';
    document.querySelectorAll('[data-edit-topic]').forEach(b=>b.onclick=()=>startTopicEdit(b.dataset.editTopic));document.querySelectorAll('[data-delete-topic]').forEach(b=>b.onclick=()=>removeTopic(b.dataset.deleteTopic));
  }
  function resetTopicForm(){['topicId','topicSlug','topicName','topicDesc'].forEach(id=>$(id).value='');$('topicIcon').value='bi-folder2-open';$('topicColor').value='#0f4fa8';$('topicOrder').value='0';$('topicActive').checked=true;$('topicFormTitle').textContent='Nuevo tema';show('cancelTopicBtn',false)}
  function startTopicEdit(id){const t=state.topics.find(x=>x.id===id);if(!t)return;$('topicId').value=t.id;$('topicSlug').value=t.slug;$('topicName').value=t.name;$('topicDesc').value=t.description||'';$('topicIcon').value=t.icon||'bi-folder2-open';$('topicColor').value=t.color||'#0f4fa8';$('topicOrder').value=t.sort_order||0;$('topicActive').checked=!!t.is_active;$('topicFormTitle').textContent='Editar tema';show('cancelTopicBtn',true);window.scrollTo({top:74,behavior:'smooth'})}
  $('cancelTopicBtn').onclick=resetTopicForm;
  $('saveTopicBtn').onclick=async()=>{const btn=$('saveTopicBtn'),name=$('topicName').value.trim();if(!name)return toast('Ingresa el nombre del tema.',true);const payload={name,description:$('topicDesc').value.trim()||null,icon:$('topicIcon').value.trim()||'bi-folder2-open',color:$('topicColor').value,sort_order:Number($('topicOrder').value)||0,is_active:$('topicActive').checked};if($('topicId').value){payload.id=$('topicId').value;payload.slug=$('topicSlug').value}setBusy(btn,true,'Guardando…');try{await SigmunDB.saveTopic(payload);resetTopicForm();await refreshAll();toast('Tema guardado.')}catch(e){toast(e.message,true)}finally{setBusy(btn,false)}};
  async function removeTopic(id){const t=state.topics.find(x=>x.id===id);if(!confirm(`¿Eliminar “${t?.name||'este tema'}”? Se eliminarán también sus proyectos y capas.`))return;try{await SigmunDB.deleteTopic(id);await refreshAll();toast('Tema eliminado.')}catch(e){toast(e.message,true)}}

  function renderProjects(){
    $('projectCountAdmin').textContent=state.projects.length;
    $('adminProjectList').innerHTML=state.projects.map(p=>`<div class="rich-row"><span class="status-dot ${p.is_active?'on':''}" style="background:${p.color}"></span><div class="grow"><div class="primary"><b>${esc(p.name)}</b><span class="type-pill">${p.project_type==='mixed'?'Mapa + indicadores':p.project_type==='map'?'Mapa':'Indicadores'}</span>${p.is_active?'':'<span class="privacy-pill private">Inactivo</span>'}</div><div class="secondary">${esc(topicName(p.topic_id))} · ${esc(p.slug)} · Centro ${Number(p.center_lat).toFixed(4)}, ${Number(p.center_lon).toFixed(4)}</div></div><div class="row-actions"><button class="mini-icon" data-edit-project="${p.id}"><i class="bi bi-pencil"></i></button>${isAdmin()?`<button class="mini-icon danger" data-delete-project="${p.id}"><i class="bi bi-trash"></i></button>`:''}</div></div>`).join('')||'<div class="empty">Sin proyectos.</div>';
    document.querySelectorAll('[data-edit-project]').forEach(b=>b.onclick=()=>startProjectEdit(b.dataset.editProject));document.querySelectorAll('[data-delete-project]').forEach(b=>b.onclick=()=>removeProject(b.dataset.deleteProject));
  }
  function resetProjectForm(){['projectId','projectSlug','projectName','projectDesc'].forEach(id=>$(id).value='');$('projectType').value='mixed';$('projectIcon').value='bi-map';$('projectColor').value='#0f4fa8';$('projectOrder').value='0';$('projectLat').value='28.1908';$('projectLon').value='-105.4701';$('projectZoom').value='13';$('projectFeatured').checked=false;$('projectActive').checked=true;$('projectFormTitle').textContent='Nuevo proyecto';show('cancelProjectBtn',false)}
  function startProjectEdit(id){const p=state.projects.find(x=>x.id===id);if(!p)return;$('projectId').value=p.id;$('projectSlug').value=p.slug;$('projectTopic').value=p.topic_id;$('projectName').value=p.name;$('projectDesc').value=p.description||'';$('projectType').value=p.project_type;$('projectIcon').value=p.icon||'bi-map';$('projectColor').value=p.color||'#0f4fa8';$('projectOrder').value=p.sort_order||0;$('projectLat').value=p.center_lat;$('projectLon').value=p.center_lon;$('projectZoom').value=p.default_zoom||13;$('projectFeatured').checked=!!p.is_featured;$('projectActive').checked=!!p.is_active;$('projectFormTitle').textContent='Editar proyecto';show('cancelProjectBtn',true);window.scrollTo({top:74,behavior:'smooth'})}
  $('cancelProjectBtn').onclick=resetProjectForm;
  $('saveProjectBtn').onclick=async()=>{const btn=$('saveProjectBtn'),name=$('projectName').value.trim(),lat=Number($('projectLat').value),lon=Number($('projectLon').value);if(!name||!$('projectTopic').value)return toast('Completa tema y nombre del proyecto.',true);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return toast('Centro geográfico inválido.',true);const payload={topic_id:$('projectTopic').value,name,description:$('projectDesc').value.trim()||null,project_type:$('projectType').value,icon:$('projectIcon').value.trim()||'bi-map',color:$('projectColor').value,sort_order:Number($('projectOrder').value)||0,center_lat:lat,center_lon:lon,default_zoom:Number($('projectZoom').value)||13,is_featured:$('projectFeatured').checked,is_active:$('projectActive').checked};if($('projectId').value){payload.id=$('projectId').value;payload.slug=$('projectSlug').value}setBusy(btn,true,'Guardando…');try{await SigmunDB.saveProject(payload);resetProjectForm();await refreshAll();toast('Proyecto guardado.')}catch(e){toast(e.message,true)}finally{setBusy(btn,false)}};
  async function removeProject(id){const p=state.projects.find(x=>x.id===id);if(!confirm(`¿Eliminar “${p?.name||'este proyecto'}” y todas sus capas?`))return;try{await SigmunDB.deleteProject(id);await refreshAll();toast('Proyecto eliminado.')}catch(e){toast(e.message,true)}}

  function renderGeo(){
    $('geoCount').textContent=state.geo.length;
    $('adminGeoList').innerHTML=state.geo.map(l=>{const c=l.style?.color||'#0f4fa8';return`<div class="rich-row"><span class="status-dot ${l.is_visible?'on':''}" style="background:${c}"></span><div class="grow"><div class="primary"><b>${esc(l.name)}</b><span class="type-pill">${esc(l.geometry_type)}</span><span class="privacy-pill ${l.is_public?'public':'private'}">${l.is_public?'Pública':'Privada'}</span></div><div class="secondary">${esc(projectName(l.project_id))} · ${esc((l.source_format||'').toUpperCase())} · ${esc(l.source_file_name||'Sin archivo')} · ${fmtDate(l.created_at)}</div></div><div class="row-actions"><button class="mini-icon" data-edit-geo="${l.id}"><i class="bi bi-sliders"></i></button><button class="mini-icon danger" data-delete-geo="${l.id}"><i class="bi bi-trash"></i></button></div></div>`}).join('')||'<div class="empty">Sin capas geográficas.</div>';
    document.querySelectorAll('[data-edit-geo]').forEach(b=>b.onclick=()=>editGeo(b.dataset.editGeo));document.querySelectorAll('[data-delete-geo]').forEach(b=>b.onclick=()=>removeGeo(b.dataset.deleteGeo));
  }
  function setProgress(kind,text,pct){$(kind+'Progress').textContent=text;$(kind+'ProgressBar').style.width=`${Math.max(0,Math.min(100,pct))}%`}
  $('uploadGeoBtn').onclick=async()=>{const btn=$('uploadGeoBtn'),file=$('geoFile').files[0],name=$('geoName').value.trim();if(!file||!name)return toast('Selecciona un archivo y asigna un nombre.',true);let layer=null;setBusy(btn,true,'Cargando…');setProgress('geo','Procesando archivo…',12);try{const parsed=await SigmunData.parseGeoFile(file);if(!parsed.points.length&&!parsed.polygons.length)throw new Error('No se encontraron puntos o polígonos compatibles.');const geomType=parsed.points.length&&parsed.polygons.length?'Mixed':parsed.polygons.length?'MultiPolygon':'Point';setProgress('geo',`Preparando ${parsed.points.length} puntos y ${parsed.polygons.length} polígonos…`,30);layer=await SigmunDB.createGeoLayer({project_id:$('geoProject').value,name,description:$('geoDescription').value.trim()||null,source_format:parsed.format,geometry_type:geomType,source_file_name:file.name,style:{color:$('geoColor').value,opacity:.82,weight:2,fillOpacity:.30},metadata:{ignored_geometry_types:parsed.ignored,feature_count:parsed.points.length+parsed.polygons.length},is_public:$('geoPublic').checked,is_visible:$('geoVisible').checked,created_by:state.profile.id});setProgress('geo','Almacenando geometrías en PostGIS…',48);if(parsed.points.length){await SigmunDB.insertPoints(layer.id,parsed.points);setProgress('geo',`${parsed.points.length} puntos almacenados…`,72)}if(parsed.polygons.length){await SigmunDB.insertPolygons(layer.id,parsed.polygons);setProgress('geo',`${parsed.polygons.length} polígonos almacenados…`,92)}setProgress('geo',`Carga completada: ${parsed.points.length+parsed.polygons.length} elementos${parsed.ignored.length?' · omitidos '+[...new Set(parsed.ignored)].join(', '):''}.`,100);$('geoFile').value='';$('geoName').value='';$('geoDescription').value='';await refreshAll();toast('Capa geográfica almacenada correctamente.')}catch(e){if(layer?.id){try{await SigmunDB.deleteGeoLayer(layer.id)}catch(_){}}setProgress('geo','Error: '+e.message,0);toast(e.message,true)}finally{setBusy(btn,false)}};
  function editGeo(id){const l=state.geo.find(x=>x.id===id);if(!l)return;$('editGeoId').value=l.id;$('editGeoName').value=l.name;$('editGeoDescription').value=l.description||'';$('editGeoColor').value=l.style?.color||'#0f4fa8';$('editGeoPublic').checked=!!l.is_public;$('editGeoVisible').checked=!!l.is_visible;openModal('geoEditModal')}
  $('saveGeoEditBtn').onclick=async()=>{const id=$('editGeoId').value,l=state.geo.find(x=>x.id===id);if(!l)return;const style={...(l.style||{}),color:$('editGeoColor').value};try{await SigmunDB.updateGeoLayer(id,{name:$('editGeoName').value.trim(),description:$('editGeoDescription').value.trim()||null,style,is_public:$('editGeoPublic').checked,is_visible:$('editGeoVisible').checked});closeModal('geoEditModal');await refreshAll();toast('Capa actualizada.')}catch(e){toast(e.message,true)}};
  async function removeGeo(id){const l=state.geo.find(x=>x.id===id);if(!confirm(`¿Eliminar la capa geográfica “${l?.name||''}” y todas sus geometrías?`))return;try{await SigmunDB.deleteGeoLayer(id);await refreshAll();toast('Capa geográfica eliminada.')}catch(e){toast(e.message,true)}}

  function renderStats(){
    $('statCount').textContent=state.stats.length;
    $('adminStatList').innerHTML=state.stats.map(l=>`<div class="rich-row"><span class="status-dot ${l.is_public?'on':''}"></span><div class="grow"><div class="primary"><b>${esc(l.name)}</b><span class="privacy-pill ${l.is_public?'public':'private'}">${l.is_public?'Pública':'Privada'}</span></div><div class="secondary">${esc(projectName(l.project_id))} · ${Number(l.metadata?.record_count||0).toLocaleString('es-MX')} registros · ${esc(l.source_file_name||'CSV')} · ${fmtDate(l.created_at)}</div></div><div class="row-actions"><button class="mini-icon" data-edit-stat="${l.id}"><i class="bi bi-sliders"></i></button><button class="mini-icon danger" data-delete-stat="${l.id}"><i class="bi bi-trash"></i></button></div></div>`).join('')||'<div class="empty">Sin capas estadísticas.</div>';
    document.querySelectorAll('[data-edit-stat]').forEach(b=>b.onclick=()=>editStat(b.dataset.editStat));document.querySelectorAll('[data-delete-stat]').forEach(b=>b.onclick=()=>removeStat(b.dataset.deleteStat));
  }
  $('uploadStatBtn').onclick=async()=>{const btn=$('uploadStatBtn'),file=$('statFile').files[0],name=$('statName').value.trim();if(!file||!name)return toast('Selecciona un CSV y asigna un nombre.',true);let layer=null;setBusy(btn,true,'Cargando…');setProgress('stat','Procesando CSV…',15);try{const rows=await SigmunData.parseStatFile(file);if(!rows.length)throw new Error('El CSV no contiene registros.');const s=SigmunData.summarize(rows);setProgress('stat',`Detectados ${rows.length} registros y ${s.fields.length} campos…`,35);layer=await SigmunDB.createStatLayer({project_id:$('statProject').value,name,description:$('statDescription').value.trim()||null,source_format:'csv',source_file_name:file.name,schema_fields:s.fields.map(x=>({name:x,type:s.numeric.includes(x)?'number':'text'})),metadata:{record_count:rows.length,numeric_fields:s.numeric,categorical_fields:s.categorical},is_public:$('statPublic').checked,created_by:state.profile.id});setProgress('stat','Guardando registros…',55);await SigmunDB.insertStatRecords(layer.id,rows);setProgress('stat',`Carga completada: ${rows.length.toLocaleString('es-MX')} registros.`,100);$('statFile').value='';$('statName').value='';$('statDescription').value='';await refreshAll();toast('Base estadística almacenada correctamente.')}catch(e){if(layer?.id){try{await SigmunDB.deleteStatLayer(layer.id)}catch(_){}}setProgress('stat','Error: '+e.message,0);toast(e.message,true)}finally{setBusy(btn,false)}};
  function editStat(id){const l=state.stats.find(x=>x.id===id);if(!l)return;$('editStatId').value=l.id;$('editStatName').value=l.name;$('editStatDescription').value=l.description||'';$('editStatPublic').checked=!!l.is_public;openModal('statEditModal')}
  $('saveStatEditBtn').onclick=async()=>{try{await SigmunDB.updateStatLayer($('editStatId').value,{name:$('editStatName').value.trim(),description:$('editStatDescription').value.trim()||null,is_public:$('editStatPublic').checked});closeModal('statEditModal');await refreshAll();toast('Capa estadística actualizada.')}catch(e){toast(e.message,true)}};
  async function removeStat(id){const l=state.stats.find(x=>x.id===id);if(!confirm(`¿Eliminar la base estadística “${l?.name||''}” y todos sus registros?`))return;try{await SigmunDB.deleteStatLayer(id);await refreshAll();toast('Capa estadística eliminada.')}catch(e){toast(e.message,true)}}

  async function loadAudit(silent=false){if(!isAdmin())return;try{state.audit=await SigmunDB.auditLogs(150);renderAudit();if(!silent)return}catch(e){if(!silent)toast(e.message,true)}}
  function renderAudit(){
    const labels={bootstrap_admin:'Administrador inicial',create_user:'Usuario creado',update_user:'Usuario actualizado',delete_user:'Usuario eliminado'};
    $('auditList').innerHTML=state.audit.map(a=>`<div class="audit-row"><time>${fmtDate(a.created_at)}</time><span class="audit-action">${esc(labels[a.action]||a.action)}</span><span class="audit-detail">${esc(JSON.stringify(a.details||{}))}</span></div>`).join('')||'<div class="empty">Sin eventos registrados.</div>';
  }

  SigmunDB.client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'&& !$('adminApp').classList.contains('hidden')){state.session=null;state.profile=null;showGate('loginCard')}});
  init();
})();
