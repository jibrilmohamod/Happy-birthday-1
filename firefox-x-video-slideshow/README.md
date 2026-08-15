# X Video Slideshow for Firefox

Firefox port of the supplied Chrome extension **Twitter Video Slideshow v3.0**.

## v0.8.0

v0.8 expands the v0.7 stability port with the Chrome extension features that were still missing.

### Popup and toggle

Clicking the Firefox toolbar icon now opens a popup rather than immediately toggling playback.

The popup provides:

- **Start Overlay Slideshow / Stop Slideshow**
- **Include images** switch
- image interval selector: 2, 3, 5, 8, or 10 seconds
- current slideshow item count/status

The image settings are stored with Firefox `storage.sync`.

### Videos and images

The slideshow queue can now contain both videos and tweet images.

Images use the same overlay, previous/next navigation, progress bar, pause/resume behavior, and social controls. Image URLs are normalized to the large `twimg.com/media` variant. Images automatically advance after the configured interval.

### Like, Repost, Bookmark

The overlay now contains Like, Repost, and Bookmark controls.

These locate the original tweet article and proxy the action to X's real `data-testid` controls. Repost also handles X's repost confirmation menu. Active liked/reposted/bookmarked state is refreshed from the underlying tweet.

### Chrome-v3 playback model

The stability behavior from v0.7 is retained:

- only fully usable videos enter the queue
- mutation collection is debounced for 2.5 seconds
- only the raw X `<video>` is moved into the overlay
- the previous video is restored before the next is moved
- stale async navigation is cancelled with an incrementing navigation ID
- X is not aggressively background-scrolled while healthy playback is running
- playback is retried briefly before a delayed stall check
- no reload-current-video loop

### Navigation

- wheel / trackpad down: next
- wheel / trackpad up: previous
- Arrow Right / Arrow Down / Page Down: next
- Arrow Left / Arrow Up / Page Up: previous
- Space: play/pause
- Escape: close

### Audio

Like the supplied Chrome v3 extension, playback starts muted for autoplay reliability. Unmuting persists for later videos in the same slideshow session.

## Install temporarily in Firefox

1. Download the `agent/firefox-x-video-slideshow` branch.
2. Open `about:debugging#/runtime/this-firefox`.
3. Remove any older temporary copy of **X Video Slideshow**.
4. Click **Load Temporary Add-on…**.
5. Select `firefox-x-video-slideshow/manifest.json`.
6. Reload the X tab so `core.js`, `player.js`, and `controller.js` load.
7. Click the extension icon. The popup should appear.
8. Optionally enable **Include images** and choose the interval.
9. Click **Start Overlay Slideshow**.

Confirm the extension version is **0.8.0** before testing.

## Privacy

No analytics, remote API calls, tracking, or data upload. The extension operates locally against the active X page.