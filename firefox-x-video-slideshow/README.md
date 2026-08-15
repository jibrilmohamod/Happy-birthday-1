# X Video Slideshow for Firefox

Firefox WebExtension for browsing X/Twitter videos as a fullscreen slideshow while keeping X's own video player controls.

## v0.4 behavior

The extension now uses a buffered video queue rather than searching only when you ask for the next item.

While a video is playing, the hidden X feed is scanned and advanced in the background to keep up to 12 videos buffered ahead. Every discovered video is stored by its tweet/status URL so the slideshow can move through the loaded set even as X virtualizes its timeline.

The fullscreen overlay includes a live counter such as:

`3 / 11 loaded · 8 ahead · fetching`

The counter shows the current position, total videos discovered in the session, how many are buffered ahead, and whether the extension is currently loading more.

## Navigation

- Mouse wheel / trackpad scroll down: next video
- Mouse wheel / trackpad scroll up: previous video
- `Arrow Down`, `Arrow Right`, `Page Down`, or `J`: next video
- `Arrow Up`, `Arrow Left`, `Page Up`, or `K`: previous video
- `Esc`: exit slideshow mode
- Firefox toolbar button: start or stop slideshow mode

Wheel input uses a threshold and cooldown so one trackpad gesture does not accidentally skip multiple videos.

Videos automatically advance when the current X video fires its `ended` event.

## Buffering model

The extension continuously maintains an ahead buffer instead of scrolling forever. The target is 12 videos ahead.

As you consume videos, the background loader resumes scrolling and scanning X to refill that buffer. This avoids unbounded network and DOM activity while still making the next videos available before you reach them.

If the buffer reaches zero, moving forward shows `Loading more X videos…` and performs an on-demand fetch before giving up.

## Fullscreen player

The extension uses the real X `data-testid="videoPlayer"` DOM node. It temporarily moves that player into a top-level fullscreen shell, preserving X's existing playback UI instead of creating a replacement video element.

Before switching videos, the old player is restored when possible. If X has already virtualized its original tweet away, the stale player is discarded and the next real X player is promoted.

## Install temporarily in Firefox

1. Download the `agent/firefox-x-video-slideshow` branch.
2. Open `about:debugging#/runtime/this-firefox`.
3. Remove any older temporary copy of **X Video Slideshow**.
4. Click **Load Temporary Add-on…**.
5. Select `firefox-x-video-slideshow/manifest.json`.
6. Open or reload `https://x.com`.
7. Navigate to a feed, profile, search, or Media page containing video.
8. Click the extension toolbar button.

Temporary extensions are removed when Firefox restarts.

## Firefox implementation

Manifest V3 for Firefox 109+.

The extension uses `activeTab` and `scripting`. `content.js` is injected in response to the toolbar action instead of depending on a page-load content script.

## Privacy

No analytics, remote API calls, tracking, or data upload. The extension only reads X's page DOM and programmatically scrolls the active X tab to discover additional videos.
