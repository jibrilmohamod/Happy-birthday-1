(() => {
  "use strict";
  if (window.__xvsStandaloneWrapper) return;
  window.__xvsStandaloneWrapper = true;

  const TWEET = 'article[data-testid="tweet"]';
  const ROOT = "xvs-standalone-root";
  const PREFETCH_TARGET = 8;
  const state = {
    active: false, navigating: false, token: 0,
    root: null, host: null, status: null, badge: null, toast: null, gate: null,
    current: null, index: -1, catalog: [], seen: new Set(), pos: new Map(),
    muted: null, volume: 1, rate: 1, userPaused: false, trustedAt: 0, lastTime: 0,
    loader: null, loaderState: "idle", noGrowth: 0, toastTimer: null,
    wheel: 0, wheelUntil: 0, startY: 0
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const css = (el, styles) => Object.assign(el.style, styles);

  function makeRoot() {
    let root = document.getElementById(ROOT);
    if (root) return root;
    root = document.createElement("div");
    root.id = ROOT;
    css(root, {position:"fixed",inset:"0",width:"100vw",height:"100vh",zIndex:"2147483646",overflow:"hidden",background:"#000",color:"#fff",fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'});

    const host = document.createElement("div");
    css(host, {position:"absolute",inset:"0",display:"flex",alignItems:"center",justifyContent:"center",background:"#000"});
    root.appendChild(host);

    const status = document.createElement("div");
    css(status, {position:"absolute",inset:"0",display:"none",alignItems:"center",justifyContent:"center",padding:"32px",boxSizing:"border-box",background:"#000",zIndex:"4",fontWeight:"700",textAlign:"center",pointerEvents:"none"});
    root.appendChild(status);

    const toast = document.createElement("div");
    css(toast, {position:"absolute",top:"18px",left:"50%",transform:"translateX(-50%)",zIndex:"2147483647",padding:"9px 13px",borderRadius:"999px",background:"rgba(32,35,39,.9)",fontSize:"13px",fontWeight:"650",opacity:"0",transition:"opacity 120ms",pointerEvents:"none"});
    root.appendChild(toast);

    const badge = document.createElement("div");
    css(badge, {position:"absolute",top:"18px",right:"18px",zIndex:"2147483647",padding:"8px 11px",borderRadius:"999px",background:"rgba(32,35,39,.86)",fontSize:"13px",fontWeight:"700",pointerEvents:"none"});
    root.appendChild(badge);

    const gate = document.createElement("button");
    gate.type = "button";
    gate.textContent = "Start slideshow with sound";
    css(gate, {position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",zIndex:"2147483647",display:"none",padding:"13px 18px",border:"1px solid rgba(255,255,255,.2)",borderRadius:"999px",background:"#1d9bf0",color:"#fff",fontSize:"15px",fontWeight:"750",cursor:"pointer"});
    gate.addEventListener("click", async (e) => {
      if (!e.isTrusted || !state.current?.video) return;
      e.preventDefault(); e.stopPropagation(); state.trustedAt = performance.now(); state.userPaused = false;
      if (!(await playCurrent())) gate.textContent = "Firefox blocked playback. Use the video play control.";
    }, true);
    root.appendChild(gate);

    document.documentElement.appendChild(root);
    Object.assign(state, {root, host, status, toast, badge, gate});
    updateBadge();
    return root;
  }

  function setStatus(text, show = true) { makeRoot(); state.status.textContent = text || ""; state.status.style.display = show ? "flex" : "none"; }
  function gate(show, text = "Start slideshow with sound") { if (!state.gate) return; state.gate.textContent = text; state.gate.style.display = show ? "block" : "none"; }
  function toast(text, ms = 1400) { makeRoot(); clearTimeout(state.toastTimer); state.toast.textContent = text; state.toast.style.opacity = "1"; state.toastTimer = setTimeout(() => { if (state.toast) state.toast.style.opacity = "0"; }, ms); }
  function updateBadge() {
    if (!state.badge) return;
    const cur = state.index >= 0 ? state.index + 1 : 0;
    const ahead = state.index >= 0 ? Math.max(0, state.catalog.length - cur) : state.catalog.length;
    const suffix = state.loaderState === "fetching" ? " · fetching" : state.loaderState === "waiting" ? " · waiting" : "";
    state.badge.textContent = `${cur}/${state.catalog.length} loaded · ${ahead} ahead${suffix}`;
  }

  function keyFor(tweet) {
    return Array.from(tweet?.querySelectorAll('a[href*="/status/"]') || []).find(a => /\/status\/\d+/.test(a.getAttribute("href") || ""))?.getAttribute("href") || null;
  }
  function candidate(tweet) {
    const key = keyFor(tweet), video = tweet?.querySelector("video");
    if (!key || !(video instanceof HTMLVideoElement)) return null;
    const rect = tweet.getBoundingClientRect();
    return {key, video, tweet, rect, y: window.scrollY + rect.top};
  }
  function rendered() {
    const out = [], keys = new Set();
    for (const tweet of document.querySelectorAll(TWEET)) {
      const c = candidate(tweet); if (!c || keys.has(c.key)) continue; keys.add(c.key); out.push(c);
    }
    return out.sort((a,b) => a.rect.top - b.rect.top);
  }
  function ingest(list, prepend = false) {
    const fresh = [];
    for (const c of list) { state.pos.set(c.key, c.y); if (!state.seen.has(c.key)) { state.seen.add(c.key); fresh.push(c.key); } }
    if (!fresh.length) { updateBadge(); return 0; }
    if (prepend) { state.catalog = [...fresh, ...state.catalog]; if (state.index >= 0) state.index += fresh.length; }
    else state.catalog.push(...fresh);
    updateBadge(); return fresh.length;
  }
  const scan = (prepend = false) => ingest(rendered(), prepend);
  function find(key) { for (const t of document.querySelectorAll(TWEET)) if (keyFor(t) === key) return candidate(t); return null; }
  function nearest() {
    const list = rendered(); ingest(list); if (!list.length) return null;
    const center = innerHeight / 2, visible = list.filter(c => c.rect.bottom > 0 && c.rect.top < innerHeight), pool = visible.length ? visible : list;
    return pool.reduce((a,b) => Math.abs((b.rect.top+b.rect.height/2)-center) < Math.abs((a.rect.top+a.rect.height/2)-center) ? b : a);
  }

  function snap(v) {
    return {parent:v.parentNode,next:v.nextSibling,style:v.getAttribute("style"),className:v.className,controls:v.controls,autoplay:v.autoplay,muted:v.muted,volume:v.volume,rate:v.playbackRate,loop:v.loop,preload:v.preload,inline:v.playsInline,tab:v.tabIndex};
  }
  function restoreAttrs(v,o) {
    if (o.style === null) v.removeAttribute("style"); else v.setAttribute("style", o.style);
    v.className=o.className; v.controls=o.controls; v.autoplay=o.autoplay; v.muted=o.muted; v.volume=o.volume; v.playbackRate=o.rate; v.loop=o.loop; v.preload=o.preload; v.playsInline=o.inline; v.tabIndex=o.tab;
  }
  function offCurrent() {
    const c = state.current; if (!c) return;
    for (const [name,fn,capture] of c.listeners) c.video.removeEventListener(name,fn,capture);
  }
  function releaseCurrent(restore = true) {
    const c = state.current; if (!c) return;
    offCurrent();
    state.muted = c.video.muted; state.volume = c.video.volume; state.rate = c.video.playbackRate || 1;
    if (restore) restoreAttrs(c.video,c.original);
    if (restore && c.anchor?.isConnected && c.anchor.parentNode) { c.anchor.parentNode.insertBefore(c.video,c.anchor); c.anchor.remove(); }
    else if (restore && c.original.parent?.isConnected) { const sib = c.original.next?.parentNode===c.original.parent ? c.original.next : null; c.original.parent.insertBefore(c.video,sib); c.anchor?.remove(); }
    else { c.anchor?.remove(); if (c.video.isConnected) c.video.remove(); }
    state.current = null; state.lastTime = 0; state.userPaused = false;
  }

  async function playCurrent() {
    const v = state.current?.video; if (!v || !state.active) return false;
    try { await v.play(); gate(false); return true; }
    catch (e) { console.debug("XVS wrapper play blocked",e); if (!v.muted && v.volume>0) gate(true); return false; }
  }

  function bind(v) {
    const listeners = [];
    const on = (name,fn,capture=false) => { v.addEventListener(name,fn,capture); listeners.push([name,fn,capture]); };
    on("ended",()=>{ if(state.active&&!state.navigating) void move(1,"ended"); });
    on("play",()=>{ state.userPaused=false; gate(false); });
    on("playing",()=>{ state.userPaused=false; gate(false); });
    on("pointerdown",e=>{ if(e.isTrusted) state.trustedAt=performance.now(); },true);
    on("pause",()=>{
      if(!state.active||state.navigating||v!==state.current?.video||v.ended) return;
      if(performance.now()-state.trustedAt<700){state.userPaused=true;return;}
      if(state.userPaused) return;
      setTimeout(()=>{ if(state.active&&!state.navigating&&v===state.current?.video&&v.paused&&!v.ended&&!state.userPaused) void playCurrent(); },70);
    });
    on("timeupdate",()=>{ if(v===state.current?.video&&Number.isFinite(v.currentTime)) state.lastTime=v.currentTime; });
    on("volumechange",()=>{ if(v===state.current?.video){state.muted=v.muted;state.volume=v.volume;} });
    on("ratechange",()=>{ if(v===state.current?.video) state.rate=v.playbackRate||1; });
    const recover=()=>{ if(state.active&&!state.navigating&&v===state.current?.video) scheduleRecovery(); };
    on("error",recover); on("emptied",recover);
    return listeners;
  }

  async function promote(c,index,resume=null) {
    if(!state.active||!c?.video?.isConnected) return false;
    const v=c.video,o=snap(v),anchor=document.createComment("xvs-anchor");
    o.parent?.insertBefore(anchor,v);
    releaseCurrent(true); makeRoot();
    if(state.muted===null){state.muted=o.muted;state.volume=o.volume;state.rate=o.rate||1;}
    state.index=index; state.current={key:c.key,video:v,anchor,original:o,listeners:[]}; state.userPaused=false;
    v.controls=true; v.autoplay=true; v.playsInline=true; v.preload="auto"; v.loop=false; v.muted=!!state.muted; v.volume=Math.max(0,Math.min(1,Number(state.volume)||0)); v.playbackRate=Number(state.rate)||1;
    css(v,{position:"absolute",inset:"0",width:"100vw",height:"100vh",maxWidth:"none",maxHeight:"none",margin:"0",objectFit:"contain",background:"#000",zIndex:"2"});
    state.host.appendChild(v); state.current.listeners=bind(v); setStatus("",false); updateBadge();
    if(Number.isFinite(resume)&&resume>0){const seek=()=>{try{v.currentTime=Math.min(resume,Number.isFinite(v.duration)?Math.max(0,v.duration-.25):resume);}catch{}}; if(v.readyState>=1)seek();else v.addEventListener("loadedmetadata",seek,{once:true});}
    const ok=await playCurrent(); if(!ok&&v.muted) toast("Muted autoplay is blocked by Firefox settings.",2000);
    scheduleLoader(500); return true;
  }

  async function locate(key,token) {
    let c=find(key); if(c) return c;
    const y=state.pos.get(key);
    if(Number.isFinite(y)){scrollTo({top:Math.max(0,y-innerHeight*.3),behavior:"auto"});await sleep(260);if(!state.active||token!==state.token)return null;scan();c=find(key);if(c)return c;}
    for(let i=0;i<12&&state.active&&token===state.token;i++){
      const yy=state.pos.get(key),dir=Number.isFinite(yy)&&scrollY>yy?-1:1;
      scrollBy({top:dir*innerHeight*.72,behavior:"auto"}); await sleep(260); if(!state.active||token!==state.token)return null; scan(dir<0); c=find(key); if(c)return c;
    }
    return null;
  }

  async function loadNext(token,max=12){
    for(let i=0;i<max&&state.active&&token===state.token;i++){
      if(state.index+1<state.catalog.length)return true; state.loaderState="fetching";updateBadge();scrollBy({top:innerHeight*.72,behavior:"auto"});await sleep(380);if(!state.active||token!==state.token)return false;scan();
    }
    return state.index+1<state.catalog.length;
  }
  async function loadPrevious(token){
    for(let i=0;i<8&&state.active&&token===state.token;i++){
      if(state.index>0)return true;scrollBy({top:-innerHeight*.72,behavior:"auto"});await sleep(260);if(!state.active||token!==state.token)return false;scan(true);
    }
    return state.index>0;
  }

  async function move(dir,reason="input"){
    if(!state.active||state.navigating)return; state.navigating=true; cancelLoader(); const token=++state.token;
    try{
      if(dir>0&&state.index+1>=state.catalog.length&&!await loadNext(token)){if(reason!=="ended")toast("No more videos loaded yet.");return;}
      if(dir<0&&state.index<=0&&!await loadPrevious(token)){toast("No previous video found.");return;}
      const idx=state.index+dir,key=state.catalog[idx]; if(!key)return;
      const c=await locate(key,token); if(!c||token!==state.token||!state.active){toast("Could not load that video from X.",1800);return;}
      if(!await promote(c,idx))toast("X replaced that video before it could open.",1800);
    } finally { state.navigating=false; state.loaderState="idle";updateBadge();scheduleLoader(500); }
  }

  function scheduleRecovery(){
    const key=state.current?.key,idx=state.index,t=state.lastTime;if(!key||state.navigating)return;
    toast("Reloading current video…",1000);
    setTimeout(async()=>{if(!state.active||state.navigating||state.current?.key!==key)return;state.navigating=true;cancelLoader();const token=++state.token;try{const c=await locate(key,token);if(c&&token===state.token)await promote(c,idx,t);}finally{state.navigating=false;scheduleLoader(650);}},120);
  }

  function cancelLoader(){if(state.loader)clearTimeout(state.loader);state.loader=null;}
  function scheduleLoader(ms=380){cancelLoader();if(!state.active)return;state.loader=setTimeout(()=>{state.loader=null;void loaderTick();},ms);}
  async function loaderTick(){
    if(!state.active)return;if(state.navigating){scheduleLoader(600);return;}
    const ahead=Math.max(0,state.catalog.length-state.index-1);if(ahead>=PREFETCH_TARGET){state.loaderState="buffered";state.noGrowth=0;updateBadge();scheduleLoader(1000);return;}
    const before=state.catalog.length;state.loaderState="fetching";updateBadge();scrollBy({top:innerHeight*.72,behavior:"auto"});await sleep(380);
    if(!state.active||state.navigating){scheduleLoader(600);return;}scan();state.noGrowth=state.catalog.length>before?0:state.noGrowth+1;
    if(state.noGrowth>=6){state.loaderState="waiting";updateBadge();scheduleLoader(2400);return;}scheduleLoader(380);
  }

  function wheel(e){
    if(!state.active||!state.root)return;if(e.target instanceof HTMLElement&&e.target.closest("button"))return;e.preventDefault();e.stopImmediatePropagation();const now=performance.now();if(now<state.wheelUntil)return;state.wheel+=e.deltaY;if(Math.abs(state.wheel)<72)return;const d=state.wheel>0?1:-1;state.wheel=0;state.wheelUntil=now+420;void move(d,"wheel");
  }
  function typing(t){return t instanceof HTMLElement&&(t.matches("input,textarea,select")||t.isContentEditable||!!t.closest('[contenteditable="true"]'));}
  function keys(e){
    if(!state.active||e.defaultPrevented||typing(e.target))return;const k=e.key.toLowerCase();
    if(e.key==="ArrowDown"||e.key==="ArrowRight"||e.key==="PageDown"||k==="j"){e.preventDefault();e.stopImmediatePropagation();void move(1,"key");}
    else if(e.key==="ArrowUp"||e.key==="ArrowLeft"||e.key==="PageUp"||k==="k"){e.preventDefault();e.stopImmediatePropagation();void move(-1,"key");}
    else if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();deactivate();}
  }

  async function initial(token){
    let c=nearest();if(c)return c;for(let i=0;i<16&&state.active&&token===state.token;i++){setStatus("Looking for an X video…");scrollBy({top:innerHeight*.8,behavior:"auto"});await sleep(300);if(!state.active||token!==state.token)return null;c=nearest();if(c)return c;}return null;
  }
  async function activate(){
    if(state.active)return true;state.active=true;state.navigating=false;state.token++;state.startY=scrollY;state.index=-1;state.catalog=[];state.seen=new Set();state.pos=new Map();state.loaderState="idle";state.noGrowth=0;state.muted=null;state.volume=1;state.rate=1;state.wheel=0;state.wheelUntil=0;
    makeRoot();setStatus("Starting standalone X video wrapper…");addEventListener("wheel",wheel,{capture:true,passive:false});document.addEventListener("keydown",keys,true);
    const token=state.token,c=await initial(token);if(!c||token!==state.token||!state.active){if(state.active)setStatus("No X video found on this page.");return true;}
    let idx=state.catalog.indexOf(c.key);if(idx<0){state.catalog.push(c.key);state.seen.add(c.key);idx=state.catalog.length-1;}await promote(c,idx);return true;
  }
  function deactivate(){
    if(!state.active)return false;const y=state.pos.get(state.current?.key)??state.startY;state.active=false;state.navigating=false;state.token++;cancelLoader();removeEventListener("wheel",wheel,true);document.removeEventListener("keydown",keys,true);releaseCurrent(true);state.root?.remove();state.root=state.host=state.status=state.badge=state.toast=state.gate=null;if(Number.isFinite(y))scrollTo({top:Math.max(0,y-innerHeight*.25),behavior:"auto"});return false;
  }

  browser.runtime.onMessage.addListener((m)=>{
    if(m?.type==="XVS_PING")return Promise.resolve({loaded:true,active:state.active,architecture:"standalone-wrapper"});
    if(m?.type!=="XVS_TOGGLE")return undefined;if(state.active)return Promise.resolve({active:deactivate()});void activate();return Promise.resolve({active:true});
  });
})();
