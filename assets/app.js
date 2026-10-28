/* GeoPortal Magelang — browser-only WebGIS engine.
 * No JS mapping library or external runtime required.
 * Base tiles require internet; WMS/metadata are served by GeoServer.
 */
(() => {
  'use strict';
  const cfg = window.GEOPORTAL_CONFIG || {};
  const $ = id => document.getElementById(id);
  const MAX_LAT = 85.05112878;
  const WEB_MERC_HALF = 20037508.342789244;
  const TILE = 256;
  const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const stored = (() => {try { return JSON.parse(localStorage.getItem('geoportal.magelang.settings') || '{}'); } catch {return {};}})();
  const state = {
    wmsUrl: stored.wmsUrl || cfg.wmsUrl || '/geoserver/webgis/wms',
    workspace: stored.workspace || cfg.workspace || 'webgis',
    center: [...(cfg.initialCenter || [110.22, -7.5])],
    zoom: Number(cfg.initialZoom) || 10,
    base: 'osm', layers: [], enabled: new Set(), dataBounds: null,
    mapReady: false, renderSeq: 0, fetchSeq: 0, legendSeq: 0,
    wmsOnline: false, currentCoordinate: null, overlayOpacity: 1,
    toastTimer: null, noticeTimer: null
  };
  const fallbackLayer = {
    name: cfg.defaultLayer || 'webgis:jenis_tanah_magelang',
    title: 'Peta Jenis Tanah Kabupaten Magelang',
    description: 'Data spasial jenis tanah Kabupaten Magelang. Sumber: GeoServer.',
    bounds: null
  };
  const viewport = $('mapViewport');
  const baseTiles = $('basemapTiles');
  const wmsTiles = $('wmsTiles');
  const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
  const toRadians = d => d * Math.PI / 180;
  const toDegrees = d => d * 180 / Math.PI;
  const normLng = x => ((x + 180) % 360 + 360) % 360 - 180;
  const mercatorX = lon => (lon + 180) / 360;
  const mercatorY = lat => (1 - Math.log(Math.tan(Math.PI / 4 + toRadians(clamp(lat,-MAX_LAT,MAX_LAT)) / 2)) / Math.PI) / 2;
  const lngFromNorm = x => x * 360 - 180;
  const latFromNorm = y => toDegrees(2 * Math.atan(Math.exp((1-2*y)*Math.PI)) - Math.PI/2);
  const worldWidth = z => TILE * Math.pow(2,z);
  const statusDot = $('serverStatus').querySelector('.state-dot');
  // Warna, klasifikasi, dan legenda berasal dari Default Style pada GeoServer.
  // WebGIS sengaja tidak mengubah SLD agar tampilan di browser dan QGIS konsisten.
  function getWmsMapParams(layers,w,h,transparent=true){return {SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:layers.join(','),STYLES:'',FORMAT:'image/png',TRANSPARENT:transparent?'TRUE':'FALSE',SRS:'EPSG:3857',BBOX:viewBbox().join(','),WIDTH:Math.round(w),HEIGHT:Math.round(h)};}

  function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('class','ico');const u=document.createElementNS('http://www.w3.org/2000/svg','use');u.setAttribute('href','#i-'+id);s.appendChild(u);return s;}
  function clear(node){node.replaceChildren();}
  function node(tag, className, text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=String(text);return n;}
  function safeURL(raw){try{const u=new URL(raw,location.href);return ['http:','https:'].includes(u.protocol) ? u : null;}catch{return null;}}
  function reqUrl(params,base=state.wmsUrl){const u=safeURL(base);if(!u)throw new Error('URL layanan tidak valid.');for(const [key,val] of Object.entries(params))u.searchParams.set(key,String(val));return u.toString();}
  function getCapabilitiesUrl(){return reqUrl({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetCapabilities'});}
  function getWfsUrl(layer){const url=safeURL(state.wmsUrl);if(!url)throw new Error('URL WMS tidak valid');url.pathname=url.pathname.replace(/\/wms\/?$/i,'/wfs');url.search='';for(const [k,v] of Object.entries({SERVICE:'WFS',VERSION:'1.0.0',REQUEST:'GetFeature',TYPENAME:layer,OUTPUTFORMAT:'application/json',MAXFEATURES:5000}))url.searchParams.set(k,v);return url.toString();}
  function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>t.classList.remove('show'),3400);}
  function notice(message,seconds=6000){const n=$('mapNotice');n.textContent=message;n.hidden=false;clearTimeout(state.noticeTimer);state.noticeTimer=setTimeout(()=>n.hidden=true,seconds);}
  function status(label,kind='pending'){$('serverStatusText').textContent=label;statusDot.className='state-dot '+kind;$('serverStatus').title=label;}
  function getMapSize(){return [viewport.clientWidth||700, viewport.clientHeight||500];}
  function centerWorld(){const world=worldWidth(state.zoom);return [mercatorX(state.center[0])*world,mercatorY(state.center[1])*world];}
  function screenToCoord(x,y){const [w,h]=getMapSize(),[cx,cy]=centerWorld(),world=worldWidth(state.zoom);return [normLng(lngFromNorm((cx+x-w/2)/world)),clamp(latFromNorm((cy+y-h/2)/world),-MAX_LAT,MAX_LAT)];}
  function coordToScreen(lon,lat){const [w,h]=getMapSize(),[cx,cy]=centerWorld(),world=worldWidth(state.zoom);let px=mercatorX(lon)*world-cx;if(px>world/2)px-=world;if(px<-world/2)px+=world;return [px+w/2,mercatorY(lat)*world-cy+h/2];}
  function viewBbox(){const [w,h]=getMapSize(),[cx,cy]=centerWorld(),size=worldWidth(state.zoom);const norm=v=> (v/size)*2*WEB_MERC_HALF-WEB_MERC_HALF;return [norm(cx-w/2),-norm(cy+h/2),norm(cx+w/2),-norm(cy-h/2)];}
  function applyPosition(){const pin=$('mapPin');if(!state.currentCoordinate){pin.hidden=true;return;}const [x,y]=coordToScreen(...state.currentCoordinate);const [w,h]=getMapSize();pin.hidden=x < 0 || x > w || y < 0 || y > h;pin.style.left=x+'px';pin.style.top=y+'px';}
  function makeTile(src,x,y,container,seq,kind){const img=document.createElement('img');img.src=src;img.alt='';img.loading='eager';img.decoding='async';img.draggable=false;img.style.left=x+'px';img.style.top=y+'px';if(kind==='wms'){img.addEventListener('load',()=>{if(seq===state.renderSeq && !state.wmsOnline){state.wmsOnline=true;if($('serverStatusText').textContent!=='GeoServer terhubung')status('GeoServer terhubung','online');}}, {once:true});}return img;}
  function wmsTileUrl(z,x,y,layerNames){const n=Math.pow(2,z),meters=WEB_MERC_HALF*2/n,minX=-WEB_MERC_HALF + x*meters,maxX=minX+meters,maxY=WEB_MERC_HALF-y*meters,minY=maxY-meters;
    return reqUrl({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:layerNames.join(','),STYLES:'',FORMAT:'image/png',TRANSPARENT:'TRUE',SRS:'EPSG:3857',BBOX:[minX,minY,maxX,maxY].join(','),WIDTH:TILE,HEIGHT:TILE});
  }
  function renderMap(){if(!state.mapReady)return;
    const [w,h]=getMapSize();if(w<50||h<50)return;
    state.renderSeq++;const seq=state.renderSeq, zoom=state.zoom,n=2**zoom,[cx,cy]=centerWorld();
    const topLeftX=cx-w/2,topLeftY=cy-h/2;
    const x0=Math.floor(topLeftX/TILE),x1=Math.floor((topLeftX+w)/TILE);
    const y0=Math.max(0,Math.floor(topLeftY/TILE)),y1=Math.min(n-1,Math.floor((topLeftY+h)/TILE));
    const baseFrag=document.createDocumentFragment(),wmsFrag=document.createDocumentFragment();
    const act=[...state.enabled];const template=state.base==='osm'?OSM:SAT;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const wrapped=((x%n)+n)%n,px=Math.round(x*TILE-topLeftX),py=Math.round(y*TILE-topLeftY);
      const url=template.replace('{z}',zoom).replace('{x}',wrapped).replace('{y}',y);
      baseFrag.appendChild(makeTile(url,px,py,baseTiles,seq,'base'));
      
    }
    // GetMap menggunakan Default Style yang telah dipublikasi pada GeoServer.
    if(act.length){
      try{
        const src=reqUrl(getWmsMapParams(act,w,h,true));
        const overlay=makeTile(src,0,0,wmsTiles,seq,'wms');
        overlay.style.width=Math.round(w)+'px';overlay.style.height=Math.round(h)+'px';
        overlay.addEventListener('error',()=>{if(seq===state.renderSeq){status('Layer WMS gagal dimuat','offline');notice('Peta WMS tidak berhasil dimuat. Periksa GeoServer dan style layer.',7000);}}, {once:true});
        wmsFrag.appendChild(overlay);
      }catch(e){console.warn(e);}
    }
    baseTiles.style.transform='';wmsTiles.style.transform='';baseTiles.replaceChildren(baseFrag);wmsTiles.replaceChildren(wmsFrag);
    $('mapCoordinates').textContent=`${Math.abs(state.center[0]).toFixed(3)}° ${state.center[0]<0?'BB':'BT'}, ${Math.abs(state.center[1]).toFixed(3)}° ${state.center[1]<0?'LS':'LU'}`;
    updateScale();applyPosition();
  }
  function updateScale(){const metersPerPixel=Math.cos(toRadians(state.center[1]))*2*Math.PI*6378137/worldWidth(state.zoom),goal=metersPerPixel*92;const power=Math.pow(10,Math.floor(Math.log10(Math.max(1e-9,goal))));const size=[1,2,5,10].map(v=>v*power).filter(v=>v<=goal).pop()||power;const px=clamp(size/metersPerPixel,5,115);$('mapScale').querySelector('.scale-bar').style.width=px+'px';$('mapScale').querySelector('span:last-child').textContent=size>=1000?(size/1000).toLocaleString('id-ID',{maximumFractionDigits:1})+' km':Math.round(size)+' m';}
  function panPixels(dx,dy){const [cx,cy]=centerWorld(),world=worldWidth(state.zoom);const x=((cx-dx)%world+world)%world;const y=clamp(cy-dy,0,world);state.center=[normLng(lngFromNorm(x/world)),clamp(latFromNorm(y/world),-MAX_LAT,MAX_LAT)];renderMap();}
  function zoomBy(amount){const next=clamp(state.zoom+amount,Number(cfg.minZoom)||4,Number(cfg.maxZoom)||18);if(next===state.zoom)return;state.zoom=next;renderMap();}
  function fitBounds(b){if(!Array.isArray(b)||b.length!==4||b.some(v=>!Number.isFinite(v))||b[0]>=b[2]||b[1]>=b[3])return false;
    const [w,h]=getMapSize();if(w<60||h<60)return false;
    const a=mercatorX(b[0]),c=mercatorX(b[2]),top=mercatorY(b[3]),bottom=mercatorY(b[1]);
    let chosen=Number(cfg.minZoom)||4;for(let z=Number(cfg.minZoom)||4;z<=(Number(cfg.maxZoom)||18);z++){
      const world=worldWidth(z);if((c-a)*world <= Math.max(50,w-105) && (bottom-top)*world <= Math.max(50,h-135)) chosen=z;else break;
    }
    state.zoom=chosen;state.center=[normLng((b[0]+b[2])/2),latFromNorm((top+bottom)/2)];renderMap();return true;
  }
  function fitData(){if(!fitBounds(state.dataBounds)){state.center=[...(cfg.initialCenter||[110.22,-7.5])];state.zoom=Number(cfg.initialZoom)||10;renderMap();toast('Batas layer belum tersedia; peta dipusatkan ke Kabupaten Magelang.');}}
  function zoomToLayer(layer){if(layer.bounds&&fitBounds(layer.bounds)){toast('Peta diarahkan ke cakupan '+layer.title);closeDrawers();return;}fitData();}
  function setBasemap(val){state.base=val;$('osmBase').classList.toggle('selected',val==='osm');$('satBase').classList.toggle('selected',val==='sat');$('osmBase').setAttribute('aria-pressed',String(val==='osm'));$('satBase').setAttribute('aria-pressed',String(val==='sat'));$('satAttribution').hidden=val!=='sat';renderMap();}

  function direct(node,name){return [...(node?.children||[])].find(c=>c.localName===name||c.tagName===name)||null;}
  function inner(node,name){return direct(node,name)?.textContent?.trim()||'';}
  function parseBounds(el){if(!el)return null;let bbox=direct(el,'EX_GeographicBoundingBox');if(bbox){const bounds=['westBoundLongitude','southBoundLatitude','eastBoundLongitude','northBoundLatitude'].map(n=>parseFloat(inner(bbox,n)));if(bounds.every(Number.isFinite))return bounds;}
    bbox=direct(el,'LatLonBoundingBox');if(bbox){const vals=['minx','miny','maxx','maxy'].map(n=>parseFloat(bbox.getAttribute(n)));if(vals.every(Number.isFinite))return vals;}
    return null;
  }
  function parseLayers(xmlString){const xml=new DOMParser().parseFromString(xmlString,'text/xml');if(xml.querySelector('parsererror')||xml.querySelector('ServiceException'))throw new Error('GeoServer mengembalikan respons XML error');
    const all=[...xml.getElementsByTagName('*')].filter(n=>n.localName==='Layer'),map=new Map();for(const l of all){const name=inner(l,'Name');if(!name||!name.startsWith(state.workspace+':'))continue;map.set(name,{name,title:inner(l,'Title')||name.split(':').pop().replace(/_/g,' '),description:inner(l,'Abstract')||'Layer spasial disediakan melalui layanan GeoServer.',bounds:parseBounds(l)});}
    return [...map.values()].sort((a,b)=>{if(a.name===cfg.defaultLayer)return -1;if(b.name===cfg.defaultLayer)return 1;return a.title.localeCompare(b.title,'id');});
  }
  async function loadLayers({fit=true}={}){const fetchSeq=++state.fetchSeq;status('Memeriksa GeoServer','pending');$('layerList').innerHTML='<div class="layer-loading">Menghubungkan katalog GeoServer...</div>';
    const previous=new Set(state.enabled);
    try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),13000);let r;try{r=await fetch(getCapabilitiesUrl(),{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer)}if(!r.ok)throw new Error('HTTP '+r.status);const xml=await r.text();const layers=parseLayers(xml);if(fetchSeq!==state.fetchSeq)return;if(!layers.length)throw new Error('Tidak menemukan nama layer berawalan '+state.workspace+': pada GetCapabilities. Cek workspace dan nama layer yang dipublikasikan.');
      state.layers=layers;state.enabled=new Set([...previous].filter(x=>layers.some(l=>l.name===x)));
      if(!state.enabled.size){const preferred=layers.find(l=>l.name===cfg.defaultLayer)||layers[0];state.enabled.add(preferred.name);}
      state.dataBounds=layers.find(l=>l.name===cfg.defaultLayer)?.bounds||layers.find(l=>state.enabled.has(l.name))?.bounds||null;
      status('GeoServer terhubung','online');state.wmsOnline=true;renderLayers();refreshLegend();updateActiveCounter();

      if(fit){if(!fitBounds(state.dataBounds))renderMap();}else renderMap();
    }catch(err){if(fetchSeq!==state.fetchSeq)return;console.warn('GetCapabilities:',err);state.layers=state.workspace==='webgis'?[fallbackLayer]:[];state.enabled=new Set(state.layers.filter(l=>previous.has(l.name)||l.name===cfg.defaultLayer).map(l=>l.name));state.dataBounds=null;state.wmsOnline=false;status('Metadata tidak tersedia','offline');renderLayers();refreshLegend();updateActiveCounter();renderMap();notice('Metadata WMS belum terbaca. Periksa /geoserver/webgis/wms?SERVICE=WMS&REQUEST=GetCapabilities lewat localhost:5500.',8500);}
  }
  function renderLayers(){const list=$('layerList'),filter=$('layerSearch').value.trim().toLowerCase();clear(list);const matching=state.layers.filter(l=>(l.title+' '+l.name).toLowerCase().includes(filter));$('layerCount').textContent=state.layers.length+' layer';document.querySelector('.sidebar-search').hidden=state.layers.length<5;
    if(!matching.length){list.appendChild(node('div','layer-empty',state.layers.length?'Tidak ada layer yang cocok.':'Belum ada layer. Periksa koneksi dan workspace.'));return;}
    for(const l of matching){const entry=node('div','layer-item'+(state.enabled.has(l.name)?' active':''));const left=node('div','layer-icon');left.appendChild(icon('layers'));const main=node('div','layer-body');main.appendChild(node('div','layer-title',l.title));main.appendChild(node('div','layer-meta',l.name));const btn=node('button','layer-detail-btn','Lihat detail & cakupan');btn.type='button';btn.addEventListener('click',()=>{showLayerDetails(l);openDrawer('detail');});main.appendChild(btn);const toggle=node('button','toggle'+(state.enabled.has(l.name)?' on':''));toggle.type='button';toggle.setAttribute('role','switch');toggle.setAttribute('aria-checked',String(state.enabled.has(l.name)));toggle.setAttribute('aria-label','Tampilkan '+l.title);toggle.addEventListener('click',()=>{if(state.enabled.has(l.name))state.enabled.delete(l.name);else state.enabled.add(l.name);renderLayers();renderMap();refreshLegend();updateActiveCounter();});entry.append(left,main,toggle);list.append(entry);}
  }
  function updateActiveCounter(){$('mobileActiveCount').textContent=state.enabled.size;$('downloadPng').disabled=state.enabled.size===0;$('downloadGeojson').disabled=state.enabled.size===0;}
  function refreshLegend(){
    state.legendSeq++;
    const lst=$('legendList');clear(lst);
    const active=state.layers.filter(l=>state.enabled.has(l.name));
    if(!active.length){lst.appendChild(node('p','subtle-note','Aktifkan layer untuk melihat legenda.'));return;}
    for(const l of active){
      const box=node('div','legend-card');box.appendChild(node('h4','',l.title));
      const img=document.createElement('img');img.alt='Legenda '+l.title;img.loading='eager';
      try{img.src=reqUrl({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetLegendGraphic',FORMAT:'image/png',WIDTH:22,HEIGHT:18,LAYER:l.name,LEGEND_OPTIONS:'fontSize:11;fontName:Arial;fontColor:0x354c57;fontAntiAliasing:true',_r:state.legendSeq});}catch{}
      img.onerror=()=>{img.remove();box.appendChild(node('div','legend-img-note','Legenda belum tersedia. Periksa Default Style di GeoServer.'));};
      box.appendChild(img);lst.appendChild(box);
    }
  }
  function showLayerDetails(layer){const target=$('detailContent');clear(target);const header=node('div','detail-summary');header.appendChild(node('strong','',layer.title));header.appendChild(node('span','',layer.description));target.appendChild(header);const table=node('table','attribute-table');const data={'Nama layanan':layer.name,'Workspace':state.workspace,'Tipe akses':'OGC WMS 1.1.1','Cakupan spasial':layer.bounds?layer.bounds.map(v=>v.toFixed(4)).join(', '):'Tidak tersedia dalam metadata'};
    for(const [key,val] of Object.entries(data)){const tr=document.createElement('tr');tr.append(node('td','',key),node('td','',val));table.appendChild(tr);}target.appendChild(table);
    const btn=node('button','secondary-btn','Zoom ke cakupan layer');btn.style.marginTop='18px';btn.addEventListener('click',()=>zoomToLayer(layer));target.appendChild(btn);
  }
  async function getFeatureInfoAt(px,py){const act=[...state.enabled];if(!act.length){toast('Aktifkan sedikitnya satu layer WMS terlebih dahulu.');return;}
    const coord=screenToCoord(px,py);state.currentCoordinate=coord;applyPosition();const panel=$('detailContent');clear(panel);panel.appendChild(node('p','subtle-note','Mengambil informasi atribut dari GeoServer...'));openDrawer('detail');
    const [width,height]=getMapSize(),bbox=viewBbox();let url;
    try{url=reqUrl({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetFeatureInfo',LAYERS:act.join(','),QUERY_LAYERS:act.join(','),STYLES:'',FORMAT:'image/png',TRANSPARENT:'TRUE',SRS:'EPSG:3857',BBOX:bbox.join(','),WIDTH:Math.round(width),HEIGHT:Math.round(height),X:Math.floor(px),Y:Math.floor(py),INFO_FORMAT:'application/json',FEATURE_COUNT:8});}
    catch(e){showFeatureError('URL layanan tidak valid.');return;}
    try{const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);let response;try{response=await fetch(url,{signal:ctrl.signal});}finally{clearTimeout(timer);}if(!response.ok)throw new Error('HTTP '+response.status);const raw=await response.text();let result;try{result=JSON.parse(raw);}catch{throw new Error('GeoServer tidak mengembalikan JSON GetFeatureInfo.');}
      if(result.exceptions?.length)throw new Error('GeoServer menolak GetFeatureInfo.');const features=Array.isArray(result.features)?result.features:[];if(!features.length){clear(panel);const wrap=node('div','empty-detail');wrap.appendChild(node('div','empty-detail-illustration'));wrap.appendChild(node('h3','','Tidak ada fitur terpilih'));wrap.appendChild(node('p','','Tidak ditemukan objek pada titik ini. Coba klik area poligon yang berwarna.'));panel.append(wrap);return;}
      clear(panel);
      const h=node('div','detail-summary');
      h.appendChild(node('strong','',features.length+' objek ditemukan'));
      h.appendChild(node('span','',`${Math.abs(coord[1]).toFixed(5)}° ${coord[1]<0?'LS':'LU'} · ${Math.abs(coord[0]).toFixed(5)}° ${coord[0]<0?'BB':'BT'}`));
      panel.appendChild(h);
      for(let i=0;i<Math.min(3,features.length);i++){
        const props=features[i].properties||{};
        const entries=Object.entries(props).filter(([key,val])=>val!==null&&val!==undefined&&!['geometry','geom','the_geom','bbox'].includes(key.toLowerCase()));
        if(!entries.length){panel.appendChild(node('p','subtle-note','Objek tidak memiliki atribut publik.'));continue;}
        const find=(names)=>{for(const name of names){const match=entries.find(([key,val])=>key.toLowerCase().replace(/[^a-z0-9]/g,'')===name&&String(val).trim());if(match)return match;}return null;};
        const jenis=find(['keterangan','jenistanah','namatanah','kelastanah','tanah','soiltype']);
        const tanah=find(['tanah']);
        const card=node('section','feature-card');
        card.appendChild(node('span','feature-card-overline',features.length>1?'OBJEK '+(i+1):'JENIS TANAH TERPILIH'));
        const primaryText=jenis?String(jenis[1]):'Objek spasial';
        card.appendChild(node('strong','feature-primary',primaryText));
        if(tanah&&tanah[0]!==jenis?.[0])card.appendChild(node('p','feature-secondary','Jenis tanah: '+String(tanah[1])));
        panel.appendChild(card);
        const exclude=new Set([jenis?.[0],tanah?.[0]].filter(Boolean));
        const visible=entries.filter(([key])=>!exclude.has(key)&&!/^objectid(?:[_0-9]*)$/i.test(key)&&!/^fid$/i.test(key)).slice(0,24);
        if(visible.length){
          const details=node('details','attribute-more');
          details.appendChild(node('summary','','Lihat atribut lainnya ('+visible.length+')'));
          const table=node('table','attribute-table');
          for(const [key,val] of visible){
            const tr=document.createElement('tr');
            const txt=typeof val==='object'?JSON.stringify(val):String(val);
            tr.append(node('td','',key.replace(/_/g,' ')),node('td','',txt.length>200?txt.slice(0,200)+'…':txt));
            table.appendChild(tr);
          }
          details.appendChild(table);panel.appendChild(details);
        }
      }
    }catch(e){console.warn('GetFeatureInfo:',e);showFeatureError('Informasi objek tidak dapat dimuat. Periksa apakah GetFeatureInfo diizinkan dan layanan dapat diakses dari browser. '+(e.message||''),url);}
  }
  function showFeatureError(message,url){const panel=$('detailContent');clear(panel);const box=node('div','detail-error');box.textContent=message;if(url){box.appendChild(document.createElement('br'));box.appendChild(document.createElement('br'));const a=node('a','','Buka respons GeoServer');a.href=url;a.target='_blank';a.rel='noopener noreferrer';box.appendChild(a);}panel.appendChild(box);}

  function openDrawer(which){if(window.innerWidth>1000&&which==='detail')return;closeDrawers();const el=which==='sidebar'?$('sidebar'):$('detailPanel');el.classList.add('mobile-open');if(window.innerWidth<=700){$('mobileBackdrop').hidden=false;}}
  function closeDrawers(){$('sidebar').classList.remove('mobile-open');$('detailPanel').classList.remove('mobile-open');$('mobileBackdrop').hidden=true;}
  function enterDashboard(){ $('landing').hidden=true;$('dashboard').hidden=false;document.body.style.overflow='hidden';window.scrollTo(0,0);if(!state.mapReady){state.mapReady=true;requestAnimationFrame(()=>{renderMap();loadLayers({fit:true});});}else{requestAnimationFrame(renderMap);} }
  function goHome(){closeDrawers();$('dashboard').hidden=true;$('landing').hidden=false;document.body.style.overflow='';window.scrollTo({top:0,behavior:'instant'});}
  async function copy(text){try{await navigator.clipboard.writeText(text);}catch{const t=document.createElement('textarea');t.value=text;t.style.position='fixed';t.style.opacity='0';document.body.append(t);t.select();document.execCommand('copy');t.remove();}}
  async function copyWms(){try{await copy(safeURL(state.wmsUrl).toString());toast('URL layanan WMS berhasil disalin.');}catch{toast('Alamat WMS tidak valid.');}}
  async function downloadBlob(url,filename){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),45000);try{const r=await fetch(url,{signal:ctrl.signal});if(!r.ok)throw new Error('HTTP '+r.status);const blob=await r.blob();if(blob.type.includes('xml')||blob.type.includes('html'))throw new Error('Respons server bukan file yang diminta.');const obj=URL.createObjectURL(blob),a=document.createElement('a');a.href=obj;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(obj),30000);}finally{clearTimeout(timer);}}
  async function downloadPng(){
    const act=[...state.enabled];if(!act.length)return toast('Aktifkan satu layer terlebih dahulu.');
    const [w,h]=getMapSize(),ratio=Math.min(2,1800/Math.max(w,1),1600/Math.max(h,1)),width=Math.max(256,Math.round(w*ratio)),height=Math.max(256,Math.round(h*ratio));
    $('downloadPng').disabled=true;
    try{await downloadBlob(reqUrl(getWmsMapParams(act,width,height,false)),'GeoPortal_Magelang_WMS.png');toast('Peta WMS diunduh dalam PNG tanpa basemap.');}
    catch(e){console.warn(e);toast('Unduhan PNG gagal. Periksa GeoServer dan layer aktif.');}
    finally{updateActiveCounter();}
  }
  async function downloadGeojson(){if(cfg.enableWfsExport===false)return toast('Unduhan WFS dinonaktifkan dalam konfigurasi.');const act=[...state.enabled];if(!act.length)return toast('Aktifkan setidaknya satu layer.');let url;try{url=getWfsUrl(act[0]);}catch{return toast('Alamat layanan tidak valid.');}
    $('downloadGeojson').disabled=true;try{await downloadBlob(url,act[0].replace(/[^a-z0-9-_]/gi,'_')+'.geojson');toast('Unduhan GeoJSON berhasil. Maksimal 5.000 fitur.');}catch(e){console.warn(e);toast('Unduh WFS gagal. Periksa layanan WFS dan izin akses layer.');}finally{updateActiveCounter();}
  }
  function showSettings(){$('wmsUrlInput').value=state.wmsUrl;$('workspaceInput').value=state.workspace;$('settingsModal').hidden=false;$('wmsUrlInput').focus();}
  function hideSettings(){$('settingsModal').hidden=true;}
  function saveSettings(){const url=$('wmsUrlInput').value.trim(),workspace=$('workspaceInput').value.trim();if(!safeURL(url)||!/^[\w.-]+$/.test(workspace)){toast('Periksa URL WMS dan nama workspace.');return;}state.wmsUrl=url;state.workspace=workspace;localStorage.setItem('geoportal.magelang.settings',JSON.stringify({wmsUrl:url,workspace}));state.enabled.clear();state.wmsOnline=false;hideSettings();loadLayers({fit:true});toast('Konfigurasi GeoServer diperbarui.');}
  function resetSettings(){localStorage.removeItem('geoportal.magelang.settings');state.wmsUrl=cfg.wmsUrl||'/geoserver/webgis/wms';state.workspace=cfg.workspace||'webgis';state.enabled.clear();hideSettings();loadLayers({fit:true});toast('Konfigurasi default dipulihkan.');}

  function bindMapInteractions(){const pointers=new Map();let down=null,moved=false,pinch=0;
    viewport.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;viewport.setPointerCapture?.(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1){down={x:e.clientX,y:e.clientY,originX:e.clientX,originY:e.clientY};moved=false;viewport.classList.add('dragging');}else if(pointers.size===2){const p=[...pointers.values()];pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);down=null;}e.preventDefault();});
    viewport.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===2){const p=[...pointers.values()],dist=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(pinch>0&&(dist>pinch*1.38||dist<pinch/1.38)){zoomBy(dist>pinch?1:-1);pinch=dist;}return;}if(!down)return;const dx=e.clientX-down.originX,dy=e.clientY-down.originY;if(Math.hypot(dx,dy)>5)moved=true;baseTiles.style.transform=`translate(${dx}px,${dy}px)`;wmsTiles.style.transform=`translate(${dx}px,${dy}px)`;});
    function finish(e){if(!pointers.has(e.pointerId))return;const count=pointers.size;pointers.delete(e.pointerId);viewport.classList.remove('dragging');if(count===1&&down){const dx=e.clientX-down.originX,dy=e.clientY-down.originY;const shouldClick=!moved&&Math.hypot(dx,dy)<6;down=null;if(shouldClick){const box=viewport.getBoundingClientRect();getFeatureInfoAt(e.clientX-box.left,e.clientY-box.top);}else panPixels(dx,dy);}else if(pointers.size===1){const p=[...pointers.values()][0];down={x:p.x,y:p.y,originX:p.x,originY:p.y};moved=true;}else{down=null;renderMap();} }
    viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);
    viewport.addEventListener('wheel',e=>{if(e.target.closest('button'))return;e.preventDefault();zoomBy(e.deltaY<0?1:-1);},{passive:false});
    viewport.addEventListener('keydown',e=>{if(['+','=','-','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();switch(e.key){case'+':case'=':zoomBy(1);break;case'-':zoomBy(-1);break;case'ArrowUp':panPixels(0,90);break;case'ArrowDown':panPixels(0,-90);break;case'ArrowLeft':panPixels(90,0);break;case'ArrowRight':panPixels(-90,0);break;}}});
  }
  function bindUI(){for(const id of ['navEnter','heroEnter'])$(id).addEventListener('click',enterDashboard);$('backHome').addEventListener('click',goHome);
    $('openSidebar').addEventListener('click',()=>openDrawer('sidebar'));$('closeSidebar').addEventListener('click',closeDrawers);$('mobileLayerButton').addEventListener('click',()=>openDrawer('sidebar'));$('mobileDetailButton').addEventListener('click',()=>openDrawer('detail'));$('closeDetail').addEventListener('click',closeDrawers);$('mobileBackdrop').addEventListener('click',closeDrawers);
    $('layerSearch').addEventListener('input',renderLayers);
    $('refreshLegend').addEventListener('click',refreshLegend);$('zoomIn').addEventListener('click',()=>zoomBy(1));$('zoomOut').addEventListener('click',()=>zoomBy(-1));$('zoomToData').addEventListener('click',fitData);$('osmBase').addEventListener('click',()=>setBasemap('osm'));$('satBase').addEventListener('click',()=>setBasemap('sat'));
    $('copyWms').addEventListener('click',copyWms);$('downloadPng').addEventListener('click',downloadPng);$('downloadGeojson').addEventListener('click',downloadGeojson);$('openCapabilities').addEventListener('click',()=>{try{window.open(getCapabilitiesUrl(),'_blank','noopener,noreferrer');}catch{toast('URL WMS tidak valid.');}});
    $('openSettings').addEventListener('click',showSettings);$('closeSettings').addEventListener('click',hideSettings);$('saveSettings').addEventListener('click',saveSettings);$('resetSettings').addEventListener('click',resetSettings);$('settingsModal').addEventListener('click',e=>{if(e.target===$('settingsModal'))hideSettings();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideSettings();closeDrawers();}});
    if(cfg.enableWfsExport===false)$('downloadGeojson').hidden=true;
    window.addEventListener('resize',()=>{closeDrawers();if(state.mapReady)renderMap();});
  }
  bindUI();bindMapInteractions();
  if(location.protocol==='file:')console.warn('Untuk metadata, popup, dan WFS, jalankan melalui: py -3 serve.py (http://localhost:5500).');
})();
