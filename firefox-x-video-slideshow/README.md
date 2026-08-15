# X Video Slideshow for Firefox

Firefox port of the Chrome extension **Twitter Video Slideshow v3.0**, rebuilt around the actual runtime behavior from the supplied CRX instead of the earlier experimental architectures.

## v0.7.0: Chrome-v3 compatibility baseline

The supplied Chrome CRX showed that the stable design is much more conservative than the previous Firefox experiments.

### What the Chrome build actually does

- Collects only X `<video>` elements that are inside tweet articles.
- Rejects half-ready items until a source is visible and the video has a finite positive duration.
- Deduplicates by tweet/status key, video element and article.
- Debounces mutation-driven collection for 2.5 seconds to avoid reacting to every X DOM mutation.
- Reparents only the raw `<video>` element into its overlay, never the whole X `videoPlayer` tree.
- Restores the previous raw video to its original parent before moving the next one.
- Uses a monotonically increasing navigation ID so stale async next/previous operations cannot overwrite newer navigation.
- Does not continuously scroll X while healthy playback is running. Loading-more attempts normally stop while the current video is actively playing and become more aggressive only when navigation actually needs another item.
- Retries `play()` briefly instead of remounting the player.
- Waits several seconds before deciding a video is genuinely stalled, then skips it rather than entering a reload loop.

v0.7.0 ports that stability model to Firefox.

## Firefox-specific changes

- Uses `browser.*` APIs.
- The content script is declared in `manifest.json` and loads at `document_idle`, like the Chrome original, instead of being dynamically injected on every toolbar click.
- The Firefox toolbar button toggles the slideshow directly.
- Mouse wheel / trackpad navigation is added:
  - scroll down: next video
  - scroll up: previous video
- Arrow Left / Right and Space remain available.

## Audio

The Chrome v3 source intentionally starts **muted** with its volume slider at zero. v0.7.0 matches that baseline because this is part of its autoplay stability strategy.

Unmute once in the overlay and the chosen state persists across later videos in the same slideshow session.

This is deliberate: earlier Firefox builds tried to force audible autoplay from the start and repeatedly hit Firefox autoplay/pause behavior.

## Loading behavior

The count shows the current playlist position and the number of videos actually collected, for example `2/5`.

Unlike the earlier Firefox buffer experiments, v0.7 does not run a constant hidden-scroll loop while the current video is playing. It loads more when navigation reaches the end of the collected list, which is how the supplied Chrome v3 runtime avoids fighting X's virtualized feed.

## Install temporarily in Firefox

1. Download the `agent/firefox-x-video-slideshow` branch.
2. Open `about:debugging#/runtime/this-firefox`.
3. Remove any older temporary copy of **X Video Slideshow**.
4. Click **Load Temporary Add-on…**.
5. Select `firefox-x-video-slideshow/manifest.json`.
6. Reload `https://x.com` so the declarative content script loads.
7. Navigate to a feed, profile, search, or Media page containing video.
8. Click the extension toolbar button.

Confirm the extension version is **0.7.0** before testing.

## Privacy

No analytics, remote API calls, tracking, or data upload. The extension operates on the active X page only.
