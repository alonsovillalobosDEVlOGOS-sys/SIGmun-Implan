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
    const p=PALETTES[paletteName]||PALETTES.municipal;if(total<=1)return p[Math.floor((p.length-1)/2)];
    const pos=Math.round(index*(p.length-1)/Math.max(1,total-1));return p[Math.max(0,Math.min(p.length-1,pos))];
  }
  function comparable(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:String(v).trim()}
  function uniqueValues(features,field,max=50){if(!field)return[];const seen=new Map();for(const f of features||[]){const v=f?.properties?.[field];if(v===null||v===undefined||v==='')continue;const key=String(v);if(!seen.has(key))seen.set(key,v);if(seen.size>=max)break}return[...seen.values()]}
  function numericValues(features,field){return(features||[]).map(f=>Number(f?.properties?.[field])).filter(Number.isFinite).sort((a,b)=>a-b)}
  function prettyNumber(v){const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat('es-MX',{maximumFractionDigits:2}).format(n):String(v??'')}
  function buildCategories(features,field,paletteName='categorical',existing=[]){const values=uniqueValues(features,field,40),old=new Map((existing||[]).map(x=>[String(x.value),x]));return values.map((value,i)=>{const prev=old.get(String(value));return{value,label:prev?.label||String(value),color:prev?.color||colorAt(i,values.length,paletteName)}})}
  function quantile(sorted,q){if(!sorted.length)return NaN;if(sorted.length===1)return sorted[0];const pos=(sorted.length-1)*q,base=Math.floor(pos),rest=pos-base;return sorted[base+1]!==undefined?sorted[base]+rest*(sorted[base+1]-sorted[base]):sorted[base]}
  function buildClasses(features,field,count=5,method='equal_interval',paletteName='municipal'){
    const vals=numericValues(features,field);if(!vals.length)return[];const min=vals[0],max=vals[vals.length-1],n=Math.max(2,Math.min(9,Number(count)||5)),bounds=[min];
    if(min===max)bounds.push(max);else if(method==='quantile'){for(let i=1;i<n;i++)bounds.push(quantile(vals,i/n));bounds.push(max)}else{const step=(max-min)/n;for(let i=1;i<n;i++)bounds.push(min+step*i);bounds.push(max)}
    return bounds.slice(0,-1).map((from,i)=>{const to=bounds[i+1];return{min:Number(from.toPrecision(12)),max:Number(to.toPrecision(12)),label:`${prettyNumber(from)} – ${prettyNumber(to)}`,color:colorAt(i,bounds.length-1,paletteName)}});
  }
  function colorForValue(styleInput,value){const style=normalizeStyle(styleInput);if(value===null||value===undefined||value==='')return style.noDataColor;if(style.renderer==='categorized'){const m=(style.categories||[]).find(c=>String(c.value)===String(value));return m?.color||style.noDataColor}if(style.renderer==='graduated'){const n=Number(value);if(!Number.isFinite(n))return style.noDataColor;const cs=style.classes||[];for(let i=0;i<cs.length;i++){const c=cs[i],last=i===cs.length-1;if(n>=Number(c.min)&&(last?n<=Number(c.max):n<Number(c.max)))return c.color}return style.noDataColor}return style.color}

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
      fill:pick('_kml_fill','fill'),outline:pick('_kml_outline','outline')
    };
  }
  function isKmlRenderer(styleInput){const s=normalizeStyle(styleInput);return s.renderer==='kml'||s.preserveKmlStyle===true}
  function colorForFeature(styleInput,feature){const style=normalizeStyle(styleInput);if(isKmlRenderer(style))return kmlResolvedStyle(style,feature).fillColor||kmlResolvedStyle(style,feature).lineColor||style.color;const value=style.field?feature?.properties?.[style.field]:null;return style.renderer==='single'?style.color:colorForValue(style,value)}
  function leafletPathStyle(styleInput,feature,opacityMultiplier=1){
    const style=normalizeStyle(styleInput),mul=clamp01(opacityMultiplier);
    if(isKmlRenderer(style)){
      const k=kmlResolvedStyle(style,feature),global=clamp01(style.kmlOpacity)*mul,geom=feature?.geometry?.type||'',isLine=/LineString/i.test(geom);
      const lineOpacity=clamp01(k.lineOpacity??1)*global,fillOpacity=clamp01(k.fillOpacity??1)*global;
      return{color:k.lineColor||style.color,weight:Number(k.lineWidth??style.weight)||1,opacity:k.outline===false&&!isLine?0:lineOpacity,fillColor:k.fillColor||style.color,fillOpacity:k.fill===false||isLine?0:fillOpacity};
    }
    const color=colorForFeature(style,feature);return{color:style.outlineColor||color,weight:Number(style.weight)||2,opacity:clamp01(style.opacity??.85)*mul,fillColor:color,fillOpacity:clamp01(style.fillOpacity??.32)*mul};
  }
  function leafletPointStyle(styleInput,feature,opacityMultiplier=1){
    const style=normalizeStyle(styleInput),mul=clamp01(opacityMultiplier);
    if(isKmlRenderer(style)){const k=kmlResolvedStyle(style,feature),global=clamp01(style.kmlOpacity)*mul,scale=Number(k.iconScale)||1;return{radius:Math.max(3,(Number(style.radius)||7)*Math.max(.5,Math.min(2.2,scale))),color:k.lineColor||k.iconColor||style.color,weight:Number(k.lineWidth??style.weight)||2,opacity:clamp01(k.lineOpacity??k.iconOpacity??1)*global,fillColor:k.iconColor||k.fillColor||style.color,fillOpacity:clamp01(k.iconOpacity??k.fillOpacity??1)*global}}
    const color=colorForFeature(style,feature);return{radius:Number(style.radius)||7,color:style.outlineColor||color,weight:Number(style.weight)||2,opacity:clamp01(style.opacity??.9)*mul,fillColor:color,fillOpacity:clamp01(style.fillOpacity??.72)*mul};
  }

  function fieldList(features){const set=new Set();(features||[]).slice(0,3000).forEach(f=>Object.keys(f?.properties||{}).forEach(k=>set.add(k)));return[...set].sort((a,b)=>a.localeCompare(b,'es'))}
  function publicFieldList(features){return fieldList(features).filter(k=>!k.startsWith('_kml_'))}
  function inferKmlLegendField(features){
    const fs=(features||[]).slice(0,5000),priority=['ZS','USO','Uso','uso','TIPO','Tipo','tipo','CATEGORIA','Categoría','Categoria','CLASE','Clase','SUBTIPO','Subtipo','AMBITO','ÁMBITO'];
    const fields=publicFieldList(fs);for(const p of priority)if(fields.includes(p)&&uniqueValues(fs,p,61).length>1&&uniqueValues(fs,p,61).length<=60)return p;
    let best='',score=-1;for(const f of fields){const vals=uniqueValues(fs,f,61);if(vals.length<2||vals.length>60)continue;const present=fs.filter(x=>x.properties?.[f]!==null&&x.properties?.[f]!==undefined&&x.properties?.[f]!=='').length;if(!present)continue;const stylePairs=new Set(fs.map(x=>`${x.properties?._kml_style||''}|${String(x.properties?.[f]??'')}`));const s=(present/fs.length)*4 + Math.min(vals.length,20)/20 - Math.max(0,stylePairs.size-vals.length)/Math.max(1,fs.length);if(s>score){score=s;best=f}}
    return best;
  }
  function kmlGroupingMode(features,styleInput={}){
    const style=normalizeStyle(styleInput),fs=features||[],folders=[...new Set(fs.map(f=>f.properties?._kml_folder_path||f.properties?._kml_subfolder||'').filter(Boolean))],field=style.kmlLegendField||inferKmlLegendField(fs);
    if(folders.length>1)return{type:'hierarchy',field:field||'',label:field?`Subcarpeta + ${field}`:'Subcarpeta'};
    if(field)return{type:'field',field,label:field};
    return{type:'style',field:'_kml_style',label:'Estilo KML'};
  }
  function kmlSubgroups(features,styleInput={}){
    const style=normalizeStyle(styleInput),mode=kmlGroupingMode(features,style),map=new Map();
    for(const f of features||[]){
      const p=f.properties||{},ks=kmlResolvedStyle(style,f),folder=p._kml_folder_path||p._kml_subfolder||p._kml_folder||'',category=mode.field?(p[mode.field]??''):'',styleKey=p._kml_style||'';
      let baseLabel,key;
      if(mode.type==='hierarchy'){baseLabel=folder||'Sin carpeta';if(category!==''&&String(category)!==String(baseLabel))baseLabel+=` · ${category}`;key=`${folder}||${category}||${styleKey}`;}
      else if(mode.type==='field'){baseLabel=category!==''?category:(styleKey||'Sin categoría');key=`${String(baseLabel)}||${styleKey}`;}
      else{baseLabel=styleKey||'Estilo sin nombre';key=styleKey||String(baseLabel);}
      if(!map.has(key))map.set(key,{key,label:String(baseLabel),styleKey,color:ks.fillColor||ks.lineColor||ks.iconColor||style.color,count:0,featureIds:new Set(),mode,folder,category});
      const g=map.get(key);g.count++;g.featureIds.add(String(f.id??''));
    }
    const arr=[...map.values()],dup=new Map();arr.forEach(g=>dup.set(g.label,(dup.get(g.label)||0)+1));const seq=new Map();arr.forEach(g=>{if((dup.get(g.label)||0)>1){const n=(seq.get(g.label)||0)+1;seq.set(g.label,n);g.displayLabel=`${g.label} · estilo ${n}`}else g.displayLabel=g.label});return arr.sort((a,b)=>a.label.localeCompare(b.label,'es',{numeric:true}));
  }
  function legendItems(styleInput,features=null){
    const style=normalizeStyle(styleInput);
    if(isKmlRenderer(style)&&Array.isArray(features)){return kmlSubgroups(features,style).map(g=>({label:g.displayLabel||g.label,color:g.color,value:g.key,count:g.count,styleKey:g.styleKey}));}
    if(style.renderer==='categorized')return(style.categories||[]).map(c=>({label:c.label||String(c.value),color:c.color,value:c.value}));
    if(style.renderer==='graduated')return(style.classes||[]).map(c=>({label:c.label||`${prettyNumber(c.min)} – ${prettyNumber(c.max)}`,color:c.color,min:c.min,max:c.max}));
    return[{label:style.legend?.singleLabel||'Elementos',color:style.color}];
  }

  window.SigmunTheme={PALETTES,DEFAULT_STYLE,normalizeStyle,colorAt,colorForValue,colorForFeature,leafletPathStyle,leafletPointStyle,legendItems,fieldList,publicFieldList,uniqueValues,numericValues,buildCategories,buildClasses,prettyNumber,comparable,kmlResolvedStyle,isKmlRenderer,inferKmlLegendField,kmlGroupingMode,kmlSubgroups,clamp01};
})();
