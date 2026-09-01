(() => {
  'use strict';
  const norm=s=>String(s??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_');
  const LAT=['lat','latitude','latitud','y']; const LON=['lon','lng','long','longitude','longitud','x'];
  const GEOMETRY_FIELDS=['wkt','geometry','geom','the_geom','multipolygon','multi_polygon','polygon','geometria','geometría'];
  const TIME_HINTS=['ano','anio','year','fecha','date','periodo','period','mes','month','trimestre','quarter','semestre','week','semana'];

  function detectCoords(rows){
    if(!rows?.length)return{};
    const keys=Object.keys(rows[0]),map=new Map(keys.map(k=>[norm(k),k]));
    const latN=LAT.map(norm).find(x=>map.has(x)),lonN=LON.map(norm).find(x=>map.has(x));
    return {latKey:latN?map.get(latN):null,lonKey:lonN?map.get(lonN):null};
  }
  function detectGeometryField(rows){
    if(!rows?.length)return null;
    const keys=Object.keys(rows[0]),map=new Map(keys.map(k=>[norm(k),k]));
    const found=GEOMETRY_FIELDS.map(norm).find(x=>map.has(x));
    return found?map.get(found):null;
  }
  function csvRows(text){const p=Papa.parse(String(text||'').replace(/^\uFEFF/,''),{header:true,skipEmptyLines:true,dynamicTyping:true});if(p.errors?.length&&!p.data?.length)throw new Error(p.errors[0].message);return p.data;}
  function decodeBytes(bytes){const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const utf8=new TextDecoder('utf-8',{fatal:false}).decode(data).replace(/^\uFEFF/,'');const bad=(utf8.match(/\uFFFD/g)||[]).length;if(!bad)return utf8;try{const win=new TextDecoder('windows-1252').decode(data).replace(/^\uFEFF/,'');const winBad=(win.match(/\uFFFD/g)||[]).length;return winBad<bad?win:utf8;}catch(_){return utf8;}}
  async function readTextFile(file){return decodeBytes(await file.arrayBuffer());}

  function stripOuterPair(text){
    const s=String(text||'').trim();
    if(!s.startsWith('(')||!s.endsWith(')'))return s;
    let depth=0;
    for(let i=0;i<s.length;i++){
      if(s[i]==='(')depth++;
      else if(s[i]===')')depth--;
      if(depth===0&&i<s.length-1)return s;
    }
    return s.slice(1,-1).trim();
  }
  function splitTopLevel(text){
    const out=[];let depth=0,start=0;const s=String(text||'');
    for(let i=0;i<s.length;i++){
      if(s[i]==='(')depth++;
      else if(s[i]===')')depth--;
      else if(s[i]===','&&depth===0){out.push(s.slice(start,i).trim());start=i+1;}
    }
    out.push(s.slice(start).trim());
    return out.filter(Boolean);
  }
  function parseCoordinatePair(text){
    const nums=String(text||'').trim().split(/\s+/).map(Number);
    if(nums.length<2||!Number.isFinite(nums[0])||!Number.isFinite(nums[1]))throw new Error(`Coordenada WKT inválida: ${text}`);
    const lon=nums[0],lat=nums[1];
    if(lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new Error(`Coordenada fuera de rango geográfico: ${lon} ${lat}`);
    return [lon,lat];
  }
  function closeRing(ring){
    if(!ring.length)return ring;
    const a=ring[0],b=ring[ring.length-1];
    if(a[0]!==b[0]||a[1]!==b[1])ring.push([...a]);
    if(ring.length<4)throw new Error('Un anillo de polígono requiere al menos 4 coordenadas incluyendo el cierre.');
    return ring;
  }
  function parsePolygonBody(body){
    const inner=stripOuterPair(body);
    return splitTopLevel(inner).map(ringText=>{
      const ringInner=stripOuterPair(ringText);
      return closeRing(splitTopLevel(ringInner).map(parseCoordinatePair));
    });
  }
  function parseWKT(value){
    let text=String(value??'').trim();
    if(!text)return null;
    text=text.replace(/^SRID\s*=\s*\d+\s*;\s*/i,'');
    const match=text.match(/^([A-Z]+)(?:\s+Z|\s+M|\s+ZM)?\s*(.*)$/i);
    if(!match)throw new Error('WKT no reconocido.');
    const type=match[1].toUpperCase(),body=match[2].trim();
    if(/\bEMPTY\b/i.test(body))return null;
    if(type==='POINT'){
      const c=parseCoordinatePair(stripOuterPair(body));
      return {type:'Point',coordinates:c};
    }
    if(type==='POLYGON')return {type:'MultiPolygon',coordinates:[parsePolygonBody(body)]};
    if(type==='MULTIPOLYGON'){
      const inner=stripOuterPair(body);
      const polygons=splitTopLevel(inner).map(parsePolygonBody);
      return {type:'MultiPolygon',coordinates:polygons};
    }
    throw new Error(`Geometría WKT no soportada: ${type}. Usa POINT, POLYGON o MULTIPOLYGON.`);
  }
  function parseGeometryValue(value,fieldName=''){
    if(value===null||value===undefined||String(value).trim()==='')return null;
    if(typeof value==='object'){
      if(value.type)return normalizePolygonGeometry(value)||value;
      if(Array.isArray(value))return {type:'MultiPolygon',coordinates:value};
    }
    const text=String(value).trim();
    if(/^(?:SRID\s*=\s*\d+\s*;)?\s*(POINT|POLYGON|MULTIPOLYGON)\b/i.test(text))return parseWKT(text);
    if(text.startsWith('{')||text.startsWith('[')){
      try{
        const parsed=JSON.parse(text);
        if(parsed?.type==='Point')return parsed;
        const poly=normalizePolygonGeometry(parsed);
        if(poly)return poly;
        if(Array.isArray(parsed)&&/multipolygon/i.test(fieldName))return {type:'MultiPolygon',coordinates:parsed};
      }catch(_){}
    }
    throw new Error(`El campo ${fieldName||'de geometría'} no contiene WKT o MultiPolygon válido.`);
  }
  function attributesWithoutGeometry(row,keys=[]){
    const attrs={...row};
    keys.filter(Boolean).forEach(k=>delete attrs[k]);
    return attrs;
  }
  function rowsToGeometries(rows){
    const {latKey,lonKey}=detectCoords(rows),geometryKey=detectGeometryField(rows);
    if(!geometryKey&&(!latKey||!lonKey))throw new Error('El CSV geográfico debe contener lat/lon o un campo WKT/geometry/multipolygon.');
    const points=[],polygons=[],ignored=[];
    rows.forEach((r,i)=>{
      const name=r.name||r.nombre||r.titulo||`Registro ${i+1}`;
      const rawGeom=geometryKey?r[geometryKey]:null;
      if(rawGeom!==null&&rawGeom!==undefined&&String(rawGeom).trim()!==''){
        try{
          const g=parseGeometryValue(rawGeom,geometryKey);
          const attrs=attributesWithoutGeometry(r,[geometryKey,latKey,lonKey]);
          if(g?.type==='Point'){
            points.push({lat:Number(g.coordinates[1]),lon:Number(g.coordinates[0]),name,attributes:attrs});
          }else{
            const poly=normalizePolygonGeometry(g);
            if(poly)polygons.push({geometry:poly,name,attributes:attrs});
            else ignored.push(g?.type||'Unknown');
          }
        }catch(error){throw new Error(`Fila ${i+2}: ${error.message}`);}
        return;
      }
      if(latKey&&lonKey){
        const lat=Number(String(r[latKey]??'').replace(',','.')),lon=Number(String(r[lonKey]??'').replace(',','.'));
        if(Number.isFinite(lat)&&Number.isFinite(lon)){
          if(lat < -90 || lat > 90 || lon < -180 || lon > 180)throw new Error(`Fila ${i+2}: lat/lon fuera de rango geográfico.`);
          points.push({lat,lon,name,attributes:attributesWithoutGeometry(r,[latKey,lonKey,geometryKey])});
        }
      }
    });
    return {points,polygons,ignored,geometryKey,latKey,lonKey};
  }
  function rowsToPoints(rows){const {latKey,lonKey}=detectCoords(rows);if(!latKey||!lonKey)throw new Error('El CSV geográfico debe contener columnas lat y lon.');return rows.map((r,i)=>{const lat=Number(String(r[latKey]??'').replace(',','.')),lon=Number(String(r[lonKey]??'').replace(',','.'));if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;const attrs={...r};delete attrs[latKey];delete attrs[lonKey];return{lat,lon,name:r.name||r.nombre||`Registro ${i+1}`,attributes:attrs};}).filter(Boolean);}
  function normalizePolygonGeometry(g){if(!g)return null;if(g.type==='Polygon')return{type:'MultiPolygon',coordinates:[g.coordinates]};if(g.type==='MultiPolygon')return g;return null;}
  function geojsonFeaturesToStorage(gj){const points=[],polygons=[],ignored=[];(gj?.features||[]).forEach((f,i)=>{const p=f.properties||{},name=p.name||p.nombre||`Elemento ${i+1}`;if(f.geometry?.type==='Point'){points.push({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0],name,attributes:p});}else{const g=normalizePolygonGeometry(f.geometry);if(g)polygons.push({geometry:g,name,attributes:p});else ignored.push(f.geometry?.type||'Unknown');}});return{points,polygons,ignored};}
  async function parseGeoFile(file){const ext=(file.name.split('.').pop()||'').toLowerCase();if(ext==='csv'){const rows=csvRows(await readTextFile(file)),parsed=rowsToGeometries(rows);return{format:'csv',...parsed};}if(['kml','kmz'].includes(ext)){let text;if(ext==='kml')text=await readTextFile(file);else{const zip=await JSZip.loadAsync(await file.arrayBuffer()),name=Object.keys(zip.files).find(n=>n.toLowerCase().endsWith('.kml'));if(!name)throw new Error('El KMZ no contiene KML.');text=decodeBytes(await zip.files[name].async('uint8array'));}const xml=new DOMParser().parseFromString(text,'text/xml');const gj=toGeoJSON.kml(xml);return{format:ext,...geojsonFeaturesToStorage(gj),geometryKey:null};}throw new Error('Formato geográfico soportado: CSV, KML o KMZ.');}
  async function parseStatFile(file){const ext=(file.name.split('.').pop()||'').toLowerCase();if(ext==='csv')return csvRows(await readTextFile(file));throw new Error('Las capas estadísticas se cargan en CSV.');}

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

  window.SigmunData={decodeBytes,readTextFile,detectCoords,detectGeometryField,rowsToPoints,rowsToGeometries,parseWKT,parseGeometryValue,normalizePolygonGeometry,geojsonFeaturesToStorage,parseGeoFile,parseStatFile,summarize,counts,numeric,download,profileFields,fieldProfile,aggregate,smartSort,formatNumber,inferSchema,norm};
})();
