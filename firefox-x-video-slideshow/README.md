# X Media Slideshow for Firefox

A Firefox WebExtension for browsing video and image posts from X/Twitter in a fullscreen media-first interface.

## 0.10.0 clean-room refactor

Version 0.10.0 is an independent rewrite of the extension internals. It keeps the product behavior developed during testing, but replaces the earlier prototype implementation with a Firefox-specific architecture and original UI/code organization.

### Architecture

- `core.js` — scans X/Twitter posts, builds the media catalog, refreshes stale DOM references, observes the feed, and performs conservative on-demand discovery.
- `player.js` — owns the fullscreen overlay, video/image presentation, controls, social-action bridge, timers, and media state.
- `controller.js` — owns session lifecycle, navigation, keyboard/trackpad input, stall handling, and extension messages.
- `popup.html` / `popup.js` — session start/stop and persisted image options.
- `overlay.css` — all fullscreen presentation styling.

### Features

- fullscreen videos and optional images
- feed-order mixed-media catalog
- previous/next by wheel, trackpad, arrow keys, Page Up/Down, or on-screen controls
- video seek, volume, mute, and playback rate
- image auto-advance with configurable duration and pause/seek behavior
- Like, Repost, Bookmark, and Open Post actions bridged to the real X post controls
- one-gesture/one-navigation trackpad handling
- social shortcuts: `L`, `R`, `B`, `O`; `M` mute; `Space` pause; `Esc` exit
- conservative media discovery: the feed is scrolled only when navigation needs more items

### Playback strategy

The current X `<video>` element is temporarily presented in the extension overlay and restored to its original DOM location when moving away or closing the slideshow. Only videos that already expose a usable source and finite duration are admitted to the catalog. The extension does not use a background reload loop.

### Privacy

The extension has no analytics, ads, remote backend, or telemetry. It reads the active X/Twitter page DOM and stores only the user's slideshow preferences through Firefox sync storage.

## Temporary installation

1. Open `about:debugging#/runtime/this-firefox`.
2. Remove older temporary versions.
3. Choose **Load Temporary Add-on…**.
4. Select `manifest.json` from this directory.
5. Reload the X/Twitter tab.
6. Open the extension popup and start the slideshow.

Confirm version **0.10.0** before testing.
