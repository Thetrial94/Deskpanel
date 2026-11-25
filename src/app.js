import {setupScreenReorder} from './ui/reorder.js';
import {OVERVIEW_MODULES,MAX_OVERVIEW_MODULES} from './core/overview.js';
import {ComputerSources} from './data/computers.js';
import { ServerConnection } from './core/connection.js';
import { loadSettings, normalizeSettings, saveSettings,resolveScreenId } from './core/settings.js';
import { RotationClock, swipeDirection } from './core/rotation.js';
import { QuickTimer } from './core/timer.js';
import { SmartTransitions,isEvening,approachingMeeting } from './core/context.js';
import { FocusTimer } from './core/focus.js';
import { formatDate, escapeHTML } from './core/dom.js';
import { icon } from './ui/icons.js';
import { screens, screenById } from './screens/registry.js';
import { WeatherSource, searchCities } from './data/weather.js';
import { attentionNotice } from './core/agent-view.js';
import { AgentSource } from './data/agents.js';
import { BreakTimer } from './core/breaks.js';
import { FeatureSource } from './data/features.js';
import { BuildWatcher } from './core/build.js';
import { setupConnections } from './ui/connections.js';

let storage;
try { storage = window.localStorage; } catch { storage = {getItem:()=>null,setItem:()=>{throw new Error('unavailable');}}; }
let settings = loadSettings(storage);
const timer = new QuickTimer(storage),smart = new SmartTransitions(storage);
const computers=new ComputerSources(storage);
const focus = new FocusTimer(storage), weather = new WeatherSource(), agents = new AgentSource(), music = computers.source('music');
const breaks = new BreakTimer(storage), computer = computers.source('computer',3000), remote = computers.source('remote'), calendar = new FeatureSource('/api/calendar',60000), home = new FeatureSource('/api/home',10000), tv = new FeatureSource('/api/tv',3000);
const stage = document.querySelector('#stage'), nav = document.querySelector('#screen-nav'), dialog = document.querySelector('#settings-dialog');
const rotation = new RotationClock(settings.interval*1000,performance.now());
const requestedScreen=resolveScreenId(location.hash.slice(1));
let activeId = settings.enabledScreens.includes(requestedScreen) ? requestedScreen : settings.screenOrder.find(id=>settings.enabledScreens.includes(id));
let cleanup = () => {}, transitionTimer, toastTimer, lastStatus = '', pointer = null, wakeLock = null, wakeWanted = false, cityRequest = null;
const context = {settings:()=>settings,focus,weather,agents,music,breaks,computer,computers,remote,calendar,home,tv,timer,navigate:id=>navigate(id),meetingId:null,timeMode:['focus','breaks'].includes(location.hash.slice(1))?location.hash.slice(1):null};
const enabled = () => settings.screenOrder.filter(id=>settings.enabledScreens.includes(id));
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function toast(message) { clearTimeout(toastTimer); const node = document.querySelector('#toast'); node.textContent = message; node.classList.add('visible'); toastTimer = setTimeout(()=>node.classList.remove('visible'),3600); }
function renderNav() {
  const ids = activeId==='meeting'?[...enabled(),'meeting']:enabled();
  nav.innerHTML = ids.map(id => '<button class="nav-item '+(id===activeId?'active':'')+'" data-screen="'+id+'" aria-label="'+screenById.get(id).title+'" '+(id===activeId?'aria-current="page"':'')+'>'+icon(screenById.get(id).icon)+'<span>'+screenById.get(id).title+'</span><i></i></button>').join('');
  nav.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'});
  document.querySelector('#screen-counter').textContent = String(ids.indexOf(activeId)+1).padStart(2,'0')+' / '+String(ids.length).padStart(2,'0');
}
function mountActive(direction = 0) {
  cleanup(); clearTimeout(transitionTimer);
  const plugin = screenById.get(activeId);
  stage.className = 'stage accent-'+plugin.accent;
  document.documentElement.dataset.accent = plugin.accent;
  stage.innerHTML = ''; stage.scrollTop = 0;
  cleanup = plugin.mount(stage,context) || (()=>{});
  stage.setAttribute('aria-label',plugin.title);
  if (!prefersReducedMotion.matches && direction) {
    stage.classList.add(direction > 0 ? 'enter-next':'enter-prev');
    transitionTimer = setTimeout(()=>stage.classList.remove('enter-next','enter-prev'),380);
  }
  history.replaceState(null,'','#'+activeId); renderNav();
}
function interact() { rotation.interact(performance.now(),settings.resumeAfter*1000);smart.holdUntil=0; }
document.addEventListener('pointerdown',interact,{passive:true});
function go(id, manual = true, direction = 1) {
  if (!enabled().includes(id)&&!['meeting'].includes(id)) { if (manual) toast('Этот экран скрыт. Включи его в настройках.'); return; }
  if (manual) interact(); else rotation.reset(performance.now());
  if (activeId !== id) { activeId = id; mountActive(direction); }
}
function navigate(id,manual=true){
 if(!enabled().includes(id)&&id!=='meeting'){settings.enabledScreens.push(id);persist();}
 go(id,manual);
}
function step(direction, manual = true) {
  const ids = enabled(), index = ids.indexOf(activeId);
  go(ids[index<0?(direction>0?0:ids.length-1):(index+direction+ids.length)%ids.length],manual,direction);
}
function persist() {
  settings = normalizeSettings(settings);
  if (!saveSettings(storage,settings)) toast('Браузер не дает сохранить настройки. Они действуют до закрытия страницы.');
  if (!enabled().includes(activeId)&&activeId!=='meeting') { activeId = enabled()[0]; mountActive(); }
  rotation.configure(settings.interval*1000,performance.now()); renderNav(); updateRotationButton(); updateDim();
}
function updateRotationButton() {
  const button = document.querySelector('#rotation-toggle');
  const label = settings.autoRotate ? 'Приостановить смену экранов' : 'Возобновить смену экранов';
  button.innerHTML = icon(settings.autoRotate?'pause':'play');
  button.setAttribute('aria-label',label); button.title = label; button.setAttribute('aria-pressed',String(!settings.autoRotate));
}
function toggleRotation() { settings.autoRotate = !settings.autoRotate; rotation.resumeAt = 0; persist(); }
function updateDim() { const hour = new Date().getHours(),quiet=isEvening(settings);document.documentElement.classList.toggle('night-dim',quiet||settings.dimAtNight&&(hour>=22||hour<7));document.documentElement.classList.toggle('evening-mode',quiet); }
function renderScreenSettings() {
  document.querySelector('#screen-settings').innerHTML = settings.screenOrder.map((id,index) => {
    const on = settings.enabledScreens.includes(id), last = on && settings.enabledScreens.length===1;
    const position=enabled().indexOf(id)+1;
    return '<div class="screen-setting '+(!on?'screen-disabled':'')+'" data-screen-order-id="'+id+'"><button type="button" class="screen-drag-handle" data-drag-screen="'+id+'" aria-label="'+screenById.get(id).title+': перетащить или переместить стрелками клавиатуры" aria-pressed="false">⠿</button><span class="screen-order-number">'+(on?String(position).padStart(2,'0'):'—')+'</span><label><input type="checkbox" data-enable="'+id+'" '+(on?'checked':'')+' '+(last?'disabled':'')+'>'+icon(screenById.get(id).icon)+'<span>'+screenById.get(id).title+'</span></label><div class="screen-order-actions"><button class="icon-button small-button" data-move="'+id+'" data-delta="-1" aria-label="'+screenById.get(id).title+': выше" '+(index===0?'disabled':'')+'>'+icon('up')+'</button><button class="icon-button small-button" data-move="'+id+'" data-delta="1" aria-label="'+screenById.get(id).title+': ниже" '+(index===settings.screenOrder.length-1?'disabled':'')+'>'+icon('down')+'</button></div></div>';
  }).join('');
}
function renderOverviewSettings(){
 const selected=new Set(settings.overviewModules),full=selected.size>=MAX_OVERVIEW_MODULES;
 document.querySelector('#overview-module-counter').textContent='Выбрано '+selected.size+' из '+MAX_OVERVIEW_MODULES+' · в каталоге '+OVERVIEW_MODULES.length;
 document.querySelector('#overview-module-settings').innerHTML=OVERVIEW_MODULES.map(m=>{
  const on=selected.has(m.id),i=settings.overviewModules.indexOf(m.id),disabled=on?selected.size===1:full;
  return '<div class="overview-option"><label class="setting-row"><span>'+m.title+'<small>'+m.description+'</small></span><input type="checkbox" data-overview-module="'+m.id+'" '+(on?'checked':'')+' '+(disabled?'disabled':'')+'></label>'+(on&&m.id==='clock'?'<span class="overview-anchor">Слева сверху</span>':on?'<div class="overview-module-order"><button class="icon-button small-button" data-overview-move="'+m.id+'" data-delta="-1" aria-label="'+m.title+': выше" '+(i===(selected.has('clock')?1:0)?'disabled':'')+'>↑</button><span>'+(i+1)+'</span><button class="icon-button small-button" data-overview-move="'+m.id+'" data-delta="1" aria-label="'+m.title+': ниже" '+(i===selected.size-1?'disabled':'')+'>↓</button></div>':'')+'</div>';
 }).join('');
 document.querySelector('#overview-module-hint').textContent=full?'Выбрано пять. Убери один модуль, чтобы добавить другой.':'Выбери ещё '+(MAX_OVERVIEW_MODULES-selected.size)+'. Порядок меняется стрелками у выбранных модулей.';
}
function updateOverviewSettings(){persist();renderOverviewSettings();if(activeId==='overview')mountActive();}
document.querySelector('#overview-module-settings').addEventListener('change',e=>{
 const id=e.target.dataset.overviewModule;if(!id)return;
 if(e.target.checked&&settings.overviewModules.length>=MAX_OVERVIEW_MODULES){e.target.checked=false;return;}
 settings.overviewModules=e.target.checked?[...settings.overviewModules,id]:settings.overviewModules.filter(m=>m!==id);updateOverviewSettings();
});
document.querySelector('#overview-module-settings').addEventListener('click',e=>{
 const button=e.target.closest('[data-overview-move]');if(!button||button.disabled)return;
 const from=settings.overviewModules.indexOf(button.dataset.overviewMove),to=from+Number(button.dataset.delta);
 if(from<0||button.dataset.overviewMove==='clock'||to<(settings.overviewModules.includes('clock')?1:0)||to>=settings.overviewModules.length)return;
 [settings.overviewModules[from],settings.overviewModules[to]]=[settings.overviewModules[to],settings.overviewModules[from]];updateOverviewSettings();
});
function renderCity() {
  document.querySelector('#selected-city').textContent = settings.city ? 'Выбран: '+settings.city.name+(settings.city.country ? ' · '+settings.city.country : '') : 'Город пока не выбран. Данные появятся после настройки.';
  document.querySelector('#city-clear').hidden = !settings.city;
}
function openSettings() {
  for (const [selector,key] of [['auto','autoRotate'],['seconds','showSeconds'],['night','dimAtNight'],['smart','smartTransitions'],['evening','eveningMode']]) document.querySelector('#setting-'+selector).checked = settings[key];
  document.querySelector('#setting-interval').value = String(settings.interval);
  document.querySelector('#setting-resume').value = String(settings.resumeAfter);
  document.querySelector('#setting-evening-start').value=settings.eveningStart;document.querySelector('#setting-evening-end').value=settings.eveningEnd;
  renderScreenSettings(); renderOverviewSettings(); renderCity(); dialog.showModal(); connections.open();
}
const connections = setupConnections(document.querySelector('#connections-settings'),{settings:()=>settings,saveDevices:devices=>{settings.devices=devices;persist();if(activeId==='computer')mountActive();},changed:()=>{computers.refresh(true);agents.refresh(true);calendar.refresh();home.refresh();tv.refresh();remote.refresh();music.refresh(true);}});
function closeSettings() { dialog.close(); interact(); }
document.querySelector('#settings-open').addEventListener('click',openSettings);
for (const id of ['settings-close','settings-done']) document.querySelector('#'+id).addEventListener('click',closeSettings);
dialog.addEventListener('close',()=>{connections.close();interact();});
dialog.addEventListener('click',e=>{ if (e.target===dialog && e.clientX < dialog.getBoundingClientRect().left) closeSettings(); });
for (const [selector,key] of [['auto','autoRotate'],['seconds','showSeconds'],['night','dimAtNight'],['smart','smartTransitions'],['evening','eveningMode']]) document.querySelector('#setting-'+selector).addEventListener('change',e=>{settings[key]=e.target.checked;persist();});
for(const [selector,key] of [['start','eveningStart'],['end','eveningEnd']])document.querySelector('#setting-evening-'+selector).addEventListener('change',e=>{settings[key]=Number(e.target.value);persist();});

document.querySelector('#setting-interval').addEventListener('change',e=>{settings.interval=Number(e.target.value);persist();});
document.querySelector('#setting-resume').addEventListener('change',e=>{settings.resumeAfter=Number(e.target.value);persist();});
document.querySelector('#screen-settings').addEventListener('change',e=>{
  const id=e.target.dataset.enable; if(!id) return;
  settings.enabledScreens=e.target.checked?[...settings.enabledScreens,id]:settings.enabledScreens.filter(x=>x!==id);persist();renderScreenSettings();
});
function moveScreen(id,to){
 const from=settings.screenOrder.indexOf(id);if(from<0||to<0||to>=settings.screenOrder.length||from===to)return;
 settings.screenOrder.splice(from,1);settings.screenOrder.splice(to,0,id);persist();renderScreenSettings();
 document.querySelector('#screen-order-status').textContent=screenById.get(id).title+': позиция '+(to+1)+'. Порядок сохранён.';
 document.querySelector('[data-drag-screen="'+id+'"]').focus({preventScroll:true});
}
setupScreenReorder(document.querySelector('#screen-settings'),moveScreen);
document.querySelector('#screen-settings').addEventListener('click',e=>{
 const button=e.target.closest('[data-move]');if(!button||button.disabled)return;
 moveScreen(button.dataset.move,settings.screenOrder.indexOf(button.dataset.move)+Number(button.dataset.delta));
});
document.querySelector('.settings-shortcuts').addEventListener('click',e=>{
 const button=e.target.closest('[data-settings-jump]');if(button)document.getElementById(button.dataset.settingsJump)?.scrollIntoView({block:'start',behavior:'smooth'});
});

document.querySelector('#rotation-toggle').addEventListener('click',toggleRotation);
nav.addEventListener('click',e=>{const button=e.target.closest('[data-screen]');if(button)go(button.dataset.screen);});
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();go('overview');});
stage.addEventListener('click',e=>{
  if(e.target.closest('[data-settings]')){openSettings();if(e.target.closest('[data-overview-settings]'))document.querySelector('#overview-settings').scrollIntoView({block:'start'});}
  const hide=e.target.closest('[data-hide-screen]');if(hide&&settings.enabledScreens.length>1){settings.enabledScreens=settings.enabledScreens.filter(id=>id!==hide.dataset.hideScreen);persist();return;}
  const meeting=e.target.closest('[data-meeting]');if(meeting){context.meetingId=meeting.dataset.meeting;navigate('meeting');return;}
  const link=e.target.closest('[data-go]');if(link)navigate(link.dataset.go);
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
  if(!document.hidden){serverConnection.check();refreshSources();if(wakeWanted&&!wakeLock)requestWake();}
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
setInterval(()=>{if(!document.hidden)agents.refresh();},3000);setInterval(()=>weather.refresh(),60000);
// Recover data in place: keep the active screen, local timers and unsent forms.
function refreshSources(){agents.refresh(true);weather.refresh(true);for(const source of [computers,music,computer,remote,calendar,home,tv])source.refresh(true);if(dialog.open)connections.refresh();}
const connectionNotice=document.querySelector('#connection-notice');let recoveredTimer,connectionWasOffline=false;
const serverConnection=new ServerConnection({onRecover:refreshSources});
serverConnection.subscribe(state=>{
 const down=state.status==='offline';
 document.documentElement.classList.toggle('server-offline',down);
 if(down){clearTimeout(recoveredTimer);connectionWasOffline=true;connectionNotice.hidden=false;connectionNotice.classList.remove('recovered');connectionNotice.querySelector('span').textContent=state.reason==='network'?'Нет Wi-Fi · ждём подключения':'Хаб недоступен · подключаемся снова';connectionNotice.querySelector('button').hidden=false;}
 else if(state.status==='connected'&&connectionWasOffline){clearTimeout(recoveredTimer);connectionWasOffline=false;connectionNotice.hidden=false;connectionNotice.classList.add('recovered');connectionNotice.querySelector('span').textContent='Связь восстановлена';connectionNotice.querySelector('button').hidden=true;recoveredTimer=setTimeout(()=>connectionNotice.hidden=true,3500);}
});
document.querySelector('#connection-retry').addEventListener('click',()=>serverConnection.check());
window.addEventListener('offline',()=>serverConnection.setOnline(false));window.addEventListener('online',()=>serverConnection.setOnline(true));
serverConnection.online=navigator.onLine!==false;serverConnection.start();if(!serverConnection.online)serverConnection.setOnline(false);
const questionNotice=document.querySelector('#agent-question');
let noticeProvider=null;
questionNotice.addEventListener('click',()=>{if(!noticeProvider)return;if(!enabled().includes(noticeProvider)){settings.enabledScreens.push(noticeProvider);persist();}go(noticeProvider);});
function updateQuestionNotice(){
 const notice=attentionNotice(agents.snapshot);noticeProvider=notice?.provider;
 questionNotice.hidden=isEvening(settings)||!notice||activeId===noticeProvider||activeId==='overview'&&settings.overviewModules.includes(noticeProvider);
 const label=notice?.label||'';
 if(questionNotice.textContent!==label)questionNotice.textContent=label;
 document.documentElement.classList.toggle('has-agent-question',!questionNotice.hidden);
}
agents.subscribe(updateQuestionNotice);
// Keep the calendar current for context and meeting alerts on every screen.
calendar.subscribe(()=>{});
const timerNotice=document.querySelector('#timer-notice');
timerNotice.addEventListener('cancel',()=>timer.dismiss());
document.querySelector('#timer-dismiss').addEventListener('click',()=>{timer.dismiss();timerNotice.close();});
document.querySelector('#timer-extend').addEventListener('click',()=>{timer.extend();timerNotice.close();context.timeMode='timer';navigate('timers');});
// Kiosk pages stay open for days: pick up new panel code without anyone pressing reload.
const build=new BuildWatcher({reload:()=>location.reload(),canReload:()=>!document.hidden&&!dialog.open&&!timerNotice.open&&!stage.querySelector('.action-confirm')&&performance.now()>=rotation.resumeAt});
build.check();setInterval(()=>build.check(),30000);
const breakReminder=document.querySelector('#break-reminder');
breakReminder.addEventListener('click',()=>{context.timeMode='breaks';navigate('timers');});
setInterval(()=>{
 timer.tick();if(timer.notice&&!timerNotice.open)timerNotice.showModal();else if(!timer.notice&&timerNotice.open)timerNotice.close();
 if(focus.tick())toast('Время фокуса закончилось. Можно отдохнуть.');
 breaks.tick();updateQuestionNotice();
 breakReminder.hidden=isEvening(settings)||!breaks.due||activeId==='timers'&&context.timeMode==='breaks';
 breakReminder.textContent=breaks.phase==='work'?'Пора отдохнуть →':'Перерыв завершён →';
 const quiet=isEvening(settings),wall=Date.now(),blocked=serverConnection.state.status!=='connected'||document.hidden||dialog.open||timer.notice||!!stage.querySelector('.action-confirm')||performance.now()<rotation.resumeAt;
 const transition=smart.next({calendar:calendar.snapshot,agents:agents.snapshot,quiet,enabled:settings.smartTransitions,allow:settings.autoRotate,blocked,now:wall});
 if(transition){if(transition.target==='meeting')context.meetingId=approachingMeeting(calendar.snapshot,wall)?.id;navigate(transition.target,false);}
 updateDim();
},250);
function frame(now){
  const ids=enabled(),blocked=isEvening(settings)||Date.now()<smart.holdUntil||timer.notice||!settings.autoRotate||dialog.open||!!stage.querySelector('.action-confirm')||document.hidden||ids.length<2;
  if(rotation.tick(now,blocked))step(1,false);
  const holding=now<rotation.resumeAt;
  const label=isEvening(settings)?'Вечерний режим':Date.now()<smart.holdUntil?'Важное событие':ids.length<2?'Один экран':!settings.autoRotate?'Автосмена на паузе':holding?'После касания · '+Math.ceil((rotation.resumeAt-now)/1000)+' сек':'Автосмена · '+settings.interval+' сек';
  if(label!==lastStatus){document.querySelector('#rotation-state').textContent=label;lastStatus=label;}
  document.querySelector('#rotation-progress').style.transform='scaleX('+(blocked||holding?0:rotation.progress(now))+')';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize',()=>nav.querySelector('.active')?.scrollIntoView({block:'nearest',inline:'nearest'}));
