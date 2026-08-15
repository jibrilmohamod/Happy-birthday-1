(() => {
  "use strict";

  if (window.__xVideoSlideshowInteractionLoaded) return;
  window.__xVideoSlideshowInteractionLoaded = true;

  const ROOT_ID = "xvs-firefox-root";
  const BADGE_ID = "xvs-firefox-loaded-count";
  const WHEEL_THRESHOLD = 70;
  const WHEEL_COOLDOWN_MS = 380;

  const discovered = new Set();
  let wheelDelta = 0;
  let wheelLockedUntil = 0;
  let scanTimer = null;

  function getStatusKey(tweet) {
    const links = Array.from(tweet.querySelectorAll('a[href*="/status/"]'));
    const link = links.find((item) => /\/status\/\d+/.test(item.getAttribute("href") || ""));
    return link?.getAttribute("href") || null;
  }

  function scanRenderedVideos() {
    for (const tweet of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (!tweet.querySelector("video")) continue;
      const key = getStatusKey(tweet);
      if (key) discovered.add(key);
    }

    updateBadge();
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanRenderedVideos();
    }, 120);
  }

  function updateBadge() {
    const root = document.getElementById(ROOT_ID);
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

  function slideshowActive() {
    return Boolean(document.getElementById(ROOT_ID));
  }

  function sendNavigationKey(direction) {
    const key = direction > 0 ? "ArrowRight" : "ArrowLeft";
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true
    }));
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
