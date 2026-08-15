(() => {
  "use strict";
  if (window.__xvsChromePort) return;
  window.__xvsChromePort = true;

  const OVERLAY_ID = "twitter-video-slideshow-overlay";
  const state = {
    overlay: null,
    host: null,
    player: null,
    videos: [],
    index: 0,
    active: false,
    manualPause: false,
    activeVideo: null,
    navId: 0,
    lastDir: 0,
    muted: true,
    volume: 0.5,
    rate: 1,
    observer: null,
    collectTimer: null,
    seenKeys: new Set(),
    seenEls: new WeakSet(),
    seenArticles: new WeakSet(),
    wheelDelta: 0,
    wheelLockedUntil: 0
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function sourceOf(video) {
    return video.currentSrc || video.src || Array.from(video.querySelectorAll("source")).find(s => s.src)?.src || null;
  }

  function tweetKey(article, src) {
    let key = article?.querySelector('a[href*="/status/"]')?.href?.split("?")[0] || article?.dataset?.xvsKey || src || null;
    if (article?.dataset && key) article.dataset.xvsKey = key;
    return key;
  }

  function collectVideos() {
    let added = 0;
    for (const el of document.querySelectorAll("video")) {
      if (el.closest(`#${OVERLAY_ID}`)) continue;
      const article = el.closest("article");
      if (!article || state.seenEls.has(el) || state.seenArticles.has(article)) continue;

      let src = sourceOf(el);
      if (!src) {
        src = article.querySelector('source[src*="video.twimg.com"]')?.src || article.querySelector('a[href*="video.twimg.com"]')?.href || null;
      }
      if (!src && el.readyState < 2) continue;
      if (!src) continue;

      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
      if (!duration) continue;

      const key = tweetKey(article, src);
      if (key && state.seenKeys.has(key)) continue;
      if (key) state.seenKeys.add(key);
      state.seenEls.add(el);
      state.seenArticles.add(article);
      state.videos.push({ el, src, duration, key, placeholder: null, originalParent: null });
      added++;
    }
    updateCounter();
    return added;
  }

  function startObserver() {
    if (state.observer) return;
    state.observer = new MutationObserver(() => {
      clearTimeout(state.collectTimer);
      state.collectTimer = setTimeout(() => {
        if (state.active) collectVideos();
        state.collectTimer = null;
      }, 2500);
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    clearTimeout(state.collectTimer);
    state.collectTimer = null;
    state.observer?.disconnect();
    state.observer = null;
  }

  function scrollNode(item) {
    if (!item) return null;
    if (item.el && document.contains(item.el)) return item.el;
    if (item.placeholder && document.contains(item.placeholder)) return item.placeholder;
    return null;
  }

  async function attemptLoadMore(tries = 0, navId) {
    if (!state.active || (navId && navId !== state.navId)) return false;
    const before = state.videos.length;
    const last = state.videos.at(-1);
    const node = scrollNode(last);
    if (node) {
      try { node.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
      await sleep(200);
    }

    if (state.player && !state.player.paused && !state.player.ended && tries < 2) return false;

    for (let i = 0; i < 3; i++) {
      if (!state.active || (navId && navId !== state.navId)) return false;
      window.scrollBy({ top: innerHeight * 0.9, behavior: "smooth" });
      await sleep(220 + i * 80);
    }
    await sleep(500 + tries * 150);
    if (!state.active || (navId && navId !== state.navId)) return false;
    collectVideos();
    return state.videos.length > before;
  }

  async function ensureIndex(index, navId) {
    let tries = 0;
    while (index >= state.videos.length && tries < 5) {
      const loaded = await attemptLoadMore(tries, navId);
      tries++;
      if (!loaded) {
        await sleep(500);
        if (!state.active || navId !== state.navId) return false;
        collectVideos();
      }
    }
    return index < state.videos.length;
  }

  function refind(item) {
    if (!item?.key) return false;
    for (const article of document.querySelectorAll("article")) {
      const key = article.querySelector('a[href*="/status/"]')?.href?.split("?")[0] || article.dataset?.xvsKey || null;
      if (key !== item.key) continue;
      const video = article.querySelector("video");
      if (video) {
        item.el = video;
        state.seenEls.add(video);
        state.seenArticles.add(article);
        return true;
      }
    }
    return false;
  }

  function restoreActive() {
    const a = state.activeVideo;
    if (!a) return;
    try {
      if (a.placeholder?.isConnected && a.originalParent?.isConnected) {
        a.originalParent.insertBefore(a.el, a.placeholder);
        a.placeholder.remove();
      }
    } catch {}
    state.activeVideo = null;
  }

  function detachPlayerEvents() {
    const p = state.player;
    if (!p) return;
    p.removeEventListener("ended", onEnded);
    p.removeEventListener("pause", onPause);
    p.removeEventListener("timeupdate", updateProgress);
    p.removeEventListener("loadedmetadata", updateProgress);
    p.removeEventListener("canplay", updateProgress);
  }

  function applyVolume() {
    if (!state.player) return;
    const muted = state.muted || state.volume <= 0;
    state.player.muted = muted;
    state.player.volume = muted ? 0 : state.volume;
    document.querySelector("#xvs-mute")?.replaceChildren(document.createTextNode(muted ? "Muted" : "Sound"));
  }

  function playWithRetry(retries = 2) {
    const p = state.player;
    if (!p || !p.paused || p.seeking) return;
    applyVolume();
    p.muted = state.muted || state.volume <= 0;
    const result = p.play();
    if (result?.catch) {
      result.catch(err => {
        if (retries > 0) setTimeout(() => playWithRetry(retries - 1), 100);
        else console.warn("XVS autoplay failed", err);
      });
    }
  }

  function onEnded() {
    if (!state.manualPause && state.active) void goTo(state.index + 1);
  }

  function onPause() {
    if (!state.player || state.manualPause || state.player.ended) return;
    playWithRetry(1);
  }

  function updateCounter() {
    const el = document.querySelector("#xvs-count");
    if (el) el.textContent = `${Math.min(state.index + 1, state.videos.length)}/${state.videos.length || "--"}`;
  }

  function updateProgress() {
    const p = state.player;
    if (!p) return;
    const range = document.querySelector("#xvs-progress");
    const time = document.querySelector("#xvs-time");
    if (range) range.value = Number.isFinite(p.duration) && p.duration > 0 ? String(Math.round((p.currentTime / p.duration) * 1000)) : "0";
    if (time) {
      const fmt = s => Number.isFinite(s) ? `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}` : "--:--";
      time.textContent = `${fmt(p.currentTime)} / ${fmt(p.duration)}`;
    }
    updateCounter();
  }

  function overlayHtml() {
    return `
      <div id="xvs-host"></div>
      <button id="xvs-close">×</button>
      <div id="xvs-controls">
        <button id="xvs-prev">◀</button>
        <button id="xvs-play">Pause</button>
        <button id="xvs-next">▶</button>
        <input id="xvs-progress" type="range" min="0" max="1000" value="0" />
        <span id="xvs-time">0:00 / 0:00</span>
        <button id="xvs-mute">Muted</button>
        <input id="xvs-volume" type="range" min="0" max="1" step="0.05" value="0" />
        <select id="xvs-rate"><option>.5x</option><option>.75x</option><option selected>1x</option><option>1.25x</option><option>1.5x</option><option>2x</option></select>
        <span id="xvs-count">--/--</span>
      </div>`;
  }

  function createOverlay() {
    if (state.overlay) return;
    const o = document.createElement("div");
    o.id = OVERLAY_ID;
    o.innerHTML = overlayHtml();
    Object.assign(o.style, { position:"fixed", inset:"0", zIndex:"999999", background:"rgba(0,0,0,.96)", color:"#fff" });
    const host = o.querySelector("#xvs-host");
    Object.assign(host.style, { position:"absolute", inset:"0 0 58px 0", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" });
    const controls = o.querySelector("#xvs-controls");
    Object.assign(controls.style, { position:"absolute", left:"0", right:"0", bottom:"0", height:"58px", display:"grid", gridTemplateColumns:"auto auto auto 1fr auto auto 90px auto auto", alignItems:"center", gap:"8px", padding:"6px 14px", boxSizing:"border-box", background:"rgba(0,0,0,.86)" });
    o.querySelectorAll("button,select").forEach(el => Object.assign(el.style,{background:"#202327",color:"#fff",border:"0",borderRadius:"8px",padding:"8px",cursor:"pointer"}));
    const close = o.querySelector("#xvs-close");
    Object.assign(close.style,{position:"absolute",top:"12px",right:"12px",zIndex:"10",width:"34px",height:"34px"});
    document.body.appendChild(o);
    state.overlay = o;
    state.host = host;

    close.addEventListener("click", destroyOverlay);
    o.querySelector("#xvs-prev").addEventListener("click", () => void goTo(state.index - 1));
    o.querySelector("#xvs-next").addEventListener("click", () => void goTo(state.index + 1));
    o.querySelector("#xvs-play").addEventListener("click", () => {
      const p = state.player; if (!p) return;
      if (p.paused) { state.manualPause = false; playWithRetry(2); }
      else { state.manualPause = true; p.pause(); }
      o.querySelector("#xvs-play").textContent = p.paused ? "Play" : "Pause";
    });
    o.querySelector("#xvs-mute").addEventListener("click", () => {
      state.muted = !state.muted;
      if (!state.muted && state.volume <= 0) state.volume = 0.5;
      o.querySelector("#xvs-volume").value = state.muted ? "0" : String(state.volume);
      applyVolume();
    });
    o.querySelector("#xvs-volume").addEventListener("input", e => {
      state.volume = Math.max(0,Math.min(1,Number(e.target.value)||0));
      state.muted = state.volume === 0;
      applyVolume();
    });
    o.querySelector("#xvs-progress").addEventListener("input", e => {
      const p=state.player; if(!p || !Number.isFinite(p.duration) || p.duration<=0) return;
      p.currentTime=(Number(e.target.value)/1000)*p.duration;
    });
    o.querySelector("#xvs-rate").addEventListener("change", e => {
      const map={".5x":.5,".75x":.75,"1x":1,"1.25x":1.25,"1.5x":1.5,"2x":2};
      state.rate=map[e.target.value]||1; if(state.player) state.player.playbackRate=state.rate;
    });

    document.addEventListener("keydown", keyHandler, true);
    window.addEventListener("wheel", wheelHandler, {capture:true,passive:false});
  }

  async function moveIntoOverlay(item) {
    const el = item?.el;
    if (!(el instanceof HTMLVideoElement) || !el.isConnected) return false;

    detachPlayerEvents();
    try { state.player?.pause(); } catch {}
    restoreActive();

    const parent = el.parentElement;
    if (!parent) return false;
    const placeholder = document.createElement("div");
    placeholder.style.display = "none";
    parent.insertBefore(placeholder, el);
    state.activeVideo = { el, placeholder, originalParent: parent };
    item.placeholder = placeholder;
    item.originalParent = parent;

    state.player = el;
    state.host.innerHTML = "";
    state.host.appendChild(el);
    Object.assign(el.style, { width:"100%", height:"100%", maxWidth:"100%", maxHeight:"100%", objectFit:"contain", background:"#000", display:"block" });
    el.controls = false;
    el.playsInline = true;
    el.loop = false;
    el.playbackRate = state.rate;
    applyVolume();

    el.addEventListener("ended", onEnded);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", updateProgress);
    el.addEventListener("loadedmetadata", updateProgress);
    el.addEventListener("canplay", updateProgress);

    if (el.currentTime > 0.5) { try { el.currentTime = 0; } catch {} }
    state.manualPause = false;
    playWithRetry(3);
    updateProgress();
    setTimeout(() => { if (state.player && !state.player.ended && !state.manualPause && state.player.paused) playWithRetry(1); }, 400);
    return true;
  }

  async function loadCurrent(dir, navId) {
    if (navId !== state.navId) return false;
    const item = state.videos[state.index];
    if (!item) return false;

    if (item.key && (!item.el || !document.contains(item.el))) {
      refind(item);
      if ((!item.el || !document.contains(item.el)) && dir !== 0) {
        for (let i=0;i<6;i++) {
          if (navId !== state.navId) return false;
          window.scrollBy({top:innerHeight*.7*dir,behavior:"smooth"});
          await sleep(400);
          refind(item);
          if (item.el && document.contains(item.el)) break;
        }
      }
    }
    if (navId !== state.navId) return false;
    const ok = await moveIntoOverlay(item);
    if (!ok) return false;
    playWithRetry(2);

    setTimeout(() => {
      if (!state.player || state.manualPause || navId !== state.navId) return;
      const stalled = state.player.paused && !state.player.ended && state.player.currentTime < .1;
      const noMeta = state.player.readyState < 2 || !Number.isFinite(state.player.duration);
      if ((stalled || noMeta) && state.player.networkState !== 2) {
        playWithRetry(1);
        setTimeout(() => {
          if (!state.player || state.manualPause || navId !== state.navId) return;
          if (state.player.paused && !state.player.ended && state.player.currentTime < .1 && state.player.networkState !== 2) {
            void goTo(state.index + (dir >= 0 ? 1 : -1));
          }
        },2000);
      }
    },4000);
    return true;
  }

  async function goTo(target) {
    const navId = ++state.navId;
    const dir = target > state.index ? 1 : target < state.index ? -1 : 0;
    state.lastDir = dir;
    if (target < 0) target = 0;
    if (target >= state.videos.length) {
      const ok = await ensureIndex(target, navId);
      if (!ok || navId !== state.navId) return;
    }
    state.index = target;
    await loadCurrent(dir, navId);
    updateCounter();
  }

  function keyHandler(e) {
    if (!state.overlay) return;
    if (e.code === "Escape") { e.preventDefault(); destroyOverlay(); }
    else if (e.code === "ArrowLeft") { e.preventDefault(); void goTo(state.index-1); }
    else if (e.code === "ArrowRight") { e.preventDefault(); void goTo(state.index+1); }
    else if (e.code === "Space") { e.preventDefault(); state.overlay.querySelector("#xvs-play").click(); }
  }

  function wheelHandler(e) {
    if (!state.overlay) return;
    if (e.target instanceof HTMLElement && e.target.closest("button,input,select")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const now = performance.now();
    if (now < state.wheelLockedUntil) return;
    state.wheelDelta += e.deltaY;
    if (Math.abs(state.wheelDelta) < 70) return;
    const dir = state.wheelDelta > 0 ? 1 : -1;
    state.wheelDelta = 0;
    state.wheelLockedUntil = now + 380;
    void goTo(state.index + dir);
  }

  function destroyOverlay() {
    if (!state.overlay) return;
    ++state.navId;
    document.removeEventListener("keydown", keyHandler, true);
    window.removeEventListener("wheel", wheelHandler, true);
    detachPlayerEvents();
    try { restoreActive(); } catch {}
    state.overlay.remove();
    state.overlay = state.host = state.player = null;
    state.videos = [];
    state.index = 0;
    state.manualPause = false;
    state.active = false;
    state.seenKeys.clear();
    state.seenEls = new WeakSet();
    state.seenArticles = new WeakSet();
    stopObserver();
  }

  function startSlideshow() {
    if (state.active) return {ok:true,active:true};
    state.active = true;
    state.videos = [];
    state.index = 0;
    state.seenKeys.clear();
    state.seenEls = new WeakSet();
    state.seenArticles = new WeakSet();
    state.muted = true;
    state.volume = 0.5;
    collectVideos();
    startObserver();

    if (!state.videos.length) {
      (async()=>{
        const navId=++state.navId;
        for(let i=0;i<3 && !state.videos.length;i++) { await attemptLoadMore(i,navId); collectVideos(); }
        if(navId!==state.navId) return;
        if(!state.videos.length){ state.active=false; stopObserver(); alert("No videos found on this part of the page."); return; }
        createOverlay(); state.index=0; await loadCurrent(0,navId);
      })();
      return {ok:false,active:true,message:"Looking for videos…"};
    }

    createOverlay();
    const navId=++state.navId;
    void loadCurrent(0,navId);
    return {ok:true,active:true,message:`Starting with ${state.videos.length} video${state.videos.length===1?"":"s"}.`};
  }

  browser.runtime.onMessage.addListener(msg => {
    if (msg?.type === "XVS_PING") return Promise.resolve({loaded:true,active:state.active,architecture:"chrome-v3-port"});
    if (msg?.type !== "XVS_TOGGLE") return undefined;
    if (state.active) { destroyOverlay(); return Promise.resolve({active:false,ok:true}); }
    return Promise.resolve(startSlideshow());
  });
})();
