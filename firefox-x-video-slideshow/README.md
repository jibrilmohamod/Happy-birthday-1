# X Video Slideshow for Firefox

Firefox port of the supplied Chrome extension **Twitter Video Slideshow v3.0**.

## v0.9.0

v0.9 keeps the Chrome-derived playback lifecycle from v0.8, but improves queue ordering, controls, social actions, popup state, and trackpad behavior.

### What changed

- **Mixed media stays in X feed order.** Videos and tweet images are collected article-by-article instead of appending all videos first and all images afterward.
- **One wheel/trackpad gesture = one navigation.** Momentum no longer causes accidental multi-skip after a fixed cooldown.
- **Polished overlay controls.** Proper icon buttons, auto-hiding control bar, large side navigation targets, a compact speed menu, media-type badge, and current/total counter.
- **Better social actions.** Like, Repost, and Bookmark disable when the original X action is unavailable, repost confirmation is polled instead of guessed with a fixed delay, and actions show feedback toasts.
- **Open post.** The overlay can open the current X post directly.
- **Keyboard actions.** `L` Like, `R` Repost, `B` Bookmark, `O` open post, and `M` mute, in addition to the existing navigation/play keys.
- **Improved popup.** Live Running/Ready state, current media position/type, a cleaner Start/Stop button, and options locked while a session is active so it is clear when they apply.

### Playback stability retained

The timing/lifecycle decisions reverse-engineered from the supplied Chrome v3 CRX remain intact:

- only fully usable videos enter the queue
- mutation collection is debounced for 2.5 seconds
- only the raw X `<video>` is moved into the overlay
- the previous video is restored before the next is moved
- stale async navigation is cancelled with an incrementing navigation ID
- X is not aggressively background-scrolled while healthy playback is running
- playback gets short retry nudges plus a delayed stall check
- there is no reload-current-video loop

### Images

Enable **Include images** in the popup and choose 2, 3, 5, 8, or 10 seconds per image. Images participate in the same queue, feed ordering, navigation, progress, pause/resume, and social controls as videos.

### Navigation

- wheel / trackpad down: next
- wheel / trackpad up: previous
- Arrow Right / Arrow Down / Page Down: next
- Arrow Left / Arrow Up / Page Up: previous
- Space: play/pause
- `M`: mute
- `L`: Like
- `R`: Repost
- `B`: Bookmark
- `O`: open current post
- Escape: close

### Audio

Like the supplied Chrome v3 extension, playback starts muted for autoplay reliability. Unmuting persists for later videos in the same slideshow session.

## Install temporarily in Firefox

1. Download the `agent/firefox-x-video-slideshow` branch.
2. Open `about:debugging#/runtime/this-firefox`.
3. Remove any older temporary copy of **X Video Slideshow**.
4. Click **Load Temporary Add-on…**.
5. Select `firefox-x-video-slideshow/manifest.json`.
6. Reload the X tab so the content scripts and `overlay.css` load.
7. Click the extension icon, choose media options, then **Start slideshow**.

Confirm the extension version is **0.9.0** before testing.

## Privacy

No analytics, remote API calls, tracking, or data upload. The extension operates locally against the active X page.