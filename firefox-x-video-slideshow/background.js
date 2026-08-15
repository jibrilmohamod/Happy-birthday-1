"use strict";

const X_URL = /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i;

async function setActionState(tabId, active, error = false) {
  await browser.action.setBadgeText({
    tabId,
    text: error ? "!" : active ? "ON" : ""
  });

  if (error) {
    await browser.action.setBadgeBackgroundColor({ tabId, color: "#b42318" });
    await browser.action.setTitle({
      tabId,
      title: "X Video Slideshow could not start on this page"
    });
    return;
  }

  if (active) {
    await browser.action.setBadgeBackgroundColor({ tabId, color: "#1d9bf0" });
  }

  await browser.action.setTitle({
    tabId,
    title: active ? "Stop X Video Slideshow" : "Start X Video Slideshow"
  });
}

async function toggleSlideshow(tab) {
  if (!tab.id || !tab.url || !X_URL.test(tab.url)) {
    if (tab.id) await setActionState(tab.id, false, true);
    return;
  }

  let response;

  try {
    response = await browser.tabs.sendMessage(tab.id, { type: "XVS_TOGGLE" });
  } catch {
    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      response = await browser.tabs.sendMessage(tab.id, { type: "XVS_TOGGLE" });
    } catch (error) {
      console.error("X Video Slideshow failed to initialize.", error);
      await setActionState(tab.id, false, true);
      return;
    }
  }

  await setActionState(tab.id, Boolean(response?.active));
}

browser.action.onClicked.addListener((tab) => {
  void toggleSlideshow(tab);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url && X_URL.test(tab.url)) {
    void setActionState(tabId, false);
  }
});
