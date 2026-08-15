const includeImagesEl=document.getElementById("includeImages");
const imageIntervalEl=document.getElementById("imageInterval");
const intervalRowEl=document.getElementById("intervalRow");
const toggleEl=document.getElementById("toggle");
const statusEl=document.getElementById("status");
const stateEl=document.getElementById("state");
const stateTextEl=document.getElementById("stateText");
let active=false;
let refreshTimer=null;
function updateIntervalVisibility(){intervalRowEl.classList.toggle("visible",includeImagesEl.checked);}
function setActiveState(value){active=Boolean(value);stateEl.classList.toggle("active",active);stateTextEl.textContent=active?"Running":"Ready";toggleEl.textContent=active?"Stop slideshow":"Start slideshow";toggleEl.classList.toggle("stop",active);includeImagesEl.disabled=active;imageIntervalEl.disabled=active;}
async function saveOptions(){await browser.storage.sync.set({includeImages:includeImagesEl.checked,imageIntervalSeconds:Number(imageIntervalEl.value)||3});}
async function loadOptions(){const options=await browser.storage.sync.get({includeImages:false,imageIntervalSeconds:3});includeImagesEl.checked=Boolean(options.includeImages);imageIntervalEl.value=String(options.imageIntervalSeconds||3);updateIntervalVisibility();}
async function activeTab(){const [tab]=await browser.tabs.query({active:true,currentWindow:true});return tab;}
function isX(url){return /^https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(url||"");}
async function refreshStatus(){const tab=await activeTab();if(!tab?.id||!isX(tab.url)){setActiveState(false);stateTextEl.textContent="Unavailable";toggleEl.disabled=true;statusEl.textContent="Open an X/Twitter tab to use the slideshow.";return;}toggleEl.disabled=false;try{const response=await browser.tabs.sendMessage(tab.id,{type:"TWITTER_SLIDESHOW_STATUS"});setActiveState(response?.active);if(response?.active){const pos=Math.min((response.currentIndex||0)+1,response.itemCount||0);const type=response.currentType?` · ${response.currentType}`:"";statusEl.textContent=`${pos}/${response.itemCount||0}${type} · scroll or arrow keys to navigate.`;}else statusEl.textContent="Ready. Options apply when the slideshow starts.";}catch{setActiveState(false);statusEl.textContent="Reload this X tab once after installing or updating the extension.";}}
includeImagesEl.addEventListener("change",async()=>{updateIntervalVisibility();await saveOptions();});
imageIntervalEl.addEventListener("change",saveOptions);
toggleEl.addEventListener("click",async()=>{const tab=await activeTab();if(!tab?.id)return;toggleEl.disabled=true;try{if(active){const response=await browser.tabs.sendMessage(tab.id,{type:"STOP_TWITTER_SLIDESHOW"});setActiveState(false);statusEl.textContent=response?.message||"Slideshow stopped.";}else{await saveOptions();statusEl.textContent="Collecting media…";const response=await browser.tabs.sendMessage(tab.id,{type:"START_TWITTER_SLIDESHOW",includeImages:includeImagesEl.checked,imageIntervalSeconds:Number(imageIntervalEl.value)||3});setActiveState(response?.active);statusEl.textContent=response?.message||(response?.active?"Slideshow started.":"Could not start slideshow.");}}catch{setActiveState(false);statusEl.textContent="Reload this X tab and try again.";}finally{toggleEl.disabled=false;setTimeout(refreshStatus,350);}});
(async()=>{await loadOptions();await refreshStatus();refreshTimer=setInterval(refreshStatus,800);})();
window.addEventListener("unload",()=>clearInterval(refreshTimer));