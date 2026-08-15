const includeImagesEl=document.getElementById('includeImages');
const imageIntervalEl=document.getElementById('imageInterval');
const intervalRowEl=document.getElementById('intervalRow');
const toggleEl=document.getElementById('toggle');
const statusEl=document.getElementById('status');
let active=false;
function updateIntervalVisibility(){intervalRowEl.classList.toggle('visible',includeImagesEl.checked);}
function renderToggle(){toggleEl.textContent=active?'Stop Slideshow':'Start Overlay Slideshow';toggleEl.classList.toggle('stop',active);}
async function saveImageOptions(){await browser.storage.sync.set({includeImages:includeImagesEl.checked,imageIntervalSeconds:Number(imageIntervalEl.value)||3});}
async function loadOptions(){const o=await browser.storage.sync.get({includeImages:false,imageIntervalSeconds:3});includeImagesEl.checked=Boolean(o.includeImages);imageIntervalEl.value=String(o.imageIntervalSeconds||3);updateIntervalVisibility();}
async function activeTab(){const [tab]=await browser.tabs.query({active:true,currentWindow:true});return tab;}
async function refreshStatus(){const tab=await activeTab();if(!tab?.id||!/^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(tab.url||'')){active=false;statusEl.textContent='Open X/Twitter to use the slideshow.';toggleEl.disabled=true;renderToggle();return;}toggleEl.disabled=false;try{const r=await browser.tabs.sendMessage(tab.id,{type:'TWITTER_SLIDESHOW_STATUS'});active=Boolean(r?.active);statusEl.textContent=active?`${r.itemCount||0} item${r.itemCount===1?'':'s'} in slideshow.`:'';}catch{active=false;statusEl.textContent='Reload this X tab once after installing the extension.';}renderToggle();}
includeImagesEl.addEventListener('change',async()=>{updateIntervalVisibility();await saveImageOptions();});
imageIntervalEl.addEventListener('change',saveImageOptions);
toggleEl.addEventListener('click',async()=>{const tab=await activeTab();if(!tab?.id)return;toggleEl.disabled=true;try{if(active){const r=await browser.tabs.sendMessage(tab.id,{type:'STOP_TWITTER_SLIDESHOW'});active=false;statusEl.textContent=r?.message||'Slideshow stopped.';}else{await saveImageOptions();statusEl.textContent='Starting slideshow…';const r=await browser.tabs.sendMessage(tab.id,{type:'START_TWITTER_SLIDESHOW',includeImages:includeImagesEl.checked,imageIntervalSeconds:Number(imageIntervalEl.value)||3});active=Boolean(r?.active)||Boolean(r?.ok);statusEl.textContent=r?.message||(active?'Slideshow started.':'Could not start slideshow.');}}catch{active=false;statusEl.textContent='Reload this X tab and try again.';}finally{toggleEl.disabled=false;renderToggle();}});
(async()=>{await loadOptions();await refreshStatus();})();