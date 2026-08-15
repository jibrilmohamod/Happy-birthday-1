# X Video Slideshow for Firefox

Firefox WebExtension for browsing X/Twitter videos in a standalone fullscreen wrapper.

## v0.6.1: capture wrapper

v0.6.1 removes the remaining dependency on moving X's `<video>` element out of its React-owned DOM tree.

The X video now stays exactly where X rendered it. The extension uses Firefox `HTMLMediaElement.captureStream()` (with the Firefox-prefixed fallback when needed) to feed one persistent extension-owned fullscreen video element.

This removes the v0.5 failure where X noticed the detached source, emptied/recreated it, and triggered repeated `Reloading current video…` recovery cycles and stutter.

## Stability changes

- No source-video reparenting.
- No `Reloading current video…` recovery loop.
- No background scrolling or prefetch timer while a video is playing.
- X is only scrolled when you explicitly navigate or when the first video must be located.
- A failed next/previous lookup performs one rollback attempt to the previous video instead of looping.
- The currently rendered X source is muted only at its physical output. The captured stream still carries its audio according to the capture-from-element specification.

## Sound

The wrapper output starts with:

- sound **on**
- volume **100%**
- playback rate **1x**

The X source video itself is muted to prevent duplicate audio. Muting the source element does not mute captured audio.

If Firefox's autoplay policy blocks the extension-owned audible output, a **Start with sound** button appears. Clicking it is only needed when Firefox requires a real page activation for audible media.

Mute and volume changes made in the wrapper are preserved while moving between videos during the same slideshow session.

## Wrapper controls

The extension now owns its playback controls:

- play / pause
- mute / sound
- volume
- seek bar and elapsed/duration time
- playback rate from 0.5x to 2x

The seek bar controls the real X source video's `currentTime`; the fullscreen display is only the captured presentation layer.

## Navigation

- Mouse wheel / trackpad scroll down: next video
- Mouse wheel / trackpad scroll up: previous video
- `Arrow Down`, `Arrow Right`, `Page Down`, or `J`: next video
- `Arrow Up`, `Arrow Left`, `Page Up`, or `K`: previous video
- `Esc`: exit slideshow mode
- Firefox toolbar button: start or stop slideshow mode

The current video automatically moves forward when the real X source reaches `ended`.

## Video count

The top-right badge shows the current position and how many unique video tweets X has actually rendered during the session, for example:

`2/5 seen`

The counter is passive. v0.6.1 intentionally does not scroll X in the background just to increase the count, because doing that while playback is active was the main source of virtualization and stuttering failures in previous builds.

## Install temporarily in Firefox

1. Download the `agent/firefox-x-video-slideshow` branch.
2. Open `about:debugging#/runtime/this-firefox`.
3. Remove any older temporary copy of **X Video Slideshow**.
4. Click **Load Temporary Add-on…**.
5. Select `firefox-x-video-slideshow/manifest.json`.
6. Open or reload `https://x.com`.
7. Open a feed, profile, search, or Media page containing video.
8. Click the extension toolbar button.

Confirm the extension version is **0.6.1** before testing.

Temporary extensions are removed when Firefox restarts.

## Firefox implementation

Manifest V3 for Firefox 109+ using `activeTab`, `scripting`, `action.onClicked`, and Firefox's `background.scripts` event-page model.

`content.js` is injected on demand when the toolbar button is clicked. There is no separate interaction layer.

## Privacy

No analytics, remote API calls, tracking, or data upload. The extension only reads X's page DOM, captures the currently rendered X media element locally, and scrolls the active X tab when navigation requires another video.
