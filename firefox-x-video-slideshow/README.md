# X Media Slideshow for Firefox

A Firefox WebExtension for browsing video and image posts from X/Twitter in a fullscreen media-first interface.

## 0.11.0

Version 0.11 adds Picture-in-Picture integration and makes the post-action controls substantially more visible without changing the underlying playback/catalog architecture.

### Architecture

- `core.js` — scans X/Twitter posts, builds the media catalog, refreshes stale DOM references, observes the feed, and performs conservative on-demand discovery.
- `player.js` — owns the fullscreen overlay, video/image presentation, controls, social-action bridge, timers, and media state.
- `controller.js` — owns session lifecycle, navigation, keyboard/trackpad input, stall handling, and extension messages.
- `enhancements.js` — Picture-in-Picture integration and action-rail enhancement layer.
- `popup.html` / `popup.js` — session start/stop and persisted slideshow preferences.
- `overlay.css` / `enhancements.css` — fullscreen presentation and persistent action-rail styling.

### Features

- fullscreen videos and optional images
- feed-order mixed-media catalog
- previous/next by wheel, trackpad, arrow keys, Page Up/Down, or on-screen controls
- video seek, volume, mute, and playback rate
- image auto-advance with configurable duration and pause/seek behavior
- prominent, always-visible Like, Repost, Bookmark, and Open Post controls
- distinct active colors for liked, reposted, and bookmarked posts
- Picture-in-Picture button and `P` keyboard shortcut for videos
- optional **Auto Picture-in-Picture** preference when the X tab becomes hidden
- one-gesture/one-navigation trackpad handling
- social shortcuts: `L`, `R`, `B`, `O`; `P` PiP; `M` mute; `Space` pause; `Esc` exit
- conservative media discovery: the feed is scrolled only when navigation needs more items

### Picture-in-Picture

Programmatic Picture-in-Picture is supported on Firefox 153 and newer desktop releases. The overlay provides a visible PiP button and `P` shortcut.

When **Auto Picture-in-Picture** is enabled, the extension uses Firefox's Picture-in-Picture and Media Session hooks plus a tab-visibility fallback to request PiP when the slideshow tab becomes hidden. Browser security rules can still require a direct user activation before a programmatic PiP request is accepted; in that case the extension reports the block when the tab becomes visible again and the user can click the PiP button once.

Images do not enter video Picture-in-Picture mode.

### Playback strategy

The current X `<video>` element is temporarily presented in the extension overlay and restored to its original DOM location and playback properties when moving away or closing the slideshow. Only videos that already expose a usable source and finite duration are admitted to the catalog. The extension does not use a background reload loop.

### Privacy

The extension has no analytics, ads, remote backend, or telemetry. It reads the active X/Twitter page DOM and stores only the user's slideshow preferences through Firefox sync storage.

## Temporary installation

1. Open `about:debugging#/runtime/this-firefox`.
2. Remove older temporary versions.
3. Choose **Load Temporary Add-on…**.
4. Select `manifest.json` from this directory.
5. Reload the X/Twitter tab.
6. Open the extension popup and start the slideshow.

Confirm version **0.11.0** before testing.