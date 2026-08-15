"use strict";

browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await browser.tabs.sendMessage(tab.id, { type: "XVS_TOGGLE" });
  } catch (error) {
    console.debug("X Video Slideshow is only available on x.com or twitter.com.", error);
  }
});
