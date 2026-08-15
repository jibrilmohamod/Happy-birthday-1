(() => {
  "use strict";

  if (window.__xVideoSlideshowInteractionLoaded) return;
  window.__xVideoSlideshowInteractionLoaded = true;

  const ROOT_ID = "xvs-firefox-root";
  const BADGE_ID = "xvs-firefox-loaded-count";
  const SOUND_GATE_ID = "xvs-firefox-sound-gate";
  const WHEEL_THRESHOLD = 70;
  const WHEEL_COOLDOWN_MS = 380;
  const EARLY_PAUSE_WINDOW_MS = 2200;

  const discovered = new Set();
  let wheelDelta = 0;
  let wheelLockedUntil = 0;
  let scanTimer = null;
  let overlayTimer = null;
  let watchedVideo = null;
  let watchedAt = 0;
  let blockedAttempts = 0;

  function getStatusKey(tweet) {
    const links = Array.from(tweet.querySelectorAll('a[href*="/status/"]'));
    const link = links.find((item) => /\/status\/\d+/.test(item.getAttribute("href") || ""));
    return link?.getAttribute("href") || null;
  }

  function getRoot() {
    return document.getElementById(ROOT_ID);
  }

  function getOverlayVideo() {
    return getRoot()?.querySelector("video") || null;
  }

  function scanRenderedVideos() {
    for (const tweet of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (!tweet.querySelector("video")) continue;
      const key = getStatusKey(tweet);
      if (key) discovered.add(key);
    }

    updateBadge();
    watchOverlayVideo();
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanRenderedVideos();
    }, 120);
  }

  function scheduleOverlayCheck(delay = 180) {
    if (overlayTimer) clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => {
      overlayTimer = null;
      watchOverlayVideo();
      checkForBlockedAudiblePlayback();
    }, delay);
  }

  function updateBadge() {
    const root = getRoot();
    if (!root) return;

    let badge = document.getElementById(BADGE_ID);
    if (!badge) {
      badge = document.createElement("div");
      badge.id = BADGE_ID;
      Object.assign(badge.style, {
        position: "absolute",
        top: "18px",
        right: "18px",
        zIndex: "2147483647",
        padding: "8px 11px",
        borderRadius: "999px",
        background: "rgba(32,35,39,.86)",
        color: "#fff",
        font: "600 13px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
        pointerEvents: "none",
        backdropFilter: "blur(8px)"
      });
      root.appendChild(badge);
    }

    badge.textContent = `${discovered.size} loaded`;
  }

  function ensureSoundGate() {
    const root = getRoot();
    if (!root) return null;

    let gate = document.getElementById(SOUND_GATE_ID);
    if (gate) return gate;

    gate = document.createElement("button");
    gate.id = SOUND_GATE_ID;
    gate.type = "button";
    gate.textContent = "Enable sound autoplay";
    Object.assign(gate.style, {
      position: "absolute",
      top: "62px",
      left: "50%",
      zIndex: "2147483647",
      transform: "translateX(-50%)",
      padding: "10px 15px",
      border: "1px solid rgba(255,255,255,.18)",
      borderRadius: "999px",
      background: "rgba(29,155,240,.96)",
      color: "#fff",
      font: "700 14px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
      cursor: "pointer",
      boxShadow: "0 4px 18px rgba(0,0,0,.35)"
    });

    gate.addEventListener("pointerdown", onSoundGatePointerDown, true);
    gate.addEventListener("keydown", onSoundGateKeyDown, true);
    root.appendChild(gate);
    return gate;
  }

  function showSoundGate(message = "Enable sound autoplay") {
    const gate = ensureSoundGate();
    if (!gate) return;
    gate.textContent = message;
    gate.style.display = "block";
  }

  function hideSoundGate() {
    const gate = document.getElementById(SOUND_GATE_ID);
    if (gate) gate.style.display = "none";
  }

  function attemptAudiblePlay() {
    const video = getOverlayVideo();
    if (!video) return;

    video.muted = false;
    const result = video.play();

    Promise.resolve(result).then(() => {
      blockedAttempts = 0;
      hideSoundGate();
    }).catch((error) => {
      blockedAttempts += 1;
      console.debug("X Video Slideshow: audible playback remained blocked", error);
      showSoundGate(
        blockedAttempts > 1
          ? "Firefox is blocking sound autoplay. Allow Audio and Video for x.com"
          : "Enable sound autoplay"
      );
    });
  }

  function onSoundGatePointerDown(event) {
    if (!event.isTrusted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    attemptAudiblePlay();
  }

  function onSoundGateKeyDown(event) {
    if (!event.isTrusted || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    attemptAudiblePlay();
  }

  function checkForBlockedAudiblePlayback() {
    const video = getOverlayVideo();
    if (!video || video !== watchedVideo) return;

    if (video.muted || video.volume === 0 || !video.paused) {
      hideSoundGate();
      return;
    }

    if (performance.now() - watchedAt <= EARLY_PAUSE_WINDOW_MS) {
      showSoundGate();
    }
  }

  function watchOverlayVideo() {
    const video = getOverlayVideo();
    if (video === watchedVideo) return;

    if (watchedVideo) {
      watchedVideo.removeEventListener("playing", onOverlayPlaying);
      watchedVideo.removeEventListener("pause", onOverlayPause);
      watchedVideo.removeEventListener("volumechange", onOverlayVolumeChange);
    }

    watchedVideo = video;
    watchedAt = performance.now();
    hideSoundGate();

    if (!video) return;

    video.addEventListener("playing", onOverlayPlaying);
    video.addEventListener("pause", onOverlayPause);
    video.addEventListener("volumechange", onOverlayVolumeChange);
    scheduleOverlayCheck(500);
  }

  function onOverlayPlaying() {
    hideSoundGate();
  }

  function onOverlayPause() {
    scheduleOverlayCheck(40);
  }

  function onOverlayVolumeChange() {
    if (watchedVideo?.muted || watchedVideo?.volume === 0) {
      hideSoundGate();
    }
  }

  function slideshowActive() {
    return Boolean(getRoot());
  }

  function sendNavigationKey(direction) {
    const key = direction > 0 ? "ArrowRight" : "ArrowLeft";
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true
    }));
    scheduleOverlayCheck(650);
  }

  function onWheel(event) {
    if (!slideshowActive()) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const now = performance.now();
    if (now < wheelLockedUntil) return;

    wheelDelta += event.deltaY;
    if (Math.abs(wheelDelta) < WHEEL_THRESHOLD) return;

    const direction = wheelDelta > 0 ? 1 : -1;
    wheelDelta = 0;
    wheelLockedUntil = now + WHEEL_COOLDOWN_MS;
    sendNavigationKey(direction);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  scanRenderedVideos();
})();
