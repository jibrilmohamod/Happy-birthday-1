# X Video Slideshow for Firefox

Firefox WebExtension for browsing X/Twitter videos as a fullscreen slideshow.

## v0.2 architecture

The first prototype tried to scroll the normal X feed and was too invisible and fragile. v0.2 takes a different approach.

When slideshow mode starts, the extension finds a real X `<video>` inside a tweet and promotes **X's existing video-player container** to a fixed fullscreen layer. It does not create a second video element and does not replace X's playback controls.

If no video is immediately available, the extension shows a visible fullscreen diagnostic state while it scrolls the underlying X feed looking for one. This means activation can no longer fail silently.

## Controls

- Click the Firefox toolbar button: start or stop slideshow mode
- `Right Arrow` or `J`: next video
- `Left Arrow` or `K`: previous video
- `Esc`: exit slideshow mode

Playback, volume, seeking and the other player interactions remain X's responsibility.

Videos automatically advance when the current X video fires its `ended` event.

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

## What you should see

Immediately after clicking the toolbar button you should see a black fullscreen layer saying **Starting X Video Slideshow…**.

Then one of these happens:

- An X video player becomes fullscreen and keeps X's own controls.
- The diagnostic screen says it is looking for a video while the feed scrolls.
- After the search limit, it explicitly reports that no X video was found.

If none of those three things happens, the failure is in extension activation rather than X video detection.

## Firefox implementation

This is Manifest V3 for Firefox 109+.

The extension uses `activeTab` plus the `scripting` API. The content script is injected directly in response to the toolbar click, rather than depending on a page-load content script.

The Firefox MV3 background remains an event-page script through `background.scripts`.

## Privacy

No analytics, remote API calls, tracking, or data upload. The extension only reads and temporarily styles DOM elements in the active X tab.

## Known limitations

X changes its DOM frequently. v0.2 intentionally uses only a small selector surface: tweet articles, status links, `<video>`, and `data-testid="videoPlayer"`.

X timeline virtualization can unload older tweets while navigating. The extension stores tweet status URLs as navigation history and scrolls the feed to reload them when possible.

Firefox/X autoplay policy can block automatic playback. In that case, use X's own play button on the fullscreen player.
