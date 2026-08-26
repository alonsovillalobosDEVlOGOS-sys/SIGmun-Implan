(() => {
  'use strict';
  const params=new URLSearchParams(location.search),project=(window.SIGMUN_PROJECTS||[]).find(p=>p.id===(params.get('project')||'indicadores'));
  if(project)dashboardTitle.textContent=project.title;
  let rows=[],source='',chart=null;
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt=v=>Number(v).toLocaleString('es-MX',{maximumFractionDigits:2});
  function toast(msg,error=false){const el=document.getElementById('toast');el.textContent=msg;el.classList.toggle('error',error);el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),3000)}
  function render(){
    const s=SigmunData.summarizeRows(rows);
    statCards.innerHTML=[['Registros',s.count],['Variables',s.fields.length],['Numéricas',s.numericFields.length],['Categóricas',s.categoricalFields.length]].map(([l,v])=>`<article class="stat-card"><span>${l}</span><strong>${Number(v).toLocaleString('es-MX')}</strong></article>`).join('');
    const cats=s.categoricalFields.length?s.categoricalFields:s.fields.slice(0,10);categoryField.innerHTML=cats.length?cats.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join(''):'<option>Sin datos</option>';if(cats[0])drawChart(cats[0]);else if(chart){chart.destroy();chart=null}
    numericField.innerHTML=s.numericFields.length?s.numericFields.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join(''):'<option>Sin campos numéricos</option>';renderNumeric(s.numericFields[0]);renderTable(s.fields);sourceNote.textContent=source?`Fuente activa: ${source}`:'No hay fuente cargada.';tableCount.textContent=`${s.count.toLocaleString('es-MX')} registros`
  }
  function drawChart(field){const series=SigmunData.categorySeries(rows,field,15);if(chart)chart.destroy();chart=new Chart(mainChart,{type:'bar',data:{labels:series.map(x=>x[0]),datasets:[{data:series.map(x=>x[1]),backgroundColor:'#0f4fa8',borderRadius:7}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:series.length>9?'y':'x',plugins:{legend:{display:false}},scales:{x:{grid:{color:'#edf1f5'}},y:{grid:{color:'#edf1f5'}}}}})}
  function renderNumeric(field){const box=numericKpis;if(!field){box.innerHTML='<div class="kpi"><span>Sin datos</span><b>—</b></div>';return}const st=SigmunData.numericSummary(rows,field);box.innerHTML=st?`<div class="kpi"><span>Suma</span><b>${fmt(st.sum)}</b></div><div class="kpi"><span>Promedio</span><b>${fmt(st.avg)}</b></div><div class="kpi"><span>Mínimo</span><b>${fmt(st.min)}</b></div><div class="kpi"><span>Máximo</span><b>${fmt(st.max)}</b></div>`:'<div class="kpi"><span>Sin datos</span><b>—</b></div>'}
  function renderTable(fields){if(!rows.length){dashboardTable.innerHTML='<tbody><tr><td style="padding:24px">Carga una fuente para visualizar la tabla.</td></tr></tbody>';return}const cols=fields.slice(0,16);dashboardTable.innerHTML=`<thead><tr>${cols.map(f=>`<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0,250).map(r=>`<tr>${cols.map(f=>`<td title="${esc(r[f])}">${esc(r[f])}</td>`).join('')}</tr>`).join('')}</tbody>`}
  const open=()=>sourceModal.classList.add('open'),close=()=>sourceModal.classList.remove('open');
  async function load(){
    const active=document.querySelector('.form-tab.active')?.dataset.formTab||'file';loadDashboardSource.disabled=true;loadDashboardSource.textContent='Cargando…';
    try{let d;if(active==='file'){const f=dashboardFile.files[0];if(!f)throw new Error('Selecciona un archivo.');d=await SigmunData.parseFile(f);source=f.name}else if(active==='sheet'){const u=SigmunData.sheetUrl(dashboardSheet.value,dashboardGid.value);d=await SigmunData.fetchDataset(u);source='Google Sheets'}else{const u=dashboardUrl.value.trim();if(!u)throw new Error('Ingresa una URL.');d=await SigmunData.fetchDataset(u);source=u}rows=d.rows||SigmunData.geojsonToRows(d.geojson);if(!rows.length)throw new Error('La fuente no contiene registros.');render();close();toast(`${rows.length.toLocaleString('es-MX')} registros cargados.`)}catch(e){console.error(e);toast(e.message||'No se pudo cargar.',true)}finally{loadDashboardSource.disabled=false;loadDashboardSource.textContent='Cargar'}
  }
  openSourceBtn.onclick=open;openSourceBtnHero.onclick=open;document.querySelectorAll('[data-close-source]').forEach(b=>b.onclick=close);loadDashboardSource.onclick=load;
  document.querySelectorAll('.form-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.form-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.form-pane').forEach(p=>p.classList.toggle('active',p.dataset.formPane===b.dataset.formTab))});
  categoryField.onchange=e=>drawChart(e.target.value);numericField.onchange=e=>renderNumeric(e.target.value);downloadCsvBtn.onclick=()=>rows.length?SigmunData.downloadCSV('sigmun-delicias-datos.csv',rows):toast('No hay datos.',true);downloadXlsxBtn.onclick=()=>rows.length?SigmunData.downloadXLSX('sigmun-delicias-datos.xlsx',rows):toast('No hay datos.',true);
  dashboardDropzone.onclick=()=>dashboardFile.click();['dragenter','dragover'].forEach(ev=>dashboardDropzone.addEventListener(ev,e=>{e.preventDefault();dashboardDropzone.classList.add('drag')}));['dragleave','drop'].forEach(ev=>dashboardDropzone.addEventListener(ev,e=>{e.preventDefault();dashboardDropzone.classList.remove('drag')}));dashboardDropzone.addEventListener('drop',e=>{if(e.dataTransfer.files[0])dashboardFile.files=e.dataTransfer.files});
  render()
})();
