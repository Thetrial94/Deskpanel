import {overviewContext,approachingMeeting,timedMeetings,countdown,meetingCountdown} from './context.js';
import {calendarDateLabel} from './calendar.js';
import {sortSessions,agentSummary} from './agent-view.js';
import {sessionStatus} from './agent-labels.js';
export const MAX_OVERVIEW_MODULES=5;
export const DEFAULT_OVERVIEW_MODULES=Object.freeze(['clock','primary','music','codex','claude']);
export const OVERVIEW_MODULES=Object.freeze([
 {id:'clock',title:'Часы и погода',description:'Время, дата, город и температура'},
 {id:'primary',title:'Главное',description:'Встреча, вопрос агента, таймер или событие'},
 {id:'music',title:'Музыка',description:'Трек, состояние плеера и управление'},
 {id:'codex',title:'Codex',description:'Активные сессии и их состояния'},
 {id:'claude',title:'Claude',description:'Активные сессии и их состояния'},
 {id:'calendar',title:'Календарь',description:'Ближайшее событие, включая события на весь день'},
 {id:'meeting',title:'Ближайшая встреча',description:'Встреча со временем и отсчётом до начала'},
 {id:'timer',title:'Таймер',description:'Оставшееся время и переход к управлению'},
 {id:'focus',title:'Фокус',description:'Текущий сеанс концентрации'},
 {id:'breaks',title:'Перерывы',description:'Рабочий интервал или время отдыха'},
 {id:'computers',title:'Компьютеры',description:'Какие из подключённых устройств сейчас в сети'},
 {id:'home',title:'Умный дом',description:'Устройства квартиры и включённый свет'},
 {id:'services',title:'Подключения',description:'Доступность календаря, дома, музыки и агентов'}
]);
const activeStatuses=new Set(['working','waiting','approval','error']);
export function overviewAgent(state){
 const connection=state?.connection||'loading';
 if(connection!=='connected'){
  const labels={loading:'Проверяем…',not_configured:'Не подключён',awaiting_events:'Ждём первое событие',pair_required:'Нужна привязка',disconnected:'Нет связи',unavailable:'Нет связи'};
  return {count:0,status:'offline',title:labels[connection]||'Нет связи',detail:state?.source?.name||'Открыть подключение →'};
 }
 const active=sortSessions((state.sessions||[]).filter(s=>activeStatuses.has(s.status)));
 if(!active.length&&(state.sessions||[]).some(s=>s.status==='stale'))return {count:0,status:'stale',title:'Нет свежих событий',detail:state?.source?.name||'Открыть экран агента →'};
 return {count:active.length,status:active[0]?.status||'idle',title:active.length===1?(active[0].title||sessionStatus(active[0])):active.length?'Активных сессий: '+active.length:'Нет активных сессий',detail:active.length?agentSummary(active):state?.source?.name||'Новые задачи появятся здесь'};
}

const connectionLabel=s=>({loading:'Проверяем…',not_configured:'Не подключено',pair_required:'Нужна привязка',disconnected:'Нет связи',unavailable:'Нет связи',awaiting_events:'Ждём событие'}[s]||'Нет связи');
function eventWidget(event,now,meeting=false){
 if(!event)return {title:meeting?'Нет ближайших встреч':'Нет ближайших событий',detail:'Открыть календарь →',target:'calendar'};
 const time=event.allDay?'весь день':new Date(event.start).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
 return {title:event.title,detail:meeting?time+' · '+meetingCountdown(event,now):calendarDateLabel(event)+' · '+time,target:meeting?'meeting':'calendar',eventId:event.id};
}
export function overviewWidget(id,ctx,now=Date.now()){
 if(id==='codex'||id==='claude')return {...overviewAgent(ctx.agents?.snapshot?.[id]),target:id};
 if(id==='primary'){
  const data=overviewContext({calendar:ctx.calendar?.snapshot,agents:ctx.agents?.snapshot,timer:ctx.timer,focus:ctx.focus,breaks:ctx.breaks},now);
  if(!data)return {title:'Нет ближайших событий',detail:'Открыть календарь →',target:'calendar'};
  if(data.kind==='agent')return {title:data.session.title,label:(data.target==='codex'?'Codex':'Claude')+' · '+sessionStatus(data.session),detail:'Открыть сессии →',target:data.target};
  if(data.kind==='timer')return {label:data.label,title:countdown(data.seconds),detail:'Идёт отсчёт',target:'timers',mode:data.mode};
  return {...eventWidget(data.event,now,data.kind==='meeting'),label:data.kind==='meeting'?'Встреча начинается':'Ближайшее событие'};
 }
 if(id==='calendar'||id==='meeting'){
  const state=ctx.calendar?.snapshot;
  if(state?.connection!=='connected')return {title:connectionLabel(state?.connection),detail:'Открыть календарь →',target:'calendar',status:'offline'};
  const event=id==='meeting'?(approachingMeeting(state,now)||timedMeetings(state,now)[0]):(state.events||[]).filter(e=>Date.parse(e.end)>now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))[0];
  return eventWidget(event,now,id==='meeting');
 }
 if(['timer','focus','breaks'].includes(id)){
  const value=ctx[id],running=!!value?.deadline,done=value?.completed||value?.due;
  const duration=id==='breaks'?value?.duration?.()*60:id==='focus'?value?.duration*60:value?.duration;
  const label=id==='breaks'?(value?.phase==='rest'?'Отдых':'Рабочий интервал'):id==='focus'?'Фокус':'Таймер';
  return {label,title:countdown(value?.seconds?.(now)||0),detail:done?'Время вышло':running?'Идёт отсчёт':value?.remaining<duration?'На паузе':'Готов к запуску',target:'timers',mode:id,status:running?'working':done?'waiting':'idle'};
 }
 if(id==='computers'){
  const state=ctx.computers?.snapshot,nodes=state?.nodes||[];
  if(state?.connection!=='connected')return {title:connectionLabel(state?.connection),detail:'Открыть компьютеры →',target:'computer',status:'offline'};
  return {title:nodes.filter(n=>n.connection==='connected').length+' из '+nodes.length+' в сети',detail:nodes.map(n=>n.name+(n.connection==='connected'?' ✓':' · нет связи')).join(' · ')||'Подключи компьютер',target:'computer'};
 }
 if(id==='home'){
  const state=ctx.home?.snapshot;
  if(state?.connection!=='connected')return {title:connectionLabel(state?.connection),detail:'Открыть умный дом →',target:'home',status:'offline'};
  const devices=state.provider==='yandex'?(state.devices||[]).filter(d=>d.household?.name?.trim().toLocaleLowerCase('ru')==='квартира'):(state.devices||[]);
  return {title:devices.filter(d=>d.on===true).length+' включено',detail:devices.length+' устройств · '+(state.provider==='yandex'?'Квартира':'Home Assistant'),target:'home'};
 }
 if(id==='services'){
  const states=[['Календарь',ctx.calendar?.snapshot],['Дом',ctx.home?.snapshot],['Музыка',ctx.music?.snapshot],['Codex',ctx.agents?.snapshot?.codex],['Claude',ctx.agents?.snapshot?.claude]];
  const unavailable=states.filter(([,s])=>s?.connection!=='connected');
  return {title:(states.length-unavailable.length)+' из '+states.length+' доступны',detail:unavailable.length?'Проверить: '+unavailable.map(([name])=>name).join(', '):'Все подключения работают',target:'services',status:unavailable.length?'offline':'working'};
 }
 if(id==='music'){
  const s=ctx.music?.snapshot,connected=s?.connection==='connected';
  return {title:connected?(s?.track?.title||'Яндекс Музыка'):s?.connection==='stopped'?'Плеер закрыт':connectionLabel(s?.connection),detail:connected?(s.playback==='playing'?'Сейчас играет':s.playback==='paused'?'На паузе':'Выбери трек'):'Открыть музыку →',target:'music',status:connected?'working':'offline'};
 }
 return {title:'Нет данных',detail:'Настроить модуль',target:'overview'};
}
