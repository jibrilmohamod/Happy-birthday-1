(() => {
  "use strict";

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const PLAYER_SELECTOR = '[data-testid="videoPlayer"]';
  const ROOT_ID = 'xvs-firefox-root';
  const STYLE_ID = 'xvs-firefox-style';
  const ACTIVE_PLAYER_CLASS = 'xvs-firefox-portal-player';
  const SEARCH_ATTEMPTS = 20;
  const SEARCH_DELAY_MS = 300;
  const SCROLL_STEP = 0.86;

  const state = {
    active: false,
    navigating: false,
    token: 0,
    currentKey: null,
    currentVideo: null,
    currentPlayer: null,
    endedHandler: null,
    portal: null,
    history: [],
    historyIndex: -1,
    root: null,
    status: null,
    toast: null,
    toastTimer: null
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

      #${ROOT_ID} .xvs-toast {
        position: absolute !important;
        top: 20px !important;
        left: 50% !important;
        z-index: 2147483647 !important;
        transform: translateX(-50%) !important;
        max-width: min(680px, calc(100vw - 40px)) !important;
        box-sizing: border-box !important;
        padding: 10px 14px !important;
        border-radius: 999px !important;
        background: rgba(32, 35, 39, 0.92) !important;
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

      document.documentElement.appendChild(root);
      state.status = status;
      state.toast = toast;
    } else {
      state.status = root.querySelector('.xvs-status');
      state.toast = root.querySelector('.xvs-toast');
    }

    state.root = root;
    return root;
  }

  function setStatus(message, visible = true) {
    ensureRoot();
    state.root.style.display = 'block';
    state.status.textContent = message || '';
    state.status.style.display = visible ? 'flex' : 'none';
  }

  function showToast(message, ms = 1400) {
    ensureRoot();
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toast.textContent = message;
    state.toast.classList.add('xvs-toast-visible');
    state.toastTimer = setTimeout(() => {
      state.toast?.classList.remove('xvs-toast-visible');
      state.toastTimer = null;
    }, ms);
  }

  function removeRoot() {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    state.toastTimer = null;
    state.root?.remove();
    state.root = null;
    state.status = null;
    state.toast = null;
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
      candidates.push({ tweet, player, video, key, rect });
    }

    return candidates.sort((a, b) => a.rect.top - b.rect.top);
  }

  function findCandidateByKey(key) {
    if (!key) return null;
    return collectCandidates().find((item) => item.key === key) || null;
  }

  function pickNearestCandidate() {
    const candidates = collectCandidates();
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

  function restoreCurrentPlayer({ clearKey = false } = {}) {
    stopEndedListener();

    const portal = state.portal;
    const player = state.currentPlayer;

    if (player) {
      player.classList.remove(ACTIVE_PLAYER_CLASS);
    }

    if (portal && player) {
      const { marker, parent, nextSibling } = portal;

      if (marker?.isConnected && marker.parentNode) {
        marker.parentNode.insertBefore(player, marker);
        marker.remove();
      } else if (parent?.isConnected) {
        const validSibling = nextSibling?.parentNode === parent ? nextSibling : null;
        parent.insertBefore(player, validSibling);
      }

      portal.placeholder?.remove();
    }

    state.portal = null;
    state.currentVideo = null;
    state.currentPlayer = null;

    if (clearKey) state.currentKey = null;
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

  async function promoteCandidate(candidate, { record = true } = {}) {
    if (!state.active || !candidate?.key) return false;

    restoreCurrentPlayer({ clearKey: false });

    const key = candidate.key;
    const sourceTweet = candidate.tweet;
    if (sourceTweet?.isConnected) {
      sourceTweet.scrollIntoView({ block: 'center', behavior: 'auto' });
      await sleep(80);
    }

    if (!state.active) return false;

    const fresh = findCandidateByKey(key) || candidate;
    if (!fresh?.video?.isConnected || !fresh?.player?.isConnected) return false;

    state.currentKey = key;

    if (!portalPlayer(fresh)) return false;

    if (record && state.history[state.historyIndex] !== key) {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(key);
      state.historyIndex = state.history.length - 1;
    }

    state.endedHandler = () => {
      if (state.active && !state.navigating) void move(1);
    };
    state.currentVideo.addEventListener('ended', state.endedHandler, { once: true });

    setStatus('', false);

    try {
      await state.currentVideo.play();
    } catch {
      showToast('Autoplay was blocked. Use X’s play button once.');
    }

    return true;
  }

  function candidateRelativeToKey(key, direction) {
    const candidates = collectCandidates();
    if (!candidates.length) return null;

    const current = candidates.find((item) => item.key === key);
    const currentTop = current?.rect.top ?? window.innerHeight / 2;

    if (direction > 0) {
      return candidates.find((item) =>
        item.key !== key &&
        item.rect.top > currentTop + 4 &&
        !state.history.includes(item.key)
      ) || null;
    }

    return [...candidates].reverse().find((item) =>
      item.key !== key && item.rect.top < currentTop - 4
    ) || null;
  }

  async function locateHistoryKey(key, direction, token) {
    for (let i = 0; i < SEARCH_ATTEMPTS && state.active && token === state.token; i += 1) {
      const found = findCandidateByKey(key);
      if (found) return found;

      window.scrollBy({
        top: direction * window.innerHeight * SCROLL_STEP,
        behavior: 'auto'
      });
      await sleep(SEARCH_DELAY_MS);
    }

    return findCandidateByKey(key);
  }

  async function discoverFromKey(sourceKey, direction, token) {
    for (let i = 0; i < SEARCH_ATTEMPTS && state.active && token === state.token; i += 1) {
      const candidate = candidateRelativeToKey(sourceKey, direction);
      if (candidate) return candidate;

      setStatus(direction > 0 ? 'Finding the next X video…' : 'Finding the previous X video…', true);
      window.scrollBy({
        top: direction * window.innerHeight * SCROLL_STEP,
        behavior: 'auto'
      });
      await sleep(SEARCH_DELAY_MS);
    }

    return candidateRelativeToKey(sourceKey, direction);
  }

  async function recoverCurrent(sourceKey) {
    if (!sourceKey || !state.active) return false;
    const candidate = findCandidateByKey(sourceKey);
    if (!candidate) return false;
    return promoteCandidate(candidate, { record: false });
  }

  async function move(direction) {
    if (!state.active || state.navigating) return;

    state.navigating = true;
    const token = ++state.token;
    const sourceKey = state.currentKey;

    try {
      restoreCurrentPlayer({ clearKey: false });
      await sleep(40);

      if (!state.active || token !== state.token) return;

      let candidate = null;
      let targetIndex = state.historyIndex;
      let shouldRecord = false;

      if (direction < 0 && state.historyIndex > 0) {
        targetIndex = state.historyIndex - 1;
        candidate = await locateHistoryKey(state.history[targetIndex], -1, token);
      } else if (direction > 0 && state.historyIndex < state.history.length - 1) {
        targetIndex = state.historyIndex + 1;
        candidate = await locateHistoryKey(state.history[targetIndex], 1, token);
      } else {
        candidate = await discoverFromKey(sourceKey, direction, token);
        shouldRecord = direction > 0;
      }

      if (!candidate || token !== state.token || !state.active) {
        await recoverCurrent(sourceKey);
        showToast(direction > 0 ? 'No more videos found.' : 'No previous video found.');
        return;
      }

      if (direction < 0 && state.historyIndex <= 0 && !state.history.includes(candidate.key)) {
        state.history.unshift(candidate.key);
        targetIndex = 0;
      }

      if (!shouldRecord && state.history.includes(candidate.key)) {
        targetIndex = state.history.indexOf(candidate.key);
      }

      const promoted = await promoteCandidate(candidate, { record: shouldRecord });
      if (!promoted) {
        await recoverCurrent(sourceKey);
        showToast('That X video disappeared while navigating.');
        return;
      }

      if (!shouldRecord) state.historyIndex = targetIndex;
    } finally {
      state.navigating = false;
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

    if (event.key === 'ArrowRight' || key === 'j') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void move(1);
      return;
    }

    if (event.key === 'ArrowLeft' || key === 'k') {
      event.preventDefault();
      event.stopImmediatePropagation();
      void move(-1);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      deactivate();
    }
  }

  async function findInitialCandidate(token) {
    let candidate = pickNearestCandidate();
    if (candidate) return candidate;

    for (let i = 0; i < SEARCH_ATTEMPTS && state.active && token === state.token; i += 1) {
      setStatus('Looking for an X video…', true);
      window.scrollBy({ top: window.innerHeight * SCROLL_STEP, behavior: 'auto' });
      await sleep(SEARCH_DELAY_MS);
      candidate = pickNearestCandidate();
      if (candidate) return candidate;
    }

    return null;
  }

  async function activate() {
    if (state.active) return true;

    state.active = true;
    state.navigating = false;
    state.token += 1;
    state.history = [];
    state.historyIndex = -1;
    state.currentKey = null;

    ensureRoot();
    setStatus('Starting X Video Slideshow…', true);
    document.addEventListener('keydown', onKeyDown, true);

    const token = state.token;
    const candidate = await findInitialCandidate(token);

    if (!candidate || token !== state.token || !state.active) {
      if (state.active) {
        setStatus('No X video found. Open a feed, profile, search, or Media tab containing a video, then try again.', true);
      }
      return true;
    }

    const promoted = await promoteCandidate(candidate);
    if (!promoted && state.active) {
      setStatus('Found a video, but X replaced its player before it could be opened. Try clicking the extension again.', true);
    }

    return true;
  }

  function deactivate() {
    if (!state.active) return false;

    state.active = false;
    state.navigating = false;
    state.token += 1;
    restoreCurrentPlayer({ clearKey: true });
    document.removeEventListener('keydown', onKeyDown, true);
    removeRoot();
    return false;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'XVS_PING') {
      return Promise.resolve({ loaded: true, active: state.active });
    }

    if (message?.type !== 'XVS_TOGGLE') return undefined;

    if (state.active) {
      return Promise.resolve({ active: deactivate() });
    }

    void activate();
    return Promise.resolve({ active: true });
  });
})();
