(() => {
  "use strict";

  if (window.__xVideoSlideshowLoaded) return;
  window.__xVideoSlideshowLoaded = true;

  const TWEET_SELECTOR = 'article[data-testid="tweet"]';
  const VIDEO_SELECTOR = 'video, [data-testid="videoPlayer"]';
  const SCROLL_STEP = 0.82;
  const LOAD_ATTEMPTS = 14;
  const LOAD_DELAY_MS = 450;

  const state = {
    active: false,
    currentKey: null,
    currentVideo: null,
    history: [],
    historyIndex: -1,
    navigationToken: 0
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function getTweets() {
    return Array.from(document.querySelectorAll(TWEET_SELECTOR));
  }

  function getTweetKey(tweet) {
    const time = tweet.querySelector('a[href*="/status/"] time');
    const timeLink = time?.closest('a[href*="/status/"]');
    const statusLink = timeLink || tweet.querySelector('a[href*="/status/"]');
    return statusLink?.getAttribute("href") || null;
  }

  function getTweetVideo(tweet) {
    return tweet?.querySelector("video") || null;
  }

  function isVideoTweet(tweet) {
    return Boolean(tweet?.querySelector(VIDEO_SELECTOR));
  }

  function findTweetByKey(key) {
    if (!key) return null;
    return getTweets().find((tweet) => getTweetKey(tweet) === key) || null;
  }

  function getMediaTweets() {
    return getTweets()
      .filter(isVideoTweet)
      .map((tweet) => ({
        tweet,
        key: getTweetKey(tweet),
        rect: tweet.getBoundingClientRect()
      }))
      .filter((item) => item.key)
      .sort((a, b) => a.rect.top - b.rect.top);
  }

  function pickInitialTweet() {
    const center = window.innerHeight / 2;
    const media = getMediaTweets();
    if (!media.length) return null;

    const visible = media.filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight);
    const pool = visible.length ? visible : media;

    return pool.reduce((best, item) => {
      const itemCenter = item.rect.top + item.rect.height / 2;
      const bestCenter = best.rect.top + best.rect.height / 2;
      return Math.abs(itemCenter - center) < Math.abs(bestCenter - center) ? item : best;
    }).tweet;
  }

  function stopWatchingVideo() {
    if (!state.currentVideo) return;
    state.currentVideo.removeEventListener("ended", onVideoEnded);
    state.currentVideo = null;
  }

  function watchVideo(video) {
    stopWatchingVideo();
    if (!video) return;
    state.currentVideo = video;
    video.addEventListener("ended", onVideoEnded, { once: true });
  }

  async function focusTweet(tweet, { record = true } = {}) {
    if (!state.active || !tweet) return false;

    const key = getTweetKey(tweet);
    if (!key) return false;

    tweet.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(300);

    if (!state.active) return false;

    state.currentKey = key;

    if (record) {
      if (state.history[state.historyIndex] !== key) {
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(key);
        state.historyIndex = state.history.length - 1;
      }
    }

    const refreshedTweet = findTweetByKey(key) || tweet;
    const video = getTweetVideo(refreshedTweet);
    watchVideo(video);

    if (video) {
      try {
        await video.play();
      } catch {
        // Respect Firefox/X autoplay policy. The user can start playback with X's native control.
      }
    }

    return true;
  }

  function candidateInLoadedDom(direction) {
    const media = getMediaTweets();
    if (!media.length) return null;

    const currentTweet = findTweetByKey(state.currentKey);

    if (currentTweet) {
      const currentTop = currentTweet.getBoundingClientRect().top;
      const candidates = media.filter(({ key, rect }) => {
        if (key === state.currentKey) return false;
        return direction > 0 ? rect.top > currentTop + 4 : rect.top < currentTop - 4;
      });

      if (direction > 0) {
        return candidates.find(({ key }) => !state.history.includes(key))?.tweet || candidates[0]?.tweet || null;
      }

      return candidates.at(-1)?.tweet || null;
    }

    const center = window.innerHeight / 2;
    if (direction > 0) {
      return media.find(({ key, rect }) => rect.top > center && !state.history.includes(key))?.tweet || null;
    }

    return [...media].reverse().find(({ rect }) => rect.bottom < center)?.tweet || null;
  }

  async function locateByHistory(key, direction, token) {
    for (let attempt = 0; attempt < LOAD_ATTEMPTS && state.active && token === state.navigationToken; attempt += 1) {
      const existing = findTweetByKey(key);
      if (existing) return existing;

      window.scrollBy({
        top: direction * window.innerHeight * SCROLL_STEP,
        behavior: "smooth"
      });
      await sleep(LOAD_DELAY_MS);
    }

    return null;
  }

  async function locateNewVideo(direction, token) {
    for (let attempt = 0; attempt < LOAD_ATTEMPTS && state.active && token === state.navigationToken; attempt += 1) {
      const candidate = candidateInLoadedDom(direction);
      if (candidate) return candidate;

      window.scrollBy({
        top: direction * window.innerHeight * SCROLL_STEP,
        behavior: "smooth"
      });
      await sleep(LOAD_DELAY_MS);
    }

    return candidateInLoadedDom(direction);
  }

  async function move(direction) {
    if (!state.active) return;

    const token = ++state.navigationToken;
    stopWatchingVideo();

    if (direction < 0 && state.historyIndex > 0) {
      const targetIndex = state.historyIndex - 1;
      const targetKey = state.history[targetIndex];
      const tweet = await locateByHistory(targetKey, -1, token);
      if (!tweet || token !== state.navigationToken) return;
      state.historyIndex = targetIndex;
      await focusTweet(tweet, { record: false });
      return;
    }

    if (direction > 0 && state.historyIndex < state.history.length - 1) {
      const targetIndex = state.historyIndex + 1;
      const targetKey = state.history[targetIndex];
      const tweet = await locateByHistory(targetKey, 1, token);
      if (!tweet || token !== state.navigationToken) return;
      state.historyIndex = targetIndex;
      await focusTweet(tweet, { record: false });
      return;
    }

    const candidate = await locateNewVideo(direction, token);
    if (!candidate || token !== state.navigationToken) return;

    if (direction < 0) {
      const key = getTweetKey(candidate);
      if (key && !state.history.includes(key)) {
        state.history.unshift(key);
        state.historyIndex += 1;
      }
    }

    await focusTweet(candidate, { record: direction > 0 });
  }

  function onVideoEnded() {
    if (state.active) void move(1);
  }

  function isTypingTarget(target) {
    return target instanceof HTMLElement && (
      target.matches("input, textarea, select") ||
      target.isContentEditable ||
      Boolean(target.closest('[contenteditable="true"]'))
    );
  }

  function onKeyDown(event) {
    if (!state.active || event.defaultPrevented || isTypingTarget(event.target)) return;

    const key = event.key.toLowerCase();

    if (key === "j" || key === "arrowdown") {
      event.preventDefault();
      event.stopPropagation();
      void move(1);
      return;
    }

    if (key === "k" || key === "arrowup") {
      event.preventDefault();
      event.stopPropagation();
      void move(-1);
      return;
    }

    if (key === "escape") {
      deactivate();
    }
  }

  async function activate() {
    if (state.active) return;

    state.active = true;
    state.navigationToken += 1;
    document.addEventListener("keydown", onKeyDown, true);

    let initial = pickInitialTweet();
    if (!initial) {
      initial = await locateNewVideo(1, state.navigationToken);
    }

    if (initial && state.active) {
      await focusTweet(initial);
    }
  }

  function deactivate() {
    if (!state.active) return;

    state.active = false;
    state.navigationToken += 1;
    stopWatchingVideo();
    document.removeEventListener("keydown", onKeyDown, true);
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== "XVS_TOGGLE") return undefined;

    if (state.active) {
      deactivate();
    } else {
      void activate();
    }

    return Promise.resolve({ active: state.active });
  });
})();
