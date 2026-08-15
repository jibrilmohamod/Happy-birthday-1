(() => {
  "use strict";

  if (window.__xvsCaptureWrapper) return;
  window.__xvsCaptureWrapper = true;

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const ROOT_ID = 'xvs-capture-root';
  const SCROLL_STEP = 0.78;
  const SEARCH_DELAY = 320;
  const SEARCH_LIMIT = 18;
  const WHEEL_THRESHOLD = 72;
  const WHEEL_COOLDOWN = 420;

  const state = {
    active: false,
    navigating: false,
    token: 0,
    root: null,
    display: null,
    status: null,
    badge: null,
    gate: null,
    playButton: null,
    muteButton: null,
    seek: null,
    time: null,
    volume: null,
    current: null,
    stream: null,
    catalog: [],
    seen: new Set(),
    index: -1,
    outputMuted: false,
    outputVolume: 1,
    wheelDelta: 0,
    wheelUntil: 0,
    observer: null,
    scanTimer: null,
    startY: 0
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const css = (node, styles) => Object.assign(node.style, styles);

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const secs = String(total % 60).padStart(2, '0');
    return `${minutes}:${secs}`;
  }

  function getTweetKey(tweet) {
    if (!tweet) return null;
    const links = Array.from(tweet.querySelectorAll('a[href*="/status/"]'));
    return links.find((link) => /\/status\/\d+/.test(link.getAttribute('href') || ''))?.getAttribute('href') || null;
  }

  function candidateFromTweet(tweet) {
    const key = getTweetKey(tweet);
    const video = tweet?.querySelector('video');
    if (!key || !(video instanceof HTMLVideoElement)) return null;
    const rect = tweet.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 45) return null;
    return { key, tweet, video, rect };
  }

  function renderedCandidates() {
    const result = [];
    const keys = new Set();
    for (const tweet of document.querySelectorAll(TWEET_SELECTOR)) {
      const candidate = candidateFromTweet(tweet);
      if (!candidate || keys.has(candidate.key)) continue;
      keys.add(candidate.key);
      result.push(candidate);
    }
    return result.sort((a, b) => a.rect.top - b.rect.top);
  }

  function ingestRendered() {
    let changed = false;
    for (const candidate of renderedCandidates()) {
      if (state.seen.has(candidate.key)) continue;
      state.seen.add(candidate.key);
      state.catalog.push(candidate.key);
      changed = true;
    }
    if (changed) updateBadge();
  }

  function findCandidate(key) {
    if (!key) return null;
    for (const tweet of document.querySelectorAll(TWEET_SELECTOR)) {
      if (getTweetKey(tweet) !== key) continue;
      return candidateFromTweet(tweet);
    }
    return null;
  }

  function nearestCandidate() {
    const candidates = renderedCandidates();
    for (const candidate of candidates) {
      if (!state.seen.has(candidate.key)) {
        state.seen.add(candidate.key);
        state.catalog.push(candidate.key);
      }
    }
    updateBadge();
    if (!candidates.length) return null;
    const center = innerHeight / 2;
    const visible = candidates.filter(({ rect }) => rect.bottom > 0 && rect.top < innerHeight);
    const pool = visible.length ? visible : candidates;
    return pool.reduce((best, candidate) => {
      const a = best.rect.top + best.rect.height / 2;
      const b = candidate.rect.top + candidate.rect.height / 2;
      return Math.abs(b - center) < Math.abs(a - center) ? candidate : best;
    });
  }

  function makeButton(label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    css(button, {
      border: '0',
      borderRadius: '999px',
      background: 'rgba(255,255,255,.14)',
      color: '#fff',
      minWidth: '42px',
      height: '36px',
      padding: '0 12px',
      font: '700 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      cursor: 'pointer'
    });
    return button;
  }

  function ensureRoot() {
    if (state.root?.isConnected) return state.root;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    css(root, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh',
      zIndex: '2147483646', background: '#000', color: '#fff', overflow: 'hidden',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif'
    });

    const display = document.createElement('video');
    display.autoplay = true;
    display.playsInline = true;
    display.controls = false;
    display.muted = false;
    display.volume = 1;
    css(display, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      objectFit: 'contain', background: '#000'
    });
    root.appendChild(display);

    const status = document.createElement('div');
    css(status, {
      position: 'absolute', inset: '0', display: 'none', alignItems: 'center',
      justifyContent: 'center', zIndex: '4', background: '#000', textAlign: 'center',
      fontWeight: '750', padding: '32px', boxSizing: 'border-box', pointerEvents: 'none'
    });
    root.appendChild(status);

    const badge = document.createElement('div');
    css(badge, {
      position: 'absolute', top: '18px', right: '18px', zIndex: '6',
      padding: '8px 11px', borderRadius: '999px', background: 'rgba(32,35,39,.86)',
      fontSize: '13px', fontWeight: '750', pointerEvents: 'none'
    });
    root.appendChild(badge);

    const gate = document.createElement('button');
    gate.type = 'button';
    gate.textContent = 'Play with sound';
    css(gate, {
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
      zIndex: '8', display: 'none', padding: '13px 18px', border: '0', borderRadius: '999px',
      background: '#1d9bf0', color: '#fff', fontSize: '15px', fontWeight: '800', cursor: 'pointer'
    });
    gate.addEventListener('click', async (event) => {
      if (!event.isTrusted) return;
      state.outputMuted = false;
      display.muted = false;
      state.muteButton.textContent = 'Sound on';
      try {
        await display.play();
        gate.style.display = 'none';
      } catch {
        gate.textContent = 'Firefox is blocking audio playback';
      }
    }, true);
    root.appendChild(gate);

    const controls = document.createElement('div');
    css(controls, {
      position: 'absolute', left: '18px', right: '18px', bottom: '18px', zIndex: '7',
      display: 'grid', gridTemplateColumns: 'auto auto 1fr auto minmax(90px,140px)',
      alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '16px',
      background: 'rgba(15,20,25,.82)', backdropFilter: 'blur(10px)'
    });

    const playButton = makeButton('Pause');
    playButton.addEventListener('click', async () => {
      const source = state.current?.video;
      if (!source) return;
      if (source.paused) {
        try { await source.play(); } catch {}
        try { await display.play(); } catch {}
      } else {
        source.pause();
      }
      syncControls();
    });
    controls.appendChild(playButton);

    const muteButton = makeButton('Sound on');
    muteButton.addEventListener('click', () => {
      state.outputMuted = !state.outputMuted;
      display.muted = state.outputMuted;
      muteButton.textContent = state.outputMuted ? 'Muted' : 'Sound on';
    });
    controls.appendChild(muteButton);

    const seek = document.createElement('input');
    seek.type = 'range';
    seek.min = '0';
    seek.max = '1000';
    seek.value = '0';
    seek.step = '1';
    seek.addEventListener('input', () => {
      const source = state.current?.video;
      if (!source || !Number.isFinite(source.duration) || source.duration <= 0) return;
      source.currentTime = (Number(seek.value) / 1000) * source.duration;
    });
    controls.appendChild(seek);

    const time = document.createElement('div');
    time.textContent = '0:00 / 0:00';
    css(time, {fontSize: '12px', fontWeight: '650', whiteSpace: 'nowrap'});
    controls.appendChild(time);

    const volume = document.createElement('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '1';
    volume.step = '0.05';
    volume.value = '1';
    volume.addEventListener('input', () => {
      state.outputVolume = Number(volume.value);
      display.volume = state.outputVolume;
      if (state.outputVolume > 0 && state.outputMuted) {
        state.outputMuted = false;
        display.muted = false;
        muteButton.textContent = 'Sound on';
      }
    });
    controls.appendChild(volume);

    root.appendChild(controls);
    document.documentElement.appendChild(root);

    Object.assign(state, { root, display, status, badge, gate, playButton, muteButton, seek, time, volume });
    updateBadge();
    return root;
  }

  function updateBadge() {
    if (!state.badge) return;
    const current = state.index >= 0 ? state.index + 1 : 0;
    state.badge.textContent = `${current}/${state.catalog.length} loaded`;
  }

  function setStatus(message, visible = true) {
    ensureRoot();
    state.status.textContent = message || '';
    state.status.style.display = visible ? 'flex' : 'none';
  }

  function syncControls() {
    const source = state.current?.video;
    if (!source || !state.playButton) return;
    state.playButton.textContent = source.paused ? 'Play' : 'Pause';
    state.muteButton.textContent = state.outputMuted ? 'Muted' : 'Sound on';
    state.volume.value = String(state.outputVolume);
    if (Number.isFinite(source.duration) && source.duration > 0) {
      state.seek.value = String(Math.max(0, Math.min(1000, Math.round((source.currentTime / source.duration) * 1000))));
      state.time.textContent = `${formatTime(source.currentTime)} / ${formatTime(source.duration)}`;
    } else {
      state.seek.value = '0';
      state.time.textContent = `${formatTime(source.currentTime)} / 0:00`;
    }
  }

  function captureFrom(video) {
    if (typeof video.captureStream === 'function') return video.captureStream();
    if (typeof video.mozCaptureStream === 'function') return video.mozCaptureStream();
    throw new Error('Firefox does not expose captureStream for this video element.');
  }

  function saveSource(video) {
    return {
      muted: video.muted,
      volume: video.volume,
      autoplay: video.autoplay,
      controls: video.controls,
      preload: video.preload,
      playsInline: video.playsInline
    };
  }

  function restoreSource() {
    const current = state.current;
    if (!current) return;
    const video = current.video;
    for (const [name, listener] of current.listeners) video.removeEventListener(name, listener);
    const original = current.original;
    video.muted = original.muted;
    video.volume = original.volume;
    video.autoplay = original.autoplay;
    video.controls = original.controls;
    video.preload = original.preload;
    video.playsInline = original.playsInline;
    state.current = null;
  }

  function clearStream() {
    if (state.stream) {
      for (const track of state.stream.getTracks()) {
        try { track.stop(); } catch {}
      }
    }
    state.stream = null;
    if (state.display) state.display.srcObject = null;
  }

  async function attachCandidate(candidate, index) {
    if (!candidate?.video?.isConnected || !state.active) return false;

    clearStream();
    restoreSource();

    const video = candidate.video;
    const original = saveSource(video);
    const listeners = [];
    const on = (name, listener) => {
      video.addEventListener(name, listener);
      listeners.push([name, listener]);
    };

    state.current = { key: candidate.key, video, tweet: candidate.tweet, original, listeners };
    state.index = index;

    video.muted = true;
    video.volume = original.volume;
    video.autoplay = true;
    video.controls = original.controls;
    video.preload = 'auto';
    video.playsInline = true;

    on('ended', () => {
      if (state.active && !state.navigating) void move(1, 'ended');
    });
    on('timeupdate', syncControls);
    on('durationchange', syncControls);
    on('play', syncControls);
    on('pause', syncControls);

    try {
      await video.play();
    } catch (error) {
      console.debug('XVS source playback blocked', error);
      return false;
    }

    let stream;
    try {
      stream = captureFrom(video);
    } catch (error) {
      console.error('XVS captureStream unavailable', error);
      return false;
    }

    state.stream = stream;
    ensureRoot();
    state.display.srcObject = stream;
    state.display.muted = state.outputMuted;
    state.display.volume = state.outputVolume;
    state.gate.style.display = 'none';
    setStatus('', false);
    updateBadge();
    syncControls();

    try {
      await state.display.play();
    } catch (error) {
      console.debug('XVS display audible playback blocked', error);
      state.gate.textContent = 'Play with sound';
      state.gate.style.display = 'block';
    }

    return true;
  }

  function scanSoon() {
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      ingestRendered();
    }, 120);
  }

  function startObserver() {
    state.observer = new MutationObserver(scanSoon);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    state.observer?.disconnect();
    state.observer = null;
    if (state.scanTimer) clearTimeout(state.scanTimer);
    state.scanTimer = null;
  }

  async function locateKey(key, direction, token) {
    let candidate = findCandidate(key);
    if (candidate) return candidate;

    for (let i = 0; i < SEARCH_LIMIT && state.active && token === state.token; i += 1) {
      window.scrollBy({ top: direction * innerHeight * SCROLL_STEP, behavior: 'auto' });
      await sleep(SEARCH_DELAY);
      if (!state.active || token !== state.token) return null;
      ingestRendered();
      candidate = findCandidate(key);
      if (candidate) return candidate;
    }
    return null;
  }

  async function discoverNew(direction, token) {
    const before = new Set(state.catalog);
    for (let i = 0; i < SEARCH_LIMIT && state.active && token === state.token; i += 1) {
      window.scrollBy({ top: direction * innerHeight * SCROLL_STEP, behavior: 'auto' });
      await sleep(SEARCH_DELAY);
      if (!state.active || token !== state.token) return null;
      const list = renderedCandidates();
      for (const candidate of list) {
        if (!state.seen.has(candidate.key)) {
          state.seen.add(candidate.key);
          if (direction > 0) state.catalog.push(candidate.key);
          else {
            state.catalog.unshift(candidate.key);
            state.index += 1;
          }
          updateBadge();
        }
      }
      const candidate = list.find((item) => !before.has(item.key));
      if (candidate) return candidate;
    }
    return null;
  }

  async function move(direction, reason = 'input') {
    if (!state.active || state.navigating) return;
    state.navigating = true;
    const token = ++state.token;

    try {
      clearStream();
      restoreSource();

      let targetIndex = state.index + direction;
      let candidate = null;

      if (targetIndex >= 0 && targetIndex < state.catalog.length) {
        const key = state.catalog[targetIndex];
        setStatus(direction > 0 ? 'Loading next video…' : 'Loading previous video…');
        candidate = await locateKey(key, direction, token);
      } else {
        setStatus(direction > 0 ? 'Finding next video…' : 'Finding previous video…');
        candidate = await discoverNew(direction, token);
        if (candidate) targetIndex = state.catalog.indexOf(candidate.key);
      }

      if (!candidate || token !== state.token || !state.active) {
        setStatus('', false);
        if (reason !== 'ended') state.badge.textContent = `${Math.max(0, state.index + 1)}/${state.catalog.length} loaded · no ${direction > 0 ? 'next' : 'previous'} video`;
        return;
      }

      await attachCandidate(candidate, targetIndex);
    } finally {
      state.navigating = false;
    }
  }

  function onWheel(event) {
    if (!state.active || !state.root) return;
    if (event.target instanceof HTMLElement && event.target.closest('button,input')) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const now = performance.now();
    if (now < state.wheelUntil) return;
    state.wheelDelta += event.deltaY;
    if (Math.abs(state.wheelDelta) < WHEEL_THRESHOLD) return;

    const direction = state.wheelDelta > 0 ? 1 : -1;
    state.wheelDelta = 0;
    state.wheelUntil = now + WHEEL_COOLDOWN;
    void move(direction, 'wheel');
  }

  function isTyping(target) {
    return target instanceof HTMLElement && (
      target.matches('input,textarea,select') || target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'))
    );
  }

  function onKeyDown(event) {
    if (!state.active || event.defaultPrevented || isTyping(event.target)) return;
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown' || key === 'j') {
      event.preventDefault(); event.stopImmediatePropagation(); void move(1, 'key');
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp' || key === 'k') {
      event.preventDefault(); event.stopImmediatePropagation(); void move(-1, 'key');
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); deactivate();
    } else if (event.key === ' ') {
      event.preventDefault(); event.stopImmediatePropagation(); state.playButton?.click();
    }
  }

  async function findInitial(token) {
    let candidate = nearestCandidate();
    if (candidate) return candidate;

    for (let i = 0; i < SEARCH_LIMIT && state.active && token === state.token; i += 1) {
      setStatus('Looking for an X video…');
      window.scrollBy({ top: innerHeight * SCROLL_STEP, behavior: 'auto' });
      await sleep(SEARCH_DELAY);
      if (!state.active || token !== state.token) return null;
      candidate = nearestCandidate();
      if (candidate) return candidate;
    }
    return null;
  }

  async function activate() {
    if (state.active) return true;

    state.active = true;
    state.navigating = false;
    state.token += 1;
    state.startY = scrollY;
    state.catalog = [];
    state.seen = new Set();
    state.index = -1;
    state.outputMuted = false;
    state.outputVolume = 1;
    state.wheelDelta = 0;
    state.wheelUntil = 0;

    ensureRoot();
    setStatus('Starting capture wrapper…');
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    document.addEventListener('keydown', onKeyDown, true);
    startObserver();

    const token = state.token;
    const candidate = await findInitial(token);
    if (!candidate || !state.active || token !== state.token) {
      if (state.active) setStatus('No X video found on this page.');
      return true;
    }

    let index = state.catalog.indexOf(candidate.key);
    if (index < 0) {
      state.seen.add(candidate.key);
      state.catalog.push(candidate.key);
      index = state.catalog.length - 1;
    }
    await attachCandidate(candidate, index);
    return true;
  }

  function deactivate() {
    if (!state.active) return false;

    state.active = false;
    state.navigating = false;
    state.token += 1;
    stopObserver();
    window.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('keydown', onKeyDown, true);
    clearStream();
    restoreSource();
    state.root?.remove();
    state.root = state.display = state.status = state.badge = state.gate = null;
    state.playButton = state.muteButton = state.seek = state.time = state.volume = null;
    window.scrollTo({ top: state.startY, behavior: 'auto' });
    return false;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'XVS_PING') {
      return Promise.resolve({ loaded: true, active: state.active, architecture: 'capture-wrapper-v060' });
    }
    if (message?.type !== 'XVS_TOGGLE') return undefined;
    if (state.active) return Promise.resolve({ active: deactivate() });
    void activate();
    return Promise.resolve({ active: true });
  });
})();
