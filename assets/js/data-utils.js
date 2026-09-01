(() => {
  'use strict';
  const norm=s=>String(s??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_');
  const LAT=['lat','latitude','latitud','y']; const LON=['lon','lng','long','longitude','longitud','x'];
  const TIME_HINTS=['ano','anio','year','fecha','date','periodo','period','mes','month','trimestre','quarter','semestre','week','semana'];

  function detectCoords(rows){
    if(!rows?.length)return{};
    const keys=Object.keys(rows[0]),map=new Map(keys.map(k=>[norm(k),k]));
    const latN=LAT.map(norm).find(x=>map.has(x)),lonN=LON.map(norm).find(x=>map.has(x));
    return {latKey:latN?map.get(latN):null,lonKey:lonN?map.get(lonN):null};
  }
  function csvRows(text){const p=Papa.parse(text,{header:true,skipEmptyLines:true,dynamicTyping:true});if(p.errors?.length&&!p.data?.length)throw new Error(p.errors[0].message);return p.data;}
  function rowsToPoints(rows){const {latKey,lonKey}=detectCoords(rows);if(!latKey||!lonKey)throw new Error('El CSV geográfico debe contener columnas lat y lon.');return rows.map((r,i)=>{const lat=Number(String(r[latKey]??'').replace(',','.')),lon=Number(String(r[lonKey]??'').replace(',','.'));if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;const attrs={...r};delete attrs[latKey];delete attrs[lonKey];return{lat,lon,name:r.name||r.nombre||`Registro ${i+1}`,attributes:attrs};}).filter(Boolean);}
  function normalizePolygonGeometry(g){if(!g)return null;if(g.type==='Polygon')return{type:'MultiPolygon',coordinates:[g.coordinates]};if(g.type==='MultiPolygon')return g;return null;}
  function geojsonFeaturesToStorage(gj){const points=[],polygons=[],ignored=[];(gj?.features||[]).forEach((f,i)=>{const p=f.properties||{},name=p.name||p.nombre||`Elemento ${i+1}`;if(f.geometry?.type==='Point'){points.push({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],name,attributes:p});}else{const g=normalizePolygonGeometry(f.geometry);if(g)polygons.push({geometry:g,name,attributes:p});else ignored.push(f.geometry?.type||'Unknown');}});return{points,polygons,ignored};}
  async function parseGeoFile(file){const ext=(file.name.split('.').pop()||'').toLowerCase();if(ext==='csv'){const rows=csvRows(await file.text());return{format:'csv',points:rowsToPoints(rows),polygons:[],ignored:[]};}if(['kml','kmz'].includes(ext)){let text;if(ext==='kml')text=await file.text();else{const zip=await JSZip.loadAsync(await file.arrayBuffer()),name=Object.keys(zip.files).find(n=>n.toLowerCase().endsWith('.kml'));if(!name)throw new Error('El KMZ no contiene KML.');text=await zip.files[name].async('text');}const xml=new DOMParser().parseFromString(text,'text/xml');const gj=toGeoJSON.kml(xml);return{format:ext,...geojsonFeaturesToStorage(gj)};}throw new Error('Formato geográfico soportado: CSV, KML o KMZ.');}
  async function parseStatFile(file){const ext=(file.name.split('.').pop()||'').toLowerCase();if(ext==='csv')return csvRows(await file.text());throw new Error('Las capas estadísticas se cargan en CSV.');}

  function isYearLike(values){
    const nums=values.map(Number).filter(Number.isFinite);
    if(!nums.length)return false;
    const ok=nums.filter(n=>Number.isInteger(n)&&n>=1900&&n<=2200).length;
    return ok/nums.length>=.8;
  }
  function isDateLike(values){
    const txt=values.filter(v=>v!==null&&v!==undefined&&v!=='').map(String);
    if(!txt.length)return false;
    const sample=txt.slice(0,80);
    const parsed=sample.filter(v=>!Number.isNaN(Date.parse(v)) && /[-/]|[A-Za-z]/.test(v)).length;
    return parsed/sample.length>=.7;
  }
  function fieldProfile(rows,field){
    const values=(rows||[]).map(r=>r?.[field]).filter(v=>v!==null&&v!==undefined&&v!=='');
    const unique=new Set(values.map(v=>String(v).trim())).size;
    const numericCount=values.filter(v=>Number.isFinite(Number(v))).length;
    const numeric=values.length>0&&numericCount/values.length>=.8;
    const hint=TIME_HINTS.some(h=>norm(field).includes(h));
    const year=numeric&&isYearLike(values);
    const date=!numeric&&isDateLike(values);
    const time=hint||year||date;
    let role='dimension',type='text';
    if(time){role='time';type=year?'year':date?'date':'time';}
    else if(numeric){role='measure';type='number';}
    else if(unique>0&&unique<=Math.max(40,Math.ceil(rows.length*.25))){role='dimension';type='category';}
    else {role='dimension';type='text';}
    return {name:field,label:field,type,role,unique,count:values.length,numeric,time,year,date};
  }
  function profileFields(rows,overrides={}){
    const fields=rows?.length?Object.keys(rows[0]).filter(f=>!f.startsWith('__')):[];
    return fields.map(field=>{
      const base=fieldProfile(rows,field),o=overrides?.[field]||{};
      return {...base,...o,name:field,label:o.label||base.label,role:o.role&&o.role!=='auto'?o.role:base.role,hidden:o.role==='hidden'||!!o.hidden};
    });
  }
  function summarize(rows){
    const profiles=profileFields(rows);
    const fields=profiles.map(p=>p.name);
    const numeric=profiles.filter(p=>p.numeric&&!p.time).map(p=>p.name);
    const categorical=profiles.filter(p=>p.role==='dimension'&&p.unique>1&&p.unique<=40).map(p=>p.name);
    const temporal=profiles.filter(p=>p.time).map(p=>p.name);
    return{count:rows?.length||0,fields,numeric,categorical,temporal,profiles};
  }
  function counts(rows,field,max=15){const m=new Map();rows.forEach(r=>{const k=String(r[field]??'Sin dato')||'Sin dato';m.set(k,(m.get(k)||0)+1)});return[...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,max);}
  function numeric(rows,field){const a=rows.map(r=>Number(r[field])).filter(Number.isFinite);if(!a.length)return null;const sum=a.reduce((x,y)=>x+y,0);const sorted=[...a].sort((x,y)=>x-y);const mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;return{sum,avg:sum/a.length,min:Math.min(...a),max:Math.max(...a),median,count:a.length};}
  function aggregate(values,method='sum'){
    const nums=values.map(Number).filter(Number.isFinite);
    if(method==='count')return values.filter(v=>v!==null&&v!==undefined&&v!=='').length;
    if(!nums.length)return 0;
    if(method==='avg')return nums.reduce((a,b)=>a+b,0)/nums.length;
    if(method==='min')return Math.min(...nums);
    if(method==='max')return Math.max(...nums);
    return nums.reduce((a,b)=>a+b,0);
  }
  function smartSort(values){
    return [...values].sort((a,b)=>{
      const na=Number(a),nb=Number(b);if(Number.isFinite(na)&&Number.isFinite(nb))return na-nb;
      const da=Date.parse(a),db=Date.parse(b);if(!Number.isNaN(da)&&!Number.isNaN(db))return da-db;
      return String(a).localeCompare(String(b),'es',{numeric:true});
    });
  }
  function formatNumber(v,max=2){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('es-MX',{maximumFractionDigits:max}).format(n):String(v??'—');}
  function download(name,text,type='text/plain'){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);}
  function inferSchema(rows){return profileFields(rows).map(p=>({name:p.name,label:p.label,type:p.type,role:p.role}));}

  window.SigmunData={detectCoords,rowsToPoints,normalizePolygonGeometry,geojsonFeaturesToStorage,parseGeoFile,parseStatFile,summarize,counts,numeric,download,profileFields,fieldProfile,aggregate,smartSort,formatNumber,inferSchema,norm};
})();
