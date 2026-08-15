(() => {
  "use strict";

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const PLAYER_SELECTOR = '[data-testid="videoPlayer"]';
  const ROOT_ID = 'xvs-firefox-root';
  const STYLE_ID = 'xvs-firefox-style';
  const ACTIVE_PLAYER_CLASS = 'xvs-firefox-portal-player';

  const SEARCH_ATTEMPTS = 18;
  const SEARCH_DELAY_MS = 260;
  const SCROLL_STEP = 0.78;

  const PREFETCH_AHEAD_TARGET = 12;
  const PREFETCH_IDLE_MS = 500;
  const PREFETCH_SCROLL_DELAY_MS = 320;
  const PREFETCH_SCROLL_STEP = 0.72;

  const WHEEL_THRESHOLD = 70;
  const WHEEL_COOLDOWN_MS = 360;

  const state = {
    active: false,
    navigating: false,
    token: 0,

    currentKey: null,
    currentIndex: -1,
    currentVideo: null,
    currentPlayer: null,
    endedHandler: null,
    portal: null,

    catalog: [],
    catalogSet: new Set(),
    positions: new Map(),

    root: null,
    status: null,
    toast: null,
    counter: null,
    toastTimer: null,

    prefetchGeneration: 0,
    prefetching: false,

    wheelAccumulator: 0,
    wheelCooldownUntil: 0
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483646 !important;
        overflow: hidden !important;
        overscroll-behavior: none !important;
        touch-action: none !important;
        background: #000 !important;
        color: #fff !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        pointer-events: auto !important;
        contain: layout paint style !important;
      }

      #${ROOT_ID} .xvs-status {
        position: absolute !important;
        inset: 0 !important;
        z-index: 1 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        padding: 32px !important;
        background: #000 !important;
        color: #fff !important;
        font-size: 16px !important;
        font-weight: 600 !important;
        line-height: 1.45 !important;
        text-align: center !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} .xvs-counter {
        position: absolute !important;
        top: 18px !important;
        right: 18px !important;
        z-index: 2147483647 !important;
        box-sizing: border-box !important;
        padding: 9px 12px !important;
        border: 1px solid rgba(255,255,255,0.18) !important;
        border-radius: 999px !important;
        background: rgba(15, 20, 25, 0.82) !important;
        backdrop-filter: blur(10px) !important;
        color: #fff !important;
        font-size: 13px !important;
        font-weight: 650 !important;
        line-height: 1 !important;
        white-space: nowrap !important;
        pointer-events: none !important;
      }

      #${ROOT_ID} .xvs-toast {
        position: absolute !important;
        top: 64px !important;
        left: 50% !important;
        z-index: 2147483647 !important;
        transform: translateX(-50%) !important;
        max-width: min(680px, calc(100vw - 40px)) !important;
        box-sizing: border-box !important;
        padding: 10px 14px !important;
        border-radius: 999px !important;
        background: rgba(32, 35, 39, 0.94) !important;
        color: #fff !important;
        font-size: 14px !important;
        font-weight: 600 !important;
        line-height: 1.3 !important;
        text-align: center !important;
        pointer-events: none !important;
        opacity: 0 !important;
        transition: opacity 120ms linear !important;
      }

      #${ROOT_ID} .xvs-toast.xvs-toast-visible {
        opacity: 1 !important;
      }

      #${ROOT_ID} > .${ACTIVE_PLAYER_CLASS} {
        position: absolute !important;
        inset: 0 !important;
        z-index: 2 !important;
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        min-width: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        transform: none !important;
        background: #000 !important;
        overflow: hidden !important;
        pointer-events: auto !important;
      }

      #${ROOT_ID} > .${ACTIVE_PLAYER_CLASS} video {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        object-fit: contain !important;
        background: #000 !important;
        transform: none !important;
      }

      .xvs-firefox-placeholder {
        display: block !important;
        box-sizing: border-box !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureRoot() {
    ensureStyle();

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;

      const status = document.createElement('div');
      status.className = 'xvs-status';
      root.appendChild(status);

      const toast = document.createElement('div');
      toast.className = 'xvs-toast';
      root.appendChild(toast);

      const counter = document.createElement('div');
      counter.className = 'xvs-counter';
      root.appendChild(counter);

      document.documentElement.appendChild(root);

      state.status = status;
      state.toast = toast;
      state.counter = counter;
    } else {
      state.status = root.querySelector('.xvs-status');
      state.toast = root.querySelector('.xvs-toast');
      state.counter = root.querySelector('.xvs-counter');
    }

    state.root = root;
    updateCounter();
    return root;
  }

  function setStatus(message, visible = true) {
    ensureRoot();
    state.root.style.display = 'block';
    state.status.textContent = message || '';
    state.status.style.display = visible ? 'flex' : 'none';
  }

  function showToast(message, ms = 1300) {
    ensureRoot();
    if (state.toastTimer) clearTimeout(state.toastTimer);

    state.toast.textContent = message;
    state.toast.classList.add('xvs-toast-visible');

    state.toastTimer = setTimeout(() => {
      state.toast?.classList.remove('xvs-toast-visible');
      state.toastTimer = null;
    }, ms);
  }

  function updateCounter() {
    if (!state.counter) return;

    const loaded = state.catalog.length;
    const current = state.currentIndex >= 0 ? state.currentIndex + 1 : 0;
    const ahead = state.currentIndex >= 0 ? Math.max(0, loaded - state.currentIndex - 1) : loaded;
    const activity = state.prefetching ? ' · fetching' : '';

    state.counter.textContent = `${current} / ${loaded} loaded · ${ahead} ahead${activity}`;
  }

  function removeRoot() {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = null;

    state.root?.remove();
    state.root = null;
    state.status = null;
    state.toast = null;
    state.counter = null;
  }

  function getTweetKey(tweet) {
    if (!tweet) return null;

    const links = Array.from(tweet.querySelectorAll('a[href*="/status/"]'));
    const link = links.find((item) => /\/status\/\d+/.test(item.getAttribute('href') || ''));
    return link?.getAttribute('href') || null;
  }

  function getTweetForVideo(video) {
    return video?.closest(TWEET_SELECTOR) || null;
  }

  function getPlayerForVideo(video) {
    return video?.closest(PLAYER_SELECTOR) || video?.parentElement || null;
  }

  function isUsableVideo(video) {
    if (!(video instanceof HTMLVideoElement) || !video.isConnected) return false;
    if (video.closest(`#${ROOT_ID}`)) return false;

    const tweet = getTweetForVideo(video);
    if (!tweet) return false;

    const rect = video.getBoundingClientRect();
    return rect.width >= 80 && rect.height >= 45;
  }

  function collectCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const video of document.querySelectorAll('video')) {
      if (!isUsableVideo(video)) continue;

      const tweet = getTweetForVideo(video);
      const player = getPlayerForVideo(video);
      const key = getTweetKey(tweet);
      if (!tweet || !player || !key || seen.has(key)) continue;

      seen.add(key);

      const rect = tweet.getBoundingClientRect();
      const absoluteY = window.scrollY + rect.top;

      candidates.push({
        tweet,
        player,
        video,
        key,
        rect,
        absoluteY
      });
    }

    return candidates.sort((a, b) => a.absoluteY - b.absoluteY);
  }

  function insertCatalogKey(key, beforeKey = null, afterKey = null) {
    if (!key || state.catalogSet.has(key)) return false;

    if (afterKey && state.catalogSet.has(afterKey)) {
      const index = state.catalog.indexOf(afterKey);
      state.catalog.splice(index + 1, 0, key);
    } else if (beforeKey && state.catalogSet.has(beforeKey)) {
      const index = state.catalog.indexOf(beforeKey);
      state.catalog.splice(Math.max(0, index), 0, key);
    } else {
      state.catalog.push(key);
    }

    state.catalogSet.add(key);
    return true;
  }

  function registerCandidates(candidates) {
    if (!candidates.length) return 0;

    let added = 0;

    for (const candidate of candidates) {
      state.positions.set(candidate.key, candidate.absoluteY);
    }

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      if (state.catalogSet.has(candidate.key)) continue;

      let afterKey = null;
      let beforeKey = null;

      for (let p = i - 1; p >= 0; p -= 1) {
        if (state.catalogSet.has(candidates[p].key)) {
          afterKey = candidates[p].key;
          break;
        }
      }

      if (!afterKey) {
        for (let n = i + 1; n < candidates.length; n += 1) {
          if (state.catalogSet.has(candidates[n].key)) {
            beforeKey = candidates[n].key;
            break;
          }
        }
      }

      if (insertCatalogKey(candidate.key, beforeKey, afterKey)) added += 1;
    }

    if (state.currentKey && state.catalogSet.has(state.currentKey)) {
      state.currentIndex = state.catalog.indexOf(state.currentKey);
    }

    updateCounter();
    return added;
  }

  function scanFeed() {
    const candidates = collectCandidates();
    registerCandidates(candidates);
    return candidates;
  }

  function findCandidateByKey(key) {
    if (!key) return null;
    return scanFeed().find((item) => item.key === key) || null;
  }

  function pickNearestCandidate() {
    const candidates = scanFeed();
    if (!candidates.length) return null;

    const center = window.innerHeight / 2;
    const visible = candidates.filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight);
    const pool = visible.length ? visible : candidates;

    return pool.reduce((best, item) => {
      const itemCenter = item.rect.top + item.rect.height / 2;
      const bestCenter = best.rect.top + best.rect.height / 2;
      return Math.abs(itemCenter - center) < Math.abs(bestCenter - center) ? item : best;
    });
  }

  function stopEndedListener() {
    if (state.currentVideo && state.endedHandler) {
      state.currentVideo.removeEventListener('ended', state.endedHandler);
    }
    state.endedHandler = null;
  }

  function releaseCurrentPlayer({ clearKey = false } = {}) {
    stopEndedListener();

    const portal = state.portal;
    const player = state.currentPlayer;

    if (player) player.classList.remove(ACTIVE_PLAYER_CLASS);

    if (portal && player) {
      const { marker, parent, nextSibling } = portal;
      let restored = false;

      if (marker?.isConnected && marker.parentNode) {
        marker.parentNode.insertBefore(player, marker);
        marker.remove();
        restored = true;
      } else if (parent?.isConnected) {
        const validSibling = nextSibling?.parentNode === parent ? nextSibling : null;
        parent.insertBefore(player, validSibling);
        restored = true;
      }

      if (!restored && player.isConnected) {
        player.remove();
      }

      portal.placeholder?.remove();
      if (marker?.isConnected) marker.remove();
    }

    state.portal = null;
    state.currentVideo = null;
    state.currentPlayer = null;

    if (clearKey) {
      state.currentKey = null;
      state.currentIndex = -1;
    }

    updateCounter();
  }

  function portalPlayer(candidate) {
    const { player, video } = candidate;
    if (!player?.isConnected || !video?.isConnected) return false;

    const parent = player.parentNode;
    if (!(parent instanceof Node)) return false;

    const nextSibling = player.nextSibling;
    const marker = document.createComment('x-video-slideshow-player-anchor');
    const rect = player.getBoundingClientRect();

    const placeholder = document.createElement('div');
    placeholder.className = 'xvs-firefox-placeholder';
    placeholder.style.width = `${Math.max(1, rect.width)}px`;
    placeholder.style.height = `${Math.max(1, rect.height)}px`;
    placeholder.style.maxWidth = '100%';

    parent.insertBefore(marker, player);
    parent.insertBefore(placeholder, player);

    ensureRoot();

    player.classList.add(ACTIVE_PLAYER_CLASS);
    state.root.appendChild(player);

    state.portal = { parent, nextSibling, marker, placeholder };
    state.currentPlayer = player;
    state.currentVideo = video;

    return true;
  }

  async function promoteCandidate(candidate, { index = null } = {}) {
    if (!state.active || !candidate?.key) return false;

    releaseCurrentPlayer({ clearKey: false });

    const key = candidate.key;
    const sourceTweet = candidate.tweet;

    if (sourceTweet?.isConnected) {
      sourceTweet.scrollIntoView({ block: 'center', behavior: 'auto' });
      await sleep(70);
    }

    if (!state.active) return false;

    const fresh = findCandidateByKey(key) || candidate;
    if (!fresh?.video?.isConnected || !fresh?.player?.isConnected) return false;

    if (!state.catalogSet.has(key)) {
      insertCatalogKey(key);
    }

    state.currentKey = key;
    state.currentIndex = Number.isInteger(index) ? index : state.catalog.indexOf(key);

    if (!portalPlayer(fresh)) return false;

    state.endedHandler = () => {
      if (state.active && !state.navigating) {
        void navigate(1, 'ended');
      }
    };
    state.currentVideo.addEventListener('ended', state.endedHandler, { once: true });

    setStatus('', false);
    updateCounter();

    try {
      await state.currentVideo.play();
    } catch {
      showToast('Autoplay was blocked. Use X’s play button once.');
    }

    return true;
  }

  async function locateCatalogKey(key, direction, token) {
    if (!key) return null;

    let candidate = findCandidateByKey(key);
    if (candidate) return candidate;

    const knownY = state.positions.get(key);
    if (Number.isFinite(knownY)) {
      window.scrollTo({
        top: Math.max(0, knownY - window.innerHeight * 0.42),
        behavior: 'auto'
      });
      await sleep(SEARCH_DELAY_MS);

      if (!state.active || token !== state.token) return null;

      candidate = findCandidateByKey(key);
      if (candidate) return candidate;
    }

    for (let i = 0; i < SEARCH_ATTEMPTS && state.active && token === state.token; i += 1) {
      window.scrollBy({
        top: direction * window.innerHeight * SCROLL_STEP,
        behavior: 'auto'
      });

      await sleep(SEARCH_DELAY_MS);
      candidate = findCandidateByKey(key);
      if (candidate) return candidate;
    }

    return null;
  }

  function aheadCount() {
    if (state.currentIndex < 0) return state.catalog.length;
    return Math.max(0, state.catalog.length - state.currentIndex - 1);
  }

  async function fetchAheadUntil(minAhead, token, maxScrolls = SEARCH_ATTEMPTS) {
    let previousLoaded = state.catalog.length;
    let stagnant = 0;

    for (
      let i = 0;
      i < maxScrolls &&
      state.active &&
      token === state.token &&
      aheadCount() < minAhead;
      i += 1
    ) {
      state.prefetching = true;
      updateCounter();

      window.scrollBy({
        top: window.innerHeight * PREFETCH_SCROLL_STEP,
        behavior: 'auto'
      });

      await sleep(PREFETCH_SCROLL_DELAY_MS);
      scanFeed();

      if (state.catalog.length === previousLoaded) {
        stagnant += 1;
      } else {
        stagnant = 0;
        previousLoaded = state.catalog.length;
      }

      if (stagnant >= 5) break;
    }

    state.prefetching = false;
    updateCounter();
  }

  async function prefetchLoop(generation) {
    while (state.active && generation === state.prefetchGeneration) {
      if (state.navigating) {
        await sleep(120);
        continue;
      }

      scanFeed();

      if (aheadCount() < PREFETCH_AHEAD_TARGET) {
        const token = state.token;
        await fetchAheadUntil(PREFETCH_AHEAD_TARGET, token, 3);
      } else {
        state.prefetching = false;
        updateCounter();
        await sleep(PREFETCH_IDLE_MS);
      }
    }

    state.prefetching = false;
    updateCounter();
  }

  function startPrefetch() {
    state.prefetchGeneration += 1;
    const generation = state.prefetchGeneration;
    void prefetchLoop(generation);
  }

  function stopPrefetch() {
    state.prefetchGeneration += 1;
    state.prefetching = false;
    updateCounter();
  }

  async function recoverCurrent(sourceKey, sourceIndex, token) {
    if (!sourceKey || !state.active || token !== state.token) return false;

    const candidate = await locateCatalogKey(sourceKey, 0, token);
    if (!candidate) return false;

    return promoteCandidate(candidate, { index: sourceIndex });
  }

  async function navigate(direction, source = 'input') {
    if (!state.active || state.navigating) return;

    state.navigating = true;
    const token = ++state.token;
    const sourceKey = state.currentKey;
    const sourceIndex = state.currentIndex;

    try {
      releaseCurrentPlayer({ clearKey: false });
      await sleep(35);

      if (!state.active || token !== state.token) return;

      if (direction > 0 && sourceIndex >= state.catalog.length - 1) {
        setStatus('Loading more X videos…', true);
        await fetchAheadUntil(1, token, SEARCH_ATTEMPTS);
      }

      const targetIndex = sourceIndex + direction;

      if (targetIndex < 0) {
        await recoverCurrent(sourceKey, sourceIndex, token);
        showToast('No previous loaded video.');
        return;
      }

      if (targetIndex >= state.catalog.length) {
        await recoverCurrent(sourceKey, sourceIndex, token);
        showToast('No more videos loaded yet.');
        return;
      }

      const targetKey = state.catalog[targetIndex];
      setStatus(direction > 0 ? 'Opening next video…' : 'Opening previous video…', true);

      const candidate = await locateCatalogKey(targetKey, direction, token);

      if (!candidate || token !== state.token || !state.active) {
        await recoverCurrent(sourceKey, sourceIndex, token);
        showToast('That video is no longer in X’s loaded timeline.');
        return;
      }

      const promoted = await promoteCandidate(candidate, { index: targetIndex });

      if (!promoted) {
        await recoverCurrent(sourceKey, sourceIndex, token);
        showToast('X replaced that video while navigating.');
        return;
      }

      if (source === 'wheel') {
        showToast(direction > 0 ? 'Next video' : 'Previous video', 650);
      }
    } finally {
      state.navigating = false;
      updateCounter();
    }
  }

  function isTypingTarget(target) {
    return target instanceof HTMLElement && (
      target.matches('input, textarea, select') ||
      target.isContentEditable ||
      Boolean(target.closest('[contenteditable="true"]'))
    );
  }

  function onKeyDown(event) {
    if (!state.active || event.defaultPrevented || isTypingTarget(event.target)) return;

    const key = event.key.toLowerCase();

    if (
      event.key === 'ArrowRight' ||
      event.key === 'ArrowDown' ||
      key === 'j' ||
      event.key === 'PageDown'
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void navigate(1, 'key');
      return;
    }

    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowUp' ||
      key === 'k' ||
      event.key === 'PageUp'
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void navigate(-1, 'key');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      deactivate();
    }
  }

  function normalizeWheelDelta(event) {
    let delta = event.deltaY;

    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 18;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= window.innerHeight;

    return delta;
  }

  function onWheel(event) {
    if (!state.active) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const now = performance.now();
    if (now < state.wheelCooldownUntil || state.navigating) return;

    state.wheelAccumulator += normalizeWheelDelta(event);

    if (Math.abs(state.wheelAccumulator) < WHEEL_THRESHOLD) return;

    const direction = state.wheelAccumulator > 0 ? 1 : -1;
    state.wheelAccumulator = 0;
    state.wheelCooldownUntil = now + WHEEL_COOLDOWN_MS;

    void navigate(direction, 'wheel');
  }

  async function findInitialCandidate(token) {
    let candidate = pickNearestCandidate();
    if (candidate) return candidate;

    let previousLoaded = state.catalog.length;
    let stagnant = 0;

    for (let i = 0; i < SEARCH_ATTEMPTS && state.active && token === state.token; i += 1) {
      setStatus(`Looking for an X video… ${state.catalog.length} loaded`, true);

      window.scrollBy({
        top: window.innerHeight * SCROLL_STEP,
        behavior: 'auto'
      });

      await sleep(SEARCH_DELAY_MS);
      candidate = pickNearestCandidate();

      if (candidate) return candidate;

      if (state.catalog.length === previousLoaded) stagnant += 1;
      else {
        previousLoaded = state.catalog.length;
        stagnant = 0;
      }

      if (stagnant >= 7) break;
    }

    return null;
  }

  async function activate() {
    if (state.active) return true;

    state.active = true;
    state.navigating = false;
    state.token += 1;

    state.currentKey = null;
    state.currentIndex = -1;
    state.catalog = [];
    state.catalogSet = new Set();
    state.positions = new Map();

    state.wheelAccumulator = 0;
    state.wheelCooldownUntil = 0;

    ensureRoot();
    setStatus('Starting X Video Slideshow…', true);

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });

    const token = state.token;
    const candidate = await findInitialCandidate(token);

    if (!candidate || token !== state.token || !state.active) {
      if (state.active) {
        setStatus('No X video found. Open a feed, profile, search, or Media tab containing videos, then try again.', true);
      }
      return true;
    }

    if (!state.catalogSet.has(candidate.key)) {
      insertCatalogKey(candidate.key);
    }

    const initialIndex = state.catalog.indexOf(candidate.key);
    const promoted = await promoteCandidate(candidate, { index: initialIndex });

    if (!promoted && state.active) {
      setStatus('Found a video, but X replaced its player before it could be opened. Try again.', true);
      return true;
    }

    startPrefetch();
    return true;
  }

  function deactivate() {
    if (!state.active) return false;

    state.active = false;
    state.navigating = false;
    state.token += 1;

    stopPrefetch();
    releaseCurrentPlayer({ clearKey: true });

    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('wheel', onWheel, true);

    removeRoot();
    return false;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'XVS_PING') {
      return Promise.resolve({
        loaded: true,
        active: state.active,
        videosLoaded: state.catalog.length,
        current: state.currentIndex + 1
      });
    }

    if (message?.type !== 'XVS_TOGGLE') return undefined;

    if (state.active) {
      return Promise.resolve({ active: deactivate() });
    }

    void activate();
    return Promise.resolve({ active: true });
  });
})();