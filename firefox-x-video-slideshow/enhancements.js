(() => {
  "use strict";

  const app = globalThis.__xMediaSlideshow;
  if (!app || globalThis.__xMediaSlideshowEnhancements) return;
  globalThis.__xMediaSlideshowEnhancements = true;

  const { state } = app;
  let autoPip = true;
  let rootObserver = null;
  let boundVideo = null;
  let autoPipBlocked = false;
  let mediaSessionBound = false;

  const pipIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="11" y="11" width="7" height="5" rx="1"/></svg>';

  const ACTIONS = [
    { id: 'xms-like', label: 'Like', key: 'L' },
    { id: 'xms-repost', label: 'Repost', key: 'R' },
    { id: 'xms-bookmark', label: 'Bookmark', key: 'B' },
    { id: 'xms-open', label: 'Open post', key: 'O' },
  ];

  function overlay() {
    return document.getElementById(app.OVERLAY_ID);
  }

  function activeVideo() {
    const video = state.activeVideo?.video;
    return video instanceof HTMLVideoElement ? video : null;
  }

  function pipSupported(video = activeVideo()) {
    return Boolean(
      video &&
      typeof video.requestPictureInPicture === 'function' &&
      document.pictureInPictureEnabled !== false
    );
  }

  function pipButton() {
    return overlay()?.querySelector('#xms-pip') || null;
  }

  function syncPipButton() {
    const button = pipButton();
    if (!button) return;
    const video = activeVideo();
    const supported = pipSupported(video);
    const active = Boolean(video && document.pictureInPictureElement === video);
    button.disabled = !supported;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.title = supported
      ? active ? 'Exit Picture-in-Picture (P)' : 'Picture-in-Picture (P)'
      : 'Picture-in-Picture is available for videos in Firefox 153+';
  }

  async function requestPip(source = 'manual') {
    const video = activeVideo();
    if (!video) {
      if (source === 'manual') app.player?.toast('Picture-in-Picture is available for videos.');
      return false;
    }
    if (!pipSupported(video)) {
      if (source === 'manual') app.player?.toast('Picture-in-Picture needs Firefox 153 or newer.', 2200);
      return false;
    }
    if (document.pictureInPictureElement === video) return true;

    try {
      if (document.pictureInPictureElement && document.exitPictureInPicture) {
        await document.exitPictureInPicture();
      }
      await video.requestPictureInPicture();
      autoPipBlocked = false;
      syncPipButton();
      return true;
    } catch (error) {
      console.debug('X Media Slideshow: Picture-in-Picture request failed', source, error);
      if (error?.name === 'NotAllowedError') autoPipBlocked = true;
      if (source === 'manual') {
        app.player?.toast(
          error?.name === 'NotAllowedError'
            ? 'Firefox needs a direct click before opening Picture-in-Picture.'
            : 'Could not open Picture-in-Picture.',
          2400
        );
      }
      return false;
    }
  }

  async function togglePip() {
    const video = activeVideo();
    if (video && document.pictureInPictureElement === video) {
      try {
        await document.exitPictureInPicture?.();
      } catch (error) {
        console.debug('X Media Slideshow: Picture-in-Picture exit failed', error);
      }
      syncPipButton();
      return;
    }
    await requestPip('manual');
  }

  function bindVideoPipEvents() {
    const video = activeVideo();
    if (boundVideo === video) {
      syncPipButton();
      return;
    }

    if (boundVideo) {
      boundVideo.removeEventListener('enterpictureinpicture', syncPipButton);
      boundVideo.removeEventListener('leavepictureinpicture', syncPipButton);
    }
    boundVideo = video;
    if (boundVideo) {
      boundVideo.addEventListener('enterpictureinpicture', syncPipButton);
      boundVideo.addEventListener('leavepictureinpicture', syncPipButton);
    }
    syncPipButton();
  }

  function decorateActionButton(button, label, key) {
    if (!button || button.dataset.xmsEnhanced === 'true') return;
    button.dataset.xmsEnhanced = 'true';
    button.classList.add('xms-social-action');
    button.title = `${label} (${key})`;
    button.setAttribute('aria-label', `${label} (${key})`);

    const text = document.createElement('span');
    text.className = 'xms-social-label';
    text.textContent = label;
    const shortcut = document.createElement('span');
    shortcut.className = 'xms-social-key';
    shortcut.textContent = key;
    button.append(text, shortcut);
  }

  function ensurePipButton(rail) {
    let button = rail.querySelector('#xms-pip');
    if (button) return button;

    button = document.createElement('button');
    button.id = 'xms-pip';
    button.type = 'button';
    button.className = 'xms-button xms-social-action xms-pip-action';
    button.title = 'Picture-in-Picture (P)';
    button.setAttribute('aria-label', 'Picture-in-Picture (P)');
    button.innerHTML = `${pipIcon}<span class="xms-social-label">PiP</span><span class="xms-social-key">P</span>`;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void togglePip();
    });
    rail.prepend(button);
    return button;
  }

  function enhanceOverlay() {
    const root = overlay();
    if (!root) {
      unbindMediaSession();
      return;
    }

    const rail = root.querySelector('.xms-social');
    if (!rail) return;
    rail.classList.add('xms-action-rail');
    ensurePipButton(rail);
    for (const action of ACTIONS) {
      decorateActionButton(root.querySelector(`#${action.id}`), action.label, action.key);
    }
    bindVideoPipEvents();
    bindMediaSession();
  }

  function safeMediaAction(action, handler) {
    try {
      navigator.mediaSession?.setActionHandler(action, handler);
      return true;
    } catch {
      return false;
    }
  }

  function bindMediaSession() {
    if (mediaSessionBound || !('mediaSession' in navigator)) return;
    mediaSessionBound = true;

    safeMediaAction('enterpictureinpicture', (details) => {
      if (autoPip || details?.enterPictureInPictureReason === 'useraction') {
        void requestPip('media-session');
      }
    });
    safeMediaAction('nexttrack', () => app.controller?.next('media-session'));
    safeMediaAction('previoustrack', () => app.controller?.previous('media-session'));
    safeMediaAction('play', () => {
      const video = activeVideo();
      if (video?.paused) app.player?.togglePlayPause();
    });
    safeMediaAction('pause', () => {
      const video = activeVideo();
      if (video && !video.paused) app.player?.togglePlayPause();
    });
  }

  function unbindMediaSession() {
    if (!mediaSessionBound || !('mediaSession' in navigator)) return;
    mediaSessionBound = false;
    for (const action of ['enterpictureinpicture', 'nexttrack', 'previoustrack', 'play', 'pause']) {
      try { navigator.mediaSession.setActionHandler(action, null); } catch {}
    }
  }

  function onVisibilityChange() {
    if (!state.running || !autoPip) return;
    if (document.hidden) {
      const video = activeVideo();
      if (video && !video.paused && !video.ended && document.pictureInPictureElement !== video) {
        void requestPip('auto-hidden');
      }
      return;
    }

    if (autoPipBlocked) {
      autoPipBlocked = false;
      app.player?.toast('Auto PiP was blocked by Firefox. Click PiP once to authorize it.', 2800);
    }
  }

  function onKeyDown(event) {
    if (!state.running || !overlay()) return;
    if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea')) return;
    if (event.key.toLowerCase() !== 'p') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void togglePip();
  }

  async function loadPreference() {
    try {
      const values = await browser.storage.sync.get({ autoPictureInPicture: true });
      autoPip = values.autoPictureInPicture !== false;
    } catch {
      autoPip = true;
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.autoPictureInPicture) {
      autoPip = changes.autoPictureInPicture.newValue !== false;
    }
  });

  document.addEventListener('visibilitychange', onVisibilityChange, true);
  document.addEventListener('keydown', onKeyDown, true);
  app.on('positionchange', () => {
    queueMicrotask(() => {
      enhanceOverlay();
      bindVideoPipEvents();
      if (document.hidden && autoPip) void requestPip('position-change');
    });
  });

  rootObserver = new MutationObserver(() => enhanceOverlay());
  rootObserver.observe(document.documentElement, { childList: true, subtree: true });

  void loadPreference().then(enhanceOverlay);
})();