(() => {
  "use strict";
  const X = globalThis.__XVS9;
  if (!X || X.playerLoaded) return;
  X.playerLoaded = true;
  const s = X.state;

  const icons = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 18 8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3zm11.5 3A2.5 2.5 0 0 0 13 9.71v4.58A2.5 2.5 0 0 0 14.5 12zm0-7.18v2.06a5.5 5.5 0 0 1 0 10.24v2.06a7.5 7.5 0 0 0 0-14.36z"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.27 3 3 4.27 7.73 9H3v6h4l5 4v-6.73l4.25 4.25A5.5 5.5 0 0 1 14 17.7v2.06a7.5 7.5 0 0 0 3.69-1.81L19.73 20 21 18.73l-9-9L4.27 3zM12 5 9.91 7.09 12 9.18V5zm4.5 7c0-.9-.36-1.72-.94-2.31L14.1 8.23A5.5 5.5 0 0 1 18.5 12c0 .84-.19 1.64-.52 2.35l-1.54-1.54c.04-.26.06-.53.06-.81z"/></svg>',
    like: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16L12 8.75l-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91z"/></svg>',
    repost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 3.88 8.932 8.02l-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L3.432 9.48 2.068 8.02 4.5 3.88zm15 16.24-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14z"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4a.5.5 0 0 0-.5.5v14.56l6-4.29 6 4.29V4.5a.5.5 0 0 0-.5-.5h-11z"/></svg>',
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>'
  };

  function restoreActive() {
    const active = s.activeVideo;
    if (!active) return;
    try {
      if (active.placeholder?.isConnected && active.originalParent?.isConnected) {
        active.originalParent.insertBefore(active.el, active.placeholder);
        active.placeholder.remove();
      }
    } catch {}
    s.activeVideo = null;
  }

  function detach() {
    const player = s.player;
    if (!player) return;
    player.removeEventListener("ended", onEnded);
    player.removeEventListener("pause", onPause);
    player.removeEventListener("timeupdate", updateProgress);
    player.removeEventListener("loadedmetadata", updateProgress);
    player.removeEventListener("canplay", updateProgress);
  }

  function clearImageTimers() {
    clearTimeout(s.imageTimer);
    clearInterval(s.imageProgressTimer);
    s.imageTimer = s.imageProgressTimer = null;
    s.imageStartedAt = s.imageRunMs = 0;
  }

  function applyVolume() {
    if (!s.player) return;
    const muted = s.muted || s.volume <= 0;
    s.player.muted = muted;
    s.player.volume = muted ? 0 : s.volume;
    const button = s.overlay?.querySelector("#xvs-mute");
    if (button) {
      button.innerHTML = muted ? icons.muted : icons.volume;
      button.setAttribute("aria-label", muted ? "Unmute" : "Mute");
      button.title = muted ? "Unmute (M)" : "Mute (M)";
    }
  }

  function playWithRetry(retries = 2) {
    const player = s.player;
    if (!player || !player.paused || player.seeking) return;
    applyVolume();
    const result = player.play();
    if (result?.catch) {
      result.catch(error => {
        if (retries > 0) setTimeout(() => playWithRetry(retries - 1), 100);
        else {
          console.warn("XVS autoplay failed", error);
          showToast("Playback was blocked. Click play to continue.", 2200);
          showControls(true);
        }
      });
    }
  }

  function onEnded() {
    if (!s.manualPause && s.active) void X.goTo?.(s.index + 1);
  }

  function onPause() {
    if (!s.player || s.manualPause || s.player.ended) return;
    playWithRetry(1);
  }

  const fmt = value => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}` : "--:--";

  function updateCounter() {
    const count = s.overlay?.querySelector("#xvs-count");
    const type = s.overlay?.querySelector("#xvs-type");
    const current = X.currentItem();
    if (count) count.textContent = `${Math.min(s.index + 1, s.items.length)}/${s.items.length || "--"}`;
    if (type) type.textContent = current?.type === "image" ? "IMAGE" : "VIDEO";
  }

  function updateProgress() {
    const range = s.overlay?.querySelector("#xvs-progress");
    const time = s.overlay?.querySelector("#xvs-time");
    const item = X.currentItem();

    if (item?.type === "image") {
      const total = s.imageIntervalMs || 3000;
      const remaining = Math.max(0, s.imageRemainingMs);
      const pct = total ? 1 - remaining / total : 0;
      if (range) range.value = String(Math.round(pct * 1000));
      if (time) time.textContent = `${fmt((total - remaining) / 1000)} / ${fmt(total / 1000)}`;
      updateCounter();
      return;
    }

    const player = s.player;
    if (!player) return;
    if (range) range.value = Number.isFinite(player.duration) && player.duration > 0 ? String(Math.round(player.currentTime / player.duration * 1000)) : "0";
    if (time) time.textContent = `${fmt(player.currentTime)} / ${fmt(player.duration)}`;
    updateCounter();
  }

  function startImageAdvance(ms = s.imageIntervalMs) {
    clearImageTimers();
    s.imageRemainingMs = Math.max(0, ms);
    s.imageStartedAt = Date.now();
    s.imageRunMs = s.imageRemainingMs;
    s.imageProgressTimer = setInterval(() => {
      if (s.manualPause || X.currentItem()?.type !== "image") return;
      s.imageRemainingMs = Math.max(0, s.imageRunMs - (Date.now() - s.imageStartedAt));
      updateProgress();
    }, 100);
    s.imageTimer = setTimeout(() => {
      if (!s.manualPause && X.currentItem()?.type === "image") void X.goTo?.(s.index + 1);
    }, s.imageRemainingMs);
  }

  function pauseImage() {
    if (X.currentItem()?.type !== "image") return;
    s.imageRemainingMs = Math.max(0, s.imageRunMs - (Date.now() - s.imageStartedAt));
    clearImageTimers();
    updateProgress();
  }

  function currentArticle() {
    const item = X.currentItem();
    if (!item) return null;
    if (item.article?.isConnected) return item.article;
    if (item.type === "video" && s.activeVideo?.el === item.el) return s.activeVideo.originalParent?.closest("article") || null;
    return item.el?.closest?.("article") || item.originalParent?.closest?.("article") || null;
  }

  function setSocialButton(button, available, active) {
    if (!button) return;
    button.disabled = !available;
    button.classList.toggle("active", Boolean(active));
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function updateSocial() {
    const article = currentArticle();
    const like = s.overlay?.querySelector("#xvs-like");
    const repost = s.overlay?.querySelector("#xvs-retweet");
    const bookmark = s.overlay?.querySelector("#xvs-bookmark");
    const open = s.overlay?.querySelector("#xvs-open");

    if (!article) {
      [like, repost, bookmark, open].forEach(button => { if (button) button.disabled = true; });
      return;
    }

    const likeSource = article.querySelector('[data-testid="like"],[data-testid="unlike"]');
    const repostSource = article.querySelector('[data-testid="retweet"],[data-testid="unretweet"]');
    const bookmarkSource = article.querySelector('[data-testid="bookmark"],[data-testid="removeBookmark"]');
    const postLink = article.querySelector('a[href*="/status/"]');

    setSocialButton(like, Boolean(likeSource), likeSource?.getAttribute("data-testid") === "unlike");
    setSocialButton(repost, Boolean(repostSource), repostSource?.getAttribute("data-testid") === "unretweet");
    setSocialButton(bookmark, Boolean(bookmarkSource), bookmarkSource?.getAttribute("data-testid") === "removeBookmark");
    if (open) open.disabled = !postLink;
  }

  async function proxySocial(kind) {
    const article = currentArticle();
    if (!article) {
      showToast("The original post is no longer available in the feed.");
      return;
    }

    const selectors = {
      like: '[data-testid="like"],[data-testid="unlike"]',
      retweet: '[data-testid="retweet"],[data-testid="unretweet"]',
      bookmark: '[data-testid="bookmark"],[data-testid="removeBookmark"]'
    };
    const button = article.querySelector(selectors[kind]);
    if (!button) {
      showToast(`${kind === "retweet" ? "Repost" : kind[0].toUpperCase() + kind.slice(1)} is unavailable for this post.`);
      return;
    }

    const before = button.getAttribute("data-testid") || "";
    button.click();

    if (kind === "retweet" && before === "retweet") {
      for (let i = 0; i < 12; i += 1) {
        await X.sleep(70);
        const confirm = document.querySelector('[data-testid="retweetConfirm"]');
        if (confirm) {
          confirm.click();
          break;
        }
      }
    }

    setTimeout(updateSocial, 220);
    setTimeout(updateSocial, 800);
    const label = kind === "retweet" ? "Repost" : kind[0].toUpperCase() + kind.slice(1);
    showToast(`${label} updated`, 1000);
  }

  function openCurrentPost() {
    const article = currentArticle();
    const url = article?.querySelector('a[href*="/status/"]')?.href?.split("?")[0] || (X.currentItem()?.key?.startsWith?.("http") ? X.currentItem().key : null);
    if (!url) {
      showToast("Could not find the post URL.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function showToast(message, ms = 1500) {
    const toast = s.overlay?.querySelector("#xvs-toast");
    if (!toast) return;
    clearTimeout(s.toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    s.toastTimer = setTimeout(() => toast.classList.remove("show"), ms);
  }

  function showControls(keep = false) {
    if (!s.overlay) return;
    s.overlay.classList.remove("xvs-idle");
    clearTimeout(s.controlsTimer);
    if (keep || s.manualPause) return;
    s.controlsTimer = setTimeout(() => {
      if (s.overlay && !s.manualPause) s.overlay.classList.add("xvs-idle");
    }, 2600);
  }

  function speedMenuHtml() {
    return [0.5, 0.75, 1, 1.25, 1.5, 2].map(value => `<button type="button" data-rate="${value}">${value}×</button>`).join("");
  }

  function html() {
    return `
      <div id="xvs-host"></div>
      <div id="xvs-toast" role="status" aria-live="polite"></div>
      <div id="xvs-meta"><span id="xvs-type">VIDEO</span><span id="xvs-count">--/--</span></div>
      <button id="xvs-close" class="xvs-icon" title="Close (Esc)" aria-label="Close">×</button>
      <button id="xvs-prev-side" class="xvs-side xvs-side-left" title="Previous">${icons.prev}</button>
      <button id="xvs-next-side" class="xvs-side xvs-side-right" title="Next">${icons.next}</button>
      <div id="xvs-social">
        <button id="xvs-like" class="xvs-icon" title="Like (L)" aria-label="Like">${icons.like}</button>
        <button id="xvs-retweet" class="xvs-icon" title="Repost (R)" aria-label="Repost">${icons.repost}</button>
        <button id="xvs-bookmark" class="xvs-icon" title="Bookmark (B)" aria-label="Bookmark">${icons.bookmark}</button>
        <button id="xvs-open" class="xvs-icon" title="Open post (O)" aria-label="Open post">${icons.open}</button>
      </div>
      <div id="xvs-controls">
        <button id="xvs-prev" class="xvs-icon" title="Previous">${icons.prev}</button>
        <button id="xvs-play" class="xvs-icon" title="Play/Pause (Space)">${icons.pause}</button>
        <button id="xvs-next" class="xvs-icon" title="Next">${icons.next}</button>
        <input id="xvs-progress" aria-label="Playback position" type="range" min="0" max="1000" value="0">
        <span id="xvs-time">0:00 / 0:00</span>
        <button id="xvs-mute" class="xvs-icon" title="Mute (M)">${icons.muted}</button>
        <input id="xvs-volume" aria-label="Volume" type="range" min="0" max="1" step="0.05" value="0">
        <div id="xvs-speed-wrap"><button id="xvs-speed-toggle" type="button">1×</button><div id="xvs-speed-menu" hidden>${speedMenuHtml()}</div></div>
      </div>`;
  }

  function createOverlay() {
    if (s.overlay) return;
    const overlay = document.createElement("div");
    overlay.id = X.OVERLAY_ID;
    overlay.innerHTML = html();
    document.body.appendChild(overlay);
    s.overlay = overlay;
    s.host = overlay.querySelector("#xvs-host");

    overlay.querySelector("#xvs-close").onclick = () => X.destroyOverlay?.();
    overlay.querySelector("#xvs-prev").onclick = overlay.querySelector("#xvs-prev-side").onclick = () => void X.goTo?.(s.index - 1);
    overlay.querySelector("#xvs-next").onclick = overlay.querySelector("#xvs-next-side").onclick = () => void X.goTo?.(s.index + 1);

    overlay.querySelector("#xvs-play").onclick = () => {
      const item = X.currentItem();
      const button = overlay.querySelector("#xvs-play");
      if (item?.type === "image") {
        if (s.manualPause) {
          s.manualPause = false;
          startImageAdvance(s.imageRemainingMs || s.imageIntervalMs);
        } else {
          s.manualPause = true;
          pauseImage();
        }
        button.innerHTML = s.manualPause ? icons.play : icons.pause;
        showControls(s.manualPause);
        return;
      }

      const player = s.player;
      if (!player) return;
      if (player.paused) {
        s.manualPause = false;
        playWithRetry(2);
        button.innerHTML = icons.pause;
      } else {
        s.manualPause = true;
        player.pause();
        button.innerHTML = icons.play;
      }
      showControls(s.manualPause);
    };

    overlay.querySelector("#xvs-mute").onclick = () => {
      s.muted = !s.muted;
      if (!s.muted && s.volume <= 0) s.volume = .5;
      overlay.querySelector("#xvs-volume").value = s.muted ? "0" : String(s.volume);
      applyVolume();
      showControls();
    };

    overlay.querySelector("#xvs-volume").oninput = event => {
      s.volume = Math.max(0, Math.min(1, Number(event.target.value) || 0));
      s.muted = s.volume === 0;
      applyVolume();
      showControls();
    };

    overlay.querySelector("#xvs-progress").oninput = event => {
      const item = X.currentItem();
      if (item?.type === "image") {
        const pct = Number(event.target.value) / 1000;
        s.imageRemainingMs = s.imageIntervalMs - Math.max(0, Math.min(1, pct)) * s.imageIntervalMs;
        if (!s.manualPause) startImageAdvance(s.imageRemainingMs); else updateProgress();
        return;
      }
      const player = s.player;
      if (player && Number.isFinite(player.duration) && player.duration > 0) player.currentTime = Number(event.target.value) / 1000 * player.duration;
    };

    const speedToggle = overlay.querySelector("#xvs-speed-toggle");
    const speedMenu = overlay.querySelector("#xvs-speed-menu");
    speedToggle.onclick = event => {
      event.stopPropagation();
      speedMenu.hidden = !speedMenu.hidden;
      showControls(true);
    };
    speedMenu.querySelectorAll("button[data-rate]").forEach(button => {
      button.onclick = () => {
        s.rate = Number(button.dataset.rate) || 1;
        if (s.player) s.player.playbackRate = s.rate;
        speedToggle.textContent = `${s.rate}×`;
        speedMenu.hidden = true;
        showControls();
      };
    });

    overlay.querySelector("#xvs-like").onclick = () => void proxySocial("like");
    overlay.querySelector("#xvs-retweet").onclick = () => void proxySocial("retweet");
    overlay.querySelector("#xvs-bookmark").onclick = () => void proxySocial("bookmark");
    overlay.querySelector("#xvs-open").onclick = openCurrentPost;

    overlay.addEventListener("pointermove", () => showControls());
    overlay.addEventListener("pointerdown", () => showControls());
    overlay.addEventListener("click", event => {
      if (!event.target.closest("#xvs-speed-wrap")) speedMenu.hidden = true;
    });

    s.socialTimer = setInterval(updateSocial, 1000);
    X.bindInputs?.();
    showControls();
  }

  async function moveVideo(item) {
    const el = item?.el;
    if (!(el instanceof HTMLVideoElement) || !el.isConnected) return false;
    clearImageTimers();
    detach();
    try { s.player?.pause(); } catch {}
    restoreActive();

    const parent = el.parentElement;
    if (!parent) return false;
    const placeholder = document.createElement("div");
    placeholder.style.display = "none";
    parent.insertBefore(placeholder, el);
    s.activeVideo = { el, placeholder, originalParent: parent };
    item.placeholder = placeholder;
    item.originalParent = parent;
    item.article = parent.closest("article") || item.article;

    s.player = el;
    s.host.innerHTML = "";
    s.host.appendChild(el);
    el.controls = false;
    el.playsInline = true;
    el.loop = false;
    el.playbackRate = s.rate;
    applyVolume();

    el.addEventListener("ended", onEnded);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", updateProgress);
    el.addEventListener("loadedmetadata", updateProgress);
    el.addEventListener("canplay", updateProgress);

    if (el.currentTime > .5) {
      try { el.currentTime = 0; } catch {}
    }
    s.manualPause = false;
    s.overlay.querySelector("#xvs-play").innerHTML = icons.pause;
    playWithRetry(3);
    updateProgress();
    updateSocial();
    showControls();

    setTimeout(() => {
      if (s.player && !s.player.ended && !s.manualPause && s.player.paused) playWithRetry(1);
    }, 400);
    return true;
  }

  async function moveImage(item) {
    clearImageTimers();
    detach();
    try { s.player?.pause(); } catch {}
    s.player = null;
    restoreActive();
    if (!item?.src) return false;

    const img = document.createElement("img");
    img.src = item.src;
    img.alt = "Tweet image";
    img.draggable = false;
    img.onclick = () => s.overlay?.querySelector("#xvs-play")?.click();
    s.host.innerHTML = "";
    s.host.appendChild(img);
    s.imageRemainingMs = s.imageIntervalMs;
    s.manualPause = false;
    s.overlay.querySelector("#xvs-play").innerHTML = icons.pause;
    updateProgress();
    updateSocial();
    showControls();
    startImageAdvance(s.imageIntervalMs);
    return true;
  }

  Object.assign(X, {
    restoreActive, detachPlayerEvents: detach, clearImageTimers, applyVolume, playWithRetry,
    updateCounter, updateProgress, updateSocial, proxySocial, openCurrentPost, showToast,
    showControls, createOverlay, moveVideo, moveImage
  });
})();