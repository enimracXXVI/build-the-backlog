// ══════════════════════════════════════════
//  ⚙️  GOOGLE SHEETS CONFIG
//  Set your Apps Script Web App URL in config.js (see config.example.js).
//  config.js is gitignored — never committed. For GitHub Pages, add it as a
//  repository secret named SHEET_URL (the deploy workflow injects it).
//  Leave empty / unset to use offline mode (localStorage only).
// ══════════════════════════════════════════
const SHEET_URL = (typeof window !== 'undefined' && window.BTB_SHEET_URL) || '';
const SHEET_TOKEN = (typeof window !== 'undefined' && window.BTB_SHEET_TOKEN) || '';
const GG_WORKER = (typeof window !== 'undefined' && window.BTB_GGDEALS_WORKER) || '';
// Bump alongside sw.js's CACHE on every merge that touches app.js/index.html/
// style.css — the pair is how a deploy can be visually confirmed live instead
// of trusting a service worker to have actually picked up the new build.
const APP_VERSION = '29';
let ggPriceCache = {};
// Plain fetch() has no timeout — a stalled request (dead connection, Worker
// cold-start, upstream throttling) leaves an await stuck forever with no way
// for a sequential per-game check loop (Release Date Check, Price Lookup,
// Live Prices) to notice and move on. This aborts and fails fast instead.
async function fetchWithTimeout(url,ms=20000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),ms);
  try{
    return await fetch(url,{signal:ctrl.signal});
  }finally{
    clearTimeout(t);
  }
}
// Appended to every Sheets request URL — the deployment URL ships in the
// public bundle, so this shared-secret token is what actually gates access.
function _tok(){return SHEET_TOKEN?'&token='+encodeURIComponent(SHEET_TOKEN):''}

// Use JSONP on file:// (fetch can't read cross-origin responses there);
// use fetch+CORS on http/https and fall back to JSONP on failure.
const USE_JSONP = location.protocol === 'file:';

// ══════════════════════════════════════════
//  SEED DATA
// ══════════════════════════════════════════
const SEED=[];

// ══════════════════════════════════════════
//  STRINGS
// ══════════════════════════════════════════
const S={
  secRev:'To Review',secWl:'Wishlist',secRm:'Removed',secBacklog:'Your Backlog',
  bdgBt:'IN COLLECTION',bdgRm:'Removed',bdgRev:'To Review',
  pHi:'High',pMe:'Medium',pLo:'Low',
  stTot:'total',stWl:'wishlist',stBt:'bought',stRm:'removed',stVal:'total value',
  pHotness:'Hotness',pDetails:'Details',pDev:'Developer',pPub:'Publisher',pRel:'Release',
  pGenre:'Genre',pPlatform:'Platform',pPrice:'Price',pTags:'Tags',pNotes:'Notes',
  pLinks:'Links',pSteam:'Steam',pGG:'gg.deals',pSDB:'SteamDB',pPriority:'Priority',
  pActions:'Actions',pEdit:'Edit',pMarkBt:'Add to Collection',pMarkWl:'Move to Wishlist',pRemove:'Remove',pReinstate:'Reinstate',
  pReview:'My Review',pSaveRev:'Save review',pRmNote:'Removed — reason:',
  pLivePrice:'Live Price',
  noGames:'No games here yet.',noHint:'Press + Add game to start!',
  mBt:'Add to Collection',mWl:'Move to Wishlist'
};
const t=k=>S[k]||k;

// ══════════════════════════════════════════
//  SVG ICONS
// ══════════════════════════════════════════
const IC={
  edit:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 3l2 2-8.5 8.5H3v-1.5L11 3z"/></svg>`,
  check:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8l4 4L13.5 4"/></svg>`,
  close:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  backWl:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5H7m0 0l2.5 2.5M7 5l2.5-2.5M9 11h2a2 2 0 002-2V9"/></svg>`,
  plus:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>`,
  reinstate:`<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h8m0 0l-3-3m3 3l-3 3"/></svg>`,
  hintCheck:`<svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20l8 8L32 12"/></svg>`,
  hintClose:`<svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 12l16 16M28 12L12 28"/></svg>`,
  hintPlus:`<svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 8v24M8 20h24"/></svg>`,
  hintBack:`<svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M26 20H14m0 0l7-7m-7 7l7 7"/></svg>`,
};

// ══════════════════════════════════════════
function applyVm(){
  ['dhViewGrid'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('on',vm==='grid');});
  ['dhViewList'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('on',vm==='list');});
  updateQfabView();
}
function updateQfabView(){
  const ico=document.getElementById('qfabViewIco');
  if(ico)ico.textContent=vm==='list'?'☰':'⊞';
}
function updateQfabMode(){
  const ico=document.getElementById('qfabModeIco');
  if(ico)ico.textContent=appMode==='collection'?'C':'W';
}

// ══════════════════════════════════════════
//  SYNC STATUS UI
// ══════════════════════════════════════════
function setSyncStatus(state, msg){
  // ── Desktop header span ──
  const hdr = document.getElementById('syncStatus');
  if(hdr){
    const icons = {idle:'', syncing:'⟳', ok:'✓', err:'⚠', offline:'⊘'};
    const colors = {idle:'var(--t3)', syncing:'var(--amber)', ok:'var(--green)', err:'var(--pink)', offline:'var(--t3)'};
    hdr.textContent = (icons[state]||'') + (msg?' '+msg:'');
    hdr.style.color = colors[state]||'var(--t3)';
    hdr.onclick = null;
    hdr.style.cursor = '';
    // After success/error, show re-sync button
    if(state==='ok'||state==='err'){
      clearTimeout(setSyncStatus._resyncTimer);
      setSyncStatus._resyncTimer = setTimeout(()=>{
        hdr.textContent = '⟳ Re-sync';
        hdr.style.color = 'var(--t3)';
        hdr.style.cursor = 'pointer';
        hdr.onclick = ()=>resync();
      }, state==='ok' ? 2500 : 0);
    }
  }
  // ── Mobile floating sync chip ──
  const pill = document.getElementById('syncPill');
  const pillTxt = document.getElementById('syncPillTxt');
  if(pill && pillTxt){
    const labels = {idle:'', syncing:'Saving…', ok:'Saved', err:'Sync failed', offline:'Offline'};
    pillTxt.textContent = msg || labels[state] || '';
    pill.className = state==='idle' ? 'hidden' : 'sp-'+state;
    const retryable = state==='err' || state==='offline';
    if(retryable){
      pill.classList.add('clickable');
      pill.onclick = ()=>resync();
      pill.title = 'Sync status — tap to retry';
    } else {
      pill.onclick = null;
      pill.title = 'Sync status';
    }
    if(state==='ok'){
      clearTimeout(setSyncStatus._hideTimer);
      setSyncStatus._hideTimer = setTimeout(()=>{ pill.className='hidden'; },2500);
    }
  }
}

// Re-sync: fetch from Sheet, merge (Sheet wins), re-render
async function resync(){
  if(OFFLINE) return;
  setSyncStatus('syncing','Syncing…');
  try{
    const data = await loadFromSheet();
    const incoming = data.map(g=>normalise(g));
    // Sheet wins: build map of incoming by id
    const inMap = {};
    incoming.forEach(g=>{ inMap[String(g.id)]=g; });
    // Keep local games not in Sheet, overwrite rest with Sheet version
    const localOnly = games.filter(g=>!inMap[String(g.id)]);
    games = [...incoming, ...localOnly.filter(g=>!inMap[String(g.id)])];
    // Actually: Sheet is source of truth — just replace entirely
    games = incoming;
    localStorage.setItem(KEY, JSON.stringify(games));
    setSyncStatus('ok','Synced');
    dispatchRender();
    fetchMeta();
  } catch(err){
    setSyncStatus('err','Re-sync failed');
    console.error('BTB resync error:', err);
  }
}

// ══════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════
const KEY='btb_v4';
const META_KEY='btb_meta';
const OFFLINE = !SHEET_URL;

// ── METADATA (genres/tags descriptions) ─────────────────────
let metaMap={}; // keyed by lowercase name
function loadMetaCache(){
  try{const s=localStorage.getItem(META_KEY);if(s)metaMap=JSON.parse(s);}catch(e){}
}
function saveMetaCache(){localStorage.setItem(META_KEY,JSON.stringify(metaMap));}
function metaDesc(name){return metaMap[name.toLowerCase()]||null;}
function _applyMeta(data){
  if(!Array.isArray(data)||!data.length)return;
  metaMap={};
  data.forEach(row=>{if(row.name)metaMap[String(row.name).toLowerCase()]={type:row.type||'',desc:row.description||''};});
  saveMetaCache();
  dispatchRender();
}
function fetchMeta(force){
  if(!SHEET_URL)return Promise.resolve();
  if(USE_JSONP){
    return new Promise((resolve)=>{
      const cbName='_btbMeta'+Date.now();
      const script=document.createElement('script');
      const timeout=setTimeout(()=>{
        delete window[cbName];try{document.head.removeChild(script)}catch(e){}
        resolve();
      },12000);
      window[cbName]=(data)=>{
        clearTimeout(timeout);
        delete window[cbName];try{document.head.removeChild(script)}catch(e){}
        _applyMeta(data);resolve();
      };
      script.src=SHEET_URL+'?action=getMeta&callback='+cbName+'&_='+Date.now()+_tok();
      script.onerror=()=>{clearTimeout(timeout);delete window[cbName];resolve();};
      document.head.appendChild(script);
    });
  }
  return fetch(SHEET_URL+'?action=getMeta&_='+Date.now()+_tok(),{mode:'cors'})
    .then(r=>r.json()).then(_applyMeta).catch(()=>{});
}
loadMetaCache();

const PLATFORM_ORDER=['Steam','Epic Games','GOG','Other PC','Nintendo','PS','Xbox'];
const MONTH_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function syncLegacyFromPurchases(g){
  const p0=g.purchases&&g.purchases[0];
  g.cost=p0?p0.cost||'':'';
  g.store=p0?p0.store||'':'';
  g.purchaseDate=p0?p0.purchaseDate||'':'';
  g.playStatus=p0?p0.playStatus||'Unplayed':'Unplayed';
  const sp=g.purchases?g.purchases.find(p=>p.platform==='Steam'):null;
  g.steamCollection=sp?sp.steamCollection||[]:[];
}
function gamePurchases(g){return Array.isArray(g.purchases)?g.purchases:[]}
function ownedPlatforms(g){return gamePurchases(g).map(p=>p.platform)}
function purchaseByPlat(g,plat){return gamePurchases(g).find(p=>p.platform===plat)||null}
function gameTotalCost(g){return gamePurchases(g).reduce((s,p)=>s+(parseFloat(p.cost)||0),0)}
function gameFilteredCost(g,platSet){
  const ps=gamePurchases(g);
  if(!platSet||!platSet.size)return ps.reduce((s,p)=>s+(parseFloat(p.cost)||0),0);
  const matched=ps.filter(p=>platSet.has(p.platform));
  return matched.length?matched.reduce((s,p)=>s+(parseFloat(p.cost)||0),0):null;
}
let _migrationHappened=false;
let _modalAddType='wishlist'; // 'wishlist' or 'collection'
let _modalColPlat='Steam';    // selected platform in collection add/edit
let _modalSteamWishlist=false;// state of steamWishlist toggle in modal
let _originalAppId='';        // App ID as loaded into modal — duplicate check only fires when changed
function normalise(g){
  if(!Array.isArray(g.genres)){
    if(g.genres&&typeof g.genres==='string'){try{g.genres=JSON.parse(g.genres)}catch(e){g.genres=g.genres.split(',').map(s=>s.trim()).filter(Boolean)}}
    else{g.genres=g.genre?g.genre.split(',').map(s=>s.trim()).filter(Boolean):[]}
  }
  if(!Array.isArray(g.tags)){
    if(g.tags&&typeof g.tags==='string'){try{g.tags=JSON.parse(g.tags)}catch(e){g.tags=g.tags.split(',').map(s=>s.trim()).filter(Boolean)}}
    else{g.tags=[]}
  }
  if(!Array.isArray(g.developer)){
    if(g.developer&&typeof g.developer==='string'){try{g.developer=JSON.parse(g.developer)}catch(e){g.developer=g.developer.split(',').map(s=>s.trim()).filter(Boolean)}}
    else{g.developer=g.developer?[String(g.developer)]:[]}
  }
  if(!Array.isArray(g.publisher)){
    if(g.publisher&&typeof g.publisher==='string'){try{g.publisher=JSON.parse(g.publisher)}catch(e){g.publisher=g.publisher.split(',').map(s=>s.trim()).filter(Boolean)}}
    else{g.publisher=g.publisher?[String(g.publisher)]:[]}
  }
  if(!Array.isArray(g.key)){
    if(g.key&&typeof g.key==='string'){try{g.key=JSON.parse(g.key)}catch(e){g.key=g.key.split(',').map(s=>s.trim()).filter(Boolean)}}
    else{g.key=[]}
  }
  if(g.status)g.status=String(g.status).toLowerCase().trim();
  if(!g.status)g.status='wishlist';
  // Migrate legacy tbaText
  if(g.tbaText){
    const tb=String(g.tbaText).trim();
    if(tb.toLowerCase()==='cancelled'){g.status='cancelled';}
    else if(!g.releaseDate){g.releaseDate=tb;}
    g.tbaText='';
  }
  g.id=g.id!==undefined&&g.id!==null&&g.id!==''?String(g.id):gid();
  if(!g.added)g.added=Date.now();
  // Only call normaliseDate for recognisable date formats — preserve text like "Q3 2026"
  if(g.releaseDate){
    const rd=String(g.releaseDate).trim();
    if(/^\d{4}-\d{2}-\d{2}[T ]/.test(rd)||/^\d{10,13}$/.test(rd)||/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.](\d{2}|\d{4})$/.test(rd)||/^Date\(/.test(rd)){
      g.releaseDate=normaliseDate(rd);
    } else {
      g.releaseDate=rd;
    }
  }
  g.steamAppId=(g.steamAppId!==undefined&&g.steamAppId!==null&&g.steamAppId!=='')?String(g.steamAppId):'';
  delete g.played;
  if(!Array.isArray(g.notes)){
    if(g.notes&&typeof g.notes==='string'){try{g.notes=JSON.parse(g.notes)}catch(e){g.notes=[]}}
    else{g.notes=[]}
  }
  if(g.parentAppId!==undefined&&g.parentAppId!==null&&g.parentAppId!=='')
    g.parentAppId=String(g.parentAppId);
  else g.parentAppId=null;
  const _purchasesRawEmpty=!g.purchases||(typeof g.purchases==='string'&&!g.purchases.trim());
  if(g.purchases&&typeof g.purchases==='string'){
    try{g.purchases=JSON.parse(g.purchases)}catch(e){g.purchases=[]}
  }
  if(!Array.isArray(g.purchases))g.purchases=[];
  // Migrate from legacy flat fields if purchases array is empty
  if(!g.purchases.length&&(g.store||g.cost||g.purchaseDate||(g.steamCollection&&g.steamCollection.length)||g.playStatus)){
    const sc=typeof g.steamCollection==='string'?g.steamCollection.split(',').map(s=>s.trim()).filter(Boolean):(g.steamCollection||[]);
    g.purchases=[{platform:'Steam',store:g.store||'',cost:g.cost||'',purchaseDate:g.purchaseDate||'',playStatus:g.playStatus||'Unplayed',steamCollection:[...sc]}];
    if(_purchasesRawEmpty)_migrationHappened=true;
  }
  g.purchases.forEach(p=>{
    if(!Array.isArray(p.steamCollection))p.steamCollection=typeof p.steamCollection==='string'?p.steamCollection.split(',').map(s=>s.trim()).filter(Boolean):[];
    if(p.purchaseDate){const pf=fmtDate(String(p.purchaseDate));if(pf&&pf!==String(p.purchaseDate))p.purchaseDate=pf;}
  });
  syncLegacyFromPurchases(g);
  g.delisted=g.delisted===true||g.delisted==='true'||g.delisted==='TRUE';
  g.skipGGFetch=g.skipGGFetch===true||g.skipGGFetch==='true'||g.skipGGFetch==='TRUE';
  return g;
}
function toSheetRecord(g){
  const r={...g};
  delete r.playStatus;delete r.cost;delete r.purchaseDate;delete r.store;
  delete r.steamCollection;delete r.platforms;delete r.platform;delete r.tbaText;
  delete r.genre;
  return r;
}
let games=[];
function gid(){return Date.now()+Math.random().toString(36).slice(2,6)}
function nid(){return'n'+Date.now()+Math.random().toString(36).slice(2,5)}
function todayStr(){const d=new Date();return`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`}

// ── OFFLINE FALLBACK ──────────────────────
function loadOffline(){
  const stored=localStorage.getItem(KEY);
  if(stored){try{return JSON.parse(stored).map(g=>normalise(g))}catch(e){}}
  return SEED.map(g=>normalise(g));
}
function saveOffline(){localStorage.setItem(KEY,JSON.stringify(games))}

function _jsonpLoad(action){
  return new Promise((resolve,reject)=>{
    const cbName='_btbLoad'+Date.now();
    const script=document.createElement('script');
    const timeout=setTimeout(()=>{
      delete window[cbName];
      try{document.head.removeChild(script)}catch(e){}
      reject(new Error('timeout'));
    },14000);
    window[cbName]=function(data){
      clearTimeout(timeout);
      delete window[cbName];
      try{document.head.removeChild(script)}catch(e){}
      if(data&&data.error)reject(new Error(data.error));
      else resolve(Array.isArray(data)?data:[]);
    };
    script.crossOrigin='anonymous';
    script.src=SHEET_URL+'?action='+action+'&callback='+cbName+'&_='+Date.now()+_tok();
    script.onerror=()=>{
      clearTimeout(timeout);
      delete window[cbName];
      try{document.head.removeChild(script)}catch(e){}
      reject(new Error('script load error — check SHEET_URL and deployment'));
    };
    document.head.appendChild(script);
  });
}

function loadFromSheet(){
  if(USE_JSONP) return _jsonpLoad('getAll');
  const timeout=new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),14000));
  return Promise.race([
    fetch(SHEET_URL+'?action=getAll&_='+Date.now()+_tok(),{mode:'cors'}).then(r=>r.json()),
    timeout
  ]).catch(()=>_jsonpLoad('getAll'));
}

// ── SHEETS: SAVE ─────────────────────────
let _saveQueue=[];
let _saveFlushing=false;
// Partial save: changed game IDs queued, flushed as individual row updates
// Falls back to full setAll if Apps Script doesn't support setRow
const _changedIds=new Set();
function save(changedId){
  if(OFFLINE){saveOffline();return}
  localStorage.setItem(KEY,JSON.stringify(games));
  if(changedId)_changedIds.add(changedId);
  clearTimeout(save._debounce);
  save._debounce=setTimeout(flushSave,400);
}
function flushSave(){
  if(_saveFlushing){_saveQueue.push(true);return}
  _saveFlushing=true;
  setSyncStatus('syncing','Saving…');
  // Try partial save first if only a few rows changed
  if(_changedIds.size>0&&_changedIds.size<=5){
    const ids=[..._changedIds];
    _changedIds.clear();
    const rows=ids.map(id=>games.find(g=>g.id===id)).filter(Boolean);
    if(rows.length){
      postToSheet({action:'setRows',data:JSON.stringify(rows.map(toSheetRecord))})
        .then(()=>{_saveFlushing=false;setSyncStatus('ok','Saved');if(_saveQueue.length){_saveQueue=[];flushSave()}})
        .catch(()=>{
          // Apps Script doesn't support setRows — fall back to full save
          _changedIds.clear();
          if(!games.length){_saveFlushing=false;setSyncStatus('err','Save aborted — no data');return;}
          postToSheet({action:'setAll',data:JSON.stringify(games.map(toSheetRecord))})
            .then(()=>{_saveFlushing=false;setSyncStatus('ok','Saved');if(_saveQueue.length){_saveQueue=[];flushSave()}})
            .catch(err=>{_saveFlushing=false;setSyncStatus('err','Save failed — check console');console.error('BTB save error:',err)});
        });
      return;
    }
  }
  _changedIds.clear();
  if(!games.length){_saveFlushing=false;setSyncStatus('err','Save aborted — no data');return;}
  postToSheet({action:'setAll',data:JSON.stringify(games.map(toSheetRecord))})
    .then(()=>{
      _saveFlushing=false;
      setSyncStatus('ok','Saved');
      if(_saveQueue.length){_saveQueue=[];flushSave()}
    })
    .catch(err=>{
      _saveFlushing=false;
      setSyncStatus('err','Save failed — check console');
      console.error('BTB save error:',err);
    });
}

// POST via fetch — no URL length limit, works cross-origin because
// Apps Script returns the CORS header Access-Control-Allow-Origin: *
function postToSheet(params){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('timeout')),18000);
    const qs=Object.entries(params)
      .filter(([k])=>k!=='data')
      .map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v))
      .join('&')+_tok();
    const url=SHEET_URL+'?'+qs.replace(/^&/,'');
    const body=params.data!==undefined?params.data:null;
    fetch(url,{
      method: body!==null?'POST':'GET',
      mode:'cors',
      headers:body!==null?{'Content-Type':'text/plain'}:{},
      body:body!==null?body:undefined
    })
    .then(r=>r.json())
    .then(resp=>{
      clearTimeout(timeout);
      if(resp&&resp.error)reject(new Error(resp.error));
      else resolve(resp);
    })
    .catch(err=>{clearTimeout(timeout);reject(err)});
  });
}

// ══════════════════════════════════════════
//  RELEASE CALENDAR
// ══════════════════════════════════════════
let calYear=0,calMonth=0,calView='grid',calShowTba=false;

function openCalendar(){
  const now=new Date();
  calYear=now.getFullYear();
  calMonth=now.getMonth();
  calShowTba=false;
  // Force list view on mobile
  if(window.innerWidth<=640){
    calView='list';
  }
  document.getElementById('calOv').classList.add('on');
  document.getElementById('calOv').style.display='flex';
  history.pushState({cal:true},'');
  populateCalSelects();
  renderCalendar();
}
function _rawCloseCalendar(){
  document.getElementById('calOv').classList.remove('on');
  document.getElementById('calOv').style.display='none';
  document.getElementById('calFloatPop').classList.remove('open');
  calShowTba=false;
}
function closeCalendar(){
  _rawCloseCalendar();
  if(history.state&&history.state.cal){
    _popSuppressed=true;history.back();setTimeout(()=>{_popSuppressed=false;},200);
  }
}

function populateCalSelects(){
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const mSel=document.getElementById('calMonthSel');
  const ySel=document.getElementById('calYearSel');
  if(!mSel||!ySel)return;
  mSel.innerHTML=MONTHS.map((m,i)=>`<option value="${i}"${i===calMonth?' selected':''}>${m}</option>`).join('');
  const curY=new Date().getFullYear();
  let yHTML='';
  for(let y=1951;y<=curY+10;y++) yHTML+=`<option value="${y}"${y===calYear?' selected':''}>${y}</option>`;
  ySel.innerHTML=yHTML;
}

function calendarGames(){
  return games.filter(g=>g.title&&!isCancelled(g));
}

function renderCalendar(){
  document.getElementById('calFloatPop').classList.remove('open');
  // Keep selects in sync
  const mSel=document.getElementById('calMonthSel');
  const ySel=document.getElementById('calYearSel');
  if(mSel)mSel.value=calMonth;
  if(ySel)ySel.value=calYear;

  const allCal=calendarGames();
  const tbaGames=allCal.filter(g=>!/^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate));
  const datedGames=allCal.filter(g=>/^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate));

  // TBA list — paginated sidebar. Page size is measured from the actual
  // rendered row height so every page fills the viewport with whole rows —
  // no clipped row, no dead space, no hidden unreachable games.
  let TBA_PAGE_SIZE=20;
  function measureTbaPageSize(){
    const vp=document.getElementById('calTbaViewport');
    if(!vp||!vp.clientHeight)return 20;
    // Measure two real rows inside an actual .cal-tba-grid so the grid's own
    // row gap (which a standalone chip's own box never includes) is captured.
    const probeWrap=document.createElement('div');
    probeWrap.className='cal-tba-grid';
    probeWrap.style.cssText='position:absolute;visibility:hidden;pointer-events:none;left:-9999px;width:'+vp.clientWidth+'px';
    probeWrap.innerHTML='<div class="cal-tba-chip"><span class="cal-tba-chip-title">X</span><span class="cal-tba-chip-sub">X</span></div>'.repeat(2);
    vp.appendChild(probeWrap);
    const rows=probeWrap.querySelectorAll('.cal-tba-chip');
    const rowH=rows[1].getBoundingClientRect().top-rows[0].getBoundingClientRect().top;
    probeWrap.remove();
    if(!rowH)return 20;
    return Math.max(1,Math.floor(vp.clientHeight/rowH));
  }
  let tbaPage=0;
  function renderTbaList(){
    const track=document.getElementById('calTbaTrack');
    const pagination=document.getElementById('tbaPagination');
    if(!track)return;
    if(tbaGames.length===0){
      track.innerHTML=`<div class="tba-list-page"><div style="font-size:.68rem;color:var(--t3)">None</div></div>`;
      if(pagination)pagination.style.display='none';
      return;
    }
    TBA_PAGE_SIZE=measureTbaPageSize();
    const totalPages=Math.ceil(tbaGames.length/TBA_PAGE_SIZE);
    let pagesHTML='';
    for(let p=0;p<totalPages;p++){
      const slice=tbaGames.slice(p*TBA_PAGE_SIZE,(p+1)*TBA_PAGE_SIZE);
      pagesHTML+=`<div class="tba-list-page"><div class="cal-tba-grid">${slice.map(g=>{
        const pc=prioClass(g.priority);
        return`<div class="cal-tba-chip ${pc}" title="${esc(g.title)} — ${esc(g.releaseDate||'')}" onclick="openPanel('${g.id}')"><span class="cal-tba-chip-title ${statusTextClass(g)}">${esc(g.title)}</span><span class="cal-tba-chip-sub">${esc(g.releaseDate||'')}</span></div>`;
      }).join('')}</div></div>`;
    }
    track.innerHTML=pagesHTML;
    track.style.height=(totalPages*100)+'%';
    track.querySelectorAll('.tba-list-page').forEach(p=>{
      p.style.height=(100/totalPages)+'%';
      p.style.minHeight=(100/totalPages)+'%';
    });
    track.style.transform=`translateY(-${tbaPage*(100/totalPages)}%)`;
  }
  renderTbaList();

  // Wire swipe/drag/wheel on TBA viewport — pages stack top to bottom, so
  // paging moves vertically (swipe/scroll up = next page, down = prev page)
  const viewport=document.getElementById('calTbaViewport');
  if(viewport){
    let dragStartY=null,isDragging=false,liveOffset=0,dragMoved=false;
    function getTotalPages(){return Math.ceil(tbaGames.length/TBA_PAGE_SIZE)}
    function goToPage(p){
      const track=document.getElementById('calTbaTrack');
      const total=getTotalPages();
      tbaPage=Math.max(0,Math.min(total-1,p));
      if(track){track.classList.remove('no-transition');track.style.transform=`translateY(-${tbaPage*(100/total)}%)`}
      renderTbaDots();
    }
    function renderTbaDots(){
      const pagination=document.getElementById('tbaPagination');
      const total=getTotalPages();
      if(!pagination||total<=1){if(pagination)pagination.style.display='none';return}
      pagination.style.display='flex';
      const MAX_DOTS=6;
      let html=`<button class="tba-page-btn" id="tbaDotPrev" ${tbaPage===0?'disabled':''} style="flex-shrink:0">▲</button>`;
      if(total<=MAX_DOTS){
        for(let i=0;i<total;i++)html+=`<div class="tba-page-dot${i===tbaPage?' active':''}" data-p="${i}" style="cursor:pointer"></div>`;
      } else {
        let start=Math.max(0,Math.min(tbaPage-2,total-MAX_DOTS));
        let end=start+MAX_DOTS;
        if(start>0)html+=`<div class="tba-page-dot" style="opacity:.3;cursor:default"></div>`;
        for(let i=start;i<end;i++)html+=`<div class="tba-page-dot${i===tbaPage?' active':''}" data-p="${i}" style="cursor:pointer"></div>`;
        if(end<total)html+=`<div class="tba-page-dot" style="opacity:.3;cursor:default"></div>`;
      }
      html+=`<button class="tba-page-btn" id="tbaDotNext" ${tbaPage===total-1?'disabled':''} style="flex-shrink:0">▼</button>`;
      pagination.innerHTML=html;
      pagination.querySelectorAll('.tba-page-dot[data-p]').forEach(dot=>{dot.onclick=()=>goToPage(parseInt(dot.dataset.p))});
      const prevBtn=document.getElementById('tbaDotPrev');
      const nextBtn=document.getElementById('tbaDotNext');
      if(prevBtn)prevBtn.onclick=()=>goToPage(tbaPage-1);
      if(nextBtn)nextBtn.onclick=()=>goToPage(tbaPage+1);
    }
    viewport.addEventListener('mousedown',e=>{
      if(getTotalPages()<=1)return;
      dragStartY=e.clientY;isDragging=true;dragMoved=false;liveOffset=0;
      const track=document.getElementById('calTbaTrack');if(track)track.classList.add('no-transition');
      e.preventDefault();
    });
    document.addEventListener('mousemove',e=>{
      if(!isDragging||dragStartY===null)return;
      liveOffset=e.clientY-dragStartY;
      if(Math.abs(liveOffset)>4){dragMoved=true;viewport.classList.add('dragging')}
      const track=document.getElementById('calTbaTrack');if(!track)return;
      const total=getTotalPages();
      track.style.transform=`translateY(calc(-${tbaPage*(100/total)}% + ${liveOffset}px))`;
    });
    document.addEventListener('mouseup',e=>{
      if(!isDragging)return;
      isDragging=false;viewport.classList.remove('dragging');
      const threshold=viewport.offsetHeight*0.25;
      if(liveOffset<-threshold)goToPage(tbaPage+1);
      else if(liveOffset>threshold)goToPage(tbaPage-1);
      else goToPage(tbaPage);
      dragStartY=null;
      if(dragMoved)document.addEventListener('click',e=>e.stopPropagation(),{capture:true,once:true});
      dragMoved=false;
    });
    let touchStartY=null;
    viewport.addEventListener('touchstart',e=>{
      if(getTotalPages()<=1)return;
      touchStartY=e.touches[0].clientY;
      const track=document.getElementById('calTbaTrack');if(track)track.classList.add('no-transition');
    },{passive:true});
    viewport.addEventListener('touchmove',e=>{
      if(touchStartY===null)return;
      e.preventDefault();
      const track=document.getElementById('calTbaTrack');if(!track)return;
      const dy=e.touches[0].clientY-touchStartY;
      const tot=getTotalPages();
      track.style.transform=`translateY(calc(-${tbaPage*(100/tot)}% + ${dy}px))`;
    },{passive:false});
    viewport.addEventListener('touchend',e=>{
      if(touchStartY===null)return;
      const dy=e.changedTouches[0].clientY-touchStartY;
      const threshold=viewport.offsetHeight*0.25;
      if(dy<-threshold)goToPage(tbaPage+1);
      else if(dy>threshold)goToPage(tbaPage-1);
      else goToPage(tbaPage);
      touchStartY=null;
    },{passive:true});
    // Scroll wheel (desktop trackpad/mouse) pages the list — one page per
    // gesture, debounced so a single wheel event doesn't skip multiple pages
    let wheelLock=false;
    viewport.addEventListener('wheel',e=>{
      if(getTotalPages()<=1||Math.abs(e.deltaY)<2)return;
      e.preventDefault();
      if(wheelLock)return;
      wheelLock=true;
      goToPage(tbaPage+(e.deltaY>0?1:-1));
      setTimeout(()=>{wheelLock=false;},350);
    },{passive:false});
    renderTbaDots();
  }

  // Update TBA filter pill (mobile) — hidden entirely when there's nothing to show
  const tbaBtn=document.getElementById('calTbaBtn');
  const tbaCount=document.getElementById('calTbaCount');
  if(!tbaGames.length)calShowTba=false;
  if(tbaBtn){
    if(tbaCount)tbaCount.textContent=tbaGames.length||'';
    tbaBtn.classList.toggle('selected',calShowTba);
    tbaBtn.classList.toggle('cal-tba-empty',tbaGames.length===0);
  }

  const main=document.getElementById('calMain');
  const mainWrap=document.getElementById('calMainWrap');
  const calTbaEl=document.getElementById('calTba');
  const isMobile=window.innerWidth<=640;

  // Mobile TBA panel toggle — also hides the month/year selects, since there's
  // no month grid to navigate while the TBA panel is showing
  const hdrNav=document.querySelector('.cal-hdr-nav');
  if(isMobile&&calShowTba){
    calTbaEl.style.cssText='display:flex;flex-direction:column;width:100%;border-left:none;padding:.85rem 1rem;height:420px';
    mainWrap.style.display='none';
    if(hdrNav)hdrNav.style.display='none';
    renderTbaList(); // re-measure now that the panel actually has its real height
    return;
  } else {
    if(isMobile||!tbaGames.length)calTbaEl.style.display='none';
    else calTbaEl.style.cssText='';// use .cal-tba-wide CSS
    mainWrap.style.display='';
    if(hdrNav)hdrNav.style.display='';
  }

  // Month grid — one month on mobile, two stacked on desktop. Same
  // renderMonthGrid()/day-count-bubble/popover interaction on both.
  const DAYS=['M','T','W','T','F','S','S'];
  const todayISOs=todayISO();
  const byDate={};
  datedGames.forEach(g=>{
    const d=normaliseDate(g.releaseDate);
    if(!byDate[d])byDate[d]=[];
    byDate[d].push(g);
  });

  const MONTH_NAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const nowISO=todayISO();
  const nowYear=new Date().getFullYear();
  const nowMonth=new Date().getMonth();

  function renderMonthGrid(year,month){
    const isCurrentMonth=(year===nowYear&&month===nowMonth);
    const firstDow=(new Date(year,month,1).getDay()+6)%7;
    const daysInMonth=new Date(year,month+1,0).getDate();
    const daysInPrev=new Date(year,month,0).getDate();
    let html=`<div class="cal-month-block">`;
    html+=`<div class="cal-month-label${isCurrentMonth?' is-current':''}">${MONTH_NAMES[month]} ${year}</div>`;
    html+=`<div class="cal-grid">`;
    DAYS.forEach(d=>html+=`<div class="cal-dow">${d}</div>`);
    for(let i=0;i<firstDow;i++){
      html+=`<div class="cal-cell other-month"><div class="cal-dn">${daysInPrev-firstDow+1+i}</div></div>`;
    }
    for(let day=1;day<=daysInMonth;day++){
      const dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const isToday=dateStr===todayISOs;
      const isPast=dateStr<todayISOs;
      const cellGames=byDate[dateStr]||[];
      const hasPre=cellGames.some(g=>isPreOrder(g));
      const countBadge=cellGames.length>0
        ?`<div class="cal-count${hasPre?' has-pre':''}" data-date="${dateStr}">${cellGames.length}</div>`
        :'';
      html+=`<div class="cal-cell${isToday?' today':''}${isPast?' past':''}">
        <div class="cal-dn">${day}</div>${countBadge}
      </div>`;
    }
    const totalCells=firstDow+daysInMonth;
    const remaining=(7-totalCells%7)%7;
    for(let i=1;i<=remaining;i++)html+=`<div class="cal-cell other-month"><div class="cal-dn">${i}</div></div>`;
    html+=`</div></div>`;
    return html;
  }

  let html='<div class="cal-2stack"><div class="cal-months-col">';
  if(isMobile){
    html+=renderMonthGrid(calYear,calMonth);
  } else {
    let mo1=calMonth+1,yr1=calYear;
    if(mo1>11){mo1-=12;yr1++}
    html+=renderMonthGrid(calYear,calMonth);
    html+=renderMonthGrid(yr1,mo1);
  }
  html+='</div></div>';
  main.innerHTML=html;

  requestAnimationFrame(()=>{renderTbaList();});

  // Wire count badge clicks — fill the singleton floating popover (a
  // "portal": it lives outside calMain in the DOM and is position:fixed,
  // so it's never clipped by the calendar's own overflow/scroll areas)
  // and place it next to the clicked badge, flipping/clamping as needed
  // to stay fully on-screen.
  const floatPop=document.getElementById('calFloatPop');
  main.querySelectorAll('.cal-count').forEach(badge=>{
    badge.addEventListener('click',function(e){
      e.stopPropagation();
      const dateStr=this.dataset.date;
      const alreadyOpenHere=floatPop.classList.contains('open')&&floatPop.dataset.date===dateStr;
      floatPop.classList.remove('open');
      if(alreadyOpenHere)return;
      const cellGames=byDate[dateStr]||[];
      floatPop.innerHTML=cellGames.map(g=>`<div class="cal-pop-item ${prioClass(g.priority)}" onclick="this.closest('.cal-pop').classList.remove('open');openPanel('${g.id}')"><span class="cal-pop-item-title ${statusTextClass(g)}">${esc(g.title)}</span></div>`).join('');
      floatPop.dataset.date=dateStr;
      floatPop.classList.add('open');
      positionFloatPop(floatPop,this);
    });
  });
}

function positionFloatPop(pop,anchor){
  const r=anchor.getBoundingClientRect();
  const margin=6;
  pop.style.left=margin+'px';pop.style.top=margin+'px';
  const pr=pop.getBoundingClientRect();
  let left=r.left+r.width/2-pr.width/2;
  if(left<margin)left=margin;
  if(left+pr.width>window.innerWidth-margin)left=window.innerWidth-pr.width-margin;
  let top=r.bottom+4;
  if(top+pr.height>window.innerHeight-margin)top=r.top-pr.height-4;
  if(top<margin)top=margin;
  pop.style.left=left+'px';
  pop.style.top=top+'px';
}

// Calendar controls
document.getElementById('calClose').addEventListener('click',closeCalendar);
document.getElementById('calOv').addEventListener('click',e=>{if(e.target===document.getElementById('calOv'))closeCalendar()});
document.getElementById('calPrev').addEventListener('click',()=>{
  calMonth--;if(calMonth<0){calMonth=11;calYear--}populateCalSelects();renderCalendar();
});
document.getElementById('calNext').addEventListener('click',()=>{
  calMonth++;if(calMonth>11){calMonth=0;calYear++}populateCalSelects();renderCalendar();
});
// Desktop: scroll wheel over the month grid transitions between months —
// one month per gesture, debounced so a single wheel event (or a long
// trackpad swipe firing many deltaY ticks) doesn't skip several months
(function(){
  let wheelLock=false;
  document.getElementById('calMainWrap').addEventListener('wheel',e=>{
    if(window.innerWidth<=640||Math.abs(e.deltaY)<2)return;
    e.preventDefault();
    if(wheelLock)return;
    wheelLock=true;
    if(e.deltaY>0){calMonth++;if(calMonth>11){calMonth=0;calYear++}}
    else{calMonth--;if(calMonth<0){calMonth=11;calYear--}}
    populateCalSelects();renderCalendar();
    setTimeout(()=>{wheelLock=false;},450);
  },{passive:false});
})();
document.getElementById('calMonthSel').addEventListener('change',function(){
  calMonth=parseInt(this.value);renderCalendar();
});
document.getElementById('calYearSel').addEventListener('change',function(){
  calYear=parseInt(this.value);renderCalendar();
});
document.getElementById('calTbaBtn').addEventListener('click',()=>{
  calShowTba=!calShowTba;
  renderCalendar();
});
// Close calendar popovers when clicking outside — single listener, never accumulates
document.addEventListener('click',function(e){
  if(!e.target.closest('.cal-count')&&!e.target.closest('.cal-pop')){
    document.querySelectorAll('.cal-pop.open').forEach(p=>p.classList.remove('open'));
  }
});
// Mobile swipe to change month — plain drag-follow + snap, same mechanic and
// easing as the Undated list's own carousel (touchmove tracks the finger, no
// hint, no fade; release either snaps back or commits to the next/prev month).
(function(){
  const THRESHOLD=50;
  let sx=null,sy=null,live=false;
  const ov=document.getElementById('calOv');
  ov.addEventListener('touchstart',e=>{
    if(window.innerWidth>640||calShowTba)return; // TBA panel handles its own swipes
    if(e.target.closest('#calTba'))return;
    sx=e.touches[0].clientX;sy=e.touches[0].clientY;live=false;
  },{passive:true});
  ov.addEventListener('touchmove',e=>{
    if(sx===null||window.innerWidth>640)return;
    const dx=e.touches[0].clientX-sx;
    const dy=e.touches[0].clientY-sy;
    if(!live){
      if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){sx=null;return;}
      if(Math.abs(dx)<8)return;
      live=true;
    }
    e.preventDefault();
    const main=document.getElementById('calMain');
    if(main){main.style.transition='none';main.style.transform=`translateX(${dx}px)`;}
  },{passive:false});
  ov.addEventListener('touchend',e=>{
    if(sx===null||window.innerWidth>640){sx=null;return;}
    const dx=e.changedTouches[0].clientX-sx;
    const dy=e.changedTouches[0].clientY-sy;
    const wasLive=live;
    sx=null;live=false;
    const main=document.getElementById('calMain');
    if(!wasLive||Math.abs(dx)<THRESHOLD||Math.abs(dy)>Math.abs(dx)){
      if(main){main.style.transition='transform .3s cubic-bezier(.4,0,.2,1)';main.style.transform='';}
      return;
    }
    if(main){main.style.transition='transform .3s cubic-bezier(.4,0,.2,1)';main.style.transform='';}
    if(dx<0){calMonth++;if(calMonth>11){calMonth=0;calYear++;}}
    else{calMonth--;if(calMonth<0){calMonth=11;calYear--;}}
    populateCalSelects();renderCalendar();
  },{passive:true});
})();

// ── SYNC PILL TAP TO RETRY ───────────────
document.addEventListener('DOMContentLoaded',()=>{
  const pill = document.getElementById('syncPill');
  if(pill) pill.addEventListener('click',()=>{
    if(!OFFLINE) initData();
  });
});

// ── INIT: LOAD ON OPEN ────────────────────
async function initData(){
  if(OFFLINE){
    games=loadOffline();
    setSyncStatus('offline','Offline mode');
    dispatchRender();
    return;
  }
  // Cache-first: show local data immediately, sync in background
  const cached=loadOffline();
  if(cached.length){
    games=cached;
    dispatchRender();
  }
  setSyncStatus('syncing','Syncing…');
  try{
    const data=await loadFromSheet();
    _migrationHappened=false;
    games=data.map(g=>normalise(g));
    localStorage.setItem(KEY,JSON.stringify(games));
    setSyncStatus('ok','Loaded');
    dispatchRender();
    fetchMeta();
    loadSavedPrices();
    if(_migrationHappened){
      _migrationHappened=false;
      postToSheet({action:'setAll',data:JSON.stringify(games.map(toSheetRecord))})
        .then(()=>setSyncStatus('ok','Purchases synced'))
        .catch(()=>{});
    }
  }catch(err){
    console.warn('BTB: Could not load from Sheet, falling back to localStorage.',err);
    if(!cached.length){games=loadOffline();dispatchRender();}
    setSyncStatus('err','Sheet unavailable — using local cache');
  }
}

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
let af='all',vm='grid',openId=null,editId=null,rmId=null,riId=null,wlovId=null;
let appMode='wishlist'; // 'wishlist' | 'collection'
let cfPlayStatus=new Set(),cfSteamCol=new Set(),cfSteamColLogic='or';
let hrMinVal=0,hrMaxVal=100;

let cGenres=[],cTags=[],cStars=0;
let fGenres=new Set(),fTags=new Set(),fPrios=new Set();
let fGenreLogic='or',fTagLogic='or',fPrioMode='upto';
let cfGenres=new Set(),cfGenreLogic='or',cfPlats=new Set(),cfPlatLogic='or',cfPlatClosed=false;
// Store/Year/Month are always OR-within (a single purchase has exactly one
// store and one date, so "AND" within a dimension can never match) and
// compound together onto the SAME purchase entry — see collectionFiltered().
// Month values are calendar-month abbreviations ('Jan'..'Dec'), matching
// Spend Stats' "every February across every year" semantics.
let cfStores=new Set(),cfYears=new Set(),cfMonths=new Set();

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
const esc=s=>s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):'';
const nr=g=>g.hotness===''||g.hotness===null||g.hotness===undefined;
window._phToggle=function(hid,btn,n){const h=document.getElementById(hid);if(!h)return;const exp=h.style.display!=='none';h.style.display=exp?'none':'';btn.textContent=exp?`[+${n}]`:'[−]'};
const isUnreleased=g=>isGameUnreleased(g); // alias
const sc=id=>`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`;

function prioClass(p){return p==='high'?'prio-high':p==='low'?'prio-low':'prio-medium'}
// Advances the priority filter pill to its next cycle state. UP TO is cumulative
// (low -> low+medium -> everything/no filter -> repeat); EXACT isolates one tier
// at a time (low -> medium -> high -> repeat). Any state that doesn't match one of
// the mode's canonical stops (e.g. leftover from a shared URL, or a chip removed
// individually) just lands on the mode's first stop rather than guessing further.
function cyclePrioFilter(){
  const states=fPrioMode==='exact'?[['low'],['medium'],['high']]:[[],['low'],['low','medium']];
  const key=arr=>[...arr].sort().join(',');
  const curKey=key(fPrios);
  const idx=states.findIndex(s=>key(s)===curKey);
  const next=idx===-1?states[0]:states[(idx+1)%states.length];
  fPrios=new Set(next);
}
// Status color for a game/DLC's title text — replaces separate dots/badges.
function statusTextClass(g){
  if(g.status==='cancelled')return'st-cancelled';
  if(g.status==='removed')return'st-removed';
  if(g.status==='bought')return isPreOrder(g)?'st-preorder':'st-owned';
  return'';
}
const PLAT_COLORS={'Steam':'#66c0f4','Epic Games':'#101014','GOG':'#9b4dca','Other PC':'#3a352c','PS':'#003791','Xbox':'#107c10','Nintendo':'#e4000f'};
function platColor(p){return PLAT_COLORS[p]||'#3a352c'}
function platTextColor(p){return p==='Epic Games'?'#fff':p==='GOG'?'#fff':p==='PS'?'#fff':p==='Xbox'?'#fff':p==='Nintendo'?'#fff':p==='Other PC'?'#b5a98c':!PLAT_COLORS[p]?'#b5a98c':'#031329'}
function platBadgesHTML(g){
  if(g.status!=='bought')return'';
  const ps=ownedPlatforms(g);
  if(!ps.length)return'';
  return`<div class="cc-plats">${ps.map(p=>`<span class="b-plat" style="background:${platColor(p)};color:${platTextColor(p)}">${esc(p)}</span>`).join('')}</div>`;
}
function prioLabel(p){return t(p==='high'?'pHi':p==='low'?'pLo':'pMe')}

// ── DATE HELPERS ─────────────────────────
// Normalise any date format to YYYY-MM-DD string
function normaliseDate(raw){
  if(!raw)return'';
  const s=String(raw).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  // ISO 8601 or SQL datetime — slice the date part, no timezone conversion
  if(/^\d{4}-\d{2}-\d{2}[T ]/.test(s))return s.slice(0,10);
  // Numeric epoch: 10 digits = seconds, 13 digits = milliseconds
  if(/^\d{10,13}$/.test(String(raw))){
    const ms=String(raw).length<=10?Number(raw)*1000:Number(raw);
    const d=new Date(ms);
    if(!isNaN(d))return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const m=String(raw).match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/);
  if(m){let[,d,mo,y]=m;if(y.length===2)y=(parseInt(y)<50?'20':'19')+y;return`${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`}
  // Google Visualization API date format: "Date(2024,3,25)" — month is 0-based
  const gv=String(raw).match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)$/);
  if(gv){const[,y,mo,d]=gv;return`${y}-${String(Number(mo)+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
  // "25 Nov 2019" display format produced by fmtDate
  const dm=String(raw).match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if(dm){const MM={Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};const[,d,mo,y]=dm;const moN=MM[mo.charAt(0).toUpperCase()+mo.slice(1,3).toLowerCase()];if(moN)return`${y}-${String(moN).padStart(2,'0')}-${d.padStart(2,'0')}`;}
  // Last resort: try native Date parsing (handles "Mon Apr 25 2024 ..." etc.)
  const fd=new Date(String(raw));
  if(!isNaN(fd)&&fd.getFullYear()>1900){return`${fd.getFullYear()}-${String(fd.getMonth()+1).padStart(2,'0')}-${String(fd.getDate()).padStart(2,'0')}`}
  return String(raw);
}
function displayReleaseDate(g){
  if(!g.releaseDate)return'—';
  if(/^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate))return fmtDate(g.releaseDate);
  return g.releaseDate;
}
function releaseYear(g){
  if(!g.releaseDate)return'—';
  if(/^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate))return g.releaseDate.slice(0,4);
  if(/^\d{4}$/.test(g.releaseDate))return g.releaseDate;
  const m=g.releaseDate.match(/\b(20\d{2})\b/);
  return m?m[1]:'TBA';
}
function isTodayDate(raw){return normaliseDate(raw)===todayISO()}
function fmtDate(d){
  if(!d)return'';
  const n=normaliseDate(d);
  if(/^\d{4}-\d{2}-\d{2}$/.test(n)){
    const[y,mo,dd]=n.split('-');
    const M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return`${dd} ${M[Number(mo)-1]} ${y}`;
  }
  return '';
}
function parseDate(raw){return normaliseDate(raw)}
function todayISO(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function isFutureDate(raw){
  const n=normaliseDate(raw);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(n))return false;
  return n>todayISO();
}
// A game is "unreleased" if releaseDate is blank, non-ISO text ("Q3 2026"), or a future ISO date
function isGameUnreleased(g){
  if(!g.releaseDate)return true;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate))return true;
  return isFutureDate(g.releaseDate);
}
// A game is a pre-order if: status=bought AND not yet released (future ISO date, or TBA/unknown date)
function isPreOrder(g){
  return g.status==='bought'&&isGameUnreleased(g);
}
// A game is cancelled if its status is 'cancelled'
function isCancelled(g){ return g.status==='cancelled'; }
function daysAgo(ts){
  if(!ts)return null;
  return Math.floor((Date.now()-ts)/(1000*60*60*24));
}
const _months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtAdded(d,val){
  if(d===null)return'—';
  if(d===0)return'Today';
  if(d===1)return'Yesterday';
  if(d<=7)return`${d} days ago`;
  const dt=new Date(val);
  return`${dt.getDate()} ${_months[dt.getMonth()]} ${dt.getFullYear()}`;
}
function addedTip(g){
  const d=daysAgo(g.added);
  if(d===null)return'';
  const label=fmtAdded(d,g.added);
  return`Added ${label}`;
}

const FAV_STEAM='https://store.steampowered.com/favicon.ico';
const FAV_GG='https://gg.deals/favicon.ico';
const FAV_SDB="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231b2838'/%3E%3Ctext x='16' y='22' text-anchor='middle' font-family='Arial' font-weight='bold' font-size='16' fill='%2366c0f4'%3EDB%3C/text%3E%3C/svg%3E";
function favImg(src,alt){return`<img src="${src}" alt="${alt}" width="13" height="13" onerror="this.style.opacity='.3'">`}
function shareIcon(){return`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M8 2L5 5M8 2l3 3"/><path d="M2 9v3.5A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5V9"/></svg>`}
// Share a game's store link — there's no shareable URL for a backlog entry itself
// (data lives in localStorage/the user's private Sheet), so this shares wherever the
// game can actually be found: g.storeLink if the user set one, else the Steam page,
// same fallback chain openPanel() already uses to build its own store link icon.
async function shareGame(id){
  const g=games.find(x=>String(x.id)===String(id));if(!g)return;
  const url=g.storeLink||(g.steamAppId?`https://store.steampowered.com/app/${g.steamAppId}/`:`https://store.steampowered.com/search/?term=${encodeURIComponent(g.title||'')}`);
  if(navigator.share){
    try{await navigator.share({title:g.title||'Game',url})}catch(e){/* user cancelled — no-op */}
    return;
  }
  try{await navigator.clipboard.writeText(url);showToast('Link copied to clipboard')}
  catch(e){showToast('Could not copy link')}
}
// Key Chip's whole-body click action — copies via a data attribute (not an
// inline-string arg) so odd characters in a key can't break the onclick attr.
async function copyKeyChip(el){
  const key=el.dataset.key;if(!key)return;
  try{await navigator.clipboard.writeText(key);showToast('Key copied to clipboard')}
  catch(e){showToast('Could not copy key')}
}
// Drop a single spare key once it's traded away — doesn't touch the sheet
// row's other columns, just rewrites games[].key on next save.
function removeGameKey(id,idx){
  const g=games.find(x=>String(x.id)===String(id));if(!g||!Array.isArray(g.key))return;
  if(!confirm('Remove this trade key?'))return;
  g.key.splice(idx,1);
  save(g.id);
  if(openId===g.id)openPanel(openId);
}

// Disables a menu item (both its mobile #hmenu and desktop #dhmenu copies)
// and shows a small pulsing dot while a background batch job (release
// date check, live prices, missing prices) is running — prevents firing
// a second overlapping run of the same job, which used to be possible by
// just clicking the menu item again while the first run was still going.
function setMenuRunning(ids,running){
  ids.forEach(id=>{
    const btn=document.getElementById(id);
    if(!btn)return;
    btn.disabled=running;
    btn.classList.toggle('running',running);
  });
}

// ══════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════
let toastTimer=null;
function showToast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg;el.className='on'+(type?' '+type:'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{el.className=''},3200);
}

// ══════════════════════════════════════════
//  GENRE SUGGESTIONS
// ══════════════════════════════════════════
function allGenres(){
  const set=new Set();
  games.forEach(g=>(g.genres||[]).forEach(x=>{if(x)set.add(x)}));
  return[...set].sort();
}
function allDevPub(field){
  const set=new Set();
  games.forEach(g=>{
    const v=g[field];
    if(Array.isArray(v))v.forEach(s=>{if(s)set.add(s)});
    else if(v&&typeof v==='string')set.add(v);
  });
  return[...set].sort();
}
function allTagsSorted(){
  const freq={};
  games.forEach(g=>(g.tags||[]).forEach(t=>{if(t)freq[t]=(freq[t]||0)+1}));
  return Object.keys(freq).sort((a,b)=>freq[b]-freq[a]||a.localeCompare(b));
}
function allSteamCollections(){
  // Merge Sheet data values + hardcoded seed, deduplicated + sorted
  const set=new Set(STEAM_COLLECTIONS);
  games.forEach(g=>(g.steamCollection||[]).forEach(c=>{if(c)set.add(c)}));
  return[...set].sort();
}
function allStoresForPlatform(plat){
  const freq={};
  games.forEach(g=>(g.purchases||[]).forEach(p=>{
    if(p.platform===plat&&p.store)freq[p.store]=(freq[p.store]||0)+1;
  }));
  return Object.keys(freq).sort((a,b)=>freq[b]-freq[a]||a.localeCompare(b));
}

// ══════════════════════════════════════════
//  FILTER + SORT
// ══════════════════════════════════════════
function collectionFiltered(){
  const _si=document.getElementById('searchInput');const _sm=document.getElementById('searchInputMob');
  const q=((_si&&_si.value)||(_sm&&_sm.value)||'').trim().toLowerCase();
  return games.filter(g=>{
    if(g.status!=='bought')return false;
    if(q&&!(g.title||'').toLowerCase().includes(q)&&!(g.steamAppId&&String(g.steamAppId)===q.replace(/\D/g,'')))return false;
    // DLCs don't track Play Status or Steam Collection, so these two filters
    // simply don't apply to them — a DLC never gets excluded by either.
    if(g.type!=='dlc'){
      if(cfPlayStatus.size>0&&!cfPlayStatus.has(g.playStatus||'Unplayed'))return false;
      if(cfSteamCol.size>0){
        const gc2=(g.steamCollection||[]).map(colLabel);
        const colMatch=cfSteamColLogic==='and'?[...cfSteamCol].every(c=>gc2.includes(c)):[...cfSteamCol].some(c=>gc2.includes(c));
        if(!colMatch)return false;
      }
    }
    if(cfGenres.size>0){
      const gg=g.genres&&g.genres.length?g.genres:(g.genre?[g.genre]:[]);
      const genreMatch=cfGenreLogic==='and'?[...cfGenres].every(x=>gg.includes(x)):[...cfGenres].some(x=>gg.includes(x));
      if(!genreMatch)return false;
    }
    if(cfPlats.size>0){
      const owned=ownedPlatforms(g);
      // OR/AND picks the base match (own at least one selected vs own every selected);
      // "closed" then additionally requires owned to have nothing outside the
      // selected set — e.g. OR+closed = "A or B, and nowhere else", AND+closed =
      // "exactly A and B, no more, no less" (a single platform + closed reproduces
      // the old single-platform-exclusive ONLY behavior as a special case).
      const baseMatch=cfPlatLogic==='and'?[...cfPlats].every(p=>owned.includes(p)):owned.some(p=>cfPlats.has(p));
      if(!baseMatch)return false;
      if(cfPlatClosed&&!owned.every(p=>cfPlats.has(p)))return false;
    }
    if(cfStores.size>0||cfYears.size>0||cfMonths.size>0){
      // Store/Year/Month must all match on the SAME purchase — independent
      // per-dimension checks would let "GOG" from one purchase and "March
      // 2023" from an unrelated purchase of the same game both pass.
      const match=gamePurchases(g).some(p=>{
        if(cfStores.size>0&&!cfStores.has(p.store||''))return false;
        const d=normaliseDate(p.purchaseDate);
        if(cfYears.size>0&&!(d&&cfYears.has(d.slice(0,4))))return false;
        if(cfMonths.size>0&&!(d&&cfMonths.has(MONTH_NAMES[parseInt(d.slice(5,7),10)-1])))return false;
        return true;
      });
      if(!match)return false;
    }
    return true;
  });
}

function collectionSorted(list){
  const s=document.getElementById('cSortSel').value;
  return[...list].sort((a,b)=>{
    if(s==='title')return(a.title||'').localeCompare(b.title||'');
    if(s==='playstatus'){
      const order=['In Progress','Completed','Unplayed','Superseded','Unfinishable','Played on Different Platform','Will Never Complete','Will Never Play'];
      return(order.indexOf(a.playStatus||'Unplayed'))-(order.indexOf(b.playStatus||'Unplayed'));
    }
    if(s==='cost-desc')return gameTotalCost(b)-gameTotalCost(a);
    if(s==='cost-asc')return gameTotalCost(a)-gameTotalCost(b);
    if(s==='purchaseDate'){
      function _pdKey(d){if(!d)return'';const m=d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''}
      return _pdKey(b.purchaseDate).localeCompare(_pdKey(a.purchaseDate));
    }
    // default: steamcol — group by first collection, then title
    const ca=(a.steamCollection&&a.steamCollection[0])||'zzz';
    const cb2=(b.steamCollection&&b.steamCollection[0])||'zzz';
    return ca!==cb2?ca.localeCompare(cb2):(a.title||'').localeCompare(b.title||'');
  });
}

function filtered(){
  const _si=document.getElementById('searchInput');const _sm=document.getElementById('searchInputMob');
  const q=((_si&&_si.value)||(_sm&&_sm.value)||'').trim();
  const ql=q.toLowerCase();
  const isNumeric=/^\d+$/.test(q);
  return games.filter(g=>{
    if(q){
      const titleMatch=(g.title||'').toLowerCase().includes(ql);
      const appIdMatch=isNumeric&&g.steamAppId&&String(g.steamAppId)===q;
      if(!titleMatch&&!appIdMatch)return false;
    }
    if(af==='wishlist'){if(g.status!=='wishlist'&&!(g.status==='bought'&&g.steamWishlist))return false;}
    // Bought/collection games never appear in wishlist tabs
    if(af==='all'&&g.status==='bought'&&!g.steamWishlist)return false;
    else if(af==='cancelled'){if(g.status!=='cancelled')return false;}
    else if(af==='removed'){if(g.status!=='removed')return false;}
    else if(af==='review'){if(!(g.status==='wishlist'&&nr(g)))return false;}
    else if(af==='unreleased'){if(!((g.status==='wishlist'||g.status==='bought')&&isGameUnreleased(g)&&g.status!=='cancelled'))return false;}
    else{
      if(hrMinVal>0||hrMaxVal<100){
        if(!nr(g)){const h=parseInt(g.hotness)||0;if(h<hrMinVal||h>hrMaxVal)return false}
      }
    }
    if(fGenres.size>0){
      const gg=g.genres&&g.genres.length?g.genres:(g.genre?[g.genre]:[]);
      const match=fGenreLogic==='and'?[...fGenres].every(x=>gg.includes(x)):[...fGenres].some(x=>gg.includes(x));
      if(!match)return false;
    }
    if(fTags.size>0){
      const gt=g.tags||[];
      const match=fTagLogic==='and'?[...fTags].every(x=>gt.includes(x)):[...fTags].some(x=>gt.includes(x));
      if(!match)return false;
    }
    if(fPrios.size>0){
      const p=g.priority||'medium';
      if(!fPrios.has(p))return false;
    }
    return true;
  });
}
function sorted(list){
  const s=document.getElementById('sortSel').value;
  const prioOrder={high:0,medium:1,low:2};
  return[...list].sort((a,b)=>{
    if(s==='title')return a.title.localeCompare(b.title);
    if(s==='price-asc')return(parseFloat(a.price)||0)-(parseFloat(b.price)||0);
    if(s==='price-desc')return(parseFloat(b.price)||0)-(parseFloat(a.price)||0);
    if(s==='added')return b.added-a.added;
    if(s==='priority'){
      const pa=prioOrder[a.priority||'medium']!==undefined?prioOrder[a.priority||'medium']:1;
      const pb=prioOrder[b.priority||'medium']!==undefined?prioOrder[b.priority||'medium']:1;
      return pa!==pb?pa-pb:b.added-a.added;
    }
    if(s==='release-asc'){
      const da=normaliseDate(a.releaseDate)||'9999-99-99';
      const db=normaliseDate(b.releaseDate)||'9999-99-99';
      return da!==db?da.localeCompare(db):a.title.localeCompare(b.title);
    }
    const ha=nr(a)?null:parseInt(a.hotness)||0;
    const hb=nr(b)?null:parseInt(b.hotness)||0;
    if(ha===null&&hb===null)return b.added-a.added;
    if(ha===null)return-1;if(hb===null)return 1;
    return hb-ha;
  });
}

// ══════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════
function fmtNum(n){return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}
function fmtEur(n){
  const parts=n.toFixed(2).split('.');
  return '€'+fmtNum(parts[0])+'.'+parts[1];
}
function baselineGames(){
  return games.filter(g=>{
    if(af==='wishlist')return g.status==='wishlist'&&!isCancelled(g);
    if(af==='all')return g.status!=='bought';
    if(af==='cancelled')return isCancelled(g);
    if(af==='removed')return g.status==='removed';
    if(af==='review')return g.status==='wishlist'&&!isCancelled(g)&&nr(g);
    if(af==='unreleased')return(g.status==='wishlist'||g.status==='bought')&&isGameUnreleased(g)&&!isCancelled(g);
    return g.status!=='bought';
  });
}
function renderStats(){
  const cur=filtered();
  const baseline=baselineGames();
  const total=baseline.length;
  const isFiltered=cur.length!==total;
  const totVal=baseline.filter(g=>g.price).reduce((s,g)=>s+parseFloat(g.price),0);
  const curVal=cur.filter(g=>g.price).reduce((s,g)=>s+parseFloat(g.price),0);
  let countChip;
  if(isFiltered){
    countChip=`<div class="chip"><b>${fmtNum(cur.length)}</b><span style="color:var(--muted)">/${fmtNum(total)}</span> games</div>`;
  } else {
    countChip=`<div class="chip"><b>${fmtNum(total)}</b> games</div>`;
  }
  let valChip;
  if(isFiltered){
    valChip=`<div class="chip"><b>${fmtEur(curVal)}</b><span style="color:var(--muted)">/${fmtEur(totVal)}</span></div>`;
  } else {
    valChip=`<div class="chip"><b>${fmtEur(totVal)}</b></div>`;
  }
  document.getElementById('statChips').innerHTML=countChip+valChip;
}

// ══════════════════════════════════════════
//  CARD
// ══════════════════════════════════════════
// ── FLOATING META TOOLTIP ────────────────────────────────────
(function(){
  const tip=document.getElementById('metaFloatTip');
  if(!tip)return;
  // Mouse hover (desktop)
  document.addEventListener('mouseover',e=>{
    const icon=e.target.closest('.meta-tip-icon');
    if(!icon)return;
    const desc=icon.dataset.desc;
    if(!desc)return;
    tip.textContent=desc;
    tip.style.display='block';
    const r=icon.getBoundingClientRect();
    const tw=180,th=tip.offsetHeight||60;
    let top=r.top-th-6;
    if(top<6)top=r.bottom+6;
    let left=r.left+r.width/2-tw/2;
    if(left<6)left=6;
    if(left+tw>window.innerWidth-6)left=window.innerWidth-tw-6;
    tip.style.top=top+'px';
    tip.style.left=left+'px';
  });
  document.addEventListener('mouseout',e=>{
    if(e.target.closest('.meta-tip-icon'))tip.style.display='none';
  });
  // Touch — show on tap, dismiss on next tap anywhere
  document.addEventListener('touchend',e=>{
    const icon=e.target.closest('.meta-tip-icon');
    if(icon){
      e.preventDefault();
      e.stopPropagation();
      const desc=icon.dataset.desc;
      if(!desc){tip.style.display='none';return}
      tip.textContent=desc;
      tip.style.display='block';
      const r=icon.getBoundingClientRect();
      const tw=180,th=tip.offsetHeight||60;
      let top=r.top-th-6;
      if(top<6)top=r.bottom+6;
      let left=r.left+r.width/2-tw/2;
      if(left<6)left=6;
      if(left+tw>window.innerWidth-6)left=window.innerWidth-tw-6;
      tip.style.top=top+'px';
      tip.style.left=left+'px';
      // Dismiss on next tap outside the icon
      setTimeout(()=>{
        document.addEventListener('touchend',function dismiss(){
          tip.style.display='none';
          document.removeEventListener('touchend',dismiss);
        });
      },0);
    } else {
      // Any tap outside closes it
      if(tip.style.display!=='none')tip.style.display='none';
    }
  },{capture:true,passive:false});
  document.addEventListener('scroll',()=>{tip.style.display='none';},{capture:true,passive:true});
})();

// Returns an ⓘ icon with tooltip if metadata exists for this name
function metaTipHTML(name){
  const m=metaDesc(name);
  if(!m||!m.desc)return'';
  return`<span class="meta-tip-icon" tabindex="0" data-desc="${esc(m.desc)}">ⓘ</span>`;
}

// GG.deals live-price tags — shared by the wishlist card overlay and the side
// panel's Live Price section, so both always stay in sync. Eligibility:
// wishlist games, plus bought games still wanted on Steam (same as the
// live-price fetch job itself). Returns null when there's nothing to show.
function ggPriceTags(g){
  const tracked=(g.status==='wishlist'||(g.status==='bought'&&g.steamWishlist))&&g.steamAppId;
  if(!tracked)return null;
  if(g.skipGGFetch)return{notrack:true};
  const gp=ggPriceCache[g.steamAppId];
  if(!gp)return null;
  const r=parseFloat(gp.retail),k=parseFloat(gp.keyshop),hr=parseFloat(gp.histRetail);
  const retailOk=!isNaN(r)&&r>0,keysOk=!isNaN(k)&&k>0;
  if(!retailOk&&!keysOk)return null;
  const retailStr=retailOk?`<span class="ggp-retail">€${r.toFixed(2)}</span>`:`<span class="ggp-retail" style="opacity:.45">€ N/A</span>`;
  const keysStr=keysOk?`<span class="ggp-keys">🔑 €${k.toFixed(2)}</span>`:`<span class="ggp-keys" style="opacity:.45">🔑 N/A</span>`;
  const nearLow=retailOk&&!isNaN(hr)&&hr>0&&r<=hr*1.10;
  const badgeStr=gp.personalLow?`<span class="ggp-hist-low">★ High</span>`:nearLow?`<span class="ggp-low">★ Low</span>`:'';
  return{retailStr,keysStr,badgeStr};
}

function cardHTML(g){
  const isNR=nr(g);
  const h=isNR?0:Math.min(100,Math.max(0,parseInt(g.hotness)||0));
  const coverUrl=g.cover||(g.steamAppId?sc(g.steamAppId):'');
  const cImg=coverUrl?`<img src="${esc(coverUrl)}" alt="${esc(g.title)}" onerror="this.style.display='none';this.previousElementSibling.style.display='flex'">`:'';
  const phStyle=coverUrl?'style="display:none"':'';

  // Left badge — cancelled/removed/to-review only; empty otherwise (no default filler badge)
  let lBdg='';
  if(isCancelled(g))             lBdg=`<span class="b-cancelled">CANCELLED</span>`;
  else if(g.status==='removed')  lBdg=`<span class="bdg b-rm">${t('bdgRm')}</span>`;
  else if(isNR)                  lBdg=`<span class="b-rev">${t('bdgRev')}</span>`;

  // Price / date / unreleased display
  let priceEl;
  if(isFutureDate(g.releaseDate)){
    const days=Math.ceil((new Date(normaliseDate(g.releaseDate))-new Date(todayISO()))/(1000*60*60*24));
    const cd=days===1?'tomorrow':days<=30?`in ${days}d`:null;
    const cdLabel=cd?` <span style="color:var(--amber);font-size:.6rem;font-weight:700">${cd}</span>`:'';
    priceEl=`<span class="b-unrel-card">${fmtDate(g.releaseDate)}${cdLabel}</span>`;
  } else if(g.releaseDate&&!/^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate)){
    priceEl=`<span class="b-unrel-card">${esc(g.releaseDate)}</span>`;
  } else if(g.price!=null&&parseFloat(g.price)===0){
    priceEl=`<span class="bdg b-free">FREE</span>`;
  } else if(g.price){
    priceEl=`<span class="cprice">€${parseFloat(g.price).toFixed(2)}</span>`;
  } else {
    priceEl=`<span class="cprice" style="color:var(--t3)">—</span>`;
  }
  const hotBdg=isNR?'':`<span class="bdg b-hot" title="Hotness: ${h}">${h}</span>`;

  const ggUrl=g.steamAppId?`https://gg.deals/steam/app/${g.steamAppId}/`:`https://gg.deals/search/?title=${encodeURIComponent(g.title||'')}`;
  const sdbUrl=g.steamAppId?`https://www.steamdb.info/app/${g.steamAppId}/`:`https://www.steamdb.info/search/?q=${encodeURIComponent(g.title||'')}`;
  const stUrl=g.storeLink||(g.steamAppId?`https://store.steampowered.com/app/${g.steamAppId}/`:`https://store.steampowered.com/search/?term=${encodeURIComponent(g.title||'')}`);
  const ba=g.status==='bought'?' ba':'';

  const gid_s=String(g.id);
  const tip=addedTip(g);

  // GG.deals price overlay — see ggPriceTags() for eligibility/data rules
  let ggpOv='';
  const _tags=ggPriceTags(g);
  if(_tags){
    ggpOv=_tags.notrack
      ?`<div class="ggp-ov"><span></span><span class="ggp-notrack">€ Non Tracked</span><span></span></div>`
      :`<div class="ggp-ov">${_tags.retailStr}${_tags.badgeStr||'<span></span>'}${_tags.keysStr}</div>`;
  }

  // Remove/Reinstate button: removed→reinstate, bought→disabled, else→remove
  let rmBtn='';
  if(g.status==='removed'){
    rmBtn=`<button class="qb qri" title="Reinstate" onclick="event.stopPropagation();startReinstate('${gid_s}')">${IC.reinstate}</button>`;
  } else if(g.status!=='bought'){
    rmBtn=`<button class="qb qr" title="Remove" onclick="event.stopPropagation();startRemove('${gid_s}')">${IC.close}</button>`;
  }

  return`<div class="gc st-${g.status||'wishlist'}${g.status==='bought'?' sb2':''}${isCancelled(g)?' cancelled':''}" data-id="${gid_s}" tabindex="0" role="button" aria-label="${esc(g.title)}"${tip?` data-added-tip="${esc(tip)}"`:''}>
    <div class="cc">
      <div class="cph" ${phStyle}>🎮</div>${cImg}
      <div class="cg"></div>
      ${ggpOv}
    </div>
    <div class="pb">${lBdg}</div>
    <div class="cb">
      <div class="title-row"><span class="title-prio ${prioClass(g.priority)}"></span><div class="ct">${esc(g.title)}</div></div>
      <div class="cbot">
        ${priceEl}${hotBdg}
        <div class="cq">
          <a href="${stUrl}" class="qb" title="Steam" target="_blank" onclick="event.stopPropagation()">${favImg(FAV_STEAM,'steam')}</a>
          <a href="${ggUrl}" class="qb" title="gg.deals" target="_blank" onclick="event.stopPropagation()">${favImg(FAV_GG,'gg')}</a>
          <button class="qb qb-bt${ba}" title="${t('mBt')}" onclick="event.stopPropagation();handleMarkBought('${gid_s}')">${IC.check}</button>
          <button class="qb" title="Edit" onclick="event.stopPropagation();openEditFromCard('${gid_s}')">${IC.edit}</button>
          ${rmBtn}
        </div>
      </div>
    </div>
    <div class="swipe-hint-r">${IC.hintCheck}</div>
    <div class="swipe-hint-l">${IC.hintClose}</div>
  </div>`;
}

// ══════════════════════════════════════════
//  COLLECTION CARD + LIST ROW
// ══════════════════════════════════════════

function colLabel(s){return s?s.replace(/^[\dA-Za-z]+_/,''):s;}
const PS_META={
  'Unplayed':       {code:'UP',  cls:'ps-UP'},
  'In Progress':    {code:'IP',  cls:'ps-IP'},
  'Completed':      {code:'COM', cls:'ps-COM'},
  'Superseded':     {code:'SUP', cls:'ps-SUP'},
  'Unfinishable':   {code:'UF',  cls:'ps-UF'},
  'Played on Different Platform':{code:'PDP',cls:'ps-PDP'},
  'Will Never Complete':{code:'WNC',cls:'ps-WNC'},
  'Will Never Play':    {code:'WNP',cls:'ps-WNP'},
};

function psBadgeHTML(status){
  const m=PS_META[status]||{code:'?',cls:'ps-UP'};
  return`<span class="col-ps-badge ${m.cls}">${m.code}<span class="ps-tip">${esc(status||'Unplayed')}</span></span>`;
}

// Find parent game by steamAppId matching parentAppId
function findParentGame(g){
  if(!g.parentAppId)return null;
  return games.find(x=>x.steamAppId&&String(x.steamAppId)===String(g.parentAppId)&&x.status==='bought')||null;
}

// Find DLCs belonging to a given game
function findDlcs(g){
  if(!g.steamAppId)return[];
  return games.filter(x=>x.type==='dlc'&&x.parentAppId&&String(x.parentAppId)===String(g.steamAppId)&&x.status==='bought');
}
function findAllKnownDlcs(g){
  if(!g.steamAppId)return[];
  return games.filter(x=>x.type==='dlc'&&x.parentAppId&&String(x.parentAppId)===String(g.steamAppId));
}

function mdInline(s){
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`(.+?)`/g,'<code>$1</code>');
}
function renderMd(raw){
  const s=raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines=s.split('\n');
  const out=[];let inList=false;
  for(const line of lines){
    const li=line.match(/^[-*]\s+(.+)/);
    if(li){
      if(!inList){out.push('<ul>');inList=true;}
      out.push(`<li>${mdInline(li[1])}</li>`);
    }else{
      if(inList){out.push('</ul>');inList=false;}
      if(line.trim()==='')out.push('<br>');
      else out.push(mdInline(line)+'<br>');
    }
  }
  if(inList)out.push('</ul>');
  // strip trailing <br>
  let r=out.join('');
  while(r.endsWith('<br>'))r=r.slice(0,-4);
  return r;
}

function navPanel(dir){
  if(!openId)return;
  const ids=[...document.querySelectorAll('.gc[data-id]')].map(el=>el.dataset.id);
  if(!ids.length)return;
  const idx=ids.indexOf(String(openId));
  if(idx===-1)return;
  const next=idx+dir;
  if(next<0||next>=ids.length)return;
  openPanel(ids[next]);
}

function colTypeBadge(g){
  if(g.type==='dlc') return '';
  const cols=g.steamCollection&&g.steamCollection.length?g.steamCollection:[];
  if(!cols.length) return '';
  const first=colLabel(cols[0]);
  const truncated=first.length>18?first.slice(0,17)+'…':first;
  const extra=cols.length>1?` +${cols.length-1}`:'';
  return`<span class="col-type-badge" title="${esc(cols.map(colLabel).join(', '))}">${esc(truncated)}${extra}</span>`;
}
function colCardHTML(g){
  const coverUrl=g.cover||(g.steamAppId?sc(g.steamAppId):'');
  const cImg=coverUrl?`<img src="${esc(coverUrl)}" alt="${esc(g.title)}" onerror="this.style.display='none';this.previousElementSibling.style.display='flex'">`:'';
  const phStyle=coverUrl?'style="display:none"':'';
  const sdbUrl=g.steamAppId?`https://www.steamdb.info/app/${g.steamAppId}/`:`https://www.steamdb.info/search/?q=${encodeURIComponent(g.title||'')}`;
  const stUrl=g.storeLink||(g.steamAppId?`https://store.steampowered.com/app/${g.steamAppId}/`:`https://store.steampowered.com/search/?term=${encodeURIComponent(g.title||'')}`);
  const gid_s=String(g.id);
  const ps=g.playStatus||'Unplayed';
  const psM=PS_META[ps]||{code:'UP',cls:'ps-UP'};
  const psBadgeCard=g.type==='dlc'?'':`<span class="col-ps-badge ${psM.cls}">${psM.code}<span class="ps-tip">${esc(ps)}</span></span>`;
  const _purchases=gamePurchases(g);
  const _filtCostRaw=cfPlats.size>0?gameFilteredCost(g,cfPlats):gameTotalCost(g);
  const _filtCost=_filtCostRaw===null?null:_filtCostRaw;
  const costEl=!_purchases.length
    ?'<span class="cprice" style="color:var(--t3)">—</span>'
    :_filtCost===null
      ?'<span class="cprice" style="color:var(--t3)">—</span>'
      :_filtCost===0
        ?'<span class="bdg b-free">FREE</span>'
        :'<span class="cprice">€'+_filtCost.toFixed(2)+'</span>';
  const dlcs=g.type!=='dlc'?findDlcs(g):[];
  const dlcBadge=dlcs.length?`<span class="dlc-count-badge" data-id="${gid_s}">DLC (${dlcs.length})</span>`:'';

  const _ownedPlats=ownedPlatforms(g);
  const _platBadges=_ownedPlats.length
    ?`<div class="cc-plats">${_ownedPlats.map(p=>`<span class="b-plat" style="background:${platColor(p)};color:${platTextColor(p)}">${esc(p)}</span>`).join('')}</div>`
    :platBadgesHTML(g);
  return`<div class="gc col-card st-bought" data-id="${gid_s}" tabindex="0" role="button" aria-label="${esc(g.title)}">
    <div class="cc">
      <div class="cph" ${phStyle}>🎮</div>${cImg}
      <div class="cg"></div>
      <div class="hb2" style="display:none"></div>
      ${_platBadges}
    </div>
    <div class="pb">${psBadgeCard}<div class="pb-r">${colTypeBadge(g)}</div></div>
    <div class="cb">
      <div class="ct">${esc(g.title)}</div>
      <div class="cbot">
        ${costEl}
        ${dlcBadge}
        <div class="cq">
          <a href="${stUrl}" class="qb" title="Steam" target="_blank" onclick="event.stopPropagation()">${favImg(FAV_STEAM,'steam')}</a>
          <button class="qb qb-wl ba" title="Move back to Wishlist" onclick="event.stopPropagation();startMoveToWishlist('${gid_s}')">${IC.backWl}</button>
          <button class="qb" title="Edit" onclick="event.stopPropagation();openEditFromCard('${gid_s}')">${IC.edit}</button>
          <button class="qb qb-ap" title="Add Platform" onclick="event.stopPropagation();openAddPlatformModal('${gid_s}')">${IC.plus}</button>
        </div>
      </div>
    </div>
    <div class="swipe-hint-r">${IC.hintPlus}</div>
    <div class="swipe-hint-l">${IC.hintBack}</div>
  </div>`;
}

function colRowHTML(g){
  const coverUrl=g.cover||(g.steamAppId?sc(g.steamAppId):'');
  const gid_s=String(g.id);
  const thumb=coverUrl
    ?`<img class="col-row-thumb" src="${esc(coverUrl)}" alt="" onerror="this.style.display='none'">`
    :`<div class="col-row-thumb-ph">🎮</div>`;
  const tags=(g.type!=='dlc'&&g.steamCollection&&g.steamCollection.length)
    ?g.steamCollection.slice(0,3).map(s=>`<span class="col-row-tag">${esc(colLabel(s))}</span>`).join('')
    :'';
  const ps=g.playStatus||'Unplayed';
  const isDlcRow=g.type==='dlc'&&findParentGame(g);
  return`<div class="col-row${isDlcRow?' dlc-row':''}" data-id="${gid_s}" tabindex="0" role="button" aria-label="${esc(g.title)}">
    ${thumb}
    <span class="col-row-title">${esc(g.title)}</span>
    <div class="col-row-tags">${tags}</div>
    ${g.type==='dlc'?'':psBadgeHTML(ps)}
    <div class="swipe-hint-r">${IC.hintPlus}</div>
    <div class="swipe-hint-l">${IC.hintBack}</div>
  </div>`;
}

// ══════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════

// ══════════════════════════════════════════
//  TODAY'S RELEASES TICKER
// ══════════════════════════════════════════
function renderTicker(){
  const today=todayISO();
  const hits=games.filter(g=>normaliseDate(g.releaseDate)===today&&g.title);
  const ticker=document.getElementById('todayTicker');
  const inner=document.getElementById('tickerInner');
  if(!hits.length){ticker.classList.remove('active');return}
  ticker.classList.add('active');
  const itemsHTML=hits.map(g=>`<span class="ticker-item" onclick="openPanel('${g.id}')">${g.title}</span>`).join('');
  inner.innerHTML=itemsHTML;
  inner.classList.remove('marquee');
  inner.style.animationDuration='';
  const track=inner.parentElement;
  // Only scroll if the items actually overflow the bar — a short list just sits still.
  requestAnimationFrame(()=>{
    if(inner.scrollWidth>track.clientWidth){
      inner.innerHTML=itemsHTML+itemsHTML; // duplicated copy → seamless 50%-translate loop
      const PX_PER_SEC=40;
      inner.style.animationDuration=Math.max(8,inner.scrollWidth/2/PX_PER_SEC)+'s';
      inner.classList.add('marquee');
    }
  });
}
let _tickerResizeT=null;
window.addEventListener('resize',()=>{
  clearTimeout(_tickerResizeT);
  _tickerResizeT=setTimeout(()=>{
    if(document.getElementById('todayTicker')?.classList.contains('active'))renderTicker();
  },200);
});

// ══════════════════════════════════════════
//  COLLAPSIBLE SECTIONS
// ══════════════════════════════════════════
const COLLAPSED_KEY='btb_collapsed';
function getCollapsed(){try{return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY))||[])}catch(e){return new Set()}}
function setCollapsed(s){localStorage.setItem(COLLAPSED_KEY,JSON.stringify([...s]))}

// ── BATCH / VIRTUAL RENDER STATE ─────────────────────
const BATCH=40; // cards per render chunk
const sectionState=new Map(); // sectionEl → {cards,rendered,gcls}
let batchObserver=null;

function initBatchObserver(){
  if(batchObserver)batchObserver.disconnect();
  const root=document.getElementById('content');
  batchObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      const sentinel=entry.target;
      const sb=sentinel.closest('.sb');
      if(!sb)return;
      const state=sectionState.get(sb);
      if(!state)return;
      renderNextBatch(sb,state);
    });
  },{root,rootMargin:'200px 0px',threshold:0});
}

function renderNextBatch(sb,state){
  const grid=sb.querySelector('.gg,.gg.lv');
  if(!grid)return;
  const sentinel=sb.querySelector('.batch-sentinel');
  if(sentinel)batchObserver&&batchObserver.unobserve(sentinel);
  const next=state.cards.slice(state.rendered,state.rendered+BATCH);
  if(!next.length)return;
  const fn=state.cardFn||cardHTML;

  {
    const frag=document.createDocumentFragment();
    const tmp=document.createElement('div');
    tmp.innerHTML=next.map(fn).join('');
    while(tmp.firstChild)frag.appendChild(tmp.firstChild);
    if(sentinel)grid.removeChild(sentinel);
    grid.appendChild(frag);
  }

  state.rendered+=next.length;
  bindNewCards(grid,next.length);
  if(state.rendered<state.cards.length){
    const s=sentinel||makeSentinel();
    grid.appendChild(s);
    batchObserver&&batchObserver.observe(s);
  }
  // Update sb-body maxHeight after adding content
  const body=sb.querySelector('.sb-body');
  if(body&&body.style.maxHeight&&body.style.maxHeight!=='0px'&&body.style.maxHeight!=='none'){
    body.style.maxHeight=body.scrollHeight+'px';
  }
}

// A full re-render only paints each section's first batch, so on its own it would
// snap back to a much shorter page and lose however many extra batches the user had
// scrolled to load. These wrap renderAll()/renderCollection(): capture #content's
// scroll position before the rebuild, then force-render however many more batches
// are needed to reach that same depth again before restoring it.
function _captureScroll(){
  const content=document.getElementById('content');
  return content?content.scrollTop:0;
}
function _restoreScroll(prevTop){
  const content=document.getElementById('content');
  if(!content||!prevTop)return;
  const target=prevTop+content.clientHeight;
  for(const[sb,state]of sectionState){
    while(state.rendered<state.cards.length&&content.scrollHeight<target){
      renderNextBatch(sb,state);
    }
    if(content.scrollHeight>=target)break;
  }
  content.scrollTop=prevTop;
}

function makeSentinel(){
  const s=document.createElement('div');
  s.className='batch-sentinel';
  s.style.cssText='height:1px;width:100%;grid-column:1/-1;pointer-events:none';
  return s;
}

function bindNewCards(container,count){
  const all=container.querySelectorAll(':scope>.gc');
  const start=Math.max(0,all.length-count);
  for(let i=start;i<all.length;i++){
    const c=all[i];
    c.addEventListener('click',()=>openPanel(c.dataset.id));
    c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')openPanel(c.dataset.id)});
    scaleTitleFont(c);
  }
}

function makeSection(label,cards,gcls){
  const collapsed=getCollapsed().has(label);
  const bodyH=collapsed?'max-height:0':'';
  const displayLabel=colLabel(label);
  return`<div class="sb${collapsed?' collapsed':''}" data-section="${esc(label)}">
    <div class="sl">
      ${displayLabel}
      <span class="sl-count" style="font-family:'Inter',sans-serif;font-size:.6rem;font-weight:400;letter-spacing:0;text-transform:none;color:var(--t3)">${cards.length}</span>
      <span class="sl-toggle">▾</span>
    </div>
    <div class="sb-body" style="${bodyH}"><div class="${gcls}"></div></div>
  </div>`;
}

function initSection(sb,cards,gcls,cardFn){
  const state={cards,rendered:0,gcls,cardFn:cardFn||null};
  sectionState.set(sb,state);
  if(sb.classList.contains('collapsed'))return; // defer until expanded
  renderNextBatch(sb,state);
}

// bindSectionToggle — wires collapse/expand for a single sb element
// Also triggers deferred batch rendering when a collapsed section is expanded.
// Long press (600ms) on any section header expands or collapses ALL sections.
function _toggleOneSb(s,expand){
  const sBody=s.querySelector('.sb-body');
  if(!sBody)return;
  const isCol=s.classList.contains('collapsed');
  const col=getCollapsed();
  if(expand&&isCol){
    s.classList.remove('collapsed');
    const st=sectionState.get(s);
    if(st&&st.rendered===0)renderNextBatch(s,st);
    sBody.style.maxHeight=sBody.scrollHeight+'px';
    sBody.addEventListener('transitionend',()=>{
      if(!s.classList.contains('collapsed')){sBody.style.maxHeight='none';sBody.classList.add('expanded');}
    },{once:true});
    col.delete(s.dataset.section);
  } else if(!expand&&!isCol){
    sBody.classList.remove('expanded');
    sBody.style.maxHeight=sBody.scrollHeight+'px';
    requestAnimationFrame(()=>{sBody.style.maxHeight='0';s.classList.add('collapsed');});
    col.add(s.dataset.section);
  }
  setCollapsed(col);
}
function bindSectionToggle(sb){
  const sl=sb.querySelector('.sl');
  const body=sb.querySelector('.sb-body');
  if(!sl||!body)return;
  if(!sb.classList.contains('collapsed')){
    body.style.maxHeight=body.scrollHeight+'px';
    body.classList.add('expanded');
  }
  let _lpTimer=null,_lpFired=false;
  function _startLP(){
    _lpFired=false;
    _lpTimer=setTimeout(()=>{
      _lpTimer=null;_lpFired=true;
      const allSbs=[...document.querySelectorAll('.sb[data-section]')];
      const anyCollapsed=allSbs.some(s=>s.classList.contains('collapsed'));
      allSbs.forEach(s=>_toggleOneSb(s,anyCollapsed));
      showToast(anyCollapsed?'All sections expanded':'All sections collapsed');
    },600);
  }
  function _cancelLP(){if(_lpTimer){clearTimeout(_lpTimer);_lpTimer=null;}}
  sl.addEventListener('mousedown',_startLP);
  sl.addEventListener('mouseup',_cancelLP);
  sl.addEventListener('mouseleave',_cancelLP);
  sl.addEventListener('touchstart',_startLP,{passive:true});
  sl.addEventListener('touchend',_cancelLP,{passive:true});
  sl.addEventListener('touchmove',_cancelLP,{passive:true});
  sl.addEventListener('click',()=>{
    if(_lpFired){_lpFired=false;return;}
    const label=sb.dataset.section;
    const col=getCollapsed();
    const isNowCollapsed=!sb.classList.contains('collapsed');
    if(isNowCollapsed){
      body.classList.remove('expanded');
      body.style.maxHeight=body.scrollHeight+'px';
      requestAnimationFrame(()=>{body.style.maxHeight='0';sb.classList.add('collapsed');});
      col.add(label);
    } else {
      sb.classList.remove('collapsed');
      // If this section was deferred (collapsed at render time), render first batch now
      const state=sectionState.get(sb);
      if(state&&state.rendered===0)renderNextBatch(sb,state);
      body.style.maxHeight=body.scrollHeight+'px';
      body.addEventListener('transitionend',()=>{
        if(!sb.classList.contains('collapsed')){body.style.maxHeight='none';body.classList.add('expanded');}
      },{once:true});
      col.delete(label);
    }
    setCollapsed(col);
  });
}

// Legacy bindSections kept for any call sites outside renderAll
function bindSections(container){
  container.querySelectorAll('.sb[data-section]').forEach(sb=>bindSectionToggle(sb));
}

function renderCollectionStats(list){
  const el=document.getElementById('cStatChips');if(!el)return;
  const allCol=games.filter(g=>g.status==='bought');
  const totalGames=allCol.filter(g=>g.type!=='dlc').length;
  const totalDlcs=allCol.filter(g=>g.type==='dlc').length;
  const totalCost=allCol.reduce((s,g)=>s+gameTotalCost(g),0);
  const isFiltered=list.length!==allCol.length;
  const filtGames=list.filter(g=>g.type!=='dlc').length;
  const filtDlcs=list.filter(g=>g.type==='dlc').length;
  const filtCost=list.reduce((s,g)=>s+(cfPlats.size?gameFilteredCost(g,cfPlats)||0:gameTotalCost(g)),0);
  const gameChip=isFiltered
    ?`<span class="sc-chip"><b>${filtGames}</b>/<span style="color:var(--muted)">${totalGames}</span> games</span>`
    :`<span class="sc-chip"><b>${totalGames}</b> games</span>`;
  const dlcChip=totalDlcs
    ?(isFiltered
      ?`<span class="sc-chip"><b>${filtDlcs}</b>/<span style="color:var(--muted)">${totalDlcs}</span> DLC</span>`
      :`<span class="sc-chip"><b>${totalDlcs}</b> DLC</span>`)
    :'';
  const costChip=totalCost>0
    ?(isFiltered
      ?`<span class="sc-chip"><b>${fmtEur(filtCost)}</b>/<span style="color:var(--muted)">${fmtEur(totalCost)}</span></span>`
      :`<span class="sc-chip"><b>${fmtEur(totalCost)}</b></span>`)
    :'';
  el.innerHTML=gameChip+dlcChip+costChip;
}

// cvm removed — collection uses shared vm variable

function renderCollection(){
  const _prevScroll=_captureScroll();
  _renderCollectionInner();
  _restoreScroll(_prevScroll);
}
function _renderCollectionInner(){
  const gc=document.getElementById('gc');
  const list=collectionFiltered();
  renderCollectionStats(list);
  sectionState.clear();
  initBatchObserver();
  gc.innerHTML='';

  if(!list.length){
    gc.innerHTML=`<div class="gg"><div class="empty"><div class="ei">📦</div><p>No games in your collection yet.</p></div></div>`;
    return;
  }

  const sorted2=collectionSorted(list);
  const sortBy=document.getElementById('cSortSel').value;
  const isList=vm==='list';

  function makeColSection(label,cards){
    const html=makeSection(label,cards,'gg');
    const tmp=document.createElement('div');tmp.innerHTML=html;
    const sb=tmp.firstElementChild;
    gc.appendChild(sb);
    if(isList){
      const body=sb.querySelector('.sb-body');
      const inner=body.querySelector('.gg');
      inner.className='col-list';
      inner.innerHTML=cards.map(colRowHTML).join('');
      inner.querySelectorAll('.col-row').forEach(r=>{
        r.addEventListener('click',()=>openPanel(r.dataset.id));
        r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')openPanel(r.dataset.id)});
      });
      bindSectionToggle(sb);
    } else {
      const state={cards,rendered:0,gcls:'gg',cardFn:colCardHTML};
      sectionState.set(sb,state);
      if(!sb.classList.contains('collapsed'))renderNextBatch(sb,state);
      bindSectionToggle(sb);
    }
  }

  // Group by steamcol when sort=steamcol, else section by sort type
  if(sortBy==='steamcol'){
    const groups={};
    // Only top-level games (non-DLC or DLCs without a parent in collection)
    sorted2.forEach(g=>{
      if(g.type==='dlc'&&findParentGame(g))return; // skip — will render under parent
      const keys=(g.steamCollection&&g.steamCollection.length)?g.steamCollection:['Uncategorised'];
      keys.forEach(k=>{if(!groups[k])groups[k]=[];groups[k].push(g)});
    });
    Object.keys(groups).sort().forEach(k=>makeColSection(k,groups[k]));
  } else {
    // Group into sections based on sort type
    const groups = {};
    const groupOrder = [];

    function addToGroup(key, game) {
      if(!groups[key]) { groups[key] = []; groupOrder.push(key); }
      groups[key].push(game);
    }

    sorted2.forEach(g => {
      if(sortBy === 'title') {
        const first = (g.title||'').trim()[0]?.toUpperCase() || '#';
        const bucket = /^[A-Z]$/.test(first) ? first : '#';
        addToGroup(bucket, g);
      } else if(sortBy === 'playstatus') {
        addToGroup(g.playStatus || 'Unplayed', g);
      } else if(sortBy === 'purchaseDate') {
        if(!g.purchaseDate) { addToGroup('Unknown', g); return; }
        const m = g.purchaseDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const yr = m ? m[3] : g.purchaseDate.slice(0,4) || 'Unknown';
        addToGroup(yr, g);
      } else if(sortBy === 'cost-desc' || sortBy === 'cost-asc') {
        const c = gameTotalCost(g);
        const bucket = c === 0 ? 'Free' : c < 10 ? '< €10' : c < 25 ? '€10–25' : c < 50 ? '€25–50' : '€50+';
        addToGroup(bucket, g);
      } else {
        addToGroup('', g);
      }
    });

    // Determine ordered keys
    let keys;
    if(sortBy === 'title') {
      // '#' first, then A-Z
      const alphaKeys = groupOrder.filter(k => k !== '#').sort();
      keys = groups['#'] ? ['#', ...alphaKeys] : alphaKeys;
    } else if(sortBy === 'playstatus') {
      const psOrder = ['In Progress','Completed','Unplayed','Superseded','Unfinishable','Played on Different Platform','Will Never Complete','Will Never Play','Unknown'];
      keys = psOrder.filter(k => groups[k]);
    } else if(sortBy === 'purchaseDate') {
      // Sort years descending (most recent first), Unknown last
      keys = groupOrder.filter(k => k !== 'Unknown').sort((a,b) => b.localeCompare(a));
      if(groups['Unknown']) keys.push('Unknown');
    } else if(sortBy === 'cost-desc') {
      keys = ['€50+','€25–50','€10–25','< €10','Free'].filter(k => groups[k]);
    } else if(sortBy === 'cost-asc') {
      keys = ['Free','< €10','€10–25','€25–50','€50+'].filter(k => groups[k]);
    } else {
      keys = groupOrder;
    }

    keys.forEach(k=>{if(!groups[k])return;makeColSection(k||'All',groups[k]);});
  }
  saveHash();
}

function renderAll(){
  const _prevScroll=_captureScroll();
  _renderAllInner();
  _restoreScroll(_prevScroll);
}
function _renderAllInner(){
  renderTicker();
  const gc=document.getElementById('gc');
  const grp=document.getElementById('groupSel').value;
  const list=filtered();
  renderStats();
  const lv=vm==='list';
  const gcls=`gg${lv?' lv':''}`;

  // Clear previous batch state and observer
  sectionState.clear();
  initBatchObserver();

  // Helper: build section HTML, insert into gc, then init batch rendering
  function addSection(label,cards){
    const html=makeSection(label,cards,gcls);
    const tmp=document.createElement('div');
    tmp.innerHTML=html;
    const sb=tmp.firstElementChild;
    gc.appendChild(sb);
    initSection(sb,cards,gcls);
    bindSectionToggle(sb);
  }

  // Helper: no-section flat list — still batched via a synthetic section wrapper
  function addFlat(cards){
    const wrapper=document.createElement('div');
    wrapper.className='sb'; // reuse sb for state keying; no header
    const grid=document.createElement('div');
    grid.className=gcls;
    wrapper.appendChild(grid);
    gc.appendChild(wrapper);
    const state={cards,rendered:0,gcls};
    sectionState.set(wrapper,state);
    renderNextBatch(wrapper,state);
  }

  gc.innerHTML='';

  // Empty states
  const empty=(icon,msg)=>{gc.innerHTML=`<div class="${gcls}"><div class="empty"><div class="ei">${icon}</div><p>${msg}</p></div></div>`};

  // Dedicated removed tab
  if(af==='removed'){
    if(!list.length){empty('🗑️',t('noGames'));return}
    addSection(t('secRm'),sorted(list));return;
  }
  // Dedicated cancelled tab
  if(af==='cancelled'){
    if(!list.length){empty('🚫','No cancelled games');return}
    addSection('CANCELLED',sorted(list));return;
  }

  if(!list.length){empty('🎮',`${t('noGames')}
${t('noHint')}`);return}

  if(grp==='none'){
    if(af==='all'){
      const wishlist=list.filter(g=>g.status==='wishlist'&&!isCancelled(g));
      const bought=list.filter(g=>g.status==='bought');
      const cancelled=list.filter(g=>isCancelled(g));
      const removed=list.filter(g=>g.status==='removed');
      const rev=wishlist.filter(g=>nr(g));
      const wlRest=sorted(wishlist.filter(g=>!nr(g)));
      if(rev.length)       addSection(t('secRev'),rev);
      if(wlRest.length)    addSection(t('secWl'),wlRest);
      if(cancelled.length) addSection('CANCELLED',sorted(cancelled));
      if(removed.length)   addSection(t('secRm'),sorted(removed));
      if(bought.length)    addSection(t('secBacklog'),sorted(bought));
    } else {
      addFlat(sorted(list));
    }
  } else {
    const groups={};
    sorted(list).forEach(g=>{
      let keys=[];
      if(grp==='genre')keys=g.genres&&g.genres.length?g.genres:[g.genre||'—'];
      else if(grp==='platform'){const op=ownedPlatforms(g);keys=op.length?op:['—'];}
      else if(grp==='year'){keys=[releaseYear(g)]}
      else if(grp==='priority')keys=[g.priority||'medium'];
      keys.forEach(k=>{if(!groups[k])groups[k]=[];groups[k].push(g)});
    });
    const priorityGroupOrder=['high','medium','low'];
    const sortKeys=grp==='priority'
      ?priorityGroupOrder.filter(k=>groups[k])
      :Object.keys(groups).sort();
    sortKeys.forEach(k=>{
      const label=grp==='priority'?prioLabel(k):esc(k);
      addSection(label,groups[k]);
    });
  }
  saveHash();
}
function bindCards(gc){
  // Legacy full-bind — used only when all cards are rendered at once (small sets)
  gc.querySelectorAll('.gc').forEach(c=>{
    c.addEventListener('click',()=>openPanel(c.dataset.id));
    c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')openPanel(c.dataset.id)});
    scaleTitleFont(c);
  });
}

function scaleTitleFont(card){
  const ct=card.querySelector('.ct');
  if(!ct||card.closest('.gg.lv'))return; // skip list view
  ct.style.fontSize='';
  // Step down from default until it fits or hits floor
  const sizes=['.9rem','.82rem','.74rem','.67rem','.62rem'];
  for(const sz of sizes){
    ct.style.fontSize=sz;
    if(ct.scrollWidth<=ct.clientWidth+2) break;
  }
}

// ── TILT + SHINE ─────────────────────────
function bindTilt(card){
  const MAX=12; // max tilt degrees
  function applyTilt(x,y){
    const r=card.getBoundingClientRect();
    const cx=(x-r.left)/r.width;   // 0..1
    const cy=(y-r.top)/r.height;   // 0..1
    const rx=(cy-0.5)*MAX*-1;      // rotate around X
    const ry=(cx-0.5)*MAX;         // rotate around Y
    const shine=card.querySelector('.gc-shine');
    card.style.transform=`perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.03)`;
    card.style.boxShadow=`0 10px 32px rgba(2,179,252,.18), 0 2px 8px rgba(0,0,0,.3)`;
    card.style.borderColor='var(--blue)';
    card.classList.add('tilt-active');
    if(shine){
      // Move the radial highlight to follow the cursor
      shine.style.background=`radial-gradient(circle at ${cx*100}% ${cy*100}%,rgba(255,255,255,.22) 0%,rgba(255,255,255,.05) 45%,transparent 70%)`;
    }
  }
  function resetTilt(){
    card.style.transform='';
    card.style.boxShadow='';
    card.style.borderColor='';
    card.classList.remove('tilt-active');
  }
  // Mouse
  card.addEventListener('mousemove',e=>{
    // Skip if list view
    if(card.closest('.gg.lv'))return;
    applyTilt(e.clientX,e.clientY);
  });
  card.addEventListener('mouseleave',resetTilt);
  // Touch (mobile)
  card.addEventListener('touchmove',e=>{
    if(card.closest('.gg.lv'))return;
    const t=e.touches[0];
    applyTilt(t.clientX,t.clientY);
  },{passive:true});
  card.addEventListener('touchend',resetTilt);
  card.addEventListener('touchcancel',resetTilt);
}

// ══════════════════════════════════════════
//  MARK BOUGHT — with unreleased warning
// ══════════════════════════════════════════
let _preorderPendingId=null;
function handleMarkBought(id){
  const g=games.find(x=>x.id===id);if(!g)return;
  if(g.status==='bought'){
    g.status='wishlist';
    delete g.store;delete g.cost;delete g.purchaseDate;delete g.playStatus;delete g.steamCollection;delete g.purchases;
    save(id);dispatchRender();if(openId===id)openPanel(id);return;
  }
  if(isGameUnreleased(g)){
    _preorderPendingId=id;
    const ttl=document.getElementById('preorderGameTitle');if(ttl)ttl.textContent=g.title||'';
    document.getElementById('preorderConfirm').classList.add('on');
    history.pushState({preorderConfirmOpen:true},'','');
    return;
  }
  openCollectionModal(id);
}
function _closePreorderConfirm(){
  document.getElementById('preorderConfirm').classList.remove('on');
  _preorderPendingId=null;
  if(history.state&&history.state.preorderConfirmOpen)history.replaceState(null,'','');
}
document.getElementById('preorderCancel').onclick=_closePreorderConfirm;
document.getElementById('preorderConfirm').onclick=e=>{if(e.target===e.currentTarget)_closePreorderConfirm();};
document.getElementById('preorderConfirmBtn').onclick=()=>{
  const id=_preorderPendingId;_preorderPendingId=null;
  if(history.state&&history.state.preorderConfirmOpen)history.replaceState(null,'','');
  document.getElementById('preorderConfirm').classList.remove('on');
  if(id)openCollectionModal(id);
};

let btcId=null,cBtcCol=[],btcAddPlatMode=false,btcSelPlat='Steam',btcIsDlc=false;

const STEAM_COLLECTIONS=[
  '001_TO TRY NEXT','002A_STARTED',"002B_DOESN'T FINISH",'002C_ROGUELIKE',
  '003_STEAM DECK','004_CIUCIO <3','005_TOGETHER <3','006_BOARD, CARD & DICE GAMES',
  '007_PARTY GAMES','008_DEMOS','009_BORDERLANDS','009_CIVILIZATION','009_DIVINITY SIN',
  '009_FALLOUT','009_FOOTBALL MANAGER','009_IDLER','009_KINGDOM HEARTS','009_LEGO',
  '009_MONKEY ISLAND','009_MONSTER HUNTER','009_ODDWORLD','009_RUSTY LAKE','009_VALVE',
  '009_YAKUZA','010_UNPLAYED','011_COMPLETED','012_BETAS & PLAYTESTS','013_VR',
  '014A_WILL NEVER PLAY','014B_TRIED BUT NO','014C_NEW ITERATION'
];

function _syncBtcPsBtn(val){
  const btn=document.getElementById('btcPlayStatusBtn');if(!btn)return;
  const m=PS_META[val]||{code:'UP',cls:'ps-UP'};
  btn.className='ps-modal-btn '+m.cls;
  btn.style.cssText='';
  btn.textContent=val||'Unplayed';
}
function _btcSelectPlat(plat){
  btcSelPlat=plat;
  document.querySelectorAll('#btcPlatPills .btc-plat-pill').forEach(pill=>{
    const active=pill.dataset.p===plat;
    pill.classList.toggle('selected',active);
    pill.style.background=active?platColor(plat):'';
    pill.style.color=active?platTextColor(plat):'';
    pill.style.borderColor=active?'transparent':'';
  });
  const colSec=document.getElementById('btcColSection');
  if(colSec)colSec.style.display=(plat==='Steam'&&!btcIsDlc)?'':'none';
  const bsi=document.getElementById('btcStoreInput');if(bsi)bsi.value='';
  document.getElementById('btcStore').value='';
  const bsd=document.getElementById('btcStoreDd');if(bsd)bsd.classList.remove('on');
}
function _openBtcModal(id,addPlatMode){
  btcId=id;cBtcCol=[];btcAddPlatMode=addPlatMode;
  const g=games.find(x=>x.id===id);
  btcIsDlc=!!(g&&g.type==='dlc');
  const psRow=document.getElementById('btcPlayStatusRow');
  if(psRow)psRow.style.display=btcIsDlc?'none':'';
  document.getElementById('btcTitle').textContent=g?g.title:'';
  document.getElementById('btcModalTitle').textContent=addPlatMode?'Add Platform':'Move to Collection';
  document.getElementById('btcConfirm').textContent=addPlatMode?'Save Platform':'Add to Collection';
  const owned=g?ownedPlatforms(g):[];
  const avail=addPlatMode?PLATFORM_ORDER.filter(p=>!owned.includes(p)):PLATFORM_ORDER;
  btcSelPlat=avail[0]||'Steam';
  const pills=document.getElementById('btcPlatPills');
  pills.innerHTML=avail.map(p=>`<button class="btc-plat-pill" data-p="${esc(p)}">${esc(p)}</button>`).join('');
  pills.querySelectorAll('.btc-plat-pill').forEach(pill=>{pill.onclick=()=>_btcSelectPlat(pill.dataset.p)});
  const n=new Date();
  document.getElementById('btcDate').value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  document.getElementById('btcCost').value='0';
  if(g&&g.price&&!addPlatMode)document.getElementById('btcCost').value=parseFloat(g.price).toFixed(2);
  document.getElementById('btcPlayStatus').value='Unplayed';
  _syncBtcPsBtn('Unplayed');
  document.getElementById('btcStore').value='';
  const _bsi=document.getElementById('btcStoreInput');if(_bsi)_bsi.value='';
  _btcSelectPlat(btcSelPlat);
  cBtcCol=[];renderBtcCol();
  _pushModalHistory();
  document.getElementById('btcov').classList.add('on');
}
function openCollectionModal(id){_openBtcModal(id,false)}
function openAddPlatformModal(id){
  const g=games.find(x=>x.id===id);if(!g)return;
  const owned=ownedPlatforms(g);
  const avail=PLATFORM_ORDER.filter(p=>!owned.includes(p));
  if(!avail.length){showToast('Already own on all platforms');return;}
  _openBtcModal(id,true);
}

// ── SHARED POPUP ANCHOR UTILITY ──────────────────────────────────────────────
// Positions a fixed popup below its anchor; flips above if there's more room.
function _anchorBelow(popup, anchor, gap){
  gap=gap||4;
  popup.style.maxHeight='';popup.style.overflowY='';
  const r=anchor.getBoundingClientRect();
  const ph=popup.getBoundingClientRect().height;
  const vh=window.innerHeight;
  const margin=8;
  const spaceBelow=vh-r.bottom-gap-margin;
  const spaceAbove=r.top-gap-margin;
  popup.style.top=(ph<=spaceBelow||spaceBelow>=spaceAbove)
    ?(r.bottom+gap)+'px'
    :Math.max(margin,r.top-ph-gap)+'px';
}

// Modal play status fancy picker
function _syncModalPsBtn(val){
  const btn=document.getElementById('fColPlayStatusBtn');if(!btn)return;
  const m=PS_META[val]||{code:'UP',cls:'ps-UP'};
  btn.className='ps-modal-btn '+m.cls;
  btn.style.cssText='';
  btn.textContent=val||'Unplayed';
}
// fColPlayStatusBtn — inline picker
document.addEventListener('click',e=>{
  const btn=e.target.closest('#fColPlayStatusBtn');if(!btn)return;
  e.stopPropagation();
  _toggleInlinePsPicker(document.getElementById('fColPsDd'),document.getElementById('fColPlayStatus'),_syncModalPsBtn,btn);
});

// ── INLINE MODAL PICKERS (play status) ───────────────────────────────
function updateStoreDd(inp,dd,hidden,plat){
  const q=(inp.value||'').toLowerCase().trim();
  const freq={};games.forEach(g=>(g.purchases||[]).forEach(p=>{if(p.platform===plat&&p.store)freq[p.store]=(freq[p.store]||0)+1;}));
  const opts=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]||a.localeCompare(b)).filter(s=>!q||s.toLowerCase().includes(q));
  if(!opts.length){dd.classList.remove('on');return;}
  dd.innerHTML=opts.map(s=>`<div class="dd-opt${s===hidden.value?' active':''}" data-s="${esc(s)}">${esc(s)}<span class="dd-opt-count">${freq[s]}</span></div>`).join('');
  dd.querySelectorAll('.dd-opt').forEach(el=>{
    el.onclick=()=>{inp.value=el.dataset.s;hidden.value=el.dataset.s;dd.classList.remove('on');};
  });
  dd.classList.add('on');
}
function _toggleInlinePsPicker(dd,hiddenInput,syncFn,triggerEl){
  const wasOpen=dd.classList.contains('on');
  document.querySelectorAll('.pick-dd.on').forEach(el=>{el.classList.remove('on')});
  if(wasOpen)return;
  const cur=hiddenInput.value||'Unplayed';
  dd.innerHTML=Object.keys(PS_META).map(s=>{
    const m=PS_META[s];
    return'<div class="ps-pick-opt'+(s===cur?' active':'')+'" data-s="'+esc(s)+'">'+
      '<span class="col-ps-badge '+m.cls+'" style="flex-shrink:0">'+m.code+'</span>'+
      '<span class="ps-pick-label">'+esc(s)+'</span></div>';
  }).join('');
  dd.querySelectorAll('.ps-pick-opt').forEach(opt=>{
    opt.addEventListener('click',e=>{
      e.stopPropagation();
      hiddenInput.value=opt.dataset.s;
      syncFn(opt.dataset.s);
      dd.classList.remove('on');
    });
  });
  dd.classList.add('on');
  _pickDdFlip(dd,triggerEl);
}
function _pickDdFlip(dd,triggerEl){
  dd.classList.remove('up');
  dd.style.maxHeight='';
  if(!triggerEl)return;
  const wrap=triggerEl.closest('.pick-wrap')||triggerEl;
  const r=wrap.getBoundingClientRect();
  let container=null,el=wrap.parentElement;
  while(el&&el!==document.documentElement){
    if(getComputedStyle(el).overflowY!=='visible'){container=el;break;}
    el=el.parentElement;
  }
  const cr=container?container.getBoundingClientRect():{top:0,bottom:window.innerHeight};
  const gap=6;
  const spaceBelow=cr.bottom-r.bottom-gap;
  const spaceAbove=r.top-cr.top-gap;
  if(spaceBelow<230&&spaceAbove>spaceBelow){
    dd.classList.add('up');
    dd.style.maxHeight=Math.max(spaceAbove,80)+'px';
  }else{
    dd.style.maxHeight=Math.min(Math.max(spaceBelow,80),320)+'px';
  }
}

// btcStoreInput autocomplete
(function(){
  const inp=document.getElementById('btcStoreInput');
  const dd=document.getElementById('btcStoreDd');
  const hid=document.getElementById('btcStore');
  if(!inp)return;
  inp.addEventListener('input',()=>{hid.value=inp.value;updateStoreDd(inp,dd,hid,btcSelPlat);});
  inp.addEventListener('focus',()=>{updateStoreDd(inp,dd,hid,btcSelPlat);});
  inp.addEventListener('blur',()=>_closeDdOnBlur('btcStoreDd'));
})();
// fColStoreInput autocomplete
(function(){
  const inp=document.getElementById('fColStoreInput');
  const dd=document.getElementById('fColStoreDd');
  const hid=document.getElementById('fColStore');
  if(!inp)return;
  inp.addEventListener('input',()=>{hid.value=inp.value;updateStoreDd(inp,dd,hid,_modalColPlat||'Steam');});
  inp.addEventListener('focus',()=>{updateStoreDd(inp,dd,hid,_modalColPlat||'Steam');});
  inp.addEventListener('blur',()=>_closeDdOnBlur('fColStoreDd'));
})();
// btcPlayStatusBtn
document.addEventListener('click',e=>{
  const btn=e.target.closest('#btcPlayStatusBtn');if(!btn)return;
  e.stopPropagation();
  _toggleInlinePsPicker(document.getElementById('btcPsDd'),document.getElementById('btcPlayStatus'),_syncBtcPsBtn,btn);
});
// Close .pick-dd on click outside
document.addEventListener('click',e=>{
  if(!e.target.closest('.pick-wrap')&&!e.target.closest('.pick-dd'))
    document.querySelectorAll('.pick-dd.on').forEach(el=>{el.classList.remove('on');});
});

function _rawCloseCollectionModal(){
  document.getElementById('btcov').classList.remove('on');
  const bdd=document.getElementById('btcColDd');if(bdd)bdd.classList.remove('on');
  const bsd=document.getElementById('btcStoreDd');if(bsd)bsd.classList.remove('on');
  document.querySelectorAll('.pick-dd.on').forEach(el=>el.classList.remove('on'));
  btcId=null;cBtcCol=[];btcAddPlatMode=false;
}
function closeCollectionModal(){_rawCloseCollectionModal();_popModalHistory();}

document.getElementById('btcCancel').onclick=()=>history.back();
document.getElementById('btcov').onclick=e=>{if(e.target===e.currentTarget)history.back()};

document.getElementById('btcConfirm').onclick=()=>{
  const g=games.find(x=>x.id===btcId);if(!g)return;
  if(!document.getElementById('btcStore').value){showToast('Please select a store.','err');return}
  if(!document.getElementById('btcDate').value){showToast('Please enter a purchase date.','err');return}
  const _btcStCol=document.getElementById('btcColSection');
  if(_btcStCol&&_btcStCol.style.display!=='none'&&!cBtcCol.length){showToast('Please pick at least one Steam collection.','err');return}
  const costRaw=document.getElementById('btcCost').value.trim();
  const cost=costRaw!==''?parseFloat(costRaw).toFixed(2):'0.00';
  const dateRaw=document.getElementById('btcDate').value||'';
  const newPurchase={
    platform:btcSelPlat,
    store:document.getElementById('btcStore').value||'',
    cost,
    purchaseDate:dateRaw?fmtDate(dateRaw)||dateRaw:'',
    playStatus:document.getElementById('btcPlayStatus').value||'Unplayed',
    steamCollection:btcSelPlat==='Steam'?[...cBtcCol]:[],
  };
  if(!btcAddPlatMode){
    g.status='bought';
    g.purchases=[newPurchase];
  } else {
    if(!Array.isArray(g.purchases))g.purchases=[];
    const ei=g.purchases.findIndex(p=>p.platform===btcSelPlat);
    if(ei>-1)g.purchases[ei]=newPurchase;else g.purchases.push(newPurchase);
  }
  syncLegacyFromPurchases(g);
  save(btcId);closeCollectionModal();dispatchRender();if(openId===btcId)openPanel(btcId);
};

// ══════════════════════════════════════════
//  SIDE PANEL
// ══════════════════════════════════════════

function _buildPlatTabContent(g,plat){
  const p=purchaseByPlat(g,plat)||{};
  const ps=p.playStatus||'Unplayed';const psM=PS_META[ps]||{code:'UP',cls:'ps-UP'};
  const cn=parseFloat(p.cost)||0;
  const costStr=cn===0
    ?`<span class="bdg b-free">FREE</span>`
    :`<b style="color:var(--blue)">€${cn.toFixed(2)}</b>`;
  const isSteam=plat==='Steam';

  const purchaseSection=`<div class="purch-3col">
    ${p.store?`<div class="purch-cell"><div class="purch-lbl">Store</div><div class="purch-val">${esc(p.store)}</div></div>`:''}
    <div class="purch-cell"><div class="purch-lbl">Cost</div><div class="purch-val">${costStr}</div></div>
    ${p.purchaseDate?`<div class="purch-cell"><div class="purch-lbl">Date</div><div class="purch-val">${esc(fmtDate(p.purchaseDate)||p.purchaseDate)}</div></div>`:''}
  </div>`;

  const psSpan=`<span class="col-ps-badge ${psM.cls}">${psM.code} · ${esc(ps)}</span>`;

  // DLCs don't track Play Status or Steam Collection — purchase info only.
  const twoCol=g.type==='dlc'?'':(isSteam
    ?`<div class="coll-2col">
        <div class="coll-2col-cell"><div class="purch-lbl">Status</div>${psSpan}</div>
        <div class="coll-2col-cell coll-chips-row"><div class="purch-lbl" style="width:100%;text-align:center">Collection</div>${(p.steamCollection||[]).map(s=>`<span class="cich-ro">${esc(colLabel(s))}</span>`).join('')||'<span style="color:var(--t3);font-size:.75rem">—</span>'}</div>
      </div>`
    :`<div class="coll-play-row"><div><div class="purch-lbl" style="text-align:center;margin-bottom:.25rem">Status</div>${psSpan}</div></div>`);

  return`${purchaseSection}${twoCol}`;
}

function openPanel(id){
  const sid=String(id);
  const g=games.find(x=>String(x.id)===sid);if(!g)return;
  id=g.id; // normalise to stored type
  openId=id;
  if(!(history.state&&history.state.panelOpen)){history.pushState({panelOpen:true},'');}
  cStars=g.myRating||0;
  const cu=g.cover||(g.steamAppId?sc(g.steamAppId):'');
  const pi=document.getElementById('pimg'),pp=document.getElementById('pph');
  if(cu){pi.src=cu;pi.style.display='block';pp.style.display='none'}else{pi.style.display='none';pp.style.display='flex'}
  const isNR=nr(g);const h=isNR?0:Math.min(100,parseInt(g.hotness)||0);
  const sl=encodeURIComponent(g.title||'');
  const ggUrl=g.steamAppId?`https://gg.deals/steam/app/${g.steamAppId}/`:`https://gg.deals/search/?title=${sl}`;
  const sdbUrl=g.steamAppId?`https://www.steamdb.info/app/${g.steamAppId}/`:`https://www.steamdb.info/search/?q=${sl}`;
  const stUrl=g.storeLink||(g.steamAppId?`https://store.steampowered.com/app/${g.steamAppId}/`:`https://store.steampowered.com/search/?term=${sl}`);
  const sh=[1,2,3,4,5].map(i=>`<span class="star-pos" data-pos="${i}"><span class="star-half star-l${cStars>=i-0.5?' on':''}" data-v="${i-0.5}">★</span><span class="star-half star-r${cStars>=i?' on':''}" data-v="${i}">★</span></span>`).join('');
  const shBlank=[1,2,3,4,5].map(i=>`<span class="star-pos" data-pos="${i}"><span class="star-half star-l" data-v="${i-0.5}">★</span><span class="star-half star-r" data-v="${i}">★</span></span>`).join('');
  const todayIso=(()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`})();
  const _plats=ownedPlatforms(g);

  const genreD=(g.genres||[]).join(', ')||g.genre||'';
  const dateD=displayReleaseDate(g);

  let b=`<div class="pt-row">
    <span class="title-prio ${prioClass(g.priority)}"></span>
    <div class="pt">${esc(g.title)}</div>
    <div class="pt-links">
      <a href="${stUrl}" class="pt-lnk" target="_blank" title="Steam">${favImg(FAV_STEAM,'steam')}</a>
      <a href="${ggUrl}" class="pt-lnk" target="_blank" title="gg.deals">${favImg(FAV_GG,'gg')}</a>
      <a href="${sdbUrl}" class="pt-lnk" target="_blank" title="SteamDB">${favImg(FAV_SDB,'sdb')}</a>
      <button type="button" class="pt-lnk" onclick="shareGame('${esc(g.id)}')" title="Share">${shareIcon()}</button>
    </div>
  </div>
  <div class="pm">
      ${isPreOrder(g)?`<span class="bdg b-pre">PRE-ORDER</span>`:g.status==='bought'?`<span class="bdg b-bt">${t('bdgBt')}</span>`:''}
      ${g.status==='removed'?`<span class="bdg b-rm">${t('bdgRm')}</span>`:''}
      ${isCancelled(g)?`<span class="b-cancelled">CANCELLED</span>`:''}
      ${g.status==='wishlist'&&!isCancelled(g)&&!isGameUnreleased(g)&&g.price!=null&&parseFloat(g.price)===0?`<span class="bdg b-free">FREE</span>`:''}
      ${isNR&&g.status==='wishlist'&&!isCancelled(g)&&!(g.price!=null&&parseFloat(g.price)===0)?`<span class="b-rev">${t('bdgRev')}</span>`:''}
      ${g.type==='dlc'?`<span class="bdg" style="background:#3a1a6e;color:#c4a0ff">DLC</span>`:''}
      ${!isNR?`<span class="bdg b-hot" title="Hotness: ${h}">${h}</span>`:''}
    </div>`;

  // Live Price — see ggPriceTags() for eligibility/data rules; same badges
  // as the wishlist card overlay, plus a discount-% badge per price (against
  // g.price, the game's own tracked list price) that the card overlay skips
  // to stay compact. The chart below is just the current price's trend, so
  // it lives in the same section instead of a separate one — showing the
  // same number twice (badge row + chart's last point) read as two
  // different facts otherwise. Chart is fetched async after the panel body
  // is in the DOM (see renderPriceHistoryChart, called below); this just
  // emits the placeholder it mounts into.
  let _priceHistTracked=false;
  {
    const _tags=ggPriceTags(g);
    if(_tags){
      let _discRetail='',_discKey='';
      if(!_tags.notrack){
        const _gp=ggPriceCache[g.steamAppId];
        const _pctR=ggDiscountPct(parseFloat(_gp&&_gp.retail),g.price);
        const _pctK=ggDiscountPct(parseFloat(_gp&&_gp.keyshop),g.price);
        _discRetail=_pctR!=null?`<span class="ggp-disc">-${_pctR}%</span>`:'';
        _discKey=_pctK!=null?`<span class="ggp-disc">-${_pctK}%</span>`:'';
      }
      const _row=_tags.notrack?`<span class="ggp-notrack">€ Non Tracked</span>`:`${_tags.retailStr}${_discRetail}${_tags.badgeStr}${_tags.keysStr}${_discKey}`;
      _priceHistTracked=!_tags.notrack;
      const _chart=_priceHistTracked?`<div class="ph-chart" id="phChart"><div class="ph-empty">Loading…</div></div>`:'';
      b+=`<div class="ps"><div class="psl">${t('pLivePrice')}</div><div class="pv-liveprice">${_row}</div>${_chart}</div>`;
    }
  }

  // Collection box — immediately after hotness (bought games only)
  if(g.status==='bought'){
    const _gPurchasesEarly=gamePurchases(g);
    if(_gPurchasesEarly.length){
      const _ordPE=[..._gPurchasesEarly].sort((a,b)=>PLATFORM_ORDER.indexOf(a.platform)-PLATFORM_ORDER.indexOf(b.platform));
      const _firstPlatE=_ordPE[0].platform;
      const _tabsHTMLE=_ordPE.map((p,i)=>`<button class="plat-tab${i===0?' active':''}" data-plat="${esc(p.platform)}" style="${i===0?'background:'+platColor(p.platform)+';color:'+platTextColor(p.platform)+';border-color:transparent':''}">${esc(p.platform)}</button>`).join('');
      b+=`<div class="coll-box" style="margin-bottom:.8rem">
        <div class="coll-box-hdr" id="platTabs">${_tabsHTMLE}</div>
        <div class="coll-box-body" id="platTabContent">${_buildPlatTabContent(g,_firstPlatE)}</div>
      </div>`;
    }
    // Review — shown right after collection details
    {
      const _hasRev=!!(g.myReview&&g.myReview.trim());
      const _scoreDisp=cStars>0?`${cStars}<span class="review-score-denom">/5</span>`:`<span style="color:var(--t3);font-size:1rem">—</span>`;
      const _composeStars=_hasRev?sh:shBlank;
      const _composeDateVal=g.myReviewDate||todayIso;
      const _initScore=_hasRev?_scoreDisp:'<span style="color:var(--t3);font-size:.9rem">—</span>';
      const _composeSection=`
        <div id="reviewCompose" style="display:none">
          <div class="note-compose" style="margin-bottom:.35rem;display:grid;grid-template-columns:auto 1fr;gap:.4rem;align-items:center">
            <input type="date" id="reviewDate" class="note-compose-date" style="position:static;width:120px;border-radius:var(--r);font-size:.72rem;padding:.42rem .5rem;color:var(--text)">
            <div style="display:flex;align-items:center;gap:.35rem">
              <span id="starsZero" class="stars-zero" title="Clear stars">✕</span>
              <div class="stars" id="pstarsEdit" style="margin-bottom:0">${_composeStars}</div>
              <div class="review-score" id="previewScore" style="font-size:.9rem;line-height:1">${_initScore}</div>
            </div>
          </div>
          <textarea class="rta" id="prevta" placeholder="Your thoughts…" style="min-height:60px;resize:none">${_hasRev?esc(g.myReview):''}</textarea>
          <div style="display:flex;gap:.4rem;margin-top:.35rem">
            <button class="note-save-btn" id="psrv" disabled>${t('pSaveRev')}</button>
            <button class="note-save-btn" id="reviewCancel">Cancel</button>
          </div>
        </div>`;
      if(_hasRev){
        const _dateCol=g.myReviewDate?esc(fmtDate(g.myReviewDate)||g.myReviewDate):'—';
        b+=`<div class="ps"><div class="psl">${t('pReview')}</div>
          <div id="reviewView">
            <div class="review-row">
              <div class="review-row-stars">
                <div style="display:flex;align-items:center;gap:.35rem">
                  <div class="stars" id="pstars">${sh}</div>
                  <div class="review-score" style="font-size:.85rem">${_scoreDisp}</div>
                </div>
              </div>
              <div class="review-row-date">${_dateCol}</div>
              <div class="review-row-text note-md">${renderMd(g.myReview)}</div>
            </div>
            <div class="note-actions">
              <button class="note-btn edit-btn" id="reviewEditBtn">Edit</button>
              <button class="note-btn del-btn del" id="reviewDelBtn">Delete</button>
            </div>
          </div>
          ${_composeSection}
        </div>`;
      }else{
        b+=`<div class="ps"><div class="psl">${t('pReview')}</div>
          <button class="note-add-toggle" id="reviewToggle">＋ Write review</button>
          ${_composeSection}
        </div>`;
      }
    }
  }

  const devArr=Array.isArray(g.developer)?g.developer:(g.developer?[String(g.developer)]:[]);
  const pubArr=Array.isArray(g.publisher)?g.publisher:(g.publisher?[String(g.publisher)]:[]);
  const genreArr=genreD?genreD.split(',').map(s=>s.trim()).filter(Boolean):[];
  const _expBtn=(hid,n)=>`<button onclick="window._phToggle('${hid}',this,${n})" style="background:none;border:none;color:var(--blue);font-size:.68rem;cursor:pointer;padding:0;font-family:inherit;vertical-align:baseline">[+${n}]</button>`;
  const _truncArr=(arr,max,uid)=>{
    if(!arr.length)return'—';
    if(arr.length<=max)return arr.map(esc).join(', ');
    const shown=arr.slice(0,max).map(esc).join(', ');
    const rest=arr.slice(max);
    const hid=`ph-${uid}-${g.id}`;
    return`${shown}, <span id="${hid}" style="display:none">${rest.map(esc).join(', ')}</span>${_expBtn(hid,rest.length)}`;
  };
  let genreHTML;
  if(!genreArr.length)genreHTML='—';
  else if(genreArr.length<=4)genreHTML=genreArr.map(s=>`<span style="display:inline-flex;align-items:center;gap:.1rem">${esc(s)}${metaTipHTML(s)}</span>`).join(', ');
  else{
    const shownG=genreArr.slice(0,4).map(s=>`<span style="display:inline-flex;align-items:center;gap:.1rem">${esc(s)}${metaTipHTML(s)}</span>`).join(', ');
    const restG=genreArr.slice(4).map(s=>`<span style="display:inline-flex;align-items:center;gap:.1rem">${esc(s)}${metaTipHTML(s)}</span>`).join(', ');
    const hidG=`ph-genre-${g.id}`;
    genreHTML=`${shownG}, <span id="${hidG}" style="display:none">${restG}</span>${_expBtn(hidG,genreArr.length-4)}`;
  }
  const detLeft=[
    [t('pDev'), _truncArr(devArr,2,'dev')],
    [t('pPub'), _truncArr(pubArr,2,'pub')],
    [t('pRel'), (()=>{
      let relStr=esc(dateD);
      if(isFutureDate(g.releaseDate)){
        const dys=Math.ceil((new Date(normaliseDate(g.releaseDate))-new Date(todayISO()))/(1000*60*60*24));
        const lbl=dys===1?'tomorrow':dys<=30?`in ${dys}d`:dys<=365?`in ${Math.ceil(dys/7)}w`:null;
        if(lbl)relStr+=` <span style="color:var(--amber);font-size:.65rem;font-weight:700">${lbl}</span>`;
      }
      return relStr;
    })()],
  ];
  const detRight=[
    [t('pGenre'), genreHTML],
    [t('pPrice'), (()=>{
      const dlBdg=g.delisted?` <span class="b-delisted">DELISTED</span>`:'';
      if(g.price!=null&&parseFloat(g.price)===0)return`<span class="bdg b-free">FREE</span>`;
      if(g.price)return`<b style="color:var(--blue)">€${parseFloat(g.price).toFixed(2)}</b>${dlBdg}`;
      if(g.delisted)return`<span class="b-delisted">DELISTED</span>`;
      if(isGameUnreleased(g))return`<span class="bdg b-unrel">UNRELEASED</span>`;
      return`<span style="color:var(--t3)">—</span>`;
    })()],
    ['Added', `<span style="color:var(--t2)">${fmtAdded(daysAgo(g.added),g.added)}</span>`],
  ];
  const _kvCol=items=>`<div class="pv pv-kv">${items.map(([l,v])=>`<span class="pv-kv-lbl">${l}:</span><span>${v}</span>`).join('')}</div>`;
  b+=`<div class="ps"><div class="psl">${t('pDetails')}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:.3rem .8rem">${_kvCol(detLeft)}${_kvCol(detRight)}</div></div>`;

  // Trading — spare keys for this game, populated by hand in the synced
  // Google Sheet (games[].key, a JSON array of strings). Only shown when
  // at least one key is set. Each key is a Key Chip (.kchip) — its own
  // type, not a Chip variant: Filter Chip's label:value+x shape, plus
  // Status Chip's whole-body click-to-act behavior (click copies the key
  // instead of retrying a sync).
  if(g.key&&g.key.length){
    const keyChips=g.key.map((k,i)=>`<span class="kchip" data-key="${esc(k)}" onclick="copyKeyChip(this)" title="Click to copy"><span class="kchip-label">Key ${i+1}:</span><span class="kchip-val">${esc(k)}</span><button type="button" class="kchip-x" onclick="event.stopPropagation();removeGameKey('${esc(g.id)}',${i})" title="Remove key">✕</button></span>`).join('');
    b+=`<div class="ps"><div class="psl">Trading</div><div class="pv" style="display:flex;flex-wrap:wrap;gap:.35rem">${keyChips}</div></div>`;
  }

  // Base game link — shown for DLCs that have a parent in the collection
  if(g.type==='dlc'&&g.parentAppId){
    const parent=findParentGame(g);
    if(parent){
      const pCover=parent.cover||(parent.steamAppId?sc(parent.steamAppId):'');
      const pThumb=pCover?`<img class="panel-base-thumb" src="${esc(pCover)}" alt="">`:`<div class="panel-base-thumb" style="background:var(--base);display:flex;align-items:center;justify-content:center;font-size:.8rem;color:var(--t3)">🎮</div>`;
      b+=`<div class="ps"><div class="psl">Base Game</div>
        <div class="panel-base-game ${prioClass(parent.priority)}" data-pid="${esc(parent.id)}">
          ${pThumb}
          <div class="panel-base-info">
            <span class="panel-base-title ${statusTextClass(parent)}">${esc(parent.title)}</span>
            <span class="panel-base-arrow">›</span>
          </div>
        </div></div>`;
    }
  }
  // DLC section — shown for parent games that have DLCs
  if(g.type!=='dlc'){
    const gameDlcs=findAllKnownDlcs(g);
    if(gameDlcs.length){
      const dlcCards=gameDlcs.map(d=>{
        const dCover=d.cover||(d.steamAppId?sc(d.steamAppId):'');
        const dThumb=dCover?`<img class="panel-base-thumb" src="${esc(dCover)}" alt="">`:`<div class="panel-base-thumb" style="background:var(--base);display:flex;align-items:center;justify-content:center;font-size:.8rem;color:var(--t3)">🎮</div>`;
        return`<div class="panel-dlc-item panel-base-game ${prioClass(d.priority)}" data-did="${esc(d.id)}">
          ${dThumb}
          <div class="panel-base-info">
            <span class="panel-base-title ${statusTextClass(d)}">${esc(d.title)}</span>
            <span class="panel-base-arrow">›</span>
          </div>
        </div>`;
      }).join('');
      const ownedCount=gameDlcs.filter(d=>d.status==='bought').length;
      const totalCount=gameDlcs.length;
      const dlcLabel=ownedCount===totalCount?`DLC (${totalCount})`:`DLC (${ownedCount}/${totalCount} owned)`;
      b+=`<div class="ps"><div class="psl">${dlcLabel}</div>${dlcCards}</div>`;
    }
  }
  if(g.shortDescription||(g.tags&&g.tags.length)){
    b+=`<div class="ps">`;
    if(g.shortDescription)b+=`<div class="psl">About</div><div class="pv" style="color:var(--t2);font-size:.78rem;line-height:1.55">${renderMd(g.shortDescription)}</div>`;
    if(g.tags&&g.tags.length)b+=`<div style="display:flex;gap:.28rem;flex-wrap:wrap;margin-top:${g.shortDescription?'.5rem':'0'}">${g.tags.map(x=>`<span class="cich-tag">${esc(x)}${metaTipHTML(x)}</span>`).join('')}</div>`;
    b+=`</div>`;
  }
  // Notes — multi-note with add/edit/delete
  const notes=Array.isArray(g.notes)?g.notes:(g.notes?[{id:nid(),date:todayStr(),text:g.notes}]:[]);
  const _mdTip='**bold**\n*italic*\n`code`\n[text](url)\n- bullet list';
  b+=`<div class="ps"><div class="psl">Notes <span class="meta-tip-icon" tabindex="0" data-desc="${_mdTip}">ⓘ</span></div>
    <div id="noteList" style="margin-bottom:.3rem">
    ${[...notes].reverse().map(n=>`
      <div class="note-entry" data-nid="${esc(n.id)}">
        <div class="note-date">${esc(fmtDate(n.date)||n.date||'')}</div>
        <div class="note-text note-md">${renderMd(n.text)}</div>
        <div class="note-edit-wrap" style="display:none">
          <div class="note-compose" style="margin-bottom:.25rem">
            <input type="date" class="note-compose-date note-edit-date">
            <textarea class="note-edit-area" style="display:block;margin-bottom:0;min-height:50px">${esc(n.text)}</textarea>
          </div>
        </div>
        <div class="note-actions">
          <button class="note-btn edit-btn">Edit</button>
          <button class="note-btn save save-btn" style="display:none">Save</button>
          <button class="note-btn del-btn del">Delete</button>
        </div>
      </div>`).join('')}
    </div>
    <button class="note-add-toggle" id="noteToggle">＋ Add note</button>
    <div id="noteCompose" style="display:none;margin-top:.35rem">
      <div class="note-compose">
        <textarea class="note-add" id="noteNewTxt" placeholder="Add a note…" style="margin-bottom:0"></textarea>
        <div class="note-compose-footer">
          <input type="date" id="noteNewDate" class="note-compose-date" value="${todayIso}">
          <button class="note-save-btn" id="noteAddBtn">Save note</button>
        </div>
      </div>
    </div>
  </div>`;
  if(g.status==='removed'&&g.removeNote)b+=`<div class="ps"><div class="psl" style="color:var(--pink)">${t('pRmNote')}</div><div class="pv" style="color:var(--muted)">${esc(g.removeNote)}</div></div>`;

  const bl=g.status==='bought'?'Move to Wishlist':'Add to Collection';
  // Bought games cannot be removed
  const actionBtns=g.status==='removed'
    ?`<button class="pa s" id="pri">↩ ${t('pReinstate')}</button>`
    :g.status==='bought'
      ?``  // no remove button for bought
      :`<button class="pa d" id="prm">${t('pRemove')}</button>`;

  document.getElementById('pbody').innerHTML=b;
  if(_priceHistTracked)renderPriceHistoryChart(g);

  // Parallax scroll on cover image
  const _pb2El=document.getElementById('pbody');
  const _pimgEl=document.getElementById('pimg');
  _pimgEl.style.transform='';_pimgEl.style.filter='';
  _pb2El.scrollTop=0;
  function _onPanelScroll(){}
  _pb2El.removeEventListener('scroll',_pb2El._panelScrollFn);
  _pb2El._panelScrollFn=_onPanelScroll;
  _pb2El.addEventListener('scroll',_onPanelScroll,{passive:true});

  // Nav buttons
  {
    const _navIds=[...document.querySelectorAll('.gc[data-id]')].map(el=>el.dataset.id);
    const _navIdx=_navIds.indexOf(String(openId));
    const _prevBtn=document.getElementById('pnavPrev');
    const _nextBtn=document.getElementById('pnavNext');
    if(_prevBtn){_prevBtn.disabled=_navIdx<=0;_prevBtn.onclick=()=>navPanel(-1);}
    if(_nextBtn){_nextBtn.disabled=_navIdx<0||_navIdx>=_navIds.length-1;_nextBtn.onclick=()=>navPanel(1);}
  }

  // Sticky footer actions
  const panelFooterEl=document.getElementById('panelFooter');
  if(panelFooterEl){
    panelFooterEl.innerHTML=`<div class="pac">
      <button class="pa" id="ped">${t('pEdit')}</button>
      <button class="pa ${g.status==='bought'?'s':'add'}" id="pbt">${g.status==='bought'?'↩ ':''} ${bl}</button>
      ${actionBtns}
    </div>`;
  }

  // Base game link click (DLC panel)
  const bgEl=document.querySelector('.panel-base-game');
  if(bgEl)bgEl.addEventListener('click',()=>openPanel(bgEl.dataset.pid));

  // DLC items click (parent game panel)
  document.querySelectorAll('.panel-dlc-item').forEach(el=>{
    el.addEventListener('click',()=>openPanel(el.dataset.did));
  });

  // Wire platform tabs + inline content
  const _platTabsEl=document.getElementById('platTabs');
  if(_platTabsEl){
    const _gForPanel=g;
    const _ordPPurchases=[...gamePurchases(_gForPanel)].sort((a,b)=>PLATFORM_ORDER.indexOf(a.platform)-PLATFORM_ORDER.indexOf(b.platform));
    const _firstPlatPanel=_ordPPurchases[0]?_ordPPurchases[0].platform:'Steam';
    _platTabsEl.querySelectorAll('.plat-tab').forEach(tab=>{
      tab.addEventListener('click',()=>{
        const plat=tab.dataset.plat;
        _platTabsEl.querySelectorAll('.plat-tab').forEach(t=>{
          const active=t.dataset.plat===plat;
          t.classList.toggle('active',active);
          t.style.background=active?platColor(plat):'';
          t.style.color=active?platTextColor(plat):'';
          t.style.borderColor=active?'transparent':'';
        });
        const content=document.getElementById('platTabContent');
        if(content){content.innerHTML=_buildPlatTabContent(_gForPanel,plat);}
      });
    });
  }

  // Notes wiring
  function getNotes(){const gg=games.find(x=>x.id===openId);return gg?(Array.isArray(gg.notes)?gg.notes:(gg.notes?[{id:nid(),date:todayStr(),text:gg.notes}]:[])):[]}
  function saveNotes(arr){const gg=games.find(x=>x.id===openId);if(gg){gg.notes=arr;save()}}
  document.getElementById('noteToggle').onclick=()=>{
    const compose=document.getElementById('noteCompose');
    const tog=document.getElementById('noteToggle');
    const hidden=compose.style.display==='none';
    compose.style.display=hidden?'block':'none';
    tog.textContent=hidden?'✕ Cancel':'＋ Add note';
  };
  document.getElementById('noteAddBtn').onclick=()=>{
    const txt=document.getElementById('noteNewTxt').value.trim();if(!txt)return;
    const ndVal=document.getElementById('noteNewDate').value;
    const noteDate=ndVal?fmtDate(ndVal):todayStr();
    const arr=getNotes();arr.push({id:nid(),date:noteDate,text:txt});
    saveNotes(arr);openPanel(openId);
  };
  document.querySelectorAll('.note-entry').forEach(entry=>{
    const nidVal=entry.dataset.nid;
    const textEl=entry.querySelector('.note-text');
    const dateEl=entry.querySelector('.note-date');
    const editWrap=entry.querySelector('.note-edit-wrap');
    const editArea=entry.querySelector('.note-edit-area');
    const editDateInp=entry.querySelector('.note-edit-date');
    const editBtn=entry.querySelector('.edit-btn');
    const saveBtn=entry.querySelector('.save-btn');
    const delBtn=entry.querySelector('.del-btn');
    // Pre-fill edit date from displayed date (convert dd/mm/yyyy → yyyy-mm-dd)
    const rawDate=dateEl.textContent.trim();
    const dm=rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(editDateInp&&dm)editDateInp.value=`${dm[3]}-${dm[2]}-${dm[1]}`;
    editBtn.onclick=()=>{
      textEl.style.display='none';editWrap.style.display='block';
      editBtn.style.display='none';saveBtn.style.display='';
    };
    saveBtn.onclick=()=>{
      const arr=getNotes();const i=arr.findIndex(n=>n.id===nidVal);
      if(i>-1){
        arr[i].text=editArea.value.trim();
        if(editDateInp&&editDateInp.value)arr[i].date=fmtDate(editDateInp.value);
        saveNotes(arr);
      }
      openPanel(openId);
    };
    delBtn.onclick=()=>{
      if(!confirm('Delete this note?'))return;
      const arr=getNotes().filter(n=>n.id!==nidVal);saveNotes(arr);openPanel(openId);
    };
  });
  if(g.status==='bought'){
    const _hasRev2=!!(g.myReview&&g.myReview.trim());
    let _editStars=_hasRev2?cStars:null;
    const _checkSave=()=>{
      const btn=document.getElementById('psrv');
      const ta=document.getElementById('prevta');
      if(btn)btn.disabled=(_editStars===null||!ta||!ta.value.trim());
      const zb=document.getElementById('starsZero');
      if(zb)zb.classList.toggle('active',_editStars===0);
    };
    const _updateEditStars=(v,commit)=>{
      document.querySelectorAll('#pstarsEdit .star-half').forEach(x=>x.classList.toggle('on',parseFloat(x.dataset.v)<=v));
      const sc=document.getElementById('previewScore');
      if(sc)sc.innerHTML=v>0?`${v}<span class="review-score-denom">/5</span>`:`<span style="color:var(--t3);font-size:.9rem">—</span>`;
      if(commit){_editStars=v;_checkSave();}
    };
    document.querySelectorAll('#pstarsEdit .star-pos').forEach(pos=>{
      pos.addEventListener('mousemove',e=>{
        const r=pos.getBoundingClientRect();
        _updateEditStars((e.clientX<r.left+r.width/2?parseFloat(pos.dataset.pos)-0.5:parseFloat(pos.dataset.pos)),false);
      });
      pos.addEventListener('mouseleave',()=>_updateEditStars(_editStars===null?0:_editStars,false));
      pos.addEventListener('click',e=>{
        const r=pos.getBoundingClientRect();
        const val=e.clientX<r.left+r.width/2?parseFloat(pos.dataset.pos)-0.5:parseFloat(pos.dataset.pos);
        _updateEditStars(_editStars===val?0:val,true);
      });
    });
    const _starsZeroBtn=document.getElementById('starsZero');
    if(_starsZeroBtn)_starsZeroBtn.addEventListener('click',()=>_updateEditStars(0,true));
    const _prevta=document.getElementById('prevta');
    if(_prevta)_prevta.addEventListener('input',_checkSave);
    const _revEditBtn=document.getElementById('reviewEditBtn');
    if(_revEditBtn)_revEditBtn.onclick=()=>{
      document.getElementById('reviewView').style.display='none';
      document.getElementById('reviewCompose').style.display='';
      _editStars=cStars;_checkSave();
    };
    const _revDelBtn=document.getElementById('reviewDelBtn');
    if(_revDelBtn)_revDelBtn.onclick=()=>{
      if(!confirm('Delete this review?'))return;
      const gg=games.find(x=>x.id===openId);if(!gg)return;
      gg.myRating=0;gg.myReview='';gg.myReviewDate='';
      save();openPanel(openId);
    };
    const _revToggle=document.getElementById('reviewToggle');
    if(_revToggle)_revToggle.onclick=()=>{
      _revToggle.style.display='none';
      document.getElementById('reviewCompose').style.display='';
    };
    const _revCancel=document.getElementById('reviewCancel');
    if(_revCancel)_revCancel.onclick=()=>{
      document.getElementById('reviewCompose').style.display='none';
      if(_hasRev2)document.getElementById('reviewView').style.display='';
      else{const t=document.getElementById('reviewToggle');if(t)t.style.display='';}
    };
    const _psrv=document.getElementById('psrv');
    if(_psrv)_psrv.onclick=()=>{
      const gg=games.find(x=>x.id===openId);if(!gg)return;
      gg.myRating=_editStars||0;
      gg.myReview=document.getElementById('prevta').value.trim();
      const de=document.getElementById('reviewDate');if(de&&de.value)gg.myReviewDate=de.value;
      save();openPanel(openId);
    };
  }
  document.getElementById('ped').onclick=()=>{
    const _pov=document.getElementById('pov');
    document.getElementById('panel').classList.remove('on');
    openId=null;
    setTimeout(()=>_pov.classList.remove('on'),290);
    const _pf=document.getElementById('panelFooter');if(_pf)_pf.innerHTML='';
    openEdit(id);
  };
  document.getElementById('pbt').onclick=()=>handleMarkBought(id);
  const prm=document.getElementById('prm');if(prm)prm.onclick=()=>startRemove(id);
  const pri=document.getElementById('pri');if(pri)pri.onclick=()=>startReinstate(id);
  document.getElementById('pov').classList.add('on');
  document.getElementById('panel').classList.add('on');
}
function closePanel(){
  const pov=document.getElementById('pov');
  const panel=document.getElementById('panel');
  panel.classList.remove('on');
  openId=null;
  setTimeout(()=>pov.classList.remove('on'),290);
  const pf=document.getElementById('panelFooter');if(pf)pf.innerHTML='';
  if(history.state&&history.state.panelOpen){history.back();}
}
// ── MODAL HISTORY HELPERS ─────────────────
let _popSuppressed=false;
function _pushModalHistory(){history.pushState({modal:true},'','');}
function _popModalHistory(){
  if(history.state&&history.state.modal){
    _popSuppressed=true;history.back();setTimeout(()=>{_popSuppressed=false;},200);
  }
}

// ── MOVE TO WISHLIST CONFIRM ───────────────
function startMoveToWishlist(id){
  wlovId=id;
  const g=games.find(x=>x.id===id);if(!g)return;
  const ttl=document.getElementById('wlovGameTitle');if(ttl)ttl.textContent=g.title||'';
  _pushModalHistory();
  document.getElementById('wlovConfirm').classList.add('on');
}
document.getElementById('wlovCancel').onclick=()=>history.back();
document.getElementById('wlovConfirm').onclick=e=>{if(e.target===e.currentTarget)history.back()};
document.getElementById('wlovConfirmBtn').onclick=()=>{
  const g=games.find(x=>x.id===wlovId);
  if(g){
    g.status='wishlist';
    delete g.store;delete g.cost;delete g.purchaseDate;delete g.playStatus;delete g.steamCollection;delete g.purchases;
    save(wlovId);
  }
  document.getElementById('wlovConfirm').classList.remove('on');
  _popModalHistory();
  dispatchRender();
};

// Android back-swipe / browser back closes overlay modals instead of exiting
window.addEventListener('popstate',function(){
  if(_popSuppressed)return;
  // lightweight menus — close without back()
  if(_addPickOpen){const p=document.getElementById('addPickPop');if(p)p.style.display='none';_addPickOpen=false;return;}
  const hmenu=document.getElementById('hmenu');
  if(hmenu&&hmenu.classList.contains('on')){hmenu.classList.remove('on');return;}
  const preorderConfirmOv=document.getElementById('preorderConfirm');
  if(preorderConfirmOv&&preorderConfirmOv.classList.contains('on')){preorderConfirmOv.classList.remove('on');_preorderPendingId=null;return;}
  if(window._rdcIsOpen&&window._rdcIsOpen()){if(window._rdcTryClose&&!window._rdcTryClose())history.pushState({rdcovOpen:true},'','');return;}
  if(window._plcIsOpen&&window._plcIsOpen()){if(window._plcTryClose&&!window._plcTryClose())history.pushState({plcovOpen:true},'','');return;}
  if(window._ssIsOpen&&window._ssIsOpen()){window._ssTryClose&&window._ssTryClose();return;}
  if(window._tkIsOpen&&window._tkIsOpen()){window._tkTryClose&&window._tkTryClose();return;}
  if(window._nuIsOpen&&window._nuIsOpen()){window._nuTryClose&&window._nuTryClose();return;}
  const fbar=document.getElementById('fbar');
  if(fbar&&fbar.classList.contains('on')){window._rawCloseFbar&&window._rawCloseFbar();return;}
  if(document.getElementById('panel').classList.contains('on')){
    const pov=document.getElementById('pov');
    document.getElementById('panel').classList.remove('on');
    openId=null;
    setTimeout(()=>pov.classList.remove('on'),290);
    const pf=document.getElementById('panelFooter');if(pf)pf.innerHTML='';
    // Panel was opened from a Live Prices card (see _ggFetchGoToGame) —
    // landing back on that modal's still-intact history entry should bring
    // it back up, not leave the user staring at the bare main view. Reveal
    // only (no pushState) — we're already sitting on that entry.
    if(_ggFetchHidden&&history.state&&history.state.ggFetchOpen)_revealGgFetchModal();
    return;
  }
  const mov=document.getElementById('mov');
  if(mov&&mov.classList.contains('on')){_rawCloseModal();return;}
  const btcov=document.getElementById('btcov');
  if(btcov&&btcov.classList.contains('on')){_rawCloseCollectionModal();return;}
  const rmov=document.getElementById('rmov');
  if(rmov&&rmov.classList.contains('on')){rmov.classList.remove('on');return;}
  const riov=document.getElementById('riov');
  if(riov&&riov.classList.contains('on')){riov.classList.remove('on');return;}
  const wlov=document.getElementById('wlovConfirm');
  if(wlov&&wlov.classList.contains('on')){wlov.classList.remove('on');return;}
  const calOv=document.getElementById('calOv');
  if(calOv&&calOv.style.display!=='none'){_rawCloseCalendar();return;}
  const ggFetchOv=document.getElementById('ggFetchOv');
  if(ggFetchOv&&(ggFetchOv.classList.contains('on')||_ggFetchHidden)){
    if(_ggFetchHidden){_showGgFetchModal();return;}
    if(window._ggFetchTryClose&&!window._ggFetchTryClose())history.pushState({ggFetchOpen:true},'','');
    return;
  }
});

// ── PANEL DRAG RESIZE (desktop only) ──────────────────────────
(function(){
  const PANEL_MIN=600, PANEL_MAX=900, STORAGE_KEY='btb_panel_w', DEFAULT_W=600;
  const root=document.documentElement;
  const handle=document.getElementById('panel-drag-handle');
  if(!handle)return;

  // Restore saved width
  const saved=parseInt(localStorage.getItem(STORAGE_KEY));
  if(saved>=PANEL_MIN&&saved<=PANEL_MAX) root.style.setProperty('--pw',saved+'px');

  function setWidth(w){
    const clamped=Math.max(PANEL_MIN,Math.min(PANEL_MAX,w));
    root.style.setProperty('--pw',clamped+'px');
    localStorage.setItem(STORAGE_KEY,clamped);
  }

  // Double-click resets to default
  handle.addEventListener('dblclick',()=>{
    setWidth(DEFAULT_W);
  });

  // Only wire drag on desktop
  if(window.innerWidth<=640)return;

  let dragging=false, startX=0, startW=0;

  handle.addEventListener('mousedown',e=>{
    dragging=true;
    startX=e.clientX;
    startW=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pw'))||DEFAULT_W;
    handle.classList.add('dragging');
    document.body.style.userSelect='none';
    document.body.style.cursor='ew-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove',e=>{
    if(!dragging)return;
    // Dragging left = panel grows (right-anchored panel)
    const delta=startX-e.clientX;
    setWidth(startW+delta);
  });

  document.addEventListener('mouseup',()=>{
    if(!dragging)return;
    dragging=false;
    handle.classList.remove('dragging');
    document.body.style.userSelect='';
    document.body.style.cursor='';
  });
})();
document.getElementById('pclose').onclick=closePanel;
document.getElementById('pov').onclick=closePanel;

// ══════════════════════════════════════════
//  REMOVE / REINSTATE
// ══════════════════════════════════════════
function startRemove(id){rmId=id;document.getElementById('rmNote').value='';_pushModalHistory();document.getElementById('rmov').classList.add('on')}
document.getElementById('rmCancel').onclick=()=>history.back();
document.getElementById('rmConfirm').onclick=()=>{
  if(!document.getElementById('rmNote').value.trim()){showToast('Please enter a reason for removing.','err');return}
  const g=games.find(x=>x.id===rmId);
  if(g){g.status='removed';g.removeNote=document.getElementById('rmNote').value.trim();save()}
  document.getElementById('rmov').classList.remove('on');_popModalHistory();closePanel();renderAll();
};
function startReinstate(id){riId=id;_pushModalHistory();document.getElementById('riov').classList.add('on')}
document.getElementById('riCancel').onclick=()=>history.back();
function doReinstate(status){
  const g=games.find(x=>x.id===riId);
  if(g){g.status=status;delete g.removeNote;save()}
  document.getElementById('riov').classList.remove('on');_popModalHistory();closePanel();renderAll();
}
document.getElementById('riWl').onclick=()=>doReinstate('wishlist');
document.getElementById('riBt').onclick=()=>doReinstate('bought');

// ══════════════════════════════════════════
//  CHIP INPUT
// ══════════════════════════════════════════
function _focusNextField(el){
  const scope=el.closest('.modal')||document;
  const focusables=[...scope.querySelectorAll('input,select,textarea,button')].filter(f=>!f.disabled&&f.type!=='hidden'&&f.offsetParent!==null);
  const idx=focusables.indexOf(el);
  if(idx>-1&&idx<focusables.length-1)focusables[idx+1].focus();
}
// Closes a focus-triggered suggestion dropdown once its input loses focus for any
// reason (Tab, programmatic focus change, tapping away on mobile) — not just a
// document click, which is the only thing the click-outside handlers below catch.
// Delayed so a click/tap on a .dd-opt inside the dropdown still registers first.
function _closeDdOnBlur(ddId){
  setTimeout(()=>{const el=document.getElementById(ddId);if(el)el.classList.remove('on')},200);
}
function makeChip(wrapId,inputId,getA,setA,renderCb,labelFn){
  function render(){
    const w=document.getElementById(wrapId),inp=document.getElementById(inputId);
    w.querySelectorAll('.cich').forEach(e=>e.remove());
    getA().forEach((v,i)=>{
      const c=document.createElement('span');c.className='cich';
      c.innerHTML=`${esc(labelFn?labelFn(v):v)}<button type="button" data-i="${i}">✕</button>`;
      c.querySelector('button').onclick=e=>{const a=getA();a.splice(parseInt(e.target.dataset.i),1);setA(a);render();if(renderCb)renderCb()};
      w.insertBefore(c,inp);
    });
  }
  document.getElementById(inputId).addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===',')&&e.target.value.trim()){
      e.preventDefault();const a=getA();a.push(e.target.value.trim());setA(a);e.target.value='';render();if(renderCb)renderCb();
    }else if(e.key==='Enter'){
      e.preventDefault();_focusNextField(e.target);
    }
    if(e.key==='Backspace'&&!e.target.value&&getA().length){const a=getA();a.pop();setA(a);render();if(renderCb)renderCb()}
  });
  document.getElementById(wrapId).onclick=()=>document.getElementById(inputId).focus();
  return render;
}
const renderGenres=makeChip('genreWrap','genreInput',()=>cGenres,v=>{cGenres=v},updateGenreDd);
const renderTags=makeChip('tagsWrap','tagsInput',()=>cTags,v=>{cTags=v});
const renderBtcCol=makeChip('btcColWrap','btcColInput',()=>cBtcCol,v=>{cBtcCol=v},updateBtcColDd,colLabel);
let cModalCol=[];
const renderModalCol=makeChip('fColColWrap','fColColInput',()=>cModalCol,v=>{cModalCol=v},updateModalColDd,colLabel);
function updateModalColDd(){
  const dd=document.getElementById('fColColDd');
  const q=(document.getElementById('fColColInput').value||'').toLowerCase().trim();
  const freq={};games.forEach(g=>(g.steamCollection||[]).forEach(c=>{if(c)freq[c]=(freq[c]||0)+1;}));
  const opts=allSteamCollections().filter(s=>!cModalCol.includes(s)&&(!q||s.toLowerCase().includes(q)));
  if(!opts.length){dd.classList.remove('on');return}
  dd.innerHTML=opts.map(s=>`<div class="dd-opt" data-v="${esc(s)}">${esc(colLabel(s))}${freq[s]?`<span class="dd-opt-count">${freq[s]}</span>`:''}</div>`).join('');
  dd.querySelectorAll('.dd-opt').forEach(el=>{
    el.onclick=()=>{cModalCol.push(el.dataset.v);document.getElementById('fColColInput').value='';renderModalCol();dd.classList.remove('on')};
  });
  dd.classList.add('on');
}
document.getElementById('fColColInput').addEventListener('input',updateModalColDd);
document.getElementById('fColColInput').addEventListener('focus',updateModalColDd);
document.getElementById('fColColInput').addEventListener('blur',()=>_closeDdOnBlur('fColColDd'));

function updateBtcColDd(){
  const dd=document.getElementById('btcColDd');
  const q=(document.getElementById('btcColInput').value||'').toLowerCase().trim();
  const freq={};games.forEach(g=>(g.steamCollection||[]).forEach(c=>{if(c)freq[c]=(freq[c]||0)+1;}));
  const opts=allSteamCollections().filter(s=>!cBtcCol.includes(s)&&(!q||s.toLowerCase().includes(q)));
  if(!opts.length){dd.classList.remove('on');return}
  dd.innerHTML=opts.map(s=>`<div class="dd-opt" data-v="${esc(s)}">${esc(colLabel(s))}${freq[s]?`<span class="dd-opt-count">${freq[s]}</span>`:''}</div>`).join('');
  dd.querySelectorAll('.dd-opt').forEach(el=>{
    el.onclick=()=>{cBtcCol.push(el.dataset.v);document.getElementById('btcColInput').value='';renderBtcCol();dd.classList.remove('on')};
  });
  dd.classList.add('on');
}

document.getElementById('btcColInput').addEventListener('input',updateBtcColDd);
document.getElementById('btcColInput').addEventListener('focus',updateBtcColDd);
document.getElementById('btcColInput').addEventListener('blur',()=>_closeDdOnBlur('btcColDd'));

function updateGenreDd(){
  const dd=document.getElementById('genreDd');
  const q=document.getElementById('genreInput').value.toLowerCase();
  const freq={};games.forEach(g=>(g.genres||[]).forEach(x=>{if(x)freq[x]=(freq[x]||0)+1}));
  const opts=Object.keys(freq).sort().filter(g=>!cGenres.includes(g)&&(q===''||g.toLowerCase().includes(q)));
  if(!opts.length){dd.classList.remove('on');return}
  dd.innerHTML=opts.map(g=>`<div class="dd-opt" data-g="${esc(g)}">${esc(g)}<span class="dd-opt-count">${freq[g]}</span></div>`).join('');
  dd.classList.add('on');
  dd.querySelectorAll('.dd-opt').forEach(el=>{
    el.onclick=()=>{cGenres.push(el.dataset.g);document.getElementById('genreInput').value='';renderGenres();dd.classList.remove('on')};
  });
}
document.getElementById('genreInput').addEventListener('input',updateGenreDd);
document.getElementById('genreInput').addEventListener('focus',updateGenreDd);
document.getElementById('genreInput').addEventListener('blur',()=>_closeDdOnBlur('genreDd'));

// ── Tags dropdown (sorted by most-used) ──
function updateTagsDd(){
  const dd=document.getElementById('tagsDd');
  const q=(document.getElementById('tagsInput').value||'').toLowerCase().trim();
  const freq={};games.forEach(g=>(g.tags||[]).forEach(t=>{if(t)freq[t]=(freq[t]||0)+1}));
  const all=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]||a.localeCompare(b))
    .filter(t=>!cTags.includes(t)&&(!q||t.toLowerCase().includes(q)));
  if(!all.length){dd.classList.remove('on');return}
  dd.innerHTML=all.map(t=>`<div class="dd-opt" data-t="${esc(t)}">${esc(t)}<span class="dd-opt-count">${freq[t]}</span></div>`).join('');
  dd.classList.add('on');
  dd.querySelectorAll('.dd-opt').forEach(el=>{
    el.onclick=()=>{
      cTags.push(el.dataset.t);
      document.getElementById('tagsInput').value='';
      renderTags();
      dd.classList.remove('on');
    };
  });
}
document.getElementById('tagsInput').addEventListener('input',updateTagsDd);
document.getElementById('tagsInput').addEventListener('focus',updateTagsDd);
document.getElementById('tagsInput').addEventListener('blur',()=>_closeDdOnBlur('tagsDd'));
document.addEventListener('click',e=>{
  if(!e.target.closest('.genre-wrap')){document.getElementById('genreDd').classList.remove('on');document.getElementById('tagsDd').classList.remove('on');const bdd=document.getElementById('btcColDd');if(bdd)bdd.classList.remove('on');const mdd=document.getElementById('fColColDd');if(mdd)mdd.classList.remove('on');const idd=document.getElementById('colInlineDd');if(idd)idd.classList.remove('on');const bsd=document.getElementById('btcStoreDd');if(bsd)bsd.classList.remove('on');const fsd=document.getElementById('fColStoreDd');if(fsd)fsd.classList.remove('on');const std=document.getElementById('storeDd');if(std)std.classList.remove('on');}
  if(!e.target.closest('#devGWrap'))document.getElementById('devDd').classList.remove('on');
  if(!e.target.closest('#pubGWrap'))document.getElementById('pubDd').classList.remove('on');
});

// ══════════════════════════════════════════
//  DEV / PUB CHIP AUTOCOMPLETE
// ══════════════════════════════════════════
let cDev=[],cPub=[];
function updateDevDd(){
  const dd=document.getElementById('devDd');
  const q=(document.getElementById('fDev').value||'').toLowerCase().trim();
  const freq={};games.forEach(g=>{const v=g.developer;if(Array.isArray(v))v.forEach(s=>{if(s)freq[s]=(freq[s]||0)+1});else if(v&&typeof v==='string')freq[v]=(freq[v]||0)+1;});
  const all=Object.keys(freq).sort().filter(v=>!cDev.includes(v)&&(!q||v.toLowerCase().includes(q)));
  if(!all.length){dd.classList.remove('on');return}
  dd.innerHTML=all.map(v=>`<div class="dd-opt" data-v="${esc(v)}">${esc(v)}<span class="dd-opt-count">${freq[v]}</span></div>`).join('');
  dd.classList.add('on');
  dd.querySelectorAll('.dd-opt').forEach(el=>{
    el.onclick=()=>{cDev.push(el.dataset.v);document.getElementById('fDev').value='';renderDev();updateDevDd();};
  });
}
function updatePubDd(){
  const dd=document.getElementById('pubDd');
  const q=(document.getElementById('fPub').value||'').toLowerCase().trim();
  const freq={};games.forEach(g=>{const v=g.publisher;if(Array.isArray(v))v.forEach(s=>{if(s)freq[s]=(freq[s]||0)+1});else if(v&&typeof v==='string')freq[v]=(freq[v]||0)+1;});
  const all=Object.keys(freq).sort().filter(v=>!cPub.includes(v)&&(!q||v.toLowerCase().includes(q)));
  if(!all.length){dd.classList.remove('on');return}
  dd.innerHTML=all.map(v=>`<div class="dd-opt" data-v="${esc(v)}">${esc(v)}<span class="dd-opt-count">${freq[v]}</span></div>`).join('');
  dd.classList.add('on');
  dd.querySelectorAll('.dd-opt').forEach(el=>{
    el.onclick=()=>{cPub.push(el.dataset.v);document.getElementById('fPub').value='';renderPub();updatePubDd();};
  });
}
const renderDev=makeChip('devWrap','fDev',()=>cDev,v=>{cDev=v},updateDevDd);
const renderPub=makeChip('pubWrap','fPub',()=>cPub,v=>{cPub=v},updatePubDd);
document.getElementById('fDev').addEventListener('input',updateDevDd);
document.getElementById('fDev').addEventListener('focus',updateDevDd);
document.getElementById('fDev').addEventListener('blur',()=>_closeDdOnBlur('devDd'));
document.getElementById('fPub').addEventListener('input',updatePubDd);
document.getElementById('fPub').addEventListener('focus',updatePubDd);
document.getElementById('fPub').addEventListener('blur',()=>_closeDdOnBlur('pubDd'));

// ══════════════════════════════════════════
//  COVER PREVIEW
// ══════════════════════════════════════════
function setCoverPreview(url){
  const prev=document.getElementById('cprev');
  const hint=document.getElementById('coverHint');
  const ph=document.getElementById('cprevPlaceholder');
  if(!url){prev.style.display='none';if(ph)ph.style.display='';hint.style.display='none';return}
  prev.src=url;
  prev.onload=()=>{prev.style.display='block';if(ph)ph.style.display='none';hint.style.display='none'};
  prev.onerror=()=>{prev.style.display='none';if(ph)ph.style.display='';hint.style.display='block'};
}
function tryAutoFillCover(appId){
  const fc=document.getElementById('fCover');
  const isAutoUrl=!fc.value||
    fc.value.startsWith('https://cdn.cloudflare.steamstatic.com/steam/apps/')||
    fc.value.startsWith('https://shared.fastly.steamstatic.com/');
  if(isAutoUrl){const url=sc(appId);fc.value=url;setCoverPreview(url)}
  else setCoverPreview(fc.value);
}

// App ID duplicate check
function checkAppIdDup(){
  const id=document.getElementById('fAppId').value.trim();
  const errEl=document.getElementById('appIdErr');
  const inp=document.getElementById('fAppId');
  if(!id){errEl.classList.remove('on');inp.classList.remove('err');return false}
  const dup=games.find(g=>g.steamAppId&&String(g.steamAppId)===id&&g.id!==editId);
  if(dup){
    errEl.textContent=`"${dup.title}" already uses this App ID.`;
    errEl.classList.add('on');inp.classList.add('err');return true;
  }
  errEl.classList.remove('on');inp.classList.remove('err');
  return false;
}
// ══════════════════════════════════════════
//  STEAM AUTOFILL via Cloudflare Worker
// ══════════════════════════════════════════
const STEAM_WORKER='https://steam-proxy-cm26.carmine-migliore26.workers.dev';

// Parse a Steam date string ("13 Aug, 2026", "Aug 13 2026", "2026-08-13", etc.)
// Returns an ISO "YYYY-MM-DD" string if the input contains day+month+year, else null.
function parseSteamDateStr(raw){
  if(!raw)return null;
  const s=raw.trim();
  const M={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
    january:1,february:2,march:3,april:4,june:6,july:7,august:8,
    september:9,october:10,november:11,december:12};
  function iso(d,m,y){const yr=y<100?2000+y:y;return`${yr}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  let r;
  // 2026-08-13
  r=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(r)return iso(+r[3],+r[2],+r[1]);
  // 13/08/2026 or 13/08/26
  r=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);if(r)return iso(+r[1],+r[2],+r[3]);
  // 13 Aug, 2026 / 13 Aug 2026 / 13 August 2026 / 13 Aug 26
  r=s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{2,4})$/);
  if(r){const m=M[r[2].toLowerCase()];if(m)return iso(+r[1],m,+r[3]);}
  // Aug 13, 2026 / August 13, 2026 / Aug 13 2026
  r=s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if(r){const m=M[r[1].toLowerCase()];if(m)return iso(+r[2],m,+r[3]);}
  return null;
}

function steamStatus(msg,type){
  // type: 'loading' | 'ok' | 'err' | ''
  const el=document.getElementById('steamStatus');
  if(!msg){el.style.display='none';el.textContent='';return}
  el.style.display='block';
  el.textContent=msg;
  el.style.color=type==='ok'?'var(--green)':type==='err'?'var(--pink)':'var(--t3)';
}

// Returns appId string if input is a full Steam URL or a pure numeric ID, else null
function extractAppId(input){
  if(!input)return null;
  // Full Steam store URL
  const m=input.match(/store\.steampowered\.com\/app\/(\d+)/);
  if(m)return m[1];
  // Pure numeric App ID (at least 4 digits to avoid accidents)
  if(/^\d{4,}$/.test(input))return input;
  return null;
}

// fromUrl: when triggered by a URL paste, always overwrite the title from the API
async function steamAutoFill(appId,{fromUrl=false}={}){
  if(!appId)return;
  steamStatus('Fetching from Steam…','loading');
  try{
    const res=await fetch(`${STEAM_WORKER}/?appid=${appId}&_=${Date.now()}`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const json=await res.json();
    const entry=json[appId];
    if(!entry||!entry.success||!entry.data){steamStatus('No data found for this App ID.','err');return}
    const d=entry.data;
    const filled=[];

    // Title — always overwrite when triggered from a URL (slug mangling); else only if empty
    const titleEl=document.getElementById('fTitle');
    if(d.name&&(fromUrl||!titleEl.value.trim())){titleEl.value=d.name;filled.push('title')}

    // Cover — use header_image directly from the API (correct CDN + cache-busting timestamp)
    const fc=document.getElementById('fCover');
    const isSteamCover=!fc.value||
      fc.value.startsWith('https://cdn.cloudflare.steamstatic.com/steam/apps/')||
      fc.value.startsWith('https://shared.akamai.steamstatic.com/store_item_assets/')||
      fc.value.startsWith('https://shared.fastly.steamstatic.com/');
    if(d.header_image&&isSteamCover){fc.value=d.header_image;setCoverPreview(d.header_image);filled.push('cover')}

    // Store link — populate when triggered from App ID field (not URL, which already set it)
    const storeEl=document.getElementById('fStore');
    if(!fromUrl&&!storeEl.value.trim()){
      storeEl.value=`https://store.steampowered.com/app/${appId}/`;filled.push('store link');
    }

    // Genres — only accept ones already used elsewhere in the app; skip dupes
    if(d.genres&&d.genres.length){
      const incoming=d.genres.map(g=>g.description).filter(Boolean);
      const known=allGenres();
      const added=incoming.filter(g=>known.includes(g)&&!cGenres.includes(g));
      if(added.length){cGenres.push(...added);renderGenres();filled.push('genres')}
    }

    // Developer — push into chip array
    if(!cDev.length&&d.developers&&d.developers.length){
      d.developers.forEach(v=>{if(v&&!cDev.includes(v))cDev.push(v)});
      renderDev();filled.push('developer');
    }
    // Publisher — push into chip array
    if(!cPub.length&&d.publishers&&d.publishers.length){
      d.publishers.forEach(v=>{if(v&&!cPub.includes(v))cPub.push(v)});
      renderPub();filled.push('publisher');
    }

    // Release date
    const isTba=d.release_date&&d.release_date.coming_soon;
    const dateStr=d.release_date&&d.release_date.date;
    if(dateStr){
      const isoDate=parseSteamDateStr(dateStr);
      if(isoDate){
        setTbaState(false);
        const dateEl=document.getElementById('fDate');
        if(!dateEl.value){dateEl.value=isoDate;filled.push('release');}
      } else {
        setTbaState(true);
        const tbaEl=document.getElementById('fTbaText');
        if(!tbaEl.value.trim()){tbaEl.value=dateStr;filled.push('release');}
      }
    }

    // Price — comes in cents, convert to euros (2 decimals)
    const priceEl=document.getElementById('fPrice');
    if(!priceEl.value.trim()&&d.price_overview&&d.price_overview.initial!=null){
      priceEl.value=(d.price_overview.initial/100).toFixed(2);filled.push('price');
    } else if(!priceEl.value.trim()&&d.is_free){
      priceEl.value='0.00';filled.push('price');
    }

    // Type — game / dlc (auto from Steam)
    if(d.type&&(d.type==='game'||d.type==='dlc')){
      setGameType(d.type);
      // Auto-populate parentAppId from fullgame.appid
      if(d.type==='dlc'&&d.fullgame&&d.fullgame.appid){
        const parAppId=String(d.fullgame.appid);
        const parHidden=document.getElementById('fParentAppId');
        const parSearch=document.getElementById('fParentSearch');
        if(parHidden)parHidden.value=parAppId;
        if(parSearch){
          const par=games.find(x=>x.steamAppId&&String(x.steamAppId)===parAppId);
          parSearch.value=par?par.title:'App ID: '+parAppId;
        }
        filled.push('parentAppId');
      }
    }

    // Short description — plain text, populate textarea directly
    if(d.short_description){
      const _tmp=document.createElement('textarea');_tmp.innerHTML=d.short_description.replace(/<[^>]+>/g,'').trim();
      const plain=_tmp.value.trim();
      if(plain){
        const _fsd2=document.getElementById('fShortDesc');
        if(_fsd2&&!_fsd2.value.trim())_fsd2.value=plain;
        window._pendingShortDesc=plain;
      }
    }

    steamStatus(filled.length?`✓ Filled: ${filled.join(', ')}`:'✓ Fetched — fields already filled','ok');
  }catch(err){
    steamStatus(`Could not fetch Steam data (${err.message})`,'err');
  }
}

document.getElementById('fAppId').addEventListener('blur',()=>{
  const raw=document.getElementById('fAppId').value.trim();
  checkAppIdDup();
  const id=extractAppId(raw);
  if(id){
    // If user pasted a full URL into the App ID field, extract and clean it up
    if(raw.includes('store.steampowered.com'))document.getElementById('fAppId').value=id;
    steamAutoFill(id,{fromUrl:false});
  }
});
document.getElementById('fCover').addEventListener('blur',()=>{
  setCoverPreview(document.getElementById('fCover').value.trim());
});

// ══════════════════════════════════════════
//  TBA TOGGLE — button stays put, just swaps input
// ══════════════════════════════════════════
function setFetchState(skip){
  document.getElementById('fFetchInc').classList.toggle('on',!skip);
  document.getElementById('fFetchSkip').classList.toggle('on',skip);
}
document.getElementById('fFetchInc').addEventListener('click',()=>setFetchState(false));
document.getElementById('fFetchSkip').addEventListener('click',()=>setFetchState(true));

document.getElementById('fHotness').addEventListener('input',function(){
  this.value=this.value.replace(/[^0-9]/g,'');
  if(this.value!==''){
    let n=parseInt(this.value,10);
    if(n<1)n=1;
    if(n>100)n=100;
    this.value=n;
  }
});

function setTbaState(on){
  document.getElementById('tbaBtn').classList.toggle('on',on);
  document.getElementById('dateRow').style.display=on?'none':'grid';
  document.getElementById('tbaTxtRow').style.display=on?'grid':'none';
}
document.getElementById('tbaBtn').addEventListener('click',()=>setTbaState(true));
document.getElementById('tbaBtnOff').addEventListener('click',()=>setTbaState(false));

// DLCs don't track Play Status or Steam Collection — hides both from the
// collection fields whenever Type is DLC, on top of Steam Collection's
// existing platform-based visibility.
function _syncModalColDlcVisibility(){
  const isDlc=document.getElementById('fType').value==='dlc';
  const psRow=document.getElementById('fColPlayStatusRow');
  if(psRow)psRow.style.display=isDlc?'none':'';
  const stCol=document.getElementById('fColSteamSection');
  if(stCol)stCol.style.display=(_modalColPlat==='Steam'&&!isDlc)?'':'none';
}
function setGameType(v){
  document.getElementById('fType').value=v;
  document.getElementById('fTypeGame').classList.toggle('on',v!=='dlc');
  document.getElementById('fTypeDlc').classList.toggle('on',v==='dlc');
  const parRow=document.getElementById('parentAppIdRow');
  const parSearch=document.getElementById('fParentSearch');
  const parHidden=document.getElementById('fParentAppId');
  if(v==='dlc'){
    if(parRow)parRow.classList.remove('disabled');
    if(parSearch)parSearch.disabled=false;
  } else {
    if(parRow)parRow.classList.add('disabled');
    if(parSearch){parSearch.disabled=true;parSearch.value='';}
    if(parHidden)parHidden.value='';
  }
  _syncModalColDlcVisibility();
}
document.getElementById('fTypeGame').onclick=()=>setGameType('game');
document.getElementById('fTypeDlc').onclick=()=>setGameType('dlc');

// ══════════════════════════════════════════
//  STEAM STORE LINK PARSER
// ══════════════════════════════════════════
function parseStoreLink(url){
  const m=url.match(/store\.steampowered\.com\/app\/(\d+)\/([^\/\?#]*)/);
  if(!m)return null;
  const appId=m[1];
  const title=decodeURIComponent(m[2]).replace(/_/g,' ').replace(/[^A-Za-z0-9\s']/g,' ').replace(/\s+/g,' ').trim();
  return{appId,title};
}
document.getElementById('fStore').addEventListener('blur',()=>{
  const url=document.getElementById('fStore').value.trim();if(!url)return;
  const parsed=parseStoreLink(url);if(!parsed)return;
  const appIdEl=document.getElementById('fAppId');
  if(!appIdEl.value.trim())appIdEl.value=parsed.appId;
  checkAppIdDup();
  // Always fetch — title will be overwritten with the correct API name (fromUrl=true)
  steamAutoFill(parsed.appId,{fromUrl:true});
});

// ══════════════════════════════════════════
//  STEAM TITLE SEARCH (store link field)
// ══════════════════════════════════════════
const _searchStoreDd=debounce(async(term)=>{
  const dd=document.getElementById('storeDd');
  try{
    const res=await fetch(`${STEAM_WORKER}/?search=${encodeURIComponent(term)}&_=${Date.now()}`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const json=await res.json();
    const items=(json.items||[]).filter(it=>it.name).slice(0,8);
    if(!items.length){dd.classList.remove('on');return}
    dd.innerHTML=items.map(it=>`<div class="dd-opt dd-opt-steam" data-appid="${esc(it.id)}">${it.tiny_image?`<img class="dd-opt-thumb" src="${esc(it.tiny_image)}" alt="">`:''}<span>${esc(it.name)}</span></div>`).join('');
    dd.classList.add('on');
    dd.querySelectorAll('.dd-opt-steam').forEach(el=>{
      el.onclick=()=>{
        const appId=el.dataset.appid;
        document.getElementById('fAppId').value=appId;
        document.getElementById('fStore').value=`https://store.steampowered.com/app/${appId}/`;
        dd.classList.remove('on');
        checkAppIdDup();
        steamAutoFill(appId,{fromUrl:true});
      };
    });
  }catch(err){dd.classList.remove('on');}
},350);
document.getElementById('fStore').addEventListener('input',()=>{
  const raw=document.getElementById('fStore').value.trim();
  const dd=document.getElementById('storeDd');
  if(!raw||extractAppId(raw)||raw.length<2){dd.classList.remove('on');return}
  _searchStoreDd(raw);
});
document.getElementById('fStore').addEventListener('blur',()=>_closeDdOnBlur('storeDd'));

// ══════════════════════════════════════════
//  PRIORITY BUTTONS IN MODAL
// ══════════════════════════════════════════
function _setPriority(v){
  document.getElementById('fPriority').value=v;
  const btn=document.getElementById('prioBtn');
  const lbl=prioLabel(v);
  btn.className=`prio-btn ${prioClass(v)}`;
  btn.title=lbl;btn.setAttribute('aria-label',lbl+' priority');
}
// One pill instead of three buttons — click advances Low/Medium/High in order,
// wrapping around (matches the read-only cumulative fill: high = fully lit).
document.getElementById('prioBtn').addEventListener('click',()=>{
  const order=['low','medium','high'];
  const idx=order.indexOf(document.getElementById('fPriority').value);
  _setPriority(order[(idx+1+order.length)%order.length]);
});


// parentAppId autocomplete
(function(){
  const inp=document.getElementById('fParentSearch');
  const hidden=document.getElementById('fParentAppId');
  const dd=document.getElementById('parentDd');
  function showDd(q){
    const ql=q.toLowerCase();
    const matches=games.filter(g=>g.status==='bought'&&g.type!=='dlc'&&g.steamAppId&&(
      (g.title||'').toLowerCase().includes(ql)||String(g.steamAppId).includes(q)
    )).slice(0,12);
    if(!matches.length){dd.classList.remove('on');return}
    dd.innerHTML=matches.map(g=>`<div class="dd-opt" data-appid="${esc(String(g.steamAppId))}" data-title="${esc(g.title||'')}">${esc(g.title||'')} <span style="color:var(--t3);font-size:.65rem">${g.steamAppId}</span></div>`).join('');
    dd.querySelectorAll('.dd-opt').forEach(el=>{
      el.addEventListener('click',()=>{inp.value=el.dataset.title;hidden.value=el.dataset.appid;dd.classList.remove('on');});
    });
    dd.classList.add('on');
  }
  inp.addEventListener('input',()=>showDd(inp.value.trim()));
  inp.addEventListener('focus',()=>{if(inp.value.trim())showDd(inp.value.trim())});
  inp.addEventListener('blur',()=>_closeDdOnBlur('parentDd'));
  document.addEventListener('click',e=>{if(!e.target.closest('#parentAppIdRow'))dd.classList.remove('on')});
})();

// ══════════════════════════════════════════
//  PLATFORM HELPERS
// ══════════════════════════════════════════
function setPlatforms(vals){
  const arr=Array.isArray(vals)?vals:(vals||'').split(',').map(s=>s.trim()).filter(Boolean);
  document.querySelectorAll('#pcks input').forEach(cb=>{cb.checked=arr.length===0?cb.value==='Steam':arr.includes(cb.value)});
}
function getPlatforms(){return Array.from(document.querySelectorAll('#pcks input:checked')).map(cb=>cb.value)}

// ══════════════════════════════════════════
//  ADD / EDIT MODAL
// ══════════════════════════════════════════
function clearModal(){
  ['fTitle','fAppId','fDev','fPub','fPrice','fStore','fCover','fDate','fTbaText','fNoteTxt'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  // Pre-fill note date with today
  const nd=document.getElementById('fNoteDate');
  if(nd){const n=new Date();nd.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`}
  document.getElementById('fHotness').value='';
  _setPriority('medium');
  setGameType('game');
  const _fsd3=document.getElementById('fShortDesc');if(_fsd3)_fsd3.value='';
  const _ps=document.getElementById('fParentSearch');if(_ps)_ps.value='';
  const _ph=document.getElementById('fParentAppId');if(_ph)_ph.value='';
  setCoverPreview('');
  document.getElementById('appIdErr').classList.remove('on');
  document.getElementById('fAppId').classList.remove('err');
  _originalAppId='';
  setTbaState(false);
  setFetchState(false);
  cGenres=[];cTags=[];cDev=[];cPub=[];cModalCol=[];renderGenres();renderTags();renderDev();renderPub();renderModalCol();
  _modalNotes=[];renderModalNoteList();
  // Reset collection fields
  const fcs=document.getElementById('fColStore');if(fcs)fcs.value='';
  const fcsl=document.getElementById('fColStoreInput');if(fcsl)fcsl.value='';
  const fcc=document.getElementById('fColCost');if(fcc)fcc.value='';
  const fcd=document.getElementById('fColDate');
  if(fcd){const n=new Date();fcd.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`}
  const fcp=document.getElementById('fColPlayStatus');if(fcp){fcp.value='Unplayed';_syncModalPsBtn('Unplayed');}
  document.getElementById('modalColSection').style.display='none';
}
let _addPickOpen=false;
function openAdd(){
  const pop=document.getElementById('addPickPop');if(!pop)return;
  if(!_addPickOpen){
    const btn=document.getElementById('addBtn');
    const r=btn.getBoundingClientRect();
    pop.style.top=(r.bottom+6)+'px';
    pop.style.right=(window.innerWidth-r.right)+'px';
    pop.style.left='auto';
    pop.style.display='';
    _addPickOpen=true;
    history.pushState({addPickOpen:true},'','');
  } else {
    _closeAddPick();
  }
}
function _closeAddPick(){
  const pop=document.getElementById('addPickPop');
  if(pop)pop.style.display='none';
  if(_addPickOpen&&history.state&&history.state.addPickOpen)
    history.replaceState(null,'','');
  _addPickOpen=false;
}
function openAddWishlist(){
  _closeAddPick();editId=null;clearModal();
  document.getElementById('modalTitle').textContent='Add to Wishlist';
  document.getElementById('msave').textContent='Save to Wishlist';
  document.getElementById('modalColSection').style.display='none';
  const swRow=document.getElementById('steamWishlistRow');if(swRow)swRow.style.display='none';
  _modalAddType='wishlist';
  const mnSec=document.getElementById('modalNotesSection');if(mnSec)mnSec.style.display='';
  _pushModalHistory();
  document.getElementById('mov').classList.add('on');
}
function openAddCollection(){
  _closeAddPick();editId=null;clearModal();
  document.getElementById('modalTitle').textContent='Add to Collection';
  document.getElementById('msave').textContent='Save to Collection';
  const colSec=document.getElementById('modalColSection');
  if(colSec){
    colSec.style.display='';
    _modalColPlat='Steam';_renderModalColPlatPills();
    const fcd=document.getElementById('fColDate');
    if(fcd){const n=new Date();fcd.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`}
    _syncModalColDlcVisibility();
  }
  const swRow=document.getElementById('steamWishlistRow');if(swRow)swRow.style.display='none';
  _modalAddType='collection';
  const mnSec=document.getElementById('modalNotesSection');if(mnSec)mnSec.style.display='';
  _pushModalHistory();
  document.getElementById('mov').classList.add('on');
}
function _renderModalColPlatPills(){
  const wrap=document.getElementById('modalColPlatPills');if(!wrap)return;
  wrap.innerHTML=PLATFORM_ORDER.map(p=>{
    const sel=_modalColPlat===p;
    const sty=sel?` style="background:${platColor(p)};color:${platTextColor(p)};border-color:transparent"`:'';
    return`<button class="btc-plat-pill${sel?' selected':''}" data-plat="${esc(p)}"${sty}>${esc(p)}</button>`;
  }).join('');
  wrap.querySelectorAll('.btc-plat-pill').forEach(btn=>{
    btn.onclick=()=>_setModalColPlat(btn.dataset.plat);
  });
}
function _setModalColPlat(plat){
  _modalColPlat=plat;_renderModalColPlatPills();
  _syncModalColDlcVisibility();
  const lbl=document.getElementById('fColStoreInput');
  const inp=document.getElementById('fColStore');
  if(editId){
    // Load existing purchase data for this platform when editing
    const g=games.find(x=>x.id===editId);
    const p=g?gamePurchases(g).find(x=>x.platform===plat):null;
    if(p){
      if(lbl)lbl.value=p.store||'';
      if(inp)inp.value=p.store||'';
      const fcc=document.getElementById('fColCost');if(fcc)fcc.value=p.cost!==undefined&&p.cost!==''?parseFloat(p.cost).toFixed(2):'';
      const fcd=document.getElementById('fColDate');
      if(fcd){const _norm=normaliseDate(p.purchaseDate||'');fcd.value=/^\d{4}-\d{2}-\d{2}$/.test(_norm)?_norm:'';}
      const psVal=p.playStatus||'Unplayed';
      const fcp=document.getElementById('fColPlayStatus');if(fcp){fcp.value=psVal;_syncModalPsBtn(psVal);}
      cModalCol=[...(p.steamCollection||[])];renderModalCol();
    } else {
      if(lbl)lbl.value='';
      if(inp)inp.value='';
      const fcc=document.getElementById('fColCost');if(fcc)fcc.value='';
      const fcd=document.getElementById('fColDate');if(fcd){const n=new Date();fcd.value=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;}
      const fcp=document.getElementById('fColPlayStatus');if(fcp){fcp.value='Unplayed';_syncModalPsBtn('Unplayed');}
      cModalCol=[];renderModalCol();
    }
  } else {
    if(lbl)lbl.value='';
    if(inp)inp.value='';
  }
}
function _syncSteamWishlistBtn(){
  const btn=document.getElementById('steamWishlistToggle');if(!btn)return;
  btn.classList.toggle('accent',_modalSteamWishlist);
  btn.textContent=_modalSteamWishlist?'★ Also want on Steam':'☆ Also want on Steam';
}
function openEditFromCard(id){
  if(document.getElementById('panel').classList.contains('on')){
    _popSuppressed=true;
    closePanel();
    setTimeout(()=>{_popSuppressed=false;},400);
  }
  openEdit(id);
}
function openEdit(id){
  const g=games.find(x=>x.id===id);if(!g)return;
  editId=id;clearModal();
  document.getElementById('modalTitle').textContent=`Edit: ${esc(g.title)}`;
  document.getElementById('msave').textContent='Save changes';
  document.getElementById('fTitle').value=g.title||'';
  document.getElementById('fAppId').value=g.steamAppId||'';
  _originalAppId=g.steamAppId||'';
  cDev=[...(Array.isArray(g.developer)?g.developer:[])];
  cPub=[...(Array.isArray(g.publisher)?g.publisher:[])];
  renderDev();renderPub();
  document.getElementById('fPrice').value=g.price||'';
  _setPriority(g.priority||'medium');
  document.getElementById('fHotness').value=(g.hotness===null||g.hotness===undefined)?'':g.hotness;
  document.getElementById('fStore').value=g.storeLink||'';
  const _fsdEl=document.getElementById('fShortDesc');if(_fsdEl)_fsdEl.value=g.shortDescription||'';
  setGameType(g.type||'game');
  // Populate parentAppId for DLCs (setGameType already shows/hides the row)
  if((g.type||'game')==='dlc'&&g.parentAppId){
    const parHidden=document.getElementById('fParentAppId');
    const parSearch=document.getElementById('fParentSearch');
    if(parHidden)parHidden.value=g.parentAppId;
    const par=games.find(x=>x.steamAppId&&String(x.steamAppId)===String(g.parentAppId));
    if(parSearch)parSearch.value=par?par.title:g.parentAppId;
  }
  if(g.releaseDate&&/^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate)){
    setTbaState(false);document.getElementById('fDate').value=g.releaseDate;
  } else if(g.releaseDate){
    setTbaState(true);document.getElementById('fTbaText').value=g.releaseDate;
  } else {
    setTbaState(false);document.getElementById('fDate').value='';
  }
  setFetchState(!!g.skipGGFetch);
  const savedCover=g.cover||'';
  document.getElementById('fCover').value=savedCover;
  if(savedCover)setCoverPreview(savedCover);
  else if(g.steamAppId)tryAutoFillCover(g.steamAppId);
  cGenres=[...(g.genres||[])];cTags=[...(g.tags||[])];
  renderGenres();renderTags();
  // steamWishlist toggle — show only for bought games with no Steam purchase
  const swRow=document.getElementById('steamWishlistRow');
  if(swRow){
    const hasSteam=gamePurchases(g).some(p=>p.platform==='Steam');
    swRow.style.display=(g.status==='bought'&&!hasSteam)?'':'none';
    _modalSteamWishlist=!!g.steamWishlist;
    _syncSteamWishlistBtn();
  }
  // Load existing notes into modal note list
  const _editG=games.find(x=>x.id===editId);
  _modalNotes=_editG?(Array.isArray(_editG.notes)?[..._editG.notes]:(_editG.notes?[{id:nid(),date:todayStr(),text:_editG.notes}]:[])):[];
  renderModalNoteList();
  // Collection fields — show and populate when editing a bought game
  const colSec=document.getElementById('modalColSection');
  if(colSec&&g.status==='bought'){
    colSec.style.display='block';
    _modalColPlat=gamePurchases(g)[0]?.platform||'Steam';
    _renderModalColPlatPills();
    _syncModalColDlcVisibility();
    const p0=gamePurchases(g)[0]||{};
    const storeVal=p0.store||g.store||'';
    const fcs=document.getElementById('fColStore');if(fcs)fcs.value=storeVal;
    const fsInp=document.getElementById('fColStoreInput');if(fsInp)fsInp.value=storeVal;
    const fcc=document.getElementById('fColCost');if(fcc)fcc.value=p0.cost!==undefined?parseFloat(p0.cost).toFixed(2):(g.cost?parseFloat(g.cost).toFixed(2):'');
    const fcd=document.getElementById('fColDate');
    if(fcd){
      const _pd=p0.purchaseDate||g.purchaseDate||'';
      const _norm=normaliseDate(_pd);
      fcd.value=/^\d{4}-\d{2}-\d{2}$/.test(_norm)?_norm:'';
    }
    const psVal=p0.playStatus||g.playStatus||'Unplayed';
    const fcp=document.getElementById('fColPlayStatus');if(fcp){fcp.value=psVal;_syncModalPsBtn(psVal);}
    cModalCol=[...(p0.steamCollection||g.steamCollection||[])];renderModalCol();
  }
  // Notes section — only shown when editing
  const mnSec=document.getElementById('modalNotesSection');
  const mnList=document.getElementById('fNoteList');
  if(mnSec)mnSec.style.display='';
  renderModalNotes(g);
  _pushModalHistory();
  document.getElementById('mov').classList.add('on');
}
function renderModalNotes(g){
  const mnList=document.getElementById('fNoteList');
  if(!mnList)return;
  const notes=Array.isArray(g.notes)?g.notes:(g.notes?[{id:nid(),date:todayStr(),text:g.notes}]:[]);
  if(!notes.length){mnList.innerHTML='';return}
  mnList.innerHTML=[...notes].reverse().map(n=>`
    <div class="note-entry" data-nid="${esc(n.id)}">
      <div class="note-date">${esc(fmtDate(n.date)||n.date||'')}</div>
      <div class="note-text">${esc(n.text)}</div>
      <div class="note-edit-wrap" style="display:none">
        <div class="note-compose" style="margin-bottom:.25rem">
          <input type="date" class="note-compose-date note-edit-date">
          <textarea class="note-edit-area" style="display:block;margin-bottom:0;min-height:50px">${esc(n.text)}</textarea>
        </div>
      </div>
      <div class="note-actions">
        <button class="note-btn edit-btn">Edit</button>
        <button class="note-btn save save-btn" style="display:none">Save</button>
        <button class="note-btn del-btn del">Delete</button>
      </div>
    </div>`).join('');
  // Wire edit/save/delete buttons
  mnList.querySelectorAll('.note-entry').forEach(entry=>{
    const nidVal=entry.dataset.nid;
    const textEl=entry.querySelector('.note-text');
    const editWrap=entry.querySelector('.note-edit-wrap');
    const editArea=entry.querySelector('.note-edit-area');
    const editDateInp=entry.querySelector('.note-edit-date');
    const editBtn=entry.querySelector('.edit-btn');
    const saveBtn=entry.querySelector('.save-btn');
    const delBtn=entry.querySelector('.del-btn');
    const dateEl=entry.querySelector('.note-date');
    const dm=dateEl.textContent.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(editDateInp&&dm)editDateInp.value=`${dm[3]}-${dm[2]}-${dm[1]}`;
    editBtn.onclick=()=>{textEl.style.display='none';editWrap.style.display='block';editBtn.style.display='none';saveBtn.style.display=''};
    saveBtn.onclick=()=>{
      const g2=games.find(x=>x.id===editId);if(!g2)return;
      const arr=Array.isArray(g2.notes)?[...g2.notes]:(g2.notes?[{id:nid(),date:todayStr(),text:g2.notes}]:[]);
      const i=arr.findIndex(n=>n.id===nidVal);
      if(i>-1){arr[i].text=editArea.value.trim();if(editDateInp&&editDateInp.value)arr[i].date=fmtDate(editDateInp.value);}
      g2.notes=arr;renderModalNotes(g2);
    };
    delBtn.onclick=()=>{
      if(!confirm('Delete this note?'))return;
      const g2=games.find(x=>x.id===editId);if(!g2)return;
      const arr=(Array.isArray(g2.notes)?g2.notes:(g2.notes?[{id:nid(),date:todayStr(),text:g2.notes}]:[])).filter(n=>n.id!==nidVal);
      g2.notes=arr;renderModalNotes(g2);
    };
  });
}
function _rawCloseModal(){document.getElementById('mov').classList.remove('on');steamStatus('');['genreDd','tagsDd','devDd','pubDd','fColStoreDd'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('on')});document.querySelectorAll('.pick-dd.on').forEach(el=>el.classList.remove('on'));window._pendingShortDesc=null;}
function closeModal(){_rawCloseModal();_popModalHistory();}
// Modal notes: full note list with add/edit/delete (works in both add and edit mode)
let _modalNotes=[]; // in-memory note list for the open modal
function renderModalNoteList(){
  const list=document.getElementById('fNoteList');if(!list)return;
  list.innerHTML=[..._modalNotes].reverse().map(n=>`
    <div class="note-entry" data-nid="${esc(n.id)}">
      <div class="note-date">${esc(fmtDate(n.date)||n.date||'')}</div>
      <div class="note-text">${esc(n.text)}</div>
      <div class="note-edit-wrap" style="display:none">
        <div class="note-compose" style="margin-bottom:.25rem">
          <input type="date" class="note-compose-date note-edit-date">
          <textarea class="note-edit-area" style="display:block;margin-bottom:0;min-height:50px">${esc(n.text)}</textarea>
        </div>
      </div>
      <div class="note-actions">
        <button class="note-btn edit-btn">Edit</button>
        <button class="note-btn save save-btn" style="display:none">Save</button>
        <button class="note-btn del-btn del">Delete</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('.note-entry').forEach(el=>{
    const nid2=el.dataset.nid;
    const editWrap=el.querySelector('.note-edit-wrap');
    const editBtn=el.querySelector('.edit-btn');
    const saveBtn=el.querySelector('.save-btn');
    const delBtn=el.querySelector('.del-btn');
    const editDate=el.querySelector('.note-edit-date');
    const editArea=el.querySelector('.note-edit-area');
    editBtn.onclick=()=>{
      const n=_modalNotes.find(x=>x.id===nid2);
      if(editDate&&n){
        // Convert dd/mm/yyyy to yyyy-mm-dd for input
        const parts=n.date.split('/');
        editDate.value=parts.length===3?`${parts[2]}-${parts[1]}-${parts[0]}`:n.date;
      }
      editWrap.style.display='';editBtn.style.display='none';saveBtn.style.display='';
    };
    saveBtn.onclick=()=>{
      const idx=_modalNotes.findIndex(x=>x.id===nid2);if(idx<0)return;
      const nd=editDate?editDate.value:'';
      _modalNotes[idx]={..._modalNotes[idx],date:nd?fmtDate(nd):_modalNotes[idx].date,text:editArea?editArea.value.trim():_modalNotes[idx].text};
      renderModalNoteList();
    };
    delBtn.onclick=()=>{_modalNotes=_modalNotes.filter(x=>x.id!==nid2);renderModalNoteList();};
  });
}

(function(){
  const btn=document.getElementById('fNoteSaveBtn');
  if(!btn)return;
  btn.addEventListener('click',()=>{
    const txt=document.getElementById('fNoteTxt').value.trim();
    if(!txt)return;
    const nd=document.getElementById('fNoteDate').value;
    const noteDate=nd?fmtDate(nd):todayStr();
    _modalNotes.push({id:nid(),date:noteDate,text:txt});
    document.getElementById('fNoteTxt').value='';
    renderModalNoteList();
  });
})();
document.getElementById('addBtn').onclick=openAdd;
document.getElementById('addPickWishlist').onclick=openAddWishlist;
document.getElementById('addPickCollection').onclick=openAddCollection;
document.getElementById('steamWishlistToggle').onclick=()=>{_modalSteamWishlist=!_modalSteamWishlist;_syncSteamWishlistBtn();};
// Close picker on outside click
document.addEventListener('click',e=>{
  if(_addPickOpen&&!e.target.closest('#addPickPop')&&!e.target.closest('#addBtn')){_closeAddPick();}
});
document.getElementById('mcancel').onclick=()=>history.back();
document.getElementById('mov').onclick=e=>{if(e.target===e.currentTarget)history.back()};

document.getElementById('msave').onclick=()=>{
  const title=document.getElementById('fTitle').value.trim();
  if(!title){alert('Please enter a title.');return}
  if(document.getElementById('fType').value==='dlc'&&!document.getElementById('fParentAppId').value.trim()){showToast('Please select a base game for this DLC.','err');return}
  const _colSec=document.getElementById('modalColSection');
  if(_colSec&&_colSec.style.display!=='none'){
    if(!document.getElementById('fColStore').value){showToast('Please select a store.','err');return}
    if(!document.getElementById('fColCost').value.trim()){showToast('Please enter a cost.','err');return}
    if(!document.getElementById('fColDate').value){showToast('Please enter a purchase date.','err');return}
    const _stCol=document.getElementById('fColSteamSection');
    if(_stCol&&_stCol.style.display!=='none'&&!cModalCol.length){showToast('Please pick at least one Steam collection.','err');return}
  }
  const _appIdChanged=document.getElementById('fAppId').value.trim()!==_originalAppId;
  if(_appIdChanged&&checkAppIdDup()){showToast('Fix the duplicate App ID before saving.','err');return}
  const hotRaw=document.getElementById('fHotness').value.trim();
  const hotness=hotRaw===''?null:Math.min(100,Math.max(1,parseInt(hotRaw)||1));
  const appId=document.getElementById('fAppId').value.trim()||null;
  const isTba=document.getElementById('tbaBtn').classList.contains('on');
  const releaseDate=isTba?document.getElementById('fTbaText').value.trim():(document.getElementById('fDate').value.trim()?parseDate(document.getElementById('fDate').value.trim()):'');
  const coverVal=document.getElementById('fCover').value.trim();
  const data={
    title,steamAppId:appId,
    genres:[...cGenres],
    developer:[...cDev],
    publisher:[...cPub],
    releaseDate,
    price:document.getElementById('fPrice').value.trim(),
    priority:document.getElementById('fPriority').value,
    hotness,
    tags:[...cTags],
    cover:coverVal,
    storeLink:document.getElementById('fStore').value.trim(),
    type:document.getElementById('fType').value||'game',
    parentAppId:(()=>{const v=document.getElementById('fParentAppId').value.trim();return v||null})(),
    skipGGFetch:document.getElementById('fFetchSkip').classList.contains('on'),
  };
  // Attach shortDescription fetched from Steam API if available
  const _fsd=document.getElementById('fShortDesc');const _sdVal=_fsd?_fsd.value.trim():'';if(_sdVal){data.shortDescription=_sdVal;}else if(window._pendingShortDesc){data.shortDescription=window._pendingShortDesc;window._pendingShortDesc=null;}
  if(editId){
    const i=games.findIndex(x=>x.id===editId);
    if(i>-1){
        const colSec2=document.getElementById('modalColSection');
      const isColEdit=colSec2&&colSec2.style.display!=='none';
      const colFields=isColEdit?{
        store:document.getElementById('fColStore').value||'',
        cost:(()=>{const v=document.getElementById('fColCost').value.trim();return v!==''?parseFloat(v).toFixed(2):''})(  ),
        purchaseDate:fmtDate(document.getElementById('fColDate').value)||document.getElementById('fColDate').value||'',
        playStatus:document.getElementById('fColPlayStatus').value||'Unplayed',
        steamCollection:[...cModalCol],
      }:{};
      // Update purchases array when editing collection fields
      let updatedPurchases=gamePurchases(games[i]);
      if(isColEdit){
        updatedPurchases=[...updatedPurchases];
        const idx=updatedPurchases.findIndex(p=>p.platform===_modalColPlat);
        if(idx>-1){
          updatedPurchases[idx]={...updatedPurchases[idx],store:colFields.store,cost:colFields.cost,purchaseDate:colFields.purchaseDate,playStatus:colFields.playStatus};
          if(updatedPurchases[idx].platform==='Steam')updatedPurchases[idx].steamCollection=[...cModalCol];
        } else {
          updatedPurchases.push({platform:_modalColPlat,store:colFields.store,cost:colFields.cost,purchaseDate:colFields.purchaseDate,playStatus:colFields.playStatus,steamCollection:_modalColPlat==='Steam'?[...cModalCol]:[]});
        }
      }
      const preserved={notes:[..._modalNotes],status:games[i].status,added:games[i].added,removeNote:games[i].removeNote,myRating:games[i].myRating,myReview:games[i].myReview,myReviewDate:games[i].myReviewDate,shortDescription:data.shortDescription||games[i].shortDescription,steamWishlist:_modalSteamWishlist,...colFields,purchases:updatedPurchases};
      // parentAppId comes from data object, not preserved
      games[i]={...games[i],...data,...preserved};
    }
  } else {
    const initStatus=_modalAddType==='collection'?'bought':'wishlist';
    const newGame={...data,id:gid(),added:Date.now(),status:initStatus,notes:[]};
    // If adding to collection, build purchases array and sync legacy fields
    if(_modalAddType==='collection'){
      const _nStore=document.getElementById('fColStore').value||'';
      const _nCostRaw=document.getElementById('fColCost').value.trim();
      const _nCost=_nCostRaw!==''?parseFloat(_nCostRaw).toFixed(2):'';
      const _nDate=fmtDate(document.getElementById('fColDate').value)||document.getElementById('fColDate').value||'';
      const _nPlayStatus=document.getElementById('fColPlayStatus').value||'Unplayed';
      newGame.purchases=[{platform:_modalColPlat,store:_nStore,cost:_nCost,purchaseDate:_nDate,playStatus:_nPlayStatus,steamCollection:_modalColPlat==='Steam'?[...cModalCol]:[]}];
      syncLegacyFromPurchases(newGame);
    }
    // Attach modal note if any
    newGame.notes=[..._modalNotes];
    games.push(newGame);
  }
  const _savedId=editId||(games.length?games[games.length-1].id:null);
  save(_savedId);closeModal();dispatchRender();
};

// ══════════════════════════════════════════
//  BULK ACTIONS
// ══════════════════════════════════════════


// ══════════════════════════════════════════
//  COLLECTION MODE TOGGLE + FILTERS
// ══════════════════════════════════════════
function setAppMode(mode){
  appMode=mode;
  const isCol=mode==='collection';
  // Sync pill toggle
  const mWl=document.getElementById('modeWishlist');
  const mCo=document.getElementById('modeCollection');
  if(mWl)mWl.classList.toggle('on',!isCol);
  if(mCo)mCo.classList.toggle('on',isCol);
  updateQfabMode();
  // Toggle sidebar sections
  const fbarWl=document.getElementById('fbar-wl');
  const fbarCol=document.getElementById('fbar-col');
  if(fbarWl)fbarWl.style.display=isCol?'none':'';
  if(fbarCol)fbarCol.style.display=isCol?'':'none';
  // Toggle stat chips
  const sSt=document.getElementById('statChips');if(sSt)sSt.style.display=isCol?'none':'';
  const cSt=document.getElementById('cStatChips');if(cSt)cSt.style.display=isCol?'':'none';
  syncFbarBadges();
  // Reset scroll on view switch
  const _cont=document.getElementById('content');
  if(_cont)_cont.scrollTop=0;
  const _btt=document.getElementById('back-to-top');
  if(_btt)_btt.classList.remove('visible');
  // Render the right view
  if(isCol){renderCollection();}else{renderAll();}
}

function dispatchRender(){
  if(appMode==='collection')renderCollection();else renderAll();
}

// ══════════════════════════════════════════
//  URL HASH — persist view state across refreshes
// ══════════════════════════════════════════
function syncFilterBtns(){
  syncFbarBadges();
}
function saveHash(){
  if(typeof URLSearchParams==='undefined')return;
  const p=new URLSearchParams();
  if(appMode!=='wishlist')p.set('mode',appMode);
  if(vm!=='grid')p.set('view',vm);
  const si=document.getElementById('searchInput');
  if(si&&si.value)p.set('q',si.value);
  if(appMode==='collection'){
    const cs=document.getElementById('cSortSel');
    if(cs&&cs.value&&cs.value!=='steamcol')p.set('csort',cs.value);
    if(cfGenres.size){p.set('cg',[...cfGenres].join('|'));if(cfGenreLogic!=='or')p.set('cgl',cfGenreLogic);}
    if(cfPlayStatus.size)p.set('cps',[...cfPlayStatus].join('|'));
    if(cfPlats.size){p.set('cp',[...cfPlats].join('|'));if(cfPlatLogic!=='or')p.set('cpl',cfPlatLogic);if(cfPlatClosed)p.set('cpc','1');}
    if(cfStores.size)p.set('cst',[...cfStores].join('|'));
    if(cfYears.size)p.set('cy',[...cfYears].join('|'));
    if(cfMonths.size)p.set('cm',[...cfMonths].join('|'));
    if(cfSteamCol.size){p.set('cc',[...cfSteamCol].join('|'));if(cfSteamColLogic!=='or')p.set('ccl',cfSteamColLogic);}
  } else {
    const ss=document.getElementById('sortSel');
    if(ss&&ss.value&&ss.value!=='added')p.set('sort',ss.value);
    const gs=document.getElementById('groupSel');
    if(gs&&gs.value&&gs.value!=='none')p.set('group',gs.value);
    if(fGenres.size){p.set('g',[...fGenres].join('|'));if(fGenreLogic!=='or')p.set('gl',fGenreLogic);}
    if(fTags.size){p.set('t',[...fTags].join('|'));if(fTagLogic!=='or')p.set('tl',fTagLogic);}
    if(fPrios.size)p.set('pr',[...fPrios].join('|'));
    if(hrMinVal>0)p.set('hmin',hrMinVal);
    if(hrMaxVal<100)p.set('hmax',hrMaxVal);
  }
  const h=p.toString();
  history.replaceState(null,'',h?('#'+h):(location.pathname+location.search));
}

function restoreFromHash(){
  if(typeof URLSearchParams==='undefined')return;
  const h=location.hash.slice(1);
  if(!h)return;
  try{
    const p=new URLSearchParams(h);
    if(p.has('mode'))appMode=p.get('mode');
    if(p.has('view'))vm=p.get('view');
    if(p.has('q')){
      const val=p.get('q');
      const si=document.getElementById('searchInput');
      const sm=document.getElementById('searchInputMob');
      if(si){si.value=val;const sc=document.getElementById('searchClear');if(sc)sc.classList.toggle('visible',!!val);}
      if(sm){sm.value=val;const scm=document.getElementById('searchClearMob');if(scm)scm.classList.toggle('visible',!!val);}
    }
    if(p.has('sort')){const ss=document.getElementById('sortSel');if(ss){ss.value=p.get('sort');const o=FBAR_SORT_OPTS.find(x=>x.v===ss.value);const l=document.getElementById('sortSelLabel');if(o&&l)l.textContent=o.l;}}
    if(p.has('group')){const gs=document.getElementById('groupSel');if(gs){gs.value=p.get('group');const o=FBAR_GROUP_OPTS.find(x=>x.v===gs.value);const l=document.getElementById('groupSelLabel');if(o&&l)l.textContent=o.l;}}
    if(p.has('csort')){const cs=document.getElementById('cSortSel');if(cs){cs.value=p.get('csort');const o=FBAR_CSORT_OPTS.find(x=>x.v===cs.value);const l=document.getElementById('cSortSelLabel');if(o&&l)l.textContent=o.l;}}
    if(p.has('g'))fGenres=new Set(p.get('g').split('|').filter(Boolean));
    if(p.has('gl'))fGenreLogic=p.get('gl');
    if(p.has('t'))fTags=new Set(p.get('t').split('|').filter(Boolean));
    if(p.has('tl'))fTagLogic=p.get('tl');
    if(p.has('pr'))fPrios=new Set(p.get('pr').split('|').filter(Boolean));
    if(p.has('hmin'))hrMinVal=Math.max(0,Math.min(100,parseInt(p.get('hmin'))||0));
    if(p.has('hmax'))hrMaxVal=Math.max(0,Math.min(100,parseInt(p.get('hmax'))||100));
    document.querySelectorAll('.fbar-hot-chip').forEach(c=>c.classList.toggle('selected',parseInt(c.dataset.min)===hrMinVal&&parseInt(c.dataset.max)===hrMaxVal));
    if(p.has('cg'))cfGenres=new Set(p.get('cg').split('|').filter(Boolean));
    if(p.has('cgl'))cfGenreLogic=p.get('cgl');
    if(p.has('cps'))cfPlayStatus=new Set(p.get('cps').split('|').filter(Boolean));
    if(p.has('cp'))cfPlats=new Set(p.get('cp').split('|').filter(Boolean));
    if(p.has('cpl'))cfPlatLogic=p.get('cpl');
    if(p.has('cpc'))cfPlatClosed=true;
    // back-compat with links shared before the OR/AND + open/closed switch
    else if(p.has('cpm')){const m=p.get('cpm');cfPlatLogic=m==='all'?'and':'or';cfPlatClosed=m==='only';}
    else if(p.has('cpe')){cfPlatLogic='and';cfPlatClosed=true;}
    if(p.has('cst'))cfStores=new Set(p.get('cst').split('|').filter(Boolean));
    if(p.has('cy'))cfYears=new Set(p.get('cy').split('|').filter(Boolean));
    if(p.has('cm'))cfMonths=new Set(p.get('cm').split('|').filter(Boolean));
    if(p.has('cc'))cfSteamCol=new Set(p.get('cc').split('|').filter(Boolean));
    if(p.has('ccl'))cfSteamColLogic=p.get('ccl');
    if(appMode==='collection')setAppMode('collection');
    syncFilterBtns();
  }catch(e){}
}

// ══════════════════════════════════════════
//  DEBOUNCE HELPER
// ══════════════════════════════════════════
function debounce(fn,ms){let t;return function(...a){clearTimeout(t);t=setTimeout(()=>fn.apply(this,a),ms)};}

// Collection toggle buttons
document.getElementById('modeWishlist').onclick=()=>setAppMode('wishlist');
document.getElementById('modeCollection').onclick=()=>setAppMode('collection');

// Collection view mode toggle (grid/list) — handled via per-section toggles

// Collection sort
document.getElementById('cSortSel').onchange=renderCollection;


// Search also triggers collection render when in collection mode
// (search inputs already call dispatchRender via renderAll override below)

// ══════════════════════════════════════════
//  VIEW / FILTER / SORT
// ══════════════════════════════════════════
// ── FBAR SORT/GROUP CUSTOM PICKERS ───────────────────────────────────────────
const FBAR_SORT_OPTS=[
  {v:'hotness',l:'Hotness'},{v:'priority',l:'Priority'},{v:'title',l:'Title'},
  {v:'release-asc',l:'Release Date'},{v:'price-asc',l:'Price ↑'},
  {v:'price-desc',l:'Price ↓'},{v:'added',l:'Date Added'}
];
const FBAR_GROUP_OPTS=[
  {v:'none',l:'None'},{v:'priority',l:'Priority'},{v:'genre',l:'Genre'},
  {v:'platform',l:'Platform'},{v:'year',l:'Year'}
];
const FBAR_CSORT_OPTS=[
  {v:'steamcol',l:'Steam Collection'},{v:'title',l:'Title'},
  {v:'playstatus',l:'Play Status'},{v:'purchaseDate',l:'Purchase Date'},
  {v:'cost-desc',l:'Cost ↓'},{v:'cost-asc',l:'Cost ↑'}
];
function _initFbarPicker(hidId,btnId,lblId,ddId,opts){
  const hid=document.getElementById(hidId),btn=document.getElementById(btnId);
  const lbl=document.getElementById(lblId),dd=document.getElementById(ddId);
  if(!hid||!btn||!dd)return;
  function _sync(){const o=opts.find(x=>x.v===hid.value);if(lbl&&o)lbl.textContent=o.l;}
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    const wasOpen=dd.classList.contains('on');
    document.querySelectorAll('.pick-dd.on').forEach(el=>{el.classList.remove('on')});
    if(wasOpen)return;
    dd.innerHTML=opts.map(o=>`<div class="dd-opt${o.v===hid.value?' active':''}" data-v="${esc(o.v)}">${esc(o.l)}</div>`).join('');
    dd.querySelectorAll('.dd-opt').forEach(opt=>{
      opt.addEventListener('click',ev=>{
        ev.stopPropagation();hid.value=opt.dataset.v;_sync();
        dd.classList.remove('on');dispatchRender();
      });
    });
    dd.classList.add('on');
    _pickDdFlip(dd,btn);
  });
  _sync();
}
_initFbarPicker('sortSel','sortSelBtn','sortSelLabel','sortSelDd',FBAR_SORT_OPTS);
_initFbarPicker('groupSel','groupSelBtn','groupSelLabel','groupSelDd',FBAR_GROUP_OPTS);
_initFbarPicker('cSortSel','cSortSelBtn','cSortSelLabel','cSortSelDd',FBAR_CSORT_OPTS);
const _searchRender=debounce(()=>dispatchRender(),150);
document.getElementById('searchInput').oninput=function(){
  const mob=document.getElementById('searchInputMob');
  if(mob)mob.value=this.value;
  document.getElementById('searchClear').classList.toggle('visible',!!this.value);
  document.getElementById('searchClearMob').classList.toggle('visible',!!this.value);
  _searchRender();
};
document.getElementById('searchClear').onclick=function(){
  const si=document.getElementById('searchInput');
  const sm=document.getElementById('searchInputMob');
  si.value='';if(sm)sm.value='';
  this.classList.remove('visible');
  document.getElementById('searchClearMob').classList.remove('visible');
  si.focus();dispatchRender();
};
document.getElementById('searchClearMob').onclick=function(){
  const si=document.getElementById('searchInput');
  const sm=document.getElementById('searchInputMob');
  si.value='';if(sm)sm.value='';
  this.classList.remove('visible');
  document.getElementById('searchClear').classList.remove('visible');
  sm.focus();dispatchRender();
};
(function(){
  const mob=document.getElementById('searchInputMob');
  if(mob)mob.addEventListener('input',function(){
    document.getElementById('searchInput').value=this.value;
    document.getElementById('searchClear').classList.toggle('visible',!!this.value);
    document.getElementById('searchClearMob').classList.toggle('visible',!!this.value);
    _searchRender();
  });
})();

// ══════════════════════════════════════════
//  EXPORT / IMPORT
// ══════════════════════════════════════════
function doExport(){
  const b=new Blob([JSON.stringify(games,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);
  const now=new Date();
  const ts=now.toISOString().slice(0,10)+'-'+now.toTimeString().slice(0,8).replace(/:/g,'');
  a.download=`backlog-${ts}.json`;a.click();
}
function doImport(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json';
  inp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(Array.isArray(data)){
          const ex=new Set(games.map(g=>g.id));
          let added=0;
          data.forEach(g=>{if(!ex.has(g.id)){games.push(normalise({...g}));added++}});
          save();renderAll();
          showToast(`Imported ${added} new game${added!==1?'s':''} (${data.length-added} skipped).`);
        }
      }catch(err){showToast('Invalid JSON file.','err')}
    };
    r.readAsText(f);
  };
  inp.click();
}

// ══════════════════════════════════════════
//  HAMBURGER MENU + CALENDAR BUTTON
// ══════════════════════════════════════════
(function(){
  var btn=document.getElementById('hamburgerBtn');
  var menu=document.getElementById('hmenu');
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    document.querySelectorAll('.fpop.open').forEach(p=>p.classList.remove('open'));
    const opening=!menu.classList.contains('on');
    menu.classList.toggle('on');
    if(opening)history.pushState({hmenuOpen:true},'','');
  });
  document.addEventListener('click',function(e){
    if(!menu.contains(e.target)&&e.target!==btn&&menu.classList.contains('on')){
      menu.classList.remove('on');
      if(history.state&&history.state.hmenuOpen)history.replaceState(null,'','');
    }
  });
  function hm(fn){return function(){menu.classList.remove('on');if(history.state&&history.state.hmenuOpen)history.replaceState(null,'','');fn();}}
  document.getElementById('hmExpBtn').addEventListener('click',hm(doExport));
  document.getElementById('hmImpBtn').addEventListener('click',hm(doImport));
  document.getElementById('calBtn').addEventListener('click',openCalendar);
})();

// ══════════════════════════════════════════
//  DESKTOP HAMBURGER MENU
// ══════════════════════════════════════════
(function(){
  const btn=document.getElementById('dhBtn');
  const menu=document.getElementById('dhmenu');
  btn.addEventListener('click',e=>{
    e.stopPropagation();
    document.querySelectorAll('.fpop.open').forEach(p=>p.classList.remove('open'));
    menu.classList.toggle('on');
  });
  document.addEventListener('click',e=>{if(!menu.contains(e.target)&&e.target!==btn)menu.classList.remove('on');});
  function dh(fn){return function(){menu.classList.remove('on');fn();}}
  document.getElementById('dhViewGrid').addEventListener('click',dh(()=>{if(vm!=='grid'){vm='grid';dispatchRender();applyVm();}}));
  document.getElementById('dhViewList').addEventListener('click',dh(()=>{if(vm!=='list'){vm='list';dispatchRender();applyVm();}}));
  document.getElementById('dhMetaBtn').addEventListener('click',dh(async()=>{fetchMeta(true);showToast('Metadata refreshed.');}));
  document.getElementById('dhDatesBtn').addEventListener('click',dh(()=>runReleaseDateCheck()));
  document.getElementById('dhPriceBtn').addEventListener('click',dh(()=>openGgFetchModalIdle()));
  document.getElementById('dhSteamPriceBtn').addEventListener('click',dh(()=>runPriceLookup()));
  document.getElementById('dhSpendBtn').addEventListener('click',dh(()=>openSpendStats()));
  document.getElementById('dhExpBtn').addEventListener('click',dh(doExport));
  document.getElementById('dhImpBtn').addEventListener('click',dh(doImport));
})();

document.querySelectorAll('.app-version').forEach(el=>{el.textContent=`v${APP_VERSION}`;});


// ── SHORTCUTS POPOVER ──
(function(){
  const btn=document.getElementById('kbHelpBtn');
  const pop=document.getElementById('kbPop');
  if(!btn||!pop)return;
  // Position popover relative to button
  btn.addEventListener('mouseenter',()=>{
    const rect=btn.getBoundingClientRect();
    pop.style.top=(rect.bottom+6)+'px';
    pop.style.right=(window.innerWidth-rect.right)+'px';
    pop.style.position='fixed';
    pop.classList.add('open');
  });
  btn.addEventListener('mouseleave',e=>{if(!pop.matches(':hover'))pop.classList.remove('open')});
  pop.addEventListener('mouseleave',()=>pop.classList.remove('open'));
  document.addEventListener('click',e=>{if(!pop.contains(e.target)&&e.target!==btn)pop.classList.remove('open')});
})();


// ══════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ══════════════════════════════════════════
document.addEventListener('keydown',function(e){
  const tag=(e.target.tagName||'').toLowerCase();
  const inField=tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable;
  if(e.key==='Escape'){
    const openPop=document.querySelector('.fpop.open');
    if(openPop){openPop.classList.remove('open');return}
    if(document.getElementById('mov').classList.contains('on')){history.back();return}
    if(document.getElementById('btcov').classList.contains('on')){history.back();return}
    if(document.getElementById('rmov').classList.contains('on')){history.back();return}
    if(document.getElementById('riov').classList.contains('on')){history.back();return}
    if(document.getElementById('wlovConfirm').classList.contains('on')){history.back();return}
    if(document.getElementById('nuov').classList.contains('on')){history.back();return}
    if(document.getElementById('calOv').style.display!=='none'){closeCalendar();return}
    if(document.getElementById('panel').classList.contains('on')){closePanel();return}
    return;
  }
  if(e.ctrlKey||e.metaKey)return;
  // Panel navigation — works even in text fields to avoid blocking arrow keys globally
  if(!inField&&document.getElementById('panel').classList.contains('on')){
    if(e.key==='ArrowLeft'||e.key==='k'||e.key==='K'){e.preventDefault();navPanel(-1);return}
    if(e.key==='ArrowRight'||e.key==='j'||e.key==='J'){e.preventDefault();navPanel(1);return}
  }
  if(inField)return;
  if(e.key==='/'){e.preventDefault();const si=document.getElementById('searchInput');if(si){si.focus();si.select()}return}
  if(e.key==='a'||e.key==='A'||e.key==='n'||e.key==='N'){openAdd();return}
  if(e.key==='c'||e.key==='C'){openCalendar();return}
  if(e.key==='g'||e.key==='G'){vm='grid';dispatchRender();applyVm();return}
  if(e.key==='l'||e.key==='L'){vm='list';dispatchRender();applyVm();return}
  if(e.key==='w'||e.key==='W'){setAppMode('wishlist');return}
  if(e.key==='o'||e.key==='O'){setAppMode('collection');return}
});

// ══════════════════════════════════════════
//  RELEASE DATE CHECKER
// ══════════════════════════════════════════
(function(){
  const ov=document.getElementById('rdcov');
  const summary=document.getElementById('rdcSummary');
  const grid=document.getElementById('rdcGrid');
  const mainView=document.getElementById('rdcMain');
  const mainBar=document.getElementById('rdcMainBar');
  const confirmBar=document.getElementById('rdcConfirmBar');
  const confirmView=document.getElementById('rdcConfirm');
  const closeBtn=document.getElementById('rdcClose');
  const hideBtn=document.getElementById('rdcHide');
  const cancelBtn=document.getElementById('rdcCancel');
  const confirmContinueBtn=document.getElementById('rdcConfirmContinue');
  const confirmStopBtn=document.getElementById('rdcConfirmStop');
  const bubble=document.getElementById('rdcBubble');

  let _rdcRunning=false,_rdcAborted=false,_rdcHidden=false;

  function _showConfirm(){
    confirmView.style.display='';
    mainView.style.display='none';
    mainBar.style.display='none';
    confirmBar.style.display='flex';
  }
  function _hideConfirm(){
    confirmView.style.display='none';
    mainView.style.display='';
    mainBar.style.display='flex';
    confirmBar.style.display='none';
  }
  function _closeRdc(){
    ov.classList.remove('on');
    bubble.classList.remove('on');
    _rdcRunning=false;_rdcAborted=false;_rdcHidden=false;
    setMenuRunning(['hmRdcBtn','dhDatesBtn'],false);
    _hideConfirm();
    closeBtn.style.display='none';hideBtn.style.display='';cancelBtn.style.display='';
    if(history.state&&history.state.rdcovOpen)history.replaceState(null,'','');
  }
  function _rdcTryClose(){
    if(_rdcRunning){_showConfirm();return false}
    _closeRdc();
    return true;
  }
  function _hideRdc(){
    _rdcHidden=true;
    ov.classList.remove('on');
    bubble.classList.add('on');
  }
  function _showRdc(){
    _rdcHidden=false;
    bubble.classList.remove('on');
    ov.classList.add('on');
    history.pushState({rdcovOpen:true},'','');
  }
  closeBtn.onclick=()=>_closeRdc();
  hideBtn.onclick=()=>_hideRdc();
  cancelBtn.onclick=()=>_rdcTryClose();
  confirmContinueBtn.onclick=()=>_hideConfirm();
  confirmStopBtn.onclick=()=>{_rdcAborted=true;_hideConfirm();};
  bubble.onclick=()=>_showRdc();
  ov.addEventListener('click',e=>{if(e.target===ov)_rdcTryClose();});
  window._rdcTryClose=_rdcTryClose;
  window._rdcIsOpen=()=>ov.classList.contains('on')||_rdcHidden;

  // One result card — same .ggr-card component and colour convention as the
  // Live Prices grid: lime border for "changed", cyan for "confirmed same",
  // pink for "couldn't check". Clickable straight through to the side panel,
  // same delegated click/keydown handling as #ggFetchGrid.
  function rdcCardHTML(e){
    return`<div class="ggr-card ${e.updated?'ok':'skip'}" data-appid="${esc(String(e.appid))}" tabindex="0">
      <div class="ggr-title">${esc(e.title)}</div>
      <div class="ggr-price">
        <span class="ggr-price-lbl">Date</span>
        <span class="ggr-price-val">${esc(e.newRd||'(empty)')}</span>
        ${e.updated?'':'<span class="bdg ggr-badge flat">=</span>'}
      </div>
      ${e.updated?`<div class="ggr-lowtext">was ${esc(e.oldRd||'(empty)')}</div>`:''}
    </div>`;
  }
  function rdcErrCardHTML(title,appid){
    return`<div class="ggr-card err" data-appid="${esc(String(appid))}" tabindex="0">
      <div class="ggr-title">${esc(title)}</div>
      <div class="ggr-errline">No Steam data</div>
    </div>`;
  }
  function _rdcGoToGame(appid){
    const g=games.find(x=>String(x.steamAppId)===String(appid));
    if(!g)return;
    if(!_rdcRunning)bubble.textContent='Release\nDate';
    _hideRdc();
    openPanel(g.id);
  }
  grid.addEventListener('click',e=>{
    const card=e.target.closest('.ggr-card[data-appid]');
    if(card)_rdcGoToGame(card.dataset.appid);
  });
  grid.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const card=e.target.closest('.ggr-card[data-appid]');
    if(!card)return;
    e.preventDefault();
    _rdcGoToGame(card.dataset.appid);
  });

  // Parse a Steam release_date object into releaseDate (ISO date or display text)
  function parseSteamDate(relObj){
    if(!relObj)return{releaseDate:''};
    const raw=(relObj.date||'').trim();
    if(!raw)return{releaseDate:''};
    const iso=parseSteamDateStr(raw);
    if(iso)return{releaseDate:iso};
    return{releaseDate:raw};
  }

  const RDC_RUN_KEY='btb_rdc_run';

  async function run(){
    // Already running — bring the existing progress modal back into view
    // instead of starting a second, overlapping fetch loop over the same
    // targets (that used to be possible by just clicking this again).
    if(_rdcRunning){_showRdc();return}
    if(OFFLINE){showToast('Offline — cannot reach Steam.');return}
    const allTargets=games.filter(g=>g.steamAppId&&isGameUnreleased(g)&&!isCancelled(g));
    if(!allTargets.length){showToast('No unreleased Steam games found.');return}

    // If the OS killed a backgrounded run last time, doneSet holds what it
    // already got through — skip those instead of re-hitting Steam for
    // games we just checked. If everything currently eligible is already in
    // doneSet (nothing left to skip to), treat it as a fresh run instead.
    const resumeRun=_runLoad(RDC_RUN_KEY);
    const doneSet=new Set(resumeRun?resumeRun.done:[]);
    let targets=allTargets.filter(g=>!doneSet.has(String(g.steamAppId)));
    const resuming=doneSet.size>0&&targets.length>0;
    if(!targets.length){doneSet.clear();targets=allTargets;}
    const startedAt=resumeRun&&resuming?resumeRun.startedAt:Date.now();

    ov.classList.add('on');
    history.pushState({rdcovOpen:true},'','');
    grid.innerHTML='';
    summary.textContent=resuming
      ?`Resuming — ${doneSet.size} already checked, ${targets.length} left…`
      :`Checking ${targets.length} game${targets.length>1?'s':''}…`;
    _rdcRunning=true;_rdcAborted=false;_rdcHidden=false;
    setMenuRunning(['hmRdcBtn','dhDatesBtn'],true);
    _hideConfirm();
    closeBtn.style.display='none';hideBtn.style.display='';cancelBtn.style.display='';
    bubble.textContent=`0\n/${targets.length}`;

    let updated=0,unchanged=0,failed=0;

    for(let i=0;i<targets.length;i++){
      if(_rdcAborted)break;
      const g=targets[i];
      summary.textContent=`${i+1}/${targets.length} — ${g.title}`;
      bubble.textContent=`${i+1}\n/${targets.length}`;

      try{
        const res=await fetchWithTimeout(`${STEAM_WORKER}/?appid=${g.steamAppId}&_=${Date.now()}`);
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        const json=await res.json();
        const entry=json[g.steamAppId];
        if(!entry||!entry.success||!entry.data){
          grid.insertAdjacentHTML('beforeend',rdcErrCardHTML(g.title,g.steamAppId));
          failed++;continue;
        }

        const{releaseDate:newRd}=parseSteamDate(entry.data.release_date);
        const oldRd=String(g.releaseDate||'');

        if(newRd!==oldRd){
          const gg=games.find(x=>x.id===g.id);
          if(gg){gg.releaseDate=newRd;save(gg.id);}
          grid.insertAdjacentHTML('beforeend',rdcCardHTML({title:g.title,appid:g.steamAppId,oldRd,newRd,updated:true}));
          updated++;
        }else{
          grid.insertAdjacentHTML('beforeend',rdcCardHTML({title:g.title,appid:g.steamAppId,oldRd,newRd,updated:false}));
          unchanged++;
        }
      }catch(err){
        grid.insertAdjacentHTML('beforeend',rdcErrCardHTML(g.title,g.steamAppId));
        failed++;
      }

      doneSet.add(String(g.steamAppId));
      _runSave(RDC_RUN_KEY,{done:[...doneSet],startedAt});

      if(i<targets.length-1&&!_rdcAborted)await new Promise(r=>setTimeout(r,400));
    }

    _rdcRunning=false;
    setMenuRunning(['hmRdcBtn','dhDatesBtn'],false);
    _hideConfirm();
    closeBtn.style.display='';hideBtn.style.display='none';cancelBtn.style.display='none';
    if(_rdcAborted){
      summary.textContent=`Stopped — ${updated} updated, ${unchanged} unchanged${failed?`, ${failed} failed`:''}`;
      _runClear(RDC_RUN_KEY); // explicit Stop means don't offer to resume it later
    }else{
      summary.textContent=`Done — ${updated} updated, ${unchanged} unchanged${failed?`, ${failed} failed`:''}`;
      _runClear(RDC_RUN_KEY);
    }
    if(_rdcHidden){bubble.textContent='Done';}
    if(updated)dispatchRender();
  }

  window.runReleaseDateCheck=run;
  document.getElementById('hmRdcBtn').onclick=()=>{
    document.getElementById('hmenu').classList.remove('on');
    run();
  };
})();

// ══════════════════════════════════════════
//  PRICE LOOKUP
// ══════════════════════════════════════════
(function(){
  const ov=document.getElementById('plcov');
  const summary=document.getElementById('plcSummary');
  const log=document.getElementById('plcLog');
  const closeBtn=document.getElementById('plcClose');
  let _plcRunning=false,_plcAborted=false;
  function _closePlc(){
    ov.classList.remove('on');
    _plcRunning=false;_plcAborted=false;
    setMenuRunning(['hmSteamPriceBtn','dhSteamPriceBtn'],false);
    closeBtn.textContent='Close';
    if(history.state&&history.state.plcovOpen)history.replaceState(null,'','');
  }
  function _plcTryClose(){
    if(_plcRunning){if(!confirm('Stop the price lookup?'))return false;_plcAborted=true;}
    _closePlc();return true;
  }
  closeBtn.onclick=()=>_plcTryClose();
  ov.addEventListener('click',e=>{if(e.target===ov)_plcTryClose();});
  window._plcTryClose=_plcTryClose;
  window._plcIsOpen=()=>ov.classList.contains('on');
  function plcLog(msg,cls){
    const d=document.createElement('div');d.className=cls||'';d.textContent=msg;
    log.appendChild(d);log.scrollTop=log.scrollHeight;
  }
  async function run(){
    if(_plcRunning){ov.classList.add('on');return}
    if(OFFLINE){showToast('Offline — cannot reach Steam.');return}
    const targets=games.filter(g=>g.steamAppId&&(g.price==null||g.price==='')&&!isGameUnreleased(g)&&!isCancelled(g)&&!g.delisted);
    if(!targets.length){showToast('No released Steam games without a price found.');return}
    ov.classList.add('on');history.pushState({plcovOpen:true},'','');
    log.innerHTML='';summary.textContent=`Checking ${targets.length} game${targets.length>1?'s':''}…`;
    _plcRunning=true;_plcAborted=false;closeBtn.textContent='Cancel';
    setMenuRunning(['hmSteamPriceBtn','dhSteamPriceBtn'],true);
    let found=0,unavailable=0,failed=0;
    for(let i=0;i<targets.length;i++){
      if(_plcAborted)break;
      const g=targets[i];summary.textContent=`${i+1}/${targets.length} — ${g.title}`;
      try{
        const res=await fetchWithTimeout(`${STEAM_WORKER}/?appid=${g.steamAppId}&_=${Date.now()}`);
        if(!res.ok)throw new Error(`HTTP ${res.status}`);
        const json=await res.json();const entry=json[g.steamAppId];
        if(!entry||!entry.success||!entry.data){plcLog(`✗ ${g.title} — not found on Steam`,'plc-err');failed++;continue;}
        const d=entry.data;
        if(d.price_overview&&d.price_overview.initial!=null){
          const price=(d.price_overview.initial/100).toFixed(2);
          const gg=games.find(x=>x.id===g.id);if(gg){gg.price=price;save(gg.id);}
          plcLog(`✔ ${g.title}  €${price}`,'plc-ok');found++;
        }else if(d.is_free){
          const gg=games.find(x=>x.id===g.id);if(gg){gg.price='0.00';save(gg.id);}
          plcLog(`✔ ${g.title}  free-to-play`,'plc-ok');found++;
        }else{
          const gg=games.find(x=>x.id===g.id);if(gg){gg.delisted=true;save(gg.id);}
          plcLog(`— ${g.title}  delisted · no price available`,'plc-skip');unavailable++;
        }
      }catch(err){plcLog(`✗ ${g.title} — ${err.message}`,'plc-err');failed++;}
      if(i<targets.length-1&&!_plcAborted)await new Promise(r=>setTimeout(r,400));
    }
    _plcRunning=false;closeBtn.textContent='Close';
    setMenuRunning(['hmSteamPriceBtn','dhSteamPriceBtn'],false);
    if(_plcAborted){summary.textContent=`Stopped — ${found} found, ${unavailable} delisted${failed?`, ${failed} failed`:''}`;}
    else{summary.textContent=`Done — ${found} found, ${unavailable} delisted${failed?`, ${failed} failed`:''}`;}
    if(found)dispatchRender();
  }
  window.runPriceLookup=run;
})();

// ══════════════════════════════════════════
//  SPEND STATS
// ══════════════════════════════════════════
(function(){
  const ov=document.getElementById('ssov');
  if(!ov)return;
  const closeBtn=document.getElementById('ssClose');
  const kpisEl=document.getElementById('ssKpis');
  const emptyEl=document.getElementById('ssEmpty');
  const gridEl=document.getElementById('ssGrid');
  const trendCard=document.getElementById('ssTrendCard');
  const undatedEl=document.getElementById('ssUndatedNote');

  // Card collapse state — user overrides persist per card key; anything the
  // user hasn't touched falls back to a live default, which is "expanded"
  // for every card except Store on a mobile viewport (checked at open()
  // time, not cached, so rotating the device changes what "default" means).
  const SS_CARD_KEY='btb_ss_card_collapse';
  function getSsCardOverrides(){
    try{return JSON.parse(localStorage.getItem(SS_CARD_KEY))||{}}catch(e){return{}}
  }
  function setSsCardOverrides(o){localStorage.setItem(SS_CARD_KEY,JSON.stringify(o))}
  function ssCardDefaultCollapsed(key){return key==='store'&&window.innerWidth<=640;}
  function applyCardCollapse(){
    const overrides=getSsCardOverrides();
    gridEl.querySelectorAll('.ss-card[data-card]').forEach(card=>{
      const key=card.dataset.card;
      const body=card.querySelector('.ss-card-body');
      if(!body)return;
      const collapsed=key in overrides?overrides[key]:ssCardDefaultCollapsed(key);
      card.classList.toggle('collapsed',collapsed);
      body.style.maxHeight=collapsed?'0':'none';
    });
  }
  function toggleCard(card){
    const key=card.dataset.card;
    const body=card.querySelector('.ss-card-body');
    if(!body)return;
    const collapsing=!card.classList.contains('collapsed');
    if(collapsing){
      body.style.maxHeight=body.scrollHeight+'px';
      requestAnimationFrame(()=>{body.style.maxHeight='0';card.classList.add('collapsed');});
    } else {
      card.classList.remove('collapsed');
      body.style.maxHeight=body.scrollHeight+'px';
      body.addEventListener('transitionend',function te(){
        if(!card.classList.contains('collapsed'))body.style.maxHeight='none';
        body.removeEventListener('transitionend',te);
      });
    }
    const overrides=getSsCardOverrides();
    overrides[key]=collapsing;
    setSsCardOverrides(overrides);
  }
  gridEl.querySelectorAll('.ss-card[data-card]').forEach(card=>{
    const hdr=card.querySelector('.ss-card-hdr');
    if(hdr)hdr.addEventListener('click',()=>toggleCard(card));
  });

  // All four are Sets, toggled the same way on click — plain click, no
  // modifier key, works identically on desktop and mobile. Year/Month used
  // to be a single continuous from/to date range; that made multi-select
  // and un-selecting impossible (a range can't hold "2022 and 2025, not
  // 2023/2024") and made "every February across every year" inexpressible.
  // Sets, OR'd within each dimension and AND'd across dimensions, fix both.
  let ssPlats=new Set();
  let ssStores=new Set();
  let ssYears=new Set();
  let ssMonths=new Set(); // calendar month numbers 1-12

  // "View in Collection" replaces the Collection filters with whatever's
  // currently selected here — but that replacement is only for the
  // duration of this peek. The Collection filters that were active *before*
  // the button was clicked are snapshotted once and restored the next time
  // this dashboard is closed by any path other than the button itself
  // (X, backdrop click, mobile back). Clicking the button again while
  // already in that temporary state updates the preview without touching
  // the original snapshot, so however many times it's used, one real close
  // always gets you back to what you had.
  let _ssColSnapshot=null;
  function _snapshotCollectionFilters(){
    return{
      cfGenres:new Set(cfGenres),cfGenreLogic,
      cfPlayStatus:new Set(cfPlayStatus),
      cfPlats:new Set(cfPlats),cfPlatLogic,cfPlatClosed,
      cfSteamCol:new Set(cfSteamCol),cfSteamColLogic,
      cfStores:new Set(cfStores),cfYears:new Set(cfYears),cfMonths:new Set(cfMonths)
    };
  }
  function _applyCollectionFilters(s){
    cfGenres=s.cfGenres;cfGenreLogic=s.cfGenreLogic;
    cfPlayStatus=s.cfPlayStatus;
    cfPlats=s.cfPlats;cfPlatLogic=s.cfPlatLogic;cfPlatClosed=s.cfPlatClosed;
    cfSteamCol=s.cfSteamCol;cfSteamColLogic=s.cfSteamColLogic;
    cfStores=s.cfStores;cfYears=s.cfYears;cfMonths=s.cfMonths;
  }
  function _refreshCollectionFilterUi(){
    if(appMode==='collection')renderCollection();
    if(window.syncFbarBadges)window.syncFbarBadges();
    if(window._fbarRefreshAll)window._fbarRefreshAll();
    if(typeof saveHash==='function')saveHash();
  }

  function _closeSs(fromViewCollection){
    ov.classList.remove('on');
    ov.style.display='none';
    if(history.state&&history.state.ssovOpen)history.replaceState(null,'','');
    if(!fromViewCollection&&_ssColSnapshot){
      _applyCollectionFilters(_ssColSnapshot);
      _ssColSnapshot=null;
      _refreshCollectionFilterUi();
    }
  }
  window._ssTryClose=function(){_closeSs();return true;};
  window._ssIsOpen=()=>ov.classList.contains('on');
  closeBtn.onclick=()=>_closeSs();
  ov.addEventListener('click',e=>{if(e.target===ov)_closeSs();});

  const viewCollectionBtn=document.getElementById('ssViewCollection');
  if(viewCollectionBtn)viewCollectionBtn.onclick=()=>{
    if(!_ssColSnapshot)_ssColSnapshot=_snapshotCollectionFilters();
    cfGenres=new Set();cfPlayStatus=new Set();cfSteamCol=new Set();
    cfPlatLogic='or';cfPlatClosed=false;
    cfPlats=new Set(ssPlats);
    cfStores=new Set(ssStores);
    cfYears=new Set(ssYears);
    cfMonths=new Set([...ssMonths].map(m=>MONTH_NAMES[m-1]));
    setAppMode('collection');
    _refreshCollectionFilterUi();
    _closeSs(true);
  };

  // All money actually spent on owned games — one entry per platform purchase.
  function purchaseRecords(){
    const out=[];
    games.filter(g=>g.status==='bought').forEach(g=>{
      gamePurchases(g).forEach(p=>{
        out.push({
          game:g,
          platform:p.platform||'',
          store:p.store||'',
          cost:parseFloat(p.cost)||0,
          date:normaliseDate(p.purchaseDate)
        });
      });
    });
    return out;
  }

  // exclude lets a chart see every option for its OWN dimension while still
  // respecting the other three — e.g. the Platform chart filters by
  // store/year/month but not by platform, so every platform bar (selected
  // or not) stays visible and clickable instead of vanishing the moment
  // one platform is chosen.
  function filteredRecords(exclude){
    return purchaseRecords().filter(r=>{
      if(exclude!=='plat'&&ssPlats.size&&!ssPlats.has(r.platform))return false;
      if(exclude!=='store'&&ssStores.size&&!ssStores.has(r.store))return false;
      if(exclude!=='year'&&ssYears.size){
        const y=r.date?r.date.slice(0,4):'';
        if(!y||!ssYears.has(y))return false;
      }
      if(exclude!=='month'&&ssMonths.size){
        const m=r.date?parseInt(r.date.slice(5,7),10):0;
        if(!m||!ssMonths.has(m))return false;
      }
      return true;
    });
  }

  function monthLabel(ym){
    const[y,m]=ym.split('-');
    return`${MONTH_NAMES[parseInt(m,10)-1]} '${y.slice(2)}`;
  }

  function renderKpis(recs){
    const totalSpend=recs.reduce((s,r)=>s+r.cost,0);
    const gameIds=new Set(recs.map(r=>r.game.id));
    const avg=gameIds.size?totalSpend/gameIds.size:0;
    kpisEl.innerHTML=`
      <div class="ss-kpi"><div class="ss-kpi-label">Total spend</div><div class="ss-kpi-val">${fmtEur(totalSpend)}</div></div>
      <div class="ss-kpi"><div class="ss-kpi-label">Games</div><div class="ss-kpi-val">${gameIds.size}</div></div>
      <div class="ss-kpi"><div class="ss-kpi-label">Purchases</div><div class="ss-kpi-val">${recs.length}</div></div>
      <div class="ss-kpi"><div class="ss-kpi-label">Avg / game</div><div class="ss-kpi-val">${fmtEur(avg)}</div></div>
    `;
  }

  // Shared horizontal-bar renderer for the Platform/Store/Year/Month cards
  // — rows fade+rise in (staggered) and each bar's fill grows from 0 on a
  // rAF tick so filter changes always replay the animation, not just first
  // paint. key is the filter identity (toggled into a Set on click); label
  // is what's shown — they differ for the calendar-month chart (key: 1-12,
  // label: "Jan").
  function renderHBars(containerId,rows,onClick){
    const el=document.getElementById(containerId);
    const max=Math.max(...rows.map(r=>r.val),0.01);
    if(!rows.length){el.innerHTML=`<div class="ss-empty">No data.</div>`;return;}
    const clickable=!!onClick;
    el.innerHTML=rows.map((r,i)=>`
      <div class="ss-hbar-row${r.selected?' selected':''}${clickable?'':' static'}" data-key="${esc(r.key)}" style="animation-delay:${i*30}ms">
        <div class="ss-hbar-label">${esc(r.label)}</div>
        <div class="ss-hbar-track"><div class="ss-hbar-fill" data-w="${(r.val/max*100).toFixed(1)}" style="width:0;background:${r.color}"></div></div>
        <div class="ss-hbar-val">${fmtEur(r.val)}</div>
      </div>`).join('');
    requestAnimationFrame(()=>{
      el.querySelectorAll('.ss-hbar-fill').forEach(f=>{f.style.width=f.dataset.w+'%'});
    });
    if(clickable){
      el.querySelectorAll('.ss-hbar-row').forEach(row=>{
        row.addEventListener('click',()=>onClick(row.dataset.key));
      });
    }
  }

  // Calendar-month aggregate (Jan..Dec totals across every year) — a
  // seasonality view, distinct from the month-by-month trend line above
  // (which is per specific YYYY-MM instance, not per calendar position).
  // Clickable: toggles ssMonths, same as every other dimension.
  function renderCalMonthChart(recs){
    const byM={};
    recs.forEach(r=>{
      if(!r.date)return;
      const m=parseInt(r.date.slice(5,7),10);
      if(!m)return;
      byM[m]=(byM[m]||0)+r.cost;
    });
    const rows=Object.keys(byM).map(Number).sort((a,b)=>a-b)
      .map(m=>({key:String(m),label:MONTH_NAMES[m-1],val:byM[m],color:'var(--blue)',selected:ssMonths.has(m)}));
    renderHBars('ssCalMonthChart',rows,k=>{
      const m=parseInt(k,10);
      ssMonths.has(m)?ssMonths.delete(m):ssMonths.add(m);
      render();
    });
  }

  function renderMonthChart(recs){
    const wrap=document.getElementById('ssMonthChart');
    const byMonth={};
    recs.forEach(r=>{
      if(!r.date)return;
      const ym=r.date.slice(0,7);
      if(!/^\d{4}-\d{2}$/.test(ym))return;
      byMonth[ym]=(byMonth[ym]||0)+r.cost;
    });
    const months=Object.keys(byMonth).sort();
    // A trend needs at least two points — one dated month is just a dot in
    // an otherwise empty card, so drop the whole card rather than force it.
    if(months.length<=1){
      trendCard.style.display='none';
      return;
    }
    trendCard.style.display='';
    const undated=recs.filter(r=>!r.date).length;
    undatedEl.style.display=undated?'block':'none';
    undatedEl.textContent=undated?`${undated} purchase${undated>1?'s':''} without a date excluded from this chart.`:'';

    // viewBox width = the container's actual rendered width, so the SVG
    // never needs non-uniform scaling to fill it — preserveAspectRatio
    // "none" against a fixed 1000-wide viewBox stretched axis-label text
    // into illegible slivers on narrow (mobile) containers.
    const W=Math.max(wrap.clientWidth,280),H=220,padL=8,padR=8,padT=16,padB=26;
    const plotW=W-padL-padR,plotH=H-padT-padB;
    const max=Math.max(...months.map(ym=>byMonth[ym]),0.01);
    const stepX=months.length>1?plotW/(months.length-1):0;
    const pts=months.map((ym,i)=>({
      x:padL+(months.length>1?i*stepX:plotW/2),
      y:padT+plotH-(byMonth[ym]/max*plotH),
      ym,val:byMonth[ym]
    }));
    const pathD=pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
    const baseY=(padT+plotH).toFixed(1);
    const areaD=`${pathD} L${pts[pts.length-1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z`;
    const labelEvery=Math.max(1,Math.ceil(months.length/8));
    const dotsHtml=pts.map((p,i)=>{
      const show=i%labelEvery===0||i===pts.length-1;
      return`<circle class="ss-line-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" data-i="${i}" style="animation-delay:${.3+i*.02}s"></circle>
        <rect class="ss-line-hit" x="${(p.x-14).toFixed(1)}" y="${padT}" width="28" height="${plotH}" data-i="${i}" tabindex="0"></rect>
        ${show?`<text class="ss-line-axis-label" x="${p.x.toFixed(1)}" y="${H-6}" text-anchor="middle">${monthLabel(p.ym)}</text>`:''}`;
    }).join('');

    wrap.innerHTML=`
      <svg viewBox="0 0 ${W} ${H}">
        <path class="ss-line-area" d="${areaD}"></path>
        <path class="ss-line-path" id="ssLinePathEl" d="${pathD}"></path>
        ${dotsHtml}
        <line class="ss-line-crosshair" id="ssCrosshair" x1="0" y1="${padT}" x2="0" y2="${padT+plotH}"></line>
      </svg>
      <div class="ss-line-tip" id="ssLineTip"></div>
    `;

    // Draw the line in via stroke-dashoffset rather than snapping to its
    // final path — the one animation that needs JS (CSS can't measure path
    // length), everything else on this chart is a plain CSS keyframe.
    const pathEl=document.getElementById('ssLinePathEl');
    const len=pathEl.getTotalLength();
    pathEl.style.strokeDasharray=len;
    pathEl.style.strokeDashoffset=len;
    requestAnimationFrame(()=>{
      pathEl.style.transition='stroke-dashoffset .6s ease-out';
      pathEl.style.strokeDashoffset='0';
    });

    const tip=document.getElementById('ssLineTip');
    const crosshair=document.getElementById('ssCrosshair');
    const svgEl=wrap.querySelector('svg');
    wrap.querySelectorAll('.ss-line-hit').forEach(hit=>{
      const i=parseInt(hit.dataset.i,10);
      const p=pts[i];
      function activate(){
        const rect=svgEl.getBoundingClientRect();
        const sx=rect.width/W,sy=rect.height/H;
        crosshair.setAttribute('x1',p.x);crosshair.setAttribute('x2',p.x);
        crosshair.style.opacity='1';
        tip.innerHTML=`<b>${fmtEur(p.val)}</b> · ${monthLabel(p.ym)}`;
        tip.style.left=(p.x*sx)+'px';
        tip.style.top=(p.y*sy)+'px';
        tip.classList.add('on');
        wrap.querySelectorAll('.ss-line-dot').forEach(d=>d.classList.remove('hover'));
        wrap.querySelector(`.ss-line-dot[data-i="${i}"]`).classList.add('hover');
      }
      // Hover only — no click. This chart already reflects every active
      // filter (it's built from the full, non-excluded record set), so a
      // point on it is a consequence of the other charts' selections, not
      // its own filter to set.
      hit.addEventListener('pointerenter',activate);
      hit.addEventListener('focus',activate);
    });
    wrap.addEventListener('pointerleave',()=>{
      crosshair.style.opacity='0';
      tip.classList.remove('on');
      wrap.querySelectorAll('.ss-line-dot').forEach(d=>d.classList.remove('hover'));
    });
  }

  function render(){
    // Genuinely nothing to show (no purchases at all, unrelated to filters)
    // vs. the current filter combination happening to match zero records
    // are different states — only the former hides the whole dashboard.
    // The latter keeps every chart rendering from its own exclude-self
    // data, so the bars you'd click to back out of the combination stay
    // visible and clickable instead of vanishing along with everything else.
    if(!purchaseRecords().length){
      emptyEl.textContent='No purchases in your collection yet.';
      emptyEl.style.display='block';
      kpisEl.style.display='none';
      gridEl.style.display='none';
      return;
    }
    kpisEl.style.display='';
    gridEl.style.display='grid';

    const recs=filteredRecords();
    renderKpis(recs);
    emptyEl.textContent='No purchases match this combination — click a highlighted bar below to deselect it.';
    emptyEl.style.display=recs.length?'none':'block';

    const byPlat={};
    filteredRecords('plat').forEach(r=>{const k=r.platform||'—';byPlat[k]=(byPlat[k]||0)+r.cost;});
    const platRows=Object.keys(byPlat).sort((a,b)=>byPlat[b]-byPlat[a])
      .map(k=>({key:k,label:k,val:byPlat[k],color:platColor(k),selected:ssPlats.has(k)}));
    renderHBars('ssPlatChart',platRows,v=>{
      ssPlats.has(v)?ssPlats.delete(v):ssPlats.add(v);
      render();
    });

    const byStore={};
    filteredRecords('store').forEach(r=>{const k=r.store||'—';byStore[k]=(byStore[k]||0)+r.cost;});
    const storeRows=Object.keys(byStore).sort((a,b)=>byStore[b]-byStore[a])
      .map(k=>({key:k,label:k,val:byStore[k],color:'var(--indigo)',selected:ssStores.has(k)}));
    renderHBars('ssStoreChart',storeRows,v=>{
      ssStores.has(v)?ssStores.delete(v):ssStores.add(v);
      render();
    });

    const byYear={};
    filteredRecords('year').forEach(r=>{
      if(!r.date)return;
      const y=r.date.slice(0,4);
      if(!/^\d{4}$/.test(y))return;
      byYear[y]=(byYear[y]||0)+r.cost;
    });
    const yearRows=Object.keys(byYear).sort((a,b)=>b.localeCompare(a)) // newest first
      .map(y=>({key:y,label:y,val:byYear[y],color:'var(--blue)',selected:ssYears.has(y)}));
    renderHBars('ssYearChart',yearRows,y=>{
      ssYears.has(y)?ssYears.delete(y):ssYears.add(y);
      render();
    });

    renderMonthChart(recs);
    renderCalMonthChart(filteredRecords('month'));
  }

  document.getElementById('ssClearFilters').onclick=()=>{
    ssPlats=new Set();ssStores=new Set();ssYears=new Set();ssMonths=new Set();render();
  };

  function open(){
    ssPlats=new Set();ssStores=new Set();ssYears=new Set();ssMonths=new Set();
    ov.classList.add('on');
    ov.style.display='flex';
    history.pushState({ssovOpen:true},'','');
    applyCardCollapse();
    render();
  }

  window.openSpendStats=open;
  document.getElementById('hmSpendBtn').onclick=()=>{
    document.getElementById('hmenu').classList.remove('on');
    open();
  };
})();

// ══════════════════════════════════════════
//  TRADE KEYS
// ══════════════════════════════════════════
(function(){
  const ov=document.getElementById('tkov');
  if(!ov)return;
  const closeBtn=document.getElementById('tkClose');
  const copyBtn=document.getElementById('tkCopy');
  const summaryEl=document.getElementById('tkSummary');
  const textEl=document.getElementById('tkText');

  function steamUrlFor(g){
    return g.storeLink||(g.steamAppId?`https://store.steampowered.com/app/${g.steamAppId}/`:`https://store.steampowered.com/search/?term=${encodeURIComponent(g.title||'')}`);
  }
  function buildMarkdown(){
    return games.filter(g=>g.key&&g.key.length)
      .sort((a,b)=>(a.title||'').localeCompare(b.title||''))
      .map(g=>`[${g.title}](${steamUrlFor(g)})`)
      .join('\n');
  }

  function _closeTk(){
    ov.classList.remove('on');
    if(history.state&&history.state.tkovOpen)history.replaceState(null,'','');
  }
  window._tkTryClose=function(){_closeTk();return true;};
  window._tkIsOpen=()=>ov.classList.contains('on');
  closeBtn.onclick=_closeTk;
  ov.addEventListener('click',e=>{if(e.target===ov)_closeTk();});

  async function copyText(text){
    try{await navigator.clipboard.writeText(text);return true}
    catch(e){return false}
  }

  async function open(){
    const md=buildMarkdown();
    const n=md?md.split('\n').length:0;
    if(!n){showToast('No games with a trade key set.');return}
    textEl.value=md;
    const ok=await copyText(md);
    summaryEl.textContent=ok
      ?`${n} trade key${n>1?'s':''} copied to clipboard — ready to paste.`
      :`${n} trade key${n>1?'s':''} — clipboard copy failed, use the Copy button below.`;
    showToast(ok?`Copied ${n} trade key${n>1?'s':''}`:'Could not copy — text ready below');
    ov.classList.add('on');
    history.pushState({tkovOpen:true},'','');
    textEl.focus();textEl.select();
  }

  copyBtn.onclick=async()=>{
    const ok=await copyText(textEl.value);
    showToast(ok?'Copied to clipboard':'Could not copy to clipboard');
  };

  window.openTradeKeys=open;
  [['hmTradeKeysBtn','hmenu'],['dhTradeKeysBtn','dhmenu']].forEach(([btnId,menuId])=>{
    const btn=document.getElementById(btnId);
    if(!btn)return;
    btn.onclick=()=>{
      document.getElementById(menuId).classList.remove('on');
      open();
    };
  });
})();

// ══════════════════════════════════════════
//  NEXT UP PICKER — random pick from whatever the
//  Collection filters currently show (no picker-owned
//  weighting; narrowing the pool is the filter bar's job)
// ══════════════════════════════════════════
(function(){
  const ov=document.getElementById('nuov');
  if(!ov)return;
  const stage=document.getElementById('nuStage');
  const sub=document.getElementById('nuSub');
  const closeBtn=document.getElementById('nuClose');
  const rerollBtn=document.getElementById('nuReroll');
  let _pool=[];
  let _timer=null;
  let _lastId=null;

  function pool(){
    // Collection games under the active filters, minus DLC already
    // shown nested under their parent — those aren't standalone picks.
    return collectionFiltered().filter(g=>!(g.type==='dlc'&&findParentGame(g)));
  }

  function faceHTML(g){
    const coverUrl=g.cover||(g.steamAppId?sc(g.steamAppId):'');
    const cImg=coverUrl?`<img src="${esc(coverUrl)}" alt="" onerror="this.style.display='none';this.previousElementSibling.style.display='flex'">`:'';
    const phStyle=coverUrl?'style="display:none"':'';
    return`<div class="nu-shuffle-face"><div class="cc"><div class="cph" ${phStyle}>🎮</div>${cImg}</div></div><div class="ct nu-shuffle-title">${esc(g.title||'')}</div>`;
  }

  function renderEmpty(){
    sub.textContent='';
    stage.innerHTML=`<div class="nu-empty">No games match your current Collection filters — adjust them in the filter bar and try again.</div>`;
    rerollBtn.style.display='none';
  }

  function shuffle(ticks,onDone){
    let i=0;
    (function tick(){
      stage.innerHTML=faceHTML(_pool[Math.floor(Math.random()*_pool.length)]);
      i++;
      if(i<ticks){_timer=setTimeout(tick,50+260*Math.pow(i/ticks,2));}
      else onDone();
    })();
  }

  function land(){
    let pick=_pool[Math.floor(Math.random()*_pool.length)];
    if(_pool.length>1&&pick.id===_lastId){
      pick=_pool[(_pool.findIndex(g=>g.id===pick.id)+1)%_pool.length];
    }
    _lastId=pick.id;
    stage.innerHTML=`<div class="gg nu-result">${colCardHTML(pick)}</div>`;
    const card=stage.querySelector('.gc');
    const go=()=>{_closeNu();openPanel(pick.id);};
    card.addEventListener('click',go);
    card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')go();});
    rerollBtn.style.display=_pool.length>1?'':'none';
  }

  function run(ticks){
    rerollBtn.style.display='none';
    shuffle(ticks,land);
  }

  function _closeNu(){
    clearTimeout(_timer);_timer=null;
    ov.classList.remove('on');
    if(history.state&&history.state.nuovOpen)history.replaceState(null,'','');
  }
  window._nuTryClose=function(){_closeNu();return true;};
  window._nuIsOpen=()=>ov.classList.contains('on');
  closeBtn.onclick=_closeNu;
  ov.addEventListener('click',e=>{if(e.target===ov)_closeNu();});

  function open(){
    _pool=pool();
    _lastId=null;
    ov.classList.add('on');
    history.pushState({nuovOpen:true},'','');
    if(!_pool.length){renderEmpty();return;}
    sub.textContent=`Choosing from ${_pool.length} game${_pool.length!==1?'s':''} matching your current Collection filters`;
    run(12+Math.floor(Math.random()*4));
  }

  rerollBtn.onclick=()=>{if(_pool.length)run(7+Math.floor(Math.random()*3));};

  window.openNextUp=open;
  [['hmNextUpBtn','hmenu'],['dhNextUpBtn','dhmenu']].forEach(([btnId,menuId])=>{
    const btn=document.getElementById(btnId);
    if(!btn)return;
    btn.onclick=()=>{
      document.getElementById(menuId).classList.remove('on');
      open();
    };
  });
})();

// ══════════════════════════════════════════
//  RESUMABLE BACKGROUND RUNS
//  A backgrounded PWA can get its page killed by the OS at any time — there's
//  no API to prevent or even reliably detect that in advance — so a long
//  batched fetch loop (Live Prices, Release Date Check) can lose all of its
//  in-memory progress mid-run. Each such loop persists its remaining work to
//  localStorage as it goes, so the next load can pick up where it left off
//  instead of silently redoing (and for Live Prices, re-billing against the
//  shared hourly rate limit) work that already happened.
// ══════════════════════════════════════════
const RUN_RESUME_MAX_AGE_MS=6*60*60*1000; // ignore/discard a run left dangling longer than this
function _runSave(key,state){try{localStorage.setItem(key,JSON.stringify(state))}catch(e){}}
function _runLoad(key){
  try{
    const s=localStorage.getItem(key);if(!s)return null;
    const state=JSON.parse(s);
    if(!state||!state.startedAt||Date.now()-state.startedAt>RUN_RESUME_MAX_AGE_MS){localStorage.removeItem(key);return null}
    return state;
  }catch(e){return null}
}
function _runClear(key){try{localStorage.removeItem(key)}catch(e){}}

// ══════════════════════════════════════════
//  GG.DEALS LIVE PRICES
// ══════════════════════════════════════════
const GG_RUN_KEY='btb_gg_run';
let _ggFetchCancelled=false;
let _ggFetchHidden=false;
let _ggFetchRunning=false;
// True while openGgFetchModalIdle's getLatestFetchDiffs call is in flight.
// Refresh Now also waits on this — mainly so a run doesn't start and
// immediately overwrite the "last results" grid while it's still being
// populated. The correctness-critical gate is _savedPricesReady below.
let _ggIdleLoading=false;

function _showGgConfirm(){
  document.getElementById('ggFetchConfirm').style.display='';
  document.getElementById('ggFetchMain').style.display='none';
  document.getElementById('ggFetchMainBar').style.display='none';
  document.getElementById('ggFetchConfirmBar').style.display='flex';
}
function _hideGgConfirm(){
  document.getElementById('ggFetchConfirm').style.display='none';
  document.getElementById('ggFetchMain').style.display='';
  document.getElementById('ggFetchMainBar').style.display='flex';
  document.getElementById('ggFetchConfirmBar').style.display='none';
}
function _ggFetchTryClose(){
  if(_ggFetchRunning){_showGgConfirm();return false}
  _closeGgFetchModal();
  return true;
}

// Whether ggPriceCache reflects the sheet yet — the actual dependency for
// correct live-price diffs (runGGDealsFetch diffs each game against
// ggPriceCache, not against the idle "last results" view's own data).
// Refresh Now stays disabled until this is true; see _ggSetButtonsForState.
let _savedPricesReady=false;
async function loadSavedPrices(){
  if(!SHEET_URL){_savedPricesReady=true;_ggSetButtonsForState();return;}
  try{
    const res=await fetch(SHEET_URL+'?action=getGamePrices&_='+Date.now()+_tok(),{mode:'cors'});
    const rows=await res.json();
    if(!Array.isArray(rows))return;
    rows.forEach(row=>{
      const appid=String(row.appid||'').trim();
      if(!appid)return;
      const retail=parseFloat(row.last_retail)||0;
      const keyshop=parseFloat(row.last_keyshop)||0;
      const personalLowRetail=parseFloat(row.personal_low_retail)||0;
      const personalLowKeyshop=parseFloat(row.personal_low_keyshop)||0;
      if(!ggPriceCache[appid]){
        ggPriceCache[appid]={
          retail:retail||'',
          keyshop:keyshop||'',
          histRetail:'',
          histKeyshop:'',
          currency:'EUR',
          fetchedAt:row.last_fetched||0,
          personalLow:personalLowRetail>0&&retail>0&&retail<=personalLowRetail,
          lowRetail:personalLowRetail,
          lowKeyshop:personalLowKeyshop,
        };
      }
    });
    dispatchRender();
  }catch(e){
    console.warn('BTB: Could not load saved prices.',e);
  }finally{
    _savedPricesReady=true;
    _ggSetButtonsForState();
  }
}

// Side panel Price History chart — every fetch is logged server-side
// (PriceHistory sheet, see appendPriceHistory in runGGDealsFetch), this
// reads it back for one game and draws a small SVG line chart, same
// hand-rolled idiom as the Spend Stats trend chart (renderMonthChart).
// Fetched on demand per panel open rather than preloaded for every game.
const PH_RANGES=[['7d','7D',7],['1m','1M',30],['3m','3M',91],['6m','6M',182],['1y','1Y',365],['all','All',0]];
function filterRowsByRange(rows,range){
  const preset=PH_RANGES.find(r=>r[0]===range);
  if(!preset||!preset[2])return rows;
  const cutoff=Date.now()-preset[2]*86400000;
  return rows.filter(r=>Number(r.fetched_at)>=cutoff);
}
// "28 Jun, 14:32" — date matches the app's DD Mon convention (fmtDate), plus
// a 24h time so multiple same-day fetches are distinguishable in the tooltip.
function fmtPhTipDate(ts){
  const d=new Date(Number(ts));
  if(isNaN(d.getTime()))return'';
  const hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0');
  return`${d.getDate()} ${_months[d.getMonth()]}, ${hh}:${mm}`;
}

async function renderPriceHistoryChart(g){
  const forId=g.id;
  function mount(){return openId===forId?document.getElementById('phChart'):null;}
  const container=mount();
  if(!container)return;
  if(!SHEET_URL||!g.steamAppId){
    container.innerHTML=`<div class="ph-empty">History needs a live sync connection.</div>`;
    return;
  }
  let rows;
  try{
    const res=await fetch(SHEET_URL+'?action=getPriceHistory&appid='+encodeURIComponent(g.steamAppId)+'&_='+Date.now()+_tok(),{mode:'cors'});
    rows=await res.json();
  }catch(e){
    const el=mount();
    if(el)el.innerHTML=`<div class="ph-empty">Couldn't load price history.</div>`;
    return;
  }
  const el=mount();
  if(!el)return;
  if(!Array.isArray(rows)||rows.length<2){
    el.innerHTML=`<div class="ph-empty">${rows&&rows.length?'Only one price check recorded so far — the chart fills in as more come in.':'No price history yet — run Check Live Prices.'}</div>`;
    return;
  }
  drawPhChart(el,g,rows,'all');
}

// Draws (or redraws, on a range-pill click) the chart for one game from an
// already-fetched row set — switching ranges never re-hits the network.
function drawPhChart(el,g,allRows,range){
  const rangeRow=`<div class="ph-range-row">${PH_RANGES.map(([key,label])=>
    `<button type="button" class="ph-range-pill${key===range?' on':''}" data-range="${key}">${label}</button>`
  ).join('')}</div>`;
  const wireRangeRow=()=>{
    el.querySelectorAll('.ph-range-pill').forEach(btn=>{
      btn.onclick=()=>drawPhChart(el,g,allRows,btn.dataset.range);
    });
  };

  const rows=filterRowsByRange(allRows,range);
  if(rows.length<2){
    el.innerHTML=`${rangeRow}<div class="ph-empty">Not enough price checks in this range.</div>`;
    wireRangeRow();
    return;
  }

  const W=Math.max(el.clientWidth||280,220),H=130,padL=6,padR=6,padT=10,padB=20;
  const plotW=W-padL-padR,plotH=H-padT-padB;
  const vals=[];
  rows.forEach(r=>{
    const rv=parseFloat(r.retail),kv=parseFloat(r.keyshop);
    if(!isNaN(rv)&&rv>0)vals.push(rv);
    if(!isNaN(kv)&&kv>0)vals.push(kv);
  });
  if(!vals.length){
    el.innerHTML=`${rangeRow}<div class="ph-empty">No price data recorded in this range.</div>`;
    wireRangeRow();
    return;
  }
  const max=Math.max(...vals)*1.08;
  const stepX=plotW/(rows.length-1);
  const xOf=i=>padL+i*stepX;
  const yOf=v=>padT+plotH-(v/max*plotH);

  function seriesPts(field){
    return rows.map((r,i)=>{
      const v=parseFloat(r[field]);
      return(!isNaN(v)&&v>0)?{x:xOf(i),y:yOf(v)}:null;
    });
  }
  // Missing points break the line into segments rather than jumping across the gap.
  function pathFor(pts){
    const segs=[];let seg=[];
    pts.forEach(p=>{
      if(p)seg.push(p);
      else if(seg.length){segs.push(seg);seg=[];}
    });
    if(seg.length)segs.push(seg);
    return segs.map(s=>s.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ')).join(' ');
  }

  const retailPts=seriesPts('retail');
  const keyshopPts=seriesPts('keyshop');
  const retailD=pathFor(retailPts);
  const keyshopD=pathFor(keyshopPts);

  const cache=ggPriceCache[g.steamAppId]||{};
  const lowRetail=parseFloat(cache.lowRetail)||0;
  const lowKeyshop=parseFloat(cache.lowKeyshop)||0;
  const lowLines=[
    lowRetail>0?`<line class="ph-line-low retail" x1="${padL}" x2="${W-padR}" y1="${yOf(lowRetail).toFixed(1)}" y2="${yOf(lowRetail).toFixed(1)}"></line>`:'',
    lowKeyshop>0?`<line class="ph-line-low keyshop" x1="${padL}" x2="${W-padR}" y1="${yOf(lowKeyshop).toFixed(1)}" y2="${yOf(lowKeyshop).toFixed(1)}"></line>`:'',
  ].join('');

  // Axis labels are anchored to their point (start/middle/end) instead of
  // always "middle" so the first/last labels grow inward from the edge
  // rather than centering on it and getting clipped by the panel.
  const labelEvery=Math.max(1,Math.ceil(rows.length/5));
  const axisLabels=rows.map((r,i)=>{
    if(i%labelEvery!==0&&i!==rows.length-1)return'';
    const d=new Date(Number(r.fetched_at));
    if(isNaN(d.getTime()))return'';
    const anchor=i===0?'start':i===rows.length-1?'end':'middle';
    return`<text class="ph-axis-label" x="${xOf(i).toFixed(1)}" y="${H-6}" text-anchor="${anchor}">${d.getDate()}/${d.getMonth()+1}</text>`;
  }).join('');

  const dotsHtml=(pts,cls)=>pts.map(p=>p?`<circle class="ph-dot ${cls}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3"></circle>`:'').join('');
  const hitW=Math.max(stepX,16);
  const hitsHtml=rows.map((r,i)=>`<rect class="ph-hit" x="${(xOf(i)-hitW/2).toFixed(1)}" y="${padT}" width="${hitW.toFixed(1)}" height="${plotH}" data-i="${i}" tabindex="0"></rect>`).join('');

  el.innerHTML=`${rangeRow}
    <svg viewBox="0 0 ${W} ${H}">
      ${lowLines}
      ${retailD?`<path class="ph-line-retail" d="${retailD}"></path>`:''}
      ${keyshopD?`<path class="ph-line-keyshop" d="${keyshopD}"></path>`:''}
      ${dotsHtml(retailPts,'retail')}
      ${dotsHtml(keyshopPts,'keyshop')}
      ${axisLabels}
      <line class="ph-crosshair" id="phCrosshair" x1="0" y1="${padT}" x2="0" y2="${padT+plotH}"></line>
      ${hitsHtml}
    </svg>
    <div class="ph-tip" id="phTip"></div>
    <div class="ph-legend">
      ${retailPts.some(Boolean)?`<span class="ph-legend-item"><i class="ph-swatch retail"></i>Retail${lowRetail>0?` · low €${lowRetail.toFixed(2)}`:''}</span>`:''}
      ${keyshopPts.some(Boolean)?`<span class="ph-legend-item"><i class="ph-swatch keyshop"></i>Key${lowKeyshop>0?` · low €${lowKeyshop.toFixed(2)}`:''}</span>`:''}
    </div>`;
  wireRangeRow();

  const svgEl=el.querySelector('svg');
  const tip=document.getElementById('phTip');
  const crosshair=document.getElementById('phCrosshair');
  el.querySelectorAll('.ph-hit').forEach(hit=>{
    const i=parseInt(hit.dataset.i,10);
    const r=rows[i];
    function activate(){
      const rect=svgEl.getBoundingClientRect();
      const sx=rect.width/W,sy=rect.height/H;
      const x=xOf(i);
      crosshair.setAttribute('x1',x);crosshair.setAttribute('x2',x);
      crosshair.style.opacity='1';
      const dateLbl=fmtPhTipDate(r.fetched_at);
      const rv=parseFloat(r.retail),kv=parseFloat(r.keyshop);
      const parts=[];
      let topY=padT+plotH;
      if(!isNaN(rv)&&rv>0){parts.push(`<b class="retail">€${rv.toFixed(2)}</b> retail`);topY=Math.min(topY,yOf(rv));}
      if(!isNaN(kv)&&kv>0){parts.push(`<b class="keyshop">€${kv.toFixed(2)}</b> key`);topY=Math.min(topY,yOf(kv));}
      tip.innerHTML=`${parts.join(' · ')}${dateLbl?` · ${dateLbl}`:''}`;
      tip.classList.add('on');
      // Center over the point, then clamp within the chart's own bounds —
      // otherwise the tooltip's edge-most half hangs off the panel and gets
      // clipped (its ancestor scroll container has no room to show it).
      const tipHalfW=tip.offsetWidth/2;
      const desiredLeft=x*sx;
      const minLeft=tipHalfW+2;
      const maxLeft=rect.width-tipHalfW-2;
      const clampedLeft=Math.max(minLeft,Math.min(maxLeft,desiredLeft));
      tip.style.left=clampedLeft+'px';
      tip.style.top=(topY*sy)+'px';
    }
    hit.addEventListener('pointerenter',activate);
    hit.addEventListener('focus',activate);
  });
  el.addEventListener('pointerleave',()=>{
    crosshair.style.opacity='0';
    tip.classList.remove('on');
  });
}

// Formats one price field ("R"/"K") for the live-price fetch log: current
// value, delta vs the price cached before this run, and the gap to the
// lowest price ever recorded for this game (or "new low" if this fetch
// beat it). before/lowV are pre-fetch snapshots — see runGGDealsFetch().
// "3h ago" / "2d ago" style relative time, for the "Last checked" header —
// daysAgo()/fmtAdded() above only have day granularity, too coarse for a
// check that might have run minutes ago.
function fmtTimeAgo(ts){
  if(!ts)return'';
  const diff=Date.now()-Number(ts);
  const mins=Math.floor(diff/60000);
  if(mins<1)return'just now';
  if(mins<60)return`${mins}m ago`;
  const hrs=Math.floor(mins/60);
  if(hrs<24)return`${hrs}h ago`;
  const days=Math.floor(hrs/24);
  if(days<30)return`${days}d ago`;
  const dt=new Date(Number(ts));
  return`${dt.getDate()} ${_months[dt.getMonth()]} ${dt.getFullYear()}`;
}

// % off the game's own tracked list price (g.price) — the same reference
// used for the card's €X.XX price and spend stats, not GG.deals' own
// "historical low". null when there's nothing to compare or the live price
// isn't actually below list (a markup isn't a discount worth flagging).
function ggDiscountPct(liveV,gamePrice){
  const gp=parseFloat(gamePrice);
  if(isNaN(liveV)||liveV<=0||isNaN(gp)||gp<=0)return null;
  const pct=Math.round((1-liveV/gp)*100);
  return pct>0?pct:null;
}
// One price field ("Retail"/"Key") inside a live-price result card: current
// value, a delta badge vs. the price before this run, and either a "low
// €X" caption or a "★ new low" badge — but only when this *fetch* is what
// dropped it there (newV is now below the pre-fetch low). A game that has
// simply sat at its all-time-low price for weeks isn't "new", it's just
// low; without the newV<lowV check every settled game re-flags as a new
// low on every single check, forever.
function ggPriceStatHTML(label,newV,oldV,lowV,gamePrice){
  if(isNaN(newV)||newV<=0){
    return`<div class="ggr-price"><span class="ggr-price-lbl">${label}</span><span class="ggr-price-val ggr-na">—</span></div>`;
  }
  const cur=`€${newV.toFixed(2)}`;
  const hasOld=!isNaN(oldV)&&oldV>0;
  const deltaBadge=!hasOld
    ?`<span class="bdg ggr-badge flat">new</span>`
    :Math.abs(newV-oldV)<0.005
      ?`<span class="bdg ggr-badge flat">=</span>`
      :`<span class="bdg ggr-badge ${newV<oldV?'down':'up'}">${newV<oldV?'↓':'↑'}€${Math.abs(newV-oldV).toFixed(2)}</span>`;
  const isNewLow=hasOld&&newV<lowV-0.005;
  const lowBit=!hasOld||lowV<=0
    ?''
    :(isNewLow?`<span class="bdg ggr-badge newlow">★ new low</span>`:`<span class="ggr-lowtext">low €${lowV.toFixed(2)}</span>`);
  const discPct=ggDiscountPct(newV,gamePrice);
  const discBadge=discPct!=null?`<span class="bdg ggr-badge disc">-${discPct}%</span>`:'';
  return`<div class="ggr-price"><span class="ggr-price-lbl">${label}</span><span class="ggr-price-val">${cur}</span>${discBadge}${deltaBadge}${lowBit}</div>`;
}
// One result card — shared by the live in-progress grid and the
// reconstructed "last results" idle view, so both look identical.
function ggPriceCardHTML(e){
  const r=parseFloat(e.retail),k=parseFloat(e.keyshop);
  const oldR=e.oldRetail!=null?parseFloat(e.oldRetail):NaN;
  const oldK=e.oldKeyshop!=null?parseFloat(e.oldKeyshop):NaN;
  const lowR=parseFloat(e.lowRetail)||0,lowK=parseFloat(e.lowKeyshop)||0;
  const hasOldR=!isNaN(oldR)&&oldR>0,hasOldK=!isNaN(oldK)&&oldK>0;
  let cls='skip';
  if((hasOldR&&r<oldR)||(hasOldK&&k<oldK))cls='ok';
  else if((hasOldR&&r>oldR)||(hasOldK&&k>oldK))cls='up';
  // Best of Retail/Key vs. the game's own tracked price — the "By Discount"
  // sort key, whichever field is actually the better deal right now, not
  // just Retail. Cards with nothing to compare on either field get no
  // attribute, which parseFloat reads as NaN and the sort treats as lowest,
  // sinking them to the bottom rather than the top.
  const discR=ggDiscountPct(r,e.price),discK=ggDiscountPct(k,e.price);
  const discPct=discR==null?discK:(discK==null?discR:Math.max(discR,discK));
  return`<div class="ggr-card ${cls}" data-appid="${esc(String(e.appid))}"${discPct!=null?` data-disc="${discPct}"`:''} tabindex="0">
    <button class="qb qr ggr-exclude" title="Exclude from Live Price checks" onclick="event.stopPropagation();_ggExcludeGame('${esc(String(e.appid))}')">${IC.close}</button>
    <div class="ggr-title">${esc(e.title)}</div>
    ${ggPriceStatHTML('Retail',r,oldR,lowR,e.price)}
    ${ggPriceStatHTML('Key',k,oldK,lowK,e.price)}
  </div>`;
}
function ggPriceErrCardHTML(title,appid){
  return`<div class="ggr-card err" data-appid="${esc(String(appid))}" tabindex="0">
    <button class="qb qr ggr-exclude" title="Exclude from Live Price checks" onclick="event.stopPropagation();_ggExcludeGame('${esc(String(appid))}')">${IC.close}</button>
    <div class="ggr-title">${esc(title)}</div><div class="ggr-errline">No price data</div>
  </div>`;
}

// Shows/hides the modal's running-vs-idle chrome (progress bar, Hide/Cancel
// vs. Close/Refresh Now) purely off _ggFetchRunning, so every place that
// flips that flag can just call this instead of toggling buttons by hand.
function _ggSetButtonsForState(){
  const closeBtn=document.getElementById('ggFetchClose');
  const hideBtn=document.getElementById('ggFetchHide');
  const cancelBtn=document.getElementById('ggFetchCancel');
  const refreshBtn=document.getElementById('ggFetchRefresh');
  const progWrap=document.getElementById('ggFetchProgWrap');
  if(_ggFetchRunning){
    closeBtn.style.display='none';hideBtn.style.display='';cancelBtn.style.display='';refreshBtn.style.display='none';
    progWrap.style.display='';
  }else{
    closeBtn.style.display='';hideBtn.style.display='none';cancelBtn.style.display='none';refreshBtn.style.display='';
    progWrap.style.display='none';
  }
  // Two independent things can still be loading: the idle view's own
  // "last results" fetch (_ggIdleLoading, mostly about not clobbering that
  // view mid-load) and ggPriceCache itself (_savedPricesReady — the one
  // that actually matters for diff correctness, since runGGDealsFetch
  // diffs against ggPriceCache, not against the idle view's data).
  const notReady=_ggIdleLoading||!_savedPricesReady;
  refreshBtn.disabled=notReady;
  refreshBtn.textContent=notReady?'Loading…':'Refresh Now';
}

// All/Down/Up Filter Pills over the result cards — real Filter Pills
// (.fbar-pill, same component as the sidebar's Priority/Platform/Play
// status/Hotness filters), not a selector-tab lookalike: each pill's own
// color is fixed (blue/green/magenta) and always visible, opacity alone
// carries selected state (handled by .fbar-pill/.selected CSS already),
// and every pill always shows a live count. Down/Up match a card's own
// .ok/.up status class (see ggPriceCardHTML) via the grid's [data-filter]
// attribute, so hiding is pure CSS and needs no per-card bookkeeping.
function _ggShowFilterRow(show){
  const row=document.getElementById('ggFilterRow');
  if(row)row.style.display=show?'':'none';
}

// Recent/By Discount sort over the same card set — reorders the existing
// .ggr-card elements in place (moves nodes, doesn't rebuild them), so it
// works identically whether the grid came from the idle "last results"
// reconstruction or a live run still appending batches. Discount reads the
// data-disc attribute ggPriceCardHTML already sets from whichever of
// Retail/Key is the bigger discount off the game's own tracked price;
// cards with no discount to show have no attribute, which sorts as lowest
// and sinks them below every real deal rather than bunching them at the top.
let _ggSortMode='hot';
function _ggShowSortRow(show){
  const row=document.getElementById('ggSortRow');
  if(row)row.style.display=show?'':'none';
}
function _ggSetSort(mode){
  _ggSortMode=mode;
  document.querySelectorAll('#ggSortRow .fbar-pill').forEach(b=>{
    b.classList.toggle('selected',b.dataset.sort===mode);
  });
  _ggApplySort();
}
function _ggApplySort(){
  const gridEl=document.getElementById('ggFetchGrid');
  if(!gridEl)return;
  const cards=[...gridEl.querySelectorAll('.ggr-card')];
  if(_ggSortMode==='discount'){
    cards.sort((a,b)=>(parseFloat(b.dataset.disc)||-Infinity)-(parseFloat(a.dataset.disc)||-Infinity));
  }else{
    const hotnessOf=appid=>{
      const g=games.find(x=>String(x.steamAppId)===appid);
      return g?(parseInt(g.hotness)||0):0;
    };
    cards.sort((a,b)=>hotnessOf(b.dataset.appid)-hotnessOf(a.dataset.appid));
  }
  cards.forEach(c=>gridEl.appendChild(c));
}
document.querySelectorAll('#ggSortRow .fbar-pill').forEach(btn=>{
  btn.onclick=()=>_ggSetSort(btn.dataset.sort);
});
function _ggSetCardFilter(filter){
  const gridEl=document.getElementById('ggFetchGrid');
  if(!gridEl)return;
  gridEl.dataset.filter=filter;
  document.querySelectorAll('#ggFilterRow .fbar-pill').forEach(b=>{
    b.classList.toggle('selected',b.dataset.filter===filter);
  });
  _ggUpdateFilterUI();
}
function _ggUpdateFilterUI(){
  const gridEl=document.getElementById('ggFetchGrid');
  const emptyEl=document.getElementById('ggFilterEmpty');
  if(!gridEl)return;
  const cards=[...gridEl.querySelectorAll('.ggr-card')];
  const downCount=cards.filter(c=>c.classList.contains('ok')).length;
  const upCount=cards.filter(c=>c.classList.contains('up')).length;
  const allCountEl=document.getElementById('ggFilterCountAll');
  const downCountEl=document.getElementById('ggFilterCountDown');
  const upCountEl=document.getElementById('ggFilterCountUp');
  if(allCountEl)allCountEl.textContent=cards.length;
  if(downCountEl)downCountEl.textContent=downCount;
  if(upCountEl)upCountEl.textContent=upCount;
  if(!emptyEl)return;
  if(!cards.length){emptyEl.style.display='none';return;}
  const filter=gridEl.dataset.filter||'all';
  const matchCount=filter==='up'?upCount:filter==='down'?downCount:cards.length;
  emptyEl.style.display=matchCount?'none':'';
}
document.querySelectorAll('#ggFilterRow .fbar-pill').forEach(btn=>{
  btn.onclick=()=>_ggSetCardFilter(btn.dataset.filter);
});

// GG.deals's API key is capped at 1000 records/hour (each Steam App ID in a
// batch = 1 record). RateLog rows are written per batch by logFetch() but
// were never read back — this is what actually enforces the cap, shared
// across devices since it lives in the sheet, not local state. It's a
// rolling window, not a hard reset — budget frees up as each logged batch
// ages past an hour old — so resetAt is the *oldest* entry's expiry: the
// next moment the used count will actually drop.
async function ggRateBudget(){
  if(!SHEET_URL)return{used:0,resetAt:0};
  try{
    const res=await fetch(SHEET_URL+'?action=getRateLog&_='+Date.now()+_tok(),{mode:'cors'});
    const json=await res.json();
    const entries=Array.isArray(json.entries)?json.entries:[];
    const used=entries.reduce((s,e)=>s+(Number(e.count)||0),0);
    const oldestTs=entries.length?Math.min(...entries.map(e=>Number(e.ts)||0)):0;
    return{used,resetAt:oldestTs?oldestTs+3600000:0};
  }catch(e){return{used:0,resetAt:0};}
}
function _ggRenderRateInfo(used,resetAt){
  const el=document.getElementById('ggFetchRateInfo');
  if(!el)return;
  if(!SHEET_URL){el.textContent='';return;}
  const remaining=Math.max(0,1000-used);
  let resetBit='';
  if(resetAt){
    const d=new Date(resetAt);
    const hh=String(d.getHours()).padStart(2,'0'),mm=String(d.getMinutes()).padStart(2,'0');
    resetBit=` Resets at ${hh}:${mm}.`;
  }
  el.textContent=`${remaining}/1000 left.${resetBit}`;
}
// Every game with a Steam App ID sorts by its own hotness, highest first —
// same rule live runs already followed via the eligible-list sort, applied
// here too so the reconstructed "last results" view (whose order otherwise
// comes from PriceHistory's fetched_at/appid, not hotness) always matches.
function _ggSortRowsByHotness(rows){
  const hotnessOf=appid=>{
    const g=games.find(x=>String(x.steamAppId)===String(appid));
    return g?(parseInt(g.hotness)||0):0;
  };
  return rows.slice().sort((a,b)=>hotnessOf(b.appid)-hotnessOf(a.appid));
}

// Shown instead of the normal idle view when a run got interrupted (e.g. the
// OS killed a backgrounded PWA mid-fetch) and left resumable progress behind.
function _showGgResumePrompt(resume){
  _showGgFetchModal();
  document.getElementById('ggFetchMain').style.display='none';
  document.getElementById('ggFetchConfirm').style.display='none';
  document.getElementById('ggFetchMainBar').style.display='none';
  document.getElementById('ggFetchConfirmBar').style.display='none';
  const promptEl=document.getElementById('ggResumePrompt');
  const barEl=document.getElementById('ggResumeBar');
  promptEl.style.display='';
  barEl.style.display='flex';
  const left=resume.total-resume.fetched;
  document.getElementById('ggResumeText').textContent=
    `Your last price check was interrupted after ${resume.fetched} of ${resume.total} games. Resume the remaining ${left}?`;
  document.getElementById('ggResumeBtn').onclick=()=>{
    promptEl.style.display='none';barEl.style.display='none';
    document.getElementById('ggFetchMain').style.display='';
    document.getElementById('ggFetchMainBar').style.display='flex';
    runGGDealsFetch(resume);
  };
  document.getElementById('ggResumeDiscardBtn').onclick=()=>{
    _runClear(GG_RUN_KEY);
    promptEl.style.display='none';barEl.style.display='none';
    document.getElementById('ggFetchMain').style.display='';
    document.getElementById('ggFetchMainBar').style.display='flex';
    openGgFetchModalIdle(true);
  };
}

// Entry point for "Check Live Prices" — opens the modal showing what the
// LAST run found (reconstructed from the PriceHistory sheet via
// getLatestFetchDiffs), so results are visible from any device, not just
// the one that ran the fetch. "Refresh Now" inside kicks off a real run.
async function openGgFetchModalIdle(skipShow){
  if(_ggFetchRunning){_showGgFetchModal();return}
  if(!skipShow){
    const resume=_runLoad(GG_RUN_KEY);
    if(resume){_showGgResumePrompt(resume);return}
  }
  if(!skipShow)_showGgFetchModal();
  // Refresh Now stays disabled until this settles — see _ggIdleLoading.
  _ggIdleLoading=true;
  _ggSetButtonsForState();
  document.getElementById('ggFetchStatus').textContent='';
  const metaEl=document.getElementById('ggFetchMeta');
  const gridEl=document.getElementById('ggFetchGrid');
  metaEl.textContent='Loading last results…';
  gridEl.innerHTML='';
  _ggShowFilterRow(false);
  _ggShowSortRow(false);
  function doneLoading(){
    _ggIdleLoading=false;
    _ggSetButtonsForState();
    return !_ggFetchRunning; // false = a run took over while this was loading — its own view already took over, skip touching the grid/meta
  }
  if(!SHEET_URL){
    doneLoading();
    metaEl.textContent='';
    _ggRenderRateInfo(0);
    gridEl.innerHTML=`<div class="ggr-empty">Connect a sheet to check live prices.</div>`;
    return;
  }
  let rows,rateBudget={used:0,resetAt:0};
  try{
    const [res,budget]=await Promise.all([
      fetch(SHEET_URL+'?action=getLatestFetchDiffs&_='+Date.now()+_tok(),{mode:'cors'}),
      ggRateBudget(),
    ]);
    rows=await res.json();
    rateBudget=budget;
  }catch(e){
    if(!doneLoading())return;
    metaEl.textContent='';
    gridEl.innerHTML=`<div class="ggr-empty">Couldn't load last results.</div>`;
    return;
  }
  if(!doneLoading())return;
  _ggRenderRateInfo(rateBudget.used,rateBudget.resetAt);
  // getLatestFetchDiffs reconstructs the last run from PriceHistory, which
  // doesn't know about skipGGFetch/delisted/cancelled changes made since —
  // filter against the current game list so an excluded game's stale
  // result doesn't keep reappearing here after being removed via the card.
  rows=(Array.isArray(rows)?rows:[]).filter(r=>{
    const g=games.find(x=>String(x.steamAppId)===String(r.appid));
    return g&&!g.skipGGFetch&&!isCancelled(g)&&!g.delisted;
  });
  if(!rows.length){
    metaEl.textContent='';
    gridEl.innerHTML=`<div class="ggr-empty">No price checks recorded yet — click Refresh Now to run one.</div>`;
    return;
  }
  rows=_ggSortRowsByHotness(rows);
  const latestTs=Math.max(...rows.map(r=>r.fetched_at||0));
  metaEl.textContent=`Last checked ${fmtTimeAgo(latestTs)} · ${rows.length} game${rows.length>1?'s':''}`;
  gridEl.innerHTML=rows.map(r=>{
    const g=games.find(x=>String(x.steamAppId)===String(r.appid));
    return ggPriceCardHTML({
      title:r.title,retail:r.retail,keyshop:r.keyshop,
      oldRetail:r.prevRetail,oldKeyshop:r.prevKeyshop,
      lowRetail:r.lowRetail,lowKeyshop:r.lowKeyshop,
      appid:r.appid,price:g?g.price:null,
    });
  }).join('');
  _ggShowFilterRow(true);
  _ggSetCardFilter('all');
  _ggShowSortRow(true);
  _ggSetSort('hot');
}

function _ggEligibleGames(){
  const today=todayISO();
  return games.filter(g=>
    (g.status==='wishlist'||(g.status==='bought'&&g.steamWishlist))&&
    g.steamAppId&&
    g.releaseDate&&
    /^\d{4}-\d{2}-\d{2}$/.test(g.releaseDate)&&
    g.releaseDate<=today&&
    !isCancelled(g)&&
    !g.delisted&&
    !g.skipGGFetch
  ).sort((a,b)=>(parseInt(b.hotness)||0)-(parseInt(a.hotness)||0));
}
async function runGGDealsFetch(resumeState){
  if(_ggFetchRunning){_showGgFetchModal();return}
  if(!GG_WORKER){showToast('GG.deals worker not configured.');return;}

  let eligible,total,fetched,startedAt,doneGames=[];
  if(resumeState){
    const remainSet=new Set(resumeState.remaining);
    eligible=games.filter(g=>remainSet.has(String(g.steamAppId)));
    if(!eligible.length){_runClear(GG_RUN_KEY);showToast('Nothing left to resume — those games are no longer eligible.');return;}
    total=resumeState.total;fetched=resumeState.fetched;startedAt=resumeState.startedAt;
    // Games already fetched earlier in this same run, before the interruption —
    // re-render their cards from ggPriceCache so resuming doesn't wipe them
    // from view (they were already committed to the sheet, just not re-shown).
    if(Array.isArray(resumeState.all)){
      doneGames=resumeState.all.filter(id=>!remainSet.has(id))
        .map(id=>games.find(g=>String(g.steamAppId)===id)).filter(Boolean);
    }
  }else{
    eligible=_ggEligibleGames();
    if(!eligible.length){showToast('All released wishlist games already have prices.');return;}
    total=eligible.length;fetched=0;startedAt=Date.now();
  }

  const batches=[];
  for(let i=0;i<eligible.length;i+=100)batches.push(eligible.slice(i,i+100));
  const allIds=resumeState&&Array.isArray(resumeState.all)?resumeState.all:eligible.map(g=>String(g.steamAppId));
  _runSave(GG_RUN_KEY,{remaining:eligible.map(g=>String(g.steamAppId)),total,fetched,startedAt,all:allIds});
  _ggFetchCancelled=false;
  _ggFetchHidden=false;
  _ggFetchRunning=true;
  setMenuRunning(['hmPriceBtn','dhPriceBtn'],true);

  const ov=document.getElementById('ggFetchOv');
  const progressEl=document.getElementById('ggFetchProgress');
  const statusEl=document.getElementById('ggFetchStatus');
  const barEl=document.getElementById('ggFetchBar');
  const gridEl=document.getElementById('ggFetchGrid');
  const metaEl=document.getElementById('ggFetchMeta');
  const cancelBtn=document.getElementById('ggFetchCancel');
  const hideBtn=document.getElementById('ggFetchHide');
  const bubble=document.getElementById('ggFetchBubble');

  function setProgress(status){
    const pct=total>0?Math.round(fetched/total*100):0;
    progressEl.textContent=`${fetched} / ${total} fetched`;
    barEl.style.width=`${pct}%`;
    bubble.textContent=`${fetched}\n/${total}`;
    if(status!==undefined)statusEl.textContent=status;
  }

  _hideGgConfirm();
  _ggSetButtonsForState();
  cancelBtn.textContent='Cancel';
  cancelBtn.onclick=()=>_ggFetchTryClose();
  hideBtn.onclick=_hideGgFetchModal;
  document.getElementById('ggFetchConfirmContinue').onclick=()=>_hideGgConfirm();
  document.getElementById('ggFetchConfirmStop').onclick=()=>{_ggFetchCancelled=true;_hideGgConfirm();};
  metaEl.textContent='';
  gridEl.innerHTML=doneGames.map(g=>{
    const c=ggPriceCache[g.steamAppId];
    return c?ggPriceCardHTML({
      title:g.title,retail:c.retail,keyshop:c.keyshop,
      oldRetail:NaN,oldKeyshop:NaN,
      lowRetail:c.lowRetail,lowKeyshop:c.lowKeyshop,
      appid:g.steamAppId,price:g.price,
    }):ggPriceErrCardHTML(g.title,g.steamAppId);
  }).join('');
  _ggShowFilterRow(true);
  _ggSetCardFilter('all');
  _ggShowSortRow(true);
  _ggSetSort('hot');
  ov.classList.add('on');
  history.pushState({ggFetchOpen:true},'','');
  setProgress('Starting…');

  // Shared across devices via RateLog (GG.deals caps the API key at
  // 1000 records/hour) — read the real current usage once up front, then
  // track it locally as this run's own batches add to it. resetAt only
  // moves forward as the *oldest* logged entry ages out, which this run's
  // own (newer) batches can't affect, so it's safe to read once.
  const rateBudget=await ggRateBudget();
  let rateUsed=rateBudget.used;
  _ggRenderRateInfo(rateUsed,rateBudget.resetAt);
  let rateLimited=false;

  for(let b=0;b<batches.length&&!_ggFetchCancelled;b++){
    const batch=batches[b];
    if(SHEET_URL&&rateUsed+batch.length>1000){
      rateLimited=true;
      setProgress(`GG.deals hourly limit reached — ${fetched} of ${total} checked, ${total-fetched} left for next hour.`);
      break;
    }
    setProgress(`Fetching batch ${b+1} of ${batches.length}…`);
    try{
      const ids=batch.map(g=>g.steamAppId).join(',');
      const res=await fetchWithTimeout(`${GG_WORKER}?ids=${encodeURIComponent(ids)}&region=it&_=${Date.now()}`,30000);
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const json=await res.json();
      if(json.error)throw new Error(json.error);
      if(!json.success)throw new Error('GG.deals API returned an error');
      const fetchTs=Date.now();

      const priceEntries=[];
      const historyEntries=[];
      const cardsHtml=[];
      batch.forEach(g=>{
        const d=json.data[g.steamAppId];
        const before=ggPriceCache[g.steamAppId];
        if(d&&d.prices){
          ggPriceCache[g.steamAppId]={
            retail:d.prices.currentRetail,keyshop:d.prices.currentKeyshops,
            histRetail:d.prices.historicalRetail,histKeyshop:d.prices.historicalKeyshops,
            currency:d.prices.currency,fetchedAt:fetchTs,
            personalLow:before?before.personalLow:false,
            lowRetail:before?(before.lowRetail||0):0,
            lowKeyshop:before?(before.lowKeyshop||0):0,
          };
          priceEntries.push({appid:g.steamAppId,title:g.title,retail:d.prices.currentRetail,keyshop:d.prices.currentKeyshops});
          historyEntries.push({appid:g.steamAppId,title:g.title,fetched_at:fetchTs,retail:d.prices.currentRetail,keyshop:d.prices.currentKeyshops,currency:d.prices.currency});
          cardsHtml.push(ggPriceCardHTML({
            title:g.title,retail:d.prices.currentRetail,keyshop:d.prices.currentKeyshops,
            oldRetail:before?before.retail:NaN,oldKeyshop:before?before.keyshop:NaN,
            lowRetail:before?before.lowRetail:0,lowKeyshop:before?before.lowKeyshop:0,
            appid:g.steamAppId,price:g.price,
          }));
        }else{
          cardsHtml.push(ggPriceErrCardHTML(g.title,g.steamAppId));
        }
      });
      fetched+=batch.length;
      if(SHEET_URL){rateUsed+=batch.length;_ggRenderRateInfo(rateUsed,rateBudget.resetAt);}
      _runSave(GG_RUN_KEY,{remaining:batches.slice(b+1).flat().map(g=>String(g.steamAppId)),total,fetched,startedAt,all:allIds});
      dispatchRender();
      setProgress(`Batch ${b+1} of ${batches.length} done.`);
      gridEl.insertAdjacentHTML('beforeend',cardsHtml.join(''));
      _ggUpdateFilterUI();
      _ggApplySort();

      if(SHEET_URL&&priceEntries.length){
        try{
          const r=await fetch(SHEET_URL+'?action=upsertGamePrices'+_tok(),{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(priceEntries)});
          const result=await r.json();
          if(result.newLows&&result.newLows.length){
            result.newLows.forEach(appid=>{if(ggPriceCache[appid])ggPriceCache[appid].personalLow=true;});
          }
          if(result.lows){
            Object.keys(result.lows).forEach(appid=>{
              if(!ggPriceCache[appid])return;
              ggPriceCache[appid].lowRetail=result.lows[appid].retail||0;
              ggPriceCache[appid].lowKeyshop=result.lows[appid].keyshop||0;
            });
          }
          if((result.newLows&&result.newLows.length)||result.lows)dispatchRender();
        }catch(e){}
        // Awaited (not fire-and-forget): getLatestFetchDiffs reconstructs the
        // idle view straight from this sheet, so if the modal gets closed and
        // reopened right after the last batch, the write must already be
        // committed — otherwise the reopen can silently show an older run.
        try{
          await fetch(SHEET_URL+'?action=appendPriceHistory'+_tok(),{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(historyEntries)});
        }catch(e){}
        fetch(SHEET_URL+'?action=logFetch'+_tok(),{method:'POST',mode:'cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify({ts:fetchTs,count:batch.length})}).catch(()=>{});
      }
    }catch(err){
      setProgress(`Error: ${err.message}`);
      console.error('BTB GG.deals error:',err);
      _ggFetchRunning=false;_hideGgConfirm();
      setMenuRunning(['hmPriceBtn','dhPriceBtn'],false);
      _ggSetButtonsForState();
      return;
    }

    if(b<batches.length-1&&!_ggFetchCancelled){
      let secs=61;
      while(secs>0&&!_ggFetchCancelled){
        setProgress(`Next batch in ${secs}s…`);
        await new Promise(r=>setTimeout(r,1000));
        secs--;
      }
    }
  }

  if(_ggFetchCancelled){
    setProgress('Cancelled.');
    _runClear(GG_RUN_KEY); // an explicit Stop means don't offer to resume it later
  }else if(rateLimited){
    progressEl.textContent=`${fetched} / ${total} fetched`;
    barEl.style.width=`${total>0?Math.round(fetched/total*100):0}%`;
    // Left in localStorage on purpose — picks back up automatically once the
    // hourly rate limit window rolls over, without re-billing already-fetched games.
  }else{
    progressEl.textContent=`${fetched} / ${total} fetched`;
    barEl.style.width='100%';
    statusEl.textContent='All done!';
    _runClear(GG_RUN_KEY);
  }
  metaEl.textContent=`Checked just now · ${fetched} game${fetched===1?'':'s'}`;
  _ggFetchRunning=false;_hideGgConfirm();
  setMenuRunning(['hmPriceBtn','dhPriceBtn'],false);
  _ggSetButtonsForState();
  // If hidden, show done state in bubble then restore modal
  if(_ggFetchHidden){
    bubble.textContent='Done';
    bubble.onclick=_showGgFetchModal;
  }
}

function _hideGgFetchModal(){
  _ggFetchHidden=true;
  document.getElementById('ggFetchOv').classList.remove('on');
  document.getElementById('ggFetchBubble').classList.add('on');
}

// Sync the DOM to "modal visible" without touching history — for when
// we're already sitting on a {ggFetchOpen:true} entry (e.g. popstate just
// landed on one) and pushing again would leave a redundant entry behind.
function _revealGgFetchModal(){
  _ggFetchHidden=false;
  document.getElementById('ggFetchBubble').classList.remove('on');
  document.getElementById('ggFetchOv').classList.add('on');
}
function _showGgFetchModal(){
  _revealGgFetchModal();
  history.pushState({ggFetchOpen:true},'','');
}

function _closeGgFetchModal(){
  _ggFetchCancelled=true;
  _ggFetchHidden=false;
  _ggFetchRunning=false;
  setMenuRunning(['hmPriceBtn','dhPriceBtn'],false);
  _hideGgConfirm();
  document.getElementById('ggFetchOv').classList.remove('on');
  document.getElementById('ggFetchBubble').classList.remove('on');
  if(history.state&&history.state.ggFetchOpen)history.replaceState(null,'','');
}
document.getElementById('ggFetchOv').addEventListener('click',e=>{if(e.target===document.getElementById('ggFetchOv'))_ggFetchTryClose();});
document.getElementById('ggFetchBubble').onclick=_showGgFetchModal;
document.getElementById('ggFetchRefresh').onclick=()=>runGGDealsFetch();
document.getElementById('ggFetchClose').onclick=_closeGgFetchModal;

// Result cards are clickable — jump straight to that game's side panel.
// Always *hide* rather than close (even when idle/finished) — closing
// replaces the modal's history entry with null, so Back from the panel
// landed on the bare main view instead of returning here. Hiding leaves
// the {ggFetchOpen:true} entry and the rendered grid intact; the main
// popstate handler's panel-close branch re-shows the modal when it lands
// back on that entry (see _ggFetchHidden check there).
function _ggFetchGoToGame(appid){
  const g=games.find(x=>String(x.steamAppId)===String(appid));
  if(!g)return;
  if(!_ggFetchRunning)document.getElementById('ggFetchBubble').textContent='Live\nPrices';
  _hideGgFetchModal();
  openPanel(g.id);
}
// Quick per-card alternative to opening the Edit modal just to flip the
// same skipGGFetch flag (see fFetchSkip) — the card is the natural place
// to notice "this one keeps showing up" and act on it immediately.
function _ggExcludeGame(appid){
  const g=games.find(x=>String(x.steamAppId)===String(appid));
  if(!g)return;
  g.skipGGFetch=true;
  save(g.id);
  showToast(`Excluded "${g.title}" from Live Price checks`);
  const card=document.querySelector(`#ggFetchGrid .ggr-card[data-appid="${appid}"]`);
  if(card)card.remove();
  _ggUpdateFilterUI();
}
document.getElementById('ggFetchGrid').addEventListener('click',e=>{
  const card=e.target.closest('.ggr-card[data-appid]');
  if(card)_ggFetchGoToGame(card.dataset.appid);
});
document.getElementById('ggFetchGrid').addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  const card=e.target.closest('.ggr-card[data-appid]');
  if(!card)return;
  e.preventDefault();
  _ggFetchGoToGame(card.dataset.appid);
});
window._ggFetchTryClose=_ggFetchTryClose;
window._ggFetchIsOpen=()=>document.getElementById('ggFetchOv').classList.contains('on')||_ggFetchHidden;

document.getElementById('hmPriceBtn').onclick=()=>{
  document.getElementById('hmenu').classList.remove('on');
  openGgFetchModalIdle();
};
document.getElementById('hmSteamPriceBtn').onclick=()=>{
  document.getElementById('hmenu').classList.remove('on');
  runPriceLookup();
};

// ══════════════════════════════════════════
//  WEB SHARE TARGET
// ══════════════════════════════════════════
function handleShareTarget(){
  const p=new URLSearchParams(location.search);
  const raw=p.get('share_url')||p.get('share_text')||'';
  if(!raw)return;
  const m=raw.match(/https?:\/\/store\.steampowered\.com\/app\/\d+[^\s]*/);
  if(!m)return;
  const steamUrl=m[0];
  // Strip share params from the browser URL so back/refresh are clean
  history.replaceState(null,'',location.pathname+location.hash);
  _openSharePicker(steamUrl);
}

function _openSharePicker(url){
  const parsed=parseStoreLink(url);
  const title=parsed?parsed.title:'this game';
  const ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(3,19,41,.92);backdrop-filter:blur(4px);z-index:500;display:flex;align-items:center;justify-content:center;padding:1rem';
  ov.innerHTML=`
    <div style="background:var(--s1);border:1px solid var(--bd2);border-radius:var(--rl);padding:1.3rem;width:100%;max-width:400px">
      <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:1.1rem;color:var(--green);margin-bottom:.25rem">Add Game</div>
      <div style="font-size:.82rem;color:var(--t2);margin-bottom:1.1rem;line-height:1.4">${esc(title)}</div>
      <div style="display:flex;flex-direction:column;gap:.45rem">
        <button id="_spWish" class="mb2" style="padding:.6rem .9rem;text-align:left">Add to Wishlist</button>
        <button id="_spCol" class="mb2" style="padding:.6rem .9rem;text-align:left">Add to Collection</button>
        <button id="_spCancel" class="mb2 c" style="padding:.45rem .9rem">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  function pick(openFn){
    close();
    openFn();
    const fStore=document.getElementById('fStore');
    if(fStore){fStore.value=url;fStore.dispatchEvent(new Event('blur'));}
  }
  document.getElementById('_spWish').onclick=()=>pick(openAddWishlist);
  document.getElementById('_spCol').onclick=()=>pick(openAddCollection);
  document.getElementById('_spCancel').onclick=close;
  ov.addEventListener('click',e=>{if(e.target===ov)close();});
}

// ══════════════════════════════════════════
//  MOBILE SWIPE ACTIONS ON CARDS
// ══════════════════════════════════════════
(function(){
  const THRESHOLD=72;  // px to commit
  const V_CANCEL=12;   // px vertical drift before we yield to scroll

  let sw=null; // active swipe state

  document.addEventListener('touchstart',e=>{
    const card=e.target.closest('.gc,.col-row');
    if(!card)return;
    const id=card.dataset.id;if(!id)return;
    const g=games.find(x=>String(x.id)===id);
    if(!g||g.status==='removed')return;
    sw={startX:e.touches[0].clientX,startY:e.touches[0].clientY,card,id,dx:0,live:false,isBought:g.status==='bought'};
  },{passive:true});

  document.addEventListener('touchmove',e=>{
    if(!sw)return;
    const dx=e.touches[0].clientX-sw.startX;
    const dy=e.touches[0].clientY-sw.startY;
    if(!sw.live){
      if(Math.abs(dy)>V_CANCEL&&Math.abs(dy)>Math.abs(dx)){sw=null;return;}
      if(Math.abs(dx)<8)return;
      sw.live=true;
      sw.card.style.zIndex='20';
    }
    e.preventDefault();
    sw.dx=dx;
    const {card}=sw;
    card.style.transition='none';
    card.style.transform=`translateX(${dx}px)`;
    const prog=Math.min(Math.abs(dx)/THRESHOLD,1);
    const hr=card.querySelector('.swipe-hint-r');
    const hl=card.querySelector('.swipe-hint-l');
    if(dx>0){if(hr)hr.style.opacity=prog;if(hl)hl.style.opacity=0;}
    else    {if(hl)hl.style.opacity=prog;if(hr)hr.style.opacity=0;}
  },{passive:false});

  function _resetCard(card){
    card.style.transition='transform .2s ease';
    card.style.transform='';
    card.style.zIndex='';
    card.querySelectorAll('.swipe-hint-r,.swipe-hint-l').forEach(el=>{
      el.style.transition='opacity .2s';el.style.opacity=0;
    });
  }
  function _clearHints(card){
    card.querySelectorAll('.swipe-hint-r,.swipe-hint-l').forEach(el=>el.style.opacity=0);
  }

  document.addEventListener('touchend',e=>{
    if(!sw)return;
    const{card,id,dx,live,isBought}=sw;sw=null;
    if(!live)return;
    e.preventDefault();
    if(isBought){
      // Collection: right = add platform, left = back to wishlist (with confirm)
      if(dx>THRESHOLD){
        _resetCard(card);
        openAddPlatformModal(id);
      } else if(dx<-THRESHOLD){
        card.style.transition='transform .25s ease,opacity .25s ease';
        card.style.transform='translateX(-110%)';
        card.style.opacity='0';
        setTimeout(()=>{card.style.transform='';card.style.opacity='';card.style.zIndex='';_clearHints(card);startMoveToWishlist(id);},250);
      } else {
        _resetCard(card);
      }
    } else {
      // Wishlist: right = add to collection, left = remove
      if(dx>THRESHOLD){
        card.style.transition='transform .25s ease,opacity .25s ease';
        card.style.transform='translateX(110%)';
        card.style.opacity='0';
        setTimeout(()=>{card.style.transform='';card.style.opacity='';card.style.zIndex='';_clearHints(card);handleMarkBought(id);},250);
      } else if(dx<-THRESHOLD){
        _resetCard(card);
        startRemove(id);
      } else {
        _resetCard(card);
      }
    }
  },{passive:false});
})();

// ══════════════════════════════════════════
//  CLOSE FLOATING PICKERS ON SCROLL
// ══════════════════════════════════════════
function _closeAllFloating(){
  document.querySelectorAll('.fpop.open').forEach(el=>el.classList.remove('open'));
  document.querySelectorAll('.pick-dd.on').forEach(el=>el.classList.remove('on'));
}
(function(){
  ['#content','.pb2'].forEach(sel=>{
    const el=document.querySelector(sel);
    if(el)el.addEventListener('scroll',_closeAllFloating,{passive:true});
  });
  // On modal scroll: close filter popovers only; inline pickers scroll with content
  document.querySelectorAll('.modal').forEach(el=>el.addEventListener('scroll',()=>{
    document.querySelectorAll('.fpop.open').forEach(p=>p.classList.remove('open'));
  },{passive:true}));
})();

// ══════════════════════════════════════════
//  FILTER SIDEBAR
// ══════════════════════════════════════════
(function(){
  // ── Open / close ──
  function openFbar(){
    history.pushState({fbarOpen:true},'','');
    document.getElementById('fbar').classList.add('on');
    document.getElementById('fbar-ov').classList.add('on');
    document.getElementById('main').classList.add('fbar-open');
    const qf=document.getElementById('qfab');
    if(qf){qf.classList.add('fbar-on');qf.classList.remove('open');document.getElementById('qfab-ov').classList.remove('on');}
    _fbarRefreshAll();
  }
  function _rawCloseFbar(){
    document.getElementById('fbar').classList.remove('on');
    document.getElementById('fbar-ov').classList.remove('on');
    document.getElementById('main').classList.remove('fbar-open');
    const qf=document.getElementById('qfab');
    if(qf)qf.classList.remove('fbar-on');
  }
  function closeFbar(){
    _rawCloseFbar();
    if(history.state&&history.state.fbarOpen){history.back();}
  }
  window._openFbar=openFbar;
  window._closeFbar=closeFbar;
  window._rawCloseFbar=_rawCloseFbar;

  // ── Wire toggle buttons ──
  const fabBtn=document.getElementById('fbarFab');
  if(fabBtn)fabBtn.onclick=()=>{
    const on=document.getElementById('fbar').classList.contains('on');
    on?closeFbar():openFbar();
  };
  document.getElementById('fbarClose').onclick=closeFbar;
  document.getElementById('fbar-ov').onclick=closeFbar;

  // sortSel, groupSel, cSortSel are now directly in the sidebar HTML

  // ── Accordion toggles ──
  function wireAccordion(toggleId,bodyId){
    const btn=document.getElementById(toggleId);
    const body=document.getElementById(bodyId);
    if(!btn||!body)return;
    btn.addEventListener('click',()=>{
      const open=btn.classList.toggle('open');
      body.style.display=open?'':'none';
      if(open)_fbarRefreshSection(toggleId);
    });
  }
  wireAccordion('fbar-genre-toggle','fbar-genre-body');
  wireAccordion('fbar-tags-toggle','fbar-tags-body');
  wireAccordion('fbar-prio-toggle','fbar-prio-body');
  wireAccordion('fbar-hot-toggle','fbar-hot-body');
  wireAccordion('fbar-cgenre-toggle','fbar-cgenre-body');
  wireAccordion('fbar-cplay-toggle','fbar-cplay-body');
  wireAccordion('fbar-cplat-toggle','fbar-cplat-body');
  wireAccordion('fbar-cstore-toggle','fbar-cstore-body');
  wireAccordion('fbar-cdate-toggle','fbar-cdate-body');
  wireAccordion('fbar-ccol-toggle','fbar-ccol-body');

  // ── Hotness tier chips ──
  function fbarApply(mn,mx){
    hrMinVal=mn;hrMaxVal=mx;
    _syncHotChips();
    renderAll();
    syncFbarBadges();
  }
  function _syncHotChips(){
    const base=games.filter(g=>g.status!=='bought');
    const counts={any:0,hot:0,mid:0,low:0};
    base.forEach(g=>{
      counts.any++;
      if(nr(g))return;
      const h=parseInt(g.hotness)||0;
      if(h>=70)counts.hot++;
      else if(h>=40)counts.mid++;
      else counts.low++;
    });
    document.querySelectorAll('.fbar-hot-chip').forEach(chip=>{
      const mn=parseInt(chip.dataset.min),mx=parseInt(chip.dataset.max);
      chip.classList.toggle('selected',mn===hrMinVal&&mx===hrMaxVal);
      const c=mn===0&&mx===100?counts.any:mn===70?counts.hot:mn===40?counts.mid:counts.low;
      const cnt=chip.querySelector('.fbar-pill-count');
      if(cnt)cnt.textContent=c;
    });
  }
  document.querySelectorAll('.fbar-hot-chip').forEach(chip=>{
    chip.addEventListener('click',()=>fbarApply(parseInt(chip.dataset.min),parseInt(chip.dataset.max)));
  });
  _syncHotChips();

  // ── Generic list renderer ──
  function renderGenreTagList(listEl,searchEl,logicEl,getSelected,setSelected,getLogic,setLogic,getOptions,doRender){
    if(!listEl)return;
    const q=(searchEl?searchEl.value:'').toLowerCase();
    const opts=getOptions().filter(o=>!q||o.value.toLowerCase().includes(q));
    if(!opts.length){listEl.innerHTML=`<div class="fbar-opt" style="color:var(--t3);cursor:default">No options</div>`;return;}
    listEl.innerHTML=opts.map(o=>{
      const sel=getSelected().has(o.value);
      return`<div class="fbar-opt${sel?' selected':''}" data-val="${esc(o.value)}">
        <span class="fbar-opt-check">${sel?'✓':''}</span>
        <span class="fbar-opt-label">${esc(o.value)}</span>
        ${metaTipHTML(o.value)}
        <span class="fbar-opt-count">${o.count||''}</span>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.fbar-opt').forEach(el=>{
      el.addEventListener('click',()=>{
        const v=el.dataset.val;
        getSelected().has(v)?getSelected().delete(v):getSelected().add(v);
        doRender();
        syncFbarBadges();
        renderGenreTagList(listEl,searchEl,logicEl,getSelected,setSelected,getLogic,setLogic,getOptions,doRender);
      });
    });
    // Logic toggle
    if(logicEl){
      logicEl.querySelectorAll('.fbar-logic-btn').forEach(b=>{
        b.classList.toggle('on',b.dataset.l===getLogic());
        b.onclick=()=>{
          setLogic(b.dataset.l);
          logicEl.querySelectorAll('.fbar-logic-btn').forEach(x=>x.classList.toggle('on',x.dataset.l===getLogic()));
          doRender();syncFbarBadges();
        };
      });
    }
  }

  // ── Wire genre (wishlist) ──
  function refreshFbarGenre(){
    renderGenreTagList(
      document.getElementById('fbar-genre-list'),
      document.getElementById('fbar-genre-search'),
      document.getElementById('fbar-genre-logic'),
      ()=>fGenres,(s)=>{fGenres=s;},()=>fGenreLogic,(l)=>{fGenreLogic=l;},
      ()=>{const freq={};games.filter(g=>g.status!=='bought').forEach(g=>(g.genres||[]).forEach(x=>{if(x)freq[x]=(freq[x]||0)+1}));return Object.keys(freq).sort((a,b)=>freq[b]-freq[a]||a.localeCompare(b)).map(v=>({value:v,count:freq[v]}));},
      renderAll
    );
  }
  const fbarGenreSearch=document.getElementById('fbar-genre-search');
  if(fbarGenreSearch)fbarGenreSearch.addEventListener('input',refreshFbarGenre);
  document.getElementById('fbar-genre-clear').onclick=()=>{fGenres=new Set();renderAll();syncFbarBadges();refreshFbarGenre();};

  // ── Wire tags (wishlist) ──
  function refreshFbarTags(){
    renderGenreTagList(
      document.getElementById('fbar-tags-list'),
      document.getElementById('fbar-tags-search'),
      document.getElementById('fbar-tags-logic'),
      ()=>fTags,(s)=>{fTags=s;},()=>fTagLogic,(l)=>{fTagLogic=l;},
      ()=>{const freq={};games.filter(g=>g.status!=='bought').forEach(g=>(g.tags||[]).forEach(x=>{if(x)freq[x]=(freq[x]||0)+1}));return Object.keys(freq).sort((a,b)=>freq[b]-freq[a]||a.localeCompare(b)).map(v=>({value:v,count:freq[v]}));},
      renderAll
    );
  }
  const fbarTagsSearch=document.getElementById('fbar-tags-search');
  if(fbarTagsSearch)fbarTagsSearch.addEventListener('input',refreshFbarTags);
  document.getElementById('fbar-tags-clear').onclick=()=>{fTags=new Set();renderAll();syncFbarBadges();refreshFbarTags();};

  // ── Wire priority (wishlist) ──
  // One pill, cycled by clicking, instead of three independent toggles — see
  // cyclePrioFilter() for the UP TO (cumulative) vs EXACT (isolate one tier) logic.
  function refreshFbarPrio(){
    const list=document.getElementById('fbar-prio-list');if(!list)return;
    const freq={high:0,medium:0,low:0};
    games.filter(g=>g.status!=='bought').forEach(g=>{const p=g.priority||'medium';freq[p]=(freq[p]||0)+1;});
    const total=freq.high+freq.medium+freq.low;
    let cls,count,label;
    if(fPrioMode==='exact'){
      const v=fPrios.has('high')?'high':fPrios.has('medium')?'medium':'low';
      cls=v==='low'?'prio-low':v==='medium'?'prio-only-medium':'prio-only-high';
      count=freq[v]||0;label=prioLabel(v);
    } else if(fPrios.size===0){
      cls='prio-high';count=total;label='All';
    } else if(fPrios.has('medium')){
      cls='prio-medium';count=(freq.low||0)+(freq.medium||0);label='Low + Medium';
    } else {
      cls='prio-low';count=freq.low||0;label='Low';
    }
    list.innerHTML=`<div class="fbar-pills">
      <button class="fbar-pill fbar-pill-prio ${cls}" id="fbar-prio-pill" title="${label}" aria-label="Priority filter: ${label}">
        <span class="pm-bar"><span class="pm-seg pm-s1"></span><span class="pm-seg pm-s2"></span><span class="pm-seg pm-s3"></span></span>
        <span class="fbar-pill-count fpc-dark">${count}</span>
      </button>
    </div>`;
    document.getElementById('fbar-prio-pill').addEventListener('click',()=>{
      cyclePrioFilter();
      renderAll();syncFbarBadges();refreshFbarPrio();
    });
    // UP TO / EXACT mode toggle
    const modeEl=document.getElementById('fbar-prio-mode');
    if(modeEl){
      modeEl.querySelectorAll('.fbar-logic-btn').forEach(b=>{
        b.classList.toggle('on',b.dataset.m===fPrioMode);
        b.onclick=()=>{
          fPrioMode=b.dataset.m;
          fPrios=fPrioMode==='exact'?new Set(['low']):new Set();
          modeEl.querySelectorAll('.fbar-logic-btn').forEach(x=>x.classList.toggle('on',x.dataset.m===fPrioMode));
          renderAll();syncFbarBadges();refreshFbarPrio();
        };
      });
    }
  }
  document.getElementById('fbar-prio-clear').onclick=()=>{fPrioMode='upto';fPrios=new Set();renderAll();syncFbarBadges();refreshFbarPrio();};

  // ── Wire collection genre ──
  function refreshFbarCGenre(){
    renderGenreTagList(
      document.getElementById('fbar-cgenre-list'),
      document.getElementById('fbar-cgenre-search'),
      document.getElementById('fbar-cgenre-logic'),
      ()=>cfGenres,(s)=>{cfGenres=s;},()=>cfGenreLogic,(l)=>{cfGenreLogic=l;},
      ()=>{const freq={};games.filter(g=>g.status==='bought').forEach(g=>(g.genres||[]).forEach(x=>{if(x)freq[x]=(freq[x]||0)+1}));return Object.keys(freq).sort().map(v=>({value:v,count:freq[v]}));},
      renderCollection
    );
  }
  const fbarCGenreSearch=document.getElementById('fbar-cgenre-search');
  if(fbarCGenreSearch)fbarCGenreSearch.addEventListener('input',refreshFbarCGenre);
  document.getElementById('fbar-cgenre-clear').onclick=()=>{cfGenres=new Set();renderCollection();syncFbarBadges();refreshFbarCGenre();};

  // ── Wire collection play status ──
  function refreshFbarCPlay(){
    const list=document.getElementById('fbar-cplay-list');if(!list)return;
    const order=['Unplayed','In Progress','Completed','Superseded','Unfinishable','Played on Different Platform','Will Never Complete','Will Never Play'];
    const freq={};
    games.filter(g=>g.status==='bought'&&g.type!=='dlc').forEach(g=>{const s=g.playStatus||'Unplayed';freq[s]=(freq[s]||0)+1;});
    const opts=order.filter(s=>freq[s]>0);
    if(!opts.length){list.innerHTML=`<div class="fbar-opt" style="color:var(--t3);cursor:default">No options</div>`;return;}
    list.innerHTML=`<div class="fbar-pills">${opts.map(v=>{
      const m=PS_META[v]||{code:'UP',cls:'ps-UP'};
      const sel=cfPlayStatus.has(v);
      return`<button class="col-ps-badge ${m.cls} fbar-pill${sel?' selected':''}" data-val="${esc(v)}" style="cursor:pointer">${m.code}<span class="fbar-pill-count fpc-light">${freq[v]||0}</span></button>`;
    }).join('')}</div>`;
    list.querySelectorAll('.fbar-pill').forEach(el=>{
      el.addEventListener('click',()=>{
        const v=el.dataset.val;
        cfPlayStatus.has(v)?cfPlayStatus.delete(v):cfPlayStatus.add(v);
        renderCollection();syncFbarBadges();refreshFbarCPlay();
      });
    });
  }
  document.getElementById('fbar-cplay-clear').onclick=()=>{cfPlayStatus=new Set();renderCollection();syncFbarBadges();refreshFbarCPlay();};

  // ── Wire collection platform ──
  function refreshFbarCPlat(){
    const list=document.getElementById('fbar-cplat-list');if(!list)return;
    const freq={};games.filter(g=>g.status==='bought').forEach(g=>{ownedPlatforms(g).forEach(p=>{if(p)freq[p]=(freq[p]||0)+1});});
    const platforms=Object.keys(freq);
    if(!platforms.length){list.innerHTML=`<div class="fbar-opt" style="color:var(--t3);cursor:default">No options</div>`;return;}
    list.innerHTML=`<div class="fbar-pills">${platforms.map(p=>{
      const sel=cfPlats.has(p);
      const cntCls=platTextColor(p)==='#fff'?'fpc-light':'fpc-dark';
      return`<button class="b-plat fbar-pill${sel?' selected':''}" data-val="${esc(p)}" style="background:${platColor(p)};color:${platTextColor(p)}">${esc(p)}<span class="fbar-pill-count ${cntCls}">${freq[p]}</span></button>`;
    }).join('')}</div>`;
    list.querySelectorAll('.fbar-pill').forEach(el=>{
      el.addEventListener('click',()=>{
        const v=el.dataset.val;
        cfPlats.has(v)?cfPlats.delete(v):cfPlats.add(v);
        renderCollection();syncFbarBadges();refreshFbarCPlat();
      });
    });
    // OR/AND picks the base match; OPEN/EXACT independently restricts to the
    // selected set having nothing extra — see the predicate for the full matrix.
    const logicEl=document.getElementById('fbar-cplat-logic');
    if(logicEl){
      logicEl.querySelectorAll('.fbar-logic-btn').forEach(b=>{
        b.classList.toggle('on',b.dataset.l===cfPlatLogic);
        b.onclick=()=>{
          cfPlatLogic=b.dataset.l;
          logicEl.querySelectorAll('.fbar-logic-btn').forEach(x=>x.classList.toggle('on',x.dataset.l===cfPlatLogic));
          renderCollection();syncFbarBadges();refreshFbarCPlat();
        };
      });
    }
    const closedEl=document.getElementById('fbar-cplat-closed');
    if(closedEl){
      closedEl.querySelectorAll('.fbar-logic-btn').forEach(b=>{
        b.classList.toggle('on',(b.dataset.c==='exact')===cfPlatClosed);
        b.onclick=()=>{
          cfPlatClosed=b.dataset.c==='exact';
          closedEl.querySelectorAll('.fbar-logic-btn').forEach(x=>x.classList.toggle('on',(x.dataset.c==='exact')===cfPlatClosed));
          renderCollection();syncFbarBadges();refreshFbarCPlat();
        };
      });
    }
  }
  document.getElementById('fbar-cplat-clear').onclick=()=>{cfPlats=new Set();renderCollection();syncFbarBadges();refreshFbarCPlat();};

  // ── Wire collection store ──
  function refreshFbarCStore(){
    renderGenreTagList(
      document.getElementById('fbar-cstore-list'),
      null,null,
      ()=>cfStores,(s)=>{cfStores=s;},()=>'or',()=>{},
      ()=>{const freq={};games.filter(g=>g.status==='bought').forEach(g=>gamePurchases(g).forEach(p=>{if(p.store)freq[p.store]=(freq[p.store]||0)+1}));return Object.keys(freq).sort().map(v=>({value:v,count:freq[v]}));},
      renderCollection
    );
  }
  document.getElementById('fbar-cstore-clear').onclick=()=>{cfStores=new Set();renderCollection();syncFbarBadges();refreshFbarCStore();};

  // ── Wire collection purchase date (Year + Month, both OR-only, share one Clear) ──
  function refreshFbarCDate(){
    renderGenreTagList(
      document.getElementById('fbar-cyear-list'),
      null,null,
      ()=>cfYears,(s)=>{cfYears=s;},()=>'or',()=>{},
      ()=>{
        const freq={};
        games.filter(g=>g.status==='bought').forEach(g=>gamePurchases(g).forEach(p=>{
          const d=normaliseDate(p.purchaseDate);
          if(d)freq[d.slice(0,4)]=(freq[d.slice(0,4)]||0)+1;
        }));
        return Object.keys(freq).sort((a,b)=>b.localeCompare(a)).map(v=>({value:v,count:freq[v]}));
      },
      renderCollection
    );
    renderGenreTagList(
      document.getElementById('fbar-cmonth-list'),
      null,null,
      ()=>cfMonths,(s)=>{cfMonths=s;},()=>'or',()=>{},
      ()=>{
        const freq={};
        games.filter(g=>g.status==='bought').forEach(g=>gamePurchases(g).forEach(p=>{
          const d=normaliseDate(p.purchaseDate);
          if(d){const m=parseInt(d.slice(5,7),10);if(m)freq[MONTH_NAMES[m-1]]=(freq[MONTH_NAMES[m-1]]||0)+1;}
        }));
        return MONTH_NAMES.filter(n=>freq[n]).map(v=>({value:v,count:freq[v]}));
      },
      renderCollection
    );
  }
  document.getElementById('fbar-cdate-clear').onclick=()=>{cfYears=new Set();cfMonths=new Set();renderCollection();syncFbarBadges();refreshFbarCDate();};

  // ── Wire collection steam collection ──
  function refreshFbarCCol(){
    renderGenreTagList(
      document.getElementById('fbar-ccol-list'),
      document.getElementById('fbar-ccol-search'),
      document.getElementById('fbar-ccol-logic'),
      ()=>cfSteamCol,(s)=>{cfSteamCol=s;},()=>cfSteamColLogic,(l)=>{cfSteamColLogic=l;},
      ()=>{const freq={};games.filter(g=>g.status==='bought'&&g.type!=='dlc').forEach(g=>(g.steamCollection||[]).forEach(c=>{if(c)freq[colLabel(c)]=(freq[colLabel(c)]||0)+1}));return Object.keys(freq).sort().map(v=>({value:v,count:freq[v]}));},
      renderCollection
    );
  }
  const fbarCColSearch=document.getElementById('fbar-ccol-search');
  if(fbarCColSearch)fbarCColSearch.addEventListener('input',refreshFbarCCol);
  document.getElementById('fbar-ccol-clear').onclick=()=>{cfSteamCol=new Set();renderCollection();syncFbarBadges();refreshFbarCCol();};

  // ── Clear all ──
  document.getElementById('fbarClearAll').onclick=()=>{
    if(appMode==='collection'){
      cfGenres=new Set();cfPlayStatus=new Set();cfPlats=new Set();cfStores=new Set();cfYears=new Set();cfMonths=new Set();cfSteamCol=new Set();
      renderCollection();
    } else {
      fGenres=new Set();fTags=new Set();fPrios=new Set();
      hrMinVal=0;hrMaxVal=100;_syncHotChips();
      renderAll();
    }
    syncFbarBadges();
    _fbarRefreshAll();
  };

  // ── Refresh open sections ──
  function _fbarRefreshSection(toggleId){
    if(toggleId==='fbar-genre-toggle')refreshFbarGenre();
    else if(toggleId==='fbar-tags-toggle')refreshFbarTags();
    else if(toggleId==='fbar-prio-toggle')refreshFbarPrio();
    else if(toggleId==='fbar-hot-toggle')_syncHotChips();
    else if(toggleId==='fbar-cgenre-toggle')refreshFbarCGenre();
    else if(toggleId==='fbar-cplay-toggle')refreshFbarCPlay();
    else if(toggleId==='fbar-cplat-toggle')refreshFbarCPlat();
    else if(toggleId==='fbar-cstore-toggle')refreshFbarCStore();
    else if(toggleId==='fbar-cdate-toggle')refreshFbarCDate();
    else if(toggleId==='fbar-ccol-toggle')refreshFbarCCol();
  }
  function _fbarRefreshAll(){
    fbarUpdateSlider=()=>{};  // no-op: slider replaced by chips
    ['fbar-genre-toggle','fbar-tags-toggle','fbar-prio-toggle','fbar-hot-toggle',
     'fbar-cgenre-toggle','fbar-cplay-toggle','fbar-cplat-toggle','fbar-cstore-toggle','fbar-cdate-toggle','fbar-ccol-toggle'].forEach(id=>{
      const btn=document.getElementById(id);
      if(btn&&btn.classList.contains('open'))_fbarRefreshSection(id);
    });
  }
  window._fbarRefreshAll=_fbarRefreshAll;

  // ── syncFbarBadges ──
  window.syncFbarBadges=function(){
    function sb(badgeId,count){
      const b=document.getElementById(badgeId);
      if(b){b.textContent=count;b.style.display=count>0?'':'none';}
    }
    sb('fbar-genre-badge',fGenres.size);
    sb('fbar-tags-badge',fTags.size);
    sb('fbar-prio-badge',fPrios.size);
    sb('fbar-cgenre-badge',cfGenres.size);
    sb('fbar-cplay-badge',cfPlayStatus.size);
    sb('fbar-cplat-badge',cfPlats.size);
    sb('fbar-cstore-badge',cfStores.size);
    sb('fbar-cdate-badge',cfYears.size+cfMonths.size);
    sb('fbar-ccol-badge',cfSteamCol.size);
    const hotActive=(hrMinVal>0||hrMaxVal<100)?1:0;
    sb('fbar-hot-badge',hotActive);
    // Total badge
    let total;
    if(appMode==='collection'){
      total=cfGenres.size+cfPlayStatus.size+cfPlats.size+cfStores.size+cfYears.size+cfMonths.size+cfSteamCol.size;
    } else {
      total=fGenres.size+fTags.size+fPrios.size+(hotActive?1:0);
    }
    sb('filtersTotalBadge',total);
    sb('fbarFabBadge',total);
    // fchips
    _renderFchips();
  };

  // ── Active filter chips ──
  function _renderFchips(){
    const el=document.getElementById('fchips');if(!el)return;
    const chips=[];
    function chip(label,val,onRemove){
      return`<span class="fchip"><span class="fchip-label">${label}</span><span class="fchip-val">${esc(val)}</span><button class="fchip-x" data-label="${esc(label)}" data-val="${esc(val)}">✕</button></span>`;
    }
    if(appMode!=='collection'){
      [...fGenres].forEach(v=>chips.push({label:'Genre',val:v,rm:()=>{fGenres.delete(v);renderAll();syncFbarBadges();_fbarRefreshAll();}}));
      [...fTags].forEach(v=>chips.push({label:'Tag',val:v,rm:()=>{fTags.delete(v);renderAll();syncFbarBadges();_fbarRefreshAll();}}));
      [...fPrios].forEach(v=>chips.push({label:'Priority',val:v,rm:()=>{fPrios.delete(v);renderAll();syncFbarBadges();_fbarRefreshAll();}}));
      if(hrMinVal>0||hrMaxVal<100)chips.push({label:'Hotness',val:`${hrMinVal}–${hrMaxVal}`,rm:()=>{fbarApply(0,100);}});
    } else {
      [...cfGenres].forEach(v=>chips.push({label:'Genre',val:v,rm:()=>{cfGenres.delete(v);renderCollection();syncFbarBadges();_fbarRefreshAll();}}));
      [...cfPlayStatus].forEach(v=>chips.push({label:'Status',val:v,rm:()=>{cfPlayStatus.delete(v);renderCollection();syncFbarBadges();_fbarRefreshAll();}}));
      [...cfPlats].forEach(v=>chips.push({label:'Platform',val:v,rm:()=>{cfPlats.delete(v);renderCollection();syncFbarBadges();_fbarRefreshAll();}}));
      [...cfStores].forEach(v=>chips.push({label:'Store',val:v,rm:()=>{cfStores.delete(v);renderCollection();syncFbarBadges();_fbarRefreshAll();}}));
      [...cfYears].forEach(v=>chips.push({label:'Year',val:v,rm:()=>{cfYears.delete(v);renderCollection();syncFbarBadges();_fbarRefreshAll();}}));
      [...cfMonths].forEach(v=>chips.push({label:'Month',val:v,rm:()=>{cfMonths.delete(v);renderCollection();syncFbarBadges();_fbarRefreshAll();}}));
      [...cfSteamCol].forEach(v=>chips.push({label:'Collection',val:v,rm:()=>{cfSteamCol.delete(v);renderCollection();syncFbarBadges();_fbarRefreshAll();}}));
    }
    if(!chips.length){el.innerHTML='';return;}
    el.innerHTML=chips.map(c=>`<span class="fchip"><span class="fchip-label">${esc(c.label)}</span><span class="fchip-val">${esc(c.val)}</span><button class="fchip-x" data-idx="${chips.indexOf(c)}">✕</button></span>`).join('');
    el.querySelectorAll('.fchip-x').forEach(btn=>{
      const idx=parseInt(btn.dataset.idx);
      btn.addEventListener('click',e=>{e.stopPropagation();chips[idx].rm();});
    });
  }

  // Initial state
  syncFbarBadges();
})();

// ── BACK TO TOP ──
(function(){
  const btn=document.getElementById('back-to-top');
  const content=document.getElementById('content');
  if(!btn||!content)return;
  function checkScroll(){
    btn.classList.toggle('visible',(content.scrollTop||window.scrollY)>200);
  }
  content.addEventListener('scroll',checkScroll,{passive:true});
  window.addEventListener('scroll',checkScroll,{passive:true});
  btn.addEventListener('click',()=>{
    content.scrollTo({top:0,behavior:'smooth'});
    window.scrollTo({top:0,behavior:'smooth'});
  });
})();

// ── RADIAL QUICK-ACCESS FAB ──
(function(){
  const fab=document.getElementById('qfab');
  const btn=document.getElementById('qfabBtn');
  const ov=document.getElementById('qfab-ov');
  if(!fab||!btn||!ov)return;

  function openQfab(e){
    if(e)e.stopPropagation();
    fab.classList.add('open');
    ov.classList.add('on');
    history.pushState({qfabOpen:true},'','');
  }
  function closeQfab(){
    fab.classList.remove('open');
    ov.classList.remove('on');
    if(history.state&&history.state.qfabOpen)history.replaceState(null,'','');
  }
  btn.addEventListener('click',function(e){
    fab.classList.contains('open')?closeQfab():openQfab(e);
  });
  ov.addEventListener('click',closeQfab);
  window.addEventListener('popstate',function(e){
    if(fab.classList.contains('open')){fab.classList.remove('open');ov.classList.remove('on');}
  });

  document.getElementById('qfabCal').addEventListener('click',()=>{closeQfab();openCalendar();});
  document.getElementById('qfabMode').addEventListener('click',()=>{
    closeQfab();
    setAppMode(appMode==='wishlist'?'collection':'wishlist');
  });
  document.getElementById('qfabView').addEventListener('click',()=>{
    closeQfab();
    vm=vm==='grid'?'list':'grid';
    dispatchRender();
    applyVm();
  });
  document.getElementById('qfabSync').addEventListener('click',()=>{
    closeQfab();
    if(!OFFLINE)resync();
  });
})();

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
restoreFromHash();
handleShareTarget();
initData();
