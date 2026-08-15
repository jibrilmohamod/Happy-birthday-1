(() => {
  "use strict";
  const X = globalThis.__XVS9;
  if (!X || X.controllerLoaded) return;
  X.controllerLoaded = true;
  const s = X.state;

  async function loadCurrent(dir, navId) {
    if (navId !== s.navId) return false;
    const item = X.currentItem();
    if (!item) return false;

    if (item.type === "video" && item.key && (!item.el || !document.contains(item.el))) {
      X.refind(item);
      if ((!item.el || !document.contains(item.el)) && dir !== 0) {
        for (let n = 0; n < 6; n += 1) {
          if (navId !== s.navId) return false;
          window.scrollBy({ top: innerHeight * .7 * dir, behavior: "smooth" });
          await X.sleep(400);
          X.refind(item);
          if (item.el && document.contains(item.el)) break;
        }
      }
    }

    if (navId !== s.navId) return false;
    const ok = item.type === "image" ? await X.moveImage(item) : await X.moveVideo(item);
    if (!ok) return false;
    if (item.type === "image") return true;

    X.playWithRetry(2);
    setTimeout(() => {
      if (!s.player || s.manualPause || navId !== s.navId) return;
      const stalled = s.player.paused && !s.player.ended && s.player.currentTime < .1;
      const noMeta = s.player.readyState < 2 || !Number.isFinite(s.player.duration);
      if ((stalled || noMeta) && s.player.networkState !== 2) {
        X.playWithRetry(1);
        setTimeout(() => {
          if (!s.player || s.manualPause || navId !== s.navId) return;
          if (s.player.paused && !s.player.ended && s.player.currentTime < .1 && s.player.networkState !== 2) {
            void goTo(s.index + (dir >= 0 ? 1 : -1));
          }
        }, 2000);
      }
    }, 4000);
    return true;
  }

  async function goTo(target) {
    const navId = ++s.navId;
    const dir = target > s.index ? 1 : target < s.index ? -1 : 0;
    s.lastDir = dir;
    if (target < 0) target = 0;
    if (target >= s.items.length) {
      X.showToast?.("Finding more media…", 1200);
      const ok = await X.ensureIndex(target, navId);
      if (!ok || navId !== s.navId) {
        X.showToast?.("No more media found yet.", 1500);
        return;
      }
    }
    s.index = target;
    await loadCurrent(dir, navId);
    X.updateCounter();
    X.updateSocial();
    X.showControls?.();
  }

  function key(event) {
    if (!s.overlay) return;
    if (event.code === "Escape") {
      event.preventDefault();
      destroyOverlay();
    } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.code)) {
      event.preventDefault(); void goTo(s.index - 1);
    } else if (["ArrowRight", "ArrowDown", "PageDown"].includes(event.code)) {
      event.preventDefault(); void goTo(s.index + 1);
    } else if (event.code === "Space") {
      event.preventDefault(); s.overlay.querySelector("#xvs-play")?.click();
    } else if (event.code === "KeyM") {
      event.preventDefault(); s.overlay.querySelector("#xvs-mute")?.click();
    } else if (event.code === "KeyL") {
      event.preventDefault(); X.proxySocial?.("like");
    } else if (event.code === "KeyR") {
      event.preventDefault(); X.proxySocial?.("retweet");
    } else if (event.code === "KeyB") {
      event.preventDefault(); X.proxySocial?.("bookmark");
    } else if (event.code === "KeyO") {
      event.preventDefault(); X.openCurrentPost?.();
    }
  }

  function wheel(event) {
    if (!s.overlay) return;
    if (event.target instanceof HTMLElement && event.target.closest("button,input,select,a")) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    clearTimeout(s.wheelResetTimer);
    s.wheelResetTimer = setTimeout(() => {
      s.wheelGestureLocked = false;
      s.wheelDelta = 0;
    }, 190);

    if (s.wheelGestureLocked) return;
    s.wheelDelta += event.deltaY;
    if (Math.abs(s.wheelDelta) < 80) return;

    const direction = s.wheelDelta > 0 ? 1 : -1;
    s.wheelGestureLocked = true;
    s.wheelDelta = 0;
    void goTo(s.index + direction);
  }

  function bindInputs() {
    document.addEventListener("keydown", key, true);
    window.addEventListener("wheel", wheel, { capture: true, passive: false });
  }

  function unbindInputs() {
    document.removeEventListener("keydown", key, true);
    window.removeEventListener("wheel", wheel, true);
    clearTimeout(s.wheelResetTimer);
    s.wheelResetTimer = null;
    s.wheelGestureLocked = false;
  }

  function destroyOverlay() {
    if (!s.overlay) return;
    ++s.navId;
    unbindInputs();
    clearInterval(s.socialTimer);
    clearTimeout(s.toastTimer);
    clearTimeout(s.controlsTimer);
    s.socialTimer = s.toastTimer = s.controlsTimer = null;
    X.clearImageTimers();
    X.detachPlayerEvents();
    try { X.restoreActive(); } catch {}
    s.overlay.remove();
    s.overlay = s.host = s.player = null;
    s.items = [];
    s.index = 0;
    s.manualPause = false;
    s.active = false;
    X.resetSeen();
    X.stopObserver();
  }

  function start(options = {}) {
    if (s.active && s.overlay) {
      return { ok: true, active: true, message: `Slideshow already running with ${s.items.length} item${s.items.length === 1 ? "" : "s"}.` };
    }

    s.active = true;
    s.items = [];
    s.index = 0;
    X.resetSeen();
    s.includeImages = Boolean(options.includeImages);
    const seconds = Number(options.imageIntervalSeconds) || 3;
    s.imageIntervalMs = Math.min(30000, Math.max(1000, seconds * 1000));
    s.muted = true;
    s.volume = .5;
    X.collectMedia();
    X.startObserver();

    if (!s.items.length) {
      (async () => {
        const id = ++s.navId;
        for (let n = 0; n < 3 && !s.items.length; n += 1) {
          await X.attemptLoadMore(n, id);
          X.collectMedia();
        }
        if (id !== s.navId) return;
        if (!s.items.length) {
          s.active = false;
          X.stopObserver();
          alert(s.includeImages ? "No videos or images found on this part of the page." : "No videos found on this part of the page.");
          return;
        }
        X.createOverlay();
        s.index = 0;
        await loadCurrent(0, id);
      })();
      return { ok: false, active: true, message: s.includeImages ? "Looking for videos and images…" : "Looking for videos…" };
    }

    X.createOverlay();
    const id = ++s.navId;
    void loadCurrent(0, id);
    return { ok: true, active: true, message: `Starting with ${s.items.length} item${s.items.length === 1 ? "" : "s"}.` };
  }

  Object.assign(X, { goTo, destroyOverlay, bindInputs });

  browser.runtime.onMessage.addListener(message => {
    if (message?.type === "XVS_PING" || message?.type === "TWITTER_SLIDESHOW_STATUS") {
      const item = X.currentItem();
      return Promise.resolve({
        loaded: true, ok: true, active: s.active && Boolean(s.overlay), itemCount: s.items.length,
        currentIndex: s.index, currentType: item?.type || null, includeImages: s.includeImages,
        imageIntervalSeconds: Math.round(s.imageIntervalMs / 1000), architecture: "chrome-v3-enhanced-port"
      });
    }
    if (message?.type === "STOP_TWITTER_SLIDESHOW") {
      if (s.overlay) destroyOverlay(); else { s.active = false; X.stopObserver(); }
      return Promise.resolve({ ok: true, active: false, message: "Slideshow stopped." });
    }
    if (message?.type === "START_TWITTER_SLIDESHOW") {
      return Promise.resolve(start({ includeImages: message.includeImages, imageIntervalSeconds: message.imageIntervalSeconds }));
    }
    return undefined;
  });
})();