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


  function kmlColor(value){
    const raw=String(value||'').trim().replace(/^#/,'');
    if(!/^[0-9a-f]{6,8}$/i.test(raw))return null;
    if(raw.length===6)return{color:`#${raw}`,opacity:1};
    const a=parseInt(raw.slice(0,2),16)/255,b=raw.slice(2,4),g=raw.slice(4,6),r=raw.slice(6,8);
    return{color:`#${r}${g}${b}`.toLowerCase(),opacity:Math.max(0,Math.min(1,a))};
  }
  function kmlSection(body,tag){const m=String(body||'').match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,'i'));return m?m[1]:'';}
  function kmlRawTag(body,tag){const m=String(body||'').match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,'i'));return m?stripXmlTags(m[1]):'';}
  function parseKmlStyleBody(body){
    const line=kmlSection(body,'LineStyle'),poly=kmlSection(body,'PolyStyle'),icon=kmlSection(body,'IconStyle'),label=kmlSection(body,'LabelStyle');
    const lc=kmlColor(kmlRawTag(line,'color')),pc=kmlColor(kmlRawTag(poly,'color')),ic=kmlColor(kmlRawTag(icon,'color')),labc=kmlColor(kmlRawTag(label,'color'));
    const href=kmlRawTag(kmlSection(icon,'Icon'),'href');
    const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
    const bool=v=>v===''?null:!['0','false','no'].includes(String(v).trim().toLowerCase());
    return{
      lineColor:lc?.color||null,lineOpacity:lc?.opacity??null,lineWidth:num(kmlRawTag(line,'width')),
      fillColor:pc?.color||null,fillOpacity:pc?.opacity??null,fill:bool(kmlRawTag(poly,'fill')),outline:bool(kmlRawTag(poly,'outline')),
      iconColor:ic?.color||null,iconOpacity:ic?.opacity??null,iconScale:num(kmlRawTag(icon,'scale')),iconHref:href||null,
      labelColor:labc?.color||null,labelOpacity:labc?.opacity??null,labelScale:num(kmlRawTag(label,'scale'))
    };
  }
  function mergeKmlStyle(a={},b={}){const out={...a};Object.entries(b||{}).forEach(([k,v])=>{if(v!==null&&v!==undefined&&v!=='')out[k]=v});return out;}
  function extractKmlStyleRegistry(text){
    const source=String(text||''),raw={},maps={};let m;
    const styleRe=/<(?:[\w.-]+:)?Style\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Style>/gi;
    while((m=styleRe.exec(source)))raw[`#${xmlDecode(m[1])}`]=parseKmlStyleBody(m[2]);
    const mapRe=/<(?:[\w.-]+:)?StyleMap\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?StyleMap>/gi;
    while((m=mapRe.exec(source))){const pairs={};let pm;const pairRe=/<(?:[\w.-]+:)?Pair\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Pair>/gi;while((pm=pairRe.exec(m[2]))){const key=kmlRawTag(pm[1],'key'),url=kmlRawTag(pm[1],'styleUrl');if(key&&url)pairs[key]=url.startsWith('#')?url:`#${url}`;}maps[`#${xmlDecode(m[1])}`]=pairs;}
    const resolved={...raw};
    const resolve=(key,seen=new Set())=>{if(!key)return null;const k=key.startsWith('#')?key:`#${key}`;if(resolved[k])return resolved[k];if(seen.has(k))return null;seen.add(k);const target=maps[k]?.normal||maps[k]?.highlight;if(!target)return null;const x=resolve(target,seen);if(x)resolved[k]={...x,styleMapTarget:target};return resolved[k]||null;};
    Object.keys(maps).forEach(k=>resolve(k));
    return resolved;
  }
  function kmlStyleAttrs(styleUrl,fragment,registry={}){
    const key=styleUrl?(styleUrl.startsWith('#')?styleUrl:`#${styleUrl}`):'';
    let st=key?registry[key]:null;
    const inline=String(fragment||'').match(/<(?:[\w.-]+:)?Style\b(?![^>]*\bid\s*=)[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?Style>/i);
    if(inline)st=mergeKmlStyle(st||{},parseKmlStyleBody(inline[1]));
    if(!st)return{};
    const out={};if(key)out._kml_style=key;
    const map={fillColor:'_kml_fill_color',fillOpacity:'_kml_fill_opacity',lineColor:'_kml_line_color',lineOpacity:'_kml_line_opacity',lineWidth:'_kml_line_width',iconColor:'_kml_icon_color',iconOpacity:'_kml_icon_opacity',iconScale:'_kml_icon_scale',iconHref:'_kml_icon_href',labelColor:'_kml_label_color',labelOpacity:'_kml_label_opacity',labelScale:'_kml_label_scale',fill:'_kml_fill',outline:'_kml_outline'};
    Object.entries(map).forEach(([src,dst])=>{if(st[src]!==null&&st[src]!==undefined&&st[src]!=='')out[dst]=st[src]});return out;
  }

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
  function kmlAttributes(fragment,registry={}){
    const descMatch=String(fragment||'').match(/<(?:[\w.-]+:)?description\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:[\w.-]+:)?description>/i),desc=descMatch?descMatch[1]:'';
    const style=firstKmlTag(fragment,'styleUrl');
    return{...kmlDescriptionAttributes(desc),...kmlExtendedAttributes(fragment),...kmlStyleAttrs(style,fragment,registry),...(style?{_kml_style:style.startsWith('#')?style:`#${style}`}:{})};
  }
  function kmlGroundOverlays(text){
    const out=[],source=String(text||''),re=/<(?:[\w.-]+:)?GroundOverlay\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?GroundOverlay>/gi;let m;
    while((m=re.exec(source))){
      const body=m[1],name=firstKmlTag(body,'name')||'Cobertura ráster',href=kmlRawTag(kmlSection(body,'Icon'),'href');
      const num=t=>{const v=Number(kmlRawTag(kmlSection(body,'LatLonBox'),t));return Number.isFinite(v)?v:null};
      const north=num('north'),south=num('south'),east=num('east'),west=num('west'),rotation=num('rotation'),drawOrder=Number(firstKmlTag(body,'drawOrder')||0);
      const kc=kmlColor(firstKmlTag(body,'color'))||{color:'#ffffff',opacity:1};
      if([north,south,east,west].every(Number.isFinite))out.push({name,href:href||'',north,south,east,west,rotation:Number.isFinite(rotation)?rotation:0,drawOrder:Number.isFinite(drawOrder)?drawOrder:0,opacity:kc.opacity,color:kc.color});
    }
    return out;
  }
  function mimeFromName(name=''){
    const ext=String(name).split('.').pop().toLowerCase();
    return ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='gif'?'image/gif':ext==='webp'?'image/webp':ext==='svg'?'image/svg+xml':'image/png';
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
    const s=String(text||''),root=(s.match(/<(?:\w+:)?kml\b[^>]*>/i)||[''])[0];
    return{uncompressed_bytes:new Blob([s]).size,placemarks:(s.match(/<(?:\w+:)?Placemark\b/gi)||[]).length,points:(s.match(/<(?:\w+:)?Point\b/gi)||[]).length,polygons:(s.match(/<(?:\w+:)?Polygon\b/gi)||[]).length,lines:(s.match(/<(?:\w+:)?LineString\b/gi)||[]).length,multigeometry:(s.match(/<(?:\w+:)?MultiGeometry\b/gi)||[]).length,missing_xsi_namespace:/\bxsi:/.test(s)&&!/\bxmlns:xsi\s*=/.test(root)};
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
  function kmlItemContext(attrs,contextStack){
    const docs=contextStack.filter(x=>x.kind==='Document'&&x.name).map(x=>x.name),folders=contextStack.filter(x=>x.kind==='Folder'&&x.name).map(x=>x.name),hierarchy=contextStack.filter(x=>x.name).map(x=>x.name);
    if(docs.length){attrs._kml_document=docs[docs.length-1];attrs._kml_document_path=docs.join(' / ')}
    if(folders.length){attrs._kml_folder=folders[folders.length-1];attrs._kml_folder_path=folders.join(' / ');attrs._kml_subfolder=folders[folders.length-1]}
    if(hierarchy.length)attrs._kml_hierarchy=hierarchy.join(' / ');
    return attrs;
  }
  function buildKmlGroups(parsed){
    const map=new Map(),order=[];
    const ensure=(key,name)=>{if(!map.has(key)){map.set(key,{key,name,points:[],polygons:[],lines:[],overlays:[],folders:new Set(),styles:new Set()});order.push(key)}return map.get(key)};
    const add=(kind,item)=>{const a=item.attributes||{},name=a._kml_document||a._kml_folder||'Capa KML',key=name||'Capa KML',g=ensure(key,name);g[kind].push(item);if(a._kml_folder_path||a._kml_folder)g.folders.add(a._kml_folder_path||a._kml_folder);if(a._kml_style)g.styles.add(a._kml_style)};
    (parsed.points||[]).forEach(x=>add('points',x));(parsed.polygons||[]).forEach(x=>add('polygons',x));(parsed.lines||[]).forEach(x=>add('lines',x));
    (parsed.overlays||[]).forEach(o=>{const name=o.document||o.name||'Cobertura ráster',g=ensure(name,name);g.overlays.push(o)});
    return order.map((k,i)=>{const g=map.get(k),featureCount=g.points.length+g.polygons.length+g.lines.length+g.overlays.length;return{key:g.key,name:g.name,index:i,points:g.points,polygons:g.polygons,lines:g.lines,overlays:g.overlays,featureCount,folders:[...g.folders],styles:[...g.styles]}}).filter(g=>g.featureCount);
  }
  async function parseLargeKml(text,options={}){
    const onProgress=typeof options.onProgress==='function'?options.onProgress:()=>{},registry=options.kmlStyles||extractKmlStyleRegistry(text),store={points:[],polygons:[],lines:[]},ignored=[],s=String(text||'');let pos=0,count=0,lastYield=0,contextPos=0;
    const contextStack=[],documentNames=[],folderNames=[],contextRe=/<\/?(?:[\w.-]+:)?(Document|Folder)\b[^>]*>/gi;
    function advanceContext(to){
      contextRe.lastIndex=contextPos;let m;
      while((m=contextRe.exec(s))){
        if(m.index>=to){contextPos=m.index;return}
        const closing=/^<\//.test(m[0]),kind=m[1];
        if(closing){for(let z=contextStack.length-1;z>=0;z--){if(contextStack[z].kind===kind){contextStack.splice(z);break}}}
        else{
          const after=s.slice(contextRe.lastIndex,Math.min(contextRe.lastIndex+2200,s.length)),nm=after.match(/^\s*<(?:[\w.-]+:)?name\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?name>/i),label=nm?stripXmlTags(nm[1]):'';
          contextStack.push({kind,name:label});if(label&&kind==='Document'&&!documentNames.includes(label))documentNames.push(label);if(label&&kind==='Folder'&&!folderNames.includes(label))folderNames.push(label);
        }
        contextPos=contextRe.lastIndex;
      }
      contextPos=to;
    }
    while(true){
      const openRe=/<(?:[\w.-]+:)?Placemark\b/ig;openRe.lastIndex=pos;const om=openRe.exec(s);if(!om)break;const i=om.index;advanceContext(i);const closeRe=/<\/(?:[\w.-]+:)?Placemark>/ig;closeRe.lastIndex=i;const cm=closeRe.exec(s);if(!cm){ignored.push('Placemark incompleto');break}const frag=s.slice(i,closeRe.lastIndex),name=firstKmlTag(frag,'name')||`Elemento ${count+1}`,attrs=kmlItemContext(kmlAttributes(frag,registry),contextStack);
      const pointBlocks=allKmlBlocks(frag,'Point'),polyBlocks=allKmlBlocks(frag,'Polygon'),lineBlocks=allKmlBlocks(frag,'LineString');
      for(const b of pointBlocks){const c=kmlCoordinateBlock(b);if(c.length)store.points.push({lat:c[0][1],lon:c[0][0],name,attributes:{...attrs}});else ignored.push('Point sin coordenadas')}
      if(polyBlocks.length){const polygons=[];for(const b of polyBlocks){const rings=kmlPolygonCoordinates(b);if(rings)polygons.push(rings);else ignored.push('Polygon inválido')}if(polygons.length)store.polygons.push({geometry:{type:'MultiPolygon',coordinates:polygons},name,attributes:{...attrs}})}
      if(lineBlocks.length){const lines=[];for(const b of lineBlocks){const c=kmlCoordinateBlock(b);if(c.length>=2)lines.push(c);else ignored.push('LineString inválido')}if(lines.length)store.lines.push({geometry:{type:'MultiLineString',coordinates:lines},name,attributes:{...attrs}})}
      if(!pointBlocks.length&&!polyBlocks.length&&!lineBlocks.length){const known=frag.match(/<(?:gx:)?(Track|MultiTrack|Model)\b/i);ignored.push(known?known[1]:'Geometría no reconocida')}
      count++;pos=closeRe.lastIndex;
      if(count-lastYield>=750){lastYield=count;onProgress(`Leyendo KML: ${count.toLocaleString('es-MX')} elementos…`,15+Math.round((pos/s.length)*20));await new Promise(r=>setTimeout(r,0))}
    }
    const overlays=kmlGroundOverlays(s);
    const result={...store,overlays,ignored,parser:'streaming',placemark_count:count,kmlStyles:registry,documents:documentNames,folders:folderNames};result.groups=buildKmlGroups(result);return result;
  }
  async function parseKmlText(rawText,format,options={}){
    const diagnostics=kmlDiagnostics(rawText),text=repairKmlXml(rawText),registry=extractKmlStyleRegistry(text);if(diagnostics.missing_xsi_namespace)diagnostics.repaired_xsi_namespace=true;
    const parsed=await parseLargeKml(text,{...options,kmlStyles:registry});diagnostics.document_names=parsed.documents;diagnostics.folder_names=parsed.folders;diagnostics.styles=Object.keys(registry).length;diagnostics.ground_overlays=(parsed.overlays||[]).length;
    if(!(parsed.points.length||parsed.polygons.length||parsed.lines.length)){
      try{const xml=new DOMParser().parseFromString(text,'text/xml'),parseError=xml.querySelector('parsererror');if(!parseError){const gj=toGeoJSON.kml(xml),fallback=geojsonFeaturesToStorage(gj);if(fallback.points.length||fallback.polygons.length||fallback.lines.length)return{format,...fallback,geometryKey:null,parser:'togeojson-fallback',placemark_count:diagnostics.placemarks,diagnostics,kmlStyles:registry,groups:buildKmlGroups(fallback)}}}catch(_){}
    }
    return{format,...parsed,geometryKey:null,diagnostics};
  }
  async function parseGeoFile(file,options={}){
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    if(ext==='csv'){const rows=csvRows(await readTextFile(file)),parsed=rowsToGeometries(rows);return{format:'csv',lines:[],diagnostics:{rows:rows.length},groups:[],kmlStyles:{},...parsed}}
    if(['kml','kmz'].includes(ext)){
      const onProgress=typeof options.onProgress==='function'?options.onProgress:()=>{};let text,kmlName=file.name,kmlEntries=[file.name],zip=null;
      if(ext==='kml')text=await readTextFile(file);
      else{
        onProgress('Descomprimiendo KMZ…',10);zip=await JSZip.loadAsync(await file.arrayBuffer());const names=Object.keys(zip.files).filter(n=>n.toLowerCase().endsWith('.kml'));
        if(!names.length)throw new Error('El KMZ no contiene ningún archivo KML.');kmlEntries=names;kmlName=names.find(n=>/(^|\/)doc\.kml$/i.test(n))||names[0];text=decodeBytes(await zip.files[kmlName].async('uint8array'));
      }
      onProgress(`Analizando estructura, subcarpetas y estilos de ${kmlName}…`,14);const parsed=await parseKmlText(text,ext,{onProgress});parsed.kmlName=kmlName;parsed.kmlEntries=kmlEntries;parsed.diagnostics.kml_entries=kmlEntries.length;
      if(zip){
        const enrich=async(href,maxBytes=1500000)=>{
          if(!href||/^(?:https?:|data:)/i.test(href))return null;
          const cleanHref=href.replace(/^\.\//,'');const entry=zip.files[cleanHref]||zip.files[decodeURIComponent(cleanHref)];
          if(!entry||entry.dir)return null;const bytes=await entry.async('uint8array');if(bytes.byteLength>maxBytes)return null;
          let bin='';for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode(...bytes.slice(i,i+8192));
          return`data:${mimeFromName(cleanHref)};base64,${btoa(bin)}`;
        };
        for(const st of Object.values(parsed.kmlStyles||{})){if(st?.iconHref&&!st.iconDataUrl){try{st.iconDataUrl=await enrich(st.iconHref,300000)}catch(_){}}}
        for(const ov of parsed.overlays||[]){if(ov.href&&!ov.dataUrl){try{ov.dataUrl=await enrich(ov.href,1500000)}catch(_){}}}
        parsed.groups=buildKmlGroups(parsed);
      }
      return parsed;
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

  window.SigmunData={decodeBytes,readTextFile,detectCoords,detectGeometryField,rowsToPoints,rowsToGeometries,parseWKT,parseGeometryValue,normalizePolygonGeometry,normalizeLineGeometry,kmlColor,extractKmlStyleRegistry,kmlStyleAttrs,kmlGroundOverlays,repairKmlXml,kmlDiagnostics,geojsonFeaturesToStorage,buildKmlGroups,parseGeoFile,parseStatFile,summarize,counts,numeric,download,profileFields,fieldProfile,aggregate,smartSort,formatNumber,inferSchema,norm};
})();
