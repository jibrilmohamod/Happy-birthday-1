(() => {
  "use strict";

  const app = globalThis.__xMediaSlideshow;
  if (!app || app.controller) return;
  const { state } = app;

  async function displayIndex(targetIndex, reason = 'navigation') {
    if (!state.running) return false;
    const revision = ++state.revision;
    const direction = targetIndex > state.index ? 1 : targetIndex < state.index ? -1 : 0;
    const clamped = Math.max(0, targetIndex);

    if (clamped >= state.items.length) {
      const discovered = await app.discoverForward(clamped, revision);
      if (!discovered || revision !== state.revision) {
        app.player.toast('No additional media found yet.');
        return false;
      }
    }

    const item = state.items[clamped];
    if (!item || revision !== state.revision) return false;

    if (!item.element?.isConnected) {
      app.player.toast('Locating post…', 900);
      const located = await app.locateItem(item, direction || 1, revision);
      if (!located || revision !== state.revision) {
        app.player.toast('That post is no longer available in the current feed.');
        return false;
      }
    }

    state.index = clamped;
    const shown = item.kind === 'image'
      ? await app.player.showImage(item)
      : await app.player.showVideo(item);

    if (!shown || revision !== state.revision) {
      if (reason !== 'auto-skip') app.player.toast('Could not open this media item.');
      return false;
    }

    app.player.updateHeader(item);
    app.emit('positionchange', { index: state.index, item, total: state.items.length });

    if (item.kind === 'video') scheduleHealthCheck(item, revision, direction || 1);
    return true;
  }

  function scheduleHealthCheck(item, revision, direction) {
    setTimeout(() => {
      if (!state.running || revision !== state.revision || app.currentItem() !== item) return;
      const video = state.activeVideo?.video;
      if (!video || state.userPaused || video.ended) return;
      if (video.paused && video.currentTime < 0.1 && video.readyState < 2) {
        app.player.toast('Video is still loading…', 1200);
        setTimeout(() => {
          if (!state.running || revision !== state.revision || app.currentItem() !== item || state.userPaused) return;
          const current = state.activeVideo?.video;
          if (current?.paused && current.currentTime < 0.1 && current.readyState < 2) {
            void displayIndex(state.index + direction, 'auto-skip');
          }
        }, 2200);
      }
    }, 4500);
  }

  const next = (reason = 'input') => displayIndex(state.index + 1, reason);
  const previous = (reason = 'input') => displayIndex(state.index - 1, reason);

  function handleKey(event) {
    if (!state.running || !document.getElementById(app.OVERLAY_ID)) return;
    const tag = event.target instanceof HTMLElement ? event.target.tagName : '';
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

    const key = event.key.toLowerCase();
    const handled = new Set(['arrowright','arrowdown','pagedown','arrowleft','arrowup','pageup',' ','escape','l','r','b','o','m']);
    if (!handled.has(key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (['arrowright','arrowdown','pagedown'].includes(key)) void next('keyboard');
    else if (['arrowleft','arrowup','pageup'].includes(key)) void previous('keyboard');
    else if (key === ' ') app.player.togglePlayPause();
    else if (key === 'escape') stop();
    else if (key === 'l') void app.player.clickSocial('like');
    else if (key === 'r') void app.player.clickSocial('repost');
    else if (key === 'b') void app.player.clickSocial('bookmark');
    else if (key === 'o') app.player.openCurrentPost();
    else if (key === 'm') {
      state.mediaMuted = !state.mediaMuted;
      if (!state.mediaMuted && state.mediaVolume <= 0) state.mediaVolume = 0.5;
      app.player.applyAudioState();
    }
  }

  function handleWheel(event) {
    if (!state.running || !document.getElementById(app.OVERLAY_ID)) return;
    if (event.target instanceof HTMLElement && event.target.closest('button,input,select')) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    state.wheelAccumulator += event.deltaY;
    clearTimeout(state.wheelLockTimer);
    state.wheelLockTimer = setTimeout(() => {
      const amount = state.wheelAccumulator;
      state.wheelAccumulator = 0;
      if (Math.abs(amount) < 55) return;
      if (amount > 0) void next('wheel');
      else void previous('wheel');
    }, 160);
  }

  function bindInputs() {
    document.addEventListener('keydown', handleKey, true);
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  }

  function unbindInputs() {
    document.removeEventListener('keydown', handleKey, true);
    window.removeEventListener('wheel', handleWheel, true);
    clearTimeout(state.wheelLockTimer);
    state.wheelLockTimer = null;
    state.wheelAccumulator = 0;
  }

  async function start(options = {}) {
    if (state.running) {
      return { ok: true, active: true, message: `Already running with ${state.items.length} item${state.items.length === 1 ? '' : 's'}.` };
    }

    state.running = true;
    state.revision += 1;
    state.startScrollY = scrollY;
    state.includeImages = Boolean(options.includeImages);
    const imageSeconds = Math.max(1, Math.min(30, Number(options.imageIntervalSeconds) || 3));
    state.imageDurationMs = imageSeconds * 1000;
    state.items = [];
    state.index = 0;
    state.userPaused = false;

    app.scanVisibleFeed();
    app.observeFeed();
    bindInputs();

    if (!state.items.length) {
      const revision = state.revision;
      await app.discoverForward(0, revision);
    }

    if (!state.items.length) {
      stop();
      return { ok: false, active: false, message: state.includeImages ? 'No playable videos or images found.' : 'No playable videos found.' };
    }

    app.player.ensureRoot();
    app.player.startSocialRefresh();
    await displayIndex(0, 'start');
    return { ok: true, active: true, message: `Started with ${state.items.length} item${state.items.length === 1 ? '' : 's'}.` };
  }

  function stop() {
    if (!state.running) return { ok: true, active: false, message: 'Slideshow is already stopped.' };
    state.running = false;
    state.revision += 1;
    unbindInputs();
    app.stopObserving();
    app.player.destroy();
    state.items = [];
    state.index = 0;
    state.userPaused = false;
    app.emit('catalogchange');
    return { ok: true, active: false, message: 'Slideshow stopped.' };
  }

  app.on('catalogchange', () => {
    if (state.running) app.player.updateHeader();
  });

  app.controller = { start, stop, displayIndex, next, previous };

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === 'XMS_STATUS') {
      const item = app.currentItem();
      return Promise.resolve({
        ok: true,
        active: state.running,
        itemCount: state.items.length,
        currentIndex: state.index,
        currentKind: item?.kind || null,
        includeImages: state.includeImages,
        imageIntervalSeconds: state.imageDurationMs / 1000,
        architecture: 'clean-room-firefox-v1',
      });
    }
    if (message?.type === 'XMS_START') return start(message.options || {});
    if (message?.type === 'XMS_STOP') return Promise.resolve(stop());
    return undefined;
  });
})();
