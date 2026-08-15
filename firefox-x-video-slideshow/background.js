"use strict";

const X_URL = /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i;

async function setState(tabId, active, error = false) {
  await browser.action.setBadgeText({ tabId, text: error ? "!" : active ? "ON" : "" });
  if (error) {
    await browser.action.setBadgeBackgroundColor({ tabId, color: "#b42318" });
    await browser.action.setTitle({ tabId, title: "X Video Slideshow could not start here" });
    return;
  }
  if (active) await browser.action.setBadgeBackgroundColor({ tabId, color: "#1d9bf0" });
  await browser.action.setTitle({ tabId, title: active ? "Stop X Video Slideshow" : "Start X Video Slideshow" });
}

browser.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url || !X_URL.test(tab.url)) {
    if (tab.id) await setState(tab.id, false, true);
    return;
  }
  try {
    const response = await browser.tabs.sendMessage(tab.id, { type: "XVS_TOGGLE" });
    await setState(tab.id, Boolean(response?.active), !response);
  } catch (error) {
    console.error("X Video Slideshow toggle failed", error);
    await setState(tab.id, false, true);
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url && X_URL.test(tab.url)) void setState(tabId, false);
});
