# X Video Slideshow for Firefox

Firefox WebExtension for browsing X/Twitter videos in a standalone fullscreen wrapper.

## v0.5.0: standalone wrapper

v0.5 removes the previous approach of promoting X's `data-testid="videoPlayer"` container. The extension now owns the fullscreen shell and uses only the raw X `<video>` element as the media source.

When a video opens, the extension temporarily moves that `<video>` element into its own top-level overlay and enables Firefox's native HTML video controls. X's surrounding React player, layout containers and custom playback controls are no longer part of the fullscreen player.

This avoids the transformed-container positioning bug and removes most of the player state that X was able to break while navigating.

## Sound and autoplay

Firefox can block script-started audible media until the page has user activation. If audible playback is not already allowed, v0.5 shows a one-time **Start slideshow with sound** button.

After that real click, subsequent wheel/keyboard navigation reuses the page's sticky user activation. If X itself tries to pause the detached video without a recent user pause, the wrapper automatically resumes it.

Muted videos continue to start without the sound gate when Firefox permits muted autoplay.

## Continuous discovery

The X feed is now used only as a discovery layer behind the wrapper.

- The extension keeps an ordered catalog of video tweet/status URLs.
- It continuously scrolls the hidden feed until it has up to 8 videos discovered ahead of the current video.
- The loader backs off after repeated scans with no new videos instead of showing an endless loading loop.
- The top-right badge shows the current position, total discovered videos, videos ahead, and whether discovery is fetching or waiting.

Example:

`3/11 loaded · 8 ahead · fetching`

If X virtualizes or empties the detached video while discovery is running, the extension remembers the tweet key and playback time, reloads the tweet, and attempts to resume the current video.

## Navigation

- Mouse wheel / trackpad scroll down: next video
- Mouse wheel / trackpad scroll up: previous video
- `Arrow Down`, `Arrow Right`, `Page Down`, or `J`: next video
- `Arrow Up`, `Arrow Left`, `Page Up`, or `K`: previous video
- `Esc`: exit slideshow mode
- Firefox toolbar button: start or stop slideshow mode

The current video automatically advances when it ends.

## Player controls

The fullscreen video uses Firefox's native `<video controls>` UI for:

- play/pause
- seeking
- volume/mute
- fullscreen/native media controls

The wrapper preserves the chosen mute state, volume, and playback rate when moving between videos.

## Install temporarily in Firefox

1. Download the `agent/firefox-x-video-slideshow` branch.
2. Open `about:debugging#/runtime/this-firefox`.
3. Remove any older temporary copy of **X Video Slideshow**.
4. Click **Load Temporary Add-on…**.
5. Select `firefox-x-video-slideshow/manifest.json`.
6. Open or reload `https://x.com`.
7. Open a feed, profile, search, or Media page containing video.
8. Click the extension toolbar button.

Confirm the extension version is **0.5.0** before testing.

Temporary extensions are removed when Firefox restarts.

## Firefox implementation

Manifest V3 for Firefox 109+ using `activeTab`, `scripting`, `action.onClicked`, and Firefox's `background.scripts` event-page model.

`content.js` is injected on demand when the toolbar button is clicked. v0.5 no longer has a separate `interaction.js` layer.

## Privacy

No analytics, remote API calls, tracking, or data upload. The extension only reads and temporarily rearranges X page DOM in the active tab and scrolls the feed locally to discover more videos.
