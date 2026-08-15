# X Video Slideshow for Firefox

Firefox WebExtension for browsing X/Twitter videos as a fullscreen slideshow while keeping X's own video player controls.

## v0.4.2 sound autoplay fix

Firefox treats script-started media with sound differently from muted media. A wheel event does not count as a user-activation event, so wheel-only navigation cannot reliably authorize audible autoplay by itself.

The extension now detects the specific failure where a newly opened unmuted video starts and then pauses immediately. When that happens, a small **Enable sound autoplay** button appears in the fullscreen overlay.

Clicking that button calls `video.play()` during a real trusted pointer event. That gives the X page the user activation Firefox expects for audible playback. If Firefox still blocks sound autoplay after repeated attempts, the button tells you to allow **Audio and Video** autoplay for `x.com` in Firefox's site permissions.

The stable v0.3 player runtime remains unchanged.

## Stability

v0.4.0 tried to keep a video buffer filled by continuously scrolling the same X tab that was also playing the fullscreen video. That interfered with X's virtualized timeline, caused repeated loading, and could break autoplay/player state.

That background scrolling has been removed entirely. The active playback tab stays still while the current video is playing. X is only scrolled when you actually navigate to another video or when the extension needs to locate the first video.

## Navigation

- Mouse wheel / trackpad scroll down: next video
- Mouse wheel / trackpad scroll up: previous video
- `Arrow Right` or `J`: next video
- `Arrow Left` or `K`: previous video
- `Esc`: exit slideshow mode
- Firefox toolbar button: start or stop slideshow mode

Wheel handling lives in a separate interaction script so it cannot alter the player lifecycle.

Videos automatically advance when the current X video fires its `ended` event.

## Loaded-video count

The top-right badge shows how many unique video tweets X has actually rendered during the current page session, for example:

`7 loaded`

This counter is passive. It observes X's DOM and never scrolls the feed or triggers loading by itself.

## Fullscreen player

The extension uses the real X `data-testid="videoPlayer"` DOM node. It temporarily moves that player into a top-level fullscreen shell, preserving X's existing playback UI instead of creating a replacement video element.

Before switching videos, the current player is restored to its original DOM position. Navigation is serialized so overlapping moves cannot corrupt player state.

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

The extension uses `activeTab` and `scripting`. `content.js` and the lightweight `interaction.js` layer are injected in response to the toolbar action instead of depending on a page-load content script.

## Privacy

No analytics, remote API calls, tracking, or data upload. The extension only reads X's page DOM and scrolls the active tab when navigation requires another video.
