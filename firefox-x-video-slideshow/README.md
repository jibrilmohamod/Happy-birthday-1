# X Video Slideshow for Firefox

A small Firefox WebExtension that turns an X timeline/search/profile page into a video-only slideshow while keeping **X's native video player and controls**.

No replacement player. No injected playback buttons. No custom overlay controls.

## What it does

- Click the extension toolbar button to start or stop slideshow mode.
- Starts from the video tweet nearest the middle of the viewport.
- Skips tweets that do not contain video media.
- Uses X's existing `<video>` element, playback UI, volume, progress bar, fullscreen control, captions, and tweet actions.
- Automatically advances to the next video tweet when the current video ends.
- Scrolls X normally, allowing its infinite timeline to load more tweets.
- Keeps navigation history so moving backward remains usable even when X virtualizes timeline items.

## Keyboard navigation

These shortcuts are intercepted only while slideshow mode is active and while you are not typing into an input/editor:

- `J` or `Arrow Down`: next video
- `K` or `Arrow Up`: previous video
- `Esc`: stop slideshow mode

Space and other playback controls are deliberately left to X.

## Install temporarily in Firefox

1. Download or clone this branch.
2. Open `about:debugging#/runtime/this-firefox` in Firefox.
3. Click **Load Temporary Add-on…**.
4. Select `manifest.json` from this directory.
5. Open `https://x.com`, then click the extension toolbar button.

Temporary extensions remain installed until Firefox restarts.

## Firefox compatibility

This is a Manifest V3 extension targeting Firefox 109+.

Firefox MV3 uses an event-page background script through `background.scripts`, rather than Chrome's service-worker-only model.

## Privacy

The extension does not make network requests, collect analytics, transmit data, or modify tweets. It only reads the X page DOM and scrolls/navigates video tweets locally in the current tab.

## Known limitations

X changes its DOM frequently. The extension intentionally depends on a very small set of stable-ish selectors (`article[data-testid="tweet"]`, status links, `video`, and `data-testid="videoPlayer"`) to reduce breakage.

Firefox/X autoplay policy can occasionally prevent programmatic playback. If that happens, start the video once using X's own play button. Slideshow navigation still works.
