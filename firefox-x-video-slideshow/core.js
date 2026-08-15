(() => {
  "use strict";

  if (globalThis.__xMediaSlideshow) return;

  const TWEET = 'article[data-testid="tweet"]';
  const MEDIA_IMAGE = 'img[src*="twimg.com/media/"]';
  const STATUS_LINK = 'a[href*="/status/"]';
  const OVERLAY_ID = 'x-media-slideshow';

  const state = {
    running: false,
    includeImages: false,
    imageDurationMs: 3000,
    items: [],
    index: 0,
    revision: 0,
    observer: null,
    scanTimer: null,
    startScrollY: 0,
    activeVideo: null,
    mediaMuted: true,
    mediaVolume: 0.5,
    mediaRate: 1,
    userPaused: false,
    imageClock: null,
    wheelLockTimer: null,
    wheelAccumulator: 0,
    socialRefreshTimer: null,
    controlsHideTimer: null,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function statusUrl(article) {
    const link = article?.querySelector(STATUS_LINK);
    if (!link) return null;
    try {
      const url = new URL(link.href, location.href);
      const match = url.pathname.match(/^\/[^/]+\/status\/\d+/);
      return match ? `${url.origin}${match[0]}` : null;
    } catch {
      return null;
    }
  }

  function normalizedImageUrl(raw) {
    if (!raw) return null;
    try {
      const url = new URL(raw, location.href);
      if (!url.hostname.endsWith('twimg.com') || !url.pathname.includes('/media/')) return null;
      url.searchParams.set('name', 'large');
      return url.href;
    } catch {
      return null;
    }
  }

  function usableVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return false;
    return Boolean(video.currentSrc || video.src || video.querySelector('source[src]'));
  }

  function imageCandidates(article) {
    if (!state.includeImages) return [];
    return Array.from(article.querySelectorAll(MEDIA_IMAGE))
      .map((image, imageIndex) => ({
        element: image,
        url: normalizedImageUrl(image.currentSrc || image.src),
        imageIndex,
      }))
      .filter((candidate) => candidate.url);
  }

  function describeArticle(article, articleIndex) {
    const postUrl = statusUrl(article);
    if (!postUrl) return [];

    const output = [];
    const video = article.querySelector('video');
    if (usableVideo(video)) {
      output.push({
        id: `${postUrl}#video`,
        kind: 'video',
        postUrl,
        article,
        element: video,
        order: articleIndex * 100,
      });
    }

    for (const image of imageCandidates(article)) {
      output.push({
        id: `${postUrl}#image-${image.imageIndex}:${image.url}`,
        kind: 'image',
        postUrl,
        article,
        element: image.element,
        src: image.url,
        order: articleIndex * 100 + image.imageIndex + 1,
      });
    }
    return output;
  }

  function scanVisibleFeed() {
    const articles = Array.from(document.querySelectorAll(TWEET));
    const found = [];
    articles.forEach((article, index) => found.push(...describeArticle(article, index)));

    const existing = new Map(state.items.map((item) => [item.id, item]));
    for (const item of found) {
      const previous = existing.get(item.id);
      if (previous) Object.assign(previous, item);
      else state.items.push(item);
    }

    state.items.sort((a, b) => {
      const aArticle = a.article?.isConnected ? a.article : null;
      const bArticle = b.article?.isConnected ? b.article : null;
      if (aArticle && bArticle && aArticle !== bArticle) {
        const relation = aArticle.compareDocumentPosition(bArticle);
        if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      }
      return a.order - b.order;
    });

    api.emit('catalogchange');
    return found.length;
  }

  function findArticleByPost(postUrl) {
    if (!postUrl) return null;
    for (const article of document.querySelectorAll(TWEET)) {
      if (statusUrl(article) === postUrl) return article;
    }
    return null;
  }

  function refreshItemReference(item) {
    const article = findArticleByPost(item?.postUrl);
    if (!article) return false;
    item.article = article;
    if (item.kind === 'video') {
      const video = article.querySelector('video');
      if (!usableVideo(video)) return false;
      item.element = video;
      return true;
    }

    const candidates = imageCandidates(article);
    const match = candidates.find((candidate) => candidate.url === item.src);
    if (!match) return false;
    item.element = match.element;
    return true;
  }

  function currentItem() {
    return state.items[state.index] || null;
  }

  function scheduleScan() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      if (state.running) scanVisibleFeed();
    }, 1800);
  }

  function observeFeed() {
    if (state.observer) return;
    state.observer = new MutationObserver(scheduleScan);
    state.observer.observe(document.body, { subtree: true, childList: true });
  }

  function stopObserving() {
    clearTimeout(state.scanTimer);
    state.scanTimer = null;
    state.observer?.disconnect();
    state.observer = null;
  }

  async function discoverForward(targetIndex, revision) {
    const maxPasses = 5;
    for (let pass = 0; pass < maxPasses; pass += 1) {
      if (!state.running || revision !== state.revision) return false;
      scanVisibleFeed();
      if (targetIndex < state.items.length) return true;

      window.scrollBy({ top: Math.max(420, innerHeight * 0.82), behavior: 'smooth' });
      await sleep(460 + pass * 120);
    }
    scanVisibleFeed();
    return targetIndex < state.items.length;
  }

  async function locateItem(item, direction, revision) {
    if (!item) return false;
    if (item.element?.isConnected) return true;
    if (refreshItemReference(item)) return true;

    for (let attempt = 0; attempt < 7; attempt += 1) {
      if (!state.running || revision !== state.revision) return false;
      window.scrollBy({ top: direction * Math.max(360, innerHeight * 0.65), behavior: 'smooth' });
      await sleep(380);
      scanVisibleFeed();
      if (refreshItemReference(item)) return true;
    }
    return false;
  }

  const listeners = new Map();
  function on(eventName, handler) {
    if (!listeners.has(eventName)) listeners.set(eventName, new Set());
    listeners.get(eventName).add(handler);
    return () => listeners.get(eventName)?.delete(handler);
  }

  function emit(eventName, payload) {
    for (const handler of listeners.get(eventName) || []) {
      try { handler(payload); } catch (error) { console.error('X Media Slideshow event handler failed', error); }
    }
  }

  const api = {
    OVERLAY_ID,
    state,
    sleep,
    scanVisibleFeed,
    currentItem,
    findArticleByPost,
    refreshItemReference,
    observeFeed,
    stopObserving,
    discoverForward,
    locateItem,
    on,
    emit,
  };

  globalThis.__xMediaSlideshow = api;
})();
