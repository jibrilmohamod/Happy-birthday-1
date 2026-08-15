(() => {
  "use strict";
  if (globalThis.__XVS9) return;

  const OVERLAY_ID = "twitter-video-slideshow-overlay";
  const state = {
    overlay: null, host: null, player: null, items: [], index: 0, active: false,
    manualPause: false, activeVideo: null, navId: 0, lastDir: 0,
    muted: true, volume: .5, rate: 1,
    observer: null, collectTimer: null,
    seenVideoKeys: new Set(), seenImageKeys: new Set(),
    seenVideoEls: new WeakSet(), seenImageEls: new WeakSet(), seenArticles: new WeakSet(),
    includeImages: false, imageIntervalMs: 3000,
    imageTimer: null, imageProgressTimer: null, imageStartedAt: 0, imageRunMs: 0, imageRemainingMs: 0,
    wheelDelta: 0, wheelGestureLocked: false, wheelResetTimer: null,
    socialTimer: null, toastTimer: null, controlsTimer: null
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const currentItem = () => state.items[state.index] || null;

  function sourceOf(video) {
    return video.currentSrc || video.src || Array.from(video.querySelectorAll("source")).find(source => source.src)?.src || null;
  }

  function tweetKey(article, fallback) {
    let key = article?.querySelector('a[href*="/status/"]')?.href?.split("?")[0] || article?.dataset?.xvsKey || fallback || null;
    if (article?.dataset && key) article.dataset.xvsKey = key;
    return key;
  }

  function normalizeImage(src) {
    if (!src) return null;
    try {
      const url = new URL(src);
      if (!url.hostname.endsWith("twimg.com") || !url.pathname.includes("/media/")) return null;
      url.searchParams.set("name", "large");
      return url.toString();
    } catch {
      return null;
    }
  }

  function imageKey(article, src) {
    const status = article?.querySelector('a[href*="/status/"]')?.href?.split("?")[0] || "image";
    let clean = src;
    try {
      const url = new URL(src);
      clean = `${url.origin}${url.pathname}`;
    } catch {}
    return `${status}::${clean}`;
  }

  function updateCount() {
    globalThis.__XVS9?.updateCounter?.();
  }

  function collectMedia() {
    let added = 0;

    for (const article of document.querySelectorAll("article")) {
      for (const media of article.querySelectorAll('video, img[src*="twimg.com/media/"]')) {
        if (media.closest(`#${OVERLAY_ID}`)) continue;

        if (media instanceof HTMLVideoElement) {
          if (state.seenVideoEls.has(media) || state.seenArticles.has(article)) continue;
          const src = sourceOf(media) || article.querySelector('source[src*="video.twimg.com"]')?.src || article.querySelector('a[href*="video.twimg.com"]')?.href || null;
          if (!src && media.readyState < 2) continue;
          if (!src) continue;
          const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null;
          if (!duration) continue;
          const key = tweetKey(article, src);
          if (key && state.seenVideoKeys.has(key)) continue;
          if (key) state.seenVideoKeys.add(key);
          state.seenVideoEls.add(media);
          state.seenArticles.add(article);
          state.items.push({ type: "video", el: media, article, src, duration, key, placeholder: null, originalParent: null });
          added += 1;
          continue;
        }

        if (!state.includeImages || state.seenImageEls.has(media)) continue;
        const src = normalizeImage(media.currentSrc || media.src);
        if (!src) continue;
        const key = imageKey(article, src);
        if (state.seenImageKeys.has(key)) continue;
        state.seenImageKeys.add(key);
        state.seenImageEls.add(media);
        state.items.push({ type: "image", el: media, article, src, duration: state.imageIntervalMs / 1000, key, placeholder: null, originalParent: null });
        added += 1;
      }
    }

    updateCount();
    return added;
  }

  function startObserver() {
    if (state.observer) return;
    state.observer = new MutationObserver(() => {
      clearTimeout(state.collectTimer);
      state.collectTimer = setTimeout(() => {
        if (state.active) collectMedia();
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
    const before = state.items.length;
    const node = scrollNode(state.items.at(-1));
    if (node) {
      try { node.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
      await sleep(200);
    }

    if (state.player && !state.player.paused && !state.player.ended && tries < 2) return false;

    for (let i = 0; i < 3; i += 1) {
      if (!state.active || (navId && navId !== state.navId)) return false;
      window.scrollBy({ top: innerHeight * .9, behavior: "smooth" });
      await sleep(220 + i * 80);
    }

    await sleep(500 + tries * 150);
    if (!state.active || (navId && navId !== state.navId)) return false;
    collectMedia();
    return state.items.length > before;
  }

  async function ensureIndex(index, navId) {
    let tries = 0;
    while (index >= state.items.length && tries < 5) {
      const loaded = await attemptLoadMore(tries, navId);
      tries += 1;
      if (!loaded) {
        await sleep(500);
        if (!state.active || navId !== state.navId) return false;
        collectMedia();
      }
    }
    return index < state.items.length;
  }

  function refind(item) {
    if (!item?.key || item.type !== "video") return false;
    for (const article of document.querySelectorAll("article")) {
      const key = article.querySelector('a[href*="/status/"]')?.href?.split("?")[0] || article.dataset?.xvsKey || null;
      if (key !== item.key) continue;
      const video = article.querySelector("video");
      if (!video) continue;
      item.el = video;
      item.article = article;
      state.seenVideoEls.add(video);
      state.seenArticles.add(article);
      return true;
    }
    return false;
  }

  function resetSeen() {
    state.seenVideoKeys.clear();
    state.seenImageKeys.clear();
    state.seenVideoEls = new WeakSet();
    state.seenImageEls = new WeakSet();
    state.seenArticles = new WeakSet();
  }

  globalThis.__XVS9 = {
    OVERLAY_ID, state, sleep, currentItem, collectMedia, startObserver, stopObserver,
    attemptLoadMore, ensureIndex, refind, resetSeen
  };
})();