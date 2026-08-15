"use strict";

const ui = {
  button: document.querySelector('#toggle'),
  autoPip: document.querySelector('#autoPip'),
  includeImages: document.querySelector('#includeImages'),
  interval: document.querySelector('#imageInterval'),
  intervalRow: document.querySelector('#intervalRow'),
  status: document.querySelector('#status'),
  session: document.querySelector('#session'),
};

let active = false;

function showInterval() {
  ui.intervalRow.hidden = !ui.includeImages.checked;
}

async function activeXTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(tab.url || '')) return null;
  return tab;
}

async function loadPreferences() {
  const values = await browser.storage.sync.get({
    autoPictureInPicture: true,
    includeImages: false,
    imageIntervalSeconds: 3,
  });
  ui.autoPip.checked = values.autoPictureInPicture !== false;
  ui.includeImages.checked = Boolean(values.includeImages);
  ui.interval.value = String(values.imageIntervalSeconds || 3);
  showInterval();
}

async function savePreferences() {
  await browser.storage.sync.set({
    autoPictureInPicture: ui.autoPip.checked,
    includeImages: ui.includeImages.checked,
    imageIntervalSeconds: Number(ui.interval.value) || 3,
  });
}

function render(status) {
  active = Boolean(status?.active);
  ui.button.textContent = active ? 'Stop slideshow' : 'Start slideshow';
  ui.button.classList.toggle('danger', active);
  ui.includeImages.disabled = active;
  ui.interval.disabled = active;
  ui.session.textContent = active
    ? `${(status.currentIndex || 0) + 1}/${status.itemCount || 0}${status.currentKind ? ` · ${status.currentKind}` : ''}`
    : 'Ready';
}

async function refresh() {
  const tab = await activeXTab();
  if (!tab) {
    ui.button.disabled = true;
    ui.status.textContent = 'Open X/Twitter in the active tab.';
    ui.session.textContent = 'Unavailable';
    return;
  }

  try {
    const status = await browser.tabs.sendMessage(tab.id, { type: 'XMS_STATUS' });
    ui.button.disabled = false;
    ui.status.textContent = '';
    render(status);
  } catch {
    ui.button.disabled = true;
    ui.status.textContent = 'Reload this X tab after installing the extension.';
    ui.session.textContent = 'Unavailable';
  }
}

ui.autoPip.addEventListener('change', savePreferences);
ui.includeImages.addEventListener('change', async () => { showInterval(); await savePreferences(); });
ui.interval.addEventListener('change', savePreferences);
ui.button.addEventListener('click', async () => {
  const tab = await activeXTab();
  if (!tab) return;
  ui.button.disabled = true;
  try {
    if (active) {
      const response = await browser.tabs.sendMessage(tab.id, { type: 'XMS_STOP' });
      render(response);
      ui.status.textContent = response.message || 'Stopped.';
    } else {
      await savePreferences();
      const response = await browser.tabs.sendMessage(tab.id, {
        type: 'XMS_START',
        options: {
          includeImages: ui.includeImages.checked,
          imageIntervalSeconds: Number(ui.interval.value) || 3,
        },
      });
      render(response);
      ui.status.textContent = response.message || (response.ok ? 'Started.' : 'Could not start.');
    }
  } catch {
    ui.status.textContent = 'Reload the X tab and try again.';
  } finally {
    ui.button.disabled = false;
    await refresh();
  }
});

(async () => {
  await loadPreferences();
  await refresh();
})();