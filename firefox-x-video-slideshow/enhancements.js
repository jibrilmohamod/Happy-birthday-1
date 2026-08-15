(() => {
  "use strict";

  const app = globalThis.__xMediaSlideshow;
  if (!app || globalThis.__xMediaSlideshowEnhancements) return;
  globalThis.__xMediaSlideshowEnhancements = true;

  const { state } = app;
  let autoPip = true;
  let boundVideo = null;
  let autoPipBlocked = false;
  let mediaSessionBound = false;

  const pipIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><rect x="11" y="11" width="7" height="5" rx="1"/></svg>';
  const actions = [
    ['xms-like', 'Like', 'L'],
    ['xms-repost', 'Repost', 'R'],
    ['xms-bookmark', 'Bookmark', 'B'],
    ['xms-open', 'Open post', 'O'],
  ];

  const overlay = () => document.getElementById(app.OVERLAY_ID);
  const activeVideo = () => state.activeVideo?.video instanceof HTMLVideoElement ? state.activeVideo.video : null;

  function pipSupported(video = activeVideo()) {
    return Boolean(video && typeof video.requestPictureInPicture === 'function' && document.pictureInPictureEnabled !== false);
  }

  function syncPipButton() {
    const button = overlay()?.querySelector('#xms-pip');
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
      if (document.pictureInPictureElement && document.exitPictureInPicture) await document.exitPictureInPicture();
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
      try { await document.exitPictureInPicture?.(); } catch (error) {
        console.debug('X Media Slideshow: Picture-in-Picture exit failed', error);
      }
      syncPipButton();
      return;
    }
    await requestPip('manual');
  }

  function bindVideoEvents() {
    const video = activeVideo();
    if (boundVideo === video) return syncPipButton();
    if (boundVideo) {
      boundVideo.removeEventListener('enterpictureinpicture', syncPipButton);
      boundVideo.removeEventListener('leavepictureinpicture', syncPipButton);
    }
    boundVideo = video;
    if (video) {
      video.addEventListener('enterpictureinpicture', syncPipButton);
      video.addEventListener('leavepictureinpicture', syncPipButton);
    }
    syncPipButton();
  }

  function decorateButton(button, label, key) {
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

  function bindPipMediaSession() {
    if (mediaSessionBound || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', (details) => {
        if (!state.running) return;
        if (autoPip || details?.enterPictureInPictureReason === 'useraction') void requestPip('media-session');
      });
      mediaSessionBound = true;
    } catch {}
  }

  function unbindPipMediaSession() {
    if (!mediaSessionBound || !('mediaSession' in navigator)) return;
    try { navigator.mediaSession.setActionHandler('enterpictureinpicture', null); } catch {}
    mediaSessionBound = false;
  }

  function enhanceOverlay() {
    const root = overlay();
    if (!root) {
      unbindPipMediaSession();
      return;
    }
    const rail = root.querySelector('.xms-social');
    if (!rail) return;
    rail.classList.add('xms-action-rail');
    ensurePipButton(rail);
    for (const [id, label, key] of actions) decorateButton(root.querySelector(`#${id}`), label, key);
    bindVideoEvents();
    bindPipMediaSession();
  }

  function onVisibilityChange() {
    if (!state.running || !autoPip) return;
    if (document.hidden) {
      const video = activeVideo();
      if (video && !video.paused && !video.ended && document.pictureInPictureElement !== video) {
        void requestPip('auto-hidden');
      }
    } else if (autoPipBlocked) {
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
    if (area !== 'sync' || !changes.autoPictureInPicture) return;
    autoPip = changes.autoPictureInPicture.newValue !== false;
  });

  document.addEventListener('visibilitychange', onVisibilityChange, true);
  document.addEventListener('keydown', onKeyDown, true);
  app.on('positionchange', () => queueMicrotask(() => {
    enhanceOverlay();
    bindVideoEvents();
    if (document.hidden && autoPip) void requestPip('position-change');
  }));

  const observer = new MutationObserver(enhanceOverlay);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  void loadPreference().then(enhanceOverlay);
})();