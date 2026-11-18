import {formatTime,formatDate,mountTicker} from '../core/dom.js';
import {calendarDateLabel} from '../core/calendar.js';
import {sessionStatus} from '../core/agent-labels.js';
import {overviewContext,countdown,meetingCountdown,isEvening} from '../core/context.js';
import {weatherLabel} from '../data/weather.js';
import {icon} from '../ui/icons.js';
export default {id:'overview',title:'Обзор',icon:'overview',accent:'lime',mount(root,ctx){
 root.innerHTML='<section class="context-overview"><div class="overview-clock"><div class="context-time" data-clock></div><div class="context-date" data-date></div><button class="context-weather text-button" data-go="weather"></button></div><div class="overview-context"><button class="card context-card" data-primary hidden><span class="widget-label" data-label></span><strong data-title></strong><span data-detail></span></button><div class="compact-music" data-music hidden><button class="text-button" data-go="music"><span data-track></span></button><button class="icon-button" data-music-toggle aria-label="Пауза">'+icon('pause')+'</button><button class="icon-button" data-next aria-label="Следующий трек">'+icon('next')+'</button></div></div></section>';
 const primary=root.querySelector('[data-primary]');let target=null,eventId=null,timeMode=null;
 const render=()=>{
  const now=Date.now(),quiet=isEvening(ctx.settings(),now),data=overviewContext({calendar:ctx.calendar.snapshot,agents:ctx.agents.snapshot,timer:ctx.timer,focus:ctx.focus,breaks:ctx.breaks,quiet},now);
  root.querySelector('[data-clock]').classList.toggle('has-seconds',ctx.settings().showSeconds);root.querySelector('[data-clock]').textContent=formatTime(new Date(now),ctx.settings().showSeconds);root.querySelector('[data-date]').textContent=formatDate(new Date(now),{weekday:'long'});
  primary.hidden=!data;target=data?.target;eventId=data?.event?.id;timeMode=data?.mode;
  if(data){let label,title,detail;
   if(data.kind==='agent'){label=(data.session.provider==='codex'?'Codex':'Claude')+' · '+sessionStatus(data.session);title=data.session.title;detail='Открыть чат на панели →';}
   else if(data.kind==='timer'){label=data.label;title=countdown(data.seconds);detail='Открыть управление →';}
   else{label=data.kind==='meeting'?'Встреча начинается':'Ближайшее событие';title=data.event.title;detail=data.kind==='meeting'?meetingCountdown(data.event,now):calendarDateLabel(data.event)+' · '+(data.event.allDay?'весь день':new Date(data.event.start).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}));}
   root.querySelector('[data-label]').textContent=label;root.querySelector('[data-title]').textContent=title;root.querySelector('[data-detail]').textContent=detail;
  }
  const m=ctx.music.snapshot,showMusic=m.connection==='connected'&&m.playback==='playing'&&!!m.track?.title;root.querySelector('[data-music]').hidden=!showMusic;root.querySelector('[data-track]').textContent=m.track?.title||'';for(const b of root.querySelectorAll('[data-music-toggle],[data-next]'))b.disabled=ctx.music.pending;
  root.querySelector('section').classList.toggle('clock-only',!data&&!showMusic);root.querySelector('section').classList.toggle('music-only',!data&&showMusic);
 };
 const weather=ctx.weather.subscribe(s=>{root.querySelector('.context-weather').textContent=(s.city?.name||'Выбрать город')+(s.data?' · '+Math.round(s.data.current.temperature_2m)+'° · '+weatherLabel(s.data.current.weather_code):s.error?' · нет связи':'');});
 const stops=[weather,ctx.calendar.subscribe(render),ctx.agents.subscribe(render),ctx.music.subscribe(render),mountTicker(root,render)];
 const click=e=>{if(e.target.closest('[data-primary]')&&target){if(eventId)ctx.meetingId=eventId;if(timeMode)ctx.timeMode=timeMode;ctx.navigate(target);}if(e.target.closest('[data-music-toggle]'))ctx.music.command('toggle');if(e.target.closest('[data-next]'))ctx.music.command('next');};root.addEventListener('click',click);
 return ()=>{stops.forEach(stop=>stop());root.removeEventListener('click',click);};
}};
