(() => {
  "use strict";
  if (window.__xvsCaptureWrapper) return;
  window.__xvsCaptureWrapper = true;

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const ROOT_ID = 'xvs-capture-root';
  const SEARCH_STEPS = 16;
  const SEARCH_DELAY = 280;
  const SCROLL_STEP = 0.78;
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
    volume: null,
    progress: null,
    time: null,
    rate: null,
    current: null,
    index: -1,
    catalog: [],
    seen: new Set(),
    positions: new Map(),
    muted: false,
    volumeLevel: 1,
    playbackRate: 1,
    wheelDelta: 0,
    wheelLockedUntil: 0,
    startScrollY: 0,
    observer: null,
    scanTimer: null
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const css = (el, styles) => Object.assign(el.style, styles);

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = String(total % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function makeRoot() {
    if (state.root?.isConnected) return state.root;

    const root = document.createElement('div');
    root.id = ROOT_ID;
    css(root, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh',
      zIndex: '2147483646', overflow: 'hidden', background: '#000', color: '#fff',
      fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'
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
      justifyContent: 'center', padding: '32px', boxSizing: 'border-box',
      background: 'rgba(0,0,0,.78)', zIndex: '5', fontWeight: '700',
      textAlign: 'center', pointerEvents: 'none'
    });
    root.appendChild(status);

    const badge = document.createElement('div');
    css(badge, {
      position: 'absolute', top: '18px', right: '18px', zIndex: '10',
      padding: '8px 11px', borderRadius: '999px', background: 'rgba(32,35,39,.86)',
      fontSize: '13px', fontWeight: '700', pointerEvents: 'none'
    });
    root.appendChild(badge);

    const gate = document.createElement('button');
    gate.type = 'button';
    gate.textContent = 'Start with sound';
    css(gate, {
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
      zIndex: '20', display: 'none', padding: '13px 18px', border: '0',
      borderRadius: '999px', background: '#1d9bf0', color: '#fff',
      fontSize: '15px', fontWeight: '750', cursor: 'pointer'
    });
    gate.addEventListener('click', async (event) => {
      if (!event.isTrusted) return;
      event.preventDefault();
      event.stopPropagation();
      state.muted = false;
      state.display.muted = false;
      state.display.volume = state.volumeLevel;
      const source = state.current?.source;
      try {
        if (source?.paused) await source.play();
        await state.display.play();
        hideGate();
        updateControls();
      } catch (error) {
        console.debug('XVS: sound start remained blocked', error);
        gate.textContent = 'Firefox blocked sound. Allow autoplay for x.com';
      }
    }, true);
    root.appendChild(gate);

    const controls = document.createElement('div');
    css(controls, {
      position: 'absolute', left: '16px', right: '16px', bottom: '14px', zIndex: '15',
      display: 'grid', gridTemplateColumns: 'auto auto minmax(80px,1fr) auto minmax(80px,160px) auto auto',
      gap: '10px', alignItems: 'center', padding: '10px 12px', borderRadius: '14px',
      background: 'rgba(15,20,25,.88)', backdropFilter: 'blur(10px)'
    });

    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.textContent = '▶';
    styleButton(playButton);
    playButton.addEventListener('click', async (event) => {
      if (!event.isTrusted) return;
      const source = state.current?.source;
      if (!source) return;
      if (source.paused) {
        try { await source.play(); await state.display.play(); } catch {}
      } else {
        source.pause();
        state.display.pause();
      }
      updateControls();
    });
    controls.appendChild(playButton);

    const muteButton = document.createElement('button');
    muteButton.type = 'button';
    muteButton.textContent = '🔊';
    styleButton(muteButton);
    muteButton.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      state.muted = !state.muted;
      state.display.muted = state.muted;
      updateControls();
    });
    controls.appendChild(muteButton);

    const progress = document.createElement('input');
    progress.type = 'range'; progress.min = '0'; progress.max = '1000'; progress.step = '1'; progress.value = '0';
    progress.addEventListener('input', () => {
      const source = state.current?.source;
      if (!source || !Number.isFinite(source.duration) || source.duration <= 0) return;
      source.currentTime = (Number(progress.value) / 1000) * source.duration;
    });
    controls.appendChild(progress);

    const time = document.createElement('span');
    time.textContent = '0:00 / 0:00';
    css(time, {fontSize: '12px', fontWeight: '650', whiteSpace: 'nowrap'});
    controls.appendChild(time);

    const volume = document.createElement('input');
    volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '0.05'; volume.value = '1';
    volume.addEventListener('input', () => {
      state.volumeLevel = Math.max(0, Math.min(1, Number(volume.value)));
      state.display.volume = state.volumeLevel;
      if (state.volumeLevel > 0 && state.muted) {
        state.muted = false;
        state.display.muted = false;
      }
      updateControls();
    });
    controls.appendChild(volume);

    const rate = document.createElement('select');
    for (const value of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
      const option = document.createElement('option');
      option.value = String(value); option.textContent = `${value}×`;
      if (value === 1) option.selected = true;
      rate.appendChild(option);
    }
    rate.addEventListener('change', () => {
      state.playbackRate = Number(rate.value) || 1;
      if (state.current?.source) state.current.source.playbackRate = state.playbackRate;
    });
    css(rate, {background:'#202327',color:'#fff',border:'0',borderRadius:'8px',padding:'6px'});
    controls.appendChild(rate);

    const hint = document.createElement('span');
    hint.textContent = 'scroll: next / previous';
    css(hint, {fontSize:'11px',opacity:'.72',whiteSpace:'nowrap'});
    controls.appendChild(hint);

    root.appendChild(controls);
    document.documentElement.appendChild(root);

    Object.assign(state, {root, display, status, badge, gate, playButton, muteButton, volume, progress, time, rate});
    updateBadge();
    updateControls();
    return root;
  }

  function styleButton(button) {
    css(button, {border:'0',borderRadius:'8px',background:'#202327',color:'#fff',padding:'7px 9px',cursor:'pointer',fontWeight:'700'});
  }

  function setStatus(text, visible = true) {
    makeRoot();
    state.status.textContent = text || '';
    state.status.style.display = visible ? 'flex' : 'none';
  }

  function showGate(text = 'Start with sound') {
    makeRoot();
    state.gate.textContent = text;
    state.gate.style.display = 'block';
  }

  function hideGate() {
    if (state.gate) state.gate.style.display = 'none';
  }

  function updateBadge() {
    if (!state.badge) return;
    const current = state.index >= 0 ? state.index + 1 : 0;
    state.badge.textContent = `${current}/${state.catalog.length} seen`;
  }

  function updateControls() {
    const source = state.current?.source;
    if (state.playButton) state.playButton.textContent = source && !source.paused ? '❚❚' : '▶';
    if (state.muteButton) state.muteButton.textContent = state.muted || state.volumeLevel === 0 ? '🔇' : '🔊';
    if (state.volume) state.volume.value = String(state.volumeLevel);
    if (state.rate) state.rate.value = String(state.playbackRate);

    if (!source) {
      if (state.progress) state.progress.value = '0';
      if (state.time) state.time.textContent = '0:00 / 0:00';
      return;
    }

    const duration = Number.isFinite(source.duration) ? source.duration : 0;
    const current = Number.isFinite(source.currentTime) ? source.currentTime : 0;
    if (state.progress) state.progress.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';
    if (state.time) state.time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }

  function tweetKey(tweet) {
    return Array.from(tweet?.querySelectorAll('a[href*="/status/"]') || [])
      .find(link => /\/status\/\d+/.test(link.getAttribute('href') || ''))
      ?.getAttribute('href') || null;
  }

  function candidateFromTweet(tweet) {
    const source = tweet?.querySelector('video');
    const key = tweetKey(tweet);
    if (!(source instanceof HTMLVideoElement) || !key) return null;
    const rect = tweet.getBoundingClientRect();
    return {key, source, tweet, y: window.scrollY + rect.top, rect};
  }

  function renderedCandidates() {
    const list = [];
    const seen = new Set();
    for (const tweet of document.querySelectorAll(TWEET_SELECTOR)) {
      const candidate = candidateFromTweet(tweet);
      if (!candidate || seen.has(candidate.key)) continue;
      seen.add(candidate.key);
      list.push(candidate);
    }
    return list.sort((a,b) => a.rect.top - b.rect.top);
  }

  function ingestRendered(prepend = false) {
    const list = renderedCandidates();
    const fresh = [];
    for (const item of list) {
      state.positions.set(item.key, item.y);
      if (!state.seen.has(item.key)) {
        state.seen.add(item.key);
        fresh.push(item.key);
      }
    }
    if (fresh.length) {
      if (prepend) {
        state.catalog = [...fresh, ...state.catalog];
        if (state.index >= 0) state.index += fresh.length;
      } else {
        state.catalog.push(...fresh);
      }
    }
    updateBadge();
    return list;
  }

  function scheduleScan() {
    if (state.scanTimer) return;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = null;
      if (state.active && !state.navigating) ingestRendered(false);
    }, 140);
  }

  function findCandidate(key) {
    if (!key) return null;
    for (const tweet of document.querySelectorAll(TWEET_SELECTOR)) {
      if (tweetKey(tweet) !== key) continue;
      return candidateFromTweet(tweet);
    }
    return null;
  }

  function nearestCandidate() {
    const list = ingestRendered(false);
    if (!list.length) return null;
    const center = window.innerHeight / 2;
    const visible = list.filter(item => item.rect.bottom > 0 && item.rect.top < window.innerHeight);
    const pool = visible.length ? visible : list;
    return pool.reduce((best, item) => {
      const a = Math.abs((item.rect.top + item.rect.height / 2) - center);
      const b = Math.abs((best.rect.top + best.rect.height / 2) - center);
      return a < b ? item : best;
    });
  }

  function captureMedia(source) {
    const method = source.captureStream || source.mozCaptureStream;
    if (typeof method !== 'function') return null;
    try { return method.call(source); } catch (error) {
      console.debug('XVS: captureStream failed', error);
      return null;
    }
  }

  function snapshotSource(source) {
    return {
      muted: source.muted,
      volume: source.volume,
      playbackRate: source.playbackRate,
      autoplay: source.autoplay,
      controls: source.controls,
      playsInline: source.playsInline
    };
  }

  function restoreSource(source, original) {
    if (!source || !original) return;
    source.muted = original.muted;
    source.volume = original.volume;
    source.playbackRate = original.playbackRate;
    source.autoplay = original.autoplay;
    source.controls = original.controls;
    source.playsInline = original.playsInline;
  }

  function unbindCurrent() {
    const current = state.current;
    if (!current) return;
    for (const [name, handler] of current.listeners) current.source.removeEventListener(name, handler);
    current.listeners = [];
  }

  function releaseCurrent({restore = true, stopStream = true} = {}) {
    const current = state.current;
    if (!current) return null;
    unbindCurrent();
    try { current.source.pause(); } catch {}
    if (restore) restoreSource(current.source, current.original);
    if (stopStream) {
      for (const track of current.stream?.getTracks?.() || []) {
        try { track.stop(); } catch {}
      }
    }
    state.current = null;
    updateControls();
    return current;
  }

  function bindSource(source) {
    const listeners = [];
    const on = (name, handler) => {
      source.addEventListener(name, handler);
      listeners.push([name, handler]);
    };
    on('timeupdate', updateControls);
    on('durationchange', updateControls);
    on('play', updateControls);
    on('pause', updateControls);
    on('ratechange', () => {
      if (source === state.current?.source) state.playbackRate = source.playbackRate || 1;
      updateControls();
    });
    on('ended', () => {
      if (state.active && !state.navigating && source === state.current?.source) void move(1, 'ended');
    });
    on('error', () => {
      if (source === state.current?.source) setStatus('X stopped this source video. Scroll to the next video.', true);
    });
    on('emptied', () => {
      if (source === state.current?.source) setStatus('X unloaded this source video. Scroll to the next video.', true);
    });
    return listeners;
  }

  async function attachCandidate(candidate, index) {
    if (!state.active || !candidate?.source?.isConnected) return false;

    const source = candidate.source;
    const original = snapshotSource(source);

    source.muted = true;
    source.volume = 1;
    source.playbackRate = state.playbackRate;
    source.autoplay = false;
    source.controls = false;
    source.playsInline = true;

    try {
      await source.play();
    } catch (error) {
      console.debug('XVS: muted source could not start', error);
      restoreSource(source, original);
      return false;
    }

    const stream = captureMedia(source);
    if (!stream) {
      restoreSource(source, original);
      return false;
    }

    const tracks = stream.getTracks?.() || [];
    if (!tracks.length) {
      restoreSource(source, original);
      for (const track of tracks) try { track.stop(); } catch {}
      return false;
    }

    const old = releaseCurrent({restore: true, stopStream: false});

    state.index = index;
    state.current = {
      key: candidate.key,
      source,
      stream,
      original,
      listeners: bindSource(source)
    };

    makeRoot();
    state.display.srcObject = stream;
    state.display.muted = state.muted;
    state.display.volume = state.volumeLevel;
    setStatus('', false);
    updateBadge();
    updateControls();

    try {
      await state.display.play();
      hideGate();
    } catch (error) {
      console.debug('XVS: display autoplay blocked', error);
      if (!state.muted && state.volumeLevel > 0) showGate('Start with sound');
    }

    if (old?.stream) {
      for (const track of old.stream.getTracks?.() || []) {
        try { track.stop(); } catch {}
      }
    }

    return true;
  }

  async function locateKey(key, token, direction) {
    let candidate = findCandidate(key);
    if (candidate) return candidate;

    const known = state.positions.get(key);
    if (Number.isFinite(known)) {
      window.scrollTo({top: Math.max(0, known - window.innerHeight * 0.25), behavior: 'auto'});
      await sleep(SEARCH_DELAY);
      if (!state.active || token !== state.token) return null;
      ingestRendered(direction < 0);
      candidate = findCandidate(key);
      if (candidate) return candidate;
    }

    for (let i = 0; i < SEARCH_STEPS && state.active && token === state.token; i += 1) {
      window.scrollBy({top: direction * window.innerHeight * SCROLL_STEP, behavior: 'auto'});
      await sleep(SEARCH_DELAY);
      if (!state.active || token !== state.token) return null;
      ingestRendered(direction < 0);
      candidate = findCandidate(key);
      if (candidate) return candidate;
    }
    return null;
  }

  async function discoverNext(token) {
    for (let i = 0; i < SEARCH_STEPS && state.active && token === state.token; i += 1) {
      ingestRendered(false);
      if (state.index + 1 < state.catalog.length) return true;
      window.scrollBy({top: window.innerHeight * SCROLL_STEP, behavior: 'auto'});
      await sleep(SEARCH_DELAY);
    }
    ingestRendered(false);
    return state.index + 1 < state.catalog.length;
  }

  async function discoverPrevious(token) {
    for (let i = 0; i < 10 && state.active && token === state.token; i += 1) {
      ingestRendered(true);
      if (state.index > 0) return true;
      window.scrollBy({top: -window.innerHeight * SCROLL_STEP, behavior: 'auto'});
      await sleep(SEARCH_DELAY);
    }
    ingestRendered(true);
    return state.index > 0;
  }

  async function rollback(oldKey, oldIndex, oldPosition, token) {
    if (!oldKey || !state.active || token !== state.token) return false;
    if (Number.isFinite(oldPosition)) {
      window.scrollTo({top: Math.max(0, oldPosition - window.innerHeight * 0.25), behavior: 'auto'});
      await sleep(SEARCH_DELAY);
    }
    if (!state.active || token !== state.token) return false;
    const candidate = findCandidate(oldKey);
    if (!candidate) return false;
    return attachCandidate(candidate, oldIndex);
  }

  async function move(direction, reason = 'input') {
    if (!state.active || state.navigating) return;
    state.navigating = true;
    const token = ++state.token;
    const oldKey = state.current?.key;
    const oldIndex = state.index;
    const oldPosition = oldKey ? state.positions.get(oldKey) : null;

    releaseCurrent({restore: true, stopStream: true});
    setStatus(direction > 0 ? 'Finding next video…' : 'Finding previous video…', true);

    try {
      let available = direction > 0 ? state.index + 1 < state.catalog.length : state.index > 0;
      if (!available) available = direction > 0 ? await discoverNext(token) : await discoverPrevious(token);

      if (!available || !state.active || token !== state.token) {
        const restored = await rollback(oldKey, oldIndex, oldPosition, token);
        if (!restored) setStatus('No more videos found.', true);
        else setStatus('', false);
        return;
      }

      const nextIndex = state.index + direction;
      const key = state.catalog[nextIndex];
      const candidate = await locateKey(key, token, direction);
      if (!candidate || !state.active || token !== state.token) {
        const restored = await rollback(oldKey, oldIndex, oldPosition, token);
        if (!restored) setStatus('Could not load that video from X.', true);
        return;
      }

      const ok = await attachCandidate(candidate, nextIndex);
      if (!ok) {
        const restored = await rollback(oldKey, oldIndex, oldPosition, token);
        if (!restored) setStatus('Firefox could not capture that X video.', true);
      }
    } finally {
      state.navigating = false;
      updateBadge();
      if (reason !== 'ended') updateControls();
    }
  }

  function onWheel(event) {
    if (!state.active || !state.root) return;
    if (event.target instanceof HTMLElement && event.target.closest('button,input,select')) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const now = performance.now();
    if (now < state.wheelLockedUntil) return;
    state.wheelDelta += event.deltaY;
    if (Math.abs(state.wheelDelta) < WHEEL_THRESHOLD) return;

    const direction = state.wheelDelta > 0 ? 1 : -1;
    state.wheelDelta = 0;
    state.wheelLockedUntil = now + WHEEL_COOLDOWN;
    void move(direction, 'wheel');
  }

  function isTyping(target) {
    return target instanceof HTMLElement && (
      target.matches('input,textarea,select') || target.isContentEditable || !!target.closest('[contenteditable="true"]')
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
    }
  }

  async function findInitial(token) {
    let candidate = nearestCandidate();
    if (candidate) return candidate;
    for (let i = 0; i < SEARCH_STEPS && state.active && token === state.token; i += 1) {
      setStatus('Looking for an X video…', true);
      window.scrollBy({top: window.innerHeight * SCROLL_STEP, behavior: 'auto'});
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
    state.startScrollY = window.scrollY;
    state.index = -1;
    state.catalog = [];
    state.seen = new Set();
    state.positions = new Map();
    state.muted = false;
    state.volumeLevel = 1;
    state.playbackRate = 1;
    state.wheelDelta = 0;
    state.wheelLockedUntil = 0;

    makeRoot();
    setStatus('Starting X video wrapper…', true);
    window.addEventListener('wheel', onWheel, {capture: true, passive: false});
    document.addEventListener('keydown', onKeyDown, true);

    state.observer = new MutationObserver(scheduleScan);
    state.observer.observe(document.documentElement, {childList: true, subtree: true});

    const token = state.token;
    const candidate = await findInitial(token);
    if (!candidate || !state.active || token !== state.token) {
      if (state.active) setStatus('No X video found on this page.', true);
      return true;
    }

    let index = state.catalog.indexOf(candidate.key);
    if (index < 0) {
      state.catalog.push(candidate.key);
      state.seen.add(candidate.key);
      index = state.catalog.length - 1;
    }

    const ok = await attachCandidate(candidate, index);
    if (!ok) setStatus('Firefox could not capture the X video on this page.', true);
    return true;
  }

  function deactivate() {
    if (!state.active) return false;
    state.active = false;
    state.navigating = false;
    state.token += 1;
    if (state.scanTimer) clearTimeout(state.scanTimer);
    state.scanTimer = null;
    state.observer?.disconnect();
    state.observer = null;
    window.removeEventListener('wheel', onWheel, true);
    document.removeEventListener('keydown', onKeyDown, true);
    releaseCurrent({restore: true, stopStream: true});
    if (state.display) {
      try { state.display.pause(); } catch {}
      state.display.srcObject = null;
    }
    state.root?.remove();
    Object.assign(state, {root:null,display:null,status:null,badge:null,gate:null,playButton:null,muteButton:null,volume:null,progress:null,time:null,rate:null});
    window.scrollTo({top: state.startScrollY, behavior: 'auto'});
    return false;
  }

  browser.runtime.onMessage.addListener(message => {
    if (message?.type === 'XVS_PING') {
      return Promise.resolve({loaded: true, active: state.active, architecture: 'capture-wrapper'});
    }
    if (message?.type !== 'XVS_TOGGLE') return undefined;
    if (state.active) return Promise.resolve({active: deactivate()});
    void activate();
    return Promise.resolve({active: true});
  });
})();
