'use strict';
(() => {
const api = window.veloriaDesktop;
if (!api?.isDesktop) {
  document.body.innerHTML = '<div style="padding:40px;font-family:system-ui">Veloria Notes masaüstü köprüsü yüklenemedi.</div>';
  return;
}

const VERSION='V1.1';
const editorUtils=window.VeloriaEditor;
const now=()=>new Date().toISOString();
const uid=(p='id')=>`${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
const clone=x=>JSON.parse(JSON.stringify(x));
const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=esc;
const js=(v='')=>attr(JSON.stringify(String(v??''))); // HTML-safe JavaScript string literal
const norm=(v='')=>String(v||'').replace(/\\/g,'/').replace(/\/+/g,'/').toLowerCase();
const fmtBytes=(n=0)=>{n=Number(n)||0;if(n<1024)return `${n} B`;const u=['KB','MB','GB','TB'];let i=-1;do{n/=1024;i++}while(n>=1024&&i<u.length-1);return `${n>=10?n.toFixed(1):n.toFixed(2)} ${u[i]}`};
const fmtDate=v=>{try{return new Date(v).toLocaleString('tr-TR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch{return''}};
const RESERVED_SEGMENTS=new Set(['CON','PRN','AUX','NUL','COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9','LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9']);
const safeSegment=(v='')=>{let out=String(v||'').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1F]/g,'_').replace(/[. ]+$/g,'').trim();if(!out)out='İsimsiz';if(RESERVED_SEGMENTS.has(out.toUpperCase()))out=`_${out}`;return out.slice(0,100)};
const isImage=n=>/\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(String(n||''));
const isText=n=>/\.(txt|md|markdown|json|jsonc|ya?ml|toml|ini|env|log|csv|tsv|js|mjs|cjs|jsx|ts|tsx|html?|css|scss|sass|less|xml|py|java|c|cc|cpp|h|hpp|cs|go|rs|php|sh|bash|zsh|ps1|sql|vue|svelte|properties|conf|config)$/i.test(String(n||''));
const isPdf=n=>/\.pdf$/i.test(String(n||''));
const extOf=n=>{const m=String(n||'').match(/\.([^.]+)$/);return m?m[1].toUpperCase():'DOSYA'};
const iconForFile=n=>isImage(n)?'▧':isPdf(n)?'PDF':isText(n)?'</>':/\.(zip|rar|7z|tar|gz)$/i.test(n)?'ZIP':'•';
const winJoin=(...parts)=>parts.filter(Boolean).map((x,i)=>{x=String(x);return i?x.replace(/^[\\/]+|[\\/]+$/g,''):x.replace(/[\\/]+$/g,'')}).join('\\');


const V1_RICH_TAGS=new Set(['A','B','STRONG','I','EM','U','S','DEL','CODE','PRE','BR','P','DIV','SPAN','BLOCKQUOTE','UL','OL','LI','HR','TABLE','THEAD','TBODY','TR','TH','TD','H1','H2','H3','H4','H5','H6','IMG']);
function v1SafeHref(raw){try{const u=new URL(String(raw||''),location.href);return ['http:','https:','mailto:'].includes(u.protocol)?u.href:''}catch{return''}}
function v1SanitizeRichHtml(html){
  const source=document.createElement('div');source.innerHTML=String(html||'');
  const cleanNode=node=>{
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.nodeValue||'');
    if(node.nodeType!==Node.ELEMENT_NODE)return document.createDocumentFragment();
    const tag=node.tagName.toUpperCase();
    if(!V1_RICH_TAGS.has(tag))return document.createTextNode(node.textContent||'');
    const out=document.createElement(tag.toLowerCase());
    if(node.className){const cls=String(node.className).split(/\s+/).filter(x=>/^[a-z0-9_-]{1,64}$/i.test(x)).slice(0,12).join(' ');if(cls)out.className=cls}
    if(tag==='A'){
      const href=v1SafeHref(node.getAttribute('href'));if(href){out.setAttribute('href',href);out.setAttribute('rel','noopener noreferrer');if(node.hasAttribute('data-veloria-auto-link'))out.dataset.veloriaAutoLink='1'}
    }
    if(tag==='OL'){const start=Math.trunc(Number(node.getAttribute('start')));if(Number.isFinite(start)&&start>0&&start<100000)out.setAttribute('start',String(start))}
    if(tag==='TD'||tag==='TH')for(const a of ['colspan','rowspan']){const n=Math.trunc(Number(node.getAttribute(a)));if(n>1&&n<=100)out.setAttribute(a,String(n))}
    if(tag==='CODE'){const lang=String(node.getAttribute('data-language')||'').replace(/[^a-z0-9_+.#-]/gi,'').slice(0,32);if(lang)out.dataset.language=lang}
    if(tag==='SPAN'&&node.hasAttribute('data-veloria-inline-image')){
      out.dataset.veloriaInlineImage='1';
      out.dataset.nativePath=String(node.getAttribute('data-native-path')||'').slice(0,4096);
      out.dataset.name=String(node.getAttribute('data-name')||'Görsel').slice(0,512);
      const width=Math.max(100,Math.min(2400,Math.round(Number(node.getAttribute('data-width'))||Number.parseFloat(node.style.width)||240)));
      out.dataset.width=String(width);out.style.width=`${width}px`;out.setAttribute('contenteditable','false');
      const align=String(node.getAttribute('data-align')||'inline');if(['inline','left','right','center'].includes(align))out.dataset.align=align;
    }
    if(tag==='SPAN'&&node.hasAttribute('data-veloria-inline-file')){
      out.dataset.veloriaInlineFile='1';out.dataset.nativePath=String(node.getAttribute('data-native-path')||'').slice(0,4096);
      out.dataset.name=String(node.getAttribute('data-name')||'Dosya').slice(0,512);out.dataset.kind=node.getAttribute('data-kind')==='folder'?'folder':'file';
    }
    if(tag==='SPAN'&&node.getAttribute('contenteditable')==='false')out.setAttribute('contenteditable','false');
    if(tag==='IMG'){out.setAttribute('alt',String(node.getAttribute('alt')||'Görsel').slice(0,512));out.setAttribute('draggable','false')}
    for(const child of [...node.childNodes])out.appendChild(cleanNode(child));
    return out;
  };
  const result=document.createElement('div');for(const child of [...source.childNodes])result.appendChild(cleanNode(child));return result.innerHTML;
}

const el={
  tree:document.getElementById('tree'),content:document.getElementById('content'),tabs:document.getElementById('tabs'),
  workspaceName:document.getElementById('workspaceName'),search:document.getElementById('treeSearch'),modal:document.getElementById('modalRoot'),
  context:document.getElementById('contextRoot'),queue:document.getElementById('queue'),toast:document.getElementById('toast'),lock:document.getElementById('lockRoot'),
  save:document.getElementById('saveStatus'),statusContext:document.getElementById('statusContext'),statusDetails:document.getElementById('statusDetails')
};

let state=null;
let info=null;
let appReady=false;
let initError=null;
let scan={files:[],directories:[],rootPath:'',loaded:false};
const missingAttachmentPaths=new Set();
function attachmentPathMissing(filePath){
  const p=String(filePath||'');
  if(!p)return false;
  const key=norm(p);
  if(missingAttachmentPaths.has(key))return true;
  if(scan.loaded)return !scan.files.some(f=>norm(f.nativePath)===key);
  return false;
}
let saveTimer=null;
let saveWaiters=[];
let pageTxtTimers=new Map();
let previewCache=new Map();
let treeSelection=null;
let treeClipboard=null;
let fileSelection=new Set();
let fileAnchor=null;
let currentView={kind:'empty',id:'',path:''};
let tabs=[];
let fileEditor=null;
let blockDragId='';
let inlineCreate=null;
let treeDrag=null;
let undoStack=[];
let externalWatchTimer=null;
let toastTimer=null;
let modalResolve=null;
let queueItems=new Map();
let queueCleanupTimer=null;
function defaultUi(){return {openTabs:[],scroll:{},folderOpen:{},folderPrefs:{},blockCollapsed:{},galleryMode:'hybrid',thumbSize:'medium',showImageNames:true,selectedTab:'',defaultImageMode:'gallery',defaultImageWidth:240,defaultFileDisplay:'card',showAttachmentPaths:false}}
let ui=defaultUi();
async function loadUiFromDisk(){try{const r=await api.readUiState();if(r?.text)ui={...defaultUi(),...JSON.parse(r.text)}}catch{ui=defaultUi()}ui.openTabs=[];ui.selectedTab=''}
function syncOpenTabs(){if(!Array.isArray(tabs))return;ui.openTabs=tabs.map(t=>({kind:t.kind,id:t.id||'',path:t.path||'',name:t.name||'',title:t.title||t.name||''}))}
function saveUi(){try{syncOpenTabs();api.saveUiState(JSON.stringify(ui)).catch(()=>{})}catch{}}

function newWorkspace(name='Kişisel'){
  const c={id:uid('cat'),name:name==='Kişisel'?'Genel':name,icon:'folder',collapsed:false,parentId:null,order:0};
  return {id:uid('ws'),name,categories:[c],pages:[],createdAt:now(),updatedAt:now()};
}
function defaultState(){const w=newWorkspace('Kişisel');return {schema:68,theme:'dark',workspaceSystem:{activeId:w.id,items:[w]},categories:clone(w.categories),pages:[],activePageId:null,fileMeta:{},meta:{updatedAt:now()},prefs:{showNoteMirror:true,autoGroup:false,confirmPhysicalDelete:true}}}
function migrateBlock(b){
  if(!b||typeof b!=='object')return {id:uid('blk'),type:'richtext',html:''};
  const id=b.id||uid('blk'),type=String(b.type||'text');
  if(type==='checklist'){const text=(b.items||[]).map(i=>`${i.done||i.status==='done'?'☑':'☐'} ${i.text||''}`).join('\n');return {id,type:'text',text}}
  if(type==='richtext')return {id,type:'richtext',html:v1SanitizeRichHtml(b.html||'')};
  if(type==='markdown')return {id,type:'richtext',html:v1SanitizeRichHtml(v685MarkdownToHtml(String(b.text||'')))};
  if(type==='text'||type==='quote'||type==='callout')return {id,type:'text',text:String(b.text||'')};
  if(type==='heading')return {id,type:'heading',text:String(b.text||''),level:Number(b.level)||2};
  if(type==='link'||type==='source')return {id,type:'link',title:String(b.title||b.text||''),url:String(b.url||'')};
  if(type==='code'||type==='mermaid'||type==='diff')return {id,type:'code',code:String(b.code||b.text||''),language:String(b.language||'text')};
  if(type==='divider')return {id,type:'divider'};
  if(type==='attachment')return {id,type:'attachment',name:String(b.name||'Dosya'),size:Number(b.size)||0,typeMime:String(b.typeMime||b.mime||''),nativePath:String(b.nativePath||b.storagePath||''),relativePath:String(b.relativePath||''),contentHash:String(b.contentHash||b.checksum||''),displayMode:b.displayMode||(isImage(b.name)?'gallery':'list'),imageSize:b.imageSize||'medium',imageWidth:Number(b.imageWidth)||240,fileDisplay:b.fileDisplay||'card',showPath:typeof b.showPath==='boolean'?b.showPath:null};
  if(b.html)return {id,type:'richtext',html:v1SanitizeRichHtml(b.html)};
  if(b.code)return {id,type:'code',code:String(b.code),language:String(b.language||'text')};
  return {id,type:'text',text:String(b.text||b.title||'')};
}
function migrateState(raw){
  if(!raw||typeof raw!=='object')return defaultState();
  const base=defaultState();
  const s={schema:68,theme:raw.theme==='light'?'light':'dark',workspaceSystem:base.workspaceSystem,categories:[],pages:[],activePageId:null,fileMeta:{...(raw.fileMeta||{})},meta:{updatedAt:raw.meta?.updatedAt||now()},prefs:{showNoteMirror:raw.prefs?.showNoteMirror!==false,autoGroup:!!raw.prefs?.autoGroup,confirmPhysicalDelete:raw.prefs?.confirmPhysicalDelete!==false}};
  let ws=raw.workspaceSystem;
  if(!ws||!Array.isArray(ws.items)||!ws.items.length){
    const w={id:uid('ws'),name:'Kişisel',categories:Array.isArray(raw.categories)?raw.categories:[],pages:Array.isArray(raw.pages)?raw.pages:[],createdAt:now(),updatedAt:now()};
    ws={activeId:w.id,items:[w]};
  }
  ws.items=ws.items.filter(Boolean).map((w,wi)=>{
    const cats=(Array.isArray(w.categories)?w.categories:[]).map((c,i)=>({...c,id:c.id||uid('cat'),name:c.name||'Klasör',parentId:c.parentId||null,order:Number.isFinite(c.order)?c.order:i,collapsed:!!c.collapsed,icon:c.icon||'folder'}));
    if(!cats.length)cats.push({id:uid('cat'),name:wi===0?'Genel':(w.name||'Çalışma Alanı'),parentId:null,order:0,collapsed:false,icon:'folder'});
    const valid=new Set(cats.map(c=>c.id));
    for(const c of cats)if(c.parentId&&!valid.has(c.parentId))c.parentId=null;
    const first=cats[0].id;
    const pages=(Array.isArray(w.pages)?w.pages:[]).filter(p=>!p.deletedAt&&!p.archived).map((p,i)=>({...p,id:p.id||uid('page'),categoryId:valid.has(p.categoryId)?p.categoryId:first,parentId:null,order:Number.isFinite(p.order)?p.order:i,title:p.title||'İsimsiz',blocks:(p.blocks||[]).map(migrateBlock),updatedAt:p.updatedAt||now(),createdAt:p.createdAt||now(),deletedAt:null,archived:false}));
    return {id:w.id||uid('ws'),name:w.name||`Çalışma Alanı ${wi+1}`,categories:cats,pages,createdAt:w.createdAt||now(),updatedAt:w.updatedAt||now()};
  });
  if(!ws.items.some(w=>w.id===ws.activeId))ws.activeId=ws.items[0].id;
  s.workspaceSystem=ws;s.schema=68;
  hydrateWorkspace(s,false);
  s.activePageId=s.pages.some(p=>p.id===raw.activePageId)?raw.activePageId:null;
  return s;
}
function activeWorkspace(){return state.workspaceSystem.items.find(w=>w.id===state.workspaceSystem.activeId)||state.workspaceSystem.items[0]}
function captureWorkspace(){const w=activeWorkspace();if(!w)return;w.categories=clone(state.categories);w.pages=clone(state.pages);w.updatedAt=now()}
function hydrateWorkspace(s=state,clearView=true){const w=s.workspaceSystem.items.find(x=>x.id===s.workspaceSystem.activeId)||s.workspaceSystem.items[0];s.categories=clone(w?.categories||[]);s.pages=clone(w?.pages||[]);if(clearView)s.activePageId=null}
function categories(){return state.categories||[]}
function pages(){return state.pages||[]}
function allWorkspacePages(){const out=[...pages()],activeId=state?.workspaceSystem?.activeId;for(const w of state?.workspaceSystem?.items||[])if(w?.id!==activeId&&Array.isArray(w.pages))out.push(...w.pages);return out}
function cat(id){return categories().find(x=>x.id===id)}
function page(id){return pages().find(x=>x.id===id)}
function catChildren(parentId){return categories().filter(c=>(c.parentId||null)===(parentId||null)).sort((a,b)=>(a.order||0)-(b.order||0)||String(a.name).localeCompare(String(b.name),'tr'))}
function pagesInCat(id){return pages().filter(p=>p.categoryId===id).sort((a,b)=>(a.order||0)-(b.order||0)||String(a.title).localeCompare(String(b.title),'tr'))}
function catDesc(id){const out=[];const walk=p=>{for(const c of catChildren(p)){out.push(c.id);walk(c.id)}};walk(id);return out}
function catPath(id){const out=[];let c=cat(id),guard=0;while(c&&guard++<60){out.unshift(c.name);c=c.parentId?cat(c.parentId):null}return out}
function categoryPathFromList(list,id){const out=[];let c=(list||[]).find(x=>x.id===id),guard=0;while(c&&guard++<60){out.unshift(c.name);c=c.parentId?(list||[]).find(x=>x.id===c.parentId):null}return out}
function catIdsPath(id){const out=[];let c=cat(id),guard=0;while(c&&guard++<60){out.unshift(c.id);c=c.parentId?cat(c.parentId):null}return out}
function physicalPathFromSegments(segments){if(!info?.rootPath)return '';return winJoin(info.rootPath,...(segments||[]).map(safeSegment))}
function categoryPhysicalPath(id){return physicalPathFromSegments(catPath(id))}
function categoryPhysicalRelative(id){return catPath(id).map(safeSegment).join('/')}
function physicalNameKey(v){return safeSegment(v).toLocaleLowerCase('tr')}
function pagePhysicalRootFromParts(categoryNames,title){return physicalPathFromSegments([...(categoryNames||[]),safeSegment(title||'İsimsiz')])}
async function ensureCategoryPhysical(id){const p=categoryPhysicalPath(id);if(!p)return null;return api.makeManagedDirectory(p)}
async function pruneEmptyPhysical(path){if(!path||!api.pruneEmptyManagedDirectory)return null;try{return await api.pruneEmptyManagedDirectory(path)}catch(e){console.warn('Veloria empty-folder prune:',e);return null}}
async function syncAllCategoryDirectories(){if(!state||!info?.rootPath)return;for(const c of categories()){try{await ensureCategoryPhysical(c.id)}catch(e){console.warn('Veloria category directory sync:',c?.name,e)}}}
function reportPhysicalError(prefix,e){console.error(prefix,e);toast(`${prefix}: ${e?.message||e}`,'error')}
function currentWorkspaceName(){return activeWorkspace()?.name||'Kişisel'}
function clippedName(value,fallback,max){const raw=String(value||'').trim()||fallback;return raw.slice(0,max).trim()||fallback}
function suffixedName(base,index,max){const suffix=` (${index})`,room=Math.max(1,max-suffix.length);return `${base.slice(0,room).trimEnd()}${suffix}`}
function uniquePageTitle(categoryId,base='Yeni Sayfa',exclude=''){base=clippedName(base,'Yeni Sayfa',100);let n=base,i=2;const targetPath=norm(catPath(categoryId).map(safeSegment).join('/')),names=new Set();for(const p of pages())if(p.categoryId===categoryId&&p.id!==exclude)names.add(physicalNameKey(p.title));const activeId=state?.workspaceSystem?.activeId;for(const w of state?.workspaceSystem?.items||[]){if(!w||w.id===activeId)continue;for(const p of w.pages||[]){const rel=norm(categoryPathFromList(w.categories,p.categoryId).map(safeSegment).join('/'));if(rel===targetPath)names.add(physicalNameKey(p.title))}}while(names.has(physicalNameKey(n))&&i<10000)n=suffixedName(base,i++,100);if(names.has(physicalNameKey(n)))n=`${uid('sayfa').slice(-12)} ${base}`.slice(0,100);return n}
function uniqueCategoryName(parentId,base='Yeni Klasör',exclude=''){base=clippedName(base,'Yeni Klasör',80);let n=base,i=2;const names=new Set(catChildren(parentId).filter(c=>c.id!==exclude).map(c=>physicalNameKey(c.name)));while(names.has(physicalNameKey(n))&&i<10000)n=suffixedName(base,i++,80);if(names.has(physicalNameKey(n)))n=`${uid('klasor').slice(-12)} ${base}`.slice(0,80);return n}

async function loadState(){
  info=await api.getInfo().catch(()=>({rootPath:'',localOnly:true}));
  await loadUiFromDisk();
  let disk=null;
  try{const r=await api.readAppState();if(r?.text)disk=JSON.parse(r.text)}catch{throw new Error('Not verisi okunamadı. Mevcut dosya korundu; Kurtarma ekranından bir yedek seçebilirsin.')}
  state=migrateState(disk);
  document.body.classList.toggle('light',state.theme==='light');
  captureWorkspace();
  await persist(false);
}
let saveStatusDelay=null;
function setSaveStatus(text,kind='saved'){if(!el.save)return;el.save.textContent=text;el.save.className=`status-save ${kind}`}
function beginCalmSaveStatus(){clearTimeout(saveStatusDelay);saveStatusDelay=setTimeout(()=>setSaveStatus('Kaydediliyor…','saving'),260)}
function finishCalmSaveStatus(text='Kaydedildi',kind='saved'){clearTimeout(saveStatusDelay);saveStatusDelay=null;setSaveStatus(text,kind)}
function persist(show=true){
  if(!state)return Promise.resolve();state.meta=state.meta||{};state.meta.updatedAt=now();clearTimeout(saveTimer);if(show)beginCalmSaveStatus();
  return new Promise(resolve=>{saveWaiters.push(resolve);saveTimer=setTimeout(async()=>{try{captureWorkspace();const text=JSON.stringify(state);await api.saveAppState(text);if(show)finishCalmSaveStatus('Kaydedildi','saved')}catch(e){finishCalmSaveStatus('Kaydedilemedi','error');toast(e?.message||'Kaydedilemedi','error')}finally{const waiters=saveWaiters.splice(0);for(const done of waiters)try{done()}catch{}}},220)})
}
function pagePlainText(p){const out=[];for(const b of p.blocks||[]){if(b.type==='text')out.push(b.text||'');else if(b.type==='richtext'){const d=document.createElement('div');d.innerHTML=b.html||'';out.push(d.textContent||'')}else if(b.type==='heading')out.push(b.text||'');else if(b.type==='link')out.push(`${b.title||''} ${b.url||''}`.trim());else if(b.type==='code')out.push(b.code||'');}return `${p.title||'İsimsiz'}\r\n\r\n${out.filter(Boolean).join('\r\n\r\n')}`}
function schedulePageTxt(p,force=false){if(!p)return;clearTimeout(pageTxtTimers.get(p.id));pageTxtTimers.delete(p.id);const go=async()=>{try{beginCalmSaveStatus();const r=await api.savePageText({pageId:p.id,pageTitle:p.title,category:cat(p.categoryId)?.name||'Klasör',categoryPath:catPath(p.categoryId),storageRootId:p.nativeStorageRootId||'primary',text:pagePlainText(p)});if(r?.path){p.nativeTxtPath=r.path;p.nativeTxtRelativePath=r.relativePath||''}finishCalmSaveStatus('Kaydedildi','saved');captureWorkspace();api.saveAppState(JSON.stringify(state)).catch(()=>{})}catch(e){finishCalmSaveStatus('TXT kaydı hatalı','error');console.warn(e)}};if(force)return go();pageTxtTimers.set(p.id,setTimeout(()=>{pageTxtTimers.delete(p.id);go()},950))}
function cancelPageTxtSave(pageId){clearTimeout(pageTxtTimers.get(pageId));pageTxtTimers.delete(pageId)}
function cleanupDeletedPageUi(pageIds){for(const id of pageIds||[]){delete ui.scroll?.[`page:${id}`];delete ui.blockCollapsed?.[id]}saveUi()}
async function deletePageMirrors(pageList){
  const list=(pageList||[]).filter(Boolean);if(!list.length)return true;
  for(const p of list)cancelPageTxtSave(p.id);
  try{
    const r=await api.deletePageTexts(list.map(p=>({pageId:p.id,filePath:p.nativeTxtPath||''})));
    if(r?.errors?.length)throw new Error(r.errors.map(x=>x.error||x.pageId).join(' · '));
    return true
  }catch(e){
    // Sayfa UI'da kalacaksa silinen TXT kopyalarını yeniden üret; yarım silme bırakma.
    for(const p of list)try{await schedulePageTxt(p,true)}catch{}
    toast(`Not dosyası silinemedi: ${e?.message||e}`,'error');
    return false
  }
}
function touchPage(p){if(!p)return;p.updatedAt=now();persist(false);schedulePageTxt(p)}

function toast(msg,type='ok'){clearTimeout(toastTimer);el.toast.textContent=String(msg);el.toast.className=`toast ${type==='warn'?'warn':type==='error'?'error':''} show`;toastTimer=setTimeout(()=>el.toast.classList.remove('show'),2400)}
function closeContext(){el.context.innerHTML=''}
function showContext(x,y,html){el.context.innerHTML=`<div class="context" style="left:${Math.min(x,innerWidth-230)}px;top:${Math.min(y,innerHeight-330)}px">${html}</div>`}
function closeModal(value){el.modal.innerHTML='';if(modalResolve){const r=modalResolve;modalResolve=null;r(value)}}
function modal(html,wide=false){el.modal.innerHTML=`<div class="modal-backdrop" data-backdrop><div class="modal ${wide?'wide':''}">${html}</div></div>`;el.modal.querySelector('[data-backdrop]').addEventListener('mousedown',e=>{if(e.target===e.currentTarget)closeModal(null)});setTimeout(()=>el.modal.querySelector('[autofocus]')?.focus(),20)}
function confirmModal(title,text,ok='Tamam',danger=false){return new Promise(resolve=>{modalResolve=resolve;modal(`<div class="modal-head"><h3>${esc(title)}</h3><span class="grow"></span><button class="icon-btn" onclick="window.v68CloseModal(false)">✕</button></div><div class="modal-body"><div style="color:var(--muted);line-height:1.65">${esc(text)}</div><div class="modal-actions"><button class="btn" onclick="window.v68CloseModal(false)">İptal</button><button class="btn ${danger?'danger':'primary'}" onclick="window.v68CloseModal(true)">${esc(ok)}</button></div></div>`)} )}
window.v68CloseModal=closeModal;
function choiceModal(title,choices){return new Promise(resolve=>{modalResolve=resolve;modal(`<div class="modal-head"><h3>${esc(title)}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal(null)">✕</button></div><div class="modal-body"><div class="choice-grid">${choices.map(c=>`<button class="choice" onclick="v68CloseModal('${attr(c.value)}')"><strong>${esc(c.title)}</strong><small>${esc(c.sub||'')}</small></button>`).join('')}</div></div>`)})}

function openTab(t,activate=true){const key=t.kind==='file'?`file:${norm(t.path)}`:`${t.kind}:${t.id}`;let ex=tabs.find(x=>x.key===key);if(!ex){ex={...t,key};tabs.push(ex)}else Object.assign(ex,t);if(activate){ui.selectedTab=key;activateTab(key)}saveUi();renderTabs();return ex}
function activateTab(key){const t=tabs.find(x=>x.key===key);if(!t)return;ui.selectedTab=key;saveUi();if(t.kind==='page')openPage(t.id,false);else if(t.kind==='folder')openFolder(t.id,false);else if(t.kind==='file')openFile(t.path,t.name,false)}
function closeTab(key,e){e?.stopPropagation();const i=tabs.findIndex(x=>x.key===key);if(i<0)return;if(fileEditor?.dirty&&tabs[i].kind==='file'&&norm(tabs[i].path)===norm(fileEditor.path)){if(!confirm('Bu dosyada kaydedilmemiş değişiklikler var. Sekme kapatılsın mı?'))return}tabs.splice(i,1);if(ui.selectedTab===key){const next=tabs[Math.max(0,i-1)]||tabs[0];if(next)activateTab(next.key);else{currentView={kind:'empty',id:'',path:''};renderContent()}}renderTabs();saveUi()}
function renderTabs(){el.tabs.innerHTML=tabs.map(t=>`<button class="tab ${ui.selectedTab===t.key?'active':''}" onclick="v68ActivateTab('${attr(t.key)}')"><span>${t.kind==='folder'?'▣':t.kind==='file'?iconForFile(t.name):'▤'}</span><span class="tab-title">${esc(t.title||t.name||'İsimsiz')}</span>${t.dirty?'<span class="dirty">•</span>':''}<span class="close" onclick="v68CloseTab('${attr(t.key)}',event)">×</span></button>`).join('')}
window.v68ActivateTab=activateTab;window.v68CloseTab=closeTab;
function markTabDirty(kind,idOrPath,dirty=true){const key=kind==='file'?`file:${norm(idOrPath)}`:`${kind}:${idOrPath}`;const t=tabs.find(x=>x.key===key);if(t&&!!t.dirty!==!!dirty){t.dirty=!!dirty;renderTabs()}}

function renderTree(){
  el.workspaceName.textContent=currentWorkspaceName();
  const q=el.search.value.trim().toLocaleLowerCase('tr');
  const roots=catChildren(null).filter(c=>treeMatch(c,q));
  el.tree.innerHTML=roots.length?roots.map(c=>renderCat(c,q,0)).join(''):`<div class="tree-empty">${q?'Eşleşme bulunamadı.':'Henüz klasör yok. Yukarıdaki + ile oluştur.'}</div>`;
  restoreInlineFocus();
}
function treeMatch(c,q){if(!q)return true;if(c.name.toLocaleLowerCase('tr').includes(q))return true;if(pagesInCat(c.id).some(p=>p.title.toLocaleLowerCase('tr').includes(q)))return true;return catDesc(c.id).some(id=>{const x=cat(id);return x?.name.toLocaleLowerCase('tr').includes(q)||pagesInCat(id).some(p=>p.title.toLocaleLowerCase('tr').includes(q))})}
function renderCat(c,q,depth){
  const open=q?true:(ui.folderOpen[c.id]!==undefined?ui.folderOpen[c.id]:!c.collapsed);
  const ps=pagesInCat(c.id).filter(p=>!q||p.title.toLocaleLowerCase('tr').includes(q)||c.name.toLocaleLowerCase('tr').includes(q));
  const children=catChildren(c.id).filter(x=>treeMatch(x,q));
  const sz=folderSize(c.id);
  const selected=treeSelection?.kind==='folder'&&treeSelection.id===c.id;
  return `<div class="folder-node" data-cat="${attr(c.id)}" draggable="true" ondragstart="v68TreeDragStart(event,'folder','${attr(c.id)}')" ondragend="v68TreeDragEnd(event)">
    <div class="folder-row ${selected?'selected':''}" data-drop-folder="${attr(c.id)}" ondragover="v68TreeDragOver(event,'${attr(c.id)}')" ondragleave="v68TreeDragLeave(event)" ondrop="v68TreeDrop(event,'${attr(c.id)}')" oncontextmenu="v68FolderMenu(event,'${attr(c.id)}')">
      <button class="chev" onclick="v68ToggleFolder('${attr(c.id)}')">${open?'⌄':'›'}</button>
      <button class="row-main" onclick="v68SelectFolder('${attr(c.id)}')" ondblclick="v68OpenFolder('${attr(c.id)}')"><span class="row-icon">▣</span><span class="title">${esc(c.name)}</span><span class="folder-size">${sz?fmtBytes(sz):''}</span></button>
      <button class="row-dot" title="Yeni" onclick="event.stopPropagation();v68InlineCreate('${attr(c.id)}','page')">＋</button>
      <button class="row-dot" onclick="v68FolderMenu(event,'${attr(c.id)}')">⋮</button>
    </div>
    ${open?`<div class="children">${inlineCreate?.parentId===c.id?renderInlineCreate():''}${ps.map(p=>renderPageRow(p)).join('')}${children.map(x=>renderCat(x,q,depth+1)).join('')}</div>`:''}
  </div>`
}
function renderPageRow(p){const selected=treeSelection?.kind==='page'&&treeSelection.id===p.id;return `<div class="page-row ${selected?'selected':''}" data-page="${attr(p.id)}" draggable="true" ondragstart="v68TreeDragStart(event,'page','${attr(p.id)}')" ondragend="v68TreeDragEnd(event)" ondragover="v68PageDragOver(event,'${attr(p.id)}')" ondragleave="v68TreeDragLeave(event)" ondrop="v68PageDrop(event,'${attr(p.id)}')" oncontextmenu="v68PageMenu(event,'${attr(p.id)}')"><span class="chev" style="visibility:hidden">›</span><button class="row-main" onclick="v68SelectPage('${attr(p.id)}')" ondblclick="v68OpenPage('${attr(p.id)}')"><span class="row-icon">▤</span><span class="title">${esc(p.title)}</span></button><button class="row-dot" onclick="v68PageMenu(event,'${attr(p.id)}')">⋮</button></div>`}
function renderInlineCreate(){return `<div class="inline-create"><input id="inlineCreateInput" data-kind="${inlineCreate.kind}" placeholder="${inlineCreate.kind==='folder'?'Alt klasör adı':'Sayfa adı'}" onkeydown="v68InlineKey(event)"><button onclick="v68InlineCommit()">✓</button><button onclick="v68InlineCancel()">×</button></div>`}
function restoreInlineFocus(){if(!inlineCreate)return;setTimeout(()=>{const x=document.getElementById('inlineCreateInput');if(x){x.focus();x.select()}},10)}
window.v68ToggleFolder=id=>{ui.folderOpen[id]=! (ui.folderOpen[id]!==undefined?ui.folderOpen[id]:!cat(id)?.collapsed);saveUi();renderTree()};
window.v68SelectFolder=id=>{treeSelection={kind:'folder',id};openFolder(id)};
window.v68SelectPage=id=>{treeSelection={kind:'page',id};renderTree();openPage(id)};
window.v68OpenFolder=id=>openFolder(id);window.v68OpenPage=id=>openPage(id);
window.v68InlineCreate=(parentId,kind='page')=>{inlineCreate={parentId:parentId||null,kind};ui.folderOpen[parentId]=true;renderTree()};
window.v68InlineCancel=()=>{inlineCreate=null;renderTree()};window.v68InlineKey=e=>{if(e.key==='Enter'){e.preventDefault();v68InlineCommit()}else if(e.key==='Escape'){e.preventDefault();v68InlineCancel()}};
window.v68InlineCommit=()=>{if(!inlineCreate)return;const name=document.getElementById('inlineCreateInput')?.value.trim();if(!name)return;const x=inlineCreate;inlineCreate=null;if(x.kind==='folder')createFolder(name,x.parentId);else createPage(x.parentId,name);renderTree()};

function createFolder(name,parentId=null){
  name=String(name||'').trim();
  if(!name)return;
  name=clippedName(name,'Yeni Klasör',80);
  const same=catChildren(parentId).some(c=>physicalNameKey(c.name)===physicalNameKey(name));
  if(same)return toast('Bu seviyede aynı isimli klasör var','warn');
  const c={id:uid('cat'),name,parentId:parentId||null,order:catChildren(parentId).length,collapsed:false,icon:'folder'};
  state.categories.push(c);ui.folderOpen[c.id]=true;
  const physical=categoryPhysicalPath(c.id);
  persist();
  ensureCategoryPhysical(c.id).then(()=>refreshScan()).catch(e=>reportPhysicalError('Klasör diskte oluşturulamadı',e));
  pushUndo('Klasör oluşturuldu',async()=>{state.categories=state.categories.filter(x=>x.id!==c.id);await persist();renderTree();await pruneEmptyPhysical(physical);await refreshScan()});
  toast('Klasör oluşturuldu');
  return c
}
function createPage(categoryId,title='Yeni Sayfa'){
  const c=cat(categoryId)||catChildren(null)[0]||createFolder('Genel');if(!c)return;const p={id:uid('page'),categoryId:c.id,title:uniquePageTitle(c.id,title),order:pagesInCat(c.id).length,createdAt:now(),updatedAt:now(),blocks:[{id:uid('blk'),type:'richtext',html:''}],deletedAt:null};state.pages.unshift(p);persist();schedulePageTxt(p);openPage(p.id);renderTree();return p
}
function renameFolderInline(id){
  const c=cat(id);if(!c)return;
  const title=el.tree.querySelector(`[data-cat="${CSS.escape(id)}"] .folder-row .title`),main=title?.closest('.row-main');if(!main)return;
  const input=document.createElement('input');input.value=c.name;input.className='tree-rename';input.style.cssText='min-width:0;flex:1;padding:5px 7px;border-radius:7px';main.replaceWith(input);input.focus();input.select();
  let completed=false;
  const done=async ok=>{
    if(completed)return;completed=true;if(!ok)return renderTree();
    const rawName=input.value.trim();if(!rawName)return renderTree();const name=clippedName(rawName,'Yeni Klasör',80);
    if(catChildren(c.parentId).some(x=>x.id!==id&&physicalNameKey(x.name)===physicalNameKey(name))){toast('Bu ad Windows klasör yolunda başka bir klasörle çakışıyor','warn');return renderTree()}
    if(name===c.name)return renderTree();
    const oldName=c.name,oldPhysical=categoryPhysicalPath(id);c.name=name;
    await persist();renderTree();
    try{await reconcileFolderPhysical(id,oldPhysical)}catch(e){reportPhysicalError('Klasör yeniden düzenlenemedi',e)}
    pushUndo('Klasör adı değişti',async()=>{const undoPhysical=categoryPhysicalPath(id);c.name=oldName;await persist();renderTree();await reconcileFolderPhysical(id,undoPhysical)})
  };
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur()}else if(e.key==='Escape'){e.preventDefault();completed=true;renderTree()}};input.onblur=()=>done(true)
}
function renamePageInline(id){
  const p=page(id);if(!p)return;
  const title=el.tree.querySelector(`[data-page="${CSS.escape(id)}"] .title`),main=title?.closest('.row-main');if(!main)return;
  const input=document.createElement('input');input.value=p.title;input.className='tree-rename';input.style.cssText='min-width:0;flex:1;padding:5px 7px;border-radius:7px';main.replaceWith(input);input.focus();input.select();
  let completed=false;
  const done=async ok=>{
    if(completed)return;completed=true;if(!ok)return renderTree();
    let name=input.value.trim();if(!name)return renderTree();name=uniquePageTitle(p.categoryId,name,p.id);if(name===p.title)return renderTree();
    const oldTitle=p.title,oldPhysical=pagePhysicalRootFromParts(catPath(p.categoryId),p.title);p.title=name;p.updatedAt=now();persist(false);renderTree();updateCurrentTabTitle(p);renderContentHeaderOnly();
    try{await reorganizePage(p);await pruneEmptyPhysical(oldPhysical)}catch(e){reportPhysicalError('Sayfa yeniden düzenlenemedi',e)}
    pushUndo('Sayfa adı değişti',async()=>{const undoPhysical=pagePhysicalRootFromParts(catPath(p.categoryId),p.title);p.title=oldTitle;p.updatedAt=now();persist(false);renderTree();updateCurrentTabTitle(p);renderContent();await reorganizePage(p);await pruneEmptyPhysical(undoPhysical)})
  };
  input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();input.blur()}else if(e.key==='Escape'){e.preventDefault();completed=true;renderTree()}};input.onblur=()=>done(true)
}
function pushUndo(label,fn){undoStack.push({label,fn});undoStack=undoStack.slice(-30)}
async function undo(){const x=undoStack.pop();if(!x)return toast('Geri alınacak işlem yok','warn');try{await x.fn();toast(`${x.label} geri alındı`)}catch(e){toast('Geri alınamadı','error')}}

window.v68TreeDragStart=(e,kind,id)=>{e.stopPropagation();treeDrag={kind,id};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-veloria-tree',JSON.stringify(treeDrag));setTimeout(()=>e.target.classList.add('dragging'),0)};
window.v68TreeDragEnd=e=>{e.stopPropagation();e.target.classList.remove('dragging');treeDrag=null;document.querySelectorAll('.drop-target,.drop-before-row,.drop-after-row').forEach(x=>x.classList.remove('drop-target','drop-before-row','drop-after-row'))};
function dragPosition(e,row){const r=row.getBoundingClientRect(),y=(e.clientY-r.top)/Math.max(1,r.height);return y<.26?'before':y>.74?'after':'inside'}
window.v68TreeDragOver=(e,targetId)=>{if(!treeDrag)return;e.preventDefault();const row=e.currentTarget;row.classList.remove('drop-target','drop-before-row','drop-after-row');const pos=treeDrag.kind==='folder'?dragPosition(e,row):'inside';row.dataset.dropPos=pos;row.classList.add(pos==='before'?'drop-before-row':pos==='after'?'drop-after-row':'drop-target')};
window.v68TreeDragLeave=e=>e.currentTarget.classList.remove('drop-target','drop-before-row','drop-after-row');
function normalizeCatOrder(parentId){catChildren(parentId).forEach((c,i)=>c.order=i)}
function normalizePageOrder(categoryId){pagesInCat(categoryId).forEach((p,i)=>p.order=i)}
async function reorderFolder(id,targetId,after=false){
  const c=cat(id),t=cat(targetId);if(!c||!t||id===targetId||catDesc(id).includes(targetId))return;
  const nextParent=t.parentId||null;
  if(catChildren(nextParent).some(x=>x.id!==id&&physicalNameKey(x.name)===physicalNameKey(c.name)))return toast('Hedefte Windows yolunda çakışan klasör adı var','warn');
  const oldParent=c.parentId,oldOrder=c.order,oldPhysical=categoryPhysicalPath(id);c.parentId=nextParent;
  const siblings=catChildren(c.parentId).filter(x=>x.id!==id);let idx=siblings.findIndex(x=>x.id===targetId);if(idx<0)idx=siblings.length;if(after)idx++;siblings.splice(idx,0,c);siblings.forEach((x,i)=>x.order=i);if(oldParent!==c.parentId)normalizeCatOrder(oldParent);
  await persist();renderTree();
  try{await reconcileFolderPhysical(id,oldPhysical)}catch(e){reportPhysicalError('Klasör taşınamadı',e)}
  pushUndo('Klasör sırası değişti',async()=>{const undoPhysical=categoryPhysicalPath(id);c.parentId=oldParent;c.order=oldOrder;normalizeCatOrder(oldParent);await persist();renderTree();await reconcileFolderPhysical(id,undoPhysical)})
}
window.v68TreeDrop=async(e,targetId)=>{e.preventDefault();const row=e.currentTarget,pos=row.dataset.dropPos||'inside';row.classList.remove('drop-target','drop-before-row','drop-after-row');if(!treeDrag)return;const t=treeDrag;treeDrag=null;if(t.kind==='folder'){if(pos==='inside')await moveFolder(t.id,targetId);else await reorderFolder(t.id,targetId,pos==='after')}else await movePage(t.id,targetId)};
window.v68PageDragOver=(e,targetPageId)=>{if(!treeDrag||treeDrag.kind!=='page')return;e.preventDefault();const row=e.currentTarget,pos=dragPosition(e,row);row.dataset.dropPos=pos==='inside'?'after':pos;row.classList.remove('drop-before-row','drop-after-row');row.classList.add(row.dataset.dropPos==='before'?'drop-before-row':'drop-after-row')};
window.v68PageDrop=async(e,targetPageId)=>{
  e.preventDefault();const row=e.currentTarget,pos=row.dataset.dropPos||'after';row.classList.remove('drop-before-row','drop-after-row');if(!treeDrag||treeDrag.kind!=='page')return;
  const moving=page(treeDrag.id),target=page(targetPageId);treeDrag=null;if(!moving||!target||moving.id===target.id)return;
  const oldCat=moving.categoryId,oldOrder=moving.order,oldTitle=moving.title,oldPhysical=pagePhysicalRootFromParts(catPath(moving.categoryId),moving.title);
  moving.categoryId=target.categoryId;const list=pagesInCat(target.categoryId).filter(x=>x.id!==moving.id);let idx=list.findIndex(x=>x.id===target.id);if(idx<0)idx=list.length;if(pos==='after')idx++;list.splice(idx,0,moving);list.forEach((x,i)=>x.order=i);if(oldCat!==moving.categoryId)normalizePageOrder(oldCat);moving.title=uniquePageTitle(moving.categoryId,moving.title,moving.id);touchPage(moving);renderTree();renderContentHeaderOnly();
  try{await reorganizePage(moving);await pruneEmptyPhysical(oldPhysical)}catch(e){reportPhysicalError('Sayfa taşınamadı',e)}
  pushUndo('Sayfa sırası değişti',async()=>{const undoPhysical=pagePhysicalRootFromParts(catPath(moving.categoryId),moving.title);moving.categoryId=oldCat;moving.order=oldOrder;moving.title=oldTitle;normalizePageOrder(oldCat);touchPage(moving);renderTree();await reorganizePage(moving);await pruneEmptyPhysical(undoPhysical)});toast('Sayfa taşındı')
};
window.v68RootDragOver=e=>{if(treeDrag?.kind==='folder'){e.preventDefault();e.currentTarget.classList.add('root-drop')}};
window.v68RootDragLeave=e=>e.currentTarget.classList.remove('root-drop');
window.v68RootDrop=async e=>{e.preventDefault();e.currentTarget.classList.remove('root-drop');if(treeDrag?.kind==='folder'){const id=treeDrag.id;treeDrag=null;await moveFolder(id,null)}};
async function moveFolder(id,newParent){
  const c=cat(id);if(!c||id===newParent||catDesc(id).includes(newParent))return toast('Klasör kendi altına taşınamaz','warn');if((c.parentId||null)===(newParent||null))return;
  if(catChildren(newParent).some(x=>x.id!==id&&physicalNameKey(x.name)===physicalNameKey(c.name)))return toast('Hedefte Windows yolunda çakışan klasör adı var','warn');
  const old=c.parentId,oldOrder=c.order,oldPhysical=categoryPhysicalPath(id);c.parentId=newParent||null;c.order=catChildren(newParent).filter(x=>x.id!==id).length;normalizeCatOrder(old);await persist();renderTree();
  try{await reconcileFolderPhysical(id,oldPhysical)}catch(e){reportPhysicalError('Klasör taşınamadı',e)}
  pushUndo('Klasör taşındı',async()=>{const undoPhysical=categoryPhysicalPath(id);c.parentId=old;c.order=oldOrder;normalizeCatOrder(old);await persist();renderTree();await reconcileFolderPhysical(id,undoPhysical)});toast('Klasör taşındı')
}
async function movePage(id,newCat){
  const p=page(id);if(!p||!cat(newCat))return;if(p.categoryId===newCat)return;
  const old=p.categoryId,oldOrder=p.order,oldTitle=p.title,oldPhysical=pagePhysicalRootFromParts(catPath(p.categoryId),p.title);p.categoryId=newCat;p.order=pagesInCat(newCat).filter(x=>x.id!==id).length;p.title=uniquePageTitle(newCat,p.title,p.id);normalizePageOrder(old);touchPage(p);renderTree();renderContentHeaderOnly();
  try{await reorganizePage(p);await pruneEmptyPhysical(oldPhysical)}catch(e){reportPhysicalError('Sayfa taşınamadı',e)}
  pushUndo('Sayfa taşındı',async()=>{const undoPhysical=pagePhysicalRootFromParts(catPath(p.categoryId),p.title);p.categoryId=old;p.order=oldOrder;p.title=oldTitle;normalizePageOrder(old);touchPage(p);renderTree();await reorganizePage(p);await pruneEmptyPhysical(undoPhysical)});toast('Sayfa taşındı')
}

function folderMenuHtml(id){return `<button onclick="v68MenuNewPage('${attr(id)}')">＋ Sayfa oluştur</button><button onclick="v68MenuNewFolder('${attr(id)}')">▣ Alt klasör oluştur</button><hr><button onclick="v68RenameFolder('${attr(id)}')">F2 Yeniden adlandır</button><button onclick="v68MoveFolderDialog('${attr(id)}')">⇢ Başka klasöre taşı</button><button onclick="v68Clipboard('copy','folder','${attr(id)}')">⧉ Kopyala</button><button onclick="v68Clipboard('cut','folder','${attr(id)}')">✂ Kes</button><hr><button onclick="v68OpenFolder('${attr(id)}')">▣ Klasörü görüntüle</button><button onclick="v68StorageForFolder('${attr(id)}')">◫ Depolama bilgisi</button><button class="danger" onclick="v68DeleteFolder('${attr(id)}')">⌫ Sil</button>`}
function pageMenuHtml(id){return `<button onclick="v68OpenPage('${attr(id)}')">▤ Aç</button><button onclick="v68RenamePage('${attr(id)}')">F2 Yeniden adlandır</button><button onclick="v68MovePageDialog('${attr(id)}')">⇢ Başka klasöre taşı</button><button onclick="v68Clipboard('copy','page','${attr(id)}')">⧉ Kopyala</button><button onclick="v68Clipboard('cut','page','${attr(id)}')">✂ Kes</button><button onclick="v68DuplicatePage('${attr(id)}')">＋ Çoğalt</button><hr><button onclick="v68RevealPage('${attr(id)}')">▣ Windows'ta göster</button><button class="danger" onclick="v68DeletePage('${attr(id)}')">⌫ Sil</button>`}
window.v68FolderMenu=(e,id)=>{e.preventDefault();e.stopPropagation();treeSelection={kind:'folder',id};renderTree();showContext(e.clientX,e.clientY,folderMenuHtml(id))};
window.v68PageMenu=(e,id)=>{e.preventDefault();e.stopPropagation();treeSelection={kind:'page',id};renderTree();showContext(e.clientX,e.clientY,pageMenuHtml(id))};
window.v68MenuNewPage=id=>{closeContext();inlineCreate={parentId:id,kind:'page'};ui.folderOpen[id]=true;renderTree()};window.v68MenuNewFolder=id=>{closeContext();inlineCreate={parentId:id,kind:'folder'};ui.folderOpen[id]=true;renderTree()};
window.v68RenameFolder=id=>{closeContext();renameFolderInline(id)};window.v68RenamePage=id=>{closeContext();renamePageInline(id)};
window.v68Clipboard=(mode,kind,id)=>{treeClipboard={mode,kind,id};closeContext();toast(mode==='cut'?'Kesildi':'Kopyalandı')};
window.v68DuplicatePage=id=>{closeContext();duplicatePage(id)};
function duplicatePage(id,targetCat){const p=page(id);if(!p)return;const cp=clone(p);cp.id=uid('page');cp.categoryId=targetCat||p.categoryId;cp.title=uniquePageTitle(cp.categoryId,`${p.title} Kopya`);cp.order=pagesInCat(cp.categoryId).length;cp.createdAt=cp.updatedAt=now();cp.blocks=(cp.blocks||[]).map(b=>({...b,id:uid('blk')}));cp.nativeTxtPath='';state.pages.unshift(cp);persist();schedulePageTxt(cp);renderTree();toast('Sayfa çoğaltıldı');return cp}
function duplicateFolder(id,targetParent=null){
  const ids=[id,...catDesc(id)],map=new Map(),created=[];
  for(const oldId of ids){
    const c=cat(oldId);if(!c)continue;
    const nc=clone(c);nc.id=uid('cat');
    nc.name=oldId===id?uniqueCategoryName(targetParent,`${c.name} Kopya`):c.name;
    map.set(oldId,nc.id);nc.parentId=oldId===id?targetParent:(map.get(c.parentId)||targetParent);nc.order=catChildren(nc.parentId).length;
    state.categories.push(nc);created.push(nc.id)
  }
  for(const p of pages().filter(p=>ids.includes(p.categoryId))){const cp=clone(p);cp.id=uid('page');cp.categoryId=map.get(p.categoryId);cp.title=uniquePageTitle(cp.categoryId,p.title);cp.blocks=(cp.blocks||[]).map(b=>({...b,id:uid('blk')}));cp.nativeTxtPath='';state.pages.unshift(cp);schedulePageTxt(cp)}
  persist();renderTree();
  Promise.all(created.map(cid=>ensureCategoryPhysical(cid))).then(()=>refreshScan()).catch(e=>reportPhysicalError('Kopyalanan klasörler diskte oluşturulamadı',e));
  toast('Klasör yapısı kopyalandı')
}
async function pasteTree(targetFolder=null){if(!treeClipboard)return toast('Pano boş','warn');const c=treeClipboard;if(c.kind==='page'){if(c.mode==='copy')duplicatePage(c.id,targetFolder||page(c.id)?.categoryId);else if(targetFolder)await movePage(c.id,targetFolder)}else{if(c.mode==='copy')duplicateFolder(c.id,targetFolder||null);else await moveFolder(c.id,targetFolder||null)}if(c.mode==='cut')treeClipboard=null}
window.v68MoveFolderDialog=id=>{closeContext();moveFolderDialog(id)};window.v68MovePageDialog=id=>{closeContext();movePageDialog(id)};
function folderOptions(exclude=''){const bad=new Set([exclude,...catDesc(exclude)]);return `<option value="">Kök</option>${categories().filter(c=>!bad.has(c.id)).sort((a,b)=>catPath(a.id).join('/').localeCompare(catPath(b.id).join('/'),'tr')).map(c=>`<option value="${attr(c.id)}">${esc(catPath(c.id).join(' / '))}</option>`).join('')}`}
function moveFolderDialog(id){const c=cat(id);if(!c)return;modal(`<div class="modal-head"><h3>Klasörü taşı</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="form-row"><label>Yeni üst klasör</label><select id="moveFolderSelect">${folderOptions(id)}</select></div><div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v68ApplyMoveFolder('${attr(id)}')">Taşı</button></div></div>`);document.getElementById('moveFolderSelect').value=c.parentId||''}
window.v68ApplyMoveFolder=async id=>{const t=document.getElementById('moveFolderSelect').value||null;closeModal();await moveFolder(id,t)};
function movePageDialog(id){const p=page(id);if(!p)return;modal(`<div class="modal-head"><h3>Sayfayı taşı</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="form-row"><label>Hedef klasör</label><select id="movePageSelect">${categories().sort((a,b)=>catPath(a.id).join('/').localeCompare(catPath(b.id).join('/'),'tr')).map(c=>`<option value="${attr(c.id)}">${esc(catPath(c.id).join(' / '))}</option>`).join('')}</select></div><div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v68ApplyMovePage('${attr(id)}')">Taşı</button></div></div>`);document.getElementById('movePageSelect').value=p.categoryId}
window.v68ApplyMovePage=async id=>{const t=document.getElementById('movePageSelect').value;closeModal();await movePage(id,t)};
window.v68DeletePage=async id=>{closeContext();const p=page(id);if(!p)return;if(!(await confirmModal('Sayfayı sil',`“${p.title}” silinsin mi? Notun Dosyalar içindeki TXT kopyası da silinecek. Ek dosyalar korunur.`,'Sil',true)))return;if(!(await deletePageMirrors([p])))return;state.pages=state.pages.filter(x=>x.id!==id);tabs=tabs.filter(t=>!(t.kind==='page'&&t.id===id));if(state.activePageId===id)state.activePageId=null;cleanupDeletedPageUi([id]);await persist();renderTree();renderTabs();if(currentView.kind==='page'&&currentView.id===id)openNearestView();await refreshScan();toast('Sayfa ve TXT kopyası silindi')};
window.v68DeleteFolder=async id=>{closeContext();const ids=[id,...catDesc(id)],targetPages=pages().filter(p=>ids.includes(p.categoryId)),count=targetPages.length,oldPhysical=categoryPhysicalPath(id);if(!(await confirmModal('Klasörü sil',`${ids.length} klasör ve ${count} sayfa silinecek. Bu sayfaların Dosyalar içindeki TXT kopyaları da silinecek; ek dosyalar korunur.`,'Sil',true)))return;if(!(await deletePageMirrors(targetPages)))return;state.pages=state.pages.filter(p=>!ids.includes(p.categoryId));state.categories=state.categories.filter(c=>!ids.includes(c.id));tabs=tabs.filter(t=>!(t.kind==='folder'&&ids.includes(t.id))&&!(t.kind==='page'&&!page(t.id)));cleanupDeletedPageUi(targetPages.map(p=>p.id));await persist();renderTree();renderTabs();openNearestView();await pruneEmptyPhysical(oldPhysical);await refreshScan();toast('Klasör ve not TXT kopyaları silindi')};
window.v68RevealPage=async id=>{closeContext();const p=page(id);if(!p)return;try{await api.openPageFolder({categoryPath:catPath(p.categoryId),pageTitle:p.title,storageRootId:p.nativeStorageRootId||'primary'})}catch(e){toast(e?.message||'Klasör açılamadı','error')}};

function updateCurrentTabTitle(p){const t=tabs.find(t=>t.kind==='page'&&t.id===p.id);if(t){t.title=p.title;renderTabs();saveUi()}}
function saveScroll(){if(currentView.kind==='page'||currentView.kind==='folder'){ui.scroll[`${currentView.kind}:${currentView.id}`]=el.content.scrollTop;saveUi()}else if(currentView.kind==='file'&&fileEditor){ui.scroll[`file:${norm(fileEditor.path)}`]=fileEditor.area?.scrollTop||0;saveUi()}}
function restoreScroll(key){requestAnimationFrame(()=>{el.content.scrollTop=Number(ui.scroll[key]||0)})}
function openPage(id,tab=true){saveScroll();const p=page(id);if(!p)return;state.activePageId=id;currentView={kind:'page',id,path:''};treeSelection={kind:'page',id};if(tab)openTab({kind:'page',id,title:p.title},false);ui.selectedTab=`page:${id}`;saveUi();renderTabs();renderTree();renderContent();restoreScroll(`page:${id}`);persist(false)}
function openFolder(id,tab=true){saveScroll();const c=cat(id);if(!c)return;state.activePageId=null;currentView={kind:'folder',id,path:''};treeSelection={kind:'folder',id};if(tab)openTab({kind:'folder',id,title:c.name},false);ui.selectedTab=`folder:${id}`;saveUi();renderTabs();renderTree();renderContent();restoreScroll(`folder:${id}`);persist(false)}
async function openFile(path,name='',tab=true){saveScroll();currentView={kind:'file',id:'',path};treeSelection=null;if(tab)openTab({kind:'file',path,name:name||baseName(path),title:name||baseName(path)},false);ui.selectedTab=`file:${norm(path)}`;saveUi();renderTabs();renderTree();await renderFile(path,name||baseName(path));restoreFilePosition(path)}
function openNearestView(){const root=catChildren(null)[0];if(root)openFolder(root.id);else{currentView={kind:'empty',id:'',path:''};renderContent()}}
window.v68OpenFile=(path,name)=>openFile(path,name);
function baseName(p){return String(p||'').replace(/\\/g,'/').split('/').filter(Boolean).pop()||''}

function renderContent(){fileEditor=null;if(currentView.kind==='page')renderPage(currentView.id);else if(currentView.kind==='folder')renderFolderView(currentView.id);else if(currentView.kind==='file')renderFile(currentView.path,baseName(currentView.path));else renderEmpty()}
function renderEmpty(){el.content.innerHTML=`<div class="empty-main"><div><img src="icon.png"><h2>Veloria Notes</h2><div>Soldan bir klasör veya sayfa aç.</div></div></div>`;el.statusContext.textContent='Hazır';el.statusDetails.textContent=''}
function renderContentHeaderOnly(){if(currentView.kind==='page'){const p=page(currentView.id);const title=el.content.querySelector('.page-title');if(p&&title&&document.activeElement!==title)title.value=p.title;const cr=el.content.querySelector('.crumbs');if(cr)cr.innerHTML=crumbHtml(p.categoryId,true)}}
function crumbHtml(categoryId,includePage=false){const ids=catIdsPath(categoryId);let html=`<button onclick="v68WorkspaceMenu()">${esc(currentWorkspaceName())}</button>`;for(const id of ids)html+=`<span>/</span><button onclick="v68OpenFolder('${attr(id)}')">${esc(cat(id)?.name||'')}</button>`;if(includePage&&currentView.kind==='page'){const p=page(currentView.id);html+=`<span>/</span><span>${esc(p?.title||'')}</span>`}return html}

function renderPage(id){const p=page(id);if(!p)return openNearestView();
  el.content.innerHTML=`<div class="view" data-page-view="${attr(id)}"><div class="crumbs">${crumbHtml(p.categoryId,true)}</div><div class="view-title-row"><input id="pageTitle" class="page-title" value="${attr(p.title)}" placeholder="İsimsiz"><button class="view-menu" onclick="v68PageTopMenu(event,'${attr(id)}')">⋯</button></div><div id="blocks" class="blocks">${renderBlocks(p)}</div></div>`;
  const title=document.getElementById('pageTitle');let titleStart=p.title;title.addEventListener('input',()=>{p.title=title.value;p.updatedAt=now();markTabDirty('page',p.id,true);updateCurrentTabTitle(p);persist(false)});title.addEventListener('blur',async()=>{let n=title.value.trim()||'İsimsiz';n=uniquePageTitle(p.categoryId,n,p.id);p.title=n;title.value=n;p.updatedAt=now();if(titleStart!==p.title){const oldPhysical=pagePhysicalRootFromParts(catPath(p.categoryId),titleStart);updateCurrentTabTitle(p);renderTree();try{await reorganizePage(p);await pruneEmptyPhysical(oldPhysical)}catch(e){reportPhysicalError('Sayfa yeniden adlandırılamadı',e)}titleStart=p.title}else await schedulePageTxt(p,true);markTabDirty('page',p.id,false);persist(false)});title.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();title.blur();el.content.querySelector('[contenteditable="true"]')?.focus()}});
  bindBlocks(p);hydratePageImages(p);el.statusContext.textContent=catPath(p.categoryId).join(' / ');el.statusDetails.textContent=`${(p.blocks||[]).length} blok · ${fmtDate(p.updatedAt)}`
}
function renderBlocks(p){const bs=p.blocks||[];let html='<div class="insert-line"><button onclick="v68InsertMenu(0)">＋</button></div>';bs.forEach((b,i)=>{html+=renderBlock(b,i);html+=`<div class="insert-line"><button onclick="v68InsertMenu(${i+1})">＋</button></div>`});return html}
function renderBlock(b,i){const common=`data-block="${attr(b.id)}" data-index="${i}" ondragover="v68BlockOver(event,'${attr(b.id)}')" ondrop="v68BlockDrop(event,'${attr(b.id)}')"`;
  const tools=`<div class="block-toolbar"><span class="block-grip" draggable="true" ondragstart="v68BlockDrag(event,'${attr(b.id)}')" ondragend="v68BlockDragEnd(event)">⠿</span><button class="block-more" onclick="v68BlockMenu(event,'${attr(b.id)}')">⋮</button></div>`;
  if(b.type==='heading')return `<div class="block-wrap" ${common}>${tools}<input class="heading-block h${Math.max(1,Math.min(3,b.level||2))}" data-edit="heading" value="${attr(b.text||'')}" placeholder="Başlık"></div>`;
  if(b.type==='link')return `<div class="block-wrap" ${common}>${tools}<div class="link-block"><input data-edit="link-title" value="${attr(b.title||'')}" placeholder="Başlık"><input data-edit="link-url" value="${attr(b.url||'')}" placeholder="https://..."><button class="mini" onclick="v68OpenLink('${attr(b.id)}')">Aç</button></div></div>`;
  if(b.type==='divider')return `<div class="block-wrap" ${common}>${tools}<div class="divider-block"></div></div>`;
  if(b.type==='attachment')return renderAttachmentBlock(b,common,tools);
  if(b.type==='code')return `<div class="block-wrap" ${common}>${tools}<textarea data-edit="code" class="code-area" style="height:180px;border:1px solid var(--line);border-radius:10px" spellcheck="false">${esc(b.code||'')}</textarea></div>`;
  const html=b.type==='richtext'?String(b.html||''):esc(b.text||'').replace(/\n/g,'<br>');return `<div class="block-wrap" ${common}>${tools}<div class="rich-block" contenteditable="true" data-edit="rich" data-placeholder="Bir şeyler yaz…">${html}</div></div>`
}
function renderAttachmentBlock(b,common,tools){const img=isImage(b.name),mode=img?(b.displayMode||'gallery'):'list',size=b.imageSize||'medium',path=b.nativePath||b.storagePath||'',missing=attachmentPathMissing(path);const cls=img?`${mode} ${size}`:'list';return `<div class="block-wrap attachment-wrap ${img&&mode==='gallery'?'gallery-block':''}" ${common}>${tools}<div class="attachment ${cls} ${missing?'missing':''}" data-attachment="${attr(b.id)}"><div class="${img?'attachment-image':''}">${img&&!missing?`<img data-img-block="${attr(b.id)}" alt="${attr(b.name||'')}">`:''}</div><div class="attachment-meta"><span class="file-glyph">${missing?'!':esc(iconForFile(b.name))}</span><span class="attachment-name"><strong>${esc(b.name||'Dosya')}</strong><small>${missing?'Dosya bulunamadı':fmtBytes(b.size||0)+(path?' · '+esc(path):'')}</small></span><span class="attachment-actions">${missing?`<button class="mini" onclick="v68RelinkAttachment('${attr(b.id)}')">Yeniden bağla</button>`:`<button class="mini" onclick="v68AttachmentOpen('${attr(b.id)}')">Aç</button>`}<button class="mini" onclick="v68AttachmentMenu(event,'${attr(b.id)}')">⋮</button></span></div></div></div>`}
function bindBlocks(p){
  for(const wrap of el.content.querySelectorAll('[data-block]')){const b=p.blocks.find(x=>x.id===wrap.dataset.block);if(!b)continue;
    const rich=wrap.querySelector('[data-edit="rich"]');if(rich)rich.addEventListener('input',()=>{b.type='richtext';b.html=v690SerializeRich(rich);delete b.text;markTabDirty('page',p.id,true);touchPage(p)});
    const head=wrap.querySelector('[data-edit="heading"]');if(head)head.addEventListener('input',()=>{b.text=head.value;markTabDirty('page',p.id,true);touchPage(p)});
    const code=wrap.querySelector('[data-edit="code"]');if(code){code.addEventListener('input',()=>{b.code=code.value;markTabDirty('page',p.id,true);touchPage(p)});code.addEventListener('keydown',codeKeys)}
    const lt=wrap.querySelector('[data-edit="link-title"]'),lu=wrap.querySelector('[data-edit="link-url"]');if(lt)lt.oninput=()=>{b.title=lt.value;markTabDirty('page',p.id,true);touchPage(p)};if(lu)lu.oninput=()=>{b.url=lu.value;markTabDirty('page',p.id,true);touchPage(p)}
  }
  el.content.querySelectorAll('[contenteditable="true"],input,textarea').forEach(x=>x.addEventListener('blur',()=>{markTabDirty('page',p.id,false);schedulePageTxt(p,true)}))
}
function codeKeys(e){if(e.key==='Tab'){e.preventDefault();const t=e.target,a=t.selectionStart,b=t.selectionEnd;t.setRangeText('  ',a,b,'end');t.dispatchEvent(new Event('input',{bubbles:true}))}}
async function hydratePageImages(p){let shouldRerender=false;for(const b of (p.blocks||[]).filter(b=>b.type==='attachment'&&isImage(b.name)&&b.nativePath)){const img=el.content.querySelector(`[data-img-block="${CSS.escape(b.id)}"]`);if(!img)continue;const key=norm(b.nativePath);try{let pr=previewCache.get(key);if(!pr){pr=await api.previewManagedFile(b.nativePath);previewCache.set(key,pr)}if(pr?.kind==='image'){missingAttachmentPaths.delete(key);img.src=pr.url}else if(pr?.missing||pr?.kind==='missing'){if(!missingAttachmentPaths.has(key)){missingAttachmentPaths.add(key);shouldRerender=true}}}catch(e){if(e?.code==='ENOENT'||/ENOENT|bulunamad/i.test(String(e?.message||''))){if(!missingAttachmentPaths.has(key)){missingAttachmentPaths.add(key);shouldRerender=true}}}}if(shouldRerender&&currentView.kind==='page'&&currentView.id===p.id)renderPage(p.id)}
window.v68OpenLink=id=>{const p=page(currentView.id),b=p?.blocks?.find(x=>x.id===id);if(b?.url)api.openExternal(b.url)};
window.v68PageTopMenu=(e,id)=>{e.stopPropagation();showContext(e.clientX,e.clientY,pageMenuHtml(id))};

window.v68InsertMenu=index=>{modal(`<div class="modal-head"><h3>İçerik ekle</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="choice-grid"><button class="choice" onclick="v68InsertBlock(${index},'text')"><strong>Metin</strong><small>Serbest yazı alanı</small></button><button class="choice" onclick="v68InsertBlock(${index},'heading')"><strong>Başlık</strong><small>Bölüm başlığı</small></button><button class="choice" onclick="v68InsertFile(${index})"><strong>Dosya / Fotoğraf</strong><small>Taşı veya kopyala</small></button><button class="choice" onclick="v68InsertBlock(${index},'link')"><strong>Bağlantı</strong><small>Web bağlantısı</small></button><button class="choice" onclick="v68InsertBlock(${index},'code')"><strong>Kod / Düz metin</strong><small>Monospace blok</small></button><button class="choice" onclick="v68InsertBlock(${index},'divider')"><strong>Ayraç</strong><small>İnce çizgi</small></button></div></div>`)};
window.v68InsertBlock=(index,type)=>{closeModal();const p=page(currentView.id);if(!p)return;let b;if(type==='heading')b={id:uid('blk'),type:'heading',text:'',level:2};else if(type==='link')b={id:uid('blk'),type:'link',title:'',url:''};else if(type==='code')b={id:uid('blk'),type:'code',code:''};else if(type==='divider')b={id:uid('blk'),type:'divider'};else b={id:uid('blk'),type:'richtext',html:''};p.blocks.splice(index,0,b);touchPage(p);renderPage(p.id);setTimeout(()=>el.content.querySelector(`[data-block="${CSS.escape(b.id)}"] [contenteditable], [data-block="${CSS.escape(b.id)}"] input, [data-block="${CSS.escape(b.id)}"] textarea`)?.focus(),20)};
window.v68InsertFile=async index=>{closeModal();const mode=await choiceModal('Dosya nasıl eklensin?',[{value:'move',title:'Taşı',sub:'Kaynak konumdan kaldır ve Veloria’ya taşı.'},{value:'copy',title:'Kopyala',sub:'Orijinal dosyayı yerinde bırak.'}]);if(!mode)return;const p=page(currentView.id);if(!p)return;const blockId=uid('blk');try{const r=await api.pickAndMoveFiles({importMode:mode,pageId:p.id,pageTitle:p.title,category:cat(p.categoryId)?.name||'Klasör',categoryPath:catPath(p.categoryId),storageRootId:p.nativeStorageRootId||'primary',blockId});if(r?.canceled)return;const bs=(r.files||[]).map(f=>({id:uid('blk'),type:'attachment',name:f.name,size:f.size,typeMime:f.type,nativePath:f.nativePath,relativePath:f.relativePath,contentHash:f.contentHash||'',displayMode:isImage(f.name)?(ui.defaultImageMode||'gallery'):'list',imageSize:'medium',imageWidth:Number(ui.defaultImageWidth)||240,fileDisplay:ui.defaultFileDisplay||'card',showPath:null}));if(bs.length){p.blocks.splice(index,0,...bs);touchPage(p)}await refreshScan();if(currentView.kind==='page'&&currentView.id===p.id)renderPage(p.id);const errs=(r.errors||[]).filter(x=>!x.warning),warns=(r.errors||[]).filter(x=>x.warning);if(errs.length)toast(`${bs.length} dosya eklendi · ${errs.length} dosya başarısız: ${errs[0].error||errs[0].name}`,'error');else if(warns.length)toast(`${bs.length} dosya eklendi · ${warns[0].error||'Kaynak dosya yerinde kaldı'}`,'warn');else toast(`${bs.length} dosya eklendi`)}catch(e){await refreshScan().catch(()=>{});if(currentView.kind==='page'&&currentView.id===p.id)renderPage(p.id);toast(e?.message||'Dosya eklenemedi','error')}};
window.v68BlockDrag=(e,id)=>{blockDragId=id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/x-veloria-block',id);e.currentTarget.closest('.block-wrap')?.classList.add('dragging')};window.v68BlockDragEnd=e=>{blockDragId='';e.currentTarget.closest('.block-wrap')?.classList.remove('dragging');document.querySelectorAll('.drop-before').forEach(x=>x.classList.remove('drop-before'))};
window.v68BlockOver=(e,id)=>{if(!blockDragId||blockDragId===id)return;e.preventDefault();e.currentTarget.classList.add('drop-before')};
window.v68BlockDrop=(e,id)=>{e.preventDefault();document.querySelectorAll('.drop-before').forEach(x=>x.classList.remove('drop-before'));const p=page(currentView.id);if(!p||!blockDragId)return;const a=p.blocks.findIndex(x=>x.id===blockDragId),b=p.blocks.findIndex(x=>x.id===id);if(a<0||b<0)return;const [x]=p.blocks.splice(a,1);p.blocks.splice(a<b?b-1:b,0,x);blockDragId='';touchPage(p);renderPage(p.id)};
window.v68BlockMenu=(e,id)=>{e.stopPropagation();const p=page(currentView.id),b=p?.blocks?.find(x=>x.id===id);if(!b)return;showContext(e.clientX,e.clientY,`${b.type==='heading'?`<button onclick="v68HeadingLevel('${attr(id)}',1)">H1</button><button onclick="v68HeadingLevel('${attr(id)}',2)">H2</button><button onclick="v68HeadingLevel('${attr(id)}',3)">H3</button><hr>`:''}<button onclick="v68DuplicateBlock('${attr(id)}')">⧉ Çoğalt</button><button class="danger" onclick="v68DeleteBlock('${attr(id)}')">⌫ Sil</button>`)};
window.v68HeadingLevel=(id,l)=>{closeContext();const p=page(currentView.id),b=p?.blocks?.find(x=>x.id===id);if(b){b.level=l;touchPage(p);renderPage(p.id)}};
window.v68DuplicateBlock=id=>{closeContext();const p=page(currentView.id),i=p?.blocks?.findIndex(x=>x.id===id);if(i>=0){const b=clone(p.blocks[i]);b.id=uid('blk');p.blocks.splice(i+1,0,b);touchPage(p);renderPage(p.id)}};
window.v68DeleteBlock=id=>{closeContext();const p=page(currentView.id);if(!p)return;const i=p.blocks.findIndex(x=>x.id===id);if(i>=0){const [b]=p.blocks.splice(i,1);touchPage(p);renderPage(p.id);pushUndo('Blok silindi',()=>{p.blocks.splice(i,0,b);touchPage(p);renderPage(p.id)})}};

function findAttachment(id){for(const p of pages()){const b=(p.blocks||[]).find(x=>x.id===id&&x.type==='attachment');if(b)return {p,b}}return null}
window.v68AttachmentOpen=id=>{const x=findAttachment(id);if(x?.b.nativePath)openFile(x.b.nativePath,x.b.name)};
window.v68AttachmentMenu=(e,id)=>{e.stopPropagation();const x=findAttachment(id);if(!x)return;const b=x.b;const img=isImage(b.name),missing=attachmentPathMissing(b.nativePath);showContext(e.clientX,e.clientY,`${missing?`<button onclick="v68RelinkAttachment('${attr(id)}')">Yeniden bağla</button>`:`<button onclick="v68AttachmentOpen('${attr(id)}')">Aç / Düzenle</button><button onclick="v68RevealAttachment('${attr(id)}')">Windows'ta göster</button>`}${img?`<hr><button onclick="v68AttachmentDisplay('${attr(id)}','gallery','small')">Galeri · Küçük</button><button onclick="v68AttachmentDisplay('${attr(id)}','gallery','medium')">Galeri · Normal</button><button onclick="v68AttachmentDisplay('${attr(id)}','gallery','large')">Galeri · Büyük</button><button onclick="v68AttachmentDisplay('${attr(id)}','full','large')">Tam genişlik</button><button onclick="v68AttachmentDisplay('${attr(id)}','list','medium')">Liste</button>`:''}<hr><button onclick="v68AttachmentMove('${attr(id)}')">Başka sayfaya taşı</button><button onclick="v68AttachmentUnlink('${attr(id)}')">Bağlantıyı kaldır</button><button class="danger" onclick="v68AttachmentPhysicalDelete('${attr(id)}')">Fiziksel dosyayı sil</button>`)};
window.v68AttachmentDisplay=(id,mode,size)=>{closeContext();const x=findAttachment(id);if(!x)return;x.b.displayMode=mode;x.b.imageSize=size;touchPage(x.p);if(currentView.kind==='page'&&currentView.id===x.p.id)renderPage(x.p.id)};
window.v68RelinkAttachment=async id=>{closeContext();const x=findAttachment(id);if(!x)return;const mode=await choiceModal('Yeni dosya nasıl eklensin?',[{value:'move',title:'Taşı',sub:'Yeni kaynak Veloria içine taşınır.'},{value:'copy',title:'Kopyala',sub:'Yeni kaynak yerinde kalır.'}]);if(!mode)return;try{const res=await api.pickAndMoveFiles({importMode:mode,pageId:x.p.id,pageTitle:x.p.title,category:cat(x.p.categoryId)?.name||'Klasör',categoryPath:catPath(x.p.categoryId),storageRootId:x.p.nativeStorageRootId||'primary',blockId:x.b.id});const f=res?.files?.[0];if(!f)return;const oldPath=x.b.nativePath||'';if(oldPath){missingAttachmentPaths.delete(norm(oldPath));previewCache.delete(norm(oldPath))}x.b.name=f.name;x.b.size=f.size;x.b.nativePath=f.nativePath;missingAttachmentPaths.delete(norm(f.nativePath));previewCache.delete(norm(f.nativePath));x.b.relativePath=f.relativePath||'';x.b.contentHash=f.contentHash||'';x.b.displayMode=isImage(f.name)?'gallery':'list';touchPage(x.p);await refreshScan();if(currentView.kind==='page'&&currentView.id===x.p.id)renderPage(x.p.id);toast('Dosya yeniden bağlandı')}catch(e){toast(e.message,'error')}};
window.v68RevealAttachment=id=>{closeContext();const x=findAttachment(id);if(x?.b.nativePath)api.revealManagedFile(x.b.nativePath).catch(e=>toast(e.message,'error'))};
window.v68AttachmentUnlink=id=>{closeContext();const x=findAttachment(id);if(!x)return;const i=x.p.blocks.findIndex(b=>b.id===id),snap=x.p.blocks[i];x.p.blocks.splice(i,1);touchPage(x.p);renderPage(x.p.id);pushUndo('Dosya bağlantısı kaldırıldı',()=>{x.p.blocks.splice(i,0,snap);touchPage(x.p);renderPage(x.p.id)})};
window.v68AttachmentPhysicalDelete=async id=>{closeContext();const x=findAttachment(id);if(!x?.b.nativePath)return;if(!(await confirmModal('Fiziksel dosyayı sil','Dosya Veloria Çöp Kutusu’na taşınacak. Sayfa bağlantıları da kaldırılacak.','Çöp Kutusuna Taşı',true)))return;const path=x.b.nativePath;try{await api.deleteManagedFile(path);if(state.fileMeta)delete state.fileMeta[norm(path)];removeAttachmentRefsEverywhere(path);await persist();renderContent();renderTree();await refreshScan();toast('Dosya çöp kutusuna taşındı')}catch(e){toast(e.message,'error')}};
window.v68AttachmentMove=id=>{closeContext();const x=findAttachment(id);if(!x)return;const opts=pages().filter(p=>p.id!==x.p.id).map(p=>`<option value="${attr(p.id)}">${esc(catPath(p.categoryId).join(' / '))} / ${esc(p.title)}</option>`).join('');if(!opts)return toast('Başka sayfa yok','warn');modal(`<div class="modal-head"><h3>Dosyayı başka sayfaya taşı</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="form-row"><label>Hedef sayfa</label><select id="attMovePage">${opts}</select></div><div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v68ApplyAttachmentMove('${attr(id)}')">Taşı</button></div></div>`)};
window.v68ApplyAttachmentMove=async id=>{const x=findAttachment(id),target=page(document.getElementById('attMovePage').value);if(!x||!target)return closeModal();closeModal();const src=x.p,idx=src.blocks.findIndex(b=>b.id===id);src.blocks.splice(idx,1);target.blocks.push(x.b);touchPage(src);touchPage(target);await reorganizeOwnedAttachment(target,x.b).catch(()=>{});renderContent();renderTree();toast('Dosya başka sayfaya taşındı')};

async function reorganizeOwnedAttachment(p,b){if(!b.nativePath)return;const refs=allWorkspacePages().filter(q=>(q.blocks||[]).some(x=>x.type==='attachment'&&norm(x.nativePath)===norm(b.nativePath)));if(refs.length>1)return;const r=await api.organizeManagedFile(b.nativePath,{pageId:p.id,pageTitle:p.title,category:cat(p.categoryId)?.name||'Klasör',categoryPath:catPath(p.categoryId),storageRootId:p.nativeStorageRootId||'primary'});if(r?.nativePath){const old=b.nativePath;b.nativePath=r.nativePath;b.name=r.name||b.name;b.relativePath=r.relativePath||b.relativePath;updateAttachmentRefs(old,r.nativePath)}}
function updateAttachmentRefs(oldPath,newPath){for(const p of allWorkspacePages())for(const b of p.blocks||[])if(b.type==='attachment'&&norm(b.nativePath)===norm(oldPath)){b.nativePath=newPath;b.name=baseName(newPath)}remapFileMeta(oldPath,newPath)}
function removeAttachmentRefsEverywhere(filePath){for(const p of allWorkspacePages())p.blocks=(p.blocks||[]).filter(b=>!(b.type==='attachment'&&norm(b.nativePath)===norm(filePath)))}
async function reorganizePage(p,refresh=true){for(const b of (p.blocks||[]).filter(b=>b.type==='attachment'&&b.nativePath))await reorganizeOwnedAttachment(p,b);await schedulePageTxt(p,true);await persist(false);if(refresh)await refreshScan()}
async function reorganizeFolder(id){
  for(const cid of [id,...catDesc(id)]){
    await ensureCategoryPhysical(cid);
    for(const p of pagesInCat(cid))await reorganizePage(p,false)
  }
}
async function reconcileFolderPhysical(id,oldPhysical=''){
  await reorganizeFolder(id);
  const next=categoryPhysicalPath(id);
  if(oldPhysical&&norm(oldPhysical)!==norm(next))await pruneEmptyPhysical(oldPhysical);
  await refreshScan()
}

function fileMeta(path){const k=norm(path);state.fileMeta=state.fileMeta||{};return state.fileMeta[k]||(state.fileMeta[k]={description:'',label:'',pinned:false})}
function remapFileMeta(oldPath,newPath){state.fileMeta=state.fileMeta||{};const a=norm(oldPath),b=norm(newPath);if(state.fileMeta[a]){state.fileMeta[b]=state.fileMeta[a];delete state.fileMeta[a]}}
function isNoteMirror(path){return pages().some(p=>p.nativeTxtPath&&norm(p.nativeTxtPath)===norm(path))}
function folderPref(id){ui.folderPrefs=ui.folderPrefs||{};return ui.folderPrefs[id]||(ui.folderPrefs[id]={sort:'manual'})}
function sortPhysical(files,id){const pref=folderPref(id),arr=[...files];return arr.sort((a,b)=>{const ma=fileMeta(a.nativePath),mb=fileMeta(b.nativePath);if(!!ma.pinned!==!!mb.pinned)return ma.pinned?-1:1;if(pref.sort==='name')return String(a.name).localeCompare(String(b.name),'tr');if(pref.sort==='type')return extOf(a.name).localeCompare(extOf(b.name),'tr')||String(a.name).localeCompare(String(b.name),'tr');if(pref.sort==='size')return (b.size||0)-(a.size||0);if(pref.sort==='modified')return (b.mtimeMs||0)-(a.mtimeMs||0);return 0})}
async function renderFolderView(id){const c=cat(id);if(!c)return openNearestView();const ids=[id,...catDesc(id)];const ps=pages().filter(p=>ids.includes(p.categoryId));const prefix=norm(categoryPhysicalRelative(id))+'/';const physical=sortPhysical(scan.files.filter(f=>norm(f.relativePath).startsWith(prefix)&&(state.prefs.showNoteMirror!==false||!isNoteMirror(f.nativePath))),id);const images=physical.filter(f=>isImage(f.name)),other=physical.filter(f=>!isImage(f.name));
  el.content.innerHTML=`<div class="view folder-view"><div class="crumbs">${crumbHtml(id,false)}</div><div class="view-title-row"><div style="font-size:31px;font-weight:900;letter-spacing:-.03em;flex:1">${esc(c.name)}</div><button class="view-menu" onclick="v68FolderTopMenu(event,'${attr(id)}')">⋯</button></div><div class="folder-toolbar"><button class="tool primary" onclick="v68InlineCreate('${attr(id)}','page');document.getElementById('tree').scrollTo({top:999999,behavior:'smooth'})">＋ Sayfa</button><button class="tool" onclick="v68InlineCreate('${attr(id)}','folder')">＋ Alt klasör</button><button class="tool" onclick="v68RefreshFolder()">↻ Yenile</button><button class="tool" onclick="v68StorageForFolder('${attr(id)}')">${fmtBytes(folderSize(id))}</button><select class="tool" onchange="v68FolderSort('${attr(id)}',this.value)"><option value="manual" ${folderPref(id).sort==='manual'?'selected':''}>Elle sıra</option><option value="name" ${folderPref(id).sort==='name'?'selected':''}>Ada göre</option><option value="type" ${folderPref(id).sort==='type'?'selected':''}>Türe göre</option><option value="size" ${folderPref(id).sort==='size'?'selected':''}>Boyuta göre</option><option value="modified" ${folderPref(id).sort==='modified'?'selected':''}>Son değişene göre</option></select></div>${ps.length?`<section class="folder-section"><div class="section-head"><h3>Sayfalar</h3><small>${ps.length}</small></div><div class="page-cards">${ps.map(p=>`<button class="page-card" onclick="v68OpenPage('${attr(p.id)}')"><strong>${esc(p.title)}</strong><small>${esc(catPath(p.categoryId).join(' / '))} · ${fmtDate(p.updatedAt)}</small></button>`).join('')}</div></section>`:''}${images.length?`<section class="folder-section"><div class="section-head"><h3>Görseller</h3><div class="gallery-controls"><button class="tool" onclick="v68GalleryMode('hybrid')">Hibrit</button><button class="tool" onclick="v68Thumb('small')">Küçük</button><button class="tool" onclick="v68Thumb('medium')">Normal</button><button class="tool" onclick="v68Thumb('large')">Büyük</button></div></div><div class="file-gallery ${ui.thumbSize}">${images.map(f=>renderGalleryFile(f,physical.indexOf(f))).join('')}</div></section>`:''}${other.length?`<section class="folder-section"><div class="section-head"><h3>Dosyalar</h3><small>${other.length}</small></div><div class="file-list">${other.map(f=>renderFileRow(f,physical.indexOf(f))).join('')}</div></section>`:''}${!ps.length&&!physical.length?'<div class="empty-main" style="height:320px"><div>Bu klasör boş.</div></div>':''}</div>`;
  hydrateFolderImages(images);el.statusContext.textContent=catPath(id).join(' / ');const selected=physical.filter(f=>fileSelection.has(norm(f.nativePath)));el.statusDetails.textContent=selected.length?`${selected.length} öğe seçildi · ${fmtBytes(selected.reduce((n,f)=>n+(f.size||0),0))}`:`${ps.length} sayfa · ${physical.length} dosya · ${fmtBytes(physical.reduce((n,f)=>n+(f.size||0),0))}`
}
function renderGalleryFile(f,i){const sel=fileSelection.has(norm(f.nativePath));const m=fileMeta(f.nativePath);return `<button class="gallery-item ${sel?'selected':''} ${m.label?`label-${attr(m.label)}`:''}" draggable="true" ondragstart="v68PhysicalDrag(event,${js(f.nativePath)})" data-file-path="${attr(f.nativePath)}" data-index="${i}" onclick="v68FileSelect(event,this.dataset.filePath,${i})" ondblclick="v68FileOpen(this.dataset.filePath)" oncontextmenu="v68FileMenu(event,this.dataset.filePath)"><img data-gallery-img="${attr(f.nativePath)}" alt=""><span class="gallery-name" ${ui.showImageNames?'':'style="display:none"'}>${esc(f.name)}</span></button>`}
function renderFileRow(f,i){const sel=fileSelection.has(norm(f.nativePath)),m=fileMeta(f.nativePath);return `<div class="file-row ${sel?'selected':''} ${m.label?`label-${attr(m.label)}`:''}" draggable="true" ondragstart="v68PhysicalDrag(event,${js(f.nativePath)})" data-file-path="${attr(f.nativePath)}" onclick="v68FileSelect(event,this.dataset.filePath,${i})" ondblclick="v68FileOpen(this.dataset.filePath)" oncontextmenu="v68FileMenu(event,this.dataset.filePath)"><span class="file-glyph">${esc(iconForFile(f.name))}</span><span class="name"><strong>${esc(f.name)}</strong><small>${esc(m.description||f.relativePath||'')}</small></span><span class="type-badge">${esc(extOf(f.name))}</span><span class="mtime"><small>${fmtBytes(f.size||0)}</small></span><button class="file-menu" onclick="event.stopPropagation();v68FileMenu(event,${js(f.nativePath)})">⋮</button></div>`}
async function hydrateFolderImages(files){for(const f of files){const img=el.content.querySelector(`[data-gallery-img="${CSS.escape(f.nativePath)}"]`);if(!img)continue;try{let p=previewCache.get(norm(f.nativePath));if(!p){p=await api.previewManagedFile(f.nativePath);previewCache.set(norm(f.nativePath),p)}if(p?.kind==='image')img.src=p.url}catch{}}}
window.v68FolderSort=(id,sort)=>{folderPref(id).sort=sort;saveUi();renderFolderView(id)};
window.v68FolderTopMenu=(e,id)=>{e.stopPropagation();showContext(e.clientX,e.clientY,folderMenuHtml(id))};window.v68RefreshFolder=async()=>{await refreshScan();renderFolderView(currentView.id)};window.v68GalleryMode=m=>{ui.galleryMode=m;saveUi();renderFolderView(currentView.id)};window.v68Thumb=s=>{ui.thumbSize=s;saveUi();renderFolderView(currentView.id)};
window.v68FileSelect=(e,path,index)=>{const k=norm(path);if(e.ctrlKey||e.metaKey){if(fileSelection.has(k))fileSelection.delete(k);else fileSelection.add(k);fileAnchor=index}else if(e.shiftKey&&fileAnchor!==null){const files=currentFolderPhysical();const a=Math.min(fileAnchor,index),b=Math.max(fileAnchor,index);fileSelection.clear();files.slice(a,b+1).forEach(f=>fileSelection.add(norm(f.nativePath)))}else{fileSelection.clear();fileSelection.add(k);fileAnchor=index}renderFolderView(currentView.id)};
function currentFolderPhysical(){if(currentView.kind!=='folder')return[];const prefix=norm(categoryPhysicalRelative(currentView.id))+'/';return sortPhysical(scan.files.filter(f=>norm(f.relativePath).startsWith(prefix)&&(state.prefs.showNoteMirror!==false||!isNoteMirror(f.nativePath))),currentView.id)}

window.v68PhysicalDrag=(e,path)=>{if(e.altKey){e.preventDefault();api.startManagedDrag?.(path);return}e.preventDefault()};
window.v68FileMenu=(e,path)=>{e.preventDefault();e.stopPropagation();if(!fileSelection.has(norm(path))){fileSelection.clear();fileSelection.add(norm(path))}showContext(e.clientX,e.clientY,`<button onclick="v68FileOpen(${js(path)})">Aç / Önizle</button><button onclick="v68FileReveal(${js(path)})">Windows'ta göster</button><button onclick="v68FileRename(${js(path)})">F2 Yeniden adlandır</button><button onclick="v68FileCopy('copy')">⧉ Kopyala</button><button onclick="v68FileCopy('cut')">✂ Kes</button><button onclick="v68FileMoveDialog(${js(path)})">⇢ Başka sayfaya taşı</button><hr><button onclick="v68FileProperties(${js(path)})">ⓘ Özellikler / Açıklama</button><button onclick="v68ToggleFilePin(${js(path)})">★ Sabitle / kaldır</button><button onclick="v68FileVersions(${js(path)})">↶ Sürüm geçmişi</button><button onclick="v68FileVerify(${js(path)})">✓ SHA-256 doğrula</button><button class="danger" onclick="v68FilesDelete()">⌫ Çöp Kutusuna taşı</button>`)};
window.v68FileOpen=path=>{closeContext();openFile(path,baseName(path))};window.v68FileReveal=path=>{closeContext();api.revealManagedFile(path).catch(e=>toast(e.message,'error'))};window.v68CopyPath=path=>{navigator.clipboard.writeText(path).catch(()=>{});closeModal();toast('Yol kopyalandı')};
window.v68FileCopy=mode=>{const ps=selectedFilePaths();if(!ps.length)return;treeClipboard={kind:'files',mode,paths:ps};closeContext();toast(mode==='cut'?'Dosyalar kesildi':'Dosyalar kopyalandı')};
function selectedFilePaths(){const all=scan.files;return [...fileSelection].map(k=>all.find(f=>norm(f.nativePath)===k)?.nativePath).filter(Boolean)}
window.v68FileRename=async path=>{closeContext();const old=baseName(path),ext=old.includes('.')?old.slice(old.lastIndexOf('.')):'';modal(`<div class="modal-head"><h3>Dosyayı yeniden adlandır</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="form-row"><label>Dosya adı</label><input id="fileRenameInput" value="${attr(old)}" autofocus></div><div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v68ApplyFileRename(${js(path)})">Kaydet</button></div></div>`);setTimeout(()=>{const x=document.getElementById('fileRenameInput');if(x){x.focus();x.setSelectionRange(0,Math.max(0,old.length-ext.length))}},20)};
window.v68ApplyFileRename=async path=>{const name=document.getElementById('fileRenameInput').value.trim();if(!name)return;closeModal();const dir=String(path).replace(/[\\/][^\\/]+$/,'');const target=winJoin(dir,safeSegment(name));try{const r=await api.moveManagedExact(path,target,'error');updateAttachmentRefs(path,r.target);await persist();await refreshScan();if(currentView.kind==='folder')renderFolderView(currentView.id);if(currentView.kind==='file'&&norm(currentView.path)===norm(path))openFile(r.target,baseName(r.target),false);pushUndo('Dosya yeniden adlandırıldı',async()=>{const back=await api.moveManagedExact(r.target,path,'keepBoth');updateAttachmentRefs(r.target,back.target);await persist();await refreshScan();renderContent()});toast('Dosya adı değiştirildi')}catch(e){toast(e.message,'error')}};
window.v68FilesDelete=async()=>{closeContext();const ps=selectedFilePaths();if(!ps.length)return;if(!(await confirmModal('Dosyaları sil',`${ps.length} fiziksel dosya Veloria Çöp Kutusu’na taşınacak.`,'Çöp Kutusuna Taşı',true)))return;for(const pth of ps){try{await api.deleteManagedFile(pth);if(state.fileMeta)delete state.fileMeta[norm(pth)];removeAttachmentRefsEverywhere(pth)}catch(e){toast(e.message,'error')}}fileSelection.clear();await persist();await refreshScan();renderContent();toast('Dosyalar çöp kutusuna taşındı')};
window.v68FileProperties=async path=>{closeContext();const f=scan.files.find(x=>norm(x.nativePath)===norm(path));let st={};try{st=await api.statManagedFile(path)}catch{}const refs=[];for(const p of pages())if((p.blocks||[]).some(b=>b.type==='attachment'&&norm(b.nativePath)===norm(path)))refs.push(p);const m=fileMeta(path);modal(`<div class="modal-head"><h3>${esc(baseName(path))}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="form-row"><label>Boyut</label><div>${fmtBytes(st.size||f?.size||0)}</div></div><div class="form-row"><label>Tür</label><div>${esc(extOf(path))}</div></div><div class="form-row"><label>Açıklama</label><input id="fileMetaDesc" value="${attr(m.description||'')}" placeholder="Bu dosya ne için?"></div><div class="form-row"><label>Renk etiketi</label><select id="fileMetaLabel"><option value="">Yok</option><option value="red" ${m.label==='red'?'selected':''}>Kırmızı</option><option value="amber" ${m.label==='amber'?'selected':''}>Sarı</option><option value="green" ${m.label==='green'?'selected':''}>Yeşil</option><option value="blue" ${m.label==='blue'?'selected':''}>Mavi</option></select></div><div class="form-row"><label>Fiziksel yol</label><div style="word-break:break-all">${esc(path)}</div></div><div class="form-row"><label>Kullanıldığı sayfalar</label><div>${refs.map(p=>esc(p.title)).join('<br>')||'Bağlı sayfa yok'}</div></div><div class="modal-actions"><button class="btn" onclick="v68CopyPath(${js(path)})">Yolu kopyala</button><button class="btn primary" onclick="v68SaveFileMeta(${js(path)})">Kaydet</button></div></div>`)};
window.v68SaveFileMeta=path=>{const m=fileMeta(path);m.description=document.getElementById('fileMetaDesc').value.trim();m.label=document.getElementById('fileMetaLabel').value;persist(false);closeModal();if(currentView.kind==='folder')renderFolderView(currentView.id);toast('Dosya bilgisi kaydedildi')};
window.v68ToggleFilePin=path=>{closeContext();const m=fileMeta(path);m.pinned=!m.pinned;persist(false);if(currentView.kind==='folder')renderFolderView(currentView.id);toast(m.pinned?'Dosya sabitlendi':'Sabitleme kaldırıldı')};
window.v68FileVersions=async path=>{closeContext();try{const a=await api.listManagedVersions(path);const items=Array.isArray(a)?a:(a?.versions||[]);modal(`<div class="modal-head"><h3>Sürüm geçmişi</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="modal-actions" style="justify-content:flex-start;margin-top:0"><button class="btn" onclick="v68ReplaceVersion(${js(path)})">Yeni sürüm seç</button></div>${items.map(v=>`<div class="file-row" style="grid-template-columns:minmax(0,1fr) 110px 75px"><span class="name"><strong>${esc(v.name||v.id||'Sürüm')}</strong><small>${fmtDate(v.mtimeMs||v.createdAt||v.at)}</small></span><span>${fmtBytes(v.size||0)}</span><button class="mini" onclick="v68RestoreVersion(${js(path)},${js(v.id||v.name||'')})">Geri al</button></div>`).join('')||'<div style="color:var(--muted)">Önceki sürüm yok.</div>'}</div>`,true)}catch(e){toast(e.message,'error')}};
window.v68ReplaceVersion=async path=>{try{const r=await api.replaceManagedVersion(path);if(!r?.canceled){toast('Yeni sürüm kaydedildi');v68FileVersions(path)}}catch(e){toast(e.message,'error')}};
window.v68RestoreVersion=async(path,id)=>{try{await api.restoreManagedVersion(path,id);toast('Sürüm geri yüklendi');closeModal();if(currentView.kind==='file')openFile(path,baseName(path),false);await refreshScan()}catch(e){toast(e.message,'error')}};
window.v68FileVerify=async path=>{closeContext();toast('Dosya doğrulanıyor…');try{const r=await api.verifyManagedFile(path);toast(r?.ok===false?'Doğrulama başarısız':'Dosya doğrulandı',r?.ok===false?'warn':'ok')}catch(e){toast(e.message,'error')}};
window.v68FileMoveDialog=path=>{closeContext();const ps=selectedFilePaths().length?selectedFilePaths():[path];window.__v68MoveFiles=ps;const opts=pages().map(p=>`<option value="${attr(p.id)}">${esc(catPath(p.categoryId).join(' / '))} / ${esc(p.title)}</option>`).join('');if(!opts)return toast('Hedef sayfa yok','warn');modal(`<div class="modal-head"><h3>${ps.length} dosyayı taşı</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="form-row"><label>Hedef sayfa</label><select id="fileMovePage">${opts}</select></div><div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v68ApplyFileMove()">Taşı</button></div></div>`)};
window.v68ApplyFileMove=async()=>{const ps=window.__v68MoveFiles||[],p=page(document.getElementById('fileMovePage').value);if(!p)return;closeModal();for(const path of ps){const target=winJoin(info.rootPath,...catPath(p.categoryId).map(safeSegment),safeSegment(p.title),'Dosyalar',baseName(path));try{const r=await api.moveManagedExact(path,target,'keepBoth');updateAttachmentRefs(path,r.target)}catch(e){toast(e.message,'error')}}await persist();await refreshScan();renderContent();toast('Dosyalar taşındı')};

async function renderFile(path,name){
  if(externalWatchTimer)clearInterval(externalWatchTimer);fileEditor=null;el.statusContext.textContent=name;el.statusDetails.textContent='';
  if(isText(name)){
    try{const d=await api.readManagedText(path);if(!v11StillViewingFile(path))return;el.content.innerHTML=`<div class="file-editor"><div class="editor-head"><span>${esc(iconForFile(name))}</span><strong>${esc(name)}</strong><span id="editorState" style="color:var(--muted);font-size:9px">${fmtBytes(d.size||0)}</span><button class="tool" onclick="v68FormatFile()">Biçimlendir</button><button class="tool primary" onclick="v68SaveFile()">Kaydet</button><button class="tool" onclick="v68FileReveal(${js(path)})">Windows'ta göster</button></div><div class="editor-body"><pre id="lineNums" class="line-nums"></pre><textarea id="codeArea" class="code-area" spellcheck="false"></textarea></div></div>`;const area=document.getElementById('codeArea'),nums=document.getElementById('lineNums');area.value=d.text||'';let recovered=false;try{const dr=await api.readDraft(draftKey(path));if(dr?.ok&&typeof dr.text==='string'&&dr.text!==area.value&&confirm('Bu dosya için kaydedilmemiş yerel bir Veloria taslağı bulundu. Geri yüklensin mi?')){area.value=dr.text;recovered=true}}catch{}if(!v11StillViewingFile(path)||!area.isConnected)return;fileEditor={path,name,area,nums,mtimeMs:d.mtimeMs||0,dirty:recovered,lastDiskMtime:d.mtimeMs||0};if(recovered){markTabDirty('file',path,true);document.getElementById('editorState').textContent='Kurtarılan taslak'}updateLineNums();area.addEventListener('input',()=>{fileEditor.dirty=true;markTabDirty('file',path,true);document.getElementById('editorState').textContent='Değiştirildi';updateLineNums();saveDraft(path,area.value)});area.addEventListener('scroll',()=>{nums.scrollTop=area.scrollTop;ui.scroll[`file:${norm(path)}`]=area.scrollTop;saveUi()});area.addEventListener('keydown',codeKeys);externalWatchTimer=setInterval(()=>checkExternalFile(),4000);el.statusDetails.textContent=`${extOf(name)} · UTF-8 · ${area.value.split('\n').length} satır`;return}catch(e){toast(e.message,'error')}
  }
  try{const p=await api.previewManagedFile(path);if(!v11StillViewingFile(path))return;let body;if(p.kind==='image')body=`<div class="preview-shell"><img src="${attr(p.url)}"></div>`;else if(p.kind==='video')body=`<div class="preview-shell"><video src="${attr(p.url)}" controls></video></div>`;else if(p.kind==='audio')body=`<div class="preview-shell"><audio src="${attr(p.url)}" controls></audio></div>`;else if(p.kind==='pdf')body=`<div class="preview-shell"><iframe src="${attr(p.url)}"></iframe></div>`;else body=`<div class="empty-main"><div><h2>${esc(name)}</h2><div>Bu dosya Windows'taki varsayılan uygulamayla açılır.</div><button class="btn primary" style="margin-top:14px" onclick="v68OpenExternalFile(${js(path)})">Windows'ta Aç</button></div></div>`;el.content.innerHTML=`<div class="file-editor"><div class="editor-head"><strong>${esc(name)}</strong><button class="tool" onclick="v68FileReveal(${js(path)})">Windows'ta göster</button><button class="tool primary" onclick="v68OpenExternalFile(${js(path)})">Harici aç</button></div>${body}</div>`}catch(e){el.content.innerHTML=`<div class="empty-main"><div>${esc(e.message||'Dosya açılamadı')}</div></div>`}
}
function updateLineNums(){if(!fileEditor)return;const n=fileEditor.area.value.split('\n').length;fileEditor.nums.textContent=Array.from({length:n},(_,i)=>i+1).join('\n');el.statusDetails.textContent=`${extOf(fileEditor.name)} · UTF-8 · ${n} satır`}
window.v68SaveFile=async()=>{if(!fileEditor)return;try{const r=await api.writeManagedTextSafe(fileEditor.path,fileEditor.area.value,fileEditor.mtimeMs);if(r?.conflict){const choice=await choiceModal('Dosya dışarıdan değişti',[{value:'reload',title:'Diskteki sürümü yükle',sub:'Veloria’daki kaydedilmemiş metin değiştirilir.'},{value:'overwrite',title:'Benim sürümümü kaydet',sub:'Diskteki yeni sürümün üzerine yaz.'}]);if(choice==='reload'){const d=await api.readManagedText(fileEditor.path);fileEditor.area.value=d.text;fileEditor.mtimeMs=d.mtimeMs;fileEditor.dirty=false;updateLineNums();markTabDirty('file',fileEditor.path,false)}else if(choice==='overwrite'){const w=await api.writeManagedText(fileEditor.path,fileEditor.area.value);fileEditor.mtimeMs=w.mtimeMs;fileEditor.lastDiskMtime=w.mtimeMs||fileEditor.lastDiskMtime;fileEditor.dirty=false;markTabDirty('file',fileEditor.path,false)}return}fileEditor.mtimeMs=r.mtimeMs;fileEditor.lastDiskMtime=r.mtimeMs||fileEditor.lastDiskMtime;fileEditor.dirty=false;markTabDirty('file',fileEditor.path,false);document.getElementById('editorState').textContent=`Kaydedildi · ${fmtBytes(r.size||0)}`;clearDraft(fileEditor.path);toast('Dosya kaydedildi')}catch(e){toast(e.message,'error')}};
window.v68FormatFile=()=>{if(!fileEditor)return;const n=fileEditor.name.toLowerCase();try{if(/\.jsonc?$/.test(n)){const obj=JSON.parse(fileEditor.area.value);fileEditor.area.value=JSON.stringify(obj,null,2);fileEditor.area.dispatchEvent(new Event('input'))}else toast('Bu dosya türü için biçimlendirme yok','warn')}catch(e){toast(`JSON hatası: ${e.message}`,'warn')}};
window.v68OpenExternalFile=path=>api.openManagedFile(path).catch(e=>toast(e.message,'error'));
async function checkExternalFile(){if(!fileEditor)return;try{const st=await api.statManagedFile(fileEditor.path);if(st?.mtimeMs&&fileEditor.lastDiskMtime&&Math.abs(st.mtimeMs-fileEditor.lastDiskMtime)>1&&!fileEditor.dirty){const d=await api.readManagedText(fileEditor.path);fileEditor.area.value=d.text;fileEditor.mtimeMs=d.mtimeMs;fileEditor.lastDiskMtime=d.mtimeMs;updateLineNums();toast('Dosya dışarıdan değişti; yenilendi')}else if(st?.mtimeMs)fileEditor.lastDiskMtime=st.mtimeMs}catch{}}
function draftKey(path){return `veloria68_draft_${norm(path)}`}
function saveDraft(path,text){api.saveDraft(draftKey(path),text).catch(()=>{})}
function clearDraft(path){api.deleteDraft(draftKey(path)).catch(()=>{})}
function restoreFilePosition(path){setTimeout(()=>{if(fileEditor){fileEditor.area.scrollTop=Number(ui.scroll[`file:${norm(path)}`]||0);fileEditor.nums.scrollTop=fileEditor.area.scrollTop}},15)}

async function refreshScan(){try{scan=await api.scanManagedFiles();scan.files=scan.files||[];scan.directories=scan.directories||[];scan.loaded=true;for(const f of scan.files)missingAttachmentPaths.delete(norm(f.nativePath));info.rootPath=scan.rootPath||info.rootPath;if(!inlineCreate&&!document.querySelector('.tree-rename'))renderTree()}catch(e){console.warn(e)}return scan}
function folderSize(id){const p=norm(categoryPhysicalRelative(id))+'/';return scan.files.filter(f=>norm(f.relativePath).startsWith(p)).reduce((n,f)=>n+(Number(f.size)||0),0)}
window.v68StorageForFolder=id=>{closeContext();showStorage(id)};
async function showStorage(folderId=null){await refreshScan();let files=scan.files;if(folderId){const p=norm(categoryPhysicalRelative(folderId))+'/';files=files.filter(f=>norm(f.relativePath).startsWith(p))}const total=files.reduce((n,f)=>n+(f.size||0),0);const dirs=new Map();for(const f of files){const parts=String(f.relativePath||'').replace(/\\/g,'/').split('/').filter(Boolean);parts.pop();for(let i=1;i<=parts.length;i++){const k=parts.slice(0,i).join('/');dirs.set(k,(dirs.get(k)||0)+(f.size||0))}}const tops=[...dirs].sort((a,b)=>b[1]-a[1]).slice(0,20);const largest=[...files].sort((a,b)=>(b.size||0)-(a.size||0)).slice(0,20);modal(`<div class="modal-head"><h3>Depolama analizi</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="analytics-grid"><div class="metric"><strong>${fmtBytes(total)}</strong><small>Toplam</small></div><div class="metric"><strong>${files.length}</strong><small>Dosya</small></div><div class="metric"><strong>${dirs.size}</strong><small>Klasör</small></div></div><h4>En büyük klasörler</h4><div class="analytics-list">${tops.map(([n,s])=>`<div class="analytics-row"><span>${esc(n)}</span><span>${fmtBytes(s)}</span><span></span></div>`).join('')||'<div class="analytics-row">Veri yok</div>'}</div><h4>En büyük dosyalar</h4><div class="analytics-list">${largest.map(f=>`<div class="analytics-row"><span>${esc(f.name)}</span><span>${fmtBytes(f.size||0)}</span><button class="mini" onclick="v68CloseModal();v68FileOpen(${js(f.nativePath)})">Aç</button></div>`).join('')||'<div class="analytics-row">Veri yok</div>'}</div></div>`,true)}

function workspaceMenu(){captureWorkspace();modal(`<div class="modal-head"><h3>Çalışma alanları</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body">${state.workspaceSystem.items.map(w=>`<div class="file-row" style="grid-template-columns:34px minmax(0,1fr) 70px 28px"><span class="file-glyph">◈</span><button class="name" style="text-align:left" onclick="v68SwitchWorkspace('${attr(w.id)}')"><strong>${esc(w.name)}</strong><small>${(w.pages||[]).length} sayfa · ${(w.categories||[]).length} klasör</small></button><button class="mini" onclick="v68RenameWorkspace('${attr(w.id)}')">Ad</button>${state.workspaceSystem.items.length>1?`<button class="file-menu" onclick="v68DeleteWorkspace('${attr(w.id)}')">×</button>`:'<span></span>'}</div>`).join('')}<button class="btn primary" style="width:100%;margin-top:12px" onclick="v68CreateWorkspace()">＋ Yeni çalışma alanı</button></div>`)}
window.v68WorkspaceMenu=workspaceMenu;
window.v68CreateWorkspace=()=>{modal(`<div class="modal-head"><h3>Yeni çalışma alanı</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="form-row"><label>Ad</label><input id="newWsName" autofocus placeholder="Örn. İş, Kişisel, Arşiv"></div><div class="modal-actions"><button class="btn" onclick="v68WorkspaceMenu()">Geri</button><button class="btn primary" onclick="v68ApplyWorkspaceCreate()">Oluştur</button></div></div>`)};
window.v68ApplyWorkspaceCreate=async()=>{const name=document.getElementById('newWsName').value.trim();if(!name)return;captureWorkspace();const w=newWorkspace(name);state.workspaceSystem.items.push(w);state.workspaceSystem.activeId=w.id;hydrateWorkspace();state.activePageId=null;tabs=[];ui.selectedTab='';saveUi();closeModal();await persist();await syncAllCategoryDirectories();await refreshScan();renderAll();openFolder(state.categories[0].id);toast('Çalışma alanı oluşturuldu')};
window.v68SwitchWorkspace=async id=>{if(id===state.workspaceSystem.activeId)return closeModal();saveScroll();captureWorkspace();state.workspaceSystem.activeId=id;hydrateWorkspace();state.activePageId=null;tabs=[];ui.selectedTab='';saveUi();fileSelection.clear();closeModal();await persist();await syncAllCategoryDirectories();await refreshScan();renderAll();openNearestView();toast('Çalışma alanı değiştirildi')};
window.v68RenameWorkspace=id=>{const w=state.workspaceSystem.items.find(x=>x.id===id);if(!w)return;const n=prompt('Çalışma alanı adı:',w.name);if(n?.trim()){w.name=n.trim().slice(0,60);if(id===state.workspaceSystem.activeId)el.workspaceName.textContent=w.name;persist();workspaceMenu()}};
window.v68DeleteWorkspace=async id=>{const w=state.workspaceSystem.items.find(x=>x.id===id);if(!w||state.workspaceSystem.items.length<2)return;if(!(await confirmModal('Çalışma alanını sil',`“${w.name}” içindeki mantıksal klasör ve sayfalar silinecek. Fiziksel dosyalar otomatik silinmez.`,'Sil',true)))return;state.workspaceSystem.items=state.workspaceSystem.items.filter(x=>x.id!==id);if(state.workspaceSystem.activeId===id){state.workspaceSystem.activeId=state.workspaceSystem.items[0].id;hydrateWorkspace()}await persist();workspaceMenu();renderAll()};

function settings(tab='general'){const p=state.prefs||{};modal(`<div class="modal-head"><h3>Ayarlar · ${VERSION}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div style="display:flex;gap:5px;margin-bottom:14px">${[['general','Genel'],['appearance','Görünüm'],['files','Dosyalar'],['security','Güvenlik']].map(([k,n])=>`<button class="tool ${tab===k?'primary':''}" onclick="v68Settings('${k}')">${n}</button>`).join('')}</div>${settingsBody(tab,p)}</div>`)}
function settingsBody(tab,p){if(tab==='appearance')return `<div class="form-row"><label>Tema</label><button class="btn" onclick="v68ToggleTheme()">${state.theme==='light'?'Açık':'Koyu'} · Değiştir</button></div><div class="form-row"><label>Galeri görsel boyutu</label><select onchange="v68SetThumbSize(this.value)"><option value="small" ${ui.thumbSize==='small'?'selected':''}>Küçük</option><option value="medium" ${ui.thumbSize==='medium'?'selected':''}>Normal</option><option value="large" ${ui.thumbSize==='large'?'selected':''}>Büyük</option></select></div><div class="form-row"><label>Görsel adları</label><button class="btn" onclick="v68ToggleImageNames()">${ui.showImageNames?'Gösteriliyor':'Gizli'}</button></div>`;
 if(tab==='files')return `<div class="form-row"><label>Veloria Dosyalar</label><div>${esc(info?.rootPath||'')}</div></div><div class="modal-actions" style="justify-content:flex-start"><button class="btn" onclick="veloriaDesktop.openRoot()">Klasörü aç</button><button class="btn" onclick="v68ChangeRoot()">Konumu değiştir</button><button class="btn" onclick="v68CloseModal();v68ShowStorage()">Depolama analizi</button></div><div class="form-row"><label>Not TXT aynası</label><button class="btn" onclick="v68ToggleNoteMirror()">${state.prefs.showNoteMirror?'Göster':'Gizle'}</button></div>`;
 if(tab==='security')return `<div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" onclick="v68PinSettings()">Uygulama şifresi</button><button class="btn" onclick="v68LockNow()">Şimdi kilitle</button></div>`;
 return `<div class="form-row"><label>Çalışma alanı</label><button class="btn" onclick="v68CloseModal();v68WorkspaceMenu()">${esc(currentWorkspaceName())} · Yönet</button></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" onclick="v68CloseModal();v68QuickOpen()">Hızlı aç · Ctrl+P</button><button class="btn" onclick="v68CloseModal();veloriaDesktop.openRecovery()">Kurtarma</button><button class="btn" onclick="v68CloseModal();v68Undo()">Son işlemi geri al</button></div>`}
window.v68Settings=settings;window.v68ToggleTheme=()=>{state.theme=state.theme==='light'?'dark':'light';document.body.classList.toggle('light',state.theme==='light');persist();settings('appearance')};
window.v68SetThumbSize=value=>{ui.thumbSize=String(value||'medium');saveUi()};
window.v68ToggleImageNames=()=>{ui.showImageNames=!ui.showImageNames;saveUi();settings('appearance')};
window.v68ToggleNoteMirror=()=>{state.prefs.showNoteMirror=!state.prefs.showNoteMirror;persist();settings('files')};
window.v68ShowStorage=()=>showStorage();
window.v683SetDefaultImageMode=value=>{ui.defaultImageMode=String(value||'gallery');saveUi()};
window.v683SetDefaultImageWidth=input=>{const value=Math.max(120,Math.min(1000,Number(input?.value)||240));ui.defaultImageWidth=value;saveUi();if(input?.nextElementSibling)input.nextElementSibling.textContent=value+' px'};
window.v683SetDefaultFileDisplay=value=>{ui.defaultFileDisplay=String(value||'card');saveUi()};
window.v683SetShowAttachmentPaths=checked=>{ui.showAttachmentPaths=!!checked;saveUi()};
window.v682UpdateVisualPreview=()=>updateVisualPreview();
window.v68ChangeRoot=async()=>{try{const r=await api.chooseRoot();if(!r?.canceled){info.rootPath=r.rootPath;await refreshScan();settings('files');toast('Depolama konumu değişti')}}catch(e){toast(e.message,'error')}};
window.v68LockNow=()=>{closeModal();showLock()};


function quickOpen(){const items=[...categories().map(c=>({kind:'folder',id:c.id,title:c.name,sub:catPath(c.id).slice(0,-1).join(' / ')})),...pages().map(p=>({kind:'page',id:p.id,title:p.title,sub:catPath(p.categoryId).join(' / ')})),...scan.files.map(f=>({kind:'file',path:f.nativePath,title:f.name,sub:f.relativePath}))];modal(`<div class="modal-head"><h3>Hızlı aç</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><input id="quickOpenInput" autofocus placeholder="Yaz ve ara…" style="width:100%;padding:10px;border-radius:9px"><div id="quickOpenResults" style="margin-top:8px;max-height:55vh;overflow:auto"></div></div>`,true);const inp=document.getElementById('quickOpenInput'),box=document.getElementById('quickOpenResults');const draw=()=>{const q=inp.value.toLocaleLowerCase('tr');const out=items.filter(x=>!q||`${x.title} ${x.sub}`.toLocaleLowerCase('tr').includes(q)).slice(0,80);box.innerHTML=out.map((x,i)=>`<button class="file-row" style="width:100%;grid-template-columns:34px minmax(0,1fr) 28px" onclick="v68QuickChoose('${x.kind}',${js(x.id||x.path)})"><span class="file-glyph">${x.kind==='folder'?'▣':x.kind==='page'?'▤':esc(iconForFile(x.title))}</span><span class="name"><strong>${esc(x.title)}</strong><small>${esc(x.sub||'')}</small></span><span>↵</span></button>`).join('')};inp.oninput=draw;draw()}
window.v68QuickOpen=quickOpen;window.v68QuickChoose=(kind,v)=>{closeModal();if(kind==='folder')openFolder(v);else if(kind==='page')openPage(v);else openFile(v,baseName(v))};

function queueStatusLabel(q){if(q.status==='cancelled')return'İptal edildi';if(q.status==='error')return'Hata';if(q.status==='completed')return'Tamamlandı';if(q.status==='cancelling')return'İptal ediliyor…';if(q.status==='paused')return'Duraklatıldı';return`${Math.round(q.percent||0)}%`}
function renderQueue(){const nowMs=Date.now();for(const [k,q] of queueItems){if(q.terminal&&nowMs-(q.finishedAt||nowMs)>1300)queueItems.delete(k)}const arr=[...queueItems.values()].sort((a,b)=>b.started-a.started);if(!arr.length){el.queue.style.display='none';el.queue.innerHTML='';return}el.queue.style.display='block';el.queue.innerHTML=`<div class="queue-head">Dosya işlemleri</div>${arr.map(q=>`<div class="queue-item ${q.terminal?'terminal':''}"><div class="queue-line"><strong>${esc(q.name||'Dosya')}</strong><span>${esc(queueStatusLabel(q))}</span></div><div class="progress"><span style="width:${Math.max(0,Math.min(100,q.status==='completed'?100:(q.percent||0)))}%"></span></div>${q.error?`<div class="queue-error">${esc(q.error)}</div>`:''}<div class="queue-actions">${q.transferId&&!q.terminal?`<button ${q.status==='paused'?'disabled':''} onclick="v68Transfer('${attr(q.transferId)}','pause')">Duraklat</button><button ${q.status!=='paused'?'disabled':''} onclick="v68Transfer('${attr(q.transferId)}','resume')">Devam</button><button ${q.status==='cancelling'?'disabled':''} onclick="v68Transfer('${attr(q.transferId)}','cancel')">İptal</button>`:''}</div></div>`).join('')}`;clearTimeout(queueCleanupTimer);queueCleanupTimer=setTimeout(renderQueue,1500)}
window.v68Transfer=async(id,action)=>{const q=queueItems.get(id);if(q){if(action==='cancel'){q.status='cancelling'}else if(action==='pause'){q.status='paused'}else if(action==='resume'){q.status='active'}renderQueue()}try{const r=await api.transferControl(id,action);if(action==='cancel'&&r?.missing&&q){q.status='cancelled';q.terminal=true;q.finishedAt=Date.now();renderQueue()}}catch(e){toast(e.message,'error')}};
api.onFileProgress?.(p=>{const key=p.transferId||p.token||`${p.name}:${p.blockId||''}`;const prev=queueItems.get(key)||{};const terminal=!!p.terminal||['completed','cancelled','error'].includes(p.status);queueItems.set(key,{...prev,...p,started:prev.started||Date.now(),finishedAt:terminal?(p.finishedAt||Date.now()):prev.finishedAt,terminal,percent:p.percent??(p.total?((p.loaded||p.bytes||0)/p.total*100):(prev.percent||0)),status:p.status||prev.status||'active'});renderQueue()});

async function pasteFilesIntoPage(targetPageId,paths,mode){const p=page(targetPageId);if(!p)return;for(const src of paths){const target=winJoin(info.rootPath,...catPath(p.categoryId).map(safeSegment),safeSegment(p.title),'Dosyalar',baseName(src));try{const r=mode==='copy'?await api.copyManagedExact(src,target,'keepBoth'):await api.moveManagedExact(src,target,'keepBoth');if(mode==='move')updateAttachmentRefs(src,r.target);p.blocks.push({id:uid('blk'),type:'attachment',name:baseName(r.target),nativePath:r.target,size:0,displayMode:isImage(r.target)?'gallery':'list',imageSize:'medium'})}catch(e){toast(e.message,'error')}}touchPage(p);await refreshScan();renderContent()}

function findInOpen(){if(fileEditor){const q=prompt('Dosyada bul:');if(!q)return;const text=fileEditor.area.value,start=fileEditor.area.selectionEnd||0;let i=text.toLocaleLowerCase('tr').indexOf(q.toLocaleLowerCase('tr'),start);if(i<0)i=text.toLocaleLowerCase('tr').indexOf(q.toLocaleLowerCase('tr'));if(i>=0){fileEditor.area.focus();fileEditor.area.setSelectionRange(i,i+q.length);const before=text.slice(0,i).split('\n').length;fileEditor.area.scrollTop=Math.max(0,(before-5)*21)}else toast('Bulunamadı','warn');return}const q=prompt('Sayfada bul:');if(q&&typeof window.find==='function'&&!window.find(q,false,false,true,false,true,false))toast('Bulunamadı','warn')}
function gotoLine(){if(!fileEditor)return;const n=Math.max(1,Number(prompt('Satır numarası:')||0));if(!n)return;const lines=fileEditor.area.value.split('\n');let pos=0;for(let i=0;i<Math.min(n-1,lines.length);i++)pos+=lines[i].length+1;fileEditor.area.focus();fileEditor.area.setSelectionRange(pos,pos);fileEditor.area.scrollTop=Math.max(0,(n-5)*21)}
async function workspaceSearch(){const q=prompt('Tüm Veloria içinde ara:');if(!q)return;const low=q.toLocaleLowerCase('tr'),hits=[];for(const p of pages()){const text=(p.title+' '+pagePlainText(p)).toLocaleLowerCase('tr');if(text.includes(low))hits.push({kind:'page',id:p.id,title:p.title,sub:catPath(p.categoryId).join(' / ')})}for(const f of scan.files){if(String(f.name+' '+f.relativePath).toLocaleLowerCase('tr').includes(low))hits.push({kind:'file',path:f.nativePath,title:f.name,sub:f.relativePath})}modal(`<div class="modal-head"><h3>Arama · ${esc(q)}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body">${hits.slice(0,200).map(x=>`<button class="file-row" style="width:100%;grid-template-columns:34px minmax(0,1fr) 28px" onclick="v68CloseModal();${x.kind==='page'?`v68OpenPage('${attr(x.id)}')`:`v68FileOpen(${js(x.path)})`}"><span class="file-glyph">${x.kind==='page'?'▤':esc(iconForFile(x.title))}</span><span class="name"><strong>${esc(x.title)}</strong><small>${esc(x.sub||'')}</small></span><span>↵</span></button>`).join('')||'<div style="color:var(--muted)">Sonuç yok.</div>'}</div>`,true)}
async function quickPreviewSelected(){if(currentView.kind!=='folder'||fileSelection.size!==1)return;const path=selectedFilePaths()[0];if(!path)return;try{const p=await api.previewManagedFile(path);let body='';if(p.kind==='image')body=`<div class="preview-shell" style="height:65vh"><img src="${attr(p.url)}"></div>`;else if(p.kind==='video')body=`<div class="preview-shell" style="height:65vh"><video src="${attr(p.url)}" controls></video></div>`;else if(p.kind==='audio')body=`<div style="padding:30px"><audio src="${attr(p.url)}" controls style="width:100%"></audio></div>`;else if(p.kind==='pdf')body=`<div class="preview-shell" style="height:70vh"><iframe src="${attr(p.url)}"></iframe></div>`;else if(p.kind==='text')body=`<pre style="white-space:pre-wrap;max-height:65vh;overflow:auto;padding:16px;background:#020617">${esc(p.text||'')}</pre>`;else body=`<div style="padding:30px;color:var(--muted)">Hızlı önizleme yok. Enter/çift tık ile aç.</div>`;modal(`<div class="modal-head"><h3>${esc(baseName(path))}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div>${body}`,true)}catch(e){toast(e.message,'error')}}
function commandPalette(){const cmds=[['Yeni kök klasör',()=>document.getElementById('rootAdd').click()],['Hızlı aç',quickOpen],['Depolama analizi',()=>showStorage()],['Ayarlar',()=>settings('general')],['Çalışma alanları',workspaceMenu],['Geri al',undo]];modal(`<div class="modal-head"><h3>Komutlar</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><input id="cmdQ" autofocus placeholder="Komut ara…" style="width:100%;padding:10px;border-radius:9px"><div id="cmdList" style="margin-top:8px"></div></div>`);const q=document.getElementById('cmdQ'),box=document.getElementById('cmdList');const draw=()=>{const x=q.value.toLocaleLowerCase('tr');box.innerHTML=cmds.map((c,i)=>({c,i})).filter(o=>!x||o.c[0].toLocaleLowerCase('tr').includes(x)).map(o=>`<button class="file-row" style="width:100%;grid-template-columns:minmax(0,1fr) 28px" onclick="v68RunCommand(${o.i})"><span class="name"><strong>${esc(o.c[0])}</strong></span><span>↵</span></button>`).join('')};window.__v68Commands=cmds;window.v68RunCommand=i=>{const fn=window.__v68Commands?.[i]?.[1];closeModal();fn?.()};q.oninput=draw;draw()}
function globalKeys(e){const editable=!!e.target.closest?.('input,textarea,[contenteditable="true"],select');const cmd=e.ctrlKey||e.metaKey;
 if(cmd&&e.shiftKey&&e.key.toLowerCase()==='p'){e.preventDefault();commandPalette();return}
 if(cmd&&e.key.toLowerCase()==='p'){e.preventDefault();quickOpen();return}
 if(cmd&&e.shiftKey&&e.key.toLowerCase()==='f'){e.preventDefault();workspaceSearch();return}
 if(cmd&&e.key.toLowerCase()==='f'){e.preventDefault();findInOpen();return}
 if(cmd&&e.key.toLowerCase()==='g'&&fileEditor){e.preventDefault();gotoLine();return}
 if(cmd&&e.key.toLowerCase()==='s'){if(fileEditor){e.preventDefault();v68SaveFile();return}if(currentView.kind==='page'){e.preventDefault();const p=page(currentView.id);schedulePageTxt(p,true);markTabDirty('page',p.id,false);toast('Sayfa kaydedildi');return}}
 if(cmd&&e.key.toLowerCase()==='z'&&!editable){e.preventDefault();undo();return}
 if(cmd&&e.key.toLowerCase()==='c'&&!editable){e.preventDefault();if(currentView.kind==='folder'&&fileSelection.size)v68FileCopy('copy');else if(treeSelection)v68Clipboard('copy',treeSelection.kind,treeSelection.id);return}
 if(cmd&&e.key.toLowerCase()==='x'&&!editable){e.preventDefault();if(currentView.kind==='folder'&&fileSelection.size)v68FileCopy('cut');else if(treeSelection)v68Clipboard('cut',treeSelection.kind,treeSelection.id);return}
 if(cmd&&e.key.toLowerCase()==='v'&&!editable){e.preventDefault();if(treeClipboard?.kind==='files'){if(treeSelection?.kind==='page')pasteFilesIntoPage(treeSelection.id,treeClipboard.paths,treeClipboard.mode);else toast('Dosyaları yapıştırmak için hedef sayfayı seç','warn')}else pasteTree(treeSelection?.kind==='folder'?treeSelection.id:null);return}
 if(cmd&&e.key.toLowerCase()==='w'){e.preventDefault();if(ui.selectedTab)closeTab(ui.selectedTab);return}
 if(cmd&&e.key==='Tab'&&!editable){e.preventDefault();if(!tabs.length)return;const i=tabs.findIndex(t=>t.key===ui.selectedTab);activateTab(tabs[(i+1)%tabs.length].key);return}
 if(e.key==='F2'&&!editable){e.preventDefault();if(treeSelection?.kind==='folder')renameFolderInline(treeSelection.id);else if(treeSelection?.kind==='page')renamePageInline(treeSelection.id);else if(currentView.kind==='folder'&&fileSelection.size===1)v68FileRename(selectedFilePaths()[0]);return}
 if(e.code==='Space'&&!editable&&currentView.kind==='folder'&&fileSelection.size===1){e.preventDefault();quickPreviewSelected();return}
 if(e.key==='Delete'&&!editable&&currentView.kind==='folder'&&fileSelection.size){e.preventDefault();v68FilesDelete();return}
 if(e.key==='Escape'){closeContext();if(el.modal.innerHTML)closeModal(null)}
}

document.addEventListener('keydown',globalKeys,true);document.addEventListener('mousedown',e=>{if(!e.target.closest('.context'))closeContext()});el.content.addEventListener('scroll',()=>{if(window.__v684PasteViewportLock)return;if(currentView.kind==='page'||currentView.kind==='folder'){ui.scroll[`${currentView.kind}:${currentView.id}`]=el.content.scrollTop;saveUi()}},{passive:true});

// Bind the permanent sidebar controls before optional UI-polish layers are evaluated.
// This prevents a later non-critical renderer error from leaving the whole sidebar inert.
bindStaticUi();

function renderAll(){renderTree();renderTabs();renderContent()}

/* ===== Veloria 6.8.1 UI Polish / Custom visuals ===== */
const V681_ICON_INNER={
  folder:'<path d="M3 6.5h6l2 2h10v10.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  note:'<path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5M9 12h6M9 16h6"></path>',
  file:'<path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5"></path>',
  image:'<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="2"></circle><path d="m21 15-5-5L5 20"></path>',
  code:'<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"></path>',
  archive:'<path d="M4 7h16v13H4zM3 3h18v4H3zM9 11h6"></path>',
  link:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"></path>',
  book:'<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22zM20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22z"></path>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"></path>',
  box:'<path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"></path>',
  briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"></path>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>',
  terminal:'<path d="m5 7 4 4-4 4M11 17h8"></path><rect x="3" y="3" width="18" height="18" rx="2"></rect>',
  globe:'<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"></path>',
  palette:'<path d="M12 3a9 9 0 0 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h2.5A6.5 6.5 0 0 0 21 6.5 9 9 0 0 0 12 3z"></path><circle cx="7.5" cy="10" r="1"></circle><circle cx="9.5" cy="6.5" r="1"></circle><circle cx="14" cy="6.5" r="1"></circle>',
  music:'<path d="M9 18V5l10-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="16" cy="16" r="3"></circle>',
  video:'<rect x="3" y="5" width="14" height="14" rx="2"></rect><path d="m17 10 4-3v10l-4-3z"></path>',
  table:'<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 10h18M9 4v16M15 4v16"></path>',
  rocket:'<path d="M14 4c3-2 6-1 6-1s1 3-1 6l-6 6-4-4zM9 11l-4 1-2 3 6 1M13 15l-1 4-3 2-1-6"></path>',
  heart:'<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6z"></path>',
  tag:'<path d="M20 13 13 20l-9-9V4h7z"></path><circle cx="8.5" cy="8.5" r="1.5"></circle>',
  pdf:'<path d="M6 3h9l4 4v14H6zM14 3v5h5"></path><path d="M8 16h8M8 12h6"></path>',
  workspace:'<rect x="3" y="3" width="7" height="7" rx="2"></rect><rect x="14" y="3" width="7" height="7" rx="2"></rect><rect x="3" y="14" width="7" height="7" rx="2"></rect><rect x="14" y="14" width="7" height="7" rx="2"></rect>',
  plus:'<path d="M12 5v14M5 12h14"></path>',
  search:'<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
  more:'<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>',
  chevronDown:'<path d="m8 10 4 4 4-4"></path>',
  chevronRight:'<path d="m10 8 4 4-4 4"></path>',
  close:'<path d="m7 7 10 10M17 7 7 17"></path>',
  check:'<path d="m5 12 4 4L19 6"></path>',
  copy:'<rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path>',
  cut:'<circle cx="6" cy="7" r="3"></circle><circle cx="6" cy="17" r="3"></circle><path d="m8.5 8.5 10 7M8.5 15.5l10-7"></path>',
  move:'<path d="M5 9V5h4M19 15v4h-4M9 5h6a4 4 0 0 1 4 4M15 19H9a4 4 0 0 1-4-4"></path>',
  trash:'<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"></path>',
  eye:'<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><circle cx="12" cy="12" r="2.5"></circle>',
  pin:'<path d="m14 4 6 6-3 1-4 4-1 5-2-2-2-2 5-1 4-4zM7 17l-3 3"></path>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path>',
  shield:'<path d="M12 3 4 6v5c0 5 3.5 8.2 8 10 4.5-1.8 8-5 8-10V6z"></path><path d="m9 12 2 2 4-5"></path>',
  save:'<path d="M5 3h12l3 3v15H4V3zM8 3v6h8V3M8 21v-7h8v7"></path>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6.1 7.1A8 8 0 0 1 19 9M17.9 16.9A8 8 0 0 1 5 15"></path>',
  settings:'<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1H21v4h-.1a1.7 1.7 0 0 0-1.5 1z"></path>',
  drive:'<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M7 15h.01M17 15h.01M3 11h18"></path>',
  sparkles:'<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"></path>'
};
const V681_VISUAL_ICONS=['folder','note','file','image','code','archive','link','book','star','box','briefcase','database','terminal','globe','palette','music','video','table','rocket','heart','tag'];
function iconSvg(key='file',extra=''){const inner=V681_ICON_INNER[key]||V681_ICON_INNER.file;return `<svg class="v-icon ${extra}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`}
function fileIconKey(name,custom=''){if(custom&&V681_ICON_INNER[custom])return custom;if(isImage(name))return'image';if(isPdf(name))return'pdf';if(/\.(zip|rar|7z|tar|gz)$/i.test(String(name||'')))return'archive';if(isText(name))return'code';if(/\.(mp3|wav|flac|m4a|ogg)$/i.test(String(name||'')))return'music';if(/\.(mp4|mkv|mov|webm|avi)$/i.test(String(name||'')))return'video';return'file'}
function cleanColor(v=''){v=String(v||'').trim();if(/^#[0-9a-f]{6}$/i.test(v))return v.toUpperCase();const m=v.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);if(m){const a=m.slice(1).map(x=>Math.max(0,Math.min(255,Number(x)||0)));return '#'+a.map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase()}return''}
function colorParts(hex){hex=cleanColor(hex)||'#2F6FED';return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
function accentAttr(color){const c=cleanColor(color);return c?` has-accent" style="--item-accent:${c}`:''}
function ctxIcon(icon,label,action,cls=''){return `<button class="${cls}" onclick="${action}"><span class="ctx-icon">${iconSvg(icon,'sm')}</span><span>${label}</span></button>`}
function normalizeVisualMeta(){
  const labelMap={red:'#EF4444',amber:'#F59E0B',green:'#34D399',blue:'#3B82F6'};
  for(const c of categories()){if(!c.icon||!V681_ICON_INNER[c.icon])c.icon='folder';c.accentColor=cleanColor(c.accentColor||c.color||'')}
  for(const p of pages()){if(!p.icon||!V681_ICON_INNER[p.icon])p.icon='note';p.accentColor=cleanColor(p.accentColor||p.color||'')}
  state.fileMeta=state.fileMeta||{};
  for(const m of Object.values(state.fileMeta)){if(!m||typeof m!=='object')continue;m.accentColor=cleanColor(m.accentColor||(m.label?labelMap[m.label]:'')||'');m.icon=V681_ICON_INNER[m.icon]?m.icon:'';delete m.label}
}
const _v680LoadState=loadState;loadState=async function(){await _v680LoadState();normalizeVisualMeta();captureWorkspace();await persist(false)};
const _v680CreateFolder=createFolder;createFolder=function(name,parentId=null){const c=_v680CreateFolder(name,parentId);if(c){c.icon='folder';c.accentColor='';persist(false)}return c};
const _v680CreatePage=createPage;createPage=function(categoryId,title='Yeni Sayfa'){const p=_v680CreatePage(categoryId,title);if(p){p.icon='note';p.accentColor='';persist(false)}return p};
const _v680FileMeta=fileMeta;fileMeta=function(path){const m=_v680FileMeta(path);const map={red:'#EF4444',amber:'#F59E0B',green:'#34D399',blue:'#3B82F6'};if(m.label&&!m.accentColor)m.accentColor=map[m.label]||'';m.accentColor=cleanColor(m.accentColor||'');m.icon=V681_ICON_INNER[m.icon]?m.icon:'';if(!('description'in m))m.description='';if(!('pinned'in m))m.pinned=false;delete m.label;return m};

renderTabs=function(){el.tabs.innerHTML=tabs.map(t=>{let key='file',accent='';if(t.kind==='folder'){const c=cat(t.id);key=c?.icon||'folder';accent=c?.accentColor||''}else if(t.kind==='page'){const p=page(t.id);key=p?.icon||'note';accent=p?.accentColor||''}else{const m=fileMeta(t.path);key=fileIconKey(t.name,m.icon);accent=m.accentColor||''}const ac=cleanColor(accent);return `<button class="tab ${ui.selectedTab===t.key?'active':''} ${ac?'has-accent':''}" ${ac?`style="--item-accent:${ac}"`:''} onclick="v68ActivateTab('${attr(t.key)}')"><span class="tab-icon">${iconSvg(key,'sm')}</span><span class="tab-title">${esc(t.title||t.name||'İsimsiz')}</span>${t.dirty?'<span class="dirty">•</span>':''}<span class="close" onclick="v68CloseTab('${attr(t.key)}',event)">${iconSvg('close','sm')}</span></button>`}).join('')};

renderTree=function(){
  el.workspaceName.textContent=currentWorkspaceName();
  const q=el.search.value.trim().toLocaleLowerCase('tr');
  const roots=catChildren(null).filter(c=>treeMatch(c,q));
  el.tree.innerHTML=roots.length?roots.map(c=>renderCat(c,q,0)).join(''):`<div class="tree-empty">${q?'Aramana uyan klasör veya sayfa bulunamadı.':'Henüz klasör yok.<br><span class="help-text">Üstteki + düğmesiyle ilk klasörünü oluşturabilirsin.</span>'}</div>`;
  restoreInlineFocus();
};
renderCat=function(c,q,depth){
  const open=q?true:(ui.folderOpen[c.id]!==undefined?ui.folderOpen[c.id]:!c.collapsed),ps=pagesInCat(c.id).filter(p=>!q||p.title.toLocaleLowerCase('tr').includes(q)||c.name.toLocaleLowerCase('tr').includes(q)),children=catChildren(c.id).filter(x=>treeMatch(x,q)),sz=folderSize(c.id),selected=treeSelection?.kind==='folder'&&treeSelection.id===c.id,ac=cleanColor(c.accentColor||'');
  return `<div class="folder-node" data-cat="${attr(c.id)}" draggable="true" ondragstart="v68TreeDragStart(event,'folder','${attr(c.id)}')" ondragend="v68TreeDragEnd(event)">
    <div class="folder-row ${selected?'selected':''} ${ac?'has-accent':''}" ${ac?`style="--item-accent:${ac}"`:''} data-drop-folder="${attr(c.id)}" ondragover="v68TreeDragOver(event,'${attr(c.id)}')" ondragleave="v68TreeDragLeave(event)" ondrop="v68TreeDrop(event,'${attr(c.id)}')" oncontextmenu="v68FolderMenu(event,'${attr(c.id)}')">
      <button class="chev" title="${open?'Kapat':'Aç'}" onclick="v68ToggleFolder('${attr(c.id)}')">${iconSvg(open?'chevronDown':'chevronRight','sm')}</button>
      <button class="row-main" onclick="v68SelectFolder('${attr(c.id)}')" ondblclick="v68OpenFolder('${attr(c.id)}')"><span class="row-icon">${iconSvg(c.icon||'folder','sm')}</span><span class="title">${esc(c.name)}</span><span class="folder-size">${sz?fmtBytes(sz):''}</span></button>
      <button class="row-dot" title="Sayfa ekle" onclick="event.stopPropagation();v68InlineCreate('${attr(c.id)}','page')">${iconSvg('plus','sm')}</button>
      <button class="row-dot" title="Klasör menüsü" onclick="v68FolderMenu(event,'${attr(c.id)}')">${iconSvg('more','sm')}</button>
    </div>
    ${open?`<div class="children">${inlineCreate?.parentId===c.id?renderInlineCreate():''}${ps.map(p=>renderPageRow(p)).join('')}${children.map(x=>renderCat(x,q,depth+1)).join('')}</div>`:''}
  </div>`
};
renderPageRow=function(p){const selected=treeSelection?.kind==='page'&&treeSelection.id===p.id,ac=cleanColor(p.accentColor||'');return `<div class="page-row ${selected?'selected':''} ${ac?'has-accent':''}" ${ac?`style="--item-accent:${ac}"`:''} data-page="${attr(p.id)}" draggable="true" ondragstart="v68TreeDragStart(event,'page','${attr(p.id)}')" ondragend="v68TreeDragEnd(event)" ondragover="v68PageDragOver(event,'${attr(p.id)}')" ondragleave="v68TreeDragLeave(event)" ondrop="v68PageDrop(event,'${attr(p.id)}')" oncontextmenu="v68PageMenu(event,'${attr(p.id)}')"><span class="chev" style="visibility:hidden">${iconSvg('chevronRight','sm')}</span><button class="row-main" onclick="v68SelectPage('${attr(p.id)}')" ondblclick="v68OpenPage('${attr(p.id)}')"><span class="row-icon">${iconSvg(p.icon||'note','sm')}</span><span class="title">${esc(p.title)}</span></button><button class="row-dot" title="Sayfa menüsü" onclick="v68PageMenu(event,'${attr(p.id)}')">${iconSvg('more','sm')}</button></div>`};
renderInlineCreate=function(){return `<div class="inline-create"><input id="inlineCreateInput" data-kind="${inlineCreate.kind}" placeholder="${inlineCreate.kind==='folder'?'Yeni alt klasörün adı':'Yeni sayfanın adı'}" onkeydown="v68InlineKey(event)"><button title="Oluştur" onclick="v68InlineCommit()">${iconSvg('check','sm')}</button><button title="İptal" onclick="v68InlineCancel()">${iconSvg('close','sm')}</button></div>`};

folderMenuHtml=function(id){return `${ctxIcon('plus','Yeni sayfa',`v68MenuNewPage('${attr(id)}')`)}${ctxIcon('folder','Yeni alt klasör',`v68MenuNewFolder('${attr(id)}')`)}<hr>${ctxIcon('palette','Renk ve ikon',`v681FolderAppearance('${attr(id)}')`)}${ctxIcon('note','Yeniden adlandır',`v68RenameFolder('${attr(id)}')`)}${ctxIcon('move','Başka klasöre taşı',`v68MoveFolderDialog('${attr(id)}')`)}${ctxIcon('copy','Kopyala',`v68Clipboard('copy','folder','${attr(id)}')`)}${ctxIcon('cut','Kes',`v68Clipboard('cut','folder','${attr(id)}')`)}<hr>${ctxIcon('folder','Klasörü görüntüle',`v68OpenFolder('${attr(id)}')`)}${ctxIcon('drive','Depolama bilgisi',`v68StorageForFolder('${attr(id)}')`)}${ctxIcon('trash','Sil',`v68DeleteFolder('${attr(id)}')`,'danger')}`};
pageMenuHtml=function(id){return `${ctxIcon('note','Aç',`v68OpenPage('${attr(id)}')`)}${ctxIcon('palette','Renk ve ikon',`v681PageAppearance('${attr(id)}')`)}${ctxIcon('note','Yeniden adlandır',`v68RenamePage('${attr(id)}')`)}${ctxIcon('move','Başka klasöre taşı',`v68MovePageDialog('${attr(id)}')`)}${ctxIcon('copy','Kopyala',`v68Clipboard('copy','page','${attr(id)}')`)}${ctxIcon('cut','Kes',`v68Clipboard('cut','page','${attr(id)}')`)}${ctxIcon('plus','Çoğalt',`v68DuplicatePage('${attr(id)}')`)}<hr>${ctxIcon('eye',"Windows'ta göster",`v68RevealPage('${attr(id)}')`)}${ctxIcon('trash','Sil',`v68DeletePage('${attr(id)}')`,'danger')}`};

function visualEditorMarkup(icon,color,defaultIcon='file',allowAuto=false){const ac=cleanColor(color),shown=ac||'#2F6FED',rgb=colorParts(shown),chosen=allowAuto?(icon||'auto'):(icon||defaultIcon);const buttons=(allowAuto?['auto',...V681_VISUAL_ICONS]:V681_VISUAL_ICONS).map(k=>{const actual=k==='auto'?defaultIcon:k;return `<button type="button" class="icon-choice ${chosen===k?'selected':''}" data-visual-icon="${attr(k)}" title="${k==='auto'?'Dosya türüne göre otomatik':k}" onclick="v681SelectIcon('${attr(k)}')">${iconSvg(actual)}</button>`}).join('');return `<div class="visual-editor"><div id="visualPreview" class="visual-preview" style="--preview-accent:${ac||'transparent'}"><span id="visualPreviewIcon">${iconSvg(chosen==='auto'?defaultIcon:chosen)}</span></div><div><div class="form-row"><label>Renk</label><div class="color-line"><input id="visualColor" type="color" value="${shown}" oninput="v681ColorFromPicker()"><input id="visualHex" value="${ac||''}" placeholder="#2F6FED" oninput="v681ColorFromHex()"></div><div class="rgb-line"><div class="rgb-field"><span>R</span><input id="visualR" type="number" min="0" max="255" value="${rgb[0]}" oninput="v681ColorFromRgb()"></div><div class="rgb-field"><span>G</span><input id="visualG" type="number" min="0" max="255" value="${rgb[1]}" oninput="v681ColorFromRgb()"></div><div class="rgb-field"><span>B</span><input id="visualB" type="number" min="0" max="255" value="${rgb[2]}" oninput="v681ColorFromRgb()"></div></div><div style="display:flex;gap:6px;margin-top:7px"><button class="btn" type="button" onclick="v681ClearColor()">Rengi kaldır</button></div></div><div class="form-row"><label>İkon</label><input id="visualIcon" type="hidden" value="${attr(chosen)}"><input id="visualAutoIcon" type="hidden" value="${attr(defaultIcon)}"><div class="icon-picker">${buttons}</div><div class="help-text" style="margin-top:8px">İkon ve renk yalnızca görünümü değiştirir; dosya veya klasör yapısına dokunmaz.</div></div></div></div>`}
function updateVisualPreview(){const hex=cleanColor(document.getElementById('visualHex')?.value||''),key=document.getElementById('visualIcon')?.value||'file',autoKey=document.getElementById('visualAutoIcon')?.value||'file',preview=document.getElementById('visualPreview'),pi=document.getElementById('visualPreviewIcon');if(preview)preview.style.setProperty('--preview-accent',hex||'transparent');if(pi)pi.innerHTML=iconSvg(key==='auto'?autoKey:key);document.querySelectorAll('[data-visual-icon]').forEach(b=>b.classList.toggle('selected',b.dataset.visualIcon===key))}
window.v681SelectIcon=key=>{const x=document.getElementById('visualIcon');if(x)x.value=key;updateVisualPreview()};
window.v681ColorFromPicker=()=>{const c=cleanColor(document.getElementById('visualColor')?.value||'');if(!c)return;document.getElementById('visualHex').value=c;const [r,g,b]=colorParts(c);document.getElementById('visualR').value=r;document.getElementById('visualG').value=g;document.getElementById('visualB').value=b;updateVisualPreview()};
window.v681ColorFromHex=()=>{const x=document.getElementById('visualHex'),c=cleanColor(x?.value||'');if(c){document.getElementById('visualColor').value=c;const [r,g,b]=colorParts(c);document.getElementById('visualR').value=r;document.getElementById('visualG').value=g;document.getElementById('visualB').value=b}updateVisualPreview()};
window.v681ColorFromRgb=()=>{const vals=['visualR','visualG','visualB'].map(id=>Math.max(0,Math.min(255,Number(document.getElementById(id)?.value)||0))),c='#'+vals.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();document.getElementById('visualHex').value=c;document.getElementById('visualColor').value=c;updateVisualPreview()};
window.v681ClearColor=()=>{document.getElementById('visualHex').value='';updateVisualPreview()};
window.v681FolderAppearance=id=>{closeContext();const c=cat(id);if(!c)return;modal(`<div class="modal-head"><h3>${esc(c.name)} · Görünüm</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body">${visualEditorMarkup(c.icon,c.accentColor,'folder',false)}<div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v681SaveFolderAppearance('${attr(id)}')">Kaydet</button></div></div>`)};
window.v681SaveFolderAppearance=id=>{const c=cat(id);if(!c)return;c.icon=document.getElementById('visualIcon').value||'folder';c.accentColor=cleanColor(document.getElementById('visualHex').value);persist(false);closeModal();renderTree();renderTabs();if(currentView.kind==='folder'&&currentView.id===id)renderFolderView(id);toast('Klasör görünümü güncellendi')};
window.v681PageAppearance=id=>{closeContext();const p=page(id);if(!p)return;modal(`<div class="modal-head"><h3>${esc(p.title)} · Görünüm</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body">${visualEditorMarkup(p.icon,p.accentColor,'note',false)}<div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v681SavePageAppearance('${attr(id)}')">Kaydet</button></div></div>`)};
window.v681SavePageAppearance=id=>{const p=page(id);if(!p)return;p.icon=document.getElementById('visualIcon').value||'note';p.accentColor=cleanColor(document.getElementById('visualHex').value);persist(false);closeModal();renderTree();renderTabs();if(currentView.kind==='page'&&currentView.id===id)renderPage(id);toast('Sayfa görünümü güncellendi')};

renderPage=function(id){const p=page(id);if(!p)return openNearestView();const ac=cleanColor(p.accentColor||'');
  el.content.innerHTML=`<div class="view" data-page-view="${attr(id)}"><div class="crumbs">${crumbHtml(p.categoryId,true)}</div><div class="view-title-row"><button class="view-menu" title="Renk ve ikon" onclick="v681PageAppearance('${attr(id)}')" style="color:${ac||'var(--muted)'}">${iconSvg(p.icon||'note','lg')}</button><input id="pageTitle" class="page-title" value="${attr(p.title)}" placeholder="Sayfa adı"><button class="view-menu" title="Sayfa menüsü" onclick="v68PageTopMenu(event,'${attr(id)}')">${iconSvg('more')}</button></div><div id="blocks" class="blocks">${renderBlocks(p)}</div></div>`;
  const title=document.getElementById('pageTitle');let titleStart=p.title;title.addEventListener('input',()=>{p.title=title.value;p.updatedAt=now();markTabDirty('page',p.id,true);updateCurrentTabTitle(p);persist(false)});title.addEventListener('blur',async()=>{let n=title.value.trim()||'İsimsiz';n=uniquePageTitle(p.categoryId,n,p.id);p.title=n;title.value=n;p.updatedAt=now();if(titleStart!==p.title){const oldPhysical=pagePhysicalRootFromParts(catPath(p.categoryId),titleStart);updateCurrentTabTitle(p);renderTree();try{await reorganizePage(p);await pruneEmptyPhysical(oldPhysical)}catch(e){reportPhysicalError('Sayfa yeniden adlandırılamadı',e)}titleStart=p.title}else await schedulePageTxt(p,true);markTabDirty('page',p.id,false);persist(false)});title.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();title.blur();el.content.querySelector('[contenteditable="true"]')?.focus()}});
  bindBlocks(p);hydratePageImages(p);el.statusContext.textContent=catPath(p.categoryId).join(' / ');el.statusDetails.textContent=`${(p.blocks||[]).length} içerik · Son değişiklik ${fmtDate(p.updatedAt)}`
};

renderAttachmentBlock=function(b,common,tools){const img=isImage(b.name),mode=img?(b.displayMode||'gallery'):'list',size=b.imageSize||'medium',path=b.nativePath||b.storagePath||'',missing=attachmentPathMissing(path),cls=img?`${mode} ${size}`:'list',m=path?fileMeta(path):{accentColor:'',icon:''},ac=cleanColor(m.accentColor||''),key=fileIconKey(b.name,m.icon);return `<div class="block-wrap attachment-wrap ${img&&mode==='gallery'?'gallery-block':''}" ${common}>${tools}<div class="attachment ${cls} ${missing?'missing':''} ${ac?'has-accent':''}" ${ac?`style="--item-accent:${ac}"`:''} data-attachment="${attr(b.id)}"><div class="${img?'attachment-image':''}">${img&&!missing?`<img data-img-block="${attr(b.id)}" alt="${attr(b.name||'')}">`:''}</div><div class="attachment-meta"><span class="file-glyph" style="color:${ac||''}">${missing?'!':iconSvg(key)}</span><span class="attachment-name"><strong>${esc(b.name||'Dosya')}</strong><small>${missing?'Dosya bulunamadı':fmtBytes(b.size||0)+(path?' · '+esc(path):'')}</small></span><span class="attachment-actions">${missing?`<button class="mini" onclick="v68RelinkAttachment('${attr(b.id)}')">Yeniden bağla</button>`:`<button class="mini" onclick="v68AttachmentOpen('${attr(b.id)}')">Aç</button>`}<button class="mini" onclick="v68AttachmentMenu(event,'${attr(b.id)}')">${iconSvg('more','sm')}</button></span></div></div></div>`};

renderGalleryFile=function(f,i){const sel=fileSelection.has(norm(f.nativePath)),m=fileMeta(f.nativePath),ac=cleanColor(m.accentColor||''),key=fileIconKey(f.name,m.icon);return `<button class="gallery-item ${sel?'selected':''} ${ac?'has-accent':''}" ${ac?`style="--item-accent:${ac}"`:''} draggable="true" ondragstart="v68PhysicalDrag(event,${js(f.nativePath)})" data-file-path="${attr(f.nativePath)}" data-index="${i}" onclick="v68FileSelect(event,this.dataset.filePath,${i})" ondblclick="v68FileOpen(this.dataset.filePath)" oncontextmenu="v68FileMenu(event,this.dataset.filePath)"><span class="gallery-icon" style="color:${ac||'#fff'}">${iconSvg(key,'sm')}</span><img data-gallery-img="${attr(f.nativePath)}" alt=""><span class="gallery-name" ${ui.showImageNames?'':'style="display:none"'}>${esc(f.name)}</span></button>`};
renderFileRow=function(f,i){const sel=fileSelection.has(norm(f.nativePath)),m=fileMeta(f.nativePath),ac=cleanColor(m.accentColor||''),key=fileIconKey(f.name,m.icon);return `<div class="file-row ${sel?'selected':''} ${ac?'has-accent':''}" ${ac?`style="--item-accent:${ac}"`:''} draggable="true" ondragstart="v68PhysicalDrag(event,${js(f.nativePath)})" data-file-path="${attr(f.nativePath)}" onclick="v68FileSelect(event,this.dataset.filePath,${i})" ondblclick="v68FileOpen(this.dataset.filePath)" oncontextmenu="v68FileMenu(event,this.dataset.filePath)"><span class="file-glyph" style="color:${ac||''}">${iconSvg(key)}</span><span class="name"><strong>${esc(f.name)}</strong><small>${esc(m.description||f.relativePath||'')}</small></span><span class="type-badge">${esc(extOf(f.name))}</span><span class="mtime"><small>${fmtBytes(f.size||0)}</small></span><button class="file-menu" title="Dosya menüsü" onclick="event.stopPropagation();v68FileMenu(event,${js(f.nativePath)})">${iconSvg('more','sm')}</button></div>`};

renderFolderView=async function(id){const c=cat(id);if(!c)return openNearestView();const ids=[id,...catDesc(id)],ps=pages().filter(p=>ids.includes(p.categoryId)),prefix=norm(categoryPhysicalRelative(id))+'/',physical=sortPhysical(scan.files.filter(f=>norm(f.relativePath).startsWith(prefix)&&(state.prefs.showNoteMirror!==false||!isNoteMirror(f.nativePath))),id),images=physical.filter(f=>isImage(f.name)),other=physical.filter(f=>!isImage(f.name)),ac=cleanColor(c.accentColor||'');
  el.content.innerHTML=`<div class="view folder-view"><div class="crumbs">${crumbHtml(id,false)}</div><div class="view-title-row"><button class="view-menu" title="Renk ve ikon" onclick="v681FolderAppearance('${attr(id)}')" style="color:${ac||'var(--muted)'}">${iconSvg(c.icon||'folder','lg')}</button><div class="folder-title" style="font-size:31px;font-weight:900;letter-spacing:-.03em;flex:1">${esc(c.name)}</div><button class="view-menu" title="Klasör menüsü" onclick="v68FolderTopMenu(event,'${attr(id)}')">${iconSvg('more')}</button></div><div class="folder-toolbar"><button class="tool primary" onclick="v68InlineCreate('${attr(id)}','page');document.getElementById('tree').scrollTo({top:999999,behavior:'smooth'})">${iconSvg('plus','sm')} Sayfa</button><button class="tool" onclick="v68InlineCreate('${attr(id)}','folder')">${iconSvg('folder','sm')} Alt klasör</button><button class="tool" onclick="v68RefreshFolder()">${iconSvg('refresh','sm')} Yenile</button><button class="tool" onclick="v68StorageForFolder('${attr(id)}')">${iconSvg('drive','sm')} ${fmtBytes(folderSize(id))}</button><select class="tool" onchange="v68FolderSort('${attr(id)}',this.value)"><option value="manual" ${folderPref(id).sort==='manual'?'selected':''}>Elle sıralama</option><option value="name" ${folderPref(id).sort==='name'?'selected':''}>Ada göre</option><option value="type" ${folderPref(id).sort==='type'?'selected':''}>Türe göre</option><option value="size" ${folderPref(id).sort==='size'?'selected':''}>Boyuta göre</option><option value="modified" ${folderPref(id).sort==='modified'?'selected':''}>Son değişikliğe göre</option></select></div>${ps.length?`<section class="folder-section"><div class="section-head"><h3>Sayfalar</h3><small>${ps.length} sayfa</small></div><div class="page-cards">${ps.map(p=>{const pc=cleanColor(p.accentColor||'');return `<button class="page-card ${pc?'has-accent':''}" ${pc?`style="--item-accent:${pc}"`:''} onclick="v68OpenPage('${attr(p.id)}')"><span style="display:flex;align-items:center;gap:8px;color:${pc||'var(--muted)'}">${iconSvg(p.icon||'note','sm')}<strong style="color:var(--text)">${esc(p.title)}</strong></span><small>${esc(catPath(p.categoryId).join(' / '))} · ${fmtDate(p.updatedAt)}</small></button>`}).join('')}</div></section>`:''}${images.length?`<section class="folder-section"><div class="section-head"><h3>Görseller</h3><div class="gallery-controls"><button class="tool" onclick="v68Thumb('small')">Küçük</button><button class="tool" onclick="v68Thumb('medium')">Normal</button><button class="tool" onclick="v68Thumb('large')">Büyük</button></div></div><div class="file-gallery ${ui.thumbSize}">${images.map(f=>renderGalleryFile(f,physical.indexOf(f))).join('')}</div></section>`:''}${other.length?`<section class="folder-section"><div class="section-head"><h3>Dosyalar</h3><small>${other.length} dosya</small></div><div class="file-list">${other.map(f=>renderFileRow(f,physical.indexOf(f))).join('')}</div></section>`:''}${!ps.length&&!physical.length?'<div class="empty-main" style="height:320px"><div><h2>Bu klasör boş</h2><div>Yeni bir sayfa oluşturabilir veya dosya ekleyebilirsin.</div></div></div>':''}</div>`;
  hydrateFolderImages(images);el.statusContext.textContent=catPath(id).join(' / ');const selected=physical.filter(f=>fileSelection.has(norm(f.nativePath)));el.statusDetails.textContent=selected.length?`${selected.length} öğe seçili · ${fmtBytes(selected.reduce((n,f)=>n+(f.size||0),0))}`:`${ps.length} sayfa · ${physical.length} dosya · ${fmtBytes(physical.reduce((n,f)=>n+(f.size||0),0))}`
};

window.v68FileMenu=(e,path)=>{e.preventDefault();e.stopPropagation();if(!fileSelection.has(norm(path))){fileSelection.clear();fileSelection.add(norm(path))}showContext(e.clientX,e.clientY,`${ctxIcon('eye','Aç / önizle',`v68FileOpen(${js(path)})`)}${ctxIcon('folder',"Windows'ta göster",`v68FileReveal(${js(path)})`)}${ctxIcon('note','Yeniden adlandır',`v68FileRename(${js(path)})`)}${ctxIcon('copy','Kopyala',"v68FileCopy('copy')")}${ctxIcon('cut','Kes',"v68FileCopy('cut')")}${ctxIcon('move','Başka sayfaya taşı',`v68FileMoveDialog(${js(path)})`)}<hr>${ctxIcon('palette','Renk, ikon ve açıklama',`v68FileProperties(${js(path)})`)}${ctxIcon('pin','Sabitle / sabitlemeyi kaldır',`v68ToggleFilePin(${js(path)})`)}${ctxIcon('history','Sürüm geçmişi',`v68FileVersions(${js(path)})`)}${ctxIcon('shield','SHA-256 doğrulaması',`v68FileVerify(${js(path)})`)}${ctxIcon('trash','Çöp Kutusuna taşı','v68FilesDelete()','danger')}`)};
window.v68FileProperties=async path=>{closeContext();const f=scan.files.find(x=>norm(x.nativePath)===norm(path));let st={};try{st=await api.statManagedFile(path)}catch{}const refs=[];for(const p of pages())if((p.blocks||[]).some(b=>b.type==='attachment'&&norm(b.nativePath)===norm(path)))refs.push(p);const m=fileMeta(path);modal(`<div class="modal-head"><h3>${esc(baseName(path))}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body"><div class="form-row"><label>Açıklama</label><input id="fileMetaDesc" value="${attr(m.description||'')}" placeholder="Dosya için kısa bir açıklama"></div>${visualEditorMarkup(m.icon,m.accentColor,fileIconKey(path),true)}<div style="height:1px;background:var(--line);margin:18px 0"></div><div class="form-row"><label>Dosya bilgisi</label><div class="help-text"><strong style="color:var(--text)">${fmtBytes(st.size||f?.size||0)}</strong> · ${esc(extOf(path))}<br>${st.mtimeMs?`Son değişiklik: ${fmtDate(st.mtimeMs)}<br>`:''}<span style="word-break:break-all">${esc(path)}</span></div></div><div class="form-row"><label>Kullanıldığı sayfalar</label><div class="help-text">${refs.map(p=>esc(p.title)).join('<br>')||'Bu dosya henüz bir sayfaya bağlı değil.'}</div></div><div class="modal-actions"><button class="btn" onclick="v68CopyPath(${js(path)})">Yolu kopyala</button><button class="btn primary" onclick="v68SaveFileMeta(${js(path)})">Kaydet</button></div></div>`,true)};
window.v68SaveFileMeta=path=>{const m=fileMeta(path);m.description=document.getElementById('fileMetaDesc').value.trim();const key=document.getElementById('visualIcon').value;m.icon=key==='auto'?'':key;m.accentColor=cleanColor(document.getElementById('visualHex').value);persist(false);closeModal();renderTabs();if(currentView.kind==='folder')renderFolderView(currentView.id);else if(currentView.kind==='page')renderPage(currentView.id);toast('Dosya görünümü kaydedildi')};

renderEmpty=function(){el.content.innerHTML=`<div class="empty-main"><div><img src="icon.png"><h2>Veloria hazır</h2><div>Soldan bir klasör veya sayfa seçerek başlayabilirsin.</div></div></div>`;el.statusContext.textContent='Hazır';el.statusDetails.textContent=''};

const _v680Settings=settings;settings=function(tab='general'){const p=state.prefs||{};modal(`<div class="modal-head"><h3>Ayarlar · ${VERSION}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body"><div class="settings-tabs">${[['general','Genel'],['appearance','Görünüm'],['files','Dosyalar'],['security','Güvenlik']].map(([k,n])=>`<button class="tool ${tab===k?'primary':''}" onclick="v68Settings('${k}')">${n}</button>`).join('')}</div>${settingsBody(tab,p)}</div>`)};window.v68Settings=settings;
settingsBody=function(tab,p){if(tab==='appearance')return `<div class="form-row"><label>Uygulama teması</label><button class="btn" onclick="v68ToggleTheme()">${state.theme==='light'?'Açık tema':'Koyu tema'} · Değiştir</button><div class="help-text">Klasör, sayfa ve dosya renkleri temadan bağımsız olarak korunur.</div></div><div class="form-row"><label>Galeri görsel boyutu</label><select onchange="v68SetThumbSize(this.value)"><option value="small" ${ui.thumbSize==='small'?'selected':''}>Küçük</option><option value="medium" ${ui.thumbSize==='medium'?'selected':''}>Normal</option><option value="large" ${ui.thumbSize==='large'?'selected':''}>Büyük</option></select></div><div class="form-row"><label>Görsel dosya adları</label><button class="btn" onclick="v68ToggleImageNames()">${ui.showImageNames?'Dosya adları gösteriliyor':'Dosya adları gizli'}</button></div>`;
 if(tab==='files')return `<div class="form-row"><label>Ana dosya konumu</label><div class="help-text" style="word-break:break-all">${esc(info?.rootPath||'Konum bulunamadı')}</div></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" onclick="veloriaDesktop.openRoot()">Klasörü aç</button><button class="btn" onclick="v68ChangeRoot()">Konumu değiştir</button><button class="btn" onclick="v68CloseModal();v68ShowStorage()">Depolamayı incele</button></div><div class="form-row"><label>Sayfa TXT aynaları</label><button class="btn" onclick="v68ToggleNoteMirror()">${state.prefs.showNoteMirror?'Dosya listesinde gösteriliyor':'Dosya listesinde gizli'}</button><div class="help-text">TXT aynaları fiziksel yedek niteliğindedir; sayfanın ana kaynağı Veloria içeriğidir.</div></div>`;
 if(tab==='security')return `<div class="help-text" style="margin-bottom:12px">İstersen uygulamayı yalnızca bu bilgisayarda kullanılan bir uygulama şifresiyle kilitleyebilirsin.</div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" onclick="v68PinSettings()">Uygulama şifresi</button><button class="btn" onclick="v68LockNow()">Şimdi kilitle</button></div>`;
 return `<div class="form-row"><label>Aktif çalışma alanı</label><button class="btn" onclick="v68CloseModal();v68WorkspaceMenu()">${esc(currentWorkspaceName())} · Çalışma alanlarını yönet</button></div><div class="help-text" style="margin-bottom:12px">Veloria; klasör, sayfa ve fiziksel dosyaları tek çalışma alanında düzenler.</div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" onclick="v68CloseModal();v68QuickOpen()">Hızlı aç · Ctrl+P</button><button class="btn" onclick="v68CloseModal();veloriaDesktop.openRecovery()">Kurtarma aracını aç</button><button class="btn" onclick="v68CloseModal();v68Undo()">Son işlemi geri al</button></div>`};

workspaceMenu=function(){captureWorkspace();modal(`<div class="modal-head"><h3>Çalışma alanları</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body"><div class="help-text" style="margin-bottom:10px">Her çalışma alanının klasör ve sayfa düzeni birbirinden bağımsızdır.</div>${state.workspaceSystem.items.map(w=>`<div class="file-row" style="grid-template-columns:42px minmax(0,1fr) auto 32px"><span class="file-glyph">${iconSvg('workspace')}</span><button class="name" style="text-align:left" onclick="v68SwitchWorkspace('${attr(w.id)}')"><strong>${esc(w.name)}</strong><small>${(w.pages||[]).length} sayfa · ${(w.categories||[]).length} klasör</small></button><button class="mini" onclick="v68RenameWorkspace('${attr(w.id)}')">Yeniden adlandır</button>${state.workspaceSystem.items.length>1?`<button class="file-menu" title="Çalışma alanını sil" onclick="v68DeleteWorkspace('${attr(w.id)}')">${iconSvg('trash','sm')}</button>`:'<span></span>'}</div>`).join('')}<button class="btn primary" style="width:100%;margin-top:14px" onclick="v68CreateWorkspace()">${iconSvg('plus','sm')} Yeni çalışma alanı</button></div>`)};window.v68WorkspaceMenu=workspaceMenu;

window.v68InsertMenu=index=>{modal(`<div class="modal-head"><h3>İçerik ekle</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body"><div class="choice-grid"><button class="choice" onclick="v68InsertBlock(${index},'text')"><strong>Metin</strong><small>Normal yazı alanı</small></button><button class="choice" onclick="v68InsertBlock(${index},'heading')"><strong>Başlık</strong><small>Yeni bir bölüm başlat</small></button><button class="choice" onclick="v68InsertFile(${index})"><strong>Dosya veya görsel</strong><small>Bilgisayardan taşı ya da kopyala</small></button><button class="choice" onclick="v68InsertBlock(${index},'link')"><strong>Bağlantı</strong><small>Web adresi veya kaynak bağlantısı</small></button><button class="choice" onclick="v68InsertBlock(${index},'code')"><strong>Kod / düz metin</strong><small>Monospace düzenleme alanı</small></button><button class="choice" onclick="v68InsertBlock(${index},'divider')"><strong>Ayraç</strong><small>İçeriği görsel olarak böl</small></button></div></div>`)};



/* 6.8.1 icon alignment follow-up */
V681_ICON_INNER.grip='<circle cx="9" cy="7" r="1"></circle><circle cx="15" cy="7" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="9" cy="17" r="1"></circle><circle cx="15" cy="17" r="1"></circle>';
renderBlocks=function(p){const bs=p.blocks||[];let html=`<div class="insert-line"><button title="İçerik ekle" onclick="v68InsertMenu(0)">${iconSvg('plus','sm')}</button></div>`;bs.forEach((b,i)=>{html+=renderBlock(b,i);html+=`<div class="insert-line"><button title="İçerik ekle" onclick="v68InsertMenu(${i+1})">${iconSvg('plus','sm')}</button></div>`});return html};
renderBlock=function(b,i){const common=`data-block="${attr(b.id)}" data-index="${i}" ondragover="v68BlockOver(event,'${attr(b.id)}')" ondrop="v68BlockDrop(event,'${attr(b.id)}')"`,tools=`<div class="block-toolbar"><span class="block-grip" title="Sürükle" draggable="true" ondragstart="v68BlockDrag(event,'${attr(b.id)}')" ondragend="v68BlockDragEnd(event)">${iconSvg('grip','sm')}</span><button class="block-more" aria-label="İçerik menüsü" onclick="v68BlockMenu(event,'${attr(b.id)}')">${iconSvg('more','sm')}</button></div>`;if(b.type==='heading')return `<div class="block-wrap" ${common}>${tools}<input class="heading-block h${Math.max(1,Math.min(3,b.level||2))}" data-edit="heading" value="${attr(b.text||'')}" placeholder="Başlık"></div>`;if(b.type==='link')return `<div class="block-wrap" ${common}>${tools}<div class="link-block"><input data-edit="link-title" value="${attr(b.title||'')}" placeholder="Bağlantı adı"><input data-edit="link-url" value="${attr(b.url||'')}" placeholder="https://..."><button class="mini" onclick="v68OpenLink('${attr(b.id)}')">Aç</button></div></div>`;if(b.type==='divider')return `<div class="block-wrap" ${common}>${tools}<div class="divider-block"></div></div>`;if(b.type==='attachment')return renderAttachmentBlock(b,common,tools);if(b.type==='code')return `<div class="block-wrap" ${common}>${tools}<textarea data-edit="code" class="code-area" style="height:180px;border:1px solid var(--line);border-radius:12px" spellcheck="false" placeholder="Kod veya düz metin…">${esc(b.code||'')}</textarea></div>`;const html=b.type==='richtext'?String(b.html||''):esc(b.text||'').replace(/\n/g,'<br>');return `<div class="block-wrap" ${common}>${tools}<div class="rich-block" contenteditable="true" data-edit="rich" data-placeholder="Yazmaya başla…">${html}</div></div>`};
const _v681RenderFileBase=renderFile;renderFile=async function(path,name){await _v681RenderFileBase(path,name);const head=el.content.querySelector('.editor-head');if(!head)return;const m=fileMeta(path),ac=cleanColor(m.accentColor||''),key=fileIconKey(name,m.icon);let badge=head.querySelector('.editor-file-icon');if(!badge){badge=document.createElement('span');badge.className='editor-file-icon file-glyph';head.prepend(badge)}badge.innerHTML=iconSvg(key);badge.style.color=ac||'';badge.style.width='34px';badge.style.height='34px'};



/* ===== Veloria 6.8.2 row/background + independent icon RGB ===== */
function v682Contrast(hex){const c=cleanColor(hex);if(!c)return'var(--text)';const [r,g,b]=colorParts(c),yiq=(r*299+g*587+b*114)/1000;return yiq>=158?'#0B1220':'#F8FAFC'}
function v682EnsureMeta(m,defaultIcon='file'){if(!m||typeof m!=='object')return m;m.accentColor=cleanColor(m.accentColor||'');if(!Object.prototype.hasOwnProperty.call(m,'rowColorEnabled'))m.rowColorEnabled=!!m.accentColor;else m.rowColorEnabled=!!m.rowColorEnabled;m.iconColor=cleanColor(m.iconColor||'');if(!Object.prototype.hasOwnProperty.call(m,'iconColorEnabled'))m.iconColorEnabled=!!m.iconColor;else m.iconColorEnabled=!!m.iconColorEnabled;if(defaultIcon&&(!m.icon||!V681_ICON_INNER[m.icon]))m.icon=defaultIcon;return m}
function v682Visual(m){m=v682EnsureMeta(m,'');const row=m?.rowColorEnabled?cleanColor(m.accentColor||''):'';const icon=m?.iconColorEnabled?cleanColor(m.iconColor||''):'';return{row,icon,text:row?v682Contrast(row):'',classes:`${row?'has-row-color':''} ${icon?'has-icon-color':''}`.trim(),style:[row?`--row-color:${row};--row-text:${v682Contrast(row)}`:'',icon?`--icon-color:${icon}`:''].filter(Boolean).join(';')}}
function v682StyleAttr(v){return v.style?`style="${v.style}"`:''}
normalizeVisualMeta=function(){const labelMap={red:'#EF4444',amber:'#F59E0B',green:'#34D399',blue:'#3B82F6'};for(const c of categories()){if(!c.icon||!V681_ICON_INNER[c.icon])c.icon='folder';c.accentColor=cleanColor(c.accentColor||c.color||'');v682EnsureMeta(c,'folder')}for(const p of pages()){if(!p.icon||!V681_ICON_INNER[p.icon])p.icon='note';p.accentColor=cleanColor(p.accentColor||p.color||'');v682EnsureMeta(p,'note')}state.fileMeta=state.fileMeta||{};for(const m of Object.values(state.fileMeta)){if(!m||typeof m!=='object')continue;m.accentColor=cleanColor(m.accentColor||(m.label?labelMap[m.label]:'')||'');m.icon=V681_ICON_INNER[m.icon]?m.icon:'';v682EnsureMeta(m,'');delete m.label}}
const _v682CreateFolder=createFolder;createFolder=function(name,parentId=null){const c=_v682CreateFolder(name,parentId);if(c){v682EnsureMeta(c,'folder');if(!c.accentColor)c.rowColorEnabled=false;if(!c.iconColor)c.iconColorEnabled=false;persist(false)}return c};
const _v682CreatePage=createPage;createPage=function(categoryId,title='Yeni Sayfa'){const p=_v682CreatePage(categoryId,title);if(p){v682EnsureMeta(p,'note');if(!p.accentColor)p.rowColorEnabled=false;if(!p.iconColor)p.iconColorEnabled=false;persist(false)}return p};
const _v682FileMeta=fileMeta;fileMeta=function(path){const m=_v682FileMeta(path);return v682EnsureMeta(m,'')};

function v682ColorUi(prefix,color){const c=cleanColor(color),shown=c||'#2F6FED',rgb=colorParts(shown);return `<div class="color-line"><input id="${prefix}Color" type="color" value="${shown}" oninput="v682ColorFromPicker('${prefix}')"><input id="${prefix}Hex" value="${c||''}" placeholder="#2F6FED" oninput="v682ColorFromHex('${prefix}')"></div><div class="rgb-line"><div class="rgb-field"><span>R</span><input id="${prefix}R" type="number" min="0" max="255" value="${rgb[0]}" oninput="v682ColorFromRgb('${prefix}')"></div><div class="rgb-field"><span>G</span><input id="${prefix}G" type="number" min="0" max="255" value="${rgb[1]}" oninput="v682ColorFromRgb('${prefix}')"></div><div class="rgb-field"><span>B</span><input id="${prefix}B" type="number" min="0" max="255" value="${rgb[2]}" oninput="v682ColorFromRgb('${prefix}')"></div></div>`}
visualEditorMarkup=function(icon,rowColor,defaultIcon='file',allowAuto=false,rowEnabled,iconColor='',iconEnabled){const row=cleanColor(rowColor),ic=cleanColor(iconColor),rowOn=rowEnabled===undefined?!!row:!!rowEnabled,iconOn=iconEnabled===undefined?!!ic:!!iconEnabled,chosen=allowAuto?(icon||'auto'):(icon||defaultIcon);const buttons=(allowAuto?['auto',...V681_VISUAL_ICONS]:V681_VISUAL_ICONS).map(k=>{const actual=k==='auto'?defaultIcon:k;return `<button type="button" class="icon-choice ${chosen===k?'selected':''}" data-visual-icon="${attr(k)}" title="${k==='auto'?'Dosya türüne göre otomatik':k}" onclick="v681SelectIcon('${attr(k)}')">${iconSvg(actual)}</button>`}).join('');return `<div class="visual-editor visual-editor-v682"><div id="visualPreview" class="visual-preview visual-preview-row"><span class="preview-icon" id="visualPreviewIcon">${iconSvg(chosen==='auto'?defaultIcon:chosen)}</span><span class="preview-copy"><strong>Örnek satır görünümü</strong><small>Satır ve ikon renkleri birbirinden bağımsızdır.</small></span>${iconSvg('more','sm')}</div><div><label class="visual-toggle"><input id="visualRowEnabled" type="checkbox" ${rowOn?'checked':''} onchange="v682UpdateVisualPreview()"><span><strong>Tüm satırı renklendir</strong><small>Açık olduğunda seçtiğin renk yalnızca sol çizgide değil, satırın tamamında kullanılır.</small></span></label><div id="visualRowColorSection" class="visual-color-section ${rowOn?'':'inactive'}"><div class="section-label">Satır rengi · RGB / HEX</div>${v682ColorUi('visual',row)}<div style="display:flex;gap:6px;margin-top:8px"><button class="btn" type="button" onclick="v681ClearColor()">Satır rengini temizle</button></div></div><label class="visual-toggle"><input id="visualIconColorEnabled" type="checkbox" ${iconOn?'checked':''} onchange="v682UpdateVisualPreview()"><span><strong>İkon rengini ayrıca değiştir</strong><small>Satır renginden bağımsız özel bir ikon rengi kullan. Satır rengini kapatıp yalnızca bunu da kullanabilirsin.</small></span></label><div id="visualIconColorSection" class="visual-color-section ${iconOn?'':'inactive'}"><div class="section-label">İkon rengi · RGB / HEX</div>${v682ColorUi('visualIcon',ic)}<div style="display:flex;gap:6px;margin-top:8px"><button class="btn" type="button" onclick="v682ClearIconColor()">İkon rengini temizle</button></div></div><div class="visual-divider"></div><div class="form-row"><label>İkon</label><input id="visualIcon" type="hidden" value="${attr(chosen)}"><input id="visualAutoIcon" type="hidden" value="${attr(defaultIcon)}"><div class="icon-picker">${buttons}</div><div class="help-text" style="margin-top:8px">İkon, satır rengi ve ikon rengi yalnızca görünümü değiştirir. Fiziksel dosyalara dokunulmaz.</div></div></div></div>`}
function v682SetColorFields(prefix,c){c=cleanColor(c);if(!c)return;const picker=document.getElementById(prefix+'Color'),hex=document.getElementById(prefix+'Hex'),[r,g,b]=colorParts(c);if(picker)picker.value=c;if(hex)hex.value=c;const rr=document.getElementById(prefix+'R'),gg=document.getElementById(prefix+'G'),bb=document.getElementById(prefix+'B');if(rr)rr.value=r;if(gg)gg.value=g;if(bb)bb.value=b}
window.v682ColorFromPicker=prefix=>{const c=cleanColor(document.getElementById(prefix+'Color')?.value||'');if(c)v682SetColorFields(prefix,c);updateVisualPreview()};
window.v682ColorFromHex=prefix=>{const c=cleanColor(document.getElementById(prefix+'Hex')?.value||'');if(c)v682SetColorFields(prefix,c);updateVisualPreview()};
window.v682ColorFromRgb=prefix=>{const vals=['R','G','B'].map(k=>Math.max(0,Math.min(255,Number(document.getElementById(prefix+k)?.value)||0))),c='#'+vals.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();v682SetColorFields(prefix,c);updateVisualPreview()};
window.v681ColorFromPicker=()=>v682ColorFromPicker('visual');window.v681ColorFromHex=()=>v682ColorFromHex('visual');window.v681ColorFromRgb=()=>v682ColorFromRgb('visual');
window.v681ClearColor=()=>{const h=document.getElementById('visualHex'),t=document.getElementById('visualRowEnabled');if(h)h.value='';if(t)t.checked=false;updateVisualPreview()};
window.v682ClearIconColor=()=>{const h=document.getElementById('visualIconHex'),t=document.getElementById('visualIconColorEnabled');if(h)h.value='';if(t)t.checked=false;updateVisualPreview()};
updateVisualPreview=function(){const rowOn=!!document.getElementById('visualRowEnabled')?.checked,row=cleanColor(document.getElementById('visualHex')?.value||''),iconOn=!!document.getElementById('visualIconColorEnabled')?.checked,ic=cleanColor(document.getElementById('visualIconHex')?.value||''),key=document.getElementById('visualIcon')?.value||'file',autoKey=document.getElementById('visualAutoIcon')?.value||'file',preview=document.getElementById('visualPreview'),pi=document.getElementById('visualPreviewIcon'),rowSec=document.getElementById('visualRowColorSection'),iconSec=document.getElementById('visualIconColorSection');if(preview){preview.style.background=rowOn&&row?row:'var(--panel2)';preview.style.color=rowOn&&row?v682Contrast(row):'var(--text)';preview.style.borderColor=rowOn&&row?`color-mix(in srgb, ${row} 75%, ${v682Contrast(row)} 25%)`:'var(--line)'}if(pi){pi.innerHTML=iconSvg(key==='auto'?autoKey:key);pi.style.color=iconOn&&ic?ic:(rowOn&&row?v682Contrast(row):'var(--muted)')}rowSec?.classList.toggle('inactive',!rowOn);iconSec?.classList.toggle('inactive',!iconOn);document.querySelectorAll('[data-visual-icon]').forEach(b=>b.classList.toggle('selected',b.dataset.visualIcon===key))};
window.v681SelectIcon=key=>{const x=document.getElementById('visualIcon');if(x)x.value=key;updateVisualPreview()};
function v682ReadVisual(target,defaultIcon,allowAuto=false){const key=document.getElementById('visualIcon')?.value||defaultIcon;target.icon=allowAuto&&key==='auto'?'':key;target.accentColor=cleanColor(document.getElementById('visualHex')?.value||'');target.rowColorEnabled=!!document.getElementById('visualRowEnabled')?.checked&&!!target.accentColor;target.iconColor=cleanColor(document.getElementById('visualIconHex')?.value||'');target.iconColorEnabled=!!document.getElementById('visualIconColorEnabled')?.checked&&!!target.iconColor;return target}
window.v681FolderAppearance=id=>{closeContext();const c=cat(id);if(!c)return;v682EnsureMeta(c,'folder');modal(`<div class="modal-head"><h3>${esc(c.name)} · Renk ve ikon</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body">${visualEditorMarkup(c.icon,c.accentColor,'folder',false,c.rowColorEnabled,c.iconColor,c.iconColorEnabled)}<div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v681SaveFolderAppearance('${attr(id)}')">Kaydet</button></div></div>`) ;setTimeout(updateVisualPreview,0)};
window.v681SaveFolderAppearance=id=>{const c=cat(id);if(!c)return;v682ReadVisual(c,'folder',false);persist(false);closeModal();renderTree();renderTabs();if(currentView.kind==='folder'&&currentView.id===id)renderFolderView(id);toast('Klasör görünümü güncellendi')};
window.v681PageAppearance=id=>{closeContext();const p=page(id);if(!p)return;v682EnsureMeta(p,'note');modal(`<div class="modal-head"><h3>${esc(p.title)} · Renk ve ikon</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body">${visualEditorMarkup(p.icon,p.accentColor,'note',false,p.rowColorEnabled,p.iconColor,p.iconColorEnabled)}<div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v681SavePageAppearance('${attr(id)}')">Kaydet</button></div></div>`) ;setTimeout(updateVisualPreview,0)};
window.v681SavePageAppearance=id=>{const p=page(id);if(!p)return;v682ReadVisual(p,'note',false);persist(false);closeModal();renderTree();renderTabs();if(currentView.kind==='page'&&currentView.id===id)renderPage(id);toast('Sayfa görünümü güncellendi')};

renderTabs=function(){el.tabs.innerHTML=tabs.map(t=>{let key='file',m=null;if(t.kind==='folder'){m=cat(t.id);key=m?.icon||'folder'}else if(t.kind==='page'){m=page(t.id);key=m?.icon||'note'}else{m=fileMeta(t.path);key=fileIconKey(t.name,m.icon)}const v=v682Visual(m||{});return `<button class="tab ${ui.selectedTab===t.key?'active':''} ${v.classes}" ${v682StyleAttr(v)} onclick="v68ActivateTab('${attr(t.key)}')"><span class="tab-icon">${iconSvg(key,'sm')}</span><span class="tab-title">${esc(t.title||t.name||'İsimsiz')}</span>${t.dirty?'<span class="dirty">•</span>':''}<span class="close" onclick="v68CloseTab('${attr(t.key)}',event)">${iconSvg('close','sm')}</span></button>`}).join('')};
renderCat=function(c,q,depth){v682EnsureMeta(c,'folder');const open=q?true:(ui.folderOpen[c.id]!==undefined?ui.folderOpen[c.id]:!c.collapsed),ps=pagesInCat(c.id).filter(p=>!q||p.title.toLocaleLowerCase('tr').includes(q)||c.name.toLocaleLowerCase('tr').includes(q)),children=catChildren(c.id).filter(x=>treeMatch(x,q)),sz=folderSize(c.id),selected=treeSelection?.kind==='folder'&&treeSelection.id===c.id,v=v682Visual(c);return `<div class="folder-node" data-cat="${attr(c.id)}" draggable="true" ondragstart="v68TreeDragStart(event,'folder','${attr(c.id)}')" ondragend="v68TreeDragEnd(event)"><div class="folder-row ${selected?'selected':''} ${v.classes}" ${v682StyleAttr(v)} data-drop-folder="${attr(c.id)}" ondragover="v68TreeDragOver(event,'${attr(c.id)}')" ondragleave="v68TreeDragLeave(event)" ondrop="v68TreeDrop(event,'${attr(c.id)}')" oncontextmenu="v68FolderMenu(event,'${attr(c.id)}')"><button class="chev" title="${open?'Kapat':'Aç'}" onclick="v68ToggleFolder('${attr(c.id)}')">${iconSvg(open?'chevronDown':'chevronRight','sm')}</button><button class="row-main" onclick="v68SelectFolder('${attr(c.id)}')" ondblclick="v68OpenFolder('${attr(c.id)}')"><span class="row-icon">${iconSvg(c.icon||'folder','sm')}</span><span class="title">${esc(c.name)}</span><span class="folder-size">${sz?fmtBytes(sz):''}</span></button><button class="row-dot" title="Sayfa ekle" onclick="event.stopPropagation();v68InlineCreate('${attr(c.id)}','page')">${iconSvg('plus','sm')}</button><button class="row-dot" title="Klasör menüsü" onclick="v68FolderMenu(event,'${attr(c.id)}')">${iconSvg('more','sm')}</button></div>${open?`<div class="children">${inlineCreate?.parentId===c.id?renderInlineCreate():''}${ps.map(p=>renderPageRow(p)).join('')}${children.map(x=>renderCat(x,q,depth+1)).join('')}</div>`:''}</div>`};
renderPageRow=function(p){v682EnsureMeta(p,'note');const selected=treeSelection?.kind==='page'&&treeSelection.id===p.id,v=v682Visual(p);return `<div class="page-row ${selected?'selected':''} ${v.classes}" ${v682StyleAttr(v)} data-page="${attr(p.id)}" draggable="true" ondragstart="v68TreeDragStart(event,'page','${attr(p.id)}')" ondragend="v68TreeDragEnd(event)" ondragover="v68PageDragOver(event,'${attr(p.id)}')" ondragleave="v68TreeDragLeave(event)" ondrop="v68PageDrop(event,'${attr(p.id)}')" oncontextmenu="v68PageMenu(event,'${attr(p.id)}')"><span class="chev" style="visibility:hidden">${iconSvg('chevronRight','sm')}</span><button class="row-main" onclick="v68SelectPage('${attr(p.id)}')" ondblclick="v68OpenPage('${attr(p.id)}')"><span class="row-icon">${iconSvg(p.icon||'note','sm')}</span><span class="title">${esc(p.title)}</span></button><button class="row-dot" title="Sayfa menüsü" onclick="v68PageMenu(event,'${attr(p.id)}')">${iconSvg('more','sm')}</button></div>`};

renderPage=function(id){const p=page(id);if(!p)return openNearestView();v682EnsureMeta(p,'note');const v=v682Visual(p);el.content.innerHTML=`<div class="view" data-page-view="${attr(id)}"><div class="crumbs">${crumbHtml(p.categoryId,true)}</div><div class="view-title-row"><button class="view-menu" title="Renk ve ikon" onclick="v681PageAppearance('${attr(id)}')" style="color:${v.icon||'var(--muted)'}">${iconSvg(p.icon||'note','lg')}</button><input id="pageTitle" class="page-title" value="${attr(p.title)}" placeholder="Sayfa adı"><button class="view-menu" title="Sayfa menüsü" onclick="v68PageTopMenu(event,'${attr(id)}')">${iconSvg('more')}</button></div><div id="blocks" class="blocks">${renderBlocks(p)}</div></div>`;const title=document.getElementById('pageTitle');let titleStart=p.title;title.addEventListener('input',()=>{p.title=title.value;p.updatedAt=now();markTabDirty('page',p.id,true);updateCurrentTabTitle(p);persist(false)});title.addEventListener('blur',async()=>{let n=title.value.trim()||'İsimsiz';n=uniquePageTitle(p.categoryId,n,p.id);p.title=n;title.value=n;p.updatedAt=now();if(titleStart!==p.title){const oldPhysical=pagePhysicalRootFromParts(catPath(p.categoryId),titleStart);updateCurrentTabTitle(p);renderTree();try{await reorganizePage(p);await pruneEmptyPhysical(oldPhysical)}catch(e){reportPhysicalError('Sayfa yeniden adlandırılamadı',e)}titleStart=p.title}else await schedulePageTxt(p,true);markTabDirty('page',p.id,false);persist(false)});title.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();title.blur();el.content.querySelector('[contenteditable="true"]')?.focus()}});bindBlocks(p);hydratePageImages(p);el.statusContext.textContent=catPath(p.categoryId).join(' / ');el.statusDetails.textContent=`${(p.blocks||[]).length} içerik · Son değişiklik ${fmtDate(p.updatedAt)}`};
renderAttachmentBlock=function(b,common,tools){const img=isImage(b.name),mode=img?(b.displayMode||'gallery'):'list',size=b.imageSize||'medium',path=b.nativePath||b.storagePath||'',missing=attachmentPathMissing(path),cls=img?`${mode} ${size}`:'list',m=path?fileMeta(path):{},v=v682Visual(m),key=fileIconKey(b.name,m.icon);return `<div class="block-wrap attachment-wrap ${img&&mode==='gallery'?'gallery-block':''}" ${common}>${tools}<div class="attachment ${cls} ${missing?'missing':''} ${v.classes}" ${v682StyleAttr(v)} data-attachment="${attr(b.id)}"><div class="${img?'attachment-image':''}">${img&&!missing?`<img data-img-block="${attr(b.id)}" alt="${attr(b.name||'')}">`:''}</div><div class="attachment-meta"><span class="file-glyph">${missing?'!':iconSvg(key)}</span><span class="attachment-name"><strong>${esc(b.name||'Dosya')}</strong><small>${missing?'Dosya bulunamadı':fmtBytes(b.size||0)+(path?' · '+esc(path):'')}</small></span><span class="attachment-actions">${missing?`<button class="mini" onclick="v68RelinkAttachment('${attr(b.id)}')">Yeniden bağla</button>`:`<button class="mini" onclick="v68AttachmentOpen('${attr(b.id)}')">Aç</button>`}<button class="mini" onclick="v68AttachmentMenu(event,'${attr(b.id)}')">${iconSvg('more','sm')}</button></span></div></div></div>`};
renderGalleryFile=function(f,i){const sel=fileSelection.has(norm(f.nativePath)),m=fileMeta(f.nativePath),v=v682Visual(m),key=fileIconKey(f.name,m.icon);return `<button class="gallery-item ${sel?'selected':''} ${v.classes}" ${v682StyleAttr(v)} draggable="true" ondragstart="v68PhysicalDrag(event,${js(f.nativePath)})" data-file-path="${attr(f.nativePath)}" data-index="${i}" onclick="v68FileSelect(event,this.dataset.filePath,${i})" ondblclick="v68FileOpen(this.dataset.filePath)" oncontextmenu="v68FileMenu(event,this.dataset.filePath)"><span class="gallery-icon">${iconSvg(key,'sm')}</span><img data-gallery-img="${attr(f.nativePath)}" alt=""><span class="gallery-name" ${ui.showImageNames?'':'style="display:none"'}>${esc(f.name)}</span></button>`};
renderFileRow=function(f,i){const sel=fileSelection.has(norm(f.nativePath)),m=fileMeta(f.nativePath),v=v682Visual(m),key=fileIconKey(f.name,m.icon);return `<div class="file-row ${sel?'selected':''} ${v.classes}" ${v682StyleAttr(v)} draggable="true" ondragstart="v68PhysicalDrag(event,${js(f.nativePath)})" data-file-path="${attr(f.nativePath)}" onclick="v68FileSelect(event,this.dataset.filePath,${i})" ondblclick="v68FileOpen(this.dataset.filePath)" oncontextmenu="v68FileMenu(event,this.dataset.filePath)"><span class="file-glyph">${iconSvg(key)}</span><span class="name"><strong>${esc(f.name)}</strong><small>${esc(m.description||f.relativePath||'')}</small></span><span class="type-badge">${esc(extOf(f.name))}</span><span class="mtime"><small>${fmtBytes(f.size||0)}</small></span><button class="file-menu" title="Dosya menüsü" onclick="event.stopPropagation();v68FileMenu(event,${js(f.nativePath)})">${iconSvg('more','sm')}</button></div>`};
renderFolderView=async function(id){const c=cat(id);if(!c)return openNearestView();v682EnsureMeta(c,'folder');const ids=[id,...catDesc(id)],ps=pages().filter(p=>ids.includes(p.categoryId)),prefix=norm(categoryPhysicalRelative(id))+'/',physical=sortPhysical(scan.files.filter(f=>norm(f.relativePath).startsWith(prefix)&&(state.prefs.showNoteMirror!==false||!isNoteMirror(f.nativePath))),id),images=physical.filter(f=>isImage(f.name)),other=physical.filter(f=>!isImage(f.name)),cv=v682Visual(c);el.content.innerHTML=`<div class="view folder-view"><div class="crumbs">${crumbHtml(id,false)}</div><div class="view-title-row"><button class="view-menu" title="Renk ve ikon" onclick="v681FolderAppearance('${attr(id)}')" style="color:${cv.icon||'var(--muted)'}">${iconSvg(c.icon||'folder','lg')}</button><div class="folder-title" style="font-size:31px;font-weight:900;letter-spacing:-.03em;flex:1">${esc(c.name)}</div><button class="view-menu" title="Klasör menüsü" onclick="v68FolderTopMenu(event,'${attr(id)}')">${iconSvg('more')}</button></div><div class="folder-toolbar"><button class="tool primary" onclick="v68InlineCreate('${attr(id)}','page');document.getElementById('tree').scrollTo({top:999999,behavior:'smooth'})">${iconSvg('plus','sm')} Sayfa</button><button class="tool" onclick="v68InlineCreate('${attr(id)}','folder')">${iconSvg('folder','sm')} Alt klasör</button><button class="tool" onclick="v68RefreshFolder()">${iconSvg('refresh','sm')} Yenile</button><button class="tool" onclick="v68StorageForFolder('${attr(id)}')">${iconSvg('drive','sm')} ${fmtBytes(folderSize(id))}</button><select class="tool" onchange="v68FolderSort('${attr(id)}',this.value)"><option value="manual" ${folderPref(id).sort==='manual'?'selected':''}>Elle sıralama</option><option value="name" ${folderPref(id).sort==='name'?'selected':''}>Ada göre</option><option value="type" ${folderPref(id).sort==='type'?'selected':''}>Türe göre</option><option value="size" ${folderPref(id).sort==='size'?'selected':''}>Boyuta göre</option><option value="modified" ${folderPref(id).sort==='modified'?'selected':''}>Son değişikliğe göre</option></select></div>${ps.length?`<section class="folder-section"><div class="section-head"><h3>Sayfalar</h3><small>${ps.length} sayfa</small></div><div class="page-cards">${ps.map(p=>{v682EnsureMeta(p,'note');const pv=v682Visual(p);return `<button class="page-card ${pv.classes}" ${v682StyleAttr(pv)} onclick="v68OpenPage('${attr(p.id)}')"><span style="display:flex;align-items:center;gap:8px"><span class="card-icon">${iconSvg(p.icon||'note','sm')}</span><strong>${esc(p.title)}</strong></span><small>${esc(catPath(p.categoryId).join(' / '))} · ${fmtDate(p.updatedAt)}</small></button>`}).join('')}</div></section>`:''}${images.length?`<section class="folder-section"><div class="section-head"><h3>Görseller</h3><div class="gallery-controls"><button class="tool" onclick="v68Thumb('small')">Küçük</button><button class="tool" onclick="v68Thumb('medium')">Normal</button><button class="tool" onclick="v68Thumb('large')">Büyük</button></div></div><div class="file-gallery ${ui.thumbSize}">${images.map(f=>renderGalleryFile(f,physical.indexOf(f))).join('')}</div></section>`:''}${other.length?`<section class="folder-section"><div class="section-head"><h3>Dosyalar</h3><small>${other.length} dosya</small></div><div class="file-list">${other.map(f=>renderFileRow(f,physical.indexOf(f))).join('')}</div></section>`:''}${!ps.length&&!physical.length?'<div class="empty-main" style="height:320px"><div><h2>Bu klasör boş</h2><div>Yeni bir sayfa oluşturabilir veya dosya ekleyebilirsin.</div></div></div>':''}</div>`;hydrateFolderImages(images);el.statusContext.textContent=catPath(id).join(' / ');const selected=physical.filter(f=>fileSelection.has(norm(f.nativePath)));el.statusDetails.textContent=selected.length?`${selected.length} öğe seçili · ${fmtBytes(selected.reduce((n,f)=>n+(f.size||0),0))}`:`${ps.length} sayfa · ${physical.length} dosya · ${fmtBytes(physical.reduce((n,f)=>n+(f.size||0),0))}`};
window.v68FileProperties=async path=>{closeContext();const f=scan.files.find(x=>norm(x.nativePath)===norm(path));let st={};try{st=await api.statManagedFile(path)}catch{}const refs=[];for(const p of pages())if((p.blocks||[]).some(b=>b.type==='attachment'&&norm(b.nativePath)===norm(path)))refs.push(p);const m=fileMeta(path);modal(`<div class="modal-head"><h3>${esc(baseName(path))}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body"><div class="form-row"><label>Açıklama</label><input id="fileMetaDesc" value="${attr(m.description||'')}" placeholder="Dosya için kısa bir açıklama"></div>${visualEditorMarkup(m.icon,m.accentColor,fileIconKey(path),true,m.rowColorEnabled,m.iconColor,m.iconColorEnabled)}<div style="height:1px;background:var(--line);margin:18px 0"></div><div class="form-row"><label>Dosya bilgisi</label><div class="help-text"><strong style="color:var(--text)">${fmtBytes(st.size||f?.size||0)}</strong> · ${esc(extOf(path))}<br>${st.mtimeMs?`Son değişiklik: ${fmtDate(st.mtimeMs)}<br>`:''}<span style="word-break:break-all">${esc(path)}</span></div></div><div class="form-row"><label>Kullanıldığı sayfalar</label><div class="help-text">${refs.map(p=>esc(p.title)).join('<br>')||'Bu dosya henüz bir sayfaya bağlı değil.'}</div></div><div class="modal-actions"><button class="btn" onclick="v68CopyPath(${js(path)})">Yolu kopyala</button><button class="btn primary" onclick="v68SaveFileMeta(${js(path)})">Kaydet</button></div></div>`,true);setTimeout(updateVisualPreview,0)};
window.v68SaveFileMeta=path=>{const m=fileMeta(path);m.description=document.getElementById('fileMetaDesc').value.trim();v682ReadVisual(m,fileIconKey(path),true);persist(false);closeModal();renderTabs();if(currentView.kind==='folder')renderFolderView(currentView.id);else if(currentView.kind==='page')renderPage(currentView.id);toast('Dosya görünümü kaydedildi')};
const _v682RenderFileBase=renderFile;renderFile=async function(path,name){await _v682RenderFileBase(path,name);const head=el.content.querySelector('.editor-head');if(!head)return;const m=fileMeta(path),v=v682Visual(m),key=fileIconKey(name,m.icon);let badge=head.querySelector('.editor-file-icon');if(!badge){badge=document.createElement('span');badge.className='editor-file-icon file-glyph';head.prepend(badge)}badge.innerHTML=iconSvg(key);badge.style.color=v.icon||'';badge.style.width='34px';badge.style.height='34px'};


/* ===== Veloria V1 attachment display compatibility ===== */
function attachmentViewMode(b){return isImage(b.name)?(b.displayMode||ui.defaultImageMode||'gallery'):(b.fileDisplay||ui.defaultFileDisplay||'card')}
function attachmentShowPath(b){return typeof b.showPath==='boolean'?b.showPath:!!ui.showAttachmentPaths}
renderAttachmentBlock=function(b,common,tools){
  const img=isImage(b.name),path=b.nativePath||b.storagePath||'',missing=attachmentPathMissing(path),m=path?fileMeta(path):{},v=v682Visual(m),key=fileIconKey(b.name,m.icon),showPath=attachmentShowPath(b);
  if(img){const mode=b.displayMode||ui.defaultImageMode||'gallery',width=Math.max(120,Math.min(1000,Number(b.imageWidth)||Number(ui.defaultImageWidth)||240));return `<div class="block-wrap attachment-wrap ${mode==='gallery'?'gallery-block':''}" ${common}>${tools}<div class="attachment attachment-image-card ${mode} ${v.classes} ${missing?'missing':''}" ${v682StyleAttr(v)} style="--attachment-width:${width}px" data-attachment="${attr(b.id)}"><div class="attachment-image">${!missing?`<img data-img-block="${attr(b.id)}" alt="${attr(b.name||'')}">`:''}</div><div class="attachment-meta"><span class="file-glyph">${missing?'!':iconSvg(key)}</span><span class="attachment-name"><strong>${esc(b.name||'Görsel')}</strong><small>${missing?'Dosya bulunamadı':fmtBytes(b.size||0)+(showPath&&path?' · '+esc(path):'')}</small></span><span class="attachment-actions">${missing?`<button class="mini" onclick="v68RelinkAttachment('${attr(b.id)}')">Yeniden bağla</button>`:`<button class="mini" onclick="v68AttachmentOpen('${attr(b.id)}')">Aç</button>`}<button class="mini" title="Görünüm" onclick="v683AttachmentView('${attr(b.id)}')">${iconSvg('eye','sm')}</button><button class="mini" onclick="v68AttachmentMenu(event,'${attr(b.id)}')">${iconSvg('more','sm')}</button></span></div></div></div>`}
  const mode=b.fileDisplay||ui.defaultFileDisplay||'card';return `<div class="block-wrap attachment-wrap" ${common}>${tools}<div class="attachment file-attachment file-${attr(mode)} ${v.classes} ${missing?'missing':''}" ${v682StyleAttr(v)} data-attachment="${attr(b.id)}"><div class="attachment-meta"><span class="file-glyph">${missing?'!':iconSvg(key)}</span><span class="attachment-name"><strong>${esc(b.name||'Dosya')}</strong><small>${mode==='compact'?'':(missing?'Dosya bulunamadı':`${esc(extOf(b.name))} · ${fmtBytes(b.size||0)}${showPath&&path?' · '+esc(path):''}`)}</small></span><span class="attachment-actions">${missing?`<button class="mini" onclick="v68RelinkAttachment('${attr(b.id)}')">Yeniden bağla</button>`:`<button class="mini" onclick="v68AttachmentOpen('${attr(b.id)}')">Aç</button>`}<button class="mini" title="Görünüm" onclick="v683AttachmentView('${attr(b.id)}')">${iconSvg('eye','sm')}</button><button class="mini" onclick="v68AttachmentMenu(event,'${attr(b.id)}')">${iconSvg('more','sm')}</button></span></div></div></div>`
};
window.v683AttachmentView=id=>{closeContext();const x=findAttachment(id);if(!x)return;const b=x.b,img=isImage(b.name);modal(`<div class="modal-head"><h3>${img?'Görsel görünümü':'Dosya görünümü'}</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body">${img?`<div class="form-row"><label>Yerleşim</label><select id="attMode"><option value="gallery" ${(b.displayMode||ui.defaultImageMode)==='gallery'?'selected':''}>Kart / galeri</option><option value="list" ${b.displayMode==='list'?'selected':''}>Liste</option><option value="full" ${b.displayMode==='full'?'selected':''}>Tam genişlik</option></select></div><div class="form-row"><label>Görsel genişliği</label><input id="attWidth" type="range" min="120" max="1000" step="20" value="${Number(b.imageWidth)||Number(ui.defaultImageWidth)||240}" oninput="document.getElementById('attWidthValue').textContent=this.value+' px'"><div id="attWidthValue" class="help-text">${Number(b.imageWidth)||Number(ui.defaultImageWidth)||240} px</div></div>`:`<div class="form-row"><label>Dosya kartı</label><select id="attFileMode"><option value="compact" ${(b.fileDisplay||ui.defaultFileDisplay)==='compact'?'selected':''}>Kompakt</option><option value="card" ${(b.fileDisplay||ui.defaultFileDisplay)==='card'?'selected':''}>Normal kart</option><option value="detail" ${(b.fileDisplay||ui.defaultFileDisplay)==='detail'?'selected':''}>Detaylı</option></select></div>`}<label class="visual-toggle"><input id="attShowPath" type="checkbox" ${attachmentShowPath(b)?'checked':''}><span><strong>Fiziksel yolu göster</strong><small>Bu seçenek sadece bu ek için geçerlidir.</small></span></label><div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v683SaveAttachmentView('${attr(id)}')">Kaydet</button></div></div>`) };
window.v683SaveAttachmentView=id=>{const x=findAttachment(id);if(!x)return;const b=x.b;if(isImage(b.name)){b.displayMode=document.getElementById('attMode').value;b.imageWidth=Number(document.getElementById('attWidth').value)||240}else b.fileDisplay=document.getElementById('attFileMode').value;b.showPath=document.getElementById('attShowPath').checked;touchPage(x.p);closeModal();if(currentView.kind==='page'&&currentView.id===x.p.id)renderPage(x.p.id);toast('Görünüm kaydedildi')};
window.v68AttachmentMenu=(e,id)=>{e.stopPropagation();const x=findAttachment(id);if(!x)return;const b=x.b,missing=attachmentPathMissing(b.nativePath);showContext(e.clientX,e.clientY,`${missing?`<button onclick="v68RelinkAttachment('${attr(id)}')">Yeniden bağla</button>`:`<button onclick="v68AttachmentOpen('${attr(id)}')">Aç / Düzenle</button><button onclick="v68RevealAttachment('${attr(id)}')">Windows'ta göster</button>`}<button onclick="v683AttachmentView('${attr(id)}')">Görünümü ayarla</button><hr><button onclick="v68AttachmentMove('${attr(id)}')">Başka sayfaya taşı</button><button onclick="v68AttachmentUnlink('${attr(id)}')">Sadece bağlantıyı kaldır</button><button class="danger" onclick="v68AttachmentPhysicalDelete('${attr(id)}')">Fiziksel dosyayı Çöp Kutusuna taşı</button>`)};

const _v683SettingsBodyBase=settingsBody;
settingsBody=function(tab,p){
 if(tab==='appearance')return `<div class="form-row"><label>Uygulama teması</label><button class="btn" onclick="v68ToggleTheme()">${state.theme==='light'?'Açık tema':'Koyu tema'} · Değiştir</button></div><div class="form-row"><label>Klasör galerisi</label><select onchange="v68SetThumbSize(this.value)"><option value="small" ${ui.thumbSize==='small'?'selected':''}>Küçük</option><option value="medium" ${ui.thumbSize==='medium'?'selected':''}>Normal</option><option value="large" ${ui.thumbSize==='large'?'selected':''}>Büyük</option></select></div><div class="form-row"><label>Sayfaya eklenen görseller</label><select onchange="v683SetDefaultImageMode(this.value)"><option value="gallery" ${ui.defaultImageMode==='gallery'?'selected':''}>Kart / galeri</option><option value="list" ${ui.defaultImageMode==='list'?'selected':''}>Liste</option><option value="full" ${ui.defaultImageMode==='full'?'selected':''}>Tam genişlik</option></select><input type="range" min="120" max="1000" step="20" value="${Number(ui.defaultImageWidth)||240}" oninput="v683SetDefaultImageWidth(this)"><div class="help-text">${Number(ui.defaultImageWidth)||240} px</div></div><div class="form-row"><label>Sayfaya eklenen diğer dosyalar</label><select onchange="v683SetDefaultFileDisplay(this.value)"><option value="compact" ${ui.defaultFileDisplay==='compact'?'selected':''}>Kompakt</option><option value="card" ${ui.defaultFileDisplay==='card'?'selected':''}>Normal kart</option><option value="detail" ${ui.defaultFileDisplay==='detail'?'selected':''}>Detaylı</option></select></div><label class="visual-toggle"><input type="checkbox" ${ui.showAttachmentPaths?'checked':''} onchange="v683SetShowAttachmentPaths(this.checked)"><span><strong>Dosya yollarını varsayılan olarak göster</strong><small>İstersen her dosyada ayrıca açıp kapatabilirsin.</small></span></label><div class="form-row"><label>Görsel dosya adları</label><button class="btn" onclick="v68ToggleImageNames()">${ui.showImageNames?'Gösteriliyor':'Gizli'}</button></div>`;
 if(tab==='files')return `<div class="storage-info-card"><strong>Yalnızca yerel depolama</strong><span>Notlar, ayarlar, taslaklar, yedekler ve dosya indeksleri Masaüstündeki Veloria Dosyalar klasöründe tutulur. Bulut hesabı, senkronizasyon veya uzak oturum yoktur.</span></div><div class="form-row"><label>Yerel veri klasörü</label><div class="help-text" style="word-break:break-all">${esc(info?.rootPath||'Veloria Dosyalar')}</div></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn primary" onclick="veloriaDesktop.openRoot()">Veloria Dosyalar'ı aç</button><button class="btn" onclick="v68CloseModal();v68ShowStorage()">Depolamayı incele</button></div><div class="form-row"><label>Sayfa TXT aynaları</label><button class="btn" onclick="v68ToggleNoteMirror()">${state.prefs.showNoteMirror?'Dosya listesinde gösteriliyor':'Dosya listesinde gizli'}</button></div>`;
 if(tab==='security')return `<div class="storage-info-card"><strong>Hesap sistemi yok</strong><span>Veloria giriş hesabı, e-posta veya bulut şifresi kullanmaz. İstersen yalnızca bu bilgisayardaki uygulamayı bir uygulama şifresiyle kilitleyebilirsin.</span></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn primary" onclick="v68PinSettings()">Uygulama şifresi</button><button class="btn" onclick="v68LockNow()">Şimdi kilitle</button></div>`;
 return `<div class="storage-info-card"><strong>Yerel çalışma alanı</strong><span>Veloria kullanıcı hesabına bağlı değildir. Kurulum dosyaları kişisel notlarını, şifreni veya çalışma alanını içermez.</span></div><div class="form-row"><label>Aktif çalışma alanı</label><button class="btn" onclick="v68CloseModal();v68WorkspaceMenu()">${esc(currentWorkspaceName())} · Çalışma alanlarını yönet</button></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" onclick="v68CloseModal();v68QuickOpen()">Hızlı aç · Ctrl+P</button><button class="btn" onclick="v68CloseModal();veloriaDesktop.openRecovery()">Kurtarma aracını aç</button><button class="btn" onclick="v68CloseModal();v68Undo()">Son işlemi geri al</button></div>`
};
window.v68PinSettings=async()=>{const st=await api.lockStatus();const title=st?.enabled?'Uygulama şifresini değiştir':'Uygulama şifresi oluştur';modal(`<div class="modal-head"><h3>${title}</h3><span class="grow"></span><button class="icon-btn" onclick="v68Settings('security')">${iconSvg('close','sm')}</button></div><div class="modal-body"><div class="form-row"><label>Yeni uygulama şifresi</label><input id="pinNew" type="password" autofocus autocomplete="new-password" placeholder="En az 4 karakter"></div><div class="help-text">Şifre Veloria ayarlarında tuzlanmış bir özet olarak saklanır.</div><div class="modal-actions"><button class="btn" onclick="v68Settings('security')">Geri</button>${st?.enabled?'<button class="btn danger" onclick="v68RemovePin()">Şifreyi kaldır</button>':''}<button class="btn primary" onclick="v68ApplyPin()">Kaydet</button></div></div>`)};
window.v68ApplyPin=async()=>{const p=document.getElementById('pinNew').value;try{await api.setPin(p);toast('Uygulama şifresi kaydedildi');settings('security')}catch(e){toast(e.message,'error')}};
window.v68RemovePin=async()=>{await api.setPin('');toast('Uygulama şifresi kaldırıldı');settings('security')};
async function showLock(){const st=await api.lockStatus().catch(()=>({enabled:false}));if(!st?.enabled){toast('Uygulama şifresi ayarlanmamış','warn');return}el.lock.innerHTML=`<div class="lock"><div class="lock-card"><img src="icon.png"><h2>Veloria kilitli</h2><p>Devam etmek için uygulama şifresini gir.</p><input id="lockPin" type="password" autofocus autocomplete="current-password"><button class="btn primary" onclick="v68UnlockPin()">Kilidi aç</button></div></div>`;setTimeout(()=>document.getElementById('lockPin')?.focus(),20)}
window.v68UnlockPin=async()=>{const p=document.getElementById('lockPin').value;const r=await api.verifyPin(p);if(r?.ok){el.lock.innerHTML='';toast('Kilit açıldı')}else toast('Uygulama şifresi yanlış','warn')};
window.v68ChangeRoot=()=>toast('Veri klasörü: Masaüstü / Veloria Dosyalar','warn');


/* ===== Veloria V1 compatibility HF1 - collapsible message cards ===== */
function v684CollapseStore(){
  if(!ui.blockCollapsed||typeof ui.blockCollapsed!=='object'||Array.isArray(ui.blockCollapsed))ui.blockCollapsed={};
  return ui.blockCollapsed
}
function v684PageCollapseMap(pageId,create=false){
  const store=v684CollapseStore(),id=String(pageId||'');
  if(!id)return null;
  if(create&&(!store[id]||typeof store[id]!=='object'||Array.isArray(store[id])))store[id]={};
  return store[id]||null
}
function v684IsCollapsibleBlock(b){return !!b&&['richtext','text','heading','link','code'].includes(String(b.type||'text'))}
function v684IsCollapsed(pageId,blockId){return !!v684PageCollapseMap(pageId,false)?.[String(blockId||'')]}
function v684SetCollapsed(pageId,blockId,value,save=true){
  const store=v684CollapseStore(),pid=String(pageId||''),bid=String(blockId||'');if(!pid||!bid)return;
  if(value){const map=v684PageCollapseMap(pid,true);map[bid]=true}
  else{const map=v684PageCollapseMap(pid,false);if(map){delete map[bid];if(!Object.keys(map).length)delete store[pid]}}
  if(save)saveUi()
}
function v684BlockKind(b){
  if(!b)return'Mesaj';
  if(b.type==='heading')return'Başlık';
  if(b.type==='link')return'Bağlantı';
  if(b.type==='code')return'Kod';
  return'Mesaj'
}
function v684HtmlPreview(html){
  const d=document.createElement('div');d.innerHTML=String(html||'').slice(0,6000);
  return String(d.textContent||'').replace(/\s+/g,' ').trim()
}
function v684BlockPreview(b){
  let text='';
  if(!b)text='';
  else if(b.type==='richtext')text=v684HtmlPreview(b.html||'');
  else if(b.type==='heading'||b.type==='text')text=String(b.text||'');
  else if(b.type==='link')text=[b.title,b.url].filter(Boolean).join(' · ');
  else if(b.type==='code')text=String(b.code||'');
  text=String(text||'').replace(/\s+/g,' ').trim();
  return text.length>180?text.slice(0,177)+'…':(text||'Boş içerik')
}
function v684CollapseButton(b,collapsed){
  return `<button type="button" class="block-collapse" data-collapse-button="${attr(b.id)}" aria-expanded="${collapsed?'false':'true'}" title="${collapsed?'Mesajı aç':'Mesajı küçült'}" onclick="v684ToggleBlock(event,'${attr(b.id)}')"><span class="block-collapse-icon">${iconSvg('chevronDown','sm')}</span><span class="block-collapse-label">${collapsed?'Aç':'Küçült'}</span></button>`
}
function v684Summary(b){return `<button type="button" class="block-collapsed-summary" data-collapse-summary="${attr(b.id)}" onclick="v684ToggleBlock(event,'${attr(b.id)}')"><span class="block-summary-kind">${esc(v684BlockKind(b))}</span><span class="block-summary-text">${esc(v684BlockPreview(b))}</span></button>`}
function v684UpdateBlockDom(p,b,collapsed){
  const wrap=el.content.querySelector(`[data-block="${CSS.escape(b.id)}"]`);if(!wrap)return;
  wrap.classList.toggle('is-collapsed',!!collapsed);
  const btn=wrap.querySelector('[data-collapse-button]');if(btn){btn.setAttribute('aria-expanded',collapsed?'false':'true');btn.title=collapsed?'Mesajı aç':'Mesajı küçült';const label=btn.querySelector('.block-collapse-label');if(label)label.textContent=collapsed?'Aç':'Küçült'}
  const summary=wrap.querySelector('[data-collapse-summary] .block-summary-text');if(summary)summary.textContent=v684BlockPreview(b)
}
window.v684ToggleBlock=(e,id)=>{
  e?.preventDefault?.();e?.stopPropagation?.();closeContext();
  const p=currentView.kind==='page'?page(currentView.id):null,b=p?.blocks?.find(x=>x.id===id);if(!p||!v684IsCollapsibleBlock(b))return;
  const next=!v684IsCollapsed(p.id,id);v684SetCollapsed(p.id,id,next,true);v684UpdateBlockDom(p,b,next)
};
function v684SetAllCollapsed(collapsed){
  closeContext();const p=currentView.kind==='page'?page(currentView.id):null;if(!p)return;
  const store=v684CollapseStore();
  if(collapsed){const map={};for(const b of p.blocks||[])if(v684IsCollapsibleBlock(b))map[b.id]=true;if(Object.keys(map).length)store[p.id]=map;else delete store[p.id]}
  else delete store[p.id];
  saveUi();
  for(const b of p.blocks||[])if(v684IsCollapsibleBlock(b))v684UpdateBlockDom(p,b,collapsed);
  toast(collapsed?'Tüm mesajlar küçültüldü':'Tüm mesajlar açıldı')
}
window.v684CollapseAll=()=>v684SetAllCollapsed(true);
window.v684ExpandAll=()=>v684SetAllCollapsed(false);

const _v684RenderBlockBase=renderBlock;
renderBlock=function(b,i){
  if(!v684IsCollapsibleBlock(b))return _v684RenderBlockBase(b,i);
  const collapsed=v684IsCollapsed(currentView.id,b.id);
  const common=`data-block="${attr(b.id)}" data-index="${i}" ondragover="v68BlockOver(event,'${attr(b.id)}')" ondrop="v68BlockDrop(event,'${attr(b.id)}')"`;
  const tools=`<div class="block-toolbar"><span class="block-grip" title="Sürükle" draggable="true" ondragstart="v68BlockDrag(event,'${attr(b.id)}')" ondragend="v68BlockDragEnd(event)">${iconSvg('grip','sm')}</span><button class="block-more" aria-label="İçerik menüsü" onclick="v68BlockMenu(event,'${attr(b.id)}')">${iconSvg('more','sm')}</button></div>`;
  let body='';
  if(b.type==='heading')body=`<input class="heading-block h${Math.max(1,Math.min(3,b.level||2))}" data-edit="heading" value="${attr(b.text||'')}" placeholder="Başlık">`;
  else if(b.type==='link')body=`<div class="link-block"><input data-edit="link-title" value="${attr(b.title||'')}" placeholder="Bağlantı adı"><input data-edit="link-url" value="${attr(b.url||'')}" placeholder="https://..."><button class="mini" onclick="v68OpenLink('${attr(b.id)}')">Aç</button></div>`;
  else if(b.type==='code')body=`<textarea data-edit="code" class="code-area v684-code-area" style="height:180px" spellcheck="false" placeholder="Kod veya düz metin…">${esc(b.code||'')}</textarea>`;
  else{const html=b.type==='richtext'?String(b.html||''):esc(b.text||'').replace(/\n/g,'<br>');body=`<div class="rich-block" contenteditable="true" data-edit="rich" data-placeholder="Yazmaya başla…">${html}</div>`}
  return `<div class="block-wrap v684-note-card ${collapsed?'is-collapsed':''}" ${common}>${tools}${v684CollapseButton(b,collapsed)}${v684Summary(b)}<div class="block-body">${body}</div></div>`
};

const _v684RenderPageBase=renderPage;
renderPage=function(id){
  _v684RenderPageBase(id);
  if(currentView.kind!=='page'||currentView.id!==id)return;
  const row=el.content.querySelector('.view-title-row'),menu=row?.querySelector('.view-menu');if(!row||row.querySelector('.note-collapse-actions'))return;
  const actions=document.createElement('div');actions.className='note-collapse-actions';
  actions.innerHTML=`<button type="button" class="note-collapse-action" title="Tüm mesajları küçült" onclick="v684CollapseAll()">${iconSvg('chevronRight','sm')}<span>Küçült</span></button><button type="button" class="note-collapse-action" title="Tüm mesajları aç" onclick="v684ExpandAll()">${iconSvg('chevronDown','sm')}<span>Aç</span></button>`;
  row.insertBefore(actions,menu||null)
};

const _v684BlockMenuBase=window.v68BlockMenu;
window.v68BlockMenu=(e,id)=>{
  e.stopPropagation();const p=page(currentView.id),b=p?.blocks?.find(x=>x.id===id);if(!b)return;
  if(!v684IsCollapsibleBlock(b))return _v684BlockMenuBase(e,id);
  const collapsed=v684IsCollapsed(p.id,id);
  showContext(e.clientX,e.clientY,`${b.type==='heading'?`<button onclick="v68HeadingLevel('${attr(id)}',1)">H1</button><button onclick="v68HeadingLevel('${attr(id)}',2)">H2</button><button onclick="v68HeadingLevel('${attr(id)}',3)">H3</button><hr>`:''}<button onclick="v684ToggleBlock(event,'${attr(id)}')">${collapsed?'▾ Genişlet':'▸ Küçült'}</button><button onclick="v684CollapseAll()">⇥ Tümünü küçült</button><hr><button onclick="v68DuplicateBlock('${attr(id)}')">⧉ Çoğalt</button><button class="danger" onclick="v68DeleteBlock('${attr(id)}')">⌫ Sil</button>`)
};


/* ===== Veloria V1 compatibility HF5 - smart rich editor + non-blocking long paste ===== */
const V685_LONG_PASTE_CHARS=8000;
const V685_LONG_PASTE_LINES=120;
const V685_ALLOWED_HTML=new Set(['P','DIV','BR','SPAN','STRONG','B','EM','I','U','S','DEL','CODE','PRE','UL','OL','LI','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','HR','A','TABLE','THEAD','TBODY','TR','TH','TD']);
const V685_OPEN_PAIRS={'(' : ')','[':']','{':'}','"':'"',"'":"'",'`':'`'};
const V685_CLOSE_PAIRS=new Set(Object.values(V685_OPEN_PAIRS));

function v685Clipboard(e){
  const d=e?.clipboardData;
  const html=String(d?.getData('text/html')||''),plain=String(d?.getData('text/plain')||'').replace(/\r\n?/g,'\n');
  return {text:v111ClipboardPlainText(plain,html),html}
}
function v685IsVeryLargePaste(text){
  if(!text)return false;
  if(text.length>=V685_LONG_PASTE_CHARS)return true;
  let lines=1;for(let i=0;i<text.length&&lines<V685_LONG_PASTE_LINES;i++)if(text.charCodeAt(i)===10)lines++;
  return lines>=V685_LONG_PASTE_LINES
}
function v685ViewportSnapshot(target){
  const scroller=el.content;
  return {top:scroller?.scrollTop||0,left:scroller?.scrollLeft||0,targetTop:target?.scrollTop||0,targetLeft:target?.scrollLeft||0}
}
function v685RestoreViewport(target,snap){
  const scroller=el.content;if(!scroller||!snap)return;
  scroller.scrollTop=snap.top;scroller.scrollLeft=snap.left;
  if(target&&target.isConnected&&target!==scroller&&'scrollTop'in target){target.scrollTop=snap.targetTop||0;target.scrollLeft=snap.targetLeft||0}
}
let v686PasteRestoreToken=0;
function v686CancelPendingPasteRestore(){v686PasteRestoreToken++}
function v685RestoreAfterPaste(target,snap){
  // Keep the pre-paste viewport for only the current layout turn. Any real user
  // scroll intent invalidates the token so a queued restore can never fight the user.
  const token=++v686PasteRestoreToken;
  const restore=()=>{if(token===v686PasteRestoreToken&&target?.isConnected)v685RestoreViewport(target,snap)};
  restore();
  queueMicrotask(restore);
  requestAnimationFrame(restore)
}
function v685SafeHref(raw){
  const v=String(raw||'').trim();
  return /^(https?:|mailto:)/i.test(v)?v:''
}
function v685CleanClipboardNode(node,doc){
  if(node.nodeType===Node.TEXT_NODE)return doc.createTextNode(node.nodeValue||'');
  if(node.nodeType!==Node.ELEMENT_NODE)return doc.createDocumentFragment();
  const tag=node.tagName.toUpperCase();
  if(tag==='INPUT'&&String(node.getAttribute('type')||'').toLowerCase()==='checkbox'){
    const span=doc.createElement('span');span.className='task-box';span.setAttribute('contenteditable','false');span.textContent=node.checked||node.hasAttribute('checked')?'☑':'☐';return span
  }
  if(!V685_ALLOWED_HTML.has(tag)){
    const frag=doc.createDocumentFragment();for(const c of [...node.childNodes])frag.appendChild(v685CleanClipboardNode(c,doc));return frag
  }
  const out=doc.createElement(tag.toLowerCase());
  if(tag==='A'){const href=v685SafeHref(node.getAttribute('href'));if(href)out.setAttribute('href',href)}
  if(tag==='OL'){const start=Number(node.getAttribute('start'));if(Number.isFinite(start)&&start>1)out.setAttribute('start',String(start))}
  if(tag==='CODE'&&node.getAttribute('class')){const m=node.getAttribute('class').match(/language-([\w.+-]+)/i);if(m)out.setAttribute('data-language',m[1])}
  if(tag==='LI'&&(/task-list-item/i.test(node.className)||node.querySelector?.('input[type=checkbox]')))out.className='task-item';
  for(const c of [...node.childNodes])out.appendChild(v685CleanClipboardNode(c,doc));
  return out
}
function v685SanitizeClipboardHtml(raw){
  if(!raw)return'';
  const parser=new DOMParser(),parsed=parser.parseFromString(raw,'text/html'),holder=document.createElement('div');
  for(const c of [...parsed.body.childNodes])holder.appendChild(v685CleanClipboardNode(c,document));
  return holder.innerHTML
}
function v685HasStructuredHtml(raw){return /<(?:p|div|br|ul|ol|li|pre|code|blockquote|h[1-6]|strong|em|table|hr)\b/i.test(String(raw||''))}
function v685Token(stash,html){const key=`\uE000${stash.length}\uE001`;stash.push(html);return key}
function v685InlineMarkdown(raw){
  let text=String(raw??''),stash=[];
  text=text.replace(/`([^`\n]+)`/g,(_,x)=>v685Token(stash,`<code>${esc(x)}</code>`));
  text=text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,(_,label,url)=>{const h=v685SafeHref(url);return h?v685Token(stash,`<a href="${attr(h)}">🖼 ${esc(label||url)}</a>`):`![${label}](${url})`});
  text=text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,(_,label,url)=>{const h=v685SafeHref(url);return h?v685Token(stash,`<a href="${attr(h)}">${esc(label)}</a>`):`[${label}](${url})`});
  let out=esc(text);
  out=out.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<strong>$1</strong>');
  out=out.replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
  out=out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>').replace(/(^|[^_])_([^_\n]+)_(?!_)/g,'$1<em>$2</em>');
  out=out.replace(/(^|[\s(])((?:https?:\/\/)[^\s<]+)/g,(m,p,u)=>`${p}<a href="${attr(u)}">${u}</a>`);
  out=out.replace(/\uE000(\d+)\uE001/g,(_,i)=>stash[Number(i)]||'');
  return out
}
function v685SplitTableRow(line){
  let s=String(line||'').trim();if(s.startsWith('|'))s=s.slice(1);if(s.endsWith('|'))s=s.slice(0,-1);
  const cells=[];let cur='',escp=false;
  for(const ch of s){if(escp){cur+=ch;escp=false}else if(ch==='\\'){cur+=ch;escp=true}else if(ch==='|'){cells.push(cur.trim());cur=''}else cur+=ch}cells.push(cur.trim());return cells
}
function v685MarkdownToHtml(markdown){
  const lines=String(markdown||'').replace(/\r\n?/g,'\n').split('\n');let out='',i=0,lists=[];
  const closeOne=()=>{const x=lists.pop();if(!x)return;if(x.liOpen)out+='</li>';out+=`</${x.type}>`};
  const closeAll=()=>{while(lists.length)closeOne()};
  const openList=(indent,type,start)=>{out+=type==='ol'&&start>1?`<ol start="${start}">`:`<${type}>`;lists.push({indent,type,liOpen:false})};
  while(i<lines.length){
    const line=lines[i];
    const fence=line.match(/^\s*(```+|~~~+)\s*([\w.+-]*)\s*$/);
    if(fence){closeAll();const token=fence[1],lang=fence[2]||'';i++;const buf=[];while(i<lines.length&&!new RegExp('^\\s*'+token[0]+'{'+token.length+',}\\s*$').test(lines[i]))buf.push(lines[i++]);if(i<lines.length)i++;out+=`<pre><code${lang?` data-language="${attr(lang)}"`:''}>${esc(buf.join('\n'))}</code></pre>`;continue}
    if(/^\s{4}\S/.test(line)){closeAll();const buf=[];while(i<lines.length&&(lines[i].startsWith('    ')||!lines[i].trim())){buf.push(lines[i].startsWith('    ')?lines[i].slice(4):'');i++}out+=`<pre><code>${esc(buf.join('\n').replace(/\n+$/,''))}</code></pre>`;continue}
    if(i+1<lines.length&&line.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1])){
      closeAll();const heads=v685SplitTableRow(line);i+=2;const rows=[];while(i<lines.length&&lines[i].trim()&&lines[i].includes('|'))rows.push(v685SplitTableRow(lines[i++]));out+='<table><thead><tr>'+heads.map(x=>`<th>${v685InlineMarkdown(x)}</th>`).join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+heads.map((_,c)=>`<td>${v685InlineMarkdown(r[c]||'')}</td>`).join('')+'</tr>').join('')+'</tbody></table>';continue
    }
    const lm=line.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
    if(lm){
      const indent=lm[1].replace(/\t/g,'    ').length,ordered=/^\d/.test(lm[2]),type=ordered?'ol':'ul',startNum=ordered?(parseInt(lm[2],10)||1):1;
      while(lists.length&&indent<lists[lists.length-1].indent)closeOne();
      let top=lists[lists.length-1];
      if(!top||indent>top.indent){openList(indent,type,startNum);top=lists[lists.length-1]}
      else if(top.indent===indent&&top.type!==type){closeOne();openList(indent,type,startNum);top=lists[lists.length-1]}
      if(top.liOpen){out+='</li>';top.liOpen=false}
      let body=lm[3],task=body.match(/^\[([ xX])\]\s+(.*)$/);out+=`<li${task?' class="task-item"':''}>`;
      if(task){out+=`<span class="task-box" contenteditable="false">${task[1].toLowerCase()==='x'?'☑':'☐'}</span> ${v685InlineMarkdown(task[2])}`}
      else out+=v685InlineMarkdown(body);
      top.liOpen=true;i++;continue
    }
    if(lists.length){
      if(!line.trim()){closeAll();i++;continue}
      out+=`<br>${v685InlineMarkdown(line.trim())}`;i++;continue
    }
    if(!line.trim()){i++;continue}
    const hm=line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);if(hm){out+=`<h${hm[1].length}>${v685InlineMarkdown(hm[2])}</h${hm[1].length}>`;i++;continue}
    if(/^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(line)){out+='<hr>';i++;continue}
    if(/^\s{0,3}>/.test(line)){const q=[];while(i<lines.length&&/^\s{0,3}>/.test(lines[i]))q.push(lines[i++].replace(/^\s{0,3}>\s?/,''));out+=`<blockquote>${v685MarkdownToHtml(q.join('\n'))}</blockquote>`;continue}
    // Preserve ordinary consecutive lines as one paragraph with explicit line breaks.
    const para=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^\s*(```+|~~~+)/.test(lines[i])&&!/^(\s*)([-+*]|\d+[.)])\s+/.test(lines[i])&&!/^\s{0,3}(#{1,6})\s+/.test(lines[i])&&!/^\s{0,3}>/.test(lines[i])){if(i+1<lines.length&&lines[i].includes('|')&&/^\s*\|?\s*:?-{3,}/.test(lines[i+1]))break;para.push(lines[i++])}
    out+=`<p>${para.map(v685InlineMarkdown).join('<br>')}</p>`
  }
  closeAll();return out||'<p><br></p>'
}
function v685RangeInside(target){
  const sel=window.getSelection?.();if(!sel||!sel.rangeCount)return null;const r=sel.getRangeAt(0);return target.contains(r.commonAncestorContainer)?r:null
}
function v685SetCaretAfter(node){const sel=getSelection(),r=document.createRange();r.setStartAfter(node);r.collapse(true);sel.removeAllRanges();sel.addRange(r)}
function v685InsertHtmlEditable(target,html){
  if(!html)return false;v692HistoryCheckpoint(target);
  const sel=window.getSelection?.();if(!sel)return false;let range=v685RangeInside(target);if(!range){range=document.createRange();range.selectNodeContents(target);range.collapse(false)}
  try{target.focus({preventScroll:true})}catch{target.focus()}
  sel.removeAllRanges();sel.addRange(range);
  // Chromium's editing command replaces its empty-line placeholder correctly.
  // Inserting a DOM fragment directly leaves an extra trailing DIV/BR behind.
  let emitted=false;const onInput=()=>{emitted=true};target.addEventListener('input',onInput,{once:true});
  let inserted=false;try{inserted=document.execCommand('insertHTML',false,html)}finally{target.removeEventListener('input',onInput)}
  if(inserted){if(!emitted)v685DispatchInput(target,'insertFromPaste');return true}
  range.deleteContents();const tpl=document.createElement('template');tpl.innerHTML=html;const frag=tpl.content,last=frag.lastChild;range.insertNode(frag);
  if(last&&last.isConnected)v685SetCaretAfter(last);try{target.focus({preventScroll:true})}catch{target.focus()}
  target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:null}));return true
}
function v685InsertPlainControl(target,text){
  const a=Number.isFinite(target.selectionStart)?target.selectionStart:target.value.length,b=Number.isFinite(target.selectionEnd)?target.selectionEnd:a;target.setRangeText(text,a,b,'end');target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:text}));try{target.focus({preventScroll:true})}catch{target.focus()};return true
}
function v685HandlePaste(e){
  const target=e.currentTarget;if(!target||!el.content)return;const snap=v685ViewportSnapshot(target),clip=v685Clipboard(e),editable=target.isContentEditable||target.getAttribute?.('contenteditable')==='true',control=target instanceof HTMLTextAreaElement;
  if(editable){
    e.preventDefault();const text=v111PrepareGapPaste(target,clip.text),html=text?editorUtils.textToHtml(text):v685SanitizeClipboardHtml(clip.html);v685InsertHtmlEditable(target,html)
  }else if(control&&v685IsVeryLargePaste(clip.text)){
    e.preventDefault();v685InsertPlainControl(target,clip.text)
  }
  v685RestoreAfterPaste(target,snap)
}
function v685BindPaste(target){if(!target||target.dataset.v685Paste==='1')return;target.dataset.v685Paste='1';target.addEventListener('paste',v685HandlePaste)}

function v685RichSelection(target){const r=v685RangeInside(target);return r&&target.contains(r.startContainer)&&target.contains(r.endContainer)?r:null}
function v685DispatchInput(target,type='insertText',data=null){target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:type,data}))}
function v685AdjacentChar(range,dir){
  const n=range.startContainer,o=range.startOffset;
  if(n.nodeType===Node.TEXT_NODE){if(dir<0&&o>0)return n.nodeValue[o-1]||'';if(dir>0&&o<n.nodeValue.length)return n.nodeValue[o]||''}
  return''
}
function v685InsertPairRich(target,open,close){
  const r=v685RichSelection(target);if(!r)return false;const selected=!r.collapsed;
  if(selected){const frag=r.extractContents(),left=document.createTextNode(open),right=document.createTextNode(close);r.insertNode(right);r.insertNode(frag);r.insertNode(left);const nr=document.createRange();nr.setStartAfter(left);nr.setEndBefore(right);const sel=getSelection();sel.removeAllRanges();sel.addRange(nr)}
  else{const right=document.createTextNode(close),left=document.createTextNode(open);r.insertNode(right);r.insertNode(left);const nr=document.createRange();nr.setStartAfter(left);nr.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(nr)}
  v685DispatchInput(target,'insertText',open);return true
}
function v685SkipCloserRich(target,ch){const r=v685RichSelection(target);if(!r?.collapsed||v685AdjacentChar(r,1)!==ch)return false;const n=r.startContainer,o=r.startOffset,r2=document.createRange();r2.setStart(n,o+1);r2.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r2);return true}
function v685BackspacePairRich(target){const r=v685RichSelection(target);if(!r?.collapsed)return false;const a=v685AdjacentChar(r,-1),b=v685AdjacentChar(r,1);if(V685_OPEN_PAIRS[a]!==b)return false;const n=r.startContainer,o=r.startOffset;if(n.nodeType!==Node.TEXT_NODE)return false;n.deleteData(o-1,2);const nr=document.createRange();nr.setStart(n,o-1);nr.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(nr);v685DispatchInput(target,'deleteContentBackward');return true}
function v686CaretAtBlockStart(range,block){
  try{const probe=document.createRange();probe.selectNodeContents(block);probe.setEnd(range.startContainer,range.startOffset);return probe.toString().replace(/[\u200B\uFEFF]/g,'').length===0}catch{return false}
}
function v686SetCaretAtStart(node){
  const sel=getSelection(),r=document.createRange();
  let leaf=node;
  while(leaf?.firstChild&&leaf.firstChild.nodeName!=='BR')leaf=leaf.firstChild;
  if(leaf?.nodeType===Node.TEXT_NODE)r.setStart(leaf,0);else if(node)r.setStart(node,0);else return;
  r.collapse(true);sel.removeAllRanges();sel.addRange(r)
}
function v686CancelBlockFormatRich(target){
  const r=v685RichSelection(target);if(!r?.collapsed)return false;
  const base=r.startContainer.nodeType===Node.ELEMENT_NODE?r.startContainer:r.startContainer.parentElement;if(!base)return false;
  const heading=base.closest?.('h1,h2,h3,h4,h5,h6');
  if(heading&&target.contains(heading)&&v686CaretAtBlockStart(r,heading)){
    const p=document.createElement('p');while(heading.firstChild)p.appendChild(heading.firstChild);if(!p.textContent&&!p.querySelector('br'))p.appendChild(document.createElement('br'));heading.replaceWith(p);v686SetCaretAtStart(p);v685DispatchInput(target,'formatBlock');return true
  }
  const quote=base.closest?.('blockquote');
  if(quote&&target.contains(quote)&&v686CaretAtBlockStart(r,quote)){
    const blockish=/^(P|DIV|UL|OL|PRE|H1|H2|H3|H4|H5|H6|TABLE|BLOCKQUOTE)$/;
    const nodes=[...quote.childNodes],hasBlocks=nodes.some(n=>n.nodeType===Node.ELEMENT_NODE&&blockish.test(n.tagName));
    let first=null;
    if(hasBlocks){
      for(const n of nodes){if(n.nodeType===Node.TEXT_NODE&&n.nodeValue?.trim()){const p=document.createElement('p');p.appendChild(n);quote.before(p);if(!first)first=p}else{quote.before(n);if(!first&&n.nodeType===Node.ELEMENT_NODE)first=n}}
      quote.remove();
      if(!first){first=document.createElement('p');first.appendChild(document.createElement('br'));target.appendChild(first)}
    }else{
      const p=document.createElement('p');while(quote.firstChild)p.appendChild(quote.firstChild);if(!p.textContent&&!p.querySelector('br'))p.appendChild(document.createElement('br'));quote.replaceWith(p);first=p
    }
    v686SetCaretAtStart(first);v685DispatchInput(target,'formatBlock');return true
  }
  return false
}
function v685TryInputRule(target,key){
  if(key!==' ')return false;const r=v685RichSelection(target);if(!r?.collapsed||r.startContainer.nodeType!==Node.TEXT_NODE)return false;const n=r.startContainer,o=r.startOffset,before=n.nodeValue.slice(0,o);
  const li=n.parentElement?.closest?.('li');const task=before.match(/(?:^|\n)\s*\[([ xX])\]$/);if(li&&target.contains(li)&&task){
    const markerLen=task[0].trimStart().length,start=o-markerLen;n.deleteData(start,markerLen);li.classList.add('task-item');const span=document.createElement('span');span.className='task-box';span.setAttribute('contenteditable','false');span.textContent=task[1].toLowerCase()==='x'?'☑':'☐';li.insertBefore(span,n);li.insertBefore(document.createTextNode(' '),n);const nr=document.createRange();nr.setStart(n,start);nr.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(nr);v685DispatchInput(target,'insertText',' ');return true
  }
  const m=before.match(/(?:^|\n)(\s*)(\d+[.)]|[-+*]|#{1,6}|>)$/);if(!m)return false;
  const marker=m[2],start=o-marker.length;n.deleteData(start,marker.length);const nr=document.createRange();nr.setStart(n,start);nr.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(nr);
  let cmd='',value=null;if(/^\d/.test(marker))cmd='insertOrderedList';else if(/^[-+*]$/.test(marker))cmd='insertUnorderedList';else if(marker==='>'){cmd='formatBlock';value='blockquote'}else if(/^#+$/.test(marker)){cmd='formatBlock';value=`h${marker.length}`}
  if(cmd){document.execCommand(cmd,false,value);v685DispatchInput(target,'formatBlock');return true}return false
}
function v685TryEnterRule(target){
  const r=v685RichSelection(target);if(!r?.collapsed||r.startContainer.nodeType!==Node.TEXT_NODE)return false;const n=r.startContainer,o=r.startOffset,line=n.nodeValue.slice(0,o).trim();
  const fence=line.match(/^(```+|~~~+)\s*([\w.+-]*)$/);const rule=/^(?:---|___|\*\*\*)$/.test(line);if(!fence&&!rule)return false;
  let block=n.parentElement;while(block&&block.parentElement!==target)block=block.parentElement;if(!block||block===target)block=n;
  const after=document.createElement('p');after.appendChild(document.createElement('br'));
  if(rule){const hr=document.createElement('hr');if(block.nodeType===Node.TEXT_NODE){block.remove();target.append(hr,after)}else block.replaceWith(hr,after);const rr=document.createRange();rr.setStart(after,0);rr.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(rr);v685DispatchInput(target,'insertParagraph');return true}
  const pre=document.createElement('pre'),code=document.createElement('code');if(fence[2])code.setAttribute('data-language',fence[2]);code.appendChild(document.createElement('br'));pre.appendChild(code);if(block.nodeType===Node.TEXT_NODE){block.remove();target.append(pre,after)}else block.replaceWith(pre,after);const rr=document.createRange();rr.setStart(code,0);rr.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(rr);v685DispatchInput(target,'insertParagraph');return true
}
function v685WrapSelectionTag(target,tag){
  const r=v685RichSelection(target);if(!r||r.collapsed)return false;const elx=document.createElement(tag);try{r.surroundContents(elx)}catch{return false}const s=getSelection();s.selectAllChildren(elx);v685DispatchInput(target,'formatBold');return true
}
function v685RichKeydown(e){
  const t=e.currentTarget;if(e.defaultPrevented)return;
  const mod=e.ctrlKey||e.metaKey,k=String(e.key||'');
  if(mod&&!e.altKey){
    const low=k.toLowerCase();if(low==='b'||low==='i'||low==='u'){e.preventDefault();document.execCommand(low==='b'?'bold':low==='i'?'italic':'underline',false);return}
    if(e.shiftKey&&low==='x'){e.preventDefault();document.execCommand('strikeThrough',false);return}
    if(e.shiftKey&&k==='7'){e.preventDefault();document.execCommand('insertOrderedList',false);return}
    if(e.shiftKey&&k==='8'){e.preventDefault();document.execCommand('insertUnorderedList',false);return}
    if(low==='`'&&v685WrapSelectionTag(t,'code')){e.preventDefault();return}
  }
  // Literal typing never invokes Markdown rules. Explicit format shortcuts still work.
  if(!mod&&!e.altKey&&!e.isComposing)v692HistoryCheckpoint(t);
  if(k==='Tab'){
    const r=v685RichSelection(t),li=r?.startContainer?.parentElement?.closest?.('li');if(li&&t.contains(li)){e.preventDefault();document.execCommand(e.shiftKey?'outdent':'indent',false);return}
  }
  if(k==='Backspace'&&v686CancelBlockFormatRich(t)){e.preventDefault();return}
  if(k==='Backspace'&&v685BackspacePairRich(t)){e.preventDefault();return}
  if(V685_CLOSE_PAIRS.has(k)&&v685SkipCloserRich(t,k)){e.preventDefault();return}
  if(Object.prototype.hasOwnProperty.call(V685_OPEN_PAIRS,k)){
    const r=v685RichSelection(t),next=r?.collapsed?v685AdjacentChar(r,1):'';if(!r)return;
    if(!r.collapsed||!next||/\s|[\]\)}>,;:]/.test(next)){if(v685InsertPairRich(t,k,V685_OPEN_PAIRS[k]))e.preventDefault()}
  }
}
function v685TextareaLineRange(t,a,b){
  const value=t.value,start=value.lastIndexOf('\n',Math.max(0,a)-1)+1,hit=value.indexOf('\n',Math.max(a,b));return {start,stop:hit<0?value.length:hit}
}
function v685IndentTextarea(t,a,b,outdent=false){
  const r=v685TextareaLineRange(t,a,b),chunk=t.value.slice(r.start,r.stop),lines=chunk.split('\n');
  const changed=outdent?lines.map(x=>x.startsWith('  ')?x.slice(2):x.startsWith('\t')?x.slice(1):x):lines.map(x=>'  '+x);
  t.setRangeText(changed.join('\n'),r.start,r.stop,'select');v685DispatchInput(t,'insertText',null)
}
function v685ToggleLineComment(t,a,b){
  const r=v685TextareaLineRange(t,a,b),chunk=t.value.slice(r.start,r.stop),lines=chunk.split('\n'),nonBlank=lines.filter(x=>x.trim());
  const uncomment=nonBlank.length>0&&nonBlank.every(x=>/^\s*\/\//.test(x));
  const changed=lines.map(x=>{if(!x.trim())return x;if(uncomment)return x.replace(/^(\s*)\/\/ ?/,'$1');const m=x.match(/^(\s*)/);return `${m?.[1]||''}// ${x.slice((m?.[1]||'').length)}`});
  t.setRangeText(changed.join('\n'),r.start,r.stop,'select');v685DispatchInput(t,'insertText',null)
}
function v685ControlKeydown(e){
  const t=e.currentTarget;if(!(t instanceof HTMLTextAreaElement||t instanceof HTMLInputElement))return;const open=e.key,close=V685_OPEN_PAIRS[open],a=t.selectionStart??0,b=t.selectionEnd??a,mod=e.ctrlKey||e.metaKey;
  if(mod&&!e.altKey&&e.key==='/'){e.preventDefault();v685ToggleLineComment(t,a,b);return}
  if(mod&&!e.altKey&&(e.key==='['||e.key===']')){e.preventDefault();v685IndentTextarea(t,a,b,e.key==='[');return}
  if(e.key==='Tab'){
    e.preventDefault();v685IndentTextarea(t,a,b,e.shiftKey);return
  }
  if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    const lineStart=t.value.lastIndexOf('\n',a-1)+1,line=t.value.slice(lineStart,a),ordered=line.match(/^(\s*)(\d+)[.)]\s+(.*)$/),bullet=line.match(/^(\s*)([-+*])\s+(.*)$/),task=line.match(/^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/),quote=line.match(/^(\s*)>\s+(.*)$/);
    let prefix='';if(task)prefix=task[4].trim()?`${task[1]}- [ ] `:'';else if(ordered)prefix=ordered[3].trim()?`${ordered[1]}${Number(ordered[2])+1}. `:'';else if(bullet)prefix=bullet[3].trim()?`${bullet[1]}- `:'';else if(quote)prefix=quote[2].trim()?`${quote[1]}> `:'';
    if(ordered||bullet||task||quote){e.preventDefault();if(!prefix){t.setRangeText('',lineStart,a,'end');const pos=t.selectionStart;t.setRangeText('\n',pos,pos,'end')}else t.setRangeText('\n'+prefix,a,b,'end');v685DispatchInput(t,'insertLineBreak','\n');return}
    const base=(line.match(/^\s*/)?.[0]||''),trimmed=line.trimEnd(),next=t.value[a]||'',pair=trimmed.endsWith('{')?'}':trimmed.endsWith('[')?']':trimmed.endsWith('(')?')':'';
    if(pair){e.preventDefault();const inner=base+'  ';if(next===pair){t.setRangeText('\n'+inner+'\n'+base,a,a,'end');t.setSelectionRange(a+1+inner.length,a+1+inner.length)}else{t.setRangeText('\n'+inner,a,b,'end')}v685DispatchInput(t,'insertLineBreak','\n');return}
  }
  if(e.key==='Backspace'&&a===b&&a>0&&V685_OPEN_PAIRS[t.value[a-1]]===t.value[a]){e.preventDefault();t.setRangeText('',a-1,a+1,'end');v685DispatchInput(t,'deleteContentBackward');return}
  if(V685_CLOSE_PAIRS.has(e.key)&&a===b&&t.value[a]===e.key){
    const lineStart=t.value.lastIndexOf('\n',a-1)+1,before=t.value.slice(lineStart,a);if(/^[ \t]+$/.test(before)){const remove=before.endsWith('  ')?2:before.endsWith('\t')?1:0;if(remove){t.setRangeText('',a-remove,a,'end');t.setSelectionRange(a-remove+1,a-remove+1);e.preventDefault();return}}
    e.preventDefault();t.setSelectionRange(a+1,a+1);return
  }
  if(close&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(a!==b){e.preventDefault();const selected=t.value.slice(a,b);t.setRangeText(open+selected+close,a,b,'select');t.setSelectionRange(a+1,b+1);v685DispatchInput(t,'insertText',open);return}
    const next=t.value[a]||'';if(!next||/\s|[\]\)}>,;:]/.test(next)){e.preventDefault();t.setRangeText(open+close,a,b,'end');t.setSelectionRange(a+1,a+1);v685DispatchInput(t,'insertText',open);return}
  }
}
codeKeys=v685ControlKeydown;

function v685BindSmartEditors(){
  const scope=el.content?.querySelector('#blocks');if(!scope)return;
  for(const t of scope.querySelectorAll('[contenteditable="true"]')){t.classList.add('v685-smart-rich');v685BindPaste(t);if(t.dataset.v685Keys!=='1'){t.dataset.v685Keys='1';t.addEventListener('keydown',v685RichKeydown,true)}}
  for(const t of scope.querySelectorAll('textarea'))v685BindPaste(t)
}
function v686NestedScrollable(start,root,dy){
  let n=start?.nodeType===Node.ELEMENT_NODE?start:start?.parentElement;
  while(n&&n!==root){
    const cs=getComputedStyle(n),scrollable=/(auto|scroll)/.test(cs.overflowY)&&n.scrollHeight>n.clientHeight+1;
    if(scrollable){const max=n.scrollHeight-n.clientHeight;if((dy<0&&n.scrollTop>0)||(dy>0&&n.scrollTop<max-1))return n}
    n=n.parentElement
  }
  return null
}
function v686PageWheel(e){
  if(e.ctrlKey||!el.content||!e.deltaY)return;
  v686CancelPendingPasteRestore();
  if(v686NestedScrollable(e.target,el.content,e.deltaY))return;
  const c=el.content,max=Math.max(0,c.scrollHeight-c.clientHeight);if(max<=0)return;
  let dy=e.deltaY;if(e.deltaMode===1)dy*=32;else if(e.deltaMode===2)dy*=Math.max(120,c.clientHeight*.9);
  const before=c.scrollTop,next=Math.max(0,Math.min(max,before+dy));
  if(next!==before){e.preventDefault();c.scrollTop=next}
}
function v686BindPageScroller(){
  if(!el.content||el.content.dataset.v686Scroller==='1')return;el.content.dataset.v686Scroller='1';
  el.content.addEventListener('wheel',v686PageWheel,{passive:false});
  el.content.addEventListener('pointerdown',v686CancelPendingPasteRestore,{passive:true});
  el.content.addEventListener('touchstart',v686CancelPendingPasteRestore,{passive:true})
}
v686BindPageScroller();
const _v685RenderFileBase=renderFile;
renderFile=async function(path,name){await _v685RenderFileBase(path,name);if(fileEditor?.area)v685BindPaste(fileEditor.area)};
const _v685RenderPageBase=renderPage;
renderPage=function(id){_v685RenderPageBase(id);if(currentView.kind==='page'&&currentView.id===id)v685BindSmartEditors()};

function v685InlineToMd(node){
  if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';if(node.nodeType!==Node.ELEMENT_NODE)return'';const tag=node.tagName.toUpperCase(),inside=[...node.childNodes].map(v685InlineToMd).join('');
  if(tag==='BR')return'\n';if(tag==='STRONG'||tag==='B')return`**${inside}**`;if(tag==='EM'||tag==='I')return`*${inside}*`;if(tag==='S'||tag==='DEL')return`~~${inside}~~`;if(tag==='U')return`<u>${inside}</u>`;if(tag==='CODE'&&node.parentElement?.tagName!=='PRE')return'`'+inside.replace(/`/g,'\\`')+'`';if(tag==='A'){const h=v685SafeHref(node.getAttribute('href'));return h?`[${inside}](${h})`:inside}if(tag==='SPAN'&&node.classList.contains('task-box'))return'';return inside
}
function v685ListToMd(list,indent=0){
  const ordered=list.tagName==='OL',start=ordered?(Number(list.getAttribute('start'))||1):1;let n=0,out=[];
  for(const li of [...list.children].filter(x=>x.tagName==='LI')){
    const task=li.classList.contains('task-item'),box=li.querySelector(':scope > .task-box'),checked=box?.textContent==='☑';let body='';const nested=[];
    for(const c of [...li.childNodes]){if(c.nodeType===Node.ELEMENT_NODE&&(c.tagName==='UL'||c.tagName==='OL'))nested.push(c);else body+=v685InlineToMd(c)}
    body=body.replace(/^\s+|\s+$/g,'').replace(/\n+/g,' ');const marker=task?`- [${checked?'x':' '}] `:ordered?`${start+n}. `:'- ';out.push(' '.repeat(indent)+marker+body);for(const sub of nested)out.push(v685ListToMd(sub,indent+2));n++
  }
  return out.join('\n')
}
function v685TableToMd(table){
  const rows=[...table.querySelectorAll('tr')];if(!rows.length)return'';const cells=rows.map(r=>[...r.children].map(c=>v685InlineToMd(c).replace(/\|/g,'\\|').trim()));const head=cells[0],width=Math.max(...cells.map(r=>r.length));let out='| '+Array.from({length:width},(_,i)=>head[i]||'').join(' | ')+' |\n| '+Array.from({length:width},()=> '---').join(' | ')+' |';for(const row of cells.slice(1))out+='\n| '+Array.from({length:width},(_,i)=>row[i]||'').join(' | ')+' |';return out
}
function v685BlockNodeToMd(node){
  if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';if(node.nodeType!==Node.ELEMENT_NODE)return'';const tag=node.tagName.toUpperCase();
  if(tag==='UL'||tag==='OL')return v685ListToMd(node);if(/^H[1-6]$/.test(tag))return`${'#'.repeat(Number(tag[1]))} ${[...node.childNodes].map(v685InlineToMd).join('').trim()}`;if(tag==='PRE'){const code=node.querySelector('code')||node,lang=code.getAttribute?.('data-language')||'';return`\`\`\`${lang}\n${code.textContent||''}\n\`\`\``}if(tag==='BLOCKQUOTE'){const txt=[...node.childNodes].map(v685BlockNodeToMd).join('\n\n').trim();return txt.split('\n').map(x=>'> '+x).join('\n')}if(tag==='HR')return'---';if(tag==='TABLE')return v685TableToMd(node);if(tag==='P'||tag==='DIV')return[...node.childNodes].map(v685InlineToMd).join('').trimEnd();return v685InlineToMd(node)
}
function v685RichHtmlToMarkdown(html){
  const d=document.createElement('div');d.innerHTML=String(html||'');const parts=[];for(const n of [...d.childNodes]){const x=v685BlockNodeToMd(n).replace(/\n{3,}/g,'\n\n').trim();if(x)parts.push(x)}return parts.join('\n\n').trim()
}
pagePlainText=function(p){
  const out=[];for(const b of p.blocks||[]){if(b.type==='text')out.push(b.text||'');else if(b.type==='richtext')out.push(v685RichHtmlToMarkdown(b.html||''));else if(b.type==='heading')out.push(`${'#'.repeat(Math.max(1,Math.min(6,Number(b.level)||2)))} ${b.text||''}`);else if(b.type==='link')out.push(b.url?`[${b.title||b.url}](${b.url})`:(b.title||''));else if(b.type==='code')out.push(`\`\`\`${b.language&&b.language!=='text'?b.language:''}\n${b.code||''}\n\`\`\``);else if(b.type==='divider')out.push('---')}
  return `${p.title||'İsimsiz'}\n\n${out.filter(Boolean).join('\n\n')}`.replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n')
};


/* ===== Veloria V1 compatibility HF8 - inline media paste/drop + calm page switching ===== */
function v690ClampImageWidth(value){return Math.max(100,Math.min(2400,Math.round(Number(value)||Number(ui?.defaultImageWidth)||280)))}
function v690InlineImageHtml(file,width){
  const node=document.createElement('span'),img=document.createElement('img'),w=v690ClampImageWidth(width);
  node.className='v690-inline-image';node.setAttribute('contenteditable','false');node.dataset.veloriaInlineImage='1';node.dataset.nativePath=String(file?.nativePath||'');node.dataset.name=String(file?.name||baseName(file?.nativePath)||'Görsel');node.dataset.width=String(w);node.style.width=`${w}px`;
  img.alt=String(file?.name||'Görsel');img.draggable=false;node.appendChild(img);return node.outerHTML
}
function v690SerializeRich(target){
  if(!target)return'';const clone=target.cloneNode(true);
  clone.querySelectorAll('[data-v690-insert-marker]').forEach(n=>n.remove());
  for(const node of clone.querySelectorAll('[data-veloria-inline-image]')){
    const w=v690ClampImageWidth(node.dataset.width||parseFloat(node.style.width));node.dataset.width=String(w);node.style.cssText=`width:${w}px`;node.classList.remove('v690-missing');node.removeAttribute('data-v690-hydrated');node.setAttribute('contenteditable','false');
    const img=node.querySelector('img');if(img){img.removeAttribute('src');img.removeAttribute('data-v690-preview');img.setAttribute('draggable','false')}
  }
  return clone.innerHTML
}
function v690PageMeta(p,blockId=''){return{importMode:'copy',forcePhysicalCopy:true,pageId:p.id,pageTitle:p.title,category:cat(p.categoryId)?.name||'Klasör',categoryPath:catPath(p.categoryId),storageRootId:p.nativeStorageRootId||'primary',blockId:blockId||uid('blk')}}
function v690AttachmentBlock(file){return{id:uid('blk'),type:'attachment',name:file.name||baseName(file.nativePath),size:Number(file.size)||0,typeMime:file.type||'',nativePath:file.nativePath||'',relativePath:file.relativePath||'',contentHash:file.contentHash||'',displayMode:isImage(file.name||file.nativePath)?(ui.defaultImageMode||'gallery'):'list',imageSize:'medium',imageWidth:Number(ui.defaultImageWidth)||240,fileDisplay:ui.defaultFileDisplay||'card',showPath:null}}
function v690ImportedIsImage(file){return !!file&&(String(file.type||'').startsWith('image/')||isImage(file.name||file.nativePath||''))}
function v690ClipboardImageFiles(e){
  const out=[],seen=new Set(),clip=e?.clipboardData;if(!clip)return out;
  const add=f=>{if(!f||!(String(f.type||'').startsWith('image/')||isImage(f.name||'')))return;const k=`${f.name||''}|${f.type||''}|${f.size||0}|${f.lastModified||0}`;if(seen.has(k))return;seen.add(k);out.push(f)};
  for(const f of Array.from(clip.files||[]))add(f);for(const item of Array.from(clip.items||[]))if(item.kind==='file')try{add(item.getAsFile())}catch{}
  return out
}
function v690InsertMarker(target,range=null){
  v692HistoryCheckpoint(target);
  if(!target)return null;let r=range||v685RangeInside(target);if(!r){r=document.createRange();r.selectNodeContents(target);r.collapse(false)}
  r.deleteContents();const marker=document.createElement('span');marker.dataset.v690InsertMarker='1';marker.setAttribute('contenteditable','false');marker.setAttribute('aria-hidden','true');r.insertNode(marker);return marker
}
function v690RangeFromPoint(target,x,y){
  let r=null;try{if(document.caretRangeFromPoint)r=document.caretRangeFromPoint(x,y);else if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){r=document.createRange();r.setStart(p.offsetNode,p.offset);r.collapse(true)}}}catch{}
  if(!r||!target.contains(r.commonAncestorContainer)){r=document.createRange();r.selectNodeContents(target);r.collapse(false)}return r
}
function v690SetCaretAfterLast(last,target){
  if(!last||!target)return;const tail=document.createTextNode('\u200B');last.after(tail);const r=document.createRange();r.setStart(tail,tail.nodeValue.length);r.collapse(true);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);try{target.focus({preventScroll:true})}catch{target.focus()}
}
function v690InsertImportedImages(marker,target,files){
  if(!marker?.isConnected||!target)return false;let last=null;for(const file of files){const wrap=document.createElement('div');wrap.innerHTML=v690InlineImageHtml(file);const node=wrap.firstElementChild;if(!node)continue;marker.before(node);marker.before(document.createTextNode(' '));last=node}marker.remove();if(last)v690SetCaretAfterLast(last,target);v685DispatchInput(target,'insertFromPaste',null);return !!last
}
function v690AppendImportedImagesToModel(p,blockId,files){
  const b=p?.blocks?.find(x=>x.id===blockId);if(!b||b.type!=='richtext'||!files.length)return false;const d=document.createElement('div');d.innerHTML=String(b.html||'');if(d.childNodes.length)d.appendChild(document.createTextNode(' '));for(const f of files){const w=document.createElement('div');w.innerHTML=v690InlineImageHtml(f);if(w.firstElementChild)d.appendChild(w.firstElementChild);d.appendChild(document.createTextNode(' '))}b.html=v690SerializeRich(d);touchPage(p);return true
}
async function v690HydrateInlineImages(p){
  if(!p||currentView.kind!=='page'||currentView.id!==p.id)return;const scope=el.content?.querySelector('#blocks');if(!scope)return;
  for(const node of scope.querySelectorAll('[data-veloria-inline-image]')){
    const nativePath=String(node.dataset.nativePath||''),img=node.querySelector('img');if(!nativePath||!img)continue;
    if(node.dataset.v690Hydrated!=='1'){
      node.dataset.v690Hydrated='1';node.addEventListener('pointerup',()=>{const styleWidth=parseFloat(node.style.width),stored=v690ClampImageWidth(node.dataset.width);if(Number.isFinite(styleWidth)&&Math.abs(styleWidth-stored)>.5){const w=v690ClampImageWidth(styleWidth);node.dataset.width=String(w);node.style.width=`${w}px`;const rich=node.closest('[data-edit="rich"]');if(rich)v685DispatchInput(rich,'formatBlock',null)}});
      node.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();openFile(nativePath,baseName(nativePath))})
    }
    if(img.getAttribute('src'))continue;
    try{let pr=previewCache.get(norm(nativePath));if(!pr){pr=await api.previewManagedFile(nativePath);previewCache.set(norm(nativePath),pr)}if(pr?.kind==='image'){img.src=pr.url;img.dataset.v690Preview='1';node.classList.remove('v690-missing')}else node.classList.add('v690-missing')}catch{node.classList.add('v690-missing')}
  }
}
function v690RichBlockId(target){return target?.closest?.('[data-block]')?.dataset?.block||''}
async function v690HandleImagePaste(e,target,files){
  const p=currentView.kind==='page'?page(currentView.id):null,blockId=v690RichBlockId(target);if(!p||!blockId||!api.importDroppedFiles)return false;
  const snap=v685ViewportSnapshot(target),marker=v690InsertMarker(target),pageId=p.id;
  try{
    const res=await api.importDroppedFiles(files,v690PageMeta(p,blockId));const imported=(res?.files||[]).filter(v690ImportedIsImage);await refreshScan();
    if(!imported.length){marker?.remove();const err=(res?.errors||[])[0];if(err)toast(err.error||'Görsel eklenemedi','error');return true}
    if(currentView.kind==='page'&&currentView.id===pageId&&marker?.isConnected){v690InsertImportedImages(marker,target,imported);await v690HydrateInlineImages(p)}else{marker?.remove();v690AppendImportedImagesToModel(p,blockId,imported)}
    const failures=(res?.errors||[]).filter(x=>!x.warning);if(failures.length)toast(`${imported.length} görsel eklendi · ${failures.length} hata`,'warn');
  }catch(err){marker?.remove();toast(err?.message||'Görsel yapıştırılamadı','error')}finally{if(currentView.kind==='page'&&currentView.id===pageId)v685RestoreAfterPaste(target,snap)}return true
}
const _v690TextPasteBase=v685HandlePaste;
v685HandlePaste=function(e){
  const target=e.currentTarget,editable=target?.isContentEditable||target?.getAttribute?.('contenteditable')==='true',files=editable?v690ClipboardImageFiles(e):[];
  if(files.length){e.preventDefault();e.stopPropagation();void v690HandleImagePaste(e,target,files);return}
  return _v690TextPasteBase(e)
};
function v690HasContentAfterCaret(target){
  const r=v685RichSelection(target);if(!r?.collapsed)return false;try{const tail=document.createRange();tail.selectNodeContents(target);tail.setStart(r.endContainer,r.endOffset);const frag=tail.cloneContents(),text=String(frag.textContent||'').replace(/[\u200B\uFEFF]/g,'');if(text.length)return true;return !!frag.querySelector?.('br,[data-veloria-inline-image],img,hr,li,table,pre,blockquote')}catch{return false}
}
function v690UnlockRichHeight(target){target.classList.remove('v690-height-locked');delete target.dataset.v690HeightLocked;target.style.removeProperty('height');target.style.removeProperty('max-height');target.style.removeProperty('overflow-y')}
function v690EnterHeightGuard(e){
  if(e.key==='Enter')v690UnlockRichHeight(e.currentTarget)
}
const _v690BindSmartEditorsBase=v685BindSmartEditors;
v685BindSmartEditors=function(){
  const scope=el.content?.querySelector('#blocks');if(scope)for(const t of scope.querySelectorAll('[contenteditable="true"]'))if(t.dataset.v690HeightGuard!=='1'){t.dataset.v690HeightGuard='1';t.addEventListener('keydown',v690EnterHeightGuard,true)}
  _v690BindSmartEditorsBase();if(currentView.kind==='page'){const p=page(currentView.id);if(p)void v690HydrateInlineImages(p)}
};
function v690DropInsertIndex(p,target){const wrap=target?.closest?.('[data-block]');if(!wrap)return p.blocks.length;const i=Number(wrap.dataset.index);return Number.isFinite(i)?Math.max(0,Math.min(p.blocks.length,i+1)):p.blocks.length}
async function v690HandleExternalDrop(e){
  const files=Array.from(e.dataTransfer?.files||[]);if(!files.length||currentView.kind!=='page'||blockDragId)return;
  e.preventDefault();e.stopPropagation();el.content.classList.remove('v690-drop-ready');const p=page(currentView.id);if(!p||!api.importDroppedFiles)return;
  const rich=e.target?.closest?.('[data-edit="rich"]'),blockId=rich?v690RichBlockId(rich):uid('blk'),insertAt=v690DropInsertIndex(p,e.target),marker=rich?v690InsertMarker(rich,v690RangeFromPoint(rich,e.clientX,e.clientY)):null,pageId=p.id;
  try{
    const res=await api.importDroppedFiles(files,v690PageMeta(p,blockId)),imported=res?.files||[];await refreshScan();if(!imported.length){marker?.remove();const err=(res?.errors||[])[0];if(err)toast(err.error||'Dosya eklenemedi','error');return}
    const images=imported.filter(v690ImportedIsImage),others=imported.filter(f=>!v690ImportedIsImage(f));
    if(rich&&images.length&&currentView.kind==='page'&&currentView.id===pageId&&marker?.isConnected)v690InsertImportedImages(marker,rich,images);else if(rich&&images.length){marker?.remove();v690AppendImportedImagesToModel(p,v690RichBlockId(rich),images)}
    else marker?.remove();
    const newBlocks=[];if(!rich&&images.length)newBlocks.push({id:uid('blk'),type:'richtext',html:images.map(f=>v690InlineImageHtml(f)).join(' ')});newBlocks.push(...others.map(v690AttachmentBlock));
    if(newBlocks.length){p.blocks.splice(insertAt,0,...newBlocks);touchPage(p)}
    if(currentView.kind==='page'&&currentView.id===pageId){if(newBlocks.length)renderPage(p.id);else await v690HydrateInlineImages(p)}
    const failures=(res?.errors||[]).filter(x=>!x.warning);if(failures.length)toast(`${imported.length} dosya eklendi · ${failures.length} hata`,'warn')
  }catch(err){marker?.remove();toast(err?.message||'Dosya eklenemedi','error')}
}
function v690BindExternalDrop(){
  if(!el.content||el.content.dataset.v690ExternalDrop==='1')return;el.content.dataset.v690ExternalDrop='1';
  el.content.addEventListener('dragover',e=>{if(blockDragId||!Array.from(e.dataTransfer?.types||[]).includes('Files'))return;e.preventDefault();e.dataTransfer.dropEffect='copy';el.content.classList.add('v690-drop-ready')});
  el.content.addEventListener('dragleave',e=>{if(!e.relatedTarget||!el.content.contains(e.relatedTarget))el.content.classList.remove('v690-drop-ready')});
  el.content.addEventListener('drop',e=>void v690HandleExternalDrop(e));document.addEventListener('dragend',()=>el.content.classList.remove('v690-drop-ready'))
}
v690BindExternalDrop();
function v690RewriteInlineReferences(html,oldPath,newPath='',remove=false){
  const d=document.createElement('div');d.innerHTML=String(html||'');let changed=false;for(const node of [...d.querySelectorAll('[data-veloria-inline-image]')])if(norm(node.dataset.nativePath||'')===norm(oldPath)){changed=true;if(remove)node.remove();else{node.dataset.nativePath=newPath;node.dataset.name=baseName(newPath);const img=node.querySelector('img');if(img)img.alt=baseName(newPath)}}return{changed,html:changed?v690SerializeRich(d):html}
}
const _v690UpdateAttachmentRefsBase=updateAttachmentRefs;
updateAttachmentRefs=function(oldPath,newPath){_v690UpdateAttachmentRefsBase(oldPath,newPath);for(const p of allWorkspacePages())for(const b of p.blocks||[])if(b.type==='richtext'){const r=v690RewriteInlineReferences(b.html,oldPath,newPath,false);if(r.changed)b.html=r.html}};
const _v690RemoveAttachmentRefsBase=removeAttachmentRefsEverywhere;
removeAttachmentRefsEverywhere=function(filePath){_v690RemoveAttachmentRefsBase(filePath);for(const p of allWorkspacePages())for(const b of p.blocks||[])if(b.type==='richtext'){const r=v690RewriteInlineReferences(b.html,filePath,'',true);if(r.changed)b.html=r.html}};



/* ===== Veloria V1 compatibility HF9 - Windows fsync compatibility + inline image controls ===== */
const V691_IMAGE_ALIGNS=new Set(['inline','left','center','right']);
function v691NormalizeAlign(value){value=String(value||'inline').toLowerCase();return V691_IMAGE_ALIGNS.has(value)?value:'inline'}

// Preserve HF8's safe serialization rules while also persisting alignment and
// stripping transient selection state from the saved note HTML.
const _v691SerializeRichBase=v690SerializeRich;
v690SerializeRich=function(target){
  const html=_v691SerializeRichBase(target),box=document.createElement('div');box.innerHTML=html;
  for(const node of box.querySelectorAll('[data-veloria-inline-image]')){
    node.dataset.align=v691NormalizeAlign(node.dataset.align);node.classList.remove('v691-selected');
    const w=v690ClampImageWidth(node.dataset.width||parseFloat(node.style.width));node.dataset.width=String(w);node.style.cssText=`width:${w}px`;
  }
  return box.innerHTML
};
const _v691InlineImageHtmlBase=v690InlineImageHtml;
v690InlineImageHtml=function(file,width,align='inline'){
  const box=document.createElement('div');box.innerHTML=_v691InlineImageHtmlBase(file,width);const node=box.firstElementChild;if(node)node.dataset.align=v691NormalizeAlign(align);return node?node.outerHTML:''
};

let v691ActiveInlineImage=null;
function v691ImageNode(){return v691ActiveInlineImage?.isConnected?v691ActiveInlineImage:null}
function v691ImageRich(node=v691ImageNode()){return node?.closest?.('[data-edit="rich"]')||null}
function v691CommitImage(node=v691ImageNode()){
  const rich=v691ImageRich(node);if(!node||!rich)return false;
  node.dataset.align=v691NormalizeAlign(node.dataset.align);
  const w=v690ClampImageWidth(node.dataset.width||parseFloat(node.style.width));node.dataset.width=String(w);node.style.width=`${w}px`;
  v685DispatchInput(rich,'formatBlock',null);return true
}
function v691SelectImage(node){
  for(const old of el.content?.querySelectorAll?.('.v690-inline-image.v691-selected')||[])if(old!==node)old.classList.remove('v691-selected');
  if(node){node.classList.add('v691-selected');v691ActiveInlineImage=node}else v691ActiveInlineImage=null
}
function v691ImageWidth(node=v691ImageNode()){return v690ClampImageWidth(node?.dataset?.width||parseFloat(node?.style?.width))}
function v691FitWidth(node=v691ImageNode()){
  const rich=v691ImageRich(node),raw=Math.floor((rich?.clientWidth||720)-22);return v690ClampImageWidth(raw)
}
function v691SizeLabel(width){if(width<=280)return'Küçük';if(width<=500)return'Orta';if(width<=760)return'Büyük';return'Geniş'}
function v691AlignLabel(value){return({inline:'Satır içi',left:'Sola sar',center:'Ortala',right:'Sağa sar'})[v691NormalizeAlign(value)]}
function v691MenuButton(label,action,active=false){return `<button type="button" class="v691-menu-tile ${active?'active':''}" onclick="${action}"><span>${label}</span>${active?'<b>✓</b>':''}</button>`}
function v691ImageMenuHtml(node){
  const align=v691NormalizeAlign(node?.dataset?.align),width=v691ImageWidth(node),fit=v691FitWidth(node),name=String(node?.dataset?.name||baseName(node?.dataset?.nativePath)||'Görsel');
  const near=(n)=>Math.abs(width-n)<=24;
  return `<div class="v691-menu-head"><strong>${esc(name)}</strong><small>${v691AlignLabel(align)} · ${v691SizeLabel(width)} · ${width}px</small></div>
  <div class="v691-menu-label">Hizalama</div><div class="v691-menu-grid">
    ${v691MenuButton('Satır içi',`v691SetImageAlign('inline')`,align==='inline')}
    ${v691MenuButton('Sola sar',`v691SetImageAlign('left')`,align==='left')}
    ${v691MenuButton('Ortala',`v691SetImageAlign('center')`,align==='center')}
    ${v691MenuButton('Sağa sar',`v691SetImageAlign('right')`,align==='right')}
  </div>
  <div class="v691-menu-label">Boyut</div><div class="v691-menu-grid">
    ${v691MenuButton('Küçük',`v691SetImageSize(240)`,near(240))}
    ${v691MenuButton('Orta',`v691SetImageSize(420)`,near(420))}
    ${v691MenuButton('Büyük',`v691SetImageSize(680)`,near(680))}
    ${v691MenuButton('Nota sığdır',`v691SetImageSize(${fit})`,near(fit))}
  </div><hr>
  <button type="button" onclick="v691OpenImage()"><span class="ctx-icon">↗</span><span>Görseli aç</span></button>
  <button type="button" onclick="v691RevealImage()"><span class="ctx-icon">⌕</span><span>Windows'ta göster</span></button>
  <button type="button" onclick="v691CopyImagePath()"><span class="ctx-icon">⧉</span><span>Dosya yolunu kopyala</span></button><hr>
  <button type="button" class="danger" onclick="v691RemoveImage()"><span class="ctx-icon">⌫</span><span>Notadan kaldır</span></button>`
}
function v691OpenImageContext(e,node){
  e.preventDefault();e.stopPropagation();v691SelectImage(node);showContext(e.clientX,e.clientY,v691ImageMenuHtml(node))
}
window.v691SetImageAlign=(value)=>{const node=v691ImageNode();if(!node)return closeContext();node.dataset.align=v691NormalizeAlign(value);v691CommitImage(node);closeContext();toast(`Görsel: ${v691AlignLabel(node.dataset.align)}`)};
window.v691SetImageSize=(value)=>{const node=v691ImageNode();if(!node)return closeContext();const w=v690ClampImageWidth(value);node.dataset.width=String(w);node.style.width=`${w}px`;v691CommitImage(node);closeContext();toast(`Görsel genişliği: ${w}px`)};
window.v691OpenImage=()=>{const node=v691ImageNode(),pth=String(node?.dataset?.nativePath||'');closeContext();if(pth)api.openManagedFile(pth).catch(e=>toast(e?.message||'Görsel açılamadı','error'))};
window.v691RevealImage=()=>{const node=v691ImageNode(),pth=String(node?.dataset?.nativePath||'');closeContext();if(pth)api.revealManagedFile(pth).catch(e=>toast(e?.message||'Dosya gösterilemedi','error'))};
window.v691CopyImagePath=()=>{const node=v691ImageNode(),pth=String(node?.dataset?.nativePath||'');closeContext();if(!pth)return;navigator.clipboard.writeText(pth).then(()=>toast('Dosya yolu kopyalandı')).catch(()=>toast('Dosya yolu kopyalanamadı','error'))};
window.v691RemoveImage=()=>{const node=v691ImageNode();if(!node)return closeContext();const rich=v691ImageRich(node);node.remove();v691ActiveInlineImage=null;closeContext();if(rich){v685DispatchInput(rich,'deleteContent',null);try{rich.focus({preventScroll:true})}catch{rich.focus()}}toast('Görsel notadan kaldırıldı; fiziksel dosya korunuyor')};

function v691EnhanceInlineImages(){
  const scope=el.content?.querySelector('#blocks');if(!scope)return;
  for(const node of scope.querySelectorAll('[data-veloria-inline-image]')){
    node.dataset.align=v691NormalizeAlign(node.dataset.align);
    if(node.dataset.v691Enhanced==='1')continue;node.dataset.v691Enhanced='1';
    node.addEventListener('contextmenu',e=>v691OpenImageContext(e,node));
    node.addEventListener('click',e=>{e.stopPropagation();v691SelectImage(node)});
    node.addEventListener('keydown',e=>{if((e.key==='Delete'||e.key==='Backspace')&&node.classList.contains('v691-selected')){e.preventDefault();window.v691RemoveImage()}});
    node.setAttribute('tabindex','0');node.setAttribute('role','img');
    node.setAttribute('aria-label',`${node.dataset.name||'Görsel'}; sağ tık ile hizalama ve boyut menüsü`)
  }
}
const _v691HydrateInlineImagesBase=v690HydrateInlineImages;
v690HydrateInlineImages=async function(p){await _v691HydrateInlineImagesBase(p);v691EnhanceInlineImages()};

// Clicking elsewhere clears the image selection. Delete/Backspace removes only
// a selected image and never deletes its physical copy from Veloria storage.
el.content?.addEventListener('pointerdown',e=>{if(!e.target?.closest?.('[data-veloria-inline-image]'))v691SelectImage(null)},true);
document.addEventListener('keydown',e=>{
  const node=v691ImageNode();if(!node||!node.classList.contains('v691-selected')||!['Delete','Backspace'].includes(e.key))return;
  const active=document.activeElement;if(active?.matches?.('input,textarea,select'))return;
  e.preventDefault();e.stopPropagation();window.v691RemoveImage()
},true);




/* ===== Veloria V1 compatibility HF10 - rich inline files, history, drag/resize, previews ===== */
const V692_HISTORY_LIMIT=120;
const v692History=new Map();
let v692ApplyingHistory=false;
let v692DragNode=null;
let v692ActiveInlineFile=null;

// Never persist event-binding flags or live resize UI into note HTML.
// Re-rendered inline media must be enhanced again so drag/resize/context actions keep working.
const _v692SerializeRichBase=v690SerializeRich;
v690SerializeRich=function(target){
  const html=_v692SerializeRichBase(target),box=document.createElement('div');box.innerHTML=html;
  box.querySelectorAll('.v692-resize-handle').forEach(n=>n.remove());
  for(const node of box.querySelectorAll('[data-veloria-inline-image],[data-veloria-inline-file]')){
    node.removeAttribute('data-v692-drag');node.removeAttribute('data-v692-enhanced');node.removeAttribute('draggable');node.removeAttribute('title');node.setAttribute('contenteditable','false');
  }
  return box.innerHTML
};

function v692BlockIdForRich(rich){return rich?.closest?.('[data-block]')?.dataset?.block||''}
function v11Selection(rich){
  const sel=getSelection();if(!sel?.rangeCount||!rich.contains(sel.anchorNode)||!rich.contains(sel.focusNode))return null;
  const point=(node,offset)=>{const path=[];while(node!==rich){path.unshift([...node.parentNode.childNodes].indexOf(node));node=node.parentNode}return{path,offset}};
  return{anchor:point(sel.anchorNode,sel.anchorOffset),focus:point(sel.focusNode,sel.focusOffset)}
}
function v11RestoreSelection(rich,saved){
  if(!saved)return;try{const point=p=>{let node=rich;for(const i of p.path)node=node.childNodes[Math.min(i,node.childNodes.length-1)]||node;return[node,Math.min(p.offset,node.nodeType===Node.TEXT_NODE?node.length:node.childNodes.length)]};const a=point(saved.anchor),f=point(saved.focus);rich.focus({preventScroll:true});getSelection().setBaseAndExtent(a[0],a[1],f[0],f[1])}catch{v692CaretEnd(rich)}
}
function v11Snapshot(rich){return{html:v690SerializeRich(rich),selection:v11Selection(rich)}}
function v692HistoryState(rich){const id=v692BlockIdForRich(rich);if(!id)return null;let h=v692History.get(id);if(!h){h={undo:[],redo:[],current:v11Snapshot(rich),pending:false};v692History.set(id,h)}return h}
function v692HistoryCheckpoint(rich){if(v692ApplyingHistory||!rich)return;const h=v692HistoryState(rich);if(!h)return;const snap=v11Snapshot(rich);if(h.undo.at(-1)?.html!==snap.html)h.undo.push(snap);else h.undo[h.undo.length-1]=snap;if(h.undo.length>V692_HISTORY_LIMIT)h.undo.shift();h.pending=true}
function v692CaretEnd(rich){try{const r=document.createRange();r.selectNodeContents(rich);r.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);rich.focus({preventScroll:true})}catch{try{rich.focus()}catch{}}}
function v692SyncRich(rich,inputType='historyUndo'){
  if(!rich)return;v692ApplyingHistory=true;try{v685DispatchInput(rich,inputType,null)}finally{v692ApplyingHistory=false}
  const p=currentView.kind==='page'?page(currentView.id):null;if(p)void v690HydrateInlineImages(p)
}
function v11ApplyHistory(rich,from,to,type){const h=v692HistoryState(rich);if(!h)return false;const current=v11Snapshot(rich);let snap;while(h[from].length){const candidate=h[from].pop();if(candidate.html!==current.html){snap=candidate;break}}if(!snap)return false;h[to].push(current);v692ApplyingHistory=true;try{rich.innerHTML=snap.html;v11RestoreSelection(rich,snap.selection)}finally{v692ApplyingHistory=false}v692SyncRich(rich,type);h.current=v11Snapshot(rich);h.pending=false;return true}
function v692UndoRich(rich){return v11ApplyHistory(rich,'undo','redo','historyUndo')}
function v692RedoRich(rich){return v11ApplyHistory(rich,'redo','undo','historyRedo')}
function v692BindHistoryEditors(){
  const scope=el.content?.querySelector('#blocks');if(!scope)return;
  for(const rich of scope.querySelectorAll('[data-edit="rich"]')){
    rich.classList.add('v692-nowrap');
    if(rich.dataset.v692History==='1')continue;rich.dataset.v692History='1';
    v111BindClipboard(rich);
    v111NormalizeParagraphs(rich);v11LinkifyRich(rich);v692HistoryState(rich);
    rich.addEventListener('beforeinput',e=>{if(v692ApplyingHistory)return;if(e.inputType==='historyUndo'||e.inputType==='historyRedo'){e.preventDefault();e.stopImmediatePropagation();if(e.inputType==='historyUndo')v692UndoRich(rich);else v692RedoRich(rich);return}v692HistoryCheckpoint(rich)},true);
    rich.addEventListener('input',()=>{if(v692ApplyingHistory)return;v111NormalizeParagraphs(rich);v11LinkifyRich(rich);const h=v692HistoryState(rich),snap=v11Snapshot(rich);if(h.current.html!==snap.html){if(!h.pending&&h.undo.at(-1)?.html!==h.current.html)h.undo.push(h.current);if(h.undo.length>V692_HISTORY_LIMIT)h.undo.shift();h.redo.length=0}h.current=snap;h.pending=false},true)
  }
}
const _v692BindSmartBase=v685BindSmartEditors;
v685BindSmartEditors=function(){_v692BindSmartBase();v692BindHistoryEditors()};
document.addEventListener('keydown',e=>{
  const cmd=e.ctrlKey||e.metaKey;if(!cmd)return;const rich=e.target?.closest?.('[data-edit="rich"]');if(!rich)return;
  const key=String(e.key||'').toLowerCase();if(key==='z'&&!e.shiftKey){e.preventDefault();e.stopPropagation();if(!v692UndoRich(rich))toast('Geri al\u0131nacak i\u015flem yok','warn');return}
  if(key==='y'||(key==='z'&&e.shiftKey)){e.preventDefault();e.stopPropagation();if(!v692RedoRich(rich))toast('\u0130leri al\u0131nacak i\u015flem yok','warn')}
},true);

function v692IsFolder(file){return file?.kind==='folder'||String(file?.type||'').toLowerCase()==='inode/directory'}
function v692InlineFileHtml(file){
  const node=document.createElement('span');node.className='v692-inline-file';node.setAttribute('contenteditable','false');node.dataset.veloriaInlineFile='1';node.dataset.nativePath=String(file?.nativePath||'');node.dataset.name=String(file?.name||baseName(file?.nativePath)||'Dosya');node.dataset.kind=v692IsFolder(file)?'folder':'file';
  const glyph=document.createElement('span');glyph.className='v692-inline-file-glyph';glyph.textContent=v692IsFolder(file)?'DIR':iconForFile(node.dataset.name);
  const copy=document.createElement('span');copy.className='v692-inline-file-copy';const strong=document.createElement('strong');strong.textContent=node.dataset.name;const small=document.createElement('small');small.textContent=String(file?.relativePath||file?.nativePath||'');copy.append(strong,small);
  const open=document.createElement('span');open.className='v692-inline-open';open.textContent='A\u00e7';node.append(glyph,copy,open);return node.outerHTML
}
function v692InlineNodeHtml(file){return v690ImportedIsImage(file)?v690InlineImageHtml(file):v692InlineFileHtml(file)}
function v692InsertImportedNodes(marker,target,files){
  if(!marker?.isConnected||!target)return false;let last=null;
  for(const file of files){const box=document.createElement('div');box.innerHTML=v692InlineNodeHtml(file);const node=box.firstElementChild;if(!node)continue;marker.before(node);marker.before(document.createTextNode(' '));last=node}
  marker.remove();if(last)v690SetCaretAfterLast(last,target);v685DispatchInput(target,'insertFromPaste',null);return !!last
}
function v692AppendImportedToModel(p,blockId,files){const b=p?.blocks?.find(x=>x.id===blockId);if(!b||b.type!=='richtext'||!files.length)return false;const d=document.createElement('div');d.innerHTML=String(b.html||'');if(d.childNodes.length)d.appendChild(document.createTextNode(' '));for(const f of files){const w=document.createElement('div');w.innerHTML=v692InlineNodeHtml(f);if(w.firstElementChild)d.appendChild(w.firstElementChild);d.appendChild(document.createTextNode(' '))}b.html=v690SerializeRich(d);touchPage(p);return true}

function v692ClipboardFiles(e){const out=[],seen=new Set(),clip=e?.clipboardData;if(!clip)return out;const add=f=>{if(!f)return;const k=`${f.name||''}|${f.type||''}|${f.size||0}|${f.lastModified||0}`;if(seen.has(k))return;seen.add(k);out.push(f)};for(const f of Array.from(clip.files||[]))add(f);for(const item of Array.from(clip.items||[]))if(item.kind==='file')try{add(item.getAsFile())}catch{}return out}
const _v692PasteBase=v685HandlePaste;
v685HandlePaste=function(e){const target=e.currentTarget,editable=target?.isContentEditable||target?.getAttribute?.('contenteditable')==='true',files=editable?v692ClipboardFiles(e):[];if(files.length){e.preventDefault();e.stopPropagation();const p=currentView.kind==='page'?page(currentView.id):null,blockId=v690RichBlockId(target);if(!p||!blockId)return;const snap=v685ViewportSnapshot(target),marker=v690InsertMarker(target),pageId=p.id;v692HistoryCheckpoint(target);void (async()=>{try{const res=await api.importDroppedFiles(files,v690PageMeta(p,blockId));const imported=res?.files||[];await refreshScan();if(!imported.length){marker?.remove();const err=(res?.errors||[])[0];if(err)toast(err.error||'Dosya eklenemedi','error');return}if(currentView.kind==='page'&&currentView.id===pageId&&marker?.isConnected){v692InsertImportedNodes(marker,target,imported);await v690HydrateInlineImages(p)}else{marker?.remove();v692AppendImportedToModel(p,blockId,imported)}const failures=(res?.errors||[]).filter(x=>!x.warning);if(failures.length)toast(`${imported.length} dosya eklendi \u00b7 ${failures.length} hata`,'warn')}catch(err){marker?.remove();toast(err?.message||'Dosya yap\u0131\u015ft\u0131r\u0131lamad\u0131','error')}finally{if(currentView.kind==='page'&&currentView.id===pageId)v685RestoreAfterPaste(target,snap)}})();return}return _v692PasteBase(e)};

v690HandleExternalDrop=async function(e){
  const files=Array.from(e.dataTransfer?.files||[]);if(!files.length||currentView.kind!=='page'||blockDragId)return;
  e.preventDefault();e.stopPropagation();el.content.classList.remove('v690-drop-ready');const p=page(currentView.id);if(!p||!api.importDroppedFiles)return;
  const rich=e.target?.closest?.('[data-edit="rich"]'),blockId=rich?v690RichBlockId(rich):uid('blk'),insertAt=v690DropInsertIndex(p,e.target),marker=rich?v690InsertMarker(rich,v690RangeFromPoint(rich,e.clientX,e.clientY)):null,pageId=p.id;if(rich)v692HistoryCheckpoint(rich);
  try{
    const res=await api.importDroppedFiles(files,v690PageMeta(p,blockId)),imported=res?.files||[];await refreshScan();if(!imported.length){marker?.remove();const err=(res?.errors||[])[0];if(err)toast(err.error||'Dosya eklenemedi','error');return}
    if(rich&&currentView.kind==='page'&&currentView.id===pageId&&marker?.isConnected)v692InsertImportedNodes(marker,rich,imported);else if(rich){marker?.remove();v692AppendImportedToModel(p,v690RichBlockId(rich),imported)}else{marker?.remove();p.blocks.splice(insertAt,0,{id:uid('blk'),type:'richtext',html:imported.map(v692InlineNodeHtml).join(' ')});touchPage(p)}
    if(currentView.kind==='page'&&currentView.id===pageId){if(!rich)renderPage(p.id);else await v690HydrateInlineImages(p)}const failures=(res?.errors||[]).filter(x=>!x.warning);if(failures.length)toast(`${imported.length} \u00f6\u011fe eklendi \u00b7 ${failures.length} hata`,'warn')
  }catch(err){marker?.remove();toast(err?.message||'Dosya eklenemedi','error')}
};

window.v68InsertFile=async index=>{closeModal();const mode=await choiceModal('Dosya nas\u0131l eklensin?',[{value:'copy',title:'Kopyala',sub:'Orijinal dosyay\u0131 yerinde b\u0131rak.'},{value:'move',title:'Ta\u015f\u0131',sub:'Kaynak konumdan kald\u0131r ve Veloria\u2019ya ta\u015f\u0131.'}]);if(!mode)return;const p=page(currentView.id);if(!p)return;const blockId=uid('blk');try{const r=await api.pickAndMoveFiles({importMode:mode,pageId:p.id,pageTitle:p.title,category:cat(p.categoryId)?.name||'Klas\u00f6r',categoryPath:catPath(p.categoryId),storageRootId:p.nativeStorageRootId||'primary',blockId});if(r?.canceled)return;const imported=r.files||[];if(imported.length){p.blocks.splice(index,0,{id:uid('blk'),type:'richtext',html:imported.map(v692InlineNodeHtml).join(' ')});touchPage(p)}await refreshScan();if(currentView.kind==='page'&&currentView.id===p.id)renderPage(p.id);const errs=(r.errors||[]).filter(x=>!x.warning);if(errs.length)toast(`${imported.length} dosya eklendi \u00b7 ${errs.length} ba\u015far\u0131s\u0131z`,'error');else toast(`${imported.length} dosya sohbet i\u00e7ine eklendi`)}catch(e){toast(e?.message||'Dosya eklenemedi','error')}};

function v692OpenInlinePath(node){const pth=String(node?.dataset?.nativePath||'');if(!pth)return;openFile(pth,node?.dataset?.name||baseName(pth))}
function v692InlineMenuHtml(node){const pth=String(node?.dataset?.nativePath||''),name=String(node?.dataset?.name||baseName(pth)||'Dosya');return `<div class="v691-menu-head"><strong>${esc(name)}</strong><small>${esc(pth)}</small></div><button type="button" onclick="v692OpenInlineActive()"><span class="ctx-icon">\u2197</span><span>Veloria\u2019da a\u00e7 / \u00f6nizle</span></button><button type="button" onclick="v692RevealInlineActive()"><span class="ctx-icon">\u2315</span><span>Windows\u2019ta g\u00f6ster</span></button><button type="button" onclick="v692CopyInlinePath()"><span class="ctx-icon">\u29c9</span><span>Dosya yolunu kopyala</span></button><hr><button type="button" class="danger" onclick="v692RemoveInlineActive()"><span class="ctx-icon">\u232b</span><span>Notadan kald\u0131r</span></button>`}
window.v692OpenInlineActive=()=>{const node=v692ActiveInlineFile;closeContext();if(node)v692OpenInlinePath(node)};
window.v692RevealInlineActive=()=>{const node=v692ActiveInlineFile,pth=String(node?.dataset?.nativePath||'');closeContext();if(pth)api.revealManagedFile(pth).catch(e=>toast(e?.message||'G\u00f6sterilemedi','error'))};
window.v692CopyInlinePath=()=>{const pth=String(v692ActiveInlineFile?.dataset?.nativePath||'');closeContext();if(pth)navigator.clipboard.writeText(pth).then(()=>toast('Dosya yolu kopyaland\u0131')).catch(()=>{})};
window.v692RemoveInlineActive=()=>{const node=v692ActiveInlineFile;if(!node)return closeContext();const rich=node.closest('[data-edit="rich"]');v692HistoryCheckpoint(rich);node.remove();v692ActiveInlineFile=null;closeContext();v685DispatchInput(rich,'deleteContent',null)};

function v692PrepareDraggable(node){if(!node||node.dataset.v692Drag==='1')return;node.dataset.v692Drag='1';node.draggable=true;node.addEventListener('dragstart',e=>{v692DragNode=node;e.stopPropagation();try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-veloria-inline','1')}catch{}});node.addEventListener('dragend',()=>{v692DragNode=null})}
function v692AttachImageResize(node){if(!node||node.querySelector(':scope > .v692-resize-handle'))return;const h=document.createElement('span');h.className='v692-resize-handle';h.setAttribute('contenteditable','false');h.title='Boyutland\u0131r';node.appendChild(h);h.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const rich=node.closest('[data-edit="rich"]');v692HistoryCheckpoint(rich);const startX=e.clientX,startW=node.getBoundingClientRect().width;h.setPointerCapture?.(e.pointerId);const move=ev=>{const w=v690ClampImageWidth(startW+(ev.clientX-startX));node.dataset.width=String(w);node.style.width=`${w}px`};const up=ev=>{h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up);v691CommitImage(node)};h.addEventListener('pointermove',move);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up)})}
function v692EnhanceInlineMedia(){
  const scope=el.content?.querySelector('#blocks');if(!scope)return;
  for(const node of scope.querySelectorAll('[data-veloria-inline-image]')){v692PrepareDraggable(node);v692AttachImageResize(node);node.title='S\u00fcr\u00fckle: ta\u015f\u0131 \u00b7 Sa\u011f alt: boyut \u00b7 \u00c7ift t\u0131k: Veloria \u00f6nizleme'}
  for(const node of scope.querySelectorAll('[data-veloria-inline-file]')){if(node.dataset.v692Enhanced!=='1'){node.dataset.v692Enhanced='1';node.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();v692ActiveInlineFile=node;showContext(e.clientX,e.clientY,v692InlineMenuHtml(node))});node.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();v692OpenInlinePath(node)});node.querySelector('.v692-inline-open')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();v692OpenInlinePath(node)})}v692PrepareDraggable(node)}
}
const _v692HydrateBase=v690HydrateInlineImages;
v690HydrateInlineImages=async function(p){await _v692HydrateBase(p);v692EnhanceInlineMedia()};

el.content?.addEventListener('dragover',e=>{if(!v692DragNode)return;const rich=e.target?.closest?.('[data-edit="rich"]');if(!rich)return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move'},true);
el.content?.addEventListener('drop',e=>{if(!v692DragNode)return;const target=e.target?.closest?.('[data-edit="rich"]');if(!target)return;e.preventDefault();e.stopPropagation();const node=v692DragNode,old=node.closest('[data-edit="rich"]');const r=v690RangeFromPoint(target,e.clientX,e.clientY);if(node.contains(r.commonAncestorContainer))return;v692HistoryCheckpoint(old);if(target!==old)v692HistoryCheckpoint(target);try{r.insertNode(node);node.after(document.createTextNode(' '));v685DispatchInput(old,'insertFromDrop',null);if(target!==old)v685DispatchInput(target,'insertFromDrop',null);const p=currentView.kind==='page'?page(currentView.id):null;if(p)void v690HydrateInlineImages(p)}finally{v692DragNode=null}},true);

// Rebind HF9 image actions so every edit participates in Ctrl+Z/Ctrl+Y.
window.v691SetImageAlign=(value)=>{const node=v691ImageNode();if(!node)return closeContext();const rich=v691ImageRich(node);v692HistoryCheckpoint(rich);node.dataset.align=v691NormalizeAlign(value);v691CommitImage(node);closeContext();toast(`G\u00f6rsel: ${v691AlignLabel(node.dataset.align)}`)};
window.v691SetImageSize=(value)=>{const node=v691ImageNode();if(!node)return closeContext();const rich=v691ImageRich(node);v692HistoryCheckpoint(rich);const w=v690ClampImageWidth(value);node.dataset.width=String(w);node.style.width=`${w}px`;v691CommitImage(node);closeContext();toast(`G\u00f6rsel geni\u015fli\u011fi: ${w}px`)};
window.v691OpenImage=()=>{const node=v691ImageNode(),pth=String(node?.dataset?.nativePath||'');closeContext();if(pth)openFile(pth,node?.dataset?.name||baseName(pth))};
window.v691RemoveImage=()=>{const node=v691ImageNode();if(!node)return closeContext();const rich=v691ImageRich(node);v692HistoryCheckpoint(rich);node.remove();v691ActiveInlineImage=null;closeContext();if(rich){v685DispatchInput(rich,'deleteContent',null);try{rich.focus({preventScroll:true})}catch{rich.focus()}}toast('G\u00f6rsel notadan kald\u0131r\u0131ld\u0131; fiziksel dosya korunuyor')};

function v692ArchiveRows(entries){return (entries||[]).map((x,i)=>`<div class="v692-browser-row ${x.isDirectory?'is-folder':''}" data-v692-archive-row="${i}"><span class="v692-browser-icon">${x.isDirectory?'DIR':esc(extOf(x.name||x.path||''))}</span><span class="v692-browser-copy"><strong>${esc(x.path||x.name||'')}</strong><small>${x.isDirectory?'Klas\u00f6r':fmtBytes(x.size||0)}</small></span></div>`).join('')}
function v692FolderRows(entries){return (entries||[]).map((x,i)=>`<button class="v692-browser-row ${x.isDirectory?'is-folder':''}" data-v692-folder-row="${i}" onclick="v68FileOpen(${js(x.nativePath||'')})"><span class="v692-browser-icon">${x.isDirectory?'DIR':esc(extOf(x.name||''))}</span><span class="v692-browser-copy"><strong>${esc(x.path||x.name||'')}</strong><small>${x.isDirectory?'Klas\u00f6r':fmtBytes(x.size||0)}</small></span><span class="v692-browser-open">A\u00e7</span></button>`).join('')}
function v692BindBrowserFilter(inputId,rowSelector){const input=document.getElementById(inputId);if(!input)return;input.addEventListener('input',()=>{const q=input.value.toLocaleLowerCase('tr');document.querySelectorAll(rowSelector).forEach(row=>row.hidden=!!q&&!row.textContent.toLocaleLowerCase('tr').includes(q))})}
function v692InitDrawPreview(){const img=document.getElementById('v692DrawImage'),canvas=document.getElementById('v692DrawCanvas');if(!img||!canvas)return;const ctx=canvas.getContext('2d');let drawing=false,last=null;const fit=()=>{const r=img.getBoundingClientRect();if(!r.width||!r.height)return;const old=document.createElement('canvas');old.width=canvas.width;old.height=canvas.height;if(old.width&&old.height)old.getContext('2d').drawImage(canvas,0,0);canvas.width=Math.max(1,Math.round(r.width));canvas.height=Math.max(1,Math.round(r.height));canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';if(old.width&&old.height)ctx.drawImage(old,0,0,old.width,old.height,0,0,canvas.width,canvas.height)};img.addEventListener('load',fit,{once:true});if(img.complete)fit();const color=()=>{const r=Math.max(0,Math.min(255,Number(document.getElementById('v692R')?.value)||0)),g=Math.max(0,Math.min(255,Number(document.getElementById('v692G')?.value)||0)),b=Math.max(0,Math.min(255,Number(document.getElementById('v692B')?.value)||0));return `rgb(${r},${g},${b})`};const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)}};canvas.addEventListener('pointerdown',e=>{drawing=true;last=point(e);canvas.setPointerCapture?.(e.pointerId);e.preventDefault()});canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);ctx.strokeStyle=color();ctx.lineWidth=Math.max(2,canvas.width/450*2.2);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;e.preventDefault()});const stop=()=>{drawing=false;last=null};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);window.v692ClearDrawing=()=>ctx.clearRect(0,0,canvas.width,canvas.height);window.v692ColorFromPicker=()=>{const hex=document.getElementById('v692Color')?.value||'#ff0000',n=parseInt(hex.slice(1),16);document.getElementById('v692R').value=(n>>16)&255;document.getElementById('v692G').value=(n>>8)&255;document.getElementById('v692B').value=n&255};window.v692RgbToPicker=()=>{const vals=['v692R','v692G','v692B'].map(id=>Math.max(0,Math.min(255,Number(document.getElementById(id)?.value)||0)));document.getElementById('v692Color').value='#'+vals.map(n=>n.toString(16).padStart(2,'0')).join('')}}

const _v692RenderFileBase=renderFile;
renderFile=async function(path,name){
  if(externalWatchTimer)clearInterval(externalWatchTimer);fileEditor=null;el.statusContext.textContent=name;el.statusDetails.textContent='';
  if(!isText(name)){
    try{const p=await api.previewManagedFile(path);if(!v11StillViewingFile(path))return;
      if(p.kind==='image'){el.content.innerHTML=`<div class="file-editor"><div class="editor-head"><strong>${esc(name)}</strong><span class="grow"></span><button class="tool" onclick="v68FileReveal(${js(path)})">Windows\u2019ta g\u00f6ster</button><button class="tool" onclick="v68CopyPath(${js(path)})">Yolu kopyala</button><button class="tool" onclick="v68OpenExternalFile(${js(path)})">Harici a\u00e7</button></div><div class="v692-draw-toolbar"><strong>Kalem</strong><input id="v692Color" type="color" value="#ff0000" oninput="v692ColorFromPicker()"><label>R <input id="v692R" type="number" min="0" max="255" value="255" oninput="v692RgbToPicker()"></label><label>G <input id="v692G" type="number" min="0" max="255" value="0" oninput="v692RgbToPicker()"></label><label>B <input id="v692B" type="number" min="0" max="255" value="0" oninput="v692RgbToPicker()"></label><button class="tool" onclick="v692ClearDrawing()">\u00c7izimi temizle</button><span>\u00c7izim bu \u00f6nizleme oturumu i\u00e7in ge\u00e7icidir.</span></div><div class="v692-draw-stage"><div class="v692-draw-inner"><img id="v692DrawImage" src="${attr(p.url)}"><canvas id="v692DrawCanvas"></canvas></div></div></div>`;v692InitDrawPreview();el.statusDetails.textContent=`G\u00f6rsel \u00b7 ${fmtBytes(p.size||0)}`;return}
      if(p.kind==='archive'){el.content.innerHTML=`<div class="file-editor"><div class="editor-head"><strong>${esc(name)}</strong><span class="grow"></span><button class="tool" onclick="v68FileReveal(${js(path)})">Windows\u2019ta g\u00f6ster</button><button class="tool" onclick="v68OpenExternalFile(${js(path)})">Harici a\u00e7</button></div><div class="v692-browser"><div class="v692-browser-head"><input id="v692ArchiveSearch" placeholder="Ar\u015fiv i\u00e7inde ara\u2026"><span>${(p.entries||[]).length} \u00f6\u011fe${p.truncated?' +':''}</span></div>${p.warning?`<div class="v692-browser-warning">${esc(p.warning)}</div>`:''}<div class="v692-browser-list">${v692ArchiveRows(p.entries)}</div></div></div>`;v692BindBrowserFilter('v692ArchiveSearch','[data-v692-archive-row]');el.statusDetails.textContent=`${String(p.format||extOf(name)).toUpperCase()} \u00b7 ${(p.entries||[]).length} \u00f6\u011fe`;return}
      if(p.kind==='folder'){el.content.innerHTML=`<div class="file-editor"><div class="editor-head"><strong>${esc(name)}</strong><span class="grow"></span><button class="tool" onclick="v68FileReveal(${js(path)})">Windows\u2019ta g\u00f6ster</button><button class="tool" onclick="v68OpenExternalFile(${js(path)})">Explorer\u2019da a\u00e7</button></div><div class="v692-browser"><div class="v692-browser-head"><input id="v692FolderSearch" placeholder="Klas\u00f6r i\u00e7inde ara\u2026"><span>${(p.entries||[]).length} \u00f6\u011fe${p.truncated?' +':''}</span></div><div class="v692-browser-list">${v692FolderRows(p.entries)}</div></div></div>`;v692BindBrowserFilter('v692FolderSearch','[data-v692-folder-row]');el.statusDetails.textContent=`Klas\u00f6r \u00b7 ${(p.entries||[]).length} \u00f6\u011fe`;return}
    }catch(e){el.content.innerHTML=`<div class="empty-main"><div>${esc(e?.message||'Dosya a\u00e7\u0131lamad\u0131')}</div></div>`;return}
  }
  return _v692RenderFileBase(path,name)
};


/* ===== Veloria V1 compatibility HF11 - horizontal Ctrl+wheel, stable image sizing, fitted previews, archive entry preview ===== */
let v693ArchiveRootPath='';
let v693PreviewZoom=1;
let v693PreviewNatural={w:0,h:0};

// Ctrl + mouse wheel: wheel up moves the note canvas left, wheel down moves it right.
// Scope this to note pages so image/file previews keep their normal wheel behavior.
el.content?.addEventListener('wheel',e=>{
  if(!e.ctrlKey||currentView.kind!=='page')return;
  const max=Math.max(0,el.content.scrollWidth-el.content.clientWidth);if(max<=0)return;
  const delta=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;if(!delta)return;
  e.preventDefault();e.stopPropagation();
  el.content.scrollLeft=Math.max(0,Math.min(max,el.content.scrollLeft+delta*1.25));
  ui.scrollX=ui.scrollX||{};ui.scrollX[`page:${currentView.id}`]=el.content.scrollLeft;saveUi();
},{passive:false,capture:true});

const _v693SaveScrollBase=saveScroll;
saveScroll=function(){_v693SaveScrollBase();if(currentView.kind==='page'||currentView.kind==='folder'){ui.scrollX=ui.scrollX||{};ui.scrollX[`${currentView.kind}:${currentView.id}`]=el.content.scrollLeft;saveUi()}};
restoreScroll=function(key){requestAnimationFrame(()=>{el.content.scrollTop=Number(ui.scroll[key]||0);el.content.scrollLeft=Number(ui.scrollX?.[key]||0)})};
el.content?.addEventListener('scroll',()=>{if(currentView.kind==='page'||currentView.kind==='folder'){ui.scrollX=ui.scrollX||{};ui.scrollX[`${currentView.kind}:${currentView.id}`]=el.content.scrollLeft}},{passive:true});

// Strip HF11 resize-only UI from persisted rich note HTML.
const _v693SerializeRichBase=v690SerializeRich;
v690SerializeRich=function(target){const html=_v693SerializeRichBase(target),box=document.createElement('div');box.innerHTML=html;box.querySelectorAll('.v693-size-badge').forEach(n=>n.remove());return box.innerHTML};

// More reliable native drag: never let a resize gesture become a drag gesture.
v692PrepareDraggable=function(node){
  if(!node||node.dataset.v693Drag==='1')return;node.dataset.v693Drag='1';node.draggable=true;
  node.addEventListener('dragstart',e=>{if(node.dataset.v693Resizing==='1'){e.preventDefault();return}v692DragNode=node;e.stopPropagation();try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-veloria-inline','1')}catch{}});
  node.addEventListener('dragend',()=>{v692DragNode=null});
};

v692AttachImageResize=function(node){
  if(!node)return;node.querySelectorAll(':scope > .v692-resize-handle,:scope > .v693-size-badge').forEach(n=>n.remove());
  const h=document.createElement('span');h.className='v692-resize-handle';h.setAttribute('contenteditable','false');h.setAttribute('draggable','false');h.title='Sürükleyerek görsel boyutunu değiştir';
  const badge=document.createElement('span');badge.className='v693-size-badge';badge.setAttribute('contenteditable','false');node.append(h,badge);
  h.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;e.preventDefault();e.stopPropagation();v691SelectImage(node);
    const rich=node.closest('[data-edit="rich"]');v692HistoryCheckpoint(rich);
    const startX=e.clientX,startW=Math.max(100,node.getBoundingClientRect().width);node.dataset.v693Resizing='1';node.draggable=false;badge.hidden=false;badge.textContent=`${Math.round(startW)} px`;
    const move=ev=>{const w=v690ClampImageWidth(startW+(ev.clientX-startX));node.dataset.width=String(w);node.style.width=`${w}px`;badge.textContent=`${w} px`;if(ev.cancelable)ev.preventDefault()};
    const finish=()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('pointercancel',finish,true);delete node.dataset.v693Resizing;node.draggable=true;badge.hidden=true;v691CommitImage(node)};
    window.addEventListener('pointermove',move,{capture:true,passive:false});window.addEventListener('pointerup',finish,true);window.addEventListener('pointercancel',finish,true);
  });
};

v691FitWidth=function(){return v690ClampImageWidth(Math.max(240,(el.content?.clientWidth||900)-150))};
let v693WidthEditActive=false,v693WidthEditNode=null;
window.v693BeginImageWidthEdit=()=>{const node=v691ImageNode();if(!node)return null;if(!v693WidthEditActive||v693WidthEditNode!==node){v692HistoryCheckpoint(v691ImageRich(node));v693WidthEditActive=true;v693WidthEditNode=node}return node};
window.v693LiveImageWidth=value=>{const node=v693BeginImageWidthEdit();if(!node)return;const w=v690ClampImageWidth(value);node.dataset.width=String(w);node.style.width=`${w}px`;const out=document.getElementById('v693ImageWidthNumber');if(out&&Number(out.value)!==w)out.value=String(w);const range=document.getElementById('v693ImageWidthRange');if(range&&Number(range.value)!==w)range.value=String(w)};
window.v693CommitImageWidth=value=>{const node=v691ImageNode();if(!node)return;v693LiveImageWidth(value);v691CommitImage(node);v693WidthEditActive=false;v693WidthEditNode=null};
v691ImageMenuHtml=function(node){
  const align=v691NormalizeAlign(node?.dataset?.align),width=v691ImageWidth(node),fit=v691FitWidth(node),name=String(node?.dataset?.name||baseName(node?.dataset?.nativePath)||'Görsel');
  const near=n=>Math.abs(width-n)<=24;
  return `<div class="v691-menu-head"><strong>${esc(name)}</strong><small>${v691AlignLabel(align)} · ${width}px</small></div>
  <div class="v691-menu-label">Hizalama</div><div class="v691-menu-grid">
    ${v691MenuButton('Satır içi',`v691SetImageAlign('inline')`,align==='inline')}${v691MenuButton('Sola sar',`v691SetImageAlign('left')`,align==='left')}${v691MenuButton('Ortala',`v691SetImageAlign('center')`,align==='center')}${v691MenuButton('Sağa sar',`v691SetImageAlign('right')`,align==='right')}
  </div><div class="v691-menu-label">Boyut</div><div class="v693-image-size-editor"><input id="v693ImageWidthRange" type="range" min="100" max="2400" step="10" value="${width}" oninput="v693LiveImageWidth(this.value)" onchange="v693CommitImageWidth(this.value)"><input id="v693ImageWidthNumber" type="number" min="100" max="2400" step="10" value="${width}" oninput="v693LiveImageWidth(this.value)" onchange="v693CommitImageWidth(this.value)"><span>px</span></div><div class="v691-menu-grid">
    ${v691MenuButton('Küçük',`v691SetImageSize(240)`,near(240))}${v691MenuButton('Orta',`v691SetImageSize(420)`,near(420))}${v691MenuButton('Büyük',`v691SetImageSize(680)`,near(680))}${v691MenuButton('Ekrana sığdır',`v691SetImageSize(${fit})`,near(fit))}
  </div><hr><button type="button" onclick="v691OpenImage()"><span class="ctx-icon">↗</span><span>Veloria’da aç</span></button><button type="button" onclick="v691RevealImage()"><span class="ctx-icon">⌕</span><span>Windows'ta göster</span></button><button type="button" onclick="v691CopyImagePath()"><span class="ctx-icon">⧉</span><span>Dosya yolunu kopyala</span></button><hr><button type="button" class="danger" onclick="v691RemoveImage()"><span class="ctx-icon">⌫</span><span>Notadan kaldır</span></button>`;
};

function v693DrawToolbar(){return `<div class="v692-draw-toolbar"><strong>Kalem</strong><input id="v692Color" type="color" value="#ff0000" oninput="v692ColorFromPicker()"><label>R <input id="v692R" type="number" min="0" max="255" value="255" oninput="v692RgbToPicker()"></label><label>G <input id="v692G" type="number" min="0" max="255" value="0" oninput="v692RgbToPicker()"></label><label>B <input id="v692B" type="number" min="0" max="255" value="0" oninput="v692RgbToPicker()"></label><button class="tool" onclick="v692ClearDrawing()">Çizimi temizle</button><span class="v693-toolbar-sep"></span><button class="tool" onclick="v693PreviewZoomBy(-0.1)">−</button><strong id="v693ZoomLabel">100%</strong><button class="tool" onclick="v693PreviewZoomBy(0.1)">+</button><button class="tool" onclick="v693PreviewFit()">Sığdır</button><span>Çizim bu önizleme oturumu için geçicidir.</span></div>`}
function v693ImageStage(url){return `${v693DrawToolbar()}<div id="v692DrawStage" class="v692-draw-stage"><div class="v692-draw-inner"><img id="v692DrawImage" src="${attr(url)}"><canvas id="v692DrawCanvas"></canvas></div></div>`}

v692InitDrawPreview=function(){
  const img=document.getElementById('v692DrawImage'),canvas=document.getElementById('v692DrawCanvas'),stage=document.getElementById('v692DrawStage');if(!img||!canvas||!stage)return;
  const ctx=canvas.getContext('2d');let drawing=false,last=null,backingScale=1;
  const color=()=>{const r=Math.max(0,Math.min(255,Number(document.getElementById('v692R')?.value)||0)),g=Math.max(0,Math.min(255,Number(document.getElementById('v692G')?.value)||0)),b=Math.max(0,Math.min(255,Number(document.getElementById('v692B')?.value)||0));return `rgb(${r},${g},${b})`};
  const applyZoom=z=>{if(!v693PreviewNatural.w||!v693PreviewNatural.h)return;v693PreviewZoom=Math.max(.1,Math.min(4,z));const w=Math.max(1,Math.round(v693PreviewNatural.w*v693PreviewZoom)),h=Math.max(1,Math.round(v693PreviewNatural.h*v693PreviewZoom));img.style.width=`${w}px`;img.style.height=`${h}px`;canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;const lab=document.getElementById('v693ZoomLabel');if(lab)lab.textContent=`${Math.round(v693PreviewZoom*100)}%`};
  const fit=()=>{if(!v693PreviewNatural.w||!v693PreviewNatural.h)return;const aw=Math.max(120,stage.clientWidth-38),ah=Math.max(120,stage.clientHeight-38);applyZoom(Math.min(1,aw/v693PreviewNatural.w,ah/v693PreviewNatural.h))};
  const ready=()=>{const nw=Math.max(1,img.naturalWidth||1),nh=Math.max(1,img.naturalHeight||1);v693PreviewNatural={w:nw,h:nh};backingScale=Math.min(1,4096/Math.max(nw,nh));canvas.width=Math.max(1,Math.round(nw*backingScale));canvas.height=Math.max(1,Math.round(nh*backingScale));fit()};
  if(img.complete&&img.naturalWidth)ready();else img.addEventListener('load',ready,{once:true});
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)}};
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drawing=true;last=point(e);canvas.setPointerCapture?.(e.pointerId);e.preventDefault()});
  canvas.addEventListener('pointermove',e=>{if(!drawing||!last)return;const q=point(e);ctx.strokeStyle=color();ctx.lineWidth=Math.max(1.5,Math.min(canvas.width,canvas.height)/420);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(q.x,q.y);ctx.stroke();last=q;e.preventDefault()});
  const stop=()=>{drawing=false;last=null};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
  window.v692ClearDrawing=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
  window.v692ColorFromPicker=()=>{const hex=document.getElementById('v692Color')?.value||'#ff0000',n=parseInt(hex.slice(1),16);document.getElementById('v692R').value=(n>>16)&255;document.getElementById('v692G').value=(n>>8)&255;document.getElementById('v692B').value=n&255};
  window.v692RgbToPicker=()=>{const vals=['v692R','v692G','v692B'].map(id=>Math.max(0,Math.min(255,Number(document.getElementById(id)?.value)||0)));document.getElementById('v692Color').value='#'+vals.map(n=>n.toString(16).padStart(2,'0')).join('')};
  window.v693PreviewZoomBy=step=>applyZoom(v693PreviewZoom+Number(step||0));window.v693PreviewFit=fit;
  const ro=new ResizeObserver(()=>{if(v693PreviewZoom<=1)fit()});ro.observe(stage);
};
window.v693PreviewZoomBy=window.v693PreviewZoomBy||(()=>{});window.v693PreviewFit=window.v693PreviewFit||(()=>{});

function v693ArchiveRows(entries,archivePath){return (entries||[]).map((x,i)=>x.isDirectory?`<div class="v692-browser-row is-folder" data-v692-archive-row="${i}"><span class="v692-browser-icon">DIR</span><span class="v692-browser-copy"><strong>${esc(x.path||x.name||'')}</strong><small>Klasör</small></span><span></span></div>`:`<button class="v692-browser-row" data-v692-archive-row="${i}" onclick="v693OpenArchiveEntry(${js(archivePath)},${js(x.path||x.name||'')})"><span class="v692-browser-icon">${esc(extOf(x.name||x.path||''))}</span><span class="v692-browser-copy"><strong>${esc(x.path||x.name||'')}</strong><small>${fmtBytes(x.size||0)}</small></span><span class="v692-browser-open">Aç</span></button>`).join('')}
function v693ArchiveBrowser(p,archivePath){return `<div class="v692-browser"><div class="v692-browser-head"><input id="v692ArchiveSearch" placeholder="Arşiv içinde ara…"><span>${(p.entries||[]).length} öğe${p.truncated?' +':''}</span></div>${p.warning?`<div class="v692-browser-warning">${esc(p.warning)}</div>`:''}<div class="v692-browser-list">${v693ArchiveRows(p.entries,archivePath)}</div></div>`}
function v693ArchiveEntryHeader(title,sub=''){return `<div class="editor-head"><button class="tool" onclick="v693BackToArchive()">← Arşive dön</button><strong>${esc(title)}</strong>${sub?`<span class="v693-entry-path">${esc(sub)}</span>`:''}<span class="grow"></span></div>`}
window.v693BackToArchive=()=>{if(v693ArchiveRootPath)renderFile(v693ArchiveRootPath,baseName(v693ArchiveRootPath))};
window.v693OpenArchiveTemp=path=>api.openArchiveTempExternal?.(path).catch(e=>toast(e?.message||'Dosya açılamadı','error'));
window.v693OpenArchiveEntry=async(archivePath,entryPath)=>{
  try{
    el.content.innerHTML='<div class="empty-main"><div>Arşiv girdisi açılıyor…</div></div>';
    const p=await api.previewArchiveEntry(archivePath,entryPath),name=p.displayName||p.name||baseName(entryPath);el.statusContext.textContent=name;el.statusDetails.textContent=`Arşiv içi · ${fmtBytes(p.size||0)}`;
    if(p.kind==='image'){el.content.innerHTML=`<div class="file-editor">${v693ArchiveEntryHeader(name,entryPath)}${v693ImageStage(p.url)}</div>`;v692InitDrawPreview();return}
    if(p.kind==='text'){el.content.innerHTML=`<div class="file-editor">${v693ArchiveEntryHeader(name,entryPath)}<div class="v693-readonly-text"><pre>${esc(p.text||'')}</pre>${p.truncated?'<div class="v692-browser-warning">Dosya 2 MB önizleme sınırında kesildi.</div>':''}</div></div>`;return}
    if(p.kind==='pdf'){el.content.innerHTML=`<div class="file-editor">${v693ArchiveEntryHeader(name,entryPath)}<div class="preview-shell v693-entry-preview"><iframe src="${attr(p.url)}"></iframe></div></div>`;return}
    if(p.kind==='video'){el.content.innerHTML=`<div class="file-editor">${v693ArchiveEntryHeader(name,entryPath)}<div class="preview-shell v693-entry-preview"><video src="${attr(p.url)}" controls></video></div></div>`;return}
    if(p.kind==='audio'){el.content.innerHTML=`<div class="file-editor">${v693ArchiveEntryHeader(name,entryPath)}<div class="v693-audio-preview"><audio src="${attr(p.url)}" controls></audio></div></div>`;return}
    if(p.kind==='archive'){el.content.innerHTML=`<div class="file-editor">${v693ArchiveEntryHeader(name,entryPath)}${v693ArchiveBrowser(p,p.extractedPath)}</div>`;v692BindBrowserFilter('v692ArchiveSearch','[data-v692-archive-row]');return}
    el.content.innerHTML=`<div class="file-editor">${v693ArchiveEntryHeader(name,entryPath)}<div class="empty-main"><div><h2>${esc(name)}</h2><div>Bu dosya türü için dahili görüntüleyici yok.</div><button class="btn primary" style="margin-top:14px" onclick="v693OpenArchiveTemp(${js(p.extractedPath||'')})">Windows'ta aç</button></div></div></div>`;
  }catch(e){el.content.innerHTML=`<div class="file-editor">${v693ArchiveEntryHeader(baseName(entryPath),entryPath)}<div class="empty-main"><div>${esc(e?.message||'Arşiv girdisi açılamadı')}</div></div></div>`}
};

const _v693RenderFileBase=renderFile;
renderFile=async function(path,name){
  if(isText(name))return _v693RenderFileBase(path,name);
  if(externalWatchTimer)clearInterval(externalWatchTimer);fileEditor=null;el.statusContext.textContent=name;el.statusDetails.textContent='';
  try{
    const p=await api.previewManagedFile(path);if(!v11StillViewingFile(path))return;
    if(p.kind==='image'){el.content.innerHTML=`<div class="file-editor"><div class="editor-head"><strong>${esc(name)}</strong><span class="grow"></span><button class="tool" onclick="v68FileReveal(${js(path)})">Windows’ta göster</button><button class="tool" onclick="v68CopyPath(${js(path)})">Yolu kopyala</button><button class="tool" onclick="v68OpenExternalFile(${js(path)})">Harici aç</button></div>${v693ImageStage(p.url)}</div>`;v692InitDrawPreview();el.statusDetails.textContent=`Görsel · ${fmtBytes(p.size||0)}`;return}
    if(p.kind==='archive'){v693ArchiveRootPath=path;el.content.innerHTML=`<div class="file-editor"><div class="editor-head"><strong>${esc(name)}</strong><span class="grow"></span><button class="tool" onclick="v68FileReveal(${js(path)})">Windows’ta göster</button><button class="tool" onclick="v68OpenExternalFile(${js(path)})">Harici aç</button></div>${v693ArchiveBrowser(p,path)}</div>`;v692BindBrowserFilter('v692ArchiveSearch','[data-v692-archive-row]');el.statusDetails.textContent=`${String(p.format||extOf(name)).toUpperCase()} · ${(p.entries||[]).length} öğe`;return}
  }catch(e){el.content.innerHTML=`<div class="empty-main"><div>${esc(e?.message||'Dosya açılamadı')}</div></div>`;return}
  return _v693RenderFileBase(path,name)
};


/* ===== Veloria V1 compatibility HF12 - de-duplicated imports, line reset, full-width cards, persistent drawing ===== */
// Windows clipboard can expose the same payload through both clipboardData.files and
// clipboardData.items. Prefer the canonical FileList; only fall back to items when it is empty.
v692ClipboardFiles=function(e){
  const clip=e?.clipboardData;if(!clip)return[];const out=[],seen=new Set();
  const add=f=>{if(!f)return;const name=String(f.name||''),type=String(f.type||''),size=Number(f.size)||0,last=Number(f.lastModified)||0;const key=`${name}|${type}|${size}|${last}`;if(seen.has(key))return;seen.add(key);out.push(f)};
  const direct=Array.from(clip.files||[]);if(direct.length){direct.forEach(add);return out}
  for(const item of Array.from(clip.items||[]))if(item.kind==='file')try{add(item.getAsFile())}catch{}
  return out
};

// A normal Enter after a very long no-wrap line must visually begin at the real left edge.
// Chromium can scroll the caret back into view *after* keydown, so reset on keydown, input,
// the next animation frames and a short delayed pass. This only runs for plain Enter.
function v694ResetPageHorizontal(rich){
  if(currentView.kind!=='page'||!el.content)return;
  el.content.scrollLeft=0;if(rich&&'scrollLeft'in rich)rich.scrollLeft=0;
  ui.scrollX=ui.scrollX||{};ui.scrollX[`page:${currentView.id}`]=0
}
function v694ResetHorizontalAfterEnter(e){
  if(e.key!=='Enter'||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
  const rich=e.currentTarget;rich.dataset.v694PendingEnter='1';
  const reset=()=>v694ResetPageHorizontal(rich);
  queueMicrotask(reset);requestAnimationFrame(()=>{reset();requestAnimationFrame(reset)});setTimeout(reset,45);setTimeout(reset,120)
}
function v694ResetHorizontalOnLineInput(e){
  const rich=e.currentTarget;if(rich.dataset.v694PendingEnter!=='1')return;
  if(e.inputType&&e.inputType!=='insertParagraph'&&e.inputType!=='insertLineBreak')return;
  delete rich.dataset.v694PendingEnter;v694ResetPageHorizontal(rich);requestAnimationFrame(()=>v694ResetPageHorizontal(rich))
}
const _v694BindSmartEditorsBase=v685BindSmartEditors;
v685BindSmartEditors=function(){
  _v694BindSmartEditorsBase();const scope=el.content?.querySelector('#blocks');if(!scope)return;
  for(const rich of scope.querySelectorAll('[data-edit="rich"]'))if(rich.dataset.v694EnterReset!=='1'){
    rich.dataset.v694EnterReset='1';rich.addEventListener('keydown',v694ResetHorizontalAfterEnter,false);rich.addEventListener('input',v694ResetHorizontalOnLineInput,false)
  }
};

// Some Windows clipboard providers emit the same logical paste/drop twice in very quick
// succession. The main process also de-duplicates sources inside one transfer; this renderer
// guard prevents a second transfer from being started for the same payload.
let v694LastImportSig='',v694LastImportAt=0;
function v694FileEventSignature(files,kind,target){
  const bits=Array.from(files||[]).map(f=>`${String(f?.name||'')}|${String(f?.type||'')}|${Number(f?.size)||0}|${Number(f?.lastModified)||0}`).sort();
  const block=target?.closest?.('[data-block]')?.dataset?.block||'';return `${kind}|${currentView.kind}:${currentView.id||''}|${block}|${bits.join(';;')}`
}
function v694DuplicateImport(sig,windowMs=420){const now=performance.now();const dup=!!sig&&sig===v694LastImportSig&&(now-v694LastImportAt)<windowMs;if(!dup){v694LastImportSig=sig;v694LastImportAt=now}return dup}
const _v694PasteHandlerBase=v685HandlePaste;
v685HandlePaste=function(e){
  const files=v692ClipboardFiles(e);if(files.length){const sig=v694FileEventSignature(files,'paste',e.currentTarget);if(v694DuplicateImport(sig)){e.preventDefault();e.stopImmediatePropagation();return}}
  return _v694PasteHandlerBase(e)
};
const _v694DropHandlerBase=v690HandleExternalDrop;
v690HandleExternalDrop=async function(e){
  const files=Array.from(e.dataTransfer?.files||[]);if(files.length){const sig=v694FileEventSignature(files,'drop',e.target);if(v694DuplicateImport(sig)){e.preventDefault();e.stopPropagation();el.content?.classList.remove('v690-drop-ready');return}}
  return _v694DropHandlerBase(e)
};

// Keep every note card as wide as the widest line on the page. This prevents the far-right
// area from turning into an isolated strip where only the longest note is visible.
let v694WidthSyncRaf=0;
function v694SyncNoteCardWidths(){
  if(v694WidthSyncRaf||currentView.kind!=='page')return;v694WidthSyncRaf=requestAnimationFrame(()=>{
    v694WidthSyncRaf=0;const blocks=el.content?.querySelector('#blocks');if(!blocks)return;const cards=[...blocks.querySelectorAll(':scope > .block-wrap')];if(!cards.length)return;
    for(const card of cards){card.style.removeProperty('width');card.style.removeProperty('min-width')}
    blocks.style.removeProperty('width');
    const view=blocks.closest('.view'),style=getComputedStyle(view);
    const viewport=Math.max(240,(el.content?.clientWidth||900)-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));let widest=viewport;
    for(const card of cards){const body=card.querySelector('.block-body')||card;widest=Math.max(widest,Math.ceil(body.scrollWidth+24))}
    widest=Math.min(1000000,widest);blocks.style.width=`${widest}px`;for(const card of cards){card.style.width=`${widest}px`;card.style.minWidth=`${widest}px`}for(const line of blocks.querySelectorAll(':scope > .insert-line'))line.style.width=`${widest}px`
  })
}
const _v694RenderPageBase=renderPage;
renderPage=function(id){_v694RenderPageBase(id);if(currentView.kind==='page'&&currentView.id===id)v694SyncNoteCardWidths()};
el.content?.addEventListener('input',e=>{if(currentView.kind==='page'&&e.target?.closest?.('[data-edit="rich"]'))v694SyncNoteCardWidths()},true);
window.addEventListener('resize',()=>v694SyncNoteCardWidths(),{passive:true});

// Never persist the live annotation overlay element in note HTML.
const _v694SerializeRichBase=v690SerializeRich;
v690SerializeRich=function(target){const clone=target?.cloneNode?.(true);if(!clone)return _v694SerializeRichBase(target);clone.querySelectorAll('.v694-inline-drawing').forEach(n=>n.remove());return _v694SerializeRichBase(clone)};

// Add saved drawing overlays to inline note images after their base preview has loaded.
const _v694HydrateInlineBase=v690HydrateInlineImages;
v690HydrateInlineImages=async function(p){
  await _v694HydrateInlineBase(p);if(!p||currentView.kind!=='page'||currentView.id!==p.id)return;const scope=el.content?.querySelector('#blocks');if(!scope)return;
  for(const node of scope.querySelectorAll('[data-veloria-inline-image]')){
    const pth=String(node.dataset.nativePath||'');if(!pth)continue;let pr=previewCache.get(norm(pth));
    if(!pr){try{pr=await api.previewManagedFile(pth);previewCache.set(norm(pth),pr)}catch{continue}}
    let overlay=node.querySelector(':scope > .v694-inline-drawing');if(pr?.annotationUrl){if(!overlay){overlay=document.createElement('img');overlay.className='v694-inline-drawing';overlay.alt='';overlay.setAttribute('aria-hidden','true');overlay.draggable=false;node.appendChild(overlay)}if(overlay.src!==pr.annotationUrl)overlay.src=pr.annotationUrl}else overlay?.remove()
  }
};

function v694DrawToolbar(persistent){return `<div class="v692-draw-toolbar"><strong>Kalem</strong><input id="v692Color" type="color" value="#ff0000" oninput="v692ColorFromPicker()"><label>R <input id="v692R" type="number" min="0" max="255" value="255" oninput="v692RgbToPicker()"></label><label>G <input id="v692G" type="number" min="0" max="255" value="0" oninput="v692RgbToPicker()"></label><label>B <input id="v692B" type="number" min="0" max="255" value="0" oninput="v692RgbToPicker()"></label><button class="tool" onclick="v692ClearDrawing()">Çizimi temizle</button><span class="v693-toolbar-sep"></span><button class="tool" onclick="v693PreviewZoomBy(-0.1)">−</button><strong id="v693ZoomLabel">100%</strong><button class="tool" onclick="v693PreviewZoomBy(0.1)">+</button><button class="tool" onclick="v693PreviewFit()">Sığdır</button><span id="v694DrawSaveState">${persistent?'Çizim durduktan kısa süre sonra otomatik kaydedilir.':'Bu önizlemedeki çizim geçicidir.'}</span></div>`}
v693ImageStage=function(url,annotationUrl='',imagePath=''){const persistent=!!imagePath;return `${v694DrawToolbar(persistent)}<div id="v692DrawStage" class="v692-draw-stage" data-v694-image-path="${attr(imagePath)}" data-v694-annotation-url="${attr(annotationUrl||'')}"><div class="v692-draw-inner"><img id="v692DrawImage" src="${attr(url)}"><canvas id="v692DrawCanvas"></canvas></div></div>`};

v692InitDrawPreview=function(){
  const img=document.getElementById('v692DrawImage'),canvas=document.getElementById('v692DrawCanvas'),stage=document.getElementById('v692DrawStage');if(!img||!canvas||!stage)return;
  const ctx=canvas.getContext('2d'),imagePath=String(stage.dataset.v694ImagePath||''),annotationUrl=String(stage.dataset.v694AnnotationUrl||'');let drawing=false,last=null,backingScale=1,saveTimer=0,saveInFlight=false,revision=0,savedRevision=0;
  const status=text=>{const n=document.getElementById('v694DrawSaveState');if(n)n.textContent=text};
  const color=()=>{const r=Math.max(0,Math.min(255,Number(document.getElementById('v692R')?.value)||0)),g=Math.max(0,Math.min(255,Number(document.getElementById('v692G')?.value)||0)),b=Math.max(0,Math.min(255,Number(document.getElementById('v692B')?.value)||0));return `rgb(${r},${g},${b})`};
  const applyZoom=z=>{if(!v693PreviewNatural.w||!v693PreviewNatural.h)return;v693PreviewZoom=Math.max(.1,Math.min(4,z));const w=Math.max(1,Math.round(v693PreviewNatural.w*v693PreviewZoom)),h=Math.max(1,Math.round(v693PreviewNatural.h*v693PreviewZoom));img.style.width=`${w}px`;img.style.height=`${h}px`;canvas.style.width=`${w}px`;canvas.style.height=`${h}px`;const lab=document.getElementById('v693ZoomLabel');if(lab)lab.textContent=`${Math.round(v693PreviewZoom*100)}%`};
  const fit=()=>{if(!v693PreviewNatural.w||!v693PreviewNatural.h)return;const availW=Math.max(120,stage.clientWidth-38),availH=Math.max(120,stage.clientHeight-38);applyZoom(Math.min(1,availW/v693PreviewNatural.w,availH/v693PreviewNatural.h))};
  const loadAnnotation=()=>new Promise(resolve=>{if(!annotationUrl)return resolve();const a=new Image();a.onload=()=>{try{ctx.drawImage(a,0,0,a.naturalWidth||a.width,a.naturalHeight||a.height,0,0,canvas.width,canvas.height)}catch{}resolve()};a.onerror=()=>resolve();a.src=annotationUrl});
  const ready=async()=>{const nw=Math.max(1,img.naturalWidth||1),nh=Math.max(1,img.naturalHeight||1);v693PreviewNatural={w:nw,h:nh};backingScale=Math.min(1,4096/Math.max(nw,nh));canvas.width=Math.max(1,Math.round(nw*backingScale));canvas.height=Math.max(1,Math.round(nh*backingScale));await loadAnnotation();fit()};
  if(img.complete&&img.naturalWidth)void ready();else img.addEventListener('load',()=>void ready(),{once:true});
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)}};
  const saveNow=async rev=>{if(!imagePath||!api.saveImageDrawing)return;if(saveInFlight){saveTimer=setTimeout(()=>void saveNow(revision),300);return}saveInFlight=true;status('Çizim kaydediliyor…');try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Çizim PNG olarak hazırlanamadı.');const data=new Uint8Array(await blob.arrayBuffer());const saved=await api.saveImageDrawing(imagePath,data);savedRevision=Math.max(savedRevision,rev);previewCache.delete(norm(imagePath));if(saved?.url)stage.dataset.v694AnnotationUrl=saved.url;status('Çizim kaydedildi.')}catch(e){status('Çizim kaydedilemedi.');toast(e?.message||'Çizim kaydedilemedi','error')}finally{saveInFlight=false;if(revision>savedRevision){clearTimeout(saveTimer);saveTimer=setTimeout(()=>void saveNow(revision),450)}}};
  const scheduleSave=()=>{revision++;if(!imagePath){status('Bu önizlemedeki çizim geçicidir.');return}status('Çizim bekliyor…');clearTimeout(saveTimer);const rev=revision;saveTimer=setTimeout(()=>void saveNow(rev),700)};
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drawing=true;last=point(e);canvas.setPointerCapture?.(e.pointerId);e.preventDefault()});
  canvas.addEventListener('pointermove',e=>{if(!drawing||!last)return;const q=point(e);ctx.strokeStyle=color();ctx.lineWidth=Math.max(1.5,Math.min(canvas.width,canvas.height)/420);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(q.x,q.y);ctx.stroke();last=q;e.preventDefault()});
  const stop=()=>{if(!drawing)return;drawing=false;last=null;scheduleSave()};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
  window.v692ClearDrawing=()=>{ctx.clearRect(0,0,canvas.width,canvas.height);scheduleSave()};
  window.v692ColorFromPicker=()=>{const hex=document.getElementById('v692Color')?.value||'#ff0000',n=parseInt(hex.slice(1),16);document.getElementById('v692R').value=(n>>16)&255;document.getElementById('v692G').value=(n>>8)&255;document.getElementById('v692B').value=n&255};
  window.v692RgbToPicker=()=>{const vals=['v692R','v692G','v692B'].map(id=>Math.max(0,Math.min(255,Number(document.getElementById(id)?.value)||0)));document.getElementById('v692Color').value='#'+vals.map(n=>n.toString(16).padStart(2,'0')).join('')};
  window.v693PreviewZoomBy=step=>applyZoom(v693PreviewZoom+Number(step||0));window.v693PreviewFit=fit;const ro=new ResizeObserver(()=>{if(v693PreviewZoom<=1)fit()});ro.observe(stage)
};

// Final image renderer: pass the saved drawing layer and managed path into the preview stage.
const _v694RenderFileBase=renderFile;
renderFile=async function(path,name){
  if(isImage(name)){
    if(externalWatchTimer)clearInterval(externalWatchTimer);fileEditor=null;el.statusContext.textContent=name;el.statusDetails.textContent='';
    try{const p=await api.previewManagedFile(path);if(!v11StillViewingFile(path))return;if(p.kind==='image'){el.content.innerHTML=`<div class="file-editor"><div class="editor-head"><strong>${esc(name)}</strong><span class="grow"></span><button class="tool" onclick="v68FileReveal(${js(path)})">Windows’ta göster</button><button class="tool" onclick="v68CopyPath(${js(path)})">Yolu kopyala</button><button class="tool" onclick="v68OpenExternalFile(${js(path)})">Harici aç</button></div>${v693ImageStage(p.url,p.annotationUrl||'',path)}</div>`;v692InitDrawPreview();el.statusDetails.textContent=`Görsel · ${fmtBytes(p.size||0)}`;return}}catch(e){el.content.innerHTML=`<div class="empty-main"><div>${esc(e?.message||'Dosya açılamadı')}</div></div>`;return}
  }
  return _v694RenderFileBase(path,name)
};


/* ===== Veloria V1 final behavior ===== */

// Workspace rename uses an in-app modal. Electron does not provide a dependable window.prompt flow.
window.v68RenameWorkspace=id=>{const w=state.workspaceSystem.items.find(x=>x.id===id);if(!w)return;modal(`<div class="modal-head"><h3>Çalışma alanını yeniden adlandır</h3><span class="grow"></span><button class="icon-btn" onclick="v68WorkspaceMenu()">${iconSvg('close','sm')}</button></div><div class="modal-body"><div class="form-row"><label>Ad</label><input id="v1WorkspaceRename" value="${attr(w.name)}" maxlength="60" autofocus onkeydown="if(event.key==='Enter'){event.preventDefault();v1ApplyWorkspaceRename('${attr(id)}')}else if(event.key==='Escape'){event.preventDefault();v68WorkspaceMenu()}"></div><div class="modal-actions"><button class="btn" onclick="v68WorkspaceMenu()">İptal</button><button class="btn primary" onclick="v1ApplyWorkspaceRename('${attr(id)}')">Kaydet</button></div></div>`)};
window.v1ApplyWorkspaceRename=async id=>{const w=state.workspaceSystem.items.find(x=>x.id===id),input=document.getElementById('v1WorkspaceRename');if(!w||!input)return;const name=input.value.trim().slice(0,60);if(!name)return toast('Çalışma alanı adı boş olamaz','warn');w.name=name;w.updatedAt=now();if(id===state.workspaceSystem.activeId)el.workspaceName.textContent=name;await persist();renderTree();renderTabs();workspaceMenu();toast('Çalışma alanı yeniden adlandırıldı')};

// V1 settings keep only functional controls.
settingsBody=function(tab,p){
  if(tab==='appearance')return `<div class="form-row"><label>Uygulama teması</label><button class="btn" onclick="v68ToggleTheme()">${state.theme==='light'?'Açık tema':'Koyu tema'} · Değiştir</button></div><div class="form-row"><label>Klasör galerisi</label><select onchange="v68SetThumbSize(this.value)"><option value="small" ${ui.thumbSize==='small'?'selected':''}>Küçük</option><option value="medium" ${ui.thumbSize==='medium'?'selected':''}>Normal</option><option value="large" ${ui.thumbSize==='large'?'selected':''}>Büyük</option></select></div><div class="form-row"><label>Not içi görsel genişliği</label><input type="range" min="100" max="2400" step="10" value="${Number(ui.defaultImageWidth)||280}" oninput="v683SetDefaultImageWidth(this)"><div class="help-text">${Number(ui.defaultImageWidth)||280} px</div></div><div class="form-row"><label>Sayfaya eklenen diğer dosyalar</label><select onchange="v683SetDefaultFileDisplay(this.value)"><option value="compact" ${ui.defaultFileDisplay==='compact'?'selected':''}>Kompakt</option><option value="card" ${(ui.defaultFileDisplay||'card')==='card'?'selected':''}>Normal kart</option><option value="detail" ${ui.defaultFileDisplay==='detail'?'selected':''}>Detaylı</option></select></div><label class="visual-toggle"><input type="checkbox" ${ui.showAttachmentPaths?'checked':''} onchange="v683SetShowAttachmentPaths(this.checked)"><span><strong>Dosya yollarını göster</strong><small>Ek dosya kartlarında fiziksel yolu gösterir.</small></span></label><div class="form-row"><label>Görsel dosya adları</label><button class="btn" onclick="v68ToggleImageNames()">${ui.showImageNames?'Gösteriliyor':'Gizli'}</button></div>`;
  if(tab==='files')return `<div class="form-row"><label>Veri klasörü</label><div class="help-text" style="word-break:break-all">${esc(info?.rootPath||'Veloria Dosyalar')}</div></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn primary" onclick="veloriaDesktop.openRoot()">Veloria Dosyalar'ı aç</button><button class="btn" onclick="v68CloseModal();v68ShowStorage()">Depolamayı incele</button></div><div class="form-row"><label>Sayfa TXT aynaları</label><button class="btn" onclick="v68ToggleNoteMirror()">${state.prefs.showNoteMirror?'Dosya listesinde gösteriliyor':'Dosya listesinde gizli'}</button></div>`;
  if(tab==='security')return `<div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn primary" onclick="v68PinSettings()">Uygulama şifresi</button><button class="btn" onclick="v68LockNow()">Şimdi kilitle</button></div>`;
  return `<div class="form-row"><label>Aktif çalışma alanı</label><button class="btn" onclick="v68CloseModal();v68WorkspaceMenu()">${esc(currentWorkspaceName())} · Çalışma alanlarını yönet</button></div><div class="modal-actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn" onclick="v68CloseModal();v68QuickOpen()">Hızlı aç · Ctrl+P</button><button class="btn" onclick="v68CloseModal();veloriaDesktop.openRecovery()">Kurtarma aracını aç</button><button class="btn" onclick="v68CloseModal();v68Undo()">Son işlemi geri al</button></div>`
};

// Images have a single fixed placement. Only width is configurable.
ui.defaultImageMode='gallery';
const _v1RenderAttachmentBase=renderAttachmentBlock;
renderAttachmentBlock=function(b,common,tools){if(isImage(b.name))b.displayMode='gallery';return _v1RenderAttachmentBase(b,common,tools)};
const _v1AttachmentViewBase=window.v683AttachmentView,_v1AttachmentSaveBase=window.v683SaveAttachmentView;
window.v683AttachmentView=id=>{closeContext();const x=findAttachment(id);if(!x)return;const b=x.b;if(!isImage(b.name))return _v1AttachmentViewBase(id);const width=Math.max(100,Math.min(2400,Number(b.imageWidth)||Number(ui.defaultImageWidth)||280));modal(`<div class="modal-head"><h3>Görsel boyutu</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">${iconSvg('close','sm')}</button></div><div class="modal-body"><div class="form-row"><label>Genişlik</label><input id="attWidth" type="range" min="100" max="2400" step="10" value="${width}" oninput="document.getElementById('attWidthValue').textContent=this.value+' px'"><div id="attWidthValue" class="help-text">${width} px</div></div><div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v683SaveAttachmentView('${attr(id)}')">Kaydet</button></div></div>`)};
window.v683SaveAttachmentView=id=>{const x=findAttachment(id);if(!x)return;const b=x.b;if(!isImage(b.name))return _v1AttachmentSaveBase(id);b.displayMode='gallery';b.imageWidth=Math.max(100,Math.min(2400,Number(document.getElementById('attWidth')?.value)||280));touchPage(x.p);closeModal();if(currentView.kind==='page'&&currentView.id===x.p.id)renderPage(x.p.id);toast('Görsel boyutu kaydedildi')};

// Inline image menu: size controls only; no alignment/reposition controls.
v691ImageMenuHtml=function(node){const width=v691ImageWidth(node),fit=v691FitWidth(node),name=String(node?.dataset?.name||baseName(node?.dataset?.nativePath)||'Görsel'),near=n=>Math.abs(width-n)<=24;return `<div class="v691-menu-head"><strong>${esc(name)}</strong><small>${width}px</small></div><div class="v691-menu-label">Boyut</div><div class="v693-image-size-editor"><input id="v693ImageWidthRange" type="range" min="100" max="2400" step="10" value="${width}" oninput="v693LiveImageWidth(this.value)" onchange="v693CommitImageWidth(this.value)"><input id="v693ImageWidthNumber" type="number" min="100" max="2400" step="10" value="${width}" oninput="v693LiveImageWidth(this.value)" onchange="v693CommitImageWidth(this.value)"><span>px</span></div><div class="v691-menu-grid">${v691MenuButton('Küçük',`v691SetImageSize(240)`,near(240))}${v691MenuButton('Orta',`v691SetImageSize(420)`,near(420))}${v691MenuButton('Büyük',`v691SetImageSize(680)`,near(680))}${v691MenuButton('Ekrana sığdır',`v691SetImageSize(${fit})`,near(fit))}</div><hr><button type="button" onclick="v691OpenImage()"><span class="ctx-icon">↗</span><span>Veloria’da aç</span></button><button type="button" onclick="v691RevealImage()"><span class="ctx-icon">⌕</span><span>Windows'ta göster</span></button><button type="button" onclick="v691CopyImagePath()"><span class="ctx-icon">⧉</span><span>Dosya yolunu kopyala</span></button><hr><button type="button" class="danger" onclick="v691RemoveImage()"><span class="ctx-icon">⌫</span><span>Notadan kaldır</span></button>`};
window.v691SetImageAlign=()=>{const node=v691ImageNode();if(node){node.dataset.align='inline';v691CommitImage(node)}closeContext()};
const _v1SerializeRichBase=v690SerializeRich;
v690SerializeRich=function(target){const html=_v1SerializeRichBase(target),box=document.createElement('div');box.innerHTML=html;for(const node of box.querySelectorAll('[data-veloria-inline-image]'))node.dataset.align='inline';return box.innerHTML};
const _v1EnhanceInlineMediaBase=v692EnhanceInlineMedia;
v692EnhanceInlineMedia=function(){_v1EnhanceInlineMediaBase();const scope=el.content?.querySelector('#blocks');if(!scope)return;for(const node of scope.querySelectorAll('[data-veloria-inline-image]')){node.dataset.align='inline';node.title='Görsel boyutunu sağ alttaki tutamaçtan değiştirebilirsin';node.setAttribute('aria-label',`${node.dataset.name||'Görsel'}; sağ tık ile boyut menüsü`)}};

// Inline images can be dragged out to Windows, but cannot be repositioned inside a note.
const _v1PrepareDraggableBase=v692PrepareDraggable;
v692PrepareDraggable=function(node){if(!node?.matches?.('[data-veloria-inline-image]'))return _v1PrepareDraggableBase(node);if(node.dataset.v1ExternalDrag==='1')return;node.dataset.v1ExternalDrag='1';node.draggable=true;node.addEventListener('dragstart',e=>{if(node.dataset.v693Resizing==='1'){e.preventDefault();return}const pth=String(node.dataset.nativePath||'');if(!pth){e.preventDefault();return}e.preventDefault();e.stopPropagation();api.startManagedDrag?.([pth])})};

// Folder files/images: single, Ctrl/Command and Shift selection can all be dragged out natively.
window.v68PhysicalDrag=(e,path)=>{const k=norm(path);if(!fileSelection.has(k)){fileSelection.clear();fileSelection.add(k);fileAnchor=Number(e.currentTarget?.dataset?.index)||0}const paths=selectedFilePaths();e.preventDefault();e.stopPropagation();if(paths.length)api.startManagedDrag?.(paths)};
window.v1SelectAllFolderFiles=()=>{for(const f of currentFolderPhysical())fileSelection.add(norm(f.nativePath));renderFolderView(currentView.id)};
window.v1ClearFolderSelection=()=>{fileSelection.clear();fileAnchor=null;renderFolderView(currentView.id)};
const _v1RenderFolderViewBase=renderFolderView;
renderFolderView=async function(id){await _v1RenderFolderViewBase(id);if(currentView.kind!=='folder'||currentView.id!==id)return;const bar=el.content.querySelector('.folder-toolbar');if(!bar)return;const total=currentFolderPhysical().length,selected=selectedFilePaths().length;if(total){bar.insertAdjacentHTML('beforeend',`<button class="tool" onclick="v1SelectAllFolderFiles()">Tümünü seç</button>${selected?`<button class="tool" onclick="v1ClearFolderSelection()">Seçimi temizle</button><span class="v1-selection-count">${selected} seçili</span>`:''}`)}};

// One click on a sidebar page/folder opens it; the chevron remains dedicated to expand/collapse.
el.tree?.addEventListener('click',e=>{const main=e.target?.closest?.('.row-main');if(!main||!el.tree.contains(main))return;const row=main.closest('.page-row,.folder-row');if(!row)return;e.preventDefault();e.stopImmediatePropagation();if(row.classList.contains('page-row')){const id=row.dataset.page;if(id)openPage(id)}else{const holder=row.closest('.folder-node');const id=holder?.dataset?.cat;if(id)openFolder(id)}},true);

// V1 navigation history for mouse Back/Forward buttons.
let v1NavHistory=[],v1NavIndex=-1,v1NavApplying=false,v1LastNavAt=0,v1LastNavDelta=0;
function v1NavRoute(){if(!state||!currentView||currentView.kind==='empty')return null;if(currentView.kind==='file')return{kind:'file',path:currentView.path,name:baseName(currentView.path)};return{kind:currentView.kind,id:currentView.id}}
function v1RememberNavigation(route){if(v1NavApplying||!route)return;const key=route.kind==='file'?`file:${norm(route.path)}`:`${route.kind}:${route.id}`,cur=v1NavHistory[v1NavIndex],curKey=cur?(cur.kind==='file'?`file:${norm(cur.path)}`:`${cur.kind}:${cur.id}`):'';if(key===curKey)return;v1NavHistory=v1NavHistory.slice(0,v1NavIndex+1);v1NavHistory.push(route);if(v1NavHistory.length>120)v1NavHistory.shift();v1NavIndex=v1NavHistory.length-1}
const _v1OpenPageBase=openPage,_v1OpenFolderBase=openFolder,_v1OpenFileBase=openFile;
openPage=function(id,tab=true){_v1OpenPageBase(id,tab);if(currentView.kind==='page'&&currentView.id===id)v1RememberNavigation({kind:'page',id})};
openFolder=function(id,tab=true){_v1OpenFolderBase(id,tab);if(currentView.kind==='folder'&&currentView.id===id)v1RememberNavigation({kind:'folder',id})};
openFile=async function(path,name='',tab=true){await _v1OpenFileBase(path,name,tab);if(currentView.kind==='file'&&norm(currentView.path)===norm(path))v1RememberNavigation({kind:'file',path,name:name||baseName(path)})};
async function v1NavigateHistory(delta){const next=v1NavIndex+delta;if(next<0||next>=v1NavHistory.length)return;const route=v1NavHistory[next];v1NavApplying=true;try{v1NavIndex=next;if(route.kind==='page'&&page(route.id))openPage(route.id,false);else if(route.kind==='folder'&&cat(route.id))openFolder(route.id,false);else if(route.kind==='file'&&route.path)await openFile(route.path,route.name||baseName(route.path),false);else{v1NavHistory.splice(next,1);v1NavIndex=Math.min(v1NavIndex,v1NavHistory.length-1)}}finally{v1NavApplying=false}}
function v1RequestHistory(delta){const t=Date.now();if(delta===v1LastNavDelta&&t-v1LastNavAt<120)return;v1LastNavDelta=delta;v1LastNavAt=t;void v1NavigateHistory(delta)}
document.addEventListener('mousedown',e=>{if(e.button===3||e.button===4){e.preventDefault();e.stopImmediatePropagation();v1RequestHistory(e.button===3?-1:1)}},true);
api.onNavigationCommand?.(p=>v1RequestHistory(p?.direction==='forward'?1:-1));

// Reset history when switching workspaces, because page ids are workspace-scoped in the active model.
const _v1SwitchWorkspaceBase=window.v68SwitchWorkspace;
window.v68SwitchWorkspace=async id=>{v1NavApplying=true;try{await _v1SwitchWorkspaceBase(id)}finally{v1NavApplying=false;v1NavHistory=[];v1NavIndex=-1;const route=v1NavRoute();if(route)v1RememberNavigation(route)}};

// Plain Enter on a long line always returns the page to the real left edge, even after Chromium scrolls the caret.
function v1HardResetLeft(rich){if(currentView.kind!=='page'||!el.content)return;el.content.scrollLeft=0;if(rich&&'scrollLeft'in rich)rich.scrollLeft=0;ui.scrollX=ui.scrollX||{};ui.scrollX[`page:${currentView.id}`]=0}
function v1BindEnterReset(){const scope=el.content?.querySelector('#blocks');if(!scope)return;for(const rich of scope.querySelectorAll('[data-edit="rich"]')){if(rich.dataset.v1EnterReset==='1')continue;rich.dataset.v1EnterReset='1';const reset=e=>{if(e.key&&e.key!=='Enter')return;if(e.key==='Enter'&&(e.shiftKey||e.ctrlKey||e.metaKey||e.altKey))return;const go=()=>v1HardResetLeft(rich);queueMicrotask(go);requestAnimationFrame(()=>{go();requestAnimationFrame(go)});setTimeout(go,35);setTimeout(go,100);setTimeout(go,220)};rich.addEventListener('keydown',reset,false);rich.addEventListener('keyup',reset,false);rich.addEventListener('beforeinput',e=>{if(e.inputType==='insertParagraph'||e.inputType==='insertLineBreak')reset(e)},false)}}

// V1 code block renderer with line numbers.
const _v1RenderBlockBase=renderBlock;
renderBlock=function(b,i){if(b.type!=='code')return _v1RenderBlockBase(b,i);const collapsed=v684IsCollapsed(currentView.id,b.id),common=`data-block="${attr(b.id)}" data-index="${i}" ondragover="v68BlockOver(event,'${attr(b.id)}')" ondrop="v68BlockDrop(event,'${attr(b.id)}')"`,tools=`<div class="block-toolbar"><span class="block-grip" title="Sürükle" draggable="true" ondragstart="v68BlockDrag(event,'${attr(b.id)}')" ondragend="v68BlockDragEnd(event)">${iconSvg('grip','sm')}</span><button class="block-more" aria-label="İçerik menüsü" onclick="v68BlockMenu(event,'${attr(b.id)}')">${iconSvg('more','sm')}</button></div>`;return `<div class="block-wrap v684-note-card ${collapsed?'is-collapsed':''}" ${common}>${tools}${v684CollapseButton(b,collapsed)}${v684Summary(b)}<div class="block-body"><div class="v1-code-shell"><pre class="v1-code-lines" aria-hidden="true"></pre><textarea data-edit="code" class="code-area v684-code-area v1-code-area" spellcheck="false" wrap="off" placeholder="Kod veya düz metin…">${esc(b.code||'')}</textarea></div></div></div>`};
function v1BindCodeEditors(){const scope=el.content?.querySelector('#blocks');if(!scope)return;for(const shell of scope.querySelectorAll('.v1-code-shell')){const area=shell.querySelector('.v1-code-area'),nums=shell.querySelector('.v1-code-lines');if(!area||!nums)continue;v11BindControlHistory(area);const update=()=>{const count=Math.max(1,area.value.split('\n').length);nums.textContent=Array.from({length:count},(_,i)=>i+1).join('\n')};update();if(area.dataset.v1Lines!=='1'){area.dataset.v1Lines='1';area.addEventListener('input',update);area.addEventListener('scroll',()=>{nums.scrollTop=area.scrollTop})}}}

const _v1RenderPageFinalBase=renderPage;
renderPage=function(id){_v1RenderPageFinalBase(id);if(currentView.kind==='page'&&currentView.id===id){v1BindCodeEditors();v1BindEnterReset();v692EnhanceInlineMedia()}};


/* ===== Veloria V1 compatibility HF3 - deleted note mirror consistency ===== */
function requireReady(action){
  if(state)return action();
  toast(initError?`Başlatma hatası: ${initError.message||initError}`:'Veloria başlatılıyor…','warn')
}
function showRootFolderModal(){
  requireReady(()=>{modal(`<div class="modal-head"><h3>Yeni kök klasör</h3><span class="grow"></span><button class="icon-btn" onclick="v68CloseModal()">✕</button></div><div class="modal-body"><div class="form-row"><label>Klasör adı</label><input id="rootFolderName" autofocus onkeydown="if(event.key==='Enter')v68CreateRootFolder()"></div><div class="modal-actions"><button class="btn" onclick="v68CloseModal()">İptal</button><button class="btn primary" onclick="v68CreateRootFolder()">Oluştur</button></div></div>`)})
}
function bindStaticUi(){
  const workspaceBtn=document.getElementById('workspaceBtn'),rootAdd=document.getElementById('rootAdd'),quickOpenBtn=document.getElementById('quickOpenBtn'),settingsBtn=document.getElementById('settingsBtn'),storageBtn=document.getElementById('storageBtn');
  if(workspaceBtn)workspaceBtn.onclick=()=>requireReady(workspaceMenu);
  if(rootAdd)rootAdd.onclick=showRootFolderModal;
  if(quickOpenBtn)quickOpenBtn.onclick=()=>requireReady(quickOpen);
  if(settingsBtn)settingsBtn.onclick=()=>requireReady(()=>settings('general'));
  if(storageBtn)storageBtn.onclick=()=>requireReady(()=>showStorage());
  if(el.search)el.search.oninput=()=>{if(state)renderTree()};
}
window.v68CreateRootFolder=()=>{if(!state)return requireReady(()=>{});inlineCreate=null;const input=document.getElementById('rootFolderName');const n=input?.value.trim();if(!n)return;closeModal();const c=createFolder(n,null);if(c){treeSelection={kind:'folder',id:c.id};renderTree()}};

async function init(){
  await loadState();
  // Eski sürümlerde silinmiş sayfaların Dosyalar altında kalan TXT aynalarını temizle.
  // Tüm çalışma alanlarının sayfa kimlikleri geçerlidir; aktif olmayan notlara dokunulmaz.
  try{const cleanup=await api.reconcilePageTexts(allWorkspacePages().map(p=>p.id));if(cleanup?.errors?.length)console.warn('Veloria orphan note mirror cleanup errors:',cleanup.errors)}catch(e){console.warn('Veloria orphan note mirror cleanup:',e)}
  tabs=(ui.openTabs||[]).filter(t=>t.kind==='file'||(t.kind==='page'&&page(t.id))||(t.kind==='folder'&&cat(t.id))).map(t=>({...t,key:t.kind==='file'?`file:${norm(t.path)}`:`${t.kind}:${t.id}`}));
  await refreshScan();
  const existingFilePaths=new Set(scan.files.map(f=>norm(f.nativePath)));
  tabs=tabs.filter(t=>t.kind!=='file'||existingFilePaths.has(norm(t.path)));
  if(ui.selectedTab&&!tabs.some(t=>t.key===ui.selectedTab))ui.selectedTab=tabs[0]?.key||'';
  saveUi();
  el.workspaceName.textContent=currentWorkspaceName();
  api.onNavigate?.(p=>{if(p?.pageId&&page(p.pageId))openPage(p.pageId)});
  api.onShowFile?.(p=>{if(p?.path)openFile(p.path,p.name||baseName(p.path))});
  api.onImportRequest?.(async p=>{const mode=await choiceModal(`${p.count||1} dosya nasıl eklensin?`,[{value:'move',title:'Taşı',sub:'Kaynak konumdan kaldır.'},{value:'copy',title:'Kopyala',sub:'Orijinal yerinde kalsın.'}]);if(!mode)return;let target=state.activePageId&&page(state.activePageId);if(!target){const c=treeSelection?.kind==='folder'?cat(treeSelection.id):catChildren(null)[0];if(!c)return toast('Önce bir klasör oluştur','warn');target=createPage(c.id,'Yeni Sayfa')}try{const r=await api.acceptPendingImport(p.token,{importMode:mode,pageId:target.id,pageTitle:target.title,category:cat(target.categoryId)?.name||'Klasör',categoryPath:catPath(target.categoryId),blockId:uid('blk')});for(const f of r.files||[])target.blocks.push({id:uid('blk'),type:'attachment',name:f.name,size:f.size,nativePath:f.nativePath,relativePath:f.relativePath,displayMode:isImage(f.name)?(ui.defaultImageMode||'gallery'):'list',imageSize:'medium',imageWidth:Number(ui.defaultImageWidth)||240,fileDisplay:ui.defaultFileDisplay||'card',showPath:null});if((r.files||[]).length)touchPage(target);await refreshScan();openPage(target.id);const errs=(r.errors||[]).filter(x=>!x.warning),warns=(r.errors||[]).filter(x=>x.warning);if(errs.length)toast(`${(r.files||[]).length} dosya eklendi · ${errs.length} dosya başarısız: ${errs[0].error||errs[0].name}`,'error');else if(warns.length)toast(warns[0].error||'Dosya eklendi fakat kaynak yerinde kaldı','warn')}catch(e){await refreshScan().catch(()=>{});if(target&&page(target.id))openPage(target.id);toast(e.message,'error')}});
  api.onQuickCaptureSubmit?.(p=>{const text=String(p?.text||'').trim();if(!text)return;let c=catChildren(null)[0];if(!c)c=createFolder('Genel');const pg=createPage(c.id,`Hızlı Not ${new Date().toLocaleDateString('tr-TR')}`);pg.blocks=[{id:uid('blk'),type:'richtext',html:editorUtils.textToHtml(text)}];touchPage(pg);openPage(pg.id)});
  api.onLockRequest?.(()=>showLock());
  const lock=await api.lockStatus().catch(()=>({enabled:false}));
  state.activePageId=null;currentView={kind:'empty',id:'',path:''};ui.selectedTab='';
  renderAll();
  appReady=true;initError=null;
  syncAllCategoryDirectories().then(()=>refreshScan()).catch(e=>console.warn('Veloria directory sync:',e));
  if(lock?.enabled)showLock();
  setInterval(()=>refreshScan().catch(()=>{}),60000);
}

// v1.1: stable literal text editing, external links and session-only tabs.
const v111CutGaps=new WeakMap();
const V111_LINE_TAGS=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','UL','OL','LI','PRE','TR']);
function v111NormalizeParagraphs(rich){
  const paragraphs=[...rich.querySelectorAll('p')].filter(p=>!p.closest('pre,code,[contenteditable="false"]'));if(!paragraphs.length)return;
  const selection=v11Selection(rich);
  for(const p of paragraphs){const line=document.createElement('div');if(p.className)line.className=p.className;while(p.firstChild)line.append(p.firstChild);p.replaceWith(line)}
  if(selection)v11RestoreSelection(rich,selection);
}
function v111FragmentText(container){
  // A paragraph boundary represents one displayed line, even though Chromium's
  // default clipboard text emits two newlines for P and an extra one for empty BRs.
  const read=node=>{
    if(node.nodeType===Node.TEXT_NODE)return node.nodeValue||'';
    if(node.nodeType!==Node.ELEMENT_NODE&&node.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return'';
    if(node.nodeName==='BR')return'\n';
    if(node.nodeName==='PRE'||node.nodeName==='CODE')return node.textContent||'';
    if(node.nodeName==='IMG')return node.getAttribute('alt')||'';
    if(node.hasAttribute?.('data-veloria-inline-file'))return node.getAttribute('data-name')||node.textContent||'';
    const children=[...node.childNodes],isLine=V111_LINE_TAGS.has(node.nodeName);
    if(isLine&&children.length===1&&children[0].nodeName==='BR')return'';
    const hasLines=children.some(n=>V111_LINE_TAGS.has(n.nodeName));
    let out='',previousLine=false,seen=false;
    for(const child of children){
      if(hasLines&&child.nodeType===Node.TEXT_NODE&&/^[\t\r\n ]*$/.test(child.nodeValue||'')&&/[\r\n]/.test(child.nodeValue||''))continue;
      const line=V111_LINE_TAGS.has(child.nodeName),value=read(child);
      if(seen&&(line||previousLine))out+='\n';
      out+=value;previousLine=line;seen=true;
    }
    return out;
  };
  if(container.childNodes.length===1&&container.firstChild.nodeName==='BR')return'';
  return read(container).replace(/\r\n?/g,'\n');
}
function v111ClipboardPlainText(plain,html){
  if(!plain.trim()||!html||!/<(?:p|div)\b/i.test(html))return plain;
  const parsed=new DOMParser().parseFromString(v685SanitizeClipboardHtml(html),'text/html');
  const displayed=v111FragmentText(parsed.body);
  // HTML is used only to correct whitespace, never to add clipboard content.
  return displayed.replace(/\s/g,'')===plain.replace(/\s/g,'')?displayed:plain;
}
function v111TextOffset(rich,node,offset){const r=document.createRange();r.selectNodeContents(rich);r.setEnd(node,offset);return r.toString().length}
function v111TextPoint(rich,offset){const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let node,last;while((node=walker.nextNode())){last=node;if(offset<=node.length)return[node,offset];offset-=node.length}return last?[last,last.length]:[rich,0]}
function v111JoinCutSpaces(rich,left,right,selected){
  const before=left.match(/[^\s]([ \t\u00a0]+)$/),after=right.match(/^([ \t\u00a0]+)[^\s]/);
  const removedBothSeparators=!before&&!after&&/[^\s]$/.test(left)&&/^[^\s]/.test(right)&&/^[ \t\u00a0]|[ \t\u00a0]$/.test(selected);
  const caret=v685RangeInside(rich);if((!before||!after)&&!removedBothSeparators||!caret?.collapsed)return null;
  const offset=v111TextOffset(rich,caret.startContainer,caret.startOffset),start=offset-(before?.[1].length||0),end=offset+(after?.[1].length||0);
  const a=v111TextPoint(rich,start),b=v111TextPoint(rich,end),range=document.createRange();range.setStart(a[0],a[1]);range.setEnd(b[0],b[1]);
  range.deleteContents();const gap=document.createTextNode(' ');range.insertNode(gap);v685SetCaretAfter(gap);
  return{start,end:start+1};
}
function v111BindClipboard(rich){
  const copy=(event,cut)=>{
    const range=v685RangeInside(rich);if(!event.clipboardData||!range||range.collapsed)return;
    const fragment=range.cloneContents(),holder=document.createElement('div');holder.append(fragment);
    const selected=v111FragmentText(holder);event.clipboardData.setData('text/plain',selected);
    event.clipboardData.setData('text/html',v690SerializeRich(holder));event.preventDefault();
    if(!cut)return;
    const prefix=range.cloneRange(),suffix=range.cloneRange();prefix.selectNodeContents(rich);prefix.setEnd(range.startContainer,range.startOffset);suffix.selectNodeContents(rich);suffix.setStart(range.endContainer,range.endOffset);
    const left=v111FragmentText(prefix.cloneContents()),right=v111FragmentText(suffix.cloneContents());
    const element=node=>node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;
    const inCode=(element(range.startContainer)?.closest('pre,code')||element(range.endContainer)?.closest('pre,code'));
    v692HistoryCheckpoint(rich);let gap=null;v692ApplyingHistory=true;
    try{if(!document.execCommand('delete',false)){range.deleteContents();range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range)}if(!inCode)gap=v111JoinCutSpaces(rich,left,right,selected)}finally{v692ApplyingHistory=false}
    v685DispatchInput(rich,'deleteByCut');
    if(gap)v111CutGaps.set(rich,{...gap,html:v690SerializeRich(rich)});else v111CutGaps.delete(rich);
  };
  rich.addEventListener('copy',event=>copy(event,false));
  rich.addEventListener('cut',event=>copy(event,true));
}
function v111PrepareGapPaste(rich,text){
  const gap=v111CutGaps.get(rich);v111CutGaps.delete(rich);const caret=v685RangeInside(rich);
  if(!text||!gap||!caret?.collapsed||gap.html!==v690SerializeRich(rich)||v111TextOffset(rich,caret.startContainer,caret.startOffset)!==gap.end)return text;
  // Replacing a word immediately after cutting it restores its separators, while
  // the empty cut location itself contains only one space.
  const a=v111TextPoint(rich,gap.start),b=v111TextPoint(rich,gap.end),range=document.createRange();range.setStart(a[0],a[1]);range.setEnd(b[0],b[1]);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  return `${/^[\s]/.test(text)?'':' '}${text}${/[\s]$/.test(text)?'':' '}`;
}
function v11StillViewingFile(path){return currentView.kind==='file'&&norm(currentView.path)===norm(path)}
function v11BindControlHistory(area){
  if(area.dataset.v11History)return;area.dataset.v11History='1';
  const snapshot=()=>({value:area.value,start:area.selectionStart,end:area.selectionEnd,direction:area.selectionDirection});
  let current=snapshot(),applying=false;const history={undo:[],redo:[]};
  const apply=(from,to)=>{const present=snapshot();let previous;while(history[from].length){const candidate=history[from].pop();if(candidate.value!==present.value){previous=candidate;break}}if(!previous)return;history[to].push(present);applying=true;try{area.value=previous.value;area.setSelectionRange(previous.start,previous.end,previous.direction);v685DispatchInput(area,from==='undo'?'historyUndo':'historyRedo')}finally{applying=false}current=snapshot()};
  area.addEventListener('beforeinput',e=>{if(e.inputType==='historyUndo'||e.inputType==='historyRedo'){e.preventDefault();apply(e.inputType==='historyUndo'?'undo':'redo',e.inputType==='historyUndo'?'redo':'undo')}else current=snapshot()},true);
  area.addEventListener('keydown',e=>{current=snapshot();if((e.ctrlKey||e.metaKey)&&!e.altKey){const k=e.key.toLowerCase();if(k==='z'||k==='y'){e.preventDefault();e.stopImmediatePropagation();const redo=k==='y'||e.shiftKey;apply(redo?'redo':'undo',redo?'undo':'redo')}}},true);
  area.addEventListener('input',()=>{if(applying)return;if(current.value!==area.value){history.undo.push(current);if(history.undo.length>120)history.undo.shift();history.redo.length=0}current=snapshot()},true);
}
const v11RenderFileBase=renderFile;
renderFile=async function(path,name){await v11RenderFileBase(path,name);if(fileEditor?.area)v11BindControlHistory(fileEditor.area)};
function v11LinkifyRich(rich){
  const selection=getSelection();
  const offset=node=>{const r=document.createRange();r.selectNodeContents(rich);r.setEnd(node[0],node[1]);return r.toString().length};
  let saved=null;
  if(selection?.rangeCount&&rich.contains(selection.anchorNode)&&rich.contains(selection.focusNode))saved={anchor:offset([selection.anchorNode,selection.anchorOffset]),focus:offset([selection.focusNode,selection.focusOffset]),anchorNode:selection.anchorNode,anchorOffset:selection.anchorOffset,focusNode:selection.focusNode,focusOffset:selection.focusOffset};
  let changed=false;
  for(const a of rich.querySelectorAll('a[data-veloria-auto-link]')){
    a.replaceWith(document.createTextNode(a.textContent||''));changed=true;
  }
  rich.normalize();
  const walker=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT),nodes=[];let node;
  while((node=walker.nextNode()))if(!node.parentElement.closest('a,pre,code,[contenteditable="false"]'))nodes.push(node);
  for(const text of nodes){if(!editorUtils.findLinks(text.nodeValue||'').length)continue;const tpl=document.createElement('template');tpl.innerHTML=editorUtils.textToHtml(text.nodeValue);text.replaceWith(tpl.content);changed=true}
  if(changed&&saved){
    const point=value=>{const w=document.createTreeWalker(rich,NodeFilter.SHOW_TEXT);let n,last=null;while((n=w.nextNode())){last=n;if(value<=n.length)return[n,value];value-=n.length}return last?[last,last.length]:[rich,0]};
    const preserved=(node,position,value)=>node!==rich&&node.isConnected?[node,Math.min(position,node.nodeType===Node.TEXT_NODE?node.length:node.childNodes.length)]:point(value);
    const a=preserved(saved.anchorNode,saved.anchorOffset,saved.anchor),f=preserved(saved.focusNode,saved.focusOffset,saved.focus);selection.setBaseAndExtent(a[0],a[1],f[0],f[1]);
  }
}
el.content.addEventListener('click',e=>{
  const anchor=e.target.closest?.('[data-edit="rich"] a[href]');if(!anchor)return;
  e.preventDefault();e.stopPropagation();const href=v1SafeHref(anchor.getAttribute('href'));if(href)api.openExternal(href).catch(()=>toast('Bağlantı açılamadı. Varsayılan tarayıcı ayarını kontrol et.','error'));
});
el.content.addEventListener('mousedown',e=>{if(e.button===0&&e.target.closest?.('[data-edit="rich"] a[href]'))e.preventDefault()});

async function v11CloseTabs(keys){
  const closing=new Set(keys);if(!closing.size)return;closeContext();
  if(fileEditor?.dirty&&closing.has(`file:${norm(fileEditor.path)}`)){
    try{await api.saveDraft(draftKey(fileEditor.path),fileEditor.area.value)}catch{toast('Taslak kaydedilemedi; dosya sekmesi açık bırakıldı.','error');return}
  }
  const index=tabs.findIndex(t=>t.key===ui.selectedTab),activeClosed=closing.has(ui.selectedTab);
  saveScroll();tabs=tabs.filter(t=>!closing.has(t.key));
  if(activeClosed){const next=tabs[Math.min(Math.max(0,index-1),tabs.length-1)];if(next)activateTab(next.key);else{ui.selectedTab='';state.activePageId=null;currentView={kind:'empty',id:'',path:''};if(externalWatchTimer)clearInterval(externalWatchTimer);renderContent()}}
  renderTabs();saveUi();
}
closeTab=function(key,e){e?.stopPropagation();return v11CloseTabs([key])};
function v11TabMenu(event,key){
  event.preventDefault();event.stopPropagation();const index=tabs.findIndex(t=>t.key===key);if(index<0)return;
  window.v11TabAction=mode=>{const keys=tabs.filter((t,i)=>mode==='all'||(mode==='this'&&t.key===key)||(mode==='other'&&t.key!==key)||(mode==='left'&&i<index)||(mode==='right'&&i>index)).map(t=>t.key);void v11CloseTabs(keys)};
  showContext(event.clientX,event.clientY,`<button onclick="v11TabAction('this')">Sekmeyi kapat <small>Ctrl+W</small></button><button onclick="v11TabAction('other')" ${tabs.length<2?'disabled':''}>Diğer sekmeleri kapat</button><button onclick="v11TabAction('left')" ${index===0?'disabled':''}>Soldaki sekmeleri kapat</button><button onclick="v11TabAction('right')" ${index===tabs.length-1?'disabled':''}>Sağdaki sekmeleri kapat</button><hr><button onclick="v11TabAction('all')">Tüm sekmeleri kapat</button>`);
}
renderTabs=function(){
  const fragment=document.createDocumentFragment();
  for(const tab of tabs){
    const model=tab.kind==='page'?page(tab.id):tab.kind==='folder'?cat(tab.id):fileMeta(tab.path),visual=v682Visual(model||{});
    const button=document.createElement('button');button.type='button';button.className=`tab ${ui.selectedTab===tab.key?'active':''} ${visual.classes}`;button.dataset.tabKey=tab.key;button.title=tab.title||tab.name||'İsimsiz';
    const styles=document.createElement('template');styles.innerHTML=`<span ${v682StyleAttr(visual)}></span>`;const style=styles.content.firstElementChild?.getAttribute('style');if(style)button.setAttribute('style',style);
    const icon=document.createElement('span');icon.className='tab-icon';icon.innerHTML=iconSvg(tab.kind==='file'?fileIconKey(tab.name,model?.icon):model?.icon||(tab.kind==='page'?'note':'folder'),'sm');
    const title=document.createElement('span');title.className='tab-title';title.textContent=button.title;button.append(icon,title);
    if(tab.dirty){const dirty=document.createElement('span');dirty.className='dirty';dirty.textContent='•';button.append(dirty)}
    const close=document.createElement('span');close.className='close';close.setAttribute('aria-label','Sekmeyi kapat');close.innerHTML=iconSvg('close','sm');close.addEventListener('click',e=>void closeTab(tab.key,e));button.append(close);
    button.addEventListener('click',()=>activateTab(tab.key));button.addEventListener('contextmenu',e=>v11TabMenu(e,tab.key));button.addEventListener('auxclick',e=>{if(e.button===1){e.preventDefault();void closeTab(tab.key,e)}});fragment.append(button);
  }
  el.tabs.replaceChildren(fragment);
};
let v11LastRoute='',v11Motion=null;
function v11AnimateView(){
  const route=`${currentView.kind}:${currentView.id||norm(currentView.path)}`;if(route===v11LastRoute)return;v11LastRoute=route;v11Motion?.cancel();
  if(!appReady||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const view=el.content.firstElementChild;if(view)v11Motion=view.animate([{opacity:.25,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:160,easing:'ease-out'});
}
const v11OpenPageBase=openPage,v11OpenFolderBase=openFolder,v11OpenFileBase=openFile;
openPage=function(id,tab=true){if(currentView.kind==='page'&&currentView.id===id&&el.content.querySelector('[data-page-view]'))return;v11OpenPageBase(id,tab);v11AnimateView()};
openFolder=function(id,tab=true){if(currentView.kind==='folder'&&currentView.id===id&&el.content.querySelector('.folder-view'))return;v11OpenFolderBase(id,tab);v11AnimateView()};
openFile=async function(path,name='',tab=true){if(currentView.kind==='file'&&norm(currentView.path)===norm(path)&&fileEditor?.area?.isConnected)return;await v11OpenFileBase(path,name,tab);v11AnimateView()};
window.v68OpenFile=(path,name)=>openFile(path,name);window.v68CloseTab=closeTab;
api.onBeforeClose?.(async()=>{
  try{
    if(!state){await api.readyToClose();return}
    const pending=[];for(const id of pageTxtTimers.keys()){cancelPageTxtSave(id);const p=page(id);if(p)pending.push(schedulePageTxt(p,true))}
    if(fileEditor?.dirty)pending.push(api.saveDraft(draftKey(fileEditor.path),fileEditor.area.value));
    captureWorkspace();clearTimeout(saveTimer);pending.push(api.saveAppState(JSON.stringify(state)));syncOpenTabs();pending.push(api.saveUiState(JSON.stringify(ui)));
    await Promise.all(pending);await api.readyToClose();
  }catch{toast('Son değişiklikler kaydedilemedi. Pencere açık bırakıldı; tekrar kaydetmeyi dene.','error')}
});

window.v68OpenFolder=openFolder;window.v68OpenPage=openPage;window.v68Undo=undo;
bindStaticUi();
const _v1SanitizedSerializeRichBase=v690SerializeRich;
v690SerializeRich=function(target){return v1SanitizeRichHtml(_v1SanitizedSerializeRichBase(target))};

init().catch(e=>{appReady=false;initError=e;console.error(e);el.content.innerHTML=`<div class="empty-main"><div><h2>Veloria Notes başlatılamadı</h2><div>${esc(e.message||String(e))}</div><button class="btn primary" style="margin-top:14px" onclick="veloriaDesktop.openRoot()">Veloria Dosyalar'ı aç</button></div></div>`});
})();
