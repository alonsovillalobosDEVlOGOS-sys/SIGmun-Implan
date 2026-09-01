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

  const geoEditor={layer:null,geojson:null,selected:null,previewMap:null,previewLayer:null,sortables:[]};
  const statEditor={layer:null,rows:[],profiles:[],chart:null};

  function setEditorTab(kind,name){
    document.querySelectorAll(`[data-${kind}-tab]`).forEach(b=>b.classList.toggle('active',b.dataset[`${kind}Tab`]===name));
    document.querySelectorAll(`[data-${kind}-pane]`).forEach(p=>p.classList.toggle('active',p.dataset[`${kind}Pane`]===name));
    if(kind==='geo'&&name==='preview')setTimeout(()=>{ensureGeoPreviewMap();geoEditor.previewMap?.invalidateSize();renderGeoPreview();},80);
    if(kind==='stat'&&name==='default')setTimeout(()=>renderStatPreview(),40);
  }
  document.querySelectorAll('[data-geo-tab]').forEach(b=>b.onclick=()=>setEditorTab('geo',b.dataset.geoTab));
  document.querySelectorAll('[data-stat-tab]').forEach(b=>b.onclick=()=>setEditorTab('stat',b.dataset.statTab));

  function rendererLabel(r){return r==='categorized'?'Categorías':r==='graduated'?'Rangos':'Símbolo único'}
  function layerLegendSummary(l){const s=SigmunTheme.normalizeStyle(l.style||{}),field=s.field?` · ${s.field}`:'';return `${rendererLabel(s.renderer)}${field}`}

  function renderGeo(){
    $('geoCount').textContent=state.geo.length;
    geoEditor.sortables.forEach(x=>{try{x.destroy()}catch(_){}});geoEditor.sortables=[];
    const groups=state.projects.map(p=>({project:p,layers:state.geo.filter(l=>l.project_id===p.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||a.name.localeCompare(b.name,'es'))})).filter(g=>g.layers.length);
    $('adminGeoList').innerHTML=groups.length?groups.map(g=>`<div class="layer-group"><div class="layer-group-title"><span><i class="bi bi-grid-1x2"></i> ${esc(g.project.name)}</span><span>${g.layers.length} capa${g.layers.length===1?'':'s'}</span></div><div class="layer-group-list" data-geo-sort-project="${g.project.id}">${g.layers.map(l=>{const st=SigmunTheme.normalizeStyle(l.style||{}),c=st.color||'#0f4fa8';return`<div class="rich-row" data-layer-id="${l.id}"><button class="drag-handle" title="Arrastrar para ordenar"><i class="bi bi-grip-vertical"></i></button><span class="status-dot ${l.is_visible?'on':''}" style="background:${c}"></span><div class="grow"><div class="primary"><b>${esc(l.name)}</b><span class="type-pill">${esc(l.geometry_type)}</span><span class="privacy-pill ${l.is_public?'public':'private'}">${l.is_public?'Pública':'Privada'}</span></div><div class="secondary"><span class="style-summary"><i style="background:${c}"></i>${esc(layerLegendSummary(l))}</span> · Orden ${l.sort_order||0} · ${esc((l.source_format||'').toUpperCase())} · ${esc(l.source_file_name||'Sin archivo')}</div></div><div class="row-actions"><button class="mini-icon" title="Gestor avanzado" data-edit-geo="${l.id}"><i class="bi bi-sliders"></i></button><button class="mini-icon danger" title="Eliminar" data-delete-geo="${l.id}"><i class="bi bi-trash"></i></button></div></div>`}).join('')}</div></div>`).join(''):'<div class="empty">Sin capas geográficas.</div>';
    document.querySelectorAll('[data-edit-geo]').forEach(b=>b.onclick=()=>editGeo(b.dataset.editGeo));
    document.querySelectorAll('[data-delete-geo]').forEach(b=>b.onclick=()=>removeGeo(b.dataset.deleteGeo));
    document.querySelectorAll('[data-geo-sort-project]').forEach(el=>{
      if(!window.Sortable)return;
      const sortable=new Sortable(el,{handle:'.drag-handle',animation:160,ghostClass:'sortable-ghost',onEnd:async()=>{
        const items=[...el.querySelectorAll('[data-layer-id]')].map((row,i)=>({id:row.dataset.layerId,sort_order:(i+1)*10}));
        items.forEach(it=>{const l=state.geo.find(x=>x.id===it.id);if(l)l.sort_order=it.sort_order});
        try{await SigmunDB.updateGeoLayerOrders(items);toast('Orden de capas actualizado.');renderGeo()}catch(e){toast(e.message,true);await refreshAll()}
      }});geoEditor.sortables.push(sortable);
    });
  }

  function setProgress(kind,text,pct){$(kind+'Progress').textContent=text;$(kind+'ProgressBar').style.width=`${Math.max(0,Math.min(100,pct))}%`}
  $('uploadGeoBtn').onclick=async()=>{
    const btn=$('uploadGeoBtn'),file=$('geoFile').files[0],name=$('geoName').value.trim();if(!file||!name)return toast('Selecciona un archivo y asigna un nombre.',true);
    let layer=null;setBusy(btn,true,'Cargando…');setProgress('geo','Procesando archivo…',12);
    try{
      const parsed=await SigmunData.parseGeoFile(file);if(!parsed.points.length&&!parsed.polygons.length)throw new Error('No se encontraron puntos o polígonos compatibles.');
      const geomType=parsed.points.length&&parsed.polygons.length?'Mixed':parsed.polygons.length?'MultiPolygon':'Point';
      const maxOrder=Math.max(0,...state.geo.filter(x=>x.project_id===$('geoProject').value).map(x=>Number(x.sort_order)||0));
      setProgress('geo',`Preparando ${parsed.points.length} puntos y ${parsed.polygons.length} polígonos…`,30);
      layer=await SigmunDB.createGeoLayer({project_id:$('geoProject').value,name,description:$('geoDescription').value.trim()||null,source_format:parsed.format,geometry_type:geomType,source_file_name:file.name,style:SigmunTheme.normalizeStyle({renderer:'single',color:$('geoColor').value,legend:{show:true,title:name,noDataLabel:'Sin dato'}}),metadata:{ignored_geometry_types:parsed.ignored,feature_count:parsed.points.length+parsed.polygons.length},is_public:$('geoPublic').checked,is_visible:$('geoVisible').checked,sort_order:maxOrder+10,created_by:state.profile.id});
      setProgress('geo','Almacenando geometrías en PostGIS…',48);if(parsed.points.length){await SigmunDB.insertPoints(layer.id,parsed.points);setProgress('geo',`${parsed.points.length} puntos almacenados…`,72)}if(parsed.polygons.length){await SigmunDB.insertPolygons(layer.id,parsed.polygons);setProgress('geo',`${parsed.polygons.length} polígonos almacenados…`,92)}
      setProgress('geo',`Carga completada: ${parsed.points.length+parsed.polygons.length} elementos${parsed.ignored.length?' · omitidos '+[...new Set(parsed.ignored)].join(', '):''}.`,100);$('geoFile').value='';$('geoName').value='';$('geoDescription').value='';await refreshAll();toast('Capa geográfica almacenada. Ahora puedes configurar su simbología.');
    }catch(e){if(layer?.id){try{await SigmunDB.deleteGeoLayer(layer.id)}catch(_){}}setProgress('geo','Error: '+e.message,0);toast(e.message,true)}finally{setBusy(btn,false)}
  };

  function fillGeoFieldSelects(fields,style){
    const opts='<option value="">— Sin campo —</option>'+fields.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join('');
    $('geoStyleField').innerHTML=opts;$('geoLabelField').innerHTML=opts;
    $('geoStyleField').value=fields.includes(style.field)?style.field:'';$('geoLabelField').value=fields.includes(style.labelField)?style.labelField:(fields.includes('name')?'name':'');
  }
  function readGeoClasses(renderer){
    if(renderer==='categorized')return [...$('geoClassEditor').querySelectorAll('[data-category-row]')].map(r=>({value:r.dataset.value,label:r.querySelector('[data-class-label]').value,color:r.querySelector('[data-class-color]').value}));
    if(renderer==='graduated')return [...$('geoClassEditor').querySelectorAll('[data-range-row]')].map(r=>({min:Number(r.querySelector('[data-class-min]').value),max:Number(r.querySelector('[data-class-max]').value),label:r.querySelector('[data-class-label]').value,color:r.querySelector('[data-class-color]').value})).filter(x=>Number.isFinite(x.min)&&Number.isFinite(x.max));
    return [];
  }
  function readGeoStyle(){
    const renderer=$('geoRenderer').value,base=SigmunTheme.normalizeStyle(geoEditor.layer?.style||{});
    const out={...base,renderer,field:$('geoStyleField').value,color:$('editGeoColor').value,palette:$('geoPalette').value,weight:Number($('geoWeight').value)||2,fillOpacity:Number($('geoFillOpacity').value),radius:Number($('geoRadius').value)||7,noDataColor:$('geoNoDataColor').value,classification:$('geoClassification').value,classCount:Number($('geoClassCount').value)||5,labelField:$('geoLabelField').value,legend:{...(base.legend||{}),show:$('geoLegendShow').checked,title:$('geoLegendTitle').value.trim(),noDataLabel:'Sin dato'}};
    if(renderer==='categorized')out.categories=readGeoClasses(renderer),out.classes=[];
    else if(renderer==='graduated')out.classes=readGeoClasses(renderer),out.categories=[];
    else out.categories=[],out.classes=[];
    return out;
  }
  function renderGeoClassEditor(styleInput){
    const style=SigmunTheme.normalizeStyle(styleInput),box=$('geoClassEditor');
    if(style.renderer==='single'){box.innerHTML='<div class="class-empty">El símbolo único usa el color base para todos los elementos.</div>';return;}
    if(style.renderer==='categorized'){
      box.innerHTML=(style.categories||[]).map((c,i)=>`<div class="class-row" data-category-row data-value="${esc(c.value)}"><input class="swatch-input" data-class-color type="color" value="${esc(c.color)}"><div class="class-value" title="${esc(c.value)}">${esc(c.value)}</div><input class="control" data-class-label type="text" value="${esc(c.label||c.value)}" placeholder="Etiqueta de leyenda"></div>`).join('')||'<div class="class-empty">Selecciona un campo y pulsa “Generar clases”.</div>';
    }else{
      box.innerHTML=(style.classes||[]).map((c,i)=>`<div class="class-row" data-range-row><input class="swatch-input" data-class-color type="color" value="${esc(c.color)}"><div class="range-inputs"><input class="control" data-class-min type="number" step="any" value="${c.min}"><span>–</span><input class="control" data-class-max type="number" step="any" value="${c.max}"></div><input class="control" data-class-label type="text" value="${esc(c.label||'')}" placeholder="Etiqueta de leyenda"></div>`).join('')||'<div class="class-empty">Selecciona un campo numérico y genera los rangos.</div>';
    }
    box.querySelectorAll('input').forEach(i=>i.addEventListener('input',renderGeoPreview));
  }
  function updateGeoRendererUI(generate=false){
    const renderer=$('geoRenderer').value;$('graduatedOptions').style.display=renderer==='graduated'?'grid':'none';
    if(generate&&renderer!=='single')generateGeoClasses();else renderGeoPreview();
  }
  function generateGeoClasses(){
    if(!geoEditor.geojson)return;const renderer=$('geoRenderer').value,field=$('geoStyleField').value,palette=$('geoPalette').value;if(renderer!=='single'&&!field){toast('Selecciona el campo que controlará la simbología.',true);return;}
    let style=readGeoStyle();
    if(renderer==='categorized')style.categories=SigmunTheme.buildCategories(geoEditor.geojson.features,field,palette,style.categories);
    if(renderer==='graduated')style.classes=SigmunTheme.buildClasses(geoEditor.geojson.features,field,$('geoClassCount').value,$('geoClassification').value,palette);
    renderGeoClassEditor(style);renderGeoPreview();
  }
  $('generateGeoClassesBtn').onclick=generateGeoClasses;
  ['geoRenderer','geoStyleField','geoPalette','geoClassification','geoClassCount'].forEach(id=>$(id).addEventListener('change',()=>id==='geoRenderer'?updateGeoRendererUI(true):generateGeoClasses()));
  ['editGeoColor','geoWeight','geoFillOpacity','geoRadius','geoNoDataColor','geoLabelField','geoLegendTitle','geoLegendShow'].forEach(id=>$(id).addEventListener(id==='geoLegendShow'?'change':'input',renderGeoPreview));

  async function editGeo(id){
    const l=state.geo.find(x=>x.id===id);if(!l)return;geoEditor.layer=l;geoEditor.selected=null;setEditorTab('geo','general');
    $('editGeoId').value=l.id;$('editGeoName').value=l.name;$('editGeoDescription').value=l.description||'';$('editGeoOrder').value=l.sort_order||0;$('editGeoPublic').checked=!!l.is_public;$('editGeoVisible').checked=!!l.is_visible;$('geoEditorSubtitle').textContent=`${projectName(l.project_id)} · ${l.geometry_type} · ${String(l.source_format||'').toUpperCase()}`;
    const style=SigmunTheme.normalizeStyle(l.style||{});$('geoRenderer').value=style.renderer;$('editGeoColor').value=style.color;$('geoPalette').value=style.palette||'municipal';$('geoWeight').value=style.weight;$('geoFillOpacity').value=style.fillOpacity;$('geoRadius').value=style.radius;$('geoNoDataColor').value=style.noDataColor;$('geoClassification').value=style.classification;$('geoClassCount').value=String(style.classCount||5);$('geoLegendTitle').value=style.legend?.title||l.name;$('geoLegendShow').checked=style.legend?.show!==false;
    openModal('geoEditModal');$('geoClassEditor').innerHTML='<div class="class-empty">Cargando atributos…</div>';$('geoFeatureList').innerHTML='<div class="empty">Cargando elementos…</div>';
    try{geoEditor.geojson=await SigmunDB.geojson(id);const fields=SigmunTheme.fieldList(geoEditor.geojson.features);fillGeoFieldSelects(fields,style);renderGeoClassEditor(style);updateGeoRendererUI(false);renderGeoFeatureList();ensureGeoPreviewMap();setTimeout(()=>{geoEditor.previewMap.invalidateSize();renderGeoPreview();},80)}catch(e){toast(e.message,true)}
  }

  function ensureGeoPreviewMap(){
    if(geoEditor.previewMap||!$('geoPreviewMap'))return;
    geoEditor.previewMap=L.map('geoPreviewMap',{center:SIGMUN_CONFIG.defaultCenter,zoom:SIGMUN_CONFIG.defaultZoom,zoomControl:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(geoEditor.previewMap);
  }
  function renderGeoPreview(){
    if(!geoEditor.previewMap||!geoEditor.geojson)return;const style=readGeoStyle();if(geoEditor.previewLayer)geoEditor.previewMap.removeLayer(geoEditor.previewLayer);
    geoEditor.previewLayer=L.geoJSON(geoEditor.geojson,{style:f=>SigmunTheme.leafletPathStyle(style,f),pointToLayer:(f,ll)=>L.circleMarker(ll,SigmunTheme.leafletPointStyle(style,f)),onEachFeature:(f,layer)=>{const label=style.labelField?f.properties?.[style.labelField]:f.properties?.name;if(label!==undefined&&label!==null&&label!=='')layer.bindTooltip(String(label),{sticky:true});layer.on('click',()=>selectGeoFeature(String(f.id)));}}).addTo(geoEditor.previewMap);
    const items=style.legend?.show===false?[]:SigmunTheme.legendItems(style);$('geoPreviewLegend').innerHTML=items.map(i=>`<span class="legend-chip"><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('');$('geoPreviewSummary').textContent=`${geoEditor.geojson.features.length.toLocaleString('es-MX')} elementos · ${rendererLabel(style.renderer)}${style.field?' por '+style.field:''}`;
  }
  $('fitGeoPreviewBtn').onclick=()=>{const b=geoEditor.previewLayer?.getBounds();if(b?.isValid())geoEditor.previewMap.fitBounds(b,{padding:[20,20],maxZoom:17})};

  function renderGeoFeatureList(){
    const term=($('geoFeatureSearch').value||'').toLowerCase(),features=geoEditor.geojson?.features||[];const filtered=features.filter(f=>!term||Object.values(f.properties||{}).some(v=>String(v??'').toLowerCase().includes(term))).slice(0,750);
    $('geoFeatureList').innerHTML=filtered.map((f,i)=>`<button class="feature-item ${String(f.id)===String(geoEditor.selected?.id)?'active':''}" data-feature-id="${esc(f.id)}"><i class="bi ${f.geometry?.type==='Point'?'bi-geo-alt-fill':'bi-bounding-box'}"></i><span><b>${esc(f.properties?.name||`Elemento ${i+1}`)}</b><span>${esc(f.geometry?.type||'Geometría')} · ${esc(String(f.id).slice(0,12))}</span></span></button>`).join('')||'<div class="empty">No hay elementos coincidentes.</div>';
    document.querySelectorAll('[data-feature-id]').forEach(b=>b.onclick=()=>selectGeoFeature(b.dataset.featureId));
  }
  $('geoFeatureSearch').oninput=renderGeoFeatureList;
  function selectGeoFeature(id){
    const f=(geoEditor.geojson?.features||[]).find(x=>String(x.id)===String(id));if(!f)return;geoEditor.selected=f;renderGeoFeatureList();$('geoFeatureEditorTitle').textContent=f.properties?.name||'Elemento geográfico';$('geoFeatureType').textContent=f.geometry?.type||'Geometría';$('geoFeatureName').value=f.properties?.name||'';show('geoFeatureForm',true);show('geoFeatureEmpty',false);
    const attrs=Object.entries(f.properties||{}).filter(([k])=>!['name','lat','lon'].includes(k));$('geoAttributeRows').innerHTML='';attrs.forEach(([k,v])=>addGeoAttributeRow(k,v));
  }
  function addGeoAttributeRow(key='',value=''){$('geoAttributeRows').insertAdjacentHTML('beforeend',`<div class="attribute-row"><input class="control attr-key" data-attr-key placeholder="Campo" value="${esc(key)}"><input class="control" data-attr-value placeholder="Valor" value="${esc(typeof value==='object'?JSON.stringify(value):value)}"><button class="mini-icon danger" data-remove-attr><i class="bi bi-x-lg"></i></button></div>`);$('geoAttributeRows').lastElementChild.querySelector('[data-remove-attr]').onclick=e=>e.currentTarget.closest('.attribute-row').remove()}
  $('addGeoAttributeBtn').onclick=()=>addGeoAttributeRow();
  function smartValue(v){const s=String(v??'').trim();if(s==='')return '';if(s==='true')return true;if(s==='false')return false;if(!Number.isNaN(Number(s))&&s!=='')return Number(s);if((s.startsWith('{')&&s.endsWith('}'))||(s.startsWith('[')&&s.endsWith(']'))){try{return JSON.parse(s)}catch(_){}}return s}
  $('saveGeoFeatureBtn').onclick=async()=>{
    const f=geoEditor.selected;if(!f)return;const attrs={};for(const row of $('geoAttributeRows').querySelectorAll('.attribute-row')){const k=row.querySelector('[data-attr-key]').value.trim();if(!k||['name','lat','lon'].includes(k))continue;attrs[k]=smartValue(row.querySelector('[data-attr-value]').value)}
    const name=$('geoFeatureName').value.trim();try{await SigmunDB.updateGeoFeature(geoEditor.layer.id,f.id,f.geometry?.type,{name,attributes:attrs});const lat=f.properties?.lat,lon=f.properties?.lon;f.properties={...attrs,name};if(lat!==undefined)f.properties.lat=lat;if(lon!==undefined)f.properties.lon=lon;renderGeoFeatureList();renderGeoPreview();toast('Atributos actualizados.')}catch(e){toast(e.message,true)}
  };

  $('saveGeoEditBtn').onclick=async()=>{
    const id=$('editGeoId').value,l=state.geo.find(x=>x.id===id);if(!l)return;let style=readGeoStyle();
    if(style.renderer!=='single'&&!style.field)return toast('La simbología temática requiere seleccionar un campo.',true);
    if(style.renderer==='categorized'&&!style.categories.length)style.categories=SigmunTheme.buildCategories(geoEditor.geojson?.features||[],style.field,style.palette);
    if(style.renderer==='graduated'&&!style.classes.length)style.classes=SigmunTheme.buildClasses(geoEditor.geojson?.features||[],style.field,style.classCount,style.classification,style.palette);
    try{await SigmunDB.updateGeoLayer(id,{name:$('editGeoName').value.trim(),description:$('editGeoDescription').value.trim()||null,sort_order:Number($('editGeoOrder').value)||0,style,is_public:$('editGeoPublic').checked,is_visible:$('editGeoVisible').checked});closeModal('geoEditModal');await refreshAll();toast('Simbología, leyenda y configuración guardadas.')}catch(e){toast(e.message,true)}
  };
  async function removeGeo(id){const l=state.geo.find(x=>x.id===id);if(!confirm(`¿Eliminar la capa geográfica “${l?.name||''}” y todas sus geometrías?`))return;try{await SigmunDB.deleteGeoLayer(id);await refreshAll();toast('Capa geográfica eliminada.')}catch(e){toast(e.message,true)}}

  function renderStats(){
    $('statCount').textContent=state.stats.length;
    $('adminStatList').innerHTML=state.stats.map(l=>{const dv=l.chart_config?.default_view||{},model=Object.keys(l.chart_config?.field_roles||{}).length;return`<div class="rich-row"><span class="status-dot ${l.is_public?'on':''}"></span><div class="grow"><div class="primary"><b>${esc(l.name)}</b><span class="privacy-pill ${l.is_public?'public':'private'}">${l.is_public?'Pública':'Privada'}</span>${dv.chart?`<span class="type-pill">Vista: ${esc(dv.chart)}</span>`:''}</div><div class="secondary">${esc(projectName(l.project_id))} · ${Number(l.metadata?.record_count||0).toLocaleString('es-MX')} registros · ${Array.isArray(l.schema_fields)?l.schema_fields.length:0} campos · ${model?'Modelo configurado':'Detección automática'} · Orden ${l.sort_order||0}</div></div><div class="row-actions"><button class="mini-icon" title="Modelo y dashboard" data-edit-stat="${l.id}"><i class="bi bi-sliders"></i></button><button class="mini-icon danger" data-delete-stat="${l.id}"><i class="bi bi-trash"></i></button></div></div>`}).join('')||'<div class="empty">Sin capas estadísticas.</div>';
    document.querySelectorAll('[data-edit-stat]').forEach(b=>b.onclick=()=>editStat(b.dataset.editStat));document.querySelectorAll('[data-delete-stat]').forEach(b=>b.onclick=()=>removeStat(b.dataset.deleteStat));
  }
  function autoDefaultFromRows(rows,roles={}){
    const profiles=SigmunData.profileFields(rows,roles).filter(p=>!p.hidden),time=profiles.find(p=>p.role==='time'),measure=profiles.find(p=>p.role==='measure'),dimension=profiles.find(p=>p.role==='dimension'&&p.unique>1&&p.unique<=40);
    if(time&&measure)return{chart:'line',aggregation:'sum',time:time.name,dimension:'',series:dimension&&dimension.unique<=12?dimension.name:'',value:measure.name};
    if(dimension&&measure)return{chart:'bar',aggregation:'sum',time:'',dimension:dimension.name,series:'',value:measure.name};
    if(dimension)return{chart:'doughnut',aggregation:'count',time:'',dimension:dimension.name,series:'',value:''};
    if(measure)return{chart:'bar',aggregation:'sum',time:'',dimension:'',series:'',value:measure.name};
    return{chart:'bar',aggregation:'count',time:'',dimension:'',series:'',value:''};
  }
  $('uploadStatBtn').onclick=async()=>{
    const btn=$('uploadStatBtn'),file=$('statFile').files[0],name=$('statName').value.trim();if(!file||!name)return toast('Selecciona un CSV y asigna un nombre.',true);let layer=null;setBusy(btn,true,'Cargando…');setProgress('stat','Procesando CSV…',15);
    try{const rows=await SigmunData.parseStatFile(file);if(!rows.length)throw new Error('El CSV no contiene registros.');const s=SigmunData.summarize(rows),schema=SigmunData.inferSchema(rows),defaultView=autoDefaultFromRows(rows);const maxOrder=Math.max(0,...state.stats.filter(x=>x.project_id===$('statProject').value).map(x=>Number(x.sort_order)||0));setProgress('stat',`Detectados ${rows.length} registros y ${s.fields.length} campos…`,35);layer=await SigmunDB.createStatLayer({project_id:$('statProject').value,name,description:$('statDescription').value.trim()||null,source_format:'csv',source_file_name:file.name,schema_fields:schema,metadata:{record_count:rows.length,numeric_fields:s.numeric,categorical_fields:s.categorical,temporal_fields:s.temporal},chart_config:{version:2,field_roles:{},default_view:defaultView},is_public:$('statPublic').checked,sort_order:maxOrder+10,created_by:state.profile.id});setProgress('stat','Guardando registros…',55);await SigmunDB.insertStatRecords(layer.id,rows);setProgress('stat',`Carga completada: ${rows.length.toLocaleString('es-MX')} registros.`,100);$('statFile').value='';$('statName').value='';$('statDescription').value='';await refreshAll();toast('Base estadística almacenada y perfilada automáticamente.')}catch(e){if(layer?.id){try{await SigmunDB.deleteStatLayer(layer.id)}catch(_){}}setProgress('stat','Error: '+e.message,0);toast(e.message,true)}finally{setBusy(btn,false)}
  };

  function readStatFieldRoles(){const out={};$('statFieldModel').querySelectorAll('[data-stat-field]').forEach(r=>{const f=r.dataset.statField,role=r.querySelector('[data-field-role]').value,label=r.querySelector('[data-field-label]').value.trim();out[f]={role,label:label||f};});return out}
  function renderStatFieldModel(){
    const roles=statEditor.layer?.chart_config?.field_roles||{};statEditor.profiles=SigmunData.profileFields(statEditor.rows,roles);
    $('statFieldModel').innerHTML=statEditor.profiles.map(p=>`<div class="field-model-row" data-stat-field="${esc(p.name)}"><div class="field"><label>Campo original</label><input class="control" value="${esc(p.name)}" disabled></div><div class="field"><label>Etiqueta pública</label><input class="control" data-field-label value="${esc(p.label||p.name)}"></div><div class="field"><label>Rol analítico</label><select class="control" data-field-role><option value="auto" ${!roles[p.name]?.role||roles[p.name]?.role==='auto'?'selected':''}>Automático (${p.role})</option><option value="time" ${roles[p.name]?.role==='time'?'selected':''}>Tiempo / año</option><option value="dimension" ${roles[p.name]?.role==='dimension'?'selected':''}>Dimensión / categoría</option><option value="measure" ${roles[p.name]?.role==='measure'?'selected':''}>Medida / valor</option><option value="hidden" ${roles[p.name]?.role==='hidden'?'selected':''}>Ocultar</option></select></div><div class="field-type-badge">${p.type} · ${p.unique} únicos</div></div>`).join('')||'<div class="empty">Esta base no contiene campos.</div>';
    $('statFieldModel').querySelectorAll('select,input[data-field-label]').forEach(x=>x.addEventListener('change',()=>{refreshStatDefaultSelectors();renderStatPreview()}));
  }
  function effectiveStatProfiles(){return SigmunData.profileFields(statEditor.rows,readStatFieldRoles()).filter(p=>!p.hidden)}
  function fillSelect(id,profiles,role,includeAny=true){const old=$(id).value;const arr=role?profiles.filter(p=>p.role===role):profiles;$(id).innerHTML=(includeAny?'<option value="">— Ninguno —</option>':'')+arr.map(p=>`<option value="${esc(p.name)}">${esc(p.label||p.name)}</option>`).join('');if([...$(id).options].some(o=>o.value===old))$(id).value=old}
  function refreshStatDefaultSelectors(){const p=effectiveStatProfiles();fillSelect('statDefaultTime',p,'time');fillSelect('statDefaultDimension',p,'dimension');fillSelect('statDefaultSeries',p,'dimension');fillSelect('statDefaultValue',p,'measure')}
  function applyStatDefaultView(v){$('statDefaultChart').value=v.chart||'bar';$('statDefaultAgg').value=v.aggregation||'sum';refreshStatDefaultSelectors();['time','dimension','series','value'].forEach(k=>{const id='statDefault'+k[0].toUpperCase()+k.slice(1);if($(id)&&[...$(id).options].some(o=>o.value===(v[k]||'')))$(id).value=v[k]||''});renderStatPreview()}
  $('autoStatDefaultBtn').onclick=()=>applyStatDefaultView(autoDefaultFromRows(statEditor.rows,readStatFieldRoles()));
  ['statDefaultChart','statDefaultAgg','statDefaultTime','statDefaultDimension','statDefaultSeries','statDefaultValue'].forEach(id=>$(id).addEventListener('change',renderStatPreview));

  async function editStat(id){
    const l=state.stats.find(x=>x.id===id);if(!l)return;statEditor.layer=l;setEditorTab('stat','general');$('editStatId').value=l.id;$('editStatName').value=l.name;$('editStatDescription').value=l.description||'';$('editStatOrder').value=l.sort_order||0;$('editStatPublic').checked=!!l.is_public;openModal('statEditModal');$('statFieldModel').innerHTML='<div class="empty">Analizando campos…</div>';
    try{statEditor.rows=await SigmunDB.statRecords(id);renderStatFieldModel();refreshStatDefaultSelectors();applyStatDefaultView(l.chart_config?.default_view&&Object.keys(l.chart_config.default_view).length?l.chart_config.default_view:autoDefaultFromRows(statEditor.rows,l.chart_config?.field_roles||{}))}catch(e){toast(e.message,true)}
  }
  function statGroupData(rows,view){
    const xField=view.time||view.dimension,seriesField=view.series,valueField=view.value,agg=view.aggregation||'sum';if(!rows.length)return{labels:[],datasets:[]};
    if(!xField){const val=valueField?SigmunData.aggregate(rows.map(r=>r[valueField]),agg):rows.length;return{labels:[valueField||'Registros'],datasets:[{label:valueField||'Registros',data:[val]}]};}
    const xVals=SigmunData.smartSort(new Set(rows.map(r=>String(r[xField]??'Sin dato'))));const series=seriesField?[...new Set(rows.map(r=>String(r[seriesField]??'Sin dato')))].slice(0,16):[''];
    return{labels:xVals,datasets:series.map(sv=>({label:seriesField?sv:(valueField|| (agg==='count'?'Registros':'Valor')),data:xVals.map(x=>{const subset=rows.filter(r=>String(r[xField]??'Sin dato')===x&&(!seriesField||String(r[seriesField]??'Sin dato')===sv));return valueField?SigmunData.aggregate(subset.map(r=>r[valueField]),agg):subset.length})}))};
  }
  function renderStatPreview(){
    if(!$('statPreviewChart')||!statEditor.rows)return;if(statEditor.chart){statEditor.chart.destroy();statEditor.chart=null}const view={chart:$('statDefaultChart').value,aggregation:$('statDefaultAgg').value,time:$('statDefaultTime').value,dimension:$('statDefaultDimension').value,series:$('statDefaultSeries').value,value:$('statDefaultValue').value},g=statGroupData(statEditor.rows,view);let type=view.chart==='horizontal'||view.chart==='stacked'?'bar':view.chart==='area'?'line':view.chart;const options={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:g.datasets.length>1||type==='doughnut'}},scales:type==='doughnut'?{}:{x:{stacked:view.chart==='stacked'},y:{stacked:view.chart==='stacked',beginAtZero:true}}};if(view.chart==='horizontal')options.indexAxis='y';const datasets=g.datasets.map((d,i)=>({...d,borderWidth:2,tension:.25,fill:view.chart==='area'}));statEditor.chart=new Chart($('statPreviewChart'),{type,data:{labels:g.labels,datasets},options});$('statPreviewHint').textContent=`${g.labels.length} categorías · ${g.datasets.length} serie${g.datasets.length===1?'':'s'}`;
  }
  $('saveStatEditBtn').onclick=async()=>{
    const roles=readStatFieldRoles(),profiles=SigmunData.profileFields(statEditor.rows,roles);const defaultView={chart:$('statDefaultChart').value,aggregation:$('statDefaultAgg').value,time:$('statDefaultTime').value,dimension:$('statDefaultDimension').value,series:$('statDefaultSeries').value,value:$('statDefaultValue').value};
    const chartConfig={...(statEditor.layer?.chart_config||{}),version:2,field_roles:roles,default_view:defaultView};const schema=profiles.map(p=>({name:p.name,label:p.label,type:p.type,role:p.hidden?'hidden':p.role}));
    try{await SigmunDB.updateStatLayer($('editStatId').value,{name:$('editStatName').value.trim(),description:$('editStatDescription').value.trim()||null,sort_order:Number($('editStatOrder').value)||0,is_public:$('editStatPublic').checked,schema_fields:schema,chart_config:chartConfig});closeModal('statEditModal');await refreshAll();toast('Modelo estadístico y vista sugerida guardados.')}catch(e){toast(e.message,true)}
  };
  async function removeStat(id){const l=state.stats.find(x=>x.id===id);if(!confirm(`¿Eliminar la base estadística “${l?.name||''}” y todos sus registros?`))return;try{await SigmunDB.deleteStatLayer(id);await refreshAll();toast('Capa estadística eliminada.')}catch(e){toast(e.message,true)}}


  async function loadAudit(silent=false){if(!isAdmin())return;try{state.audit=await SigmunDB.auditLogs(150);renderAudit();if(!silent)return}catch(e){if(!silent)toast(e.message,true)}}
  function renderAudit(){
    const labels={bootstrap_admin:'Administrador inicial',create_user:'Usuario creado',update_user:'Usuario actualizado',delete_user:'Usuario eliminado'};
    $('auditList').innerHTML=state.audit.map(a=>`<div class="audit-row"><time>${fmtDate(a.created_at)}</time><span class="audit-action">${esc(labels[a.action]||a.action)}</span><span class="audit-detail">${esc(JSON.stringify(a.details||{}))}</span></div>`).join('')||'<div class="empty">Sin eventos registrados.</div>';
  }

  SigmunDB.client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'&& !$('adminApp').classList.contains('hidden')){state.session=null;state.profile=null;showGate('loginCard')}});
  init();
})();
