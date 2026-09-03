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
  function normalizeLineGeometry(g){if(!g)return null;if(g.type==='LineString')return{type:'MultiLineString',coordinates:[g.coordinates]};if(g.type==='MultiLineString')return g;return null;}

  function xmlDecode(value){
    return String(value??'').replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(parseInt(d,10))).replace(/&quot;/gi,'"').replace(/&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&');
  }
  function stripXmlTags(value){return xmlDecode(String(value??'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
  function kmlSmartValue(value){
    const s=stripXmlTags(value);
    if(!s)return '';
    if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(s)&&!(/^0\d+/.test(s))){
      const n=Number(s);if(Number.isFinite(n))return n;
    }
    return s;
  }
  function kmlDescriptionAttributes(htmlText){
    const out={},html=String(htmlText||'');const re=/<tr[^>]*>\s*<td>\s*([^<]*?)\s*<\/td>\s*<td>\s*([^<]*?)\s*<\/td>\s*<\/tr>/gi;let m;
    while((m=re.exec(html))){const k=stripXmlTags(m[1]);if(k)out[k]=kmlSmartValue(m[2]);}
    return out;
  }
  function kmlExtendedAttributes(fragment){
    const out={};let m;
    const dataRe=/<(?:\w+:)?Data\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<(?:\w+:)?value\b[^>]*>([\s\S]*?)<\/(?:\w+:)?value>[\s\S]*?<\/(?:\w+:)?Data>/gi;
    while((m=dataRe.exec(fragment)))out[xmlDecode(m[1])]=kmlSmartValue(m[2]);
    const simpleRe=/<(?:\w+:)?SimpleData\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:\w+:)?SimpleData>/gi;
    while((m=simpleRe.exec(fragment)))out[xmlDecode(m[1])]=kmlSmartValue(m[2]);
    return out;
  }
  function firstKmlTag(fragment,tag){
    const re=new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,'i'),m=String(fragment||'').match(re);
    return m?stripXmlTags(m[1]):'';
  }
  function kmlAttributes(fragment){
    const descMatch=String(fragment||'').match(/<(?:[\w.-]+:)?description\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:[\w.-]+:)?description>/i),desc=descMatch?descMatch[1]:'';
    const attrs={...kmlDescriptionAttributes(desc),...kmlExtendedAttributes(fragment)},style=firstKmlTag(fragment,'styleUrl');
    if(style)attrs._kml_style=style;return attrs;
  }
  function kmlCoordinateList(raw){
    const out=[];for(const token of String(raw||'').trim().split(/\s+/).filter(Boolean)){
      const p=token.split(',');if(p.length<2)continue;const lon=Number(p[0]),lat=Number(p[1]);
      if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<-180||lon>180||lat<-90||lat>90)continue;
      out.push([lon,lat]);
    }return out;
  }
  function kmlCoordinateBlock(fragment){
    const m=String(fragment||'').match(/<(?:[\w.-]+:)?coordinates\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?coordinates>/i);
    return m?kmlCoordinateList(m[1]):[];
  }
  function allKmlBlocks(fragment,tag){
    const out=[],re=new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,'gi');let m;
    while((m=re.exec(String(fragment||''))))out.push(m[1]);return out;
  }
  function kmlPolygonCoordinates(block){
    const outerBlocks=allKmlBlocks(block,'outerBoundaryIs'),innerBlocks=allKmlBlocks(block,'innerBoundaryIs');
    const outer=outerBlocks.length?kmlCoordinateBlock(outerBlocks[0]):kmlCoordinateBlock(block);if(outer.length<4)return null;
    const rings=[closeRing(outer)];for(const h of innerBlocks){const r=kmlCoordinateBlock(h);if(r.length>=4)rings.push(closeRing(r));}
    return rings;
  }
  function repairKmlXml(text){
    let s=String(text||'').replace(/\u0000/g,'');const root=s.match(/<(?:\w+:)?kml\b[^>]*>/i);
    if(root&&/\bxsi:/.test(s)&&!/\bxmlns:xsi\s*=/.test(root[0])){
      const fixed=root[0].replace(/>$/,' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">');s=s.slice(0,root.index)+fixed+s.slice(root.index+root[0].length);
    }
    return s;
  }
  function kmlDiagnostics(text){
    const s=String(text||''),root=(s.match(/<(?:\w+:)?kml\b[^>]*>/i)||[''])[0],documentNames=[];
    const docRe=/<(?:[\w.-]+:)?Document\b[^>]*>\s*<(?:[\w.-]+:)?name\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?name>/gi;let dm;
    while((dm=docRe.exec(s)))documentNames.push(stripXmlTags(dm[1]));
    return{uncompressed_bytes:new Blob([s]).size,placemarks:(s.match(/<(?:\w+:)?Placemark\b/gi)||[]).length,points:(s.match(/<(?:\w+:)?Point\b/gi)||[]).length,polygons:(s.match(/<(?:\w+:)?Polygon\b/gi)||[]).length,lines:(s.match(/<(?:\w+:)?LineString\b/gi)||[]).length,multigeometry:(s.match(/<(?:\w+:)?MultiGeometry\b/gi)||[]).length,documents:documentNames.length,document_names:documentNames,missing_xsi_namespace:/\bxsi:/.test(s)&&!/\bxmlns:xsi\s*=/.test(root)};
  }
  function pushGeoGeometry(g,name,attributes,store,ignored){
    if(!g)return;
    if(g.type==='GeometryCollection'){(g.geometries||[]).forEach(x=>pushGeoGeometry(x,name,attributes,store,ignored));return;}
    if(g.type==='Point'){const c=g.coordinates||[];if(Number.isFinite(Number(c[0]))&&Number.isFinite(Number(c[1])))store.points.push({lat:Number(c[1]),lon:Number(c[0]),name,attributes:{...attributes}});return;}
    if(g.type==='MultiPoint'){(g.coordinates||[]).forEach(c=>pushGeoGeometry({type:'Point',coordinates:c},name,attributes,store,ignored));return;}
    const poly=normalizePolygonGeometry(g);if(poly){store.polygons.push({geometry:poly,name,attributes:{...attributes}});return;}
    const line=normalizeLineGeometry(g);if(line){store.lines.push({geometry:line,name,attributes:{...attributes}});return;}
    ignored.push(g.type||'Unknown');
  }
  function expandDescriptionProps(props={}){
    const p={...props};if(typeof p.description==='string'){Object.assign(p,kmlDescriptionAttributes(p.description));delete p.description;}return p;
  }
  function geojsonFeaturesToStorage(gj){
    const store={points:[],polygons:[],lines:[]},ignored=[];
    (gj?.features||[]).forEach((f,i)=>{const p=expandDescriptionProps(f.properties||{}),name=p.name||p.nombre||`Elemento ${i+1}`;pushGeoGeometry(f.geometry,name,p,store,ignored);});
    return{...store,ignored};
  }
  async function parseLargeKml(text,options={}){
    const onProgress=typeof options.onProgress==='function'?options.onProgress:()=>{},store={points:[],polygons:[],lines:[]},ignored=[],s=String(text||'');let pos=0,count=0,lastYield=0,contextPos=0;
    const docStack=[],folderStack=[],contextRe=/<\/?(?:[\w.-]+:)?(Document|Folder)\b[^>]*>/gi;
    function advanceContext(to){
      contextRe.lastIndex=contextPos;let m;
      while((m=contextRe.exec(s))){
        if(m.index>=to){contextPos=m.index;return;}
        const closing=/^<\//.test(m[0]),kind=m[1];
        if(closing){if(kind==='Document')docStack.pop();else folderStack.pop();}
        else{
          const after=s.slice(contextRe.lastIndex,Math.min(contextRe.lastIndex+700,s.length)),nm=after.match(/^\s*<(?:[\w.-]+:)?name\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?name>/i),label=nm?stripXmlTags(nm[1]):'';
          if(kind==='Document')docStack.push(label);else folderStack.push(label);
        }
        contextPos=contextRe.lastIndex;
      }
      contextPos=to;
    }
    const placemarkStartRe=/<(?:[\w.-]+:)?Placemark\b[^>]*>/gi;
    const placemarkEndRe=/<\/(?:[\w.-]+:)?Placemark>/gi;
    while(true){
      placemarkStartRe.lastIndex=pos;const sm=placemarkStartRe.exec(s);if(!sm)break;const i=sm.index;advanceContext(i);
      placemarkEndRe.lastIndex=placemarkStartRe.lastIndex;const em=placemarkEndRe.exec(s);if(!em){ignored.push('Placemark incompleto');break;}
      const j=em.index,frag=s.slice(i,placemarkEndRe.lastIndex),name=firstKmlTag(frag,'name')||`Elemento ${count+1}`,attrs=kmlAttributes(frag);
      if(docStack.length&&docStack[docStack.length-1])attrs._kml_document=docStack[docStack.length-1];
      if(folderStack.length&&folderStack[folderStack.length-1])attrs._kml_folder=folderStack[folderStack.length-1];
      const pointBlocks=allKmlBlocks(frag,'Point'),polyBlocks=allKmlBlocks(frag,'Polygon'),lineBlocks=allKmlBlocks(frag,'LineString');
      for(const b of pointBlocks){const c=kmlCoordinateBlock(b);if(c.length)store.points.push({lat:c[0][1],lon:c[0][0],name,attributes:{...attrs}});else ignored.push('Point sin coordenadas');}
      if(polyBlocks.length){const polygons=[];for(const b of polyBlocks){const rings=kmlPolygonCoordinates(b);if(rings)polygons.push(rings);else ignored.push('Polygon inválido');}if(polygons.length)store.polygons.push({geometry:{type:'MultiPolygon',coordinates:polygons},name,attributes:{...attrs}});}
      if(lineBlocks.length){const lines=[];for(const b of lineBlocks){const c=kmlCoordinateBlock(b);if(c.length>=2)lines.push(c);else ignored.push('LineString inválido');}if(lines.length)store.lines.push({geometry:{type:'MultiLineString',coordinates:lines},name,attributes:{...attrs}});}
      if(!pointBlocks.length&&!polyBlocks.length&&!lineBlocks.length){const known=frag.match(/<(?:gx:)?(Track|MultiTrack|Model)\b/i);ignored.push(known?known[1]:'Geometría no reconocida');}
      count++;pos=placemarkEndRe.lastIndex;
      if(count-lastYield>=750){lastYield=count;onProgress(`Leyendo KML: ${count.toLocaleString('es-MX')} elementos…`,15+Math.round((pos/s.length)*20));await new Promise(r=>setTimeout(r,0));}
    }
    return{...store,ignored,parser:'streaming',placemark_count:count};
  }

  function kmlGroupName(item){
    const a=item?.attributes||{};
    return String(a._kml_document||a._kml_folder||a._kml_file||'Sin documento').trim()||'Sin documento';
  }
  function buildKmlGroups(parsed){
    const groups=new Map();
    const add=(kind,item)=>{
      const name=kmlGroupName(item),key=norm(name)||'sin_documento';
      if(!groups.has(key))groups.set(key,{key,name,points:[],polygons:[],lines:[]});
      groups.get(key)[kind].push(item);
    };
    (parsed?.points||[]).forEach(x=>add('points',x));
    (parsed?.polygons||[]).forEach(x=>add('polygons',x));
    (parsed?.lines||[]).forEach(x=>add('lines',x));
    return [...groups.values()].map((g,index)=>({...g,index,count:g.points.length+g.polygons.length+g.lines.length,geometry_counts:{points:g.points.length,polygons:g.polygons.length,lines:g.lines.length}})).sort((a,b)=>a.index-b.index);
  }
  function attachKmlGroups(parsed){
    const groups=buildKmlGroups(parsed);
    parsed.groups=groups;
    parsed.group_count=groups.length;
    parsed.group_summary=groups.map(g=>({name:g.name,count:g.count,points:g.points.length,polygons:g.polygons.length,lines:g.lines.length}));
    return parsed;
  }
  async function parseKmlText(rawText,format,options={}){
    const diagnostics=kmlDiagnostics(rawText),text=repairKmlXml(rawText),large=text.length>18_000_000;if(diagnostics.missing_xsi_namespace)diagnostics.repaired_xsi_namespace=true;
    if(large||options.captureGroups){const parsed=await parseLargeKml(text,options);return attachKmlGroups({format,...parsed,geometryKey:null,diagnostics});}
    const xml=new DOMParser().parseFromString(text,'text/xml'),parseError=xml.querySelector('parsererror');
    if(parseError){diagnostics.dom_parser_error=stripXmlTags(parseError.textContent||'XML inválido');const parsed=await parseLargeKml(text,options);return attachKmlGroups({format,...parsed,geometryKey:null,diagnostics});}
    const gj=toGeoJSON.kml(xml),parsed=geojsonFeaturesToStorage(gj);return attachKmlGroups({format,...parsed,geometryKey:null,parser:'togeojson',placemark_count:diagnostics.placemarks,diagnostics});
  }
  async function parseGeoFile(file,options={}){
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    if(ext==='csv'){const rows=csvRows(await readTextFile(file)),parsed=rowsToGeometries(rows);return{format:'csv',lines:[],diagnostics:{rows:rows.length},...parsed};}
    if(['kml','kmz'].includes(ext)){
      const onProgress=typeof options.onProgress==='function'?options.onProgress:()=>{};let text,kmlName=file.name;
      let kmlEntries=[];
      if(ext==='kml'){text=await readTextFile(file);kmlEntries=[file.name];}
      else{
        onProgress('Descomprimiendo KMZ…',14);const zip=await JSZip.loadAsync(await file.arrayBuffer()),names=Object.keys(zip.files).filter(n=>n.toLowerCase().endsWith('.kml'));
        if(!names.length)throw new Error('El KMZ no contiene ningún archivo KML.');kmlEntries=names;kmlName=names.find(n=>/(^|\/)doc\.kml$/i.test(n))||names[0];text=decodeBytes(await zip.files[kmlName].async('uint8array'));
      }
      onProgress(`Analizando ${kmlName}…`,18);const parsed=await parseKmlText(text,ext,{onProgress,captureGroups:options.captureGroups!==false});parsed.kmlName=kmlName;parsed.kmlEntries=kmlEntries;parsed.diagnostics.kml_entries=kmlEntries.length;return parsed;
    }
    throw new Error('Formato geográfico soportado: CSV, KML o KMZ.');
  }
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

  window.SigmunData={decodeBytes,readTextFile,detectCoords,detectGeometryField,rowsToPoints,rowsToGeometries,parseWKT,parseGeometryValue,normalizePolygonGeometry,normalizeLineGeometry,repairKmlXml,kmlDiagnostics,geojsonFeaturesToStorage,buildKmlGroups,parseGeoFile,parseStatFile,summarize,counts,numeric,download,profileFields,fieldProfile,aggregate,smartSort,formatNumber,inferSchema,norm};
})();
