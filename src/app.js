import { loadSettings, normalizeSettings, saveSettings } from './core/settings.js';
import { RotationClock, swipeDirection } from './core/rotation.js';
import { FocusTimer } from './core/focus.js';
import { formatDate, escapeHTML } from './core/dom.js';
import { icon } from './ui/icons.js';
import { screens, screenById } from './screens/registry.js';
import { WeatherSource, searchCities } from './data/weather.js';
import { AgentSource } from './data/agents.js';
import { MusicSource } from './data/music.js';

let storage;
try { storage = window.localStorage; } catch { storage = {getItem:()=>null,setItem:()=>{throw new Error('unavailable');}}; }
let settings = loadSettings(storage);
const focus = new FocusTimer(storage), weather = new WeatherSource(), agents = new AgentSource(), music = new MusicSource();
const stage = document.querySelector('#stage'), nav = document.querySelector('#screen-nav'), dialog = document.querySelector('#settings-dialog');
const rotation = new RotationClock(settings.interval*1000,performance.now());
let activeId = settings.enabledScreens.includes(location.hash.slice(1)) ? location.hash.slice(1) : settings.screenOrder.find(id=>settings.enabledScreens.includes(id));
let cleanup = () => {}, transitionTimer, toastTimer, lastStatus = '', pointer = null, wakeLock = null, wakeWanted = false, cityRequest = null;
const context = {settings:()=>settings,focus,weather,agents,music};
const enabled = () => settings.screenOrder.filter(id=>settings.enabledScreens.includes(id));
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function toast(message) { clearTimeout(toastTimer); const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('visible'); toastTimer = setTimeout(()=>node.classList.remove('visible'),3600); }
function renderNav() {
  const ids = enabled();
  nav.innerHTML = ids.map(id => '<button class="nav-item '+(id===activeId?'active':'')+'" data-screen="'+id+'" aria-label="'+screenById.get(id).title+'" '+(id===activeId?'aria-current="page"':'')+'>'+icon(screenById.get(id).icon)+'<span>'+screenById.get(id).title+'</span><i></i></button>').join('');
  document.querySelector('#screen-counter').textContent = String(ids.indexOf(activeId)+1).padStart(2,'0')+' / '+String(ids.length).padStart(2,'0');
}
function mountActive(direction = 0) {
  cleanup(); clearTimeout(transitionTimer);
  const plugin = screenById.get(activeId);
  stage.className = 'stage accent-'+plugin.accent;
  document.documentElement.dataset.accent = plugin.accent;
  stage.innerHTML = '';
  cleanup = plugin.mount(stage,context) || (()=>{});
  stage.setAttribute('aria-label',plugin.title);
  if (!prefersReducedMotion.matches && direction) {
    stage.classList.add(direction > 0 ? 'enter-next':'enter-prev');
    transitionTimer = setTimeout(()=>stage.classList.remove('enter-next','enter-prev'),380);
  }
  history.replaceState(null,'','#'+activeId); renderNav();
}
function interact() { rotation.interact(performance.now(),settings.resumeAfter*1000); }
function go(id, manual = true, direction = 1) {
  if (!enabled().includes(id)) { if (manual) toast('Этот экран скрыт. Включи его в настройках.'); return; }
  if (manual) interact(); else rotation.reset(performance.now());
  if (activeId !== id) { activeId = id; mountActive(direction); }
}
function step(direction, manual = true) {
  const ids = enabled(), index = ids.indexOf(activeId);
  go(ids[(index+direction+ids.length)%ids.length],manual,direction);
}
function persist() {
  settings = normalizeSettings(settings);
  if (!saveSettings(storage,settings)) toast('Браузер не дает сохранить настройки. Они действуют до закрытия страницы.');
  if (!enabled().includes(activeId)) { activeId = enabled()[0]; mountActive(); }
  rotation.configure(settings.interval*1000,performance.now()); renderNav(); updateRotationButton(); updateDim();
}
function updateRotationButton() {
  const button = document.querySelector('#rotation-toggle');
  const label = settings.autoRotate ? 'Приостановить смену экранов' : 'Возобновить смену экранов';
  button.innerHTML = icon(settings.autoRotate?'pause':'play');
  button.setAttribute('aria-label',label); button.title = label; button.setAttribute('aria-pressed',String(!settings.autoRotate));
}
function toggleRotation() { settings.autoRotate = !settings.autoRotate; rotation.resumeAt = 0; persist(); }
function updateDim() { const hour = new Date().getHours(); document.documentElement.classList.toggle('night-dim',settings.dimAtNight && (hour >= 22 || hour < 7)); }
function renderScreenSettings() {
  document.querySelector('#screen-settings').innerHTML = settings.screenOrder.map((id,index) => {
    const on = settings.enabledScreens.includes(id), last = on && settings.enabledScreens.length===1;
    return '<div class="screen-setting"><label><input type="checkbox" data-enable="'+id+'" '+(on?'checked':'')+' '+(last?'disabled':'')+'>'+icon(screenById.get(id).icon)+'<span>'+screenById.get(id).title+'</span></label><div><button class="icon-button small-button" data-move="'+id+'" data-delta="-1" aria-label="'+screenById.get(id).title+': выше" '+(index===0?'disabled':'')+'>'+icon('up')+'</button><button class="icon-button small-button" data-move="'+id+'" data-delta="1" aria-label="'+screenById.get(id).title+': ниже" '+(index===settings.screenOrder.length-1?'disabled':'')+'>'+icon('down')+'</button></div></div>';
  }).join('');
}
function renderCity() {
  document.querySelector('#selected-city').textContent = settings.city ? 'Выбран: '+settings.city.name+(settings.city.country ? ' · '+settings.city.country : '') : 'Город пока не выбран. Данные появятся после настройки.';
  document.querySelector('#city-clear').hidden = !settings.city;
}
function openSettings() {
  for (const [selector,key] of [['auto','autoRotate'],['seconds','showSeconds'],['night','dimAtNight']]) document.querySelector('#setting-'+selector).checked = settings[key];
  document.querySelector('#setting-interval').value = String(settings.interval);
  document.querySelector('#setting-resume').value = String(settings.resumeAfter);
  renderScreenSettings(); renderCity(); dialog.showModal();
}
function closeSettings() { dialog.close(); interact(); }
document.querySelector('#settings-open').addEventListener('click',openSettings);
for (const id of ['settings-close','settings-done']) document.querySelector('#'+id).addEventListener('click',closeSettings);
dialog.addEventListener('close',interact);
dialog.addEventListener('click',e=>{ if (e.target===dialog && e.clientX < dialog.getBoundingClientRect().left) closeSettings(); });
for (const [selector,key] of [['auto','autoRotate'],['seconds','showSeconds'],['night','dimAtNight']]) document.querySelector('#setting-'+selector).addEventListener('change',e=>{settings[key]=e.target.checked;persist();});
document.querySelector('#setting-interval').addEventListener('change',e=>{settings.interval=Number(e.target.value);persist();});
document.querySelector('#setting-resume').addEventListener('change',e=>{settings.resumeAfter=Number(e.target.value);persist();});
document.querySelector('#screen-settings').addEventListener('change',e=>{
  const id=e.target.dataset.enable; if(!id) return;
  settings.enabledScreens=e.target.checked?[...settings.enabledScreens,id]:settings.enabledScreens.filter(x=>x!==id);persist();renderScreenSettings();
});
document.querySelector('#screen-settings').addEventListener('click',e=>{
  const button=e.target.closest('[data-move]');if(!button) return;
  const i=settings.screenOrder.indexOf(button.dataset.move),j=i+Number(button.dataset.delta);
  if(j<0||j>=settings.screenOrder.length)return;
  [settings.screenOrder[i],settings.screenOrder[j]]=[settings.screenOrder[j],settings.screenOrder[i]];
  persist();renderScreenSettings();
});
document.querySelector('#rotation-toggle').addEventListener('click',toggleRotation);
nav.addEventListener('click',e=>{const button=e.target.closest('[data-screen]');if(button)go(button.dataset.screen);});
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();go('overview');});
stage.addEventListener('click',e=>{
  if(e.target.closest('[data-settings]'))openSettings();
  const link=e.target.closest('[data-go]');if(link)go(link.dataset.go);
});
stage.addEventListener('pointerdown',e=>{
  interact();
  if(e.isPrimary===false || e.button>0 || e.target.closest('button,a,input,select,textarea')){pointer=null;return;}
  pointer={x:e.clientX,y:e.clientY,id:e.pointerId};
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointerup',e=>{
  if(!pointer||pointer.id!==e.pointerId)return;
  const direction=swipeDirection(pointer,{x:e.clientX,y:e.clientY});pointer=null;
  if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
  if(direction)step(direction);
});
stage.addEventListener('pointercancel',()=>{pointer=null;});
document.addEventListener('keydown',e=>{
  if(dialog.open||e.target.closest('input,select,textarea,button,a'))return;
  if(e.key==='ArrowRight'){e.preventDefault();step(1);}
  if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}
  if(e.code==='Space'){e.preventDefault();toggleRotation();}
});
function updateFullscreenButton() {
  const button=document.querySelector('#fullscreen-toggle'), active=!!document.fullscreenElement;
  const label=active?'Выйти из полного экрана':'На весь экран';
  button.innerHTML=icon('fullscreen')+(active?'':'<span>На весь экран</span>');
  button.setAttribute('aria-label',label);button.title=label;button.setAttribute('aria-pressed',String(active));
}
document.querySelector('#fullscreen-toggle').addEventListener('click',async()=>{
  interact();
  try {
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});
    else toast('Этот браузер не поддерживает полный экран. Открой панель в другом браузере или киоск-режиме.');
  } catch { toast('Браузер не разрешил полный экран. Попробуй открыть панель в другом браузере.'); }
  updateFullscreenButton();
});
document.addEventListener('fullscreenchange',updateFullscreenButton);
async function requestWake() {
  if(!navigator.wakeLock){toast('В этом браузере используй настройку «Не выключать экран» или киоск-режим.');return;}
  if(!window.isSecureContext){toast('Для этой функции браузеру нужен HTTPS. В локальной сети используй киоск-режим.');return;}
  try {
    wakeLock=await navigator.wakeLock.request('screen');
    document.querySelector('#wake-lock').textContent='Экран остается включенным';
    document.querySelector('#wake-note').textContent='Работает, пока панель открыта и браузер разрешает удержание экрана.';
    wakeLock.addEventListener('release',()=>{wakeLock=null;document.querySelector('#wake-lock').textContent='Не выключать экран';});
  } catch {toast('Не удалось удержать экран включенным. Проверь режим энергосбережения.');}
}
document.querySelector('#wake-lock').addEventListener('click',async()=>{
  if(wakeLock){wakeWanted=false;await wakeLock.release();}else{wakeWanted=true;await requestWake();}
});
document.addEventListener('visibilitychange',()=>{
  rotation.reset(performance.now());
  if(!document.hidden){agents.refresh();weather.refresh();if(wakeWanted&&!wakeLock)requestWake();}
});
document.querySelector('#city-form').addEventListener('submit',async e=>{
  e.preventDefault();const query=document.querySelector('#city-search').value.trim(),results=document.querySelector('#city-results');
  if(query.length<2){results.textContent='Введи хотя бы две буквы.';return;}
  cityRequest?.abort();const controller=new AbortController();cityRequest=controller;
  const timer=setTimeout(()=>controller.abort(),10000);results.textContent='Ищем город…';
  try{
    const cities=await searchCities(query,controller.signal);if(cityRequest!==controller)return;
    results.innerHTML='';
    if(!cities.length)results.textContent='Не нашли. Попробуй другое название.';
    for(const city of cities){
      const button=document.createElement('button');button.type='button';button.className='city-result';
      button.innerHTML='<strong>'+escapeHTML(city.name)+'</strong><span>'+escapeHTML(city.country)+'</span>';
      button.addEventListener('click',()=>{settings.city=city;persist();weather.setCity(city);renderCity();results.innerHTML='';toast('Погода: '+city.name);});
      results.append(button);
    }
  }catch{if(cityRequest===controller)results.textContent='Не удалось найти город. Проверь подключение к интернету.';}
  finally{clearTimeout(timer);if(cityRequest===controller)cityRequest=null;}
});
document.querySelector('#city-clear').addEventListener('click',()=>{
  settings.city=null;persist();weather.setCity(null);renderCity();document.querySelector('#city-results').innerHTML='';
});
updateFullscreenButton();
document.querySelector('#settings-open').innerHTML=icon('settings');
document.querySelector('#settings-close').innerHTML=icon('close');
document.querySelector('#swipe-hint').innerHTML=icon('left')+icon('right');
function updateDate(){document.querySelector('#top-date').textContent=formatDate(new Date(),{weekday:'short'});updateDim();}
updateDate();setInterval(updateDate,30000);
mountActive();updateRotationButton();weather.setCity(settings.city);agents.refresh();
setInterval(()=>agents.refresh(),15000);setInterval(()=>weather.refresh(),60000);
setInterval(()=>{if(focus.tick())toast('Время фокуса закончилось. Можно отдохнуть.');},250);
function frame(now){
  const ids=enabled(),blocked=!settings.autoRotate||dialog.open||document.hidden||ids.length<2;
  if(rotation.tick(now,blocked))step(1,false);
  const holding=now<rotation.resumeAt;
  const label=ids.length<2?'Один экран':!settings.autoRotate?'Автосмена на паузе':holding?'После касания · '+Math.ceil((rotation.resumeAt-now)/1000)+' сек':'Автосмена · '+settings.interval+' сек';
  if(label!==lastStatus){document.querySelector('#rotation-state').textContent=label;lastStatus=label;}
  document.querySelector('#rotation-progress').style.transform='scaleX('+(blocked||holding?0:rotation.progress(now))+')';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
