// ==UserScript==
// @name         Fister Plugin Manager
// @namespace    fister-plugins.local
// @version      1.1.2
// @description  A mod manager for Fister: browse, install, turn on/off, configure and update plugins from its own Plugins tab in Settings. Works on its own or alongside FisterQoL.
// @match        https://fister.fun/*
// @match        https://www.fister.fun/*
// @exclude      https://fister.fun/assets/*
// @exclude      https://www.fister.fun/assets/*
// @run-at       document-start
// @sandbox      JavaScript
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      gist.githubusercontent.com
// @connect      abacus.jasoncameron.dev
// @connect      translate.googleapis.com
// @connect      *
// @updateURL    https://raw.githubusercontent.com/jaxonb423/fister-plugin-manager/main/FisterPluginManager.user.js
// @downloadURL  https://raw.githubusercontent.com/jaxonb423/fister-plugin-manager/main/FisterPluginManager.user.js
// @noframes
// ==/UserScript==
(function(){
'use strict';
const W=typeof unsafeWindow!=='undefined'?unsafeWindow:window;
if(new URL(location.href).pathname!=='/'||W.__fpm)return;
const VERSION='1.1.2';
const REPO='https://raw.githubusercontent.com/jaxonb423/fister-plugin-manager/main/';
const CATALOG_URL=REPO+'catalog.json';
const PARSER={sha256:'8df29c13797bab293a47ce2d334bdb4dd147b6f6a3830f0c7c94efa99e290b8d',url:REPO+'dist/fpm-parser-1.0.0-8df29c1379.json'};
const SAFE=new URL(location.href).searchParams.get('plugins')==='off';

// ======================================================================
// Network: Tampermonkey fetch for plugin code and the catalog (any https address)
// ======================================================================
function httpGet(url,timeout=20000){return new Promise((resolve,reject)=>{let u;try{u=new URL(url);}catch{reject(Error('That is not a web address.'));return;}
 if(u.protocol!=='https:'){reject(Error('Only https:// addresses are allowed.'));return;}
 if(typeof GM_xmlhttpRequest!=='function'){fetch(u.href,{cache:'no-store'}).then(r=>r.text().then(t=>r.ok?resolve(t):reject(Error('HTTP '+r.status)))).catch(e=>reject(Error('Could not reach '+u.host+' ('+(e?.message||e)+')')));return;}
 GM_xmlhttpRequest({method:'GET',url:u.href,timeout,headers:{'Cache-Control':'no-cache'},anonymous:true,
  onload:r=>r.status>=200&&r.status<300?resolve(String(r.responseText||'')):reject(Error('HTTP '+r.status+' from '+u.host)),onerror:()=>reject(Error('Could not reach '+u.host)),ontimeout:()=>reject(Error(u.host+' took too long'))});});}
const addScript=code=>{const host=document.head||document.documentElement;if(typeof GM_addElement==='function')return GM_addElement(host,'script',{textContent:code});const s=document.createElement('script');s.textContent=code;host.appendChild(s);s.remove();return null;};

// ======================================================================
// The shared core (window.__fpm): what the patched game calls into
// ======================================================================
const bus=new Map(),sticky=new Map();
function emit(name,data){if(name==='ready'||name==='roundStart')sticky.set(name,data);for(const fn of [...(bus.get(name)||[])])try{fn(data);}catch(e){console.warn('[Fister Plugins] listener for',name,'failed:',e);}}
function listen(name,fn){let set=bus.get(name);if(!set)bus.set(name,set=new Set());set.add(fn);if(sticky.has(name)&&name==='ready')queueMicrotask(()=>{try{fn(sticky.get(name));}catch{}});return()=>set.delete(fn);}
const game={client:null,scene:null,getters:null,patched:false,hookedBy:null};
const localId=()=>{const sc=game.scene;return sc?.localPlayerId??sc?.latestLocalPlayerState?.id??null;};
const nameOf=id=>{try{return game.scene?.players?.get?.(id)?.username??null;}catch{return null;}};
const watched=new WeakSet();
const hook={
 // the network client the game plays combat sounds from
 client(c){if(!c||typeof c!=='object'||watched.has(c))return;watched.add(c);game.client=c;
  const on=(n,f)=>{try{if(typeof c[n]==='function')c[n](e=>{try{f(e||{});}catch(err){console.warn('[Fister Plugins]',n,err);}});}catch{}};
  on('onKill',e=>{const me=localId(),myName=me!=null?nameOf(me):null;emit('kill',{killerId:e.killerId??null,victimId:e.victimId??null,killer:e.killerUsername??nameOf(e.killerId),victim:e.victimUsername??nameOf(e.victimId),
   byMe:(me!=null&&e.killerId===me)||(!!myName&&e.killerUsername===myName),ofMe:(me!=null&&e.victimId===me)||(!!myName&&e.victimUsername===myName),method:e.method??null,raw:e});});
  on('onParrySuccess',e=>{const me=localId();emit('parry',{defenderId:e.defenderId,attackerId:e.attackerId,byMe:me!=null&&e.defenderId===me,againstMe:me!=null&&e.attackerId===me,raw:e});});
  on('onAirKickStart',e=>{const me=localId();emit('airKick',{playerId:e.playerId,byMe:me!=null&&e.playerId===me,raw:e});});
  on('onPunch',e=>{const me=localId();emit('punch',{playerId:e.playerId,victimId:e.victimId??null,hit:!!e.hitPlayer,strength:e.strength??null,byMe:me!=null&&e.playerId===me,onMe:me!=null&&e.victimId===me,raw:e});});},
 boot(getters){game.getters=getters;const tick=()=>{try{const g=getters();if(g.scene)game.scene=g.scene;}catch{}if(game.scene){emit('ready',{scene:game.scene});return;}setTimeout(tick,250);};tick();},
 emit(name){if(name==='roundEnd'||name==='matchEnd')sticky.delete('roundStart');emit(name,{});},
 panel(el){if(el&&!el.dataset.fpm){el.dataset.fpm='1';mountManager(el,false);}}};
Object.defineProperty(W,'__fpm',{value:{version:VERSION,hook,define:(id,fn)=>defineFromScript(id,fn),get game(){return game;}},configurable:false,writable:false});

// ======================================================================
// Hooks added to the game's main module (applied by FisterQoL when it is
// installed, or by our own loader when it is not)
// ======================================================================
function fpmPatch(source){
 const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('changed');return s.replace(a,()=>b);};
 const one=(s,re,label)=>{const v=[...new Set([...s.matchAll(new RegExp(re.source,'g'))].map(m=>m[1]))];if(v.length!==1)throw Error(label);return v[0];};
 const missed=[];
 // combat events
 try{const i=source.indexOf('.onParrySuccess(');if(i<0)throw Error('combat');const f=source.lastIndexOf('function ',i);
  const m=source.slice(f,i).match(/^function [\w$]+\(([\w$]+),[\w$]+,[\w$]+\)\{/);if(!m||source.slice(i-m[1].length,i)!==m[1])throw Error('combat');
  source=source.slice(0,f+m[0].length)+'try{window.__fpm.hook.client('+m[1]+');}catch(e){}'+source.slice(f+m[0].length);}catch{missed.push('combat events');}
 // rounds
 const before=source;
 source=source.replace(/onRoundEnd:([\w$]+)=>\{/g,m=>m+'try{window.__fpm.hook.emit("roundEnd");}catch(e){}');
 source=source.replace(/onMatchEnd:([\w$]+)=>\{/g,m=>m+'try{window.__fpm.hook.emit("matchEnd");}catch(e){}');
 source=source.replace(/onRoundStart:\(\)=>\{/g,m=>m+'try{window.__fpm.hook.emit("roundStart");}catch(e){}');
 source=source.replace(/onGameStart:(?:[\w$]+|\(\))=>\{/g,m=>m+'try{window.__fpm.hook.emit("roundStart");}catch(e){}');
 if(source===before)missed.push('round events');
 // the Plugins tab in Settings
 try{const jsx=one(source,/function [\w$]+\(\{className:e,compact:t=!1,type:n=`button`,\.\.\.r\}\)\{return\(0,([\w$]+)\.jsx\)/,'jsx');
  const esc=jsx.replace(/[$]/g,'\\$');
  const tab=source.match(new RegExp('\\(0,'+esc+'\\.jsx\\)\\(([\\w$]+),\\{active:!0,dataTab:"settings-main",id:"settings-main-tab",title:"General"\\}\\)'));if(!tab)throw Error('tab');
  const panel=one(source,/function ([\w$]+)\(\)\{return\(0,[\w$]+\.jsxs\)\(`div`,\{className:"settings-tab-content active",id:"settings-main"/,'panel');
  const call='(0,'+jsx+'.jsx)';
  source=once(source,tab[0],tab[0]+','+call+'('+tab[1]+',{dataTab:"settings-plugins",id:"settings-plugins-tab",title:"Plugins"})');
  source=once(source,call+'('+panel+',{})',call+'(__fpmPluginsPanel,{}),'+call+'('+panel+',{})');
  source='function __fpmPluginsPanel(){return '+call+'("div",{className:"settings-tab-content",id:"settings-plugins",role:"tabpanel","aria-labelledby":"settings-plugins-tab",hidden:!0,ref:function(e){try{e&&window.__fpm.hook.panel(e);}catch(x){}}});}\n'+source;}
 catch{missed.push('Plugins tab (Ctrl+Shift+P still opens it)');}
 // the game scene (players, local player)
 try{const scene=one(source,/([\w$]+)\.getCanvas\(\)/,'scene');source+='\n;try{window.__fpm.hook.boot(function(){return {scene:'+scene+'};});}catch(e){}\n';}catch{missed.push('game scene');}
 game.patched=true;game.missed=missed;if(missed.length)console.warn('[Fister Plugins] Some hooks did not match this game version:',missed.join(', '));
 return source;}
const hooks=Array.isArray(W.__fisterPatchHooks)?W.__fisterPatchHooks:(W.__fisterPatchHooks=[]);
// Only touch the game's loading when an installed plugin can use game events. With no plugins (or only
// userscripts like FisterQoL) the game loads exactly as it would without the Plugin Manager.
const HOOKS_KEY='fpm-hooks-v1';
const wantHooks=(()=>{try{return localStorage.getItem(HOOKS_KEY)==='1';}catch{return false;}})();
game.hooksOn=!SAFE&&wantHooks;
if(game.hooksOn)hooks.push({id:'fister-plugin-manager',version:VERSION,name:'Fister Plugin Manager',patch:s=>{game.hookedBy=game.hookedBy||'FisterQoL';return fpmPatch(s);}});

// ======================================================================
// Our own loader, used only when FisterQoL is not loading the game
// ======================================================================
const LOADER=(()=>{
 const regexName=n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 function binding(source,pattern,label,group=1){const v=[...new Set([...source.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'))].map(m=>m[group]))];if(v.length!==1)throw Error('Cannot identify '+label+'.');return v[0];}
 const importBindings=source=>[...source.matchAll(/import\{([^}]+)\}from["'`]([^"'`]+)["'`]/g)].map(m=>({path:m[2],names:Object.fromEntries(m[1].split(',').map(x=>x.trim().split(/\s+as\s+/)).map(([a,b])=>[a,b||a]))}));
 function absoluteImports(source,url){
  source=source.replace(/\bfrom\s*(["'`])(\.{1,2}\/[^"'`$]+)\1/g,(_a,q,p)=>'from'+q+new URL(p,url).href+q);
  source=source.replace(/\bimport\(\s*(["'`])(\.{1,2}\/[^"'`$]+)\1\s*\)/g,(_a,q,p)=>'import('+q+new URL(p,url).href+q+')');
  source=source.replace(/\bimport\s*(["'])(\.{1,2}\/[^"'$]+)\1/g,(_a,q,p)=>'import '+q+new URL(p,url).href+q);
  return source.replace(/\bimport\.meta\.url\b/g,JSON.stringify(url));}
 function readableClient(source){const P=W.__fisterParser;
  const decoder=source.match(/function ([\w$]+)\(([\w$]+),[\w$]+\)\{return \2-=0,([\w$]+)\(\)\[\2\]\}/);if(!decoder)throw Error('Unsupported client string table.');
  const tableStart=source.indexOf('function '+decoder[3]+'(){'),parseStart=source.indexOf('JSON.parse(`',tableStart);if(tableStart<0||parseStart<0)throw Error('Client string table not found.');
  const literal=P.parseExpressionAt(source,parseStart+'JSON.parse('.length,{ecmaVersion:'latest'});
  const template=literal.type==='CallExpression'&&literal.callee.type==='MemberExpression'?literal.callee.object:literal;
  if(template.type!=='TemplateLiteral'||template.expressions.length)throw Error('Unsupported client string table encoding.');
  const table=JSON.parse(template.quasis[0].value.cooked.replace(/[A-Za-z]/g,c=>String.fromCharCode(c.charCodeAt(0)+(c.toLowerCase()<='m'?13:-13))));
  const ast=P.parse(source,{ecmaVersion:'latest',sourceType:'module',ranges:true}),scopes=P.analyze(ast,{ecmaVersion:2022,sourceType:'module'});
  const variable=scopes.scopes.flatMap(s=>s.variables).find(v=>v.name===decoder[1]&&v.defs.some(d=>d.type==='FunctionName'&&d.node.start===source.indexOf(decoder[0])));
  if(!variable)throw Error('Cannot resolve client string decoder.');const edits=[];
  for(const ref of variable.references){const name=ref.identifier,call=source.slice(name.end,name.end+24).match(/^\((\d+)\)/);if(!call)continue;
   if(typeof table[Number(call[1])]!=='string')throw Error('Invalid client string-table index.');edits.push({start:name.start,end:name.end+call[0].length,text:JSON.stringify(table[Number(call[1])])});}
  edits.sort((a,b)=>a.start-b.start);let cursor=0;const chunks=[];for(const e of edits){chunks.push(source.slice(cursor,e.start),e.text);cursor=e.end;}chunks.push(source.slice(cursor));return chunks.join('');}
 function bootstrapInfo(raw,url){const source=readableClient(raw),imports=importBindings(source);
  const candidates=[...source.matchAll(/import\(\s*(["'`])(\.\/[^"'`]+\.js)\1\s*\),[\w$]+\(\[([\d,]+)\]\)/g)].map(m=>({path:m[2],count:m[3].split(',').length})).sort((a,b)=>b.count-a.count);
  if(!candidates.length||candidates[0].count===candidates[1]?.count)throw Error('Cannot identify the game runtime import.');
  const replaceChildren=binding(source,/([\w$]+)="replaceChildren"/,'DOM replacement helper');
  const guardName=binding(source,new RegExp('\\['+regexName(replaceChildren)+'\\]\\([^)]*\\),([\\w$]+)\\('),'DOM guard');
  const bootName=binding(source,/\(([\w$]+)\(\),[\w$]+\(\(\)=>import\(/,'boot preparation');
  const guards=imports.filter(i=>i.names.n===guardName),preps=imports.filter(i=>i.names.t===bootName);if(guards.length!==1||preps.length!==1)throw Error('Cannot identify native loading helpers.');
  const filesMatch=source.match(/m\.f=\[(.*?)\]/s),files=filesMatch?JSON.parse('['+filesMatch[1]+']'):[];
  const html=binding(source,/(["'`])(\/runtime-ui\.html[^"'`]*?)\1/,'runtime UI',2),versions=[...source.matchAll(/encodeURIComponent\("([^"\n]+)"\)/g)],version=versions.find(m=>/^[a-f\d]+:\d+$/.test(m[1]))?.[1];
  return {mainUrl:new URL(candidates[0].path,url).href,guardUrl:new URL(guards[0].path,url).href,bootUrl:new URL(preps[0].path,url).href,files,htmlUrl:new URL(html+(html.includes('?')?'':'?v=')+(version?encodeURIComponent(version):''),url).href};}
 async function getText(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),15000);try{const r=await fetch(url,{credentials:'include',cache:'no-store',signal:c.signal});if(!r.ok)throw Error('Could not load '+url+' ('+r.status+')');return await r.text();}finally{clearTimeout(t);}}
 async function sha256(text){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
 async function parser(){if(W.__fisterParser)return;let text=await idb('cache','readonly',s=>s.get(PARSER.sha256)).catch(()=>null);
  if(typeof text!=='string'){text=await httpGet(PARSER.url,45000);if(await sha256(text)!==PARSER.sha256)throw Error('The code parser on GitHub does not match this script.');idb('cache','readwrite',s=>{s.clear();return s.put(text,PARSER.sha256);}).catch(()=>{});}
  addScript(JSON.parse(text).parser+'\n;window.__fisterParser=__fisterParser;');if(!W.__fisterParser)throw Error('Could not start the code parser.');}
 let promise=null;
 async function load(){
  if(document.readyState==='loading')await new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true}));
  const entry=[...document.querySelectorAll('script[type=module][src]')].find(el=>new URL(el.src,location.href).pathname.startsWith('/assets/'));
  if(!entry)throw Error('The game bootstrap was not found.');
  const entryUrl=new URL(entry.src,location.href).href;let info,patched=null;
  try{await parser();info=bootstrapInfo(await getText(entryUrl),entryUrl);
   const key='fpm:'+VERSION+'|'+info.mainUrl;const hit=await idb('cache','readonly',s=>s.get(key)).catch(()=>null);
   if(typeof hit==='string')patched=hit;else{const raw=await getText(info.mainUrl);let src=readableClient(raw);game.hookedBy='Plugin Manager';src=fpmPatch(src);patched=absoluteImports(src,info.mainUrl);idb('cache','readwrite',s=>s.put(patched,key)).catch(()=>{});}
   if(typeof hit==='string')game.hookedBy='Plugin Manager';}
  catch(error){console.warn('[Fister Plugins] Could not hook the game; starting it normally.',error);game.loadError=String(error?.message||error);if(!info)throw error;}
  const root=document.getElementById('runtime-ui-root');
  if(root&&root.dataset.loaded!=='1'){const t=document.createElement('template');t.innerHTML=await getText(info.htmlUrl);root.replaceChildren(t.content);root.dataset.loaded='1';}
  for(const file of info.files.filter(f=>f.endsWith('.css'))){const href=new URL('/'+file,location.origin).href;if(![...document.querySelectorAll('link[href]')].some(l=>l.href===href)){const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);}}
  return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('The game took too long to start.')),45000);
   W.__fpmMainResolve=()=>{clearTimeout(timer);resolve({});};
   const code='import {n as __g} from '+JSON.stringify(info.guardUrl)+';\nimport {t as __b} from '+JSON.stringify(info.bootUrl)+';\n__b();__g(document.getElementById("runtime-ui-root")||document);\n'+
    (patched||'await import('+JSON.stringify(info.mainUrl)+');')+'\n;globalThis.__fpmMainResolve();\n';
   if(typeof GM_addElement==='function')GM_addElement(document.head,'script',{type:'module',id:'fpm-native-module',textContent:code});
   else{const s=document.createElement('script');s.type='module';s.id='fpm-native-module';s.textContent=code;document.head.appendChild(s);}});}
 // The game reads this promise when it starts. FisterQoL claims it too; whoever is there when the game asks wins,
 // and QoL always replaces ours (we return nothing while the page is still loading, which is when QoL checks).
 function claim(){const d=Object.getOwnPropertyDescriptor(W,'__fisterRuntimeBootPromise');if(d&&(d.get||d.value))return false;
  Object.defineProperty(W,'__fisterRuntimeBootPromise',{configurable:true,get(){if(document.readyState==='loading'&&!promise)return undefined;
    if(!promise)promise=load().catch(e=>{console.error('[Fister Plugins] loading failed',e);Object.defineProperty(W,'__fisterRuntimeBootPromise',{configurable:true,writable:true,value:undefined});throw e;});return promise;},
   set(v){promise=v==null?null:v;}});return true;}
 return {claim};})();

// ======================================================================
// Userscript plugins (like FisterQoL) start here, before the game loads, so they can patch it.
// Their code is kept in localStorage because IndexedDB can't be read this early.
// ======================================================================
const EARLY_KEY='fpm-early-v1';
const earlyStore={read(){try{const v=JSON.parse(localStorage.getItem(EARLY_KEY)||'{}');return v&&typeof v==='object'?v:{};}catch{return {};}},
 write(v){try{localStorage.setItem(EARLY_KEY,JSON.stringify(v));return true;}catch(e){console.warn('[Fister Plugins] could not keep a userscript plugin for the next start',e);return false;}},
 put(rec){const v=this.read();if(rec.enabled&&rec.meta.kind==='userscript')v[rec.id]={code:rec.code,version:rec.meta.version,name:rec.meta.name};else delete v[rec.id];return this.write(v);},
 drop(id){const v=this.read();delete v[id];this.write(v);}};

// FisterQoL's "Early hook": hold the game's start until QoL (started below) attaches, so the game can't
// start before QoL has hooked in. If QoL doesn't attach in time, or crashes, the game starts normally.
function qolEarlyHook(){if(W.__fisterQolEarlyHook||W.__fisterQolBrowserLoading||Object.getOwnPropertyDescriptor(W,'__fisterRuntimeBootPromise'))return;  // QoL from Tampermonkey is already in charge
 let boot=null,hold=null,release=null,done=false;
 const native=()=>{if(done)return;done=true;delete W.__fisterQolEarlyHook;
  Object.defineProperty(W,'__fisterRuntimeBootPromise',{configurable:true,writable:true,value:undefined});
  const load=W.__fisterLoadRuntime;release?.(typeof load==='function'?load('qol-early-hook'):undefined);};
 const timer=setTimeout(native,10000);
 Object.defineProperty(W,'__fisterQolEarlyHook',{configurable:true,value:{version:VERSION,by:'Fister Plugin Manager',
  attach(b){if(done||!b||typeof b.get!=='function')return;done=true;clearTimeout(timer);boot=b;
   Object.defineProperty(W,'__fisterRuntimeBootPromise',{configurable:true,get:b.get,set:b.set});if(release)release(b.get());},
  giveUp:native}});
 Object.defineProperty(W,'__fisterRuntimeBootPromise',{configurable:true,
  get(){if(boot)return boot.get();if(done)return undefined;return hold||(hold=new Promise(r=>{release=r;}));},
  set(v){if(boot)boot.set(v);else if(v==null){hold=null;release=null;}}});}
const earlyRan=new Map();   // id -> 'started' | error text
function runEarly(id,entry){const grants={GM_xmlhttpRequest:typeof GM_xmlhttpRequest==='function'?GM_xmlhttpRequest:undefined,GM_addElement:typeof GM_addElement==='function'?GM_addElement:undefined,
  GM_info:{script:{name:entry.name,version:entry.version},scriptHandler:'Fister Plugin Manager',version:VERSION}};
 // a one-time handoff of the Tampermonkey functions to this one script, removed straight after it starts
 const P='__fpmEarly:'+id;let taken=false;const drop=()=>{if(W[P]===hand)delete W[P];};const hand={take(){if(taken)return null;taken=true;drop();return grants;}};
 Object.defineProperty(W,P,{configurable:true,value:hand});setTimeout(drop,15000);
 earlyRan.set(id,'did not start (a syntax error or a blocked script)');
 // at the very start the page may not have an <html> element yet; inject as soon as it exists
 const go=()=>{try{addScript('(function(){var __h=window['+JSON.stringify(P)+'],__g=__h&&__h.take();if(!__g)return;try{(function(GM_xmlhttpRequest,GM_addElement,GM_info,unsafeWindow){\n'+entry.code+
   '\n}).call(window,__g.GM_xmlhttpRequest,__g.GM_addElement,__g.GM_info,window);window.__fpmEarlyDone&&window.__fpmEarlyDone('+JSON.stringify(id)+');}catch(e){window.__fpmEarlyDone&&window.__fpmEarlyDone('+JSON.stringify(id)+',e);}})();\n//# sourceURL=fister-plugin:'+id+'.user.js');}
 catch(e){drop();earlyRan.set(id,String(e?.message||e));if(entry.code.includes('__fisterQolEarlyHook'))W.__fisterQolEarlyHook?.giveUp?.();}};
 if(document.documentElement)go();else{const mo=new MutationObserver(()=>{if(document.documentElement){mo.disconnect();go();}});mo.observe(document,{childList:true});}}
Object.defineProperty(W,'__fpmEarlyDone',{configurable:true,value:(id,e)=>{earlyRan.set(id,e?String(e?.message||e):'started');if(e){console.error('[Fister Plugins] '+id+' crashed while starting:',e);if(/__fisterQolEarlyHook/.test(earlyStore.read()[id]?.code||''))W.__fisterQolEarlyHook?.giveUp?.();}}});
if(!SAFE){const entries=Object.entries(earlyStore.read()).filter(([,e])=>e&&typeof e.code==='string');
 if(entries.some(([,e])=>e.code.includes('__fisterQolEarlyHook')))qolEarlyHook();
 for(const [id,entry] of entries)runEarly(id,entry);}
if(game.hooksOn)LOADER.claim();

// ======================================================================
// Storage
// ======================================================================
let dbp=null;
function db(){return dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open('fister-plugin-manager',1);r.onupgradeneeded=()=>{for(const s of ['plugins','cache'])r.result.createObjectStore(s);};r.onsuccess=()=>res(r.result);r.onerror=()=>{dbp=null;rej(r.error);};}));}
async function idb(store,mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction(store,mode),st=t.objectStore(store);let out;const rq=fn(st);if(rq)rq.onsuccess=()=>{out=rq.result;};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);});}
const PREFS_KEY='fpm-prefs-v1';
const prefs=(()=>{try{return {autoUpdate:true,lastCheck:0,...JSON.parse(localStorage.getItem(PREFS_KEY)||'{}')};}catch{return {autoUpdate:true,lastCheck:0};}})();
const savePrefs=()=>{try{localStorage.setItem(PREFS_KEY,JSON.stringify(prefs));}catch{}};

// ======================================================================
// Plugins: format, install, run
// ======================================================================
// A plugin is one .js file that starts with a header:
//   // ==FisterPlugin==
//   // @id          ko-counter
//   // @name        KO Counter
//   // @version     1.0.0
//   // @author      you
//   // @description What it does
//   // ==/FisterPlugin==
// and uses the `fister` object (see the README in the fister-plugin-manager repo).
const US_GRANTS=new Set(['GM_xmlhttpRequest','GM.xmlHttpRequest','GM_addElement','GM.addElement','GM_info','unsafeWindow','none']);
function parseMeta(code){code=String(code);const m=code.match(/\/\/\s*==FisterPlugin==([\s\S]*?)\/\/\s*==\/FisterPlugin==/),u=!m&&code.match(/\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/);
 if(!m&&!u)throw Error('This is not a Fister plugin or a userscript (the // ==FisterPlugin== or // ==UserScript== header is missing).');
 const meta={},multi={};for(const line of (m||u)[1].split('\n')){const k=line.match(/^\s*\/\/\s*@([\w.:-]+)\s+(.+?)\s*$/);if(!k)continue;const key=k[1].toLowerCase();(multi[key]=multi[key]||[]).push(k[2]);if(!(key in meta))meta[key]=k[2];}
 if(u){// a Tampermonkey-style userscript: it starts before the game loads, with the few Tampermonkey functions the manager can hand on
  meta.kind='userscript';meta.id=meta['fister-id']||String(meta.name||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
  meta.tags=meta['fister-tags']||meta.tags;meta.banner=meta['fister-banner']||meta.banner;meta.icon=meta['fister-icon']||meta.icon||meta.iconurl;
  if(!(multi.match||[]).concat(multi.include||[]).some(x=>/fister\.fun/i.test(x)))throw Error('This userscript is not made for fister.fun (no @match for it).');
  if(multi.require||multi.resource)throw Error('This userscript uses @require or @resource, which plugins can\'t load. Install it in Tampermonkey instead.');
  const bad=(multi.grant||[]).filter(g=>!US_GRANTS.has(g));if(bad.length)throw Error('This userscript needs '+bad.join(', ')+', which the Plugin Manager can\'t give it. Install it in Tampermonkey instead.');
  meta.grants=(multi.grant||[]).join(' ');}
 else meta.kind='plugin';
 if(!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(meta.id||''))throw Error('The plugin needs an @id made of lowercase letters, numbers and dashes.');
 if(!meta.name)throw Error('The plugin needs a @name.');if(!/^\d+(\.\d+){0,3}$/.test(meta.version||''))throw Error('The plugin needs a @version like 1.0.0.');
 for(const k of ['name','author','description','tags'])if(meta[k])meta[k]=meta[k].slice(0,k==='description'?300:k==='tags'?200:60);
 for(const k of ['icon','banner','homepage'])if(meta[k]&&!/^(https:\/\/|data:image\/)/i.test(meta[k]))delete meta[k];return meta;}
const newer=(a,b)=>{const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0;}return false;};
const plugins=new Map();          // id -> record {id, meta, code, enabled, source:{type,url}, installedAt, updatedAt, update?}
const running=new Map();          // id -> {cleanups:[], api, error, logs}
function syncHooksFlag(){const need=[...plugins.values()].some(r=>r.enabled&&r.meta.kind!=='userscript');try{if(need)localStorage.setItem(HOOKS_KEY,'1');else localStorage.removeItem(HOOKS_KEY);}catch{}return need;}
const listeners=new Set();const changed=()=>{for(const f of listeners)try{f();}catch{}};
async function loadStore(){try{const rows=await idb('plugins','readonly',s=>s.getAll());for(const r of rows||[])if(r&&r.id){if(r.meta&&!r.meta.kind)r.meta.kind='plugin';plugins.set(r.id,r);}}catch(e){console.warn('[Fister Plugins] storage',e);}
 syncHooksFlag();const early=earlyStore.read();for(const r of plugins.values())if(r.meta.kind==='userscript'&&r.enabled&&early[r.id]?.code!==r.code)earlyStore.put(r);}
const saveRecord=r=>idb('plugins','readwrite',s=>s.put(r,r.id)).catch(e=>console.warn('[Fister Plugins] save',e));
async function install(code,source){const meta=parseMeta(code),old=plugins.get(meta.id);
 if(old&&running.has(meta.id))stop(meta.id);
 const rec={id:meta.id,meta,code,enabled:old?old.enabled:true,source,installedAt:old?.installedAt||Date.now(),updatedAt:Date.now()};plugins.set(meta.id,rec);await saveRecord(rec);
 if(old&&old.meta.kind==='userscript'&&meta.kind!=='userscript')earlyStore.drop(meta.id);
 if(meta.kind==='userscript'){if(!earlyStore.put(rec))throw Error('There is not enough room in this browser\'s storage to keep '+meta.name+'.');rec.restart=true;}
 else if(rec.enabled&&!SAFE)start(meta.id);
 if(!old&&source?.type==='catalog')counter.hit(meta.id);syncHooksFlag();changed();return rec;}
async function remove(id){stop(id);earlyStore.drop(id);plugins.delete(id);syncHooksFlag();await idb('plugins','readwrite',s=>s.delete(id)).catch(()=>{});try{localStorage.removeItem('fpm-settings:'+id);}catch{}changed();}
async function setEnabled(id,on){const r=plugins.get(id);if(!r)return;r.enabled=!!on;await saveRecord(r);
 syncHooksFlag();if(r.meta.kind==='userscript'){earlyStore.put(r);r.restart=true;}else if(on&&!SAFE)start(id);else stop(id);changed();}

// The running side: each plugin gets its own `fister` object; everything it adds through it is undone on stop.
const pending=new Map();
function start(id){const r=plugins.get(id);if(!r||running.has(id)||r.meta.kind==='userscript')return;watchChat();
 const run={cleanups:[],error:null,logs:[],settingsSchema:{},onSettings:new Set()};running.set(id,run);run.api=makeApi(r,run);
 pending.set(id,run);
 addScript('window.__fpm.define('+JSON.stringify(id)+',function(fister){"use strict";\n'+r.code+'\n});\n//# sourceURL=fister-plugin:'+id+'.js');
 if(pending.get(id)===run){pending.delete(id);run.error=run.error||'The plugin did not start (a syntax error or blocked script).';changed();}}
function defineFromScript(id,fn){const run=pending.get(id);if(!run)return;pending.delete(id);
 try{const out=fn(run.api);if(typeof out==='function')run.cleanups.push(out);}catch(e){run.error=String(e?.message||e);console.error('[Fister Plugins] '+id+' crashed while starting:',e);stopQuietly(run);}changed();}
function stopQuietly(run){for(const f of run.cleanups.splice(0).reverse())try{f();}catch{}}
function stop(id){const run=running.get(id);if(!run)return;running.delete(id);stopQuietly(run);changed();}
function makeApi(rec,run){const meta=rec.meta,id=meta.id,track=f=>{run.cleanups.push(f);return f;};
 const settingsKey='fpm-settings:'+id,dataKey='fpm-data:'+id;
 const readSettings=()=>{try{return JSON.parse(localStorage.getItem(settingsKey)||'{}');}catch{return {};}};
 const log=(...a)=>{run.logs.push(new Date().toLocaleTimeString()+' '+a.map(x=>typeof x==='string'?x:(()=>{try{return JSON.stringify(x);}catch{return String(x);}})()).join(' '));if(run.logs.length>50)run.logs.shift();console.log('['+meta.name+']',...a);};
 const settings={
  define(schema){run.settingsSchema={...run.settingsSchema,...(schema||{})};changed();return settings;},
  get(key){const v=readSettings();if(key===undefined){const out={};for(const [k,d] of Object.entries(run.settingsSchema))out[k]=k in v?v[k]:d.default;return out;}return key in v?v[key]:run.settingsSchema[key]?.default;},
  set(key,value){const v=readSettings();v[key]=value;try{localStorage.setItem(settingsKey,JSON.stringify(v));}catch{}for(const f of run.onSettings)try{f(key,value);}catch{}},
  onChange(fn){run.onSettings.add(fn);return track(()=>run.onSettings.delete(fn));}};
 const layer=()=>{let l=document.getElementById('fpm-layer');if(!l){l=document.createElement('div');l.id='fpm-layer';l.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:9000';(document.body||document.documentElement).append(l);}return l;};
 return Object.freeze({
  meta:Object.freeze({...meta}),
  version:VERSION,
  log,
  on(name,fn){if(typeof fn!=='function')throw Error('fister.on needs a function');return track(listen(String(name),fn));},
  onStop(fn){if(typeof fn==='function')track(fn);},
  settings,
  storage:{get(k,d){try{const v=JSON.parse(localStorage.getItem(dataKey)||'{}');return k in v?v[k]:d;}catch{return d;}},set(k,val){let v={};try{v=JSON.parse(localStorage.getItem(dataKey)||'{}');}catch{}v[k]=val;try{localStorage.setItem(dataKey,JSON.stringify(v));}catch{}}},
  game:Object.freeze({get scene(){return game.scene;},get client(){return game.client;},localPlayerId:localId,playerName:nameOf,
   players(){try{return [...(game.scene?.players?.values?.()||[])].map(p=>({id:p.id,name:p.username??null,raw:p}));}catch{return [];}},get hooked(){return game.patched;}}),
  ui:Object.freeze({
   toast(text,ms=3500){toast(String(text),ms,meta.name);},
   style(css){const s=document.createElement('style');s.dataset.fpmPlugin=id;s.textContent=String(css);(document.head||document.documentElement).append(s);track(()=>s.remove());return s;},
   add(el,{interactive=false}={}){if(!(el instanceof Element))throw Error('fister.ui.add needs an element');if(interactive)el.style.pointerEvents='auto';layer().append(el);track(()=>el.remove());return el;},
   element(tag,props={},...kids){const el=document.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(k==='style'&&typeof v==='object')Object.assign(el.style,v);else if(k.startsWith('on')&&typeof v==='function')el.addEventListener(k.slice(2).toLowerCase(),v);else if(k in el)el[k]=v;else el.setAttribute(k,v);}el.append(...kids);return el;}}),
  chat:Object.freeze({onMessage(fn){return track(listen('chat',fn));}}),
  setTimeout(fn,ms){const t=setTimeout(fn,ms);track(()=>clearTimeout(t));return t;},
  setInterval(fn,ms){const t=setInterval(fn,ms);track(()=>clearInterval(t));return t;},
  addEventListener(target,type,fn,opts){target.addEventListener(type,fn,opts);track(()=>target.removeEventListener(type,fn,opts));},
  plugin(setup){if(typeof setup==='function'){const out=setup();if(typeof out==='function')track(out);}}});}
// Errors thrown later by a plugin (in its listeners or timers) are pinned to it from the stack trace.
W.addEventListener('error',e=>{const m=String(e?.error?.stack||e?.filename||'').match(/fister-plugin:([a-z0-9_-]+)\.js/);if(m&&running.has(m[1])){running.get(m[1]).error=String(e.message||e.error);changed();}});

// chat messages (read from the page, so it works whatever the game version)
let chatMo=null;
function watchChat(){if(chatMo)return;const scan=()=>{const box=document.getElementById('chat')||document.querySelector('[id*="chat"][class*="message"],.chat-messages');if(!box)return false;
  chatMo=new MutationObserver(list=>{for(const m of list)for(const n of m.addedNodes){if(!(n instanceof Element))continue;const el=n.matches('.chat-message')?n:n.querySelector?.('.chat-message');if(el)emit('chat',{text:el.textContent||'',element:el});}});
  chatMo.observe(box,{childList:true,subtree:true});return true;};
 if(!scan()){const t=setInterval(()=>{if(scan())clearInterval(t);},1000);}}

// updates for plugins that came from a link or the catalog

// ======================================================================
// Download counters (abacus.jasoncameron.dev, a free public counting service).
// One count per device per plugin, when it's installed from the catalog. Live while the Plugins tab is open.
// ======================================================================
const counter=(()=>{const NS='fister-plugin-manager',BASE='https://abacus.jasoncameron.dev',values=new Map(),streams=new Map();let pollTimer=0,watching=new Set();
 const key=id=>('dl-'+id).slice(0,64);
 const get=url=>new Promise(res=>{if(typeof GM_xmlhttpRequest!=='function'){fetch(url).then(r=>r.json().then(j=>res({status:r.status,json:j}))).catch(()=>res(null));return;}
  GM_xmlhttpRequest({method:'GET',url,timeout:15000,anonymous:true,onload:r=>{let j=null;try{j=JSON.parse(r.responseText);}catch{}res({status:r.status,json:j});},onerror:()=>res(null),ontimeout:()=>res(null)});});
 const fmt=n=>n<1000?String(n):n<1e6?(n/1000).toFixed(n<1e4?1:0).replace(/\.0$/,'')+'k':(n/1e6).toFixed(1).replace(/\.0$/,'')+'M';
 const label=n=>n==null?'… downloads':fmt(n)+(n===1?' download':' downloads');
 function set(id,v){if(typeof v!=='number'||!(v>=0))return;const old=values.get(id);values.set(id,v);if(old===v)return;
  for(const el of document.querySelectorAll('[data-fpm-count]'))if(el.dataset.fpmCount===id){el.textContent=label(v);el.title=v.toLocaleString()+' installs through the Plugin Manager';if(old!=null&&v>old){el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump');}}}
 async function refresh(id){const r=await get(BASE+'/get/'+NS+'/'+key(id));if(!r)return;if(r.status===404)set(id,0);else if(r.json&&typeof r.json.value==='number')set(id,r.json.value);}
 function stream(id){if(streams.has(id)||typeof EventSource!=='function')return;let es;try{es=new EventSource(BASE+'/stream/'+NS+'/'+key(id));}catch{streams.set(id,null);return;}
  streams.set(id,es);es.onmessage=e=>{try{set(id,JSON.parse(e.data).value);}catch{}};es.onerror=()=>{es.close();streams.set(id,null);};}
 function watch(ids){watching=new Set(ids);for(const [id,es] of streams)if(!watching.has(id)){es?.close();streams.delete(id);}
  for(const id of watching){if(!values.has(id))refresh(id);stream(id);}
  clearInterval(pollTimer);if(watching.size)pollTimer=setInterval(()=>{if(!visibleIds().length){watch([]);return;}if(document.hidden)return;
   for(const id of watching)if(!streams.get(id))refresh(id);},20000);}
 const visibleIds=()=>[...new Set([...document.querySelectorAll('[data-fpm-count]')].filter(shown).map(e=>e.dataset.fpmCount))];
 const watchVisible=()=>{const ids=visibleIds();if(ids.join()!==[...watching].join()||!ids.length)watch(ids);};
 async function hit(id){const flag='fpm-counted:'+id;try{if(localStorage.getItem(flag))return;localStorage.setItem(flag,'1');}catch{}
  const r=await get(BASE+'/hit/'+NS+'/'+key(id));if(r?.json&&typeof r.json.value==='number')set(id,r.json.value);}
 const badge=id=>{const v=values.get(id);return h('span',{class:'fpm-count','data-fpm-count':id,title:v!=null?v.toLocaleString()+' installs through the Plugin Manager':''},label(v));};
 return {watch,watchVisible,hit,badge,values};})();
let catalog=null,catalogAt=0;
async function getCatalog(force){if(!force&&catalog&&Date.now()-catalogAt<3600e3)return catalog;const data=JSON.parse(await httpGet(CATALOG_URL));
 catalog=(Array.isArray(data.plugins)?data.plugins:[]).filter(p=>p&&typeof p.id==='string'&&typeof p.url==='string');catalogAt=Date.now();return catalog;}
async function checkUpdates(apply){let found=0;
 for(const r of plugins.values()){if(!r.source?.url)continue;try{const code=await httpGet(r.source.url);const meta=parseMeta(code);if(meta.id!==r.id)continue;
   if(newer(meta.version,r.meta.version)){found++;if(apply)await install(code,r.source);else{r.update={version:meta.version,code};changed();}}}catch(e){console.warn('[Fister Plugins] update check failed for',r.id,e);}}
 prefs.lastCheck=Date.now();savePrefs();return found;}

// ======================================================================
// UI: the Plugins tab (and the Ctrl+Shift+P window)
// ======================================================================
function toast(text,ms,from){const show=()=>{let box=document.getElementById('fpm-toasts');if(!box){box=document.createElement('div');box.id='fpm-toasts';box.style.cssText='position:fixed;right:12px;top:12px;display:flex;flex-direction:column;gap:6px;z-index:2147483000;pointer-events:none';document.body.append(box);}
  const t=document.createElement('div');t.className='fpm-toast win95-window';t.setAttribute('role','status');t.style.cssText='padding:8px 12px;max-width:340px;font:13px Tahoma,Arial,sans-serif;background:#c0c0c0;color:#111;border:2px outset #eee';
  if(from){const b=document.createElement('b');b.textContent=from+': ';t.append(b);}t.append(text);box.append(t);setTimeout(()=>t.remove(),ms);};
 if(document.body)show();else document.addEventListener('DOMContentLoaded',show,{once:true});}
const CSS=`
.fpm{display:flex;flex-direction:column;gap:10px;font-size:13px;position:relative}
.fpm-top{display:flex;gap:8px;align-items:stretch;position:relative}
.fpm-top .fpm-search{flex:1 1 auto;min-width:0;padding:8px 10px;font-size:14px;box-sizing:border-box}
.fpm-top .fpm-add{white-space:nowrap;padding:0 14px}
.fpm-menu{position:absolute;right:0;top:calc(100% + 4px);z-index:5;display:flex;flex-direction:column;min-width:220px;background:#c0c0c0;border:2px outset #eee;box-shadow:2px 2px 0 #0005}
.fpm-menu button{text-align:left;border:0!important;box-shadow:none!important;padding:7px 12px!important;background:transparent}
.fpm-menu button:hover{background:#000080!important;color:#fff!important}
.fpm-note{font-size:12px;margin:0;opacity:.85}
.fpm-note.warn{color:#b00000;font-weight:700;opacity:1}
.fpm-msg{font-weight:700;margin:0}
.fpm-heading{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px}
.fpm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.fpm-card{display:flex;flex-direction:column;background:#d4d4d4;border:2px solid #9a9a9a;min-width:0}
.fpm-card.off .fpm-banner{filter:grayscale(.75) brightness(.92)}
.fpm-banner{position:relative;height:132px;overflow:hidden;background:#555;display:grid;place-items:center}
.fpm-banner img{width:100%;height:100%;object-fit:cover;display:block}
.fpm-banner .fpm-letter{font:900 64px/1 Tahoma,Arial,sans-serif;color:#fff8;text-shadow:0 2px 0 #0003}
.fpm-flags{position:absolute;left:6px;top:6px;display:flex;gap:4px;flex-wrap:wrap}
.fpm-flag{font:700 11px Tahoma,Arial,sans-serif;padding:2px 7px;border-radius:9px;background:#000a;color:#fff}
.fpm-flag.err{background:#c62828}.fpm-flag.upd{background:#2e7d32}.fpm-flag.have{background:#1565c0}
.fpm-body{display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px;flex:1 1 auto}
.fpm-title{display:flex;gap:10px;align-items:center;min-width:0}
.fpm-icon{width:40px;height:40px;flex:none;border-radius:8px;background:#fff;display:grid;place-items:center;overflow:hidden;border:1px solid #0002}
.fpm-icon img{width:100%;height:100%;object-fit:cover}
.fpm-icon b{font:900 20px Tahoma,Arial,sans-serif;color:#fff}
.fpm-name{font-size:16px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fpm-sub{font-size:12px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fpm-count{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:#1b5e20;border-radius:4px;padding:0 3px;transition:background .6s}
.fpm-count::before{content:"";width:9px;height:10px;background:currentColor;clip-path:polygon(32% 0,68% 0,68% 50%,100% 50%,50% 100%,0 50%,32% 50%)}
.fpm-count.bump{animation:fpm-bump 1.2s}
@keyframes fpm-bump{0%{background:#ffe066;transform:scale(1.15)}100%{background:transparent;transform:none}}
.fpm-flag.us{background:#6a1b9a}.fpm-flag.rs{background:#e65100}
.fpm-desc{font-size:13px;line-height:1.35}
.fpm-err{font-size:12px;color:#b00000;font-weight:700;overflow-wrap:anywhere}
.fpm-tags{display:flex;flex-wrap:wrap;gap:5px}
.fpm-tag{font:12px Tahoma,Arial,sans-serif;padding:2px 9px;border-radius:12px;border:1px solid #777;background:#e8e8e8;color:#333;cursor:pointer}
.fpm-tag:hover{background:#fff}
.fpm-foot{display:flex;align-items:center;gap:8px;margin-top:auto;padding-top:4px}
.fpm-foot .fpm-gap{flex:1}
.fpm-foot button{min-width:72px;padding:6px 12px}
.fpm-danger{background:#d9433a!important;color:#fff!important;border-color:#f08a84 #8e211b #8e211b #f08a84!important}
.fpm-switch{position:relative;width:46px;height:26px;flex:none;border-radius:13px;background:#8a8a8a;border:1px solid #666;cursor:pointer;padding:0!important;min-width:0!important;box-shadow:inset 0 1px 3px #0005!important}
.fpm-switch::after{content:"";position:absolute;left:2px;top:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px #0006;transition:transform .15s}
.fpm-switch[aria-checked=true]{background:#2e9e4f;border-color:#21773a}
.fpm-switch[aria-checked=true]::after{transform:translateX(20px)}
.fpm-switch:disabled{opacity:.5;cursor:default}
.fpm-confirm{border:2px solid #b00000;padding:10px 12px;background:#fff6f6;color:#222;display:flex;flex-direction:column;gap:6px}
.fpm-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.fpm-row input[type=url]{flex:1 1 260px;min-width:0;padding:6px 8px}
.fpm-empty{padding:24px;text-align:center;opacity:.8;border:2px dashed #999}
.fpm-sheet{position:absolute;inset:0;z-index:6;background:#c0c0c0;display:flex;flex-direction:column;gap:8px;padding:2px;min-height:420px}
.fpm-sheet .fpm-tabs{display:flex;gap:4px}
.fpm-sheet .fpm-tabs button[aria-pressed=true]{font-weight:700}
.fpm-sheet textarea{width:100%;min-height:340px;box-sizing:border-box;font:12px/1.45 Consolas,"DejaVu Sans Mono",monospace;tab-size:2;white-space:pre;resize:vertical}
.fpm-form{display:grid;grid-template-columns:minmax(120px,max-content) 1fr;gap:6px 10px;align-items:center}
.fpm-toggle{display:inline-flex;gap:6px;align-items:center;margin:0;cursor:pointer}
.fpm-form input[type=checkbox]{justify-self:start;width:auto;margin:0}
.fpm-form input[type=range]{min-width:140px}
.fpm-log{max-height:340px;overflow:auto;font:12px Consolas,monospace;background:#0001;padding:6px;white-space:pre-wrap}
#fpm-window{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(940px,94vw);max-height:88vh;z-index:100004;display:flex;flex-direction:column}
#fpm-window .fpm-body-host{overflow:auto;padding:10px}
`;
function css(){if(document.getElementById('fpm-style'))return;const s=document.createElement('style');s.id='fpm-style';s.textContent=CSS;(document.head||document.documentElement).append(s);}
const h=(tag,props={},...kids)=>{const el=document.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v==null||v===false)continue;if(k==='class')el.className=v;else if(k.startsWith('on'))el.addEventListener(k.slice(2),v);else if(k in el&&k!=='list')el[k]=v;else el.setAttribute(k,v===true?'':v);}for(const c of kids.flat())if(c!=null&&c!==false)el.append(c);return el;};
const button=(text,on,extra={})=>h('button',{type:'button',class:'fister-react95-button win95-btn',onclick:on,...extra},text);
// Pictures from plugin headers are fetched through Tampermonkey and kept, so they show whatever the page allows.
const images=new Map(),ready=new Map();
function picture(url){if(!url)return Promise.resolve(null);if(/^data:image\//i.test(url))return Promise.resolve(url);if(!/^https:\/\//i.test(url))return Promise.resolve(null);
 let p=images.get(url);if(p)return p;
 p=(async()=>{let blob=await idb('cache','readonly',s=>s.get('img:'+url)).catch(()=>null);
  if(!(blob instanceof Blob)){blob=await new Promise((res,rej)=>{if(typeof GM_xmlhttpRequest!=='function'){fetch(url).then(r=>r.ok?r.blob():null).then(res,rej);return;}
    GM_xmlhttpRequest({method:'GET',url,responseType:'blob',timeout:20000,anonymous:true,onload:r=>res(r.status>=200&&r.status<300?r.response:null),onerror:()=>res(null),ontimeout:()=>res(null)});});
   if(!(blob instanceof Blob)||blob.size>3*1024*1024)return null;
   const type=/\.svg(\?|$)/i.test(url)?'image/svg+xml':blob.type&&blob.type.startsWith('image/')?blob.type:/\.png(\?|$)/i.test(url)?'image/png':/\.(jpe?g)(\?|$)/i.test(url)?'image/jpeg':/\.gif(\?|$)/i.test(url)?'image/gif':/\.webp(\?|$)/i.test(url)?'image/webp':'';
   if(!type)return null;blob=new Blob([blob],{type});idb('cache','readwrite',s=>s.put(blob,'img:'+url)).catch(()=>{});}
  const u=URL.createObjectURL(blob);ready.set(url,u);return u;})().catch(()=>null);images.set(url,p);return p;}
const hue=s=>{let n=0;for(const c of String(s))n=(n*31+c.charCodeAt(0))>>>0;return n%360;};
function banner(meta,flags){const box=h('div',{class:'fpm-banner',style:'background:linear-gradient(135deg,hsl('+hue(meta.id)+' 55% 52%),hsl('+((hue(meta.id)+50)%360)+' 60% 38%))'},
  h('span',{class:'fpm-letter'},(meta.name||'?').trim().charAt(0).toUpperCase()),h('div',{class:'fpm-flags'},...flags));
 const put=u=>{if(u){box.querySelector('.fpm-letter')?.remove();box.prepend(h('img',{src:u,alt:'',decoding:'sync'}));}};
 const now=ready.get(meta.banner)||(/^data:/.test(meta.banner||'')?meta.banner:null);if(now)put(now);else picture(meta.banner).then(put);return box;}
function icon(meta){const box=h('div',{class:'fpm-icon',style:'background:hsl('+hue(meta.id)+' 55% 48%)'},h('b',{},(meta.name||'?').trim().charAt(0).toUpperCase()));
 const put=u=>{if(u){box.style.background='#fff';box.replaceChildren(h('img',{src:u,alt:'',decoding:'sync'}));}};
 const now=ready.get(meta.icon)||(/^data:/.test(meta.icon||'')?meta.icon:null);if(now)put(now);else picture(meta.icon).then(put);return box;}
const tagsOf=meta=>String(meta.tags||'').split(/[\s,]+/).map(t=>t.replace(/^#/,'').toLowerCase()).filter(Boolean).slice(0,8);
const sizeOf=code=>{const n=new Blob([code||'']).size;return n<1024?n+' B':n<1048576?(n/1024).toFixed(n<10240?1:0)+' KB':(n/1048576).toFixed(1)+' MB';};
function matches(q,meta){q=q.trim().toLowerCase();if(!q)return true;
 return q.split(/\s+/).every(w=>w.startsWith('#')?tagsOf(meta).some(t=>t.startsWith(w.slice(1))):[meta.name,meta.author,meta.description,meta.id,...tagsOf(meta)].join(' ').toLowerCase().includes(w));}
const TEMPLATE=`// ==FisterPlugin==
// @id          my-plugin
// @name        My Plugin
// @version     1.0.0
// @author      me
// @description What my plugin does.
// @tags        fun
// ==/FisterPlugin==

fister.settings.define({
  message: { type: 'text', label: 'Message on a KO', default: 'Nice!' },
});

fister.on('kill', e => {
  if (e.byMe) fister.ui.toast(fister.settings.get('message'));
});
`;
const mounts=new Set();
// The panel only builds itself while it's on screen; changes made while it's hidden are drawn when it's opened.
const shown=el=>el.isConnected&&el.getClientRects().length>0;
function mountManager(host,floating){css();const ui={host,view:'installed',busy:'',query:'',confirm:null,menu:false,link:false,sheet:null,message:'',dirty:true};mounts.add(ui);
 const draw=()=>{ui.dirty=false;render(ui);};if(floating||shown(host))draw();
 const io=new IntersectionObserver(()=>{if(shown(host)&&ui.dirty)draw();counter.watchVisible();});io.observe(host);
 const re=()=>{if(!host.isConnected){mounts.delete(ui);listeners.delete(re);io.disconnect();return;}if(!shown(host)){ui.dirty=true;return;}if(!ui.sheet||ui.sheet.tab!=='code')render(ui);};listeners.add(re);return ui;}
function render(ui){const root=h('div',{class:'fpm'});
 const say=t=>{ui.message=t;render(ui);};
 const run=async(label,fn)=>{ui.busy=label;render(ui);try{await fn();}catch(e){ui.message=String(e?.message||e);}ui.busy='';render(ui);};
 const askInstall=(code,source)=>{let meta;try{meta=parseMeta(code);}catch(e){say(String(e.message));return;}ui.confirm={code,source,meta};ui.link=false;render(ui);ui.host.scrollTop=0;};
 const openCatalog=()=>{ui.view='catalog';ui.menu=false;ui.message='';render(ui);run('Loading the catalog…',async()=>{await getCatalog(true);});};
 // top bar: search + Add plugin
 const search=h('input',{type:'search',class:'fpm-search fister-react95-input',placeholder:'Search creators, names or #tags',value:ui.query,'aria-label':'Search plugins',
  oninput:()=>{ui.query=search.value;const pos=search.selectionStart;render(ui);const s=ui.host.querySelector('.fpm-search');s.focus();try{s.setSelectionRange(pos,pos);}catch{}}});
 const file=h('input',{type:'file',accept:'.js,text/javascript',hidden:true,onchange:async()=>{const f=file.files?.[0];if(!f)return;if(f.size>512*1024){say('That file is bigger than 512 KB, which is too big for a plugin.');return;}askInstall(await f.text(),{type:'file',name:f.name});}});
 const top=h('div',{class:'fpm-top'},search,button('+ Add plugin',()=>{ui.menu=!ui.menu;render(ui);},{class:'fister-react95-button win95-btn fpm-add','aria-expanded':String(ui.menu)}),file);
 if(ui.menu)top.append(h('div',{class:'fpm-menu',role:'menu'},
  button('Browse the catalog',openCatalog,{role:'menuitem'}),
  button('Install from a link…',()=>{ui.menu=false;ui.link=true;render(ui);},{role:'menuitem'}),
  button('Install from a file…',()=>{ui.menu=false;render(ui);file.click();},{role:'menuitem'}),
  button('Write a new plugin…',()=>{ui.menu=false;ui.sheet={id:null,tab:'code',draft:TEMPLATE,status:''};render(ui);},{role:'menuitem'}),
  button('Check for updates',()=>{ui.menu=false;run('Checking for updates…',async()=>{const n=await checkUpdates(false);ui.message=n?n+' update'+(n>1?'s':'')+' available.':'Everything is up to date.';});},{role:'menuitem'})));
 root.append(top);
 // notes
 const notes=[];
 if(SAFE)notes.push(h('p',{class:'fpm-note warn'},'Safe mode: plugins are off for this visit (?plugins=off).'));
 const needsEvents=[...plugins.values()].some(r=>r.enabled&&r.meta.kind!=='userscript');
 if(needsEvents&&!game.hooksOn&&!SAFE)notes.push(h('p',{class:'fpm-note warn'},'Reload the game to turn on game events (KOs, parries, rounds) for your plugins. ',button('Reload',()=>location.reload())));
 else if(needsEvents&&!game.patched&&!SAFE)notes.push(h('p',{class:'fpm-note'},W.__fisterRuntimeLoaded?'Game events are not available: update FisterQoL to 2.3.6 or newer, which passes the plugin hooks to the game.':'Game events become available once the game has loaded.'));
 if(game.missed?.length)notes.push(h('p',{class:'fpm-note'},'This game version moved a few spots, so these are off until the next Plugin Manager update: '+game.missed.join(', ')+'.'));
 if(ui.busy)notes.push(h('p',{class:'fpm-note',role:'status'},ui.busy));if(ui.message)notes.push(h('p',{class:'fpm-msg',role:'status'},ui.message));
 root.append(...notes);
 // install from a link
 if(ui.link){const input=h('input',{type:'url',class:'fister-react95-input',placeholder:'https://raw.githubusercontent.com/you/repo/main/my-plugin.fister.js'});
  root.append(h('div',{class:'fpm-confirm',style:'border-color:#666;background:#f4f4f4'},h('b',{},'Install from a link'),h('div',{class:'fpm-row'},input,button('Get it',()=>run('Downloading…',async()=>{askInstall(await httpGet(input.value.trim()),{type:'url',url:input.value.trim()});})),button('Cancel',()=>{ui.link=false;render(ui);})),
   h('p',{class:'fpm-note'},'Use a direct link to the plugin\'s .js file (on GitHub, the "Raw" link). It can update itself from the same address.')));setTimeout(()=>input.focus(),0);}
 // confirm install
 if(ui.confirm){const {meta,source,code}=ui.confirm,old=plugins.get(meta.id);
  root.append(h('div',{class:'fpm-confirm',role:'alertdialog'},h('b',{},(old?'Update ':'Install ')+meta.name+' '+meta.version+'?'),h('div',{},meta.description||'No description.'),
   h('div',{class:'fpm-note'},'By '+(meta.author||'unknown')+' · '+sizeOf(code)+' · from '+(source.type==='file'?'the file '+(source.name||''):source.type==='catalog'?'the plugin catalog':source.type==='local'?'your editor':source.url)),
   source.type!=='catalog'&&source.type!=='local'?h('div',{class:'fpm-note warn'},'Not from the catalog. Plugins can do anything the game page can; only install it if you trust whoever made it.'):null,
   meta.kind==='userscript'?h('div',{class:'fpm-note'},'This is a userscript. It starts before the game loads (from the next reload)'+(meta.grants&&meta.grants!=='none'?' and can use '+meta.grants.split(' ').join(', '):'')+'. If you also have it in Tampermonkey, turn that copy off.'):null,
   old?h('div',{class:'fpm-note'},'Replaces version '+old.meta.version+'.'):null,
   h('div',{class:'fpm-row'},button(old?'Update':'Install',()=>run('Installing…',async()=>{await install(code,source);ui.confirm=null;ui.message=meta.name+(meta.kind==='userscript'?' is installed. Reload the game to start it.':SAFE?' is installed.':' is installed and on.');})),button('Cancel',()=>{ui.confirm=null;render(ui);}))));}
 // cards
 const grid=h('div',{class:'fpm-grid'});
 if(ui.view==='catalog'){root.append(h('div',{class:'fpm-heading'},button('‹ Installed',()=>{ui.view='installed';render(ui);}),'Plugin catalog'));
  const items=(catalog||[]).filter(p=>matches(ui.query,p));
  for(const p of items){const have=plugins.get(p.id),upd=have&&newer(p.version,have.meta.version),meta={...p,tags:(p.tags||[]).join(' ')};
   grid.append(card(ui,meta,{flags:[have?h('span',{class:'fpm-flag '+(upd?'upd':'have')},upd?'update':'installed'):null],size:p.size||null,count:true,
    foot:[h('span',{class:'fpm-gap'}),p.homepage?h('a',{href:p.homepage,target:'_blank',rel:'noopener'},'More info'):null,(!have||upd)?button(upd?'Update':'Install',()=>run('Downloading '+p.name+'…',async()=>{const code=await httpGet(p.url),m=parseMeta(code);if(m.id!==p.id)throw Error('The catalog entry and the plugin file disagree about its id.');askInstall(code,{type:'catalog',url:p.url});})):null]}));}
  root.append(items.length?grid:h('div',{class:'fpm-empty'},catalog?'No plugins match.':ui.busy?'Loading…':'Could not load the catalog.'));
  root.append(h('p',{class:'fpm-note'},'From github.com/jaxonb423/fister-plugin-manager. Want yours listed? Open a pull request there.'));}
 else{const recs=[...plugins.values()].sort((a,b)=>a.meta.name.localeCompare(b.meta.name)).filter(r=>matches(ui.query,r.meta));
  const inCatalog=new Set((catalog||[]).map(p=>p.id));
  for(const r of recs){const run_=running.get(r.id),us=r.meta.kind==='userscript',early=earlyRan.get(r.id),err=run_?.error||(us&&r.enabled&&early&&early!=='started'?early:null);
   const sw=h('button',{type:'button',class:'fpm-switch',role:'switch','aria-checked':String(!!r.enabled),'aria-label':(r.enabled?'Turn off ':'Turn on ')+r.meta.name,disabled:SAFE,onclick:()=>setEnabled(r.id,!r.enabled)});
   grid.append(card(ui,r.meta,{off:!r.enabled,code:r.code,error:err,count:r.source?.type==='catalog'||inCatalog.has(r.id),
    flags:[err?h('span',{class:'fpm-flag err',title:err},'crashed'):null,r.update?h('span',{class:'fpm-flag upd'},'v'+r.update.version+' available'):null,
     us?h('span',{class:'fpm-flag us',title:'Starts before the game loads'},'userscript'):null,r.restart?h('span',{class:'fpm-flag rs'},'reload to apply'):null],
    foot:[sw,h('span',{class:'fpm-gap'}),r.update?button('Update',()=>run('Updating…',async()=>{await install(r.update.code,r.source);ui.message=r.meta.name+' updated.';})):null,
     r.restart?button('Reload',()=>location.reload()):null,
     button('Edit',()=>{ui.sheet={id:r.id,tab:!us&&run_&&Object.keys(run_.settingsSchema).length?'settings':'code',draft:r.code,status:''};render(ui);}),
     button('Remove',e=>{if(e.currentTarget.dataset.sure==='1')remove(r.id);else{const b=e.currentTarget;b.dataset.sure='1';b.textContent='Sure?';setTimeout(()=>{if(b.isConnected){b.dataset.sure='';b.textContent='Remove';}},4000);}},{class:'fister-react95-button win95-btn fpm-danger'})]}));}
  root.append(recs.length?grid:h('div',{class:'fpm-empty'},plugins.size?'No plugins match.':'No plugins yet. Press "+ Add plugin" to browse the catalog.'));
  const auto=h('input',{type:'checkbox',checked:prefs.autoUpdate,id:'fpm-auto',onchange:()=>{prefs.autoUpdate=auto.checked;savePrefs();}});
  root.append(h('label',{class:'fpm-toggle',for:'fpm-auto'},auto,'Update plugins automatically (checks every 6 hours)'));}
 root.append(h('p',{class:'fpm-note'},'Plugins are code that runs in the game page. Only install ones from people you trust. Start with ?plugins=off if one breaks the game. · Fister Plugin Manager '+VERSION+(game.hookedBy?' · game hooks added by '+game.hookedBy:'')+' · Ctrl+Shift+P'));
 if(ui.sheet)root.append(sheet(ui));
 const scroll=ui.host.scrollTop;ui.host.replaceChildren(root);ui.host.scrollTop=scroll;
 counter.watchVisible();}
function card(ui,meta,o){const tags=tagsOf(meta);
 return h('article',{class:'fpm-card'+(o.off?' off':'')},banner(meta,o.flags||[]),
  h('div',{class:'fpm-body'},
   h('div',{class:'fpm-title'},icon(meta),h('div',{style:'min-width:0'},h('div',{class:'fpm-name',title:meta.name},meta.name),
    h('div',{class:'fpm-sub'},'v'+meta.version+(meta.author?' · by '+meta.author:'')+' · '+(meta.kind==='userscript'?'userscript':'plugin')+(o.code?' · '+sizeOf(o.code):o.size?' · '+o.size:'')),
    o.count?counter.badge(meta.id):null)),
   meta.description?h('div',{class:'fpm-desc'},meta.description):null,o.error?h('div',{class:'fpm-err'},'Error: '+o.error):null,
   tags.length?h('div',{class:'fpm-tags'},...tags.map(t=>h('button',{type:'button',class:'fpm-tag',onclick:()=>{ui.query='#'+t;render(ui);}},'#'+t))):null,
   h('div',{class:'fpm-foot'},...o.foot)));}
// The Edit sheet: settings, code and log for one plugin (or a new one).
function sheet(ui){const s=ui.sheet,r=s.id?plugins.get(s.id):null,run_=r?running.get(r.id):null,hasSettings=run_&&Object.keys(run_.settingsSchema).length;
 const tab=(id,label)=>button(label,()=>{s.tab=id;render(ui);},{'aria-pressed':String(s.tab===id)});
 const box=h('div',{class:'fpm-sheet',role:'dialog','aria-label':r?'Edit '+r.meta.name:'New plugin'},
  h('div',{class:'fpm-heading'},button('‹ Back',()=>{ui.sheet=null;render(ui);}),r?r.meta.name:'New plugin'),
  h('div',{class:'fpm-tabs'},r?tab('settings','Settings'):null,tab('code','Code'),r?tab('log','Log'):null));
 if(s.tab==='settings'&&r)box.append(r.meta.kind==='userscript'?h('p',{class:'fpm-note'},'This userscript keeps its own settings (for FisterQoL, the QoL tab in Settings).'):hasSettings?settingsForm(run_):h('p',{class:'fpm-note'},r.enabled?'This plugin has no settings.':'Turn the plugin on to change its settings.'));
 if(s.tab==='log'&&r)box.append(h('div',{class:'fpm-log'},r.meta.kind==='userscript'?(earlyRan.has(r.id)?'This visit: '+earlyRan.get(r.id)+'.':r.enabled?'Not started yet: it starts when the game is reloaded.':'Off.')+'\nUserscripts write to the browser console (F12).':run_?.logs.join('\n')||'Nothing logged yet.'),r.enabled&&!SAFE&&r.meta.kind!=='userscript'?h('div',{class:'fpm-row'},button('Restart plugin',()=>{stop(r.id);start(r.id);render(ui);})):null);
 if(s.tab==='code'){const ta=h('textarea',{spellcheck:false,value:s.draft,'aria-label':'Plugin code',oninput:()=>{s.draft=ta.value;},onkeydown:e=>{if(e.key==='Tab'){e.preventDefault();const a=ta.selectionStart;ta.setRangeText('  ',a,ta.selectionEnd,'end');s.draft=ta.value;}e.stopPropagation();}});
  box.append(ta,h('div',{class:'fpm-row'},button(r?(r.meta.kind==='userscript'?'Save (applies on reload)':'Save and restart'):'Install',async()=>{try{const meta=parseMeta(s.draft);if(r&&meta.id!==r.id)throw Error('Keep the @id the same, or make a new plugin.');
     await install(s.draft,r&&r.source?.type!=='local'?{...r.source,edited:true}:{type:'local'});s.status='Saved.';ui.sheet={...s,id:meta.id};render(ui);}catch(e){s.status=String(e?.message||e);render(ui);}}),
   r?button('Undo my changes',()=>{s.draft=r.code;s.status='';render(ui);}):null,
   h('span',{class:'fpm-note',role:'status'},s.status||'')),
   r&&r.source?.type!=='local'?h('p',{class:'fpm-note'},'Updates from the original source will replace your changes.'):null);}
 return box;}
function settingsForm(run){const form=h('div',{class:'fpm-form'});
 for(const [key,d] of Object.entries(run.settingsSchema)){const v=run.api.settings.get(key),id='fpm-s-'+Math.random().toString(36).slice(2,8),label=h('label',{for:id},d.label||key);let input;
  const set=val=>run.api.settings.set(key,val);
  if(d.type==='checkbox')input=h('input',{type:'checkbox',id,checked:!!v,onchange:e=>set(e.target.checked)});
  else if(d.type==='range'){const out=h('span',{},String(v));input=h('span',{class:'fpm-row'},h('input',{type:'range',id,min:d.min??0,max:d.max??100,step:d.step??1,value:v,oninput:e=>{out.textContent=e.target.value;set(Number(e.target.value));}}),out);}
  else if(d.type==='number')input=h('input',{type:'number',id,min:d.min,max:d.max,step:d.step,value:v,onchange:e=>set(Number(e.target.value))});
  else if(d.type==='select'){input=h('select',{id,onchange:e=>set(e.target.value)},...(d.options||[]).map(o=>{const [val,lab]=Array.isArray(o)?o:[o,o];return h('option',{value:val,selected:String(val)===String(v)},lab);}));}
  else if(d.type==='color')input=h('input',{type:'color',id,value:v,oninput:e=>set(e.target.value)});
  else input=h('input',{type:'text',id,value:v??'',maxLength:d.maxLength||200,onchange:e=>set(e.target.value)});
  form.append(label,input);if(d.note)form.append(h('span'),h('span',{class:'settings-note fpm-small'},d.note));}
 return form;}
const domTab={timer:0,start(){if(!this.timer)this.timer=setInterval(()=>this.check(),1500);this.check();},
 check(){if(document.getElementById('settings-plugins-tab'))return;const gen=document.getElementById('settings-main-tab'),main=document.getElementById('settings-main');if(!gen||!main||!gen.parentElement)return;
  const btn=h('button',{type:'button',className:'settings-tab',id:'settings-plugins-tab',role:'tab','aria-selected':'false','aria-controls':'settings-plugins',tabIndex:-1,'data-fpm-tab':'1'},'Plugins');
  const panel=h('div',{className:'settings-tab-content',id:'settings-plugins',role:'tabpanel','aria-labelledby':'settings-plugins-tab','aria-hidden':'true',hidden:true});
  gen.after(btn);main.parentElement.insertBefore(panel,main.nextSibling);
  btn.addEventListener('click',()=>{for(const t of btn.parentElement.querySelectorAll('.settings-tab')){const on=t===btn;t.classList.toggle('active',on);t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;}
   for(const c of panel.parentElement.querySelectorAll(':scope>.settings-tab-content')){const on=c===panel;c.classList.toggle('active',on);c.hidden=!on;c.setAttribute('aria-hidden',String(!on));}hook.panel(panel);});
  // any other tab hides ours (the game shows the one that was clicked)
  btn.parentElement.addEventListener('click',e=>{const t=e.target.closest?.('.settings-tab');if(!t||t===btn)return;btn.classList.remove('active');btn.setAttribute('aria-selected','false');btn.tabIndex=-1;panel.classList.remove('active');panel.hidden=true;panel.setAttribute('aria-hidden','true');},true);}};
function openWindow(){let win=document.getElementById('fpm-window');if(win){win.remove();return;}css();
 const body=h('div',{class:'fpm-body-host fister-react95-content'});
 win=h('div',{id:'fpm-window',class:'fister-react95-window win95-window',role:'dialog','aria-label':'Plugins'},
  h('div',{class:'fister-react95-title-bar win95-title-bar'},h('div',{class:'fister-react95-title-content'},'Plugins'),h('button',{type:'button',class:'fister-react95-title-button win95-title-btn','aria-label':'Close',onclick:()=>win.remove()},'X')),body);
 document.body.append(win);mountManager(body,true);}
addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='KeyP'){e.preventDefault();e.stopPropagation();openWindow();}if(e.key==='Escape'&&document.getElementById('fpm-window')){document.getElementById('fpm-window').remove();}},true);

// ======================================================================
// Start
// ======================================================================
(async()=>{await loadStore();
 const go=()=>{domTab.start();if(SAFE){changed();return;}for(const r of plugins.values())if(r.enabled)start(r.id);changed();
  if(prefs.autoUpdate&&plugins.size&&Date.now()-prefs.lastCheck>6*3600e3)setTimeout(()=>checkUpdates(true).then(n=>{if(n)toast(n+' plugin'+(n>1?'s were':' was')+' updated. Restart the game to use them everywhere.',6000,'Plugins');}),15000);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go,{once:true});else go();})();
})();
