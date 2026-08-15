(() => {
  "use strict";

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const PLAYER_SELECTOR = '[data-testid="videoPlayer"]';
  const ACTIVE_PLAYER_CLASS = 'xvs-firefox-fullscreen-player';
  const ACTIVE_VIDEO_CLASS = 'xvs-firefox-fullscreen-video';
  const ACTIVE_TWEET_CLASS = 'xvs-firefox-active-tweet';
  const ROOT_ID = 'xvs-firefox-root';
  const STYLE_ID = 'xvs-firefox-style';
  const SEARCH_ATTEMPTS = 18;
  const SEARCH_DELAY_MS = 350;
  const SCROLL_STEP = 0.9;

  const state = {
    active: false,
    currentTweet: null,
    currentPlayer: null,
    currentVideo: null,
    currentKey: null,
    history: [],
    historyIndex: -1,
    token: 0,
    endedHandler: null,
    root: null,
    status: null
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
        z-index: 2147483645 !important;
        pointer-events: none !important;
        background: rgba(0, 0, 0, 0.96) !important;
      }

      #${ROOT_ID} .xvs-status {
        position: absolute !important;
        inset: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 32px !important;
        box-sizing: border-box !important;
        color: #fff !important;
        background: transparent !important;
        font: 600 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        text-align: center !important;
        pointer-events: none !important;
      }

      .${ACTIVE_PLAYER_CLASS} {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
        min-width: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        transform: none !important;
        z-index: 2147483646 !important;
        background: #000 !important;
        overflow: visible !important;
        pointer-events: auto !important;
      }

      .${ACTIVE_PLAYER_CLASS} video,
      video.${ACTIVE_VIDEO_CLASS} {
        position: absolute !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        object-fit: contain !important;
        margin: 0 !important;
        transform: none !important;
        background: #000 !important;
      }

      .${ACTIVE_TWEET_CLASS} {
        isolation: isolate !important;
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
      document.documentElement.appendChild(root);
      state.status = status;
    } else {
      state.status = root.querySelector('.xvs-status');
    }
    state.root = root;
    return root;
  }

  function setStatus(message, visible = true) {
    ensureRoot();
    if (state.root) state.root.style.display = visible ? 'block' : 'none';
    if (state.status) {
      state.status.textContent = message || '';
      state.status.style.display = visible ? 'flex' : 'none';
    }
  }

  function removeRoot() {
    state.root?.remove();
    state.root = null;
    state.status = null;
  }

  function getTweetKey(tweet) {
    if (!tweet) return null;
    const links = Array.from(tweet.querySelectorAll('a[href*="/status/"]'));
    const statusLink = links.find((link) => /\/status\/\d+/.test(link.getAttribute('href') || ''));
    return statusLink?.getAttribute('href') || null;
  }

  function getPlayerForVideo(video) {
    if (!video) return null;
    return video.closest(PLAYER_SELECTOR) || video.parentElement || null;
  }

  function getTweetForVideo(video) {
    return video?.closest(TWEET_SELECTOR) || null;
  }

  function isUsableVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (!video.isConnected) return false;

    const rect = video.getBoundingClientRect();
    const hasGeometry = rect.width >= 80 && rect.height >= 45;
    const tweet = getTweetForVideo(video);
    return Boolean(tweet && hasGeometry);
  }

  function collectCandidates() {
    const seen = new Set();
    const candidates = [];

    for (const video of document.querySelectorAll('video')) {
      if (!isUsableVideo(video)) continue;
      const tweet = getTweetForVideo(video);
      const key = getTweetKey(tweet);
      if (!tweet || !key || seen.has(key)) continue;
      seen.add(key);
      const rect = tweet.getBoundingClientRect();
      candidates.push({ tweet, video, player: getPlayerForVideo(video), key, rect });
    }

    return candidates.sort((a, b) => a.rect.top - b.rect.top);
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

  function findCandidateByKey(key) {
    if (!key) return null;
    return collectCandidates().find((item) => item.key === key) || null;
  }

  function cleanupCurrentPlayer() {
    if (state.currentVideo && state.endedHandler) {
      state.currentVideo.removeEventListener('ended', state.endedHandler);
    }

    state.currentTweet?.classList.remove(ACTIVE_TWEET_CLASS);
    state.currentPlayer?.classList.remove(ACTIVE_PLAYER_CLASS);
    state.currentVideo?.classList.remove(ACTIVE_VIDEO_CLASS);

    state.currentTweet = null;
    state.currentPlayer = null;
    state.currentVideo = null;
    state.endedHandler = null;
    state.currentKey = null;
  }

  async function promoteCandidate(candidate, { record = true } = {}) {
    if (!state.active || !candidate?.video?.isConnected) return false;

    cleanupCurrentPlayer();
    ensureRoot();

    const { tweet, video, player, key } = candidate;
    tweet.scrollIntoView({ block: 'center', behavior: 'auto' });
    await sleep(60);
    if (!state.active || !video.isConnected) return false;

    state.currentTweet = tweet;
    state.currentVideo = video;
    state.currentPlayer = player || video;
    state.currentKey = key;

    tweet.classList.add(ACTIVE_TWEET_CLASS);
    state.currentPlayer.classList.add(ACTIVE_PLAYER_CLASS);
    video.classList.add(ACTIVE_VIDEO_CLASS);

    if (record && state.history[state.historyIndex] !== key) {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(key);
      state.historyIndex = state.history.length - 1;
    }

    state.endedHandler = () => {
      if (state.active) void move(1);
    };
    video.addEventListener('ended', state.endedHandler, { once: true });

    setStatus('', false);

    try {
      await video.play();
    } catch {
      // If autoplay is blocked, X's existing play button remains available.
    }

    return true;
  }

  function candidateRelativeToCurrent(direction) {
    const candidates = collectCandidates();
    if (!candidates.length) return null;

    const current = candidates.find((item) => item.key === state.currentKey);
    const currentTop = current?.rect.top ?? window.innerHeight / 2;

    if (direction > 0) {
      return candidates.find((item) => item.key !== state.currentKey && item.rect.top > currentTop + 4 && !state.history.includes(item.key)) || null;
    }

    return [...candidates].reverse().find((item) => item.key !== state.currentKey && item.rect.top < currentTop - 4) || null;
  }

  async function locateHistoryKey(key, direction, token) {
    for (let i = 0; i < SEARCH_ATTEMPTS && state.active && token === state.token; i += 1) {
      const found = findCandidateByKey(key);
      if (found) return found;
      window.scrollBy({ top: direction * window.innerHeight * SCROLL_STEP, behavior: 'auto' });
      await sleep(SEARCH_DELAY_MS);
    }
    return findCandidateByKey(key);
  }

  async function discover(direction, token) {
    for (let i = 0; i < SEARCH_ATTEMPTS && state.active && token === state.token; i += 1) {
      const candidate = candidateRelativeToCurrent(direction);
      if (candidate) return candidate;

      setStatus(direction > 0 ? 'Finding the next X video…' : 'Finding the previous X video…', true);
      window.scrollBy({ top: direction * window.innerHeight * SCROLL_STEP, behavior: 'auto' });
      await sleep(SEARCH_DELAY_MS);
    }
    return candidateRelativeToCurrent(direction);
  }

  async function move(direction) {
    if (!state.active) return;
    const token = ++state.token;

    const previousKey = state.currentKey;
    cleanupCurrentPlayer();

    if (direction < 0 && state.historyIndex > 0) {
      const targetIndex = state.historyIndex - 1;
      const targetKey = state.history[targetIndex];
      const candidate = await locateHistoryKey(targetKey, -1, token);
      if (!candidate || token !== state.token) {
        setStatus('Could not reload the previous X video.', true);
        return;
      }
      state.historyIndex = targetIndex;
      await promoteCandidate(candidate, { record: false });
      return;
    }

    if (direction > 0 && state.historyIndex < state.history.length - 1) {
      const targetIndex = state.historyIndex + 1;
      const targetKey = state.history[targetIndex];
      const candidate = await locateHistoryKey(targetKey, 1, token);
      if (!candidate || token !== state.token) {
        setStatus('Could not reload the next X video.', true);
        return;
      }
      state.historyIndex = targetIndex;
      await promoteCandidate(candidate, { record: false });
      return;
    }

    if (previousKey) state.currentKey = previousKey;
    const candidate = await discover(direction, token);
    if (!candidate || token !== state.token) {
      setStatus('No more X videos found on this page.', true);
      return;
    }

    if (direction < 0 && !state.history.includes(candidate.key)) {
      state.history.unshift(candidate.key);
      state.historyIndex = 0;
      await promoteCandidate(candidate, { record: false });
      return;
    }

    await promoteCandidate(candidate, { record: direction > 0 });
  }

  function onKeyDown(event) {
    if (!state.active || event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;

    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'j') {
      event.preventDefault();
      event.stopPropagation();
      void move(1);
      return;
    }

    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      event.stopPropagation();
      void move(-1);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
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
    state.token += 1;
    state.history = [];
    state.historyIndex = -1;
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

    await promoteCandidate(candidate);
    return true;
  }

  function deactivate() {
    if (!state.active) return false;

    state.active = false;
    state.token += 1;
    cleanupCurrentPlayer();
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
