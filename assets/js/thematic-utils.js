(() => {
  'use strict';

  const PALETTES = {
    municipal: ['#dceafd','#9ec5f8','#5d9fe8','#2474c6','#0b3f78','#06294e','#031b35'],
    bluegreen: ['#e6f5f7','#b9e1e6','#78c8cf','#3aa9b5','#15818f','#0c5a66','#073c45'],
    warm: ['#fff1dc','#ffd59d','#f6ac59','#e3782c','#bd4d21','#87331e','#5d231a'],
    green: ['#e9f5e7','#c4e4bb','#8bca7d','#51aa52','#2b853a','#19632c','#104720'],
    purple: ['#f0eafa','#d7c9f1','#b49be2','#8b6dcc','#6646ad','#493288','#322363'],
    categorical: ['#0f4fa8','#11a0a8','#d48806','#7b61a8','#3f8f49','#c84f5a','#527aa3','#a16b3a','#6c7a89','#2f7d73','#a75087','#6366a8']
  };

  const DEFAULT_STYLE = {
    renderer: 'single',
    color: '#0f4fa8',
    weight: 2,
    opacity: 0.85,
    fillOpacity: 0.32,
    radius: 7,
    field: '',
    classification: 'equal_interval',
    classCount: 5,
    palette: 'municipal',
    categories: [],
    classes: [],
    noDataColor: '#b9c2cc',
    labelField: 'name',
    preserveKmlStyle: false,
    respectSourceStyle: false,
    kmlStyles: {},
    kmlOpacity: 1,
    kmlLegendField: '',
    legend: { show: true, title: '', noDataLabel: 'Sin dato' }
  };

  const clamp01 = v => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 1));
  function normalizeStyle(style = {}) {
    const legend = { ...DEFAULT_STYLE.legend, ...(style.legend || {}) };
    return { ...DEFAULT_STYLE, ...style, kmlStyles: style.kmlStyles || {}, legend };
  }
  function colorAt(index,total,paletteName='municipal'){
    const p=PALETTES[paletteName]||PALETTES.municipal;
    if(total<=1)return p[Math.floor((p.length-1)/2)];
    const pos=Math.round(index*(p.length-1)/Math.max(1,total-1));
    return p[Math.max(0,Math.min(p.length-1,pos))];
  }
  function comparable(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:String(v).trim()}
  function uniqueValues(features,field,max=50){
    if(!field)return[];const seen=new Map();
    for(const f of features||[]){const v=f?.properties?.[field];if(v===null||v===undefined||v==='')continue;const key=String(v);if(!seen.has(key))seen.set(key,v);if(seen.size>=max)break}
    return[...seen.values()];
  }
  function numericValues(features,field){return(features||[]).map(f=>Number(f?.properties?.[field])).filter(Number.isFinite).sort((a,b)=>a-b)}
  function prettyNumber(v){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(n):String(v??'')}
  function buildCategories(features,field,paletteName='categorical',existing=[]){
    const values=uniqueValues(features,field,40),old=new Map((existing||[]).map(x=>[String(x.value),x]));
    return values.map((value,i)=>{const prev=old.get(String(value));return{value,label:prev?.label||String(value),color:prev?.color||colorAt(i,values.length,paletteName)}})
  }
  function quantile(sorted,q){if(!sorted.length)return NaN;if(sorted.length===1)return sorted[0];const pos=(sorted.length-1)*q,base=Math.floor(pos),rest=pos-base;return sorted[base+1]!==undefined?sorted[base]+rest*(sorted[base+1]-sorted[base]):sorted[base]}
  function buildClasses(features,field,count=5,method='equal_interval',paletteName='municipal'){
    const vals=numericValues(features,field);if(!vals.length)return[];const min=vals[0],max=vals[vals.length-1],n=Math.max(2,Math.min(9,Number(count)||5)),bounds=[min];
    if(min===max)bounds.push(max);else if(method==='quantile'){for(let i=1;i<n;i++)bounds.push(quantile(vals,i/n));bounds.push(max)}else{const step=(max-min)/n;for(let i=1;i<n;i++)bounds.push(min+step*i);bounds.push(max)}
    return bounds.slice(0,-1).map((from,i)=>{const to=bounds[i+1];return{min:Number(from.toPrecision(12)),max:Number(to.toPrecision(12)),label:`${prettyNumber(from)} – ${prettyNumber(to)}`,color:colorAt(i,bounds.length-1,paletteName)}})
  }
  function categoryForValue(styleInput,value){const style=normalizeStyle(styleInput);return(style.categories||[]).find(c=>String(c.value)===String(value))||null}
  function colorForValue(styleInput,value){
    const style=normalizeStyle(styleInput);if(value===null||value===undefined||value==='')return style.noDataColor;
    if(style.renderer==='categorized'){const m=categoryForValue(style,value);return m?.color||style.noDataColor}
    if(style.renderer==='graduated'){const n=Number(value);if(!Number.isFinite(n))return style.noDataColor;const cs=style.classes||[];for(let i=0;i<cs.length;i++){const c=cs[i],last=i===cs.length-1;if(n>=Number(c.min)&&(last?n<=Number(c.max):n<Number(c.max)))return c.color}return style.noDataColor}
    return style.color;
  }

  function kmlResolvedStyle(styleInput,feature){
    const style=normalizeStyle(styleInput),p=feature?.properties||{},key=p._kml_style||'',base=(key&&style.kmlStyles?.[key])||{};
    const pick=(prop,k)=>p[prop]!==undefined&&p[prop]!==null&&p[prop]!==''?p[prop]:base[k];
    return{
      key,
      fillColor:pick('_kml_fill_color','fillColor')||style.color,
      fillOpacity:pick('_kml_fill_opacity','fillOpacity'),
      lineColor:pick('_kml_line_color','lineColor')||pick('_kml_fill_color','fillColor')||style.color,
      lineOpacity:pick('_kml_line_opacity','lineOpacity'),
      lineWidth:pick('_kml_line_width','lineWidth'),
      iconColor:pick('_kml_icon_color','iconColor')||pick('_kml_fill_color','fillColor')||style.color,
      iconOpacity:pick('_kml_icon_opacity','iconOpacity'),
      iconScale:pick('_kml_icon_scale','iconScale'),
      iconHref:pick('_kml_icon_href','iconHref'),
      iconDataUrl:pick('_kml_icon_data_url','iconDataUrl')||base.iconUrl||null,
      fill:pick('_kml_fill','fill'),outline:pick('_kml_outline','outline')
    };
  }
  function kmlDisplay(styleObj={},geometryType=''){
    const isPoint=/Point/i.test(geometryType),isLine=/LineString/i.test(geometryType),fillOpacity=clamp01(styleObj.fillOpacity??1),lineOpacity=clamp01(styleObj.lineOpacity??1),iconOpacity=clamp01(styleObj.iconOpacity??styleObj.fillOpacity??1);
    if(isPoint)return{color:styleObj.iconColor||styleObj.fillColor||styleObj.lineColor||'#64748b',opacity:iconOpacity};
    if(isLine)return{color:styleObj.lineColor||styleObj.fillColor||'#64748b',opacity:lineOpacity};
    if(styleObj.fill!==false&&fillOpacity>.01)return{color:styleObj.fillColor||styleObj.lineColor||'#64748b',opacity:fillOpacity};
    return{color:styleObj.lineColor||styleObj.fillColor||'#64748b',opacity:lineOpacity};
  }
  function isKmlRenderer(styleInput){const s=normalizeStyle(styleInput);return s.renderer==='kml'||s.preserveKmlStyle===true}
  function colorForFeature(styleInput,feature){
    const style=normalizeStyle(styleInput);if(isKmlRenderer(style)){const k=kmlResolvedStyle(style,feature);return k.fillColor||k.lineColor||style.color}
    const value=style.field?feature?.properties?.[style.field]:null;return style.renderer==='single'?style.color:colorForValue(style,value)
  }
  function leafletPathStyle(styleInput,feature,opacityMultiplier=1){
    const style=normalizeStyle(styleInput),mul=clamp01(opacityMultiplier),geom=feature?.geometry?.type||'',isLine=/LineString/i.test(geom);
    if(isKmlRenderer(style)){
      const k=kmlResolvedStyle(style,feature),global=clamp01(style.kmlOpacity)*mul,lineOpacity=clamp01(k.lineOpacity??1)*global,fillOpacity=clamp01(k.fillOpacity??1)*global;
      return{color:k.lineColor||style.color,weight:Math.max(.25,Number(k.lineWidth??style.weight)||1),opacity:k.outline===false&&!isLine?0:lineOpacity,fillColor:k.fillColor||style.color,fillOpacity:k.fill===false||isLine?0:fillOpacity};
    }
    const color=colorForFeature(style,feature),source=style.respectSourceStyle?kmlResolvedStyle(style,feature):null,value=style.field?feature?.properties?.[style.field]:null,cat=style.renderer==='categorized'?categoryForValue(style,value):null;
    const outline=cat?.lineColor||cat?.outlineColor||source?.lineColor||style.outlineColor||color,outlineOpacity=cat?.lineOpacity??cat?.outlineOpacity??source?.lineOpacity??style.opacity??.85,weight=cat?.lineWidth??cat?.weight??source?.lineWidth??style.weight??2,fillOpacity=cat?.fillOpacity??source?.fillOpacity??style.fillOpacity??.32;
    return{color:outline,weight:Math.max(.25,Number(weight)||2),opacity:clamp01(outlineOpacity)*mul,fillColor:color,fillOpacity:isLine?0:clamp01(fillOpacity)*mul};
  }
  function leafletPointStyle(styleInput,feature,opacityMultiplier=1){
    const style=normalizeStyle(styleInput),mul=clamp01(opacityMultiplier);
    if(isKmlRenderer(style)){const k=kmlResolvedStyle(style,feature),global=clamp01(style.kmlOpacity)*mul,scale=Number(k.iconScale)||1;return{radius:Math.max(3,(Number(style.radius)||7)*Math.max(.5,Math.min(2.2,scale))),color:k.lineColor||k.iconColor||style.color,weight:Number(k.lineWidth??style.weight)||2,opacity:clamp01(k.lineOpacity??k.iconOpacity??1)*global,fillColor:k.iconColor||k.fillColor||style.color,fillOpacity:clamp01(k.iconOpacity??k.fillOpacity??1)*global}}
    const color=colorForFeature(style,feature),source=style.respectSourceStyle?kmlResolvedStyle(style,feature):null;return{radius:Number(style.radius)||7,color:source?.lineColor||style.outlineColor||color,weight:Number(source?.lineWidth??style.weight)||2,opacity:clamp01(source?.lineOpacity??style.opacity??.9)*mul,fillColor:source?.iconColor||color,fillOpacity:clamp01(source?.iconOpacity??style.fillOpacity??.72)*mul}
  }

  function fieldList(features){const set=new Set();(features||[]).slice(0,3000).forEach(f=>Object.keys(f?.properties||{}).forEach(k=>set.add(k)));return[...set].sort((a,b)=>a.localeCompare(b,'es'))}
  function publicFieldList(features){return fieldList(features).filter(k=>!k.startsWith('_kml_'))}
  function inferKmlLegendField(features){
    const fs=(features||[]).slice(0,5000),priority=['ZS','USO','Uso','uso','TIPO','Tipo','tipo','CATEGORIA','Categoría','Categoria','CLASE','Clase','SUBTIPO','Subtipo','AMBITO','ÁMBITO'],fields=publicFieldList(fs);
    for(const p of priority){const vals=fields.includes(p)?uniqueValues(fs,p,61):[];if(vals.length>1&&vals.length<=60)return p}
    let best='',score=-1;for(const f of fields){const vals=uniqueValues(fs,f,61);if(vals.length<2||vals.length>60)continue;const present=fs.filter(x=>x.properties?.[f]!==null&&x.properties?.[f]!==undefined&&x.properties?.[f]!=='').length;if(!present)continue;const s=(present/fs.length)*4+Math.min(vals.length,20)/20;if(s>score){score=s;best=f}}
    return best;
  }
  function kmlGroupingMode(features,styleInput={}){
    const style=normalizeStyle(styleInput),fs=features||[],folders=[...new Set(fs.map(f=>f.properties?._kml_folder_path||f.properties?._kml_subfolder||'').filter(Boolean))],field=style.kmlLegendField||inferKmlLegendField(fs);
    if(folders.length>1)return{type:'hierarchy',field:field||'',label:field?`Subcarpeta + ${field}`:'Subcarpeta'};if(field)return{type:'field',field,label:field};return{type:'style',field:'_kml_style',label:'Estilo KML'}
  }
  function kmlSubgroups(features,styleInput={}){
    const style=normalizeStyle(styleInput),mode=kmlGroupingMode(features,style),map=new Map();
    for(const f of features||[]){
      const p=f.properties||{},ks=kmlResolvedStyle(style,f),folder=p._kml_folder_path||p._kml_subfolder||p._kml_folder||'',category=mode.field?(p[mode.field]??''):'',styleKey=p._kml_style||'',geometryType=f?.geometry?.type||'';let baseLabel,key;
      if(mode.type==='hierarchy'){baseLabel=folder||'Sin carpeta';if(category!==''&&String(category)!==String(baseLabel))baseLabel+=` · ${category}`;key=category!==''?`${folder}||${category}`:`${folder}||${styleKey||'sin-estilo'}`}
      else if(mode.type==='field'){baseLabel=category!==''?category:(styleKey||'Sin categoría');key=String(baseLabel)}
      else{baseLabel=styleKey||'Estilo sin nombre';key=styleKey||String(baseLabel)}
      const display=kmlDisplay(ks,geometryType);
      if(!map.has(key))map.set(key,{key,label:String(baseLabel),styleKey,color:display.color,opacity:display.opacity,count:0,featureIds:new Set(),mode,folder,category,geometryType,styleCounts:new Map()});
      const g=map.get(key);g.count++;g.featureIds.add(String(f.id??''));if(styleKey)g.styleCounts.set(styleKey,(g.styleCounts.get(styleKey)||0)+1);
    }
    const arr=[...map.values()];arr.forEach(g=>{const domKey=[...g.styleCounts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||g.styleKey;if(domKey){g.styleKey=domKey;const d=style.kmlStyles?.[domKey];if(d){const display=kmlDisplay(d,g.geometryType);g.color=display.color||g.color;g.opacity=display.opacity}}g.displayLabel=g.label});
    return arr.sort((a,b)=>a.label.localeCompare(b.label,'es',{numeric:true}));
  }
  function categorizedSubgroups(features,styleInput={}){
    const style=normalizeStyle(styleInput);if(style.renderer!=='categorized'||!style.field)return[];
    const map=new Map((style.categories||[]).map(c=>[String(c.value),{...c,count:0,featureIds:new Set()}]));
    for(const f of features||[]){const v=f?.properties?.[style.field],key=String(v??'');if(!map.has(key))map.set(key,{value:v,label:v===null||v===undefined||v===''?style.legend?.noDataLabel||'Sin dato':String(v),color:style.noDataColor,count:0,featureIds:new Set()});const g=map.get(key);g.count++;g.featureIds.add(String(f.id??''))}
    return[...map.values()].filter(g=>g.count>0).map(g=>({key:`cat:${String(g.value??'')}`,label:g.label||String(g.value ?? style.legend?.noDataLabel ?? 'Sin dato'),displayLabel:g.label||String(g.value ?? style.legend?.noDataLabel ?? 'Sin dato'),color:g.color||style.noDataColor,count:g.count,featureIds:g.featureIds,category:g.value,mode:{type:'field',field:style.field,label:style.field}})).sort((a,b)=>a.label.localeCompare(b.label,'es',{numeric:true}));
  }
  function layerSubgroups(features,styleInput={}){const style=normalizeStyle(styleInput);if(isKmlRenderer(style))return kmlSubgroups(features,style);if(style.renderer==='categorized')return categorizedSubgroups(features,style);return[]}
  function legendItems(styleInput,features=null){
    const style=normalizeStyle(styleInput);
    if(isKmlRenderer(style)&&Array.isArray(features))return kmlSubgroups(features,style).map(g=>({label:g.displayLabel||g.label,color:g.color,opacity:g.opacity,value:g.key,count:g.count,styleKey:g.styleKey}));
    if(style.renderer==='categorized'){if(Array.isArray(features))return categorizedSubgroups(features,style).map(g=>({label:g.displayLabel||g.label,color:g.color,value:g.category,count:g.count}));return(style.categories||[]).map(c=>({label:c.label||String(c.value),color:c.color,value:c.value}))}
    if(style.renderer==='graduated')return(style.classes||[]).map(c=>({label:c.label||`${prettyNumber(c.min)} – ${prettyNumber(c.max)}`,color:c.color,min:c.min,max:c.max}));
    return[{label:style.legend?.singleLabel||'Elementos',color:style.color}];
  }

  window.SigmunTheme={PALETTES,DEFAULT_STYLE,normalizeStyle,colorAt,colorForValue,colorForFeature,leafletPathStyle,leafletPointStyle,legendItems,fieldList,publicFieldList,uniqueValues,numericValues,buildCategories,buildClasses,prettyNumber,comparable,kmlResolvedStyle,kmlDisplay,isKmlRenderer,inferKmlLegendField,kmlGroupingMode,kmlSubgroups,categorizedSubgroups,layerSubgroups,categoryForValue,clamp01};
})();
