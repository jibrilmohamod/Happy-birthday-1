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

async function ensureContentScript(tabId) {
  try {
    const ping = await browser.tabs.sendMessage(tabId, { type: "XVS_PING" });
    if (ping?.loaded) return true;
  } catch {
    // Expected on the first click in a tab.
  }

  await browser.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });

  const ping = await browser.tabs.sendMessage(tabId, { type: "XVS_PING" });
  return Boolean(ping?.loaded);
}

async function toggleSlideshow(tab) {
  if (!tab.id || !tab.url || !X_URL.test(tab.url)) {
    if (tab.id) await setActionState(tab.id, false, true);
    return;
  }

  try {
    const ready = await ensureContentScript(tab.id);
    if (!ready) throw new Error("Content script did not respond after injection.");

    const response = await browser.tabs.sendMessage(tab.id, { type: "XVS_TOGGLE" });
    await setActionState(tab.id, Boolean(response?.active));
  } catch (error) {
    console.error("X Video Slideshow failed to initialize.", error);
    await setActionState(tab.id, false, true);
  }
}

browser.action.onClicked.addListener((tab) => {
  void toggleSlideshow(tab);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url && X_URL.test(tab.url)) {
    void setActionState(tabId, false);
  }
});
