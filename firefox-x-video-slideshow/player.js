(() => {
  "use strict";

  const app = globalThis.__xMediaSlideshow;
  if (!app || app.player) return;
  const { state } = app;

  let root = null;
  let stage = null;
  let currentMedia = null;
  let originalPlacement = null;
  let imageTimer = null;
  let imageTick = null;
  let imageDeadline = 0;
  let imageRemaining = 0;

  const icons = {
    previous: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zm6 0h4v14h-4z"/></svg>',
    volume: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10zm11.5-2.5a6 6 0 0 1 0 9"/></svg>',
    muted: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10zm12-2 5 8m0-8-5 8"/></svg>',
    like: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    repost: '<svg viewBox="0 0 24 24"><path d="m7 7 3-3 3 3M10 4v11a3 3 0 0 0 3 3h4m0-1-3 3-3-3M14 20V9a3 3 0 0 0-3-3H7"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3-5 3z"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M14 5h5v5m0-5-8 8M19 13v6H5V5h6"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  };

  function button(id, label, icon, className = '') {
    return `<button id="${id}" class="xms-button ${className}" type="button" title="${label}" aria-label="${label}">${icon}</button>`;
  }

  function markup() {
    return `
      <div class="xms-stage" data-xms-stage></div>
      <div class="xms-topbar">
        <div class="xms-chip"><span data-xms-kind>MEDIA</span><span data-xms-position>0 / 0</span></div>
        ${button('xms-close', 'Close slideshow', icons.close)}
      </div>
      <button class="xms-nav xms-nav-left" data-xms-prev aria-label="Previous">${icons.previous}</button>
      <button class="xms-nav xms-nav-right" data-xms-next aria-label="Next">${icons.next}</button>
      <div class="xms-social">
        ${button('xms-like', 'Like', icons.like)}
        ${button('xms-repost', 'Repost', icons.repost)}
        ${button('xms-bookmark', 'Bookmark', icons.bookmark)}
        ${button('xms-open', 'Open post', icons.open)}
      </div>
      <div class="xms-controls" data-xms-controls>
        ${button('xms-prev', 'Previous', icons.previous)}
        ${button('xms-play', 'Play or pause', icons.pause)}
        ${button('xms-next', 'Next', icons.next)}
        <input id="xms-progress" class="xms-progress" type="range" min="0" max="1000" value="0" aria-label="Progress">
        <span id="xms-time" class="xms-time">0:00 / 0:00</span>
        ${button('xms-volume-button', 'Mute or unmute', icons.muted)}
        <input id="xms-volume" class="xms-volume" type="range" min="0" max="1" step="0.05" value="0" aria-label="Volume">
        <select id="xms-rate" class="xms-rate" aria-label="Playback speed">
          <option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option>
          <option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
        </select>
      </div>
      <div class="xms-toast" data-xms-toast></div>
    `;
  }

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.createElement('div');
    root.id = app.OVERLAY_ID;
    root.innerHTML = markup();
    document.body.appendChild(root);
    stage = root.querySelector('[data-xms-stage]');
    bindUi();
    showControls();
    return root;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function toast(message, duration = 1500) {
    if (!root) return;
    const node = root.querySelector('[data-xms-toast]');
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(node.__timer);
    node.__timer = setTimeout(() => node.classList.remove('visible'), duration);
  }

  function setPlayIcon(paused) {
    const play = root?.querySelector('#xms-play');
    if (play) play.innerHTML = paused ? icons.play : icons.pause;
  }

  function applyAudioState() {
    const video = currentMedia instanceof HTMLVideoElement ? currentMedia : null;
    if (video) {
      video.muted = state.mediaMuted || state.mediaVolume <= 0;
      video.volume = Math.max(0, Math.min(1, state.mediaVolume));
      video.playbackRate = state.mediaRate;
    }
    const buttonNode = root?.querySelector('#xms-volume-button');
    if (buttonNode) buttonNode.innerHTML = state.mediaMuted || state.mediaVolume <= 0 ? icons.muted : icons.volume;
    const slider = root?.querySelector('#xms-volume');
    if (slider) slider.value = state.mediaMuted ? '0' : String(state.mediaVolume);
  }

  async function playVideo(video, attempts = 2) {
    if (!(video instanceof HTMLVideoElement)) return false;
    applyAudioState();
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      try {
        await video.play();
        state.userPaused = false;
        setPlayIcon(false);
        return true;
      } catch (error) {
        if (attempt === attempts) {
          console.debug('X Media Slideshow: play failed', error);
          toast('Playback was blocked. Press play to continue.', 2200);
          return false;
        }
        await app.sleep(120 + attempt * 80);
      }
    }
    return false;
  }

  function clearImageClock() {
    clearTimeout(imageTimer);
    clearInterval(imageTick);
    imageTimer = imageTick = null;
    imageDeadline = 0;
  }

  function updateProgress() {
    if (!root) return;
    const slider = root.querySelector('#xms-progress');
    const time = root.querySelector('#xms-time');
    if (!slider || !time) return;

    if (currentMedia instanceof HTMLVideoElement) {
      const duration = Number.isFinite(currentMedia.duration) ? currentMedia.duration : 0;
      const current = Number.isFinite(currentMedia.currentTime) ? currentMedia.currentTime : 0;
      slider.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';
      time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
      return;
    }

    const total = state.imageDurationMs;
    const remaining = state.userPaused ? imageRemaining : Math.max(0, imageDeadline - Date.now());
    const elapsed = Math.max(0, total - remaining);
    slider.value = String(Math.round((elapsed / total) * 1000));
    time.textContent = `${formatTime(elapsed / 1000)} / ${formatTime(total / 1000)}`;
  }

  function startImageClock(duration = state.imageDurationMs) {
    clearImageClock();
    imageRemaining = Math.max(0, duration);
    imageDeadline = Date.now() + imageRemaining;
    imageTick = setInterval(updateProgress, 100);
    imageTimer = setTimeout(() => {
      if (!state.userPaused && state.running) app.controller?.next('image-ended');
    }, imageRemaining);
  }

  function pauseImageClock() {
    if (!imageDeadline) return;
    imageRemaining = Math.max(0, imageDeadline - Date.now());
    clearImageClock();
    updateProgress();
  }

  function restoreVideo() {
    if (!originalPlacement?.video) return;
    const { video, parent, anchor } = originalPlacement;
    detachVideoEvents(video);
    try { video.pause(); } catch {}
    if (anchor?.isConnected && parent?.isConnected) parent.insertBefore(video, anchor);
    else if (parent?.isConnected) parent.appendChild(video);
    anchor?.remove();
    originalPlacement = null;
    state.activeVideo = null;
  }

  function detachVideoEvents(video) {
    video?.removeEventListener('ended', onVideoEnded);
    video?.removeEventListener('timeupdate', updateProgress);
    video?.removeEventListener('loadedmetadata', updateProgress);
    video?.removeEventListener('pause', onVideoPause);
    video?.removeEventListener('play', onVideoPlay);
  }

  function onVideoEnded() {
    if (state.running && !state.userPaused) app.controller?.next('video-ended');
  }

  function onVideoPause() {
    setPlayIcon(true);
    if (!state.userPaused && state.running && currentMedia instanceof HTMLVideoElement && !currentMedia.ended) {
      setTimeout(() => {
        if (!state.userPaused && currentMedia?.paused && !currentMedia?.ended) void playVideo(currentMedia, 1);
      }, 180);
    }
  }

  function onVideoPlay() {
    setPlayIcon(false);
  }

  async function showVideo(item) {
    ensureRoot();
    clearImageClock();
    restoreVideo();

    if (!(item?.element instanceof HTMLVideoElement) || !item.element.isConnected) return false;
    const video = item.element;
    const parent = video.parentNode;
    if (!parent) return false;

    const anchor = document.createComment('x-media-slideshow-anchor');
    parent.insertBefore(anchor, video);
    originalPlacement = { video, parent, anchor };
    state.activeVideo = { video, item };

    stage.replaceChildren(video);
    currentMedia = video;
    video.controls = false;
    video.playsInline = true;
    video.loop = false;
    video.playbackRate = state.mediaRate;
    video.currentTime = video.currentTime > 0.5 ? 0 : video.currentTime;
    video.addEventListener('ended', onVideoEnded);
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('loadedmetadata', updateProgress);
    video.addEventListener('pause', onVideoPause);
    video.addEventListener('play', onVideoPlay);
    state.userPaused = false;
    applyAudioState();
    updateHeader(item);
    updateProgress();
    refreshSocial();
    await playVideo(video, 3);
    return true;
  }

  async function showImage(item) {
    ensureRoot();
    restoreVideo();
    clearImageClock();
    if (!item?.src) return false;

    const image = document.createElement('img');
    image.src = item.src;
    image.alt = 'Post image';
    image.draggable = false;
    image.addEventListener('click', togglePlayPause);
    stage.replaceChildren(image);
    currentMedia = image;
    state.userPaused = false;
    imageRemaining = state.imageDurationMs;
    setPlayIcon(false);
    updateHeader(item);
    refreshSocial();
    startImageClock();
    updateProgress();
    return true;
  }

  function updateHeader(item = app.currentItem()) {
    if (!root) return;
    const kind = root.querySelector('[data-xms-kind]');
    const position = root.querySelector('[data-xms-position]');
    if (kind) kind.textContent = item?.kind === 'image' ? 'IMAGE' : 'VIDEO';
    if (position) position.textContent = `${Math.min(state.index + 1, state.items.length)} / ${state.items.length || 0}`;
  }

  function currentArticle() {
    const item = app.currentItem();
    if (!item) return null;
    return item.article?.isConnected ? item.article : app.findArticleByPost(item.postUrl);
  }

  function setSocialState(buttonId, selector, activeSelector) {
    const buttonNode = root?.querySelector(buttonId);
    if (!buttonNode) return;
    const article = currentArticle();
    const action = article?.querySelector(selector);
    buttonNode.disabled = !action;
    buttonNode.classList.toggle('active', Boolean(article?.querySelector(activeSelector)));
  }

  function refreshSocial() {
    if (!root) return;
    setSocialState('#xms-like', '[data-testid="like"],[data-testid="unlike"]', '[data-testid="unlike"]');
    setSocialState('#xms-repost', '[data-testid="retweet"],[data-testid="unretweet"]', '[data-testid="unretweet"]');
    setSocialState('#xms-bookmark', '[data-testid="bookmark"],[data-testid="removeBookmark"]', '[data-testid="removeBookmark"]');
    const openButton = root.querySelector('#xms-open');
    if (openButton) openButton.disabled = !app.currentItem()?.postUrl;
  }

  async function clickSocial(kind) {
    const article = currentArticle();
    if (!article) {
      toast('This post is no longer rendered by X.');
      return;
    }

    const selectors = {
      like: '[data-testid="like"],[data-testid="unlike"]',
      repost: '[data-testid="retweet"],[data-testid="unretweet"]',
      bookmark: '[data-testid="bookmark"],[data-testid="removeBookmark"]',
    };
    const target = article.querySelector(selectors[kind]);
    if (!target) {
      toast(`${kind[0].toUpperCase()}${kind.slice(1)} is unavailable for this post.`);
      return;
    }

    target.click();
    if (kind === 'repost' && target.getAttribute('data-testid') === 'retweet') {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await app.sleep(90);
        const confirmation = document.querySelector('[data-testid="retweetConfirm"]');
        if (confirmation) {
          confirmation.click();
          break;
        }
      }
    }
    await app.sleep(220);
    refreshSocial();
    toast(kind === 'repost' ? 'Repost updated.' : `${kind[0].toUpperCase()}${kind.slice(1)} updated.`);
  }

  function openCurrentPost() {
    const url = app.currentItem()?.postUrl;
    if (!url) return toast('Post URL unavailable.');
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function togglePlayPause() {
    if (currentMedia instanceof HTMLVideoElement) {
      if (currentMedia.paused) {
        state.userPaused = false;
        void playVideo(currentMedia, 2);
      } else {
        state.userPaused = true;
        currentMedia.pause();
      }
      setPlayIcon(currentMedia.paused);
      return;
    }

    if (currentMedia instanceof HTMLImageElement) {
      state.userPaused = !state.userPaused;
      if (state.userPaused) pauseImageClock();
      else startImageClock(imageRemaining || state.imageDurationMs);
      setPlayIcon(state.userPaused);
    }
  }

  function seek(value) {
    const fraction = Math.max(0, Math.min(1, Number(value) / 1000));
    if (currentMedia instanceof HTMLVideoElement && Number.isFinite(currentMedia.duration) && currentMedia.duration > 0) {
      currentMedia.currentTime = currentMedia.duration * fraction;
      return;
    }
    if (currentMedia instanceof HTMLImageElement) {
      imageRemaining = state.imageDurationMs * (1 - fraction);
      if (!state.userPaused) startImageClock(imageRemaining);
      else updateProgress();
    }
  }

  function showControls() {
    if (!root) return;
    root.classList.remove('controls-hidden');
    clearTimeout(state.controlsHideTimer);
    state.controlsHideTimer = setTimeout(() => root?.classList.add('controls-hidden'), 2200);
  }

  function bindUi() {
    root.addEventListener('mousemove', showControls, { passive: true });
    root.querySelector('#xms-close').addEventListener('click', () => app.controller?.stop());
    root.querySelectorAll('[data-xms-prev],#xms-prev').forEach((node) => node.addEventListener('click', () => app.controller?.previous('button')));
    root.querySelectorAll('[data-xms-next],#xms-next').forEach((node) => node.addEventListener('click', () => app.controller?.next('button')));
    root.querySelector('#xms-play').addEventListener('click', togglePlayPause);
    root.querySelector('#xms-progress').addEventListener('input', (event) => seek(event.target.value));
    root.querySelector('#xms-volume-button').addEventListener('click', () => {
      state.mediaMuted = !state.mediaMuted;
      if (!state.mediaMuted && state.mediaVolume <= 0) state.mediaVolume = 0.5;
      applyAudioState();
    });
    root.querySelector('#xms-volume').addEventListener('input', (event) => {
      state.mediaVolume = Math.max(0, Math.min(1, Number(event.target.value) || 0));
      state.mediaMuted = state.mediaVolume === 0;
      applyAudioState();
    });
    root.querySelector('#xms-rate').addEventListener('change', (event) => {
      state.mediaRate = Number(event.target.value) || 1;
      if (currentMedia instanceof HTMLVideoElement) currentMedia.playbackRate = state.mediaRate;
    });
    root.querySelector('#xms-like').addEventListener('click', () => void clickSocial('like'));
    root.querySelector('#xms-repost').addEventListener('click', () => void clickSocial('repost'));
    root.querySelector('#xms-bookmark').addEventListener('click', () => void clickSocial('bookmark'));
    root.querySelector('#xms-open').addEventListener('click', openCurrentPost);
  }

  function destroy() {
    clearImageClock();
    clearInterval(state.socialRefreshTimer);
    state.socialRefreshTimer = null;
    restoreVideo();
    root?.remove();
    root = stage = currentMedia = null;
  }

  function startSocialRefresh() {
    clearInterval(state.socialRefreshTimer);
    state.socialRefreshTimer = setInterval(refreshSocial, 1200);
  }

  app.player = {
    ensureRoot,
    showVideo,
    showImage,
    updateHeader,
    updateProgress,
    refreshSocial,
    startSocialRefresh,
    togglePlayPause,
    clickSocial,
    openCurrentPost,
    applyAudioState,
    toast,
    showControls,
    destroy,
  };
})();
