import {overviewAgent} from '../core/overview.js';
import {formatTime,formatDate,mountTicker} from '../core/dom.js';
import {calendarDateLabel} from '../core/calendar.js';
import {sessionStatus} from '../core/agent-labels.js';
import {overviewContext,countdown,meetingCountdown,isEvening} from '../core/context.js';
import {weatherLabel} from '../data/weather.js';
import {icon} from '../ui/icons.js';
export default {id:'overview',title:'Обзор',icon:'overview',accent:'lime',mount(root,ctx){
 root.innerHTML='<section class="context-overview"><div class="overview-clock"><div data-clock-module><div class="context-time" data-clock></div><div class="context-date" data-date></div></div><button class="context-weather text-button" data-go="weather"></button></div><div class="overview-context"><button class="card context-card" data-primary hidden><span class="widget-label" data-label></span><strong data-title></strong><span data-detail></span></button><div class="compact-music" data-music hidden><button class="text-button" data-go="music"><span data-track></span></button><button class="icon-button" data-music-toggle aria-label="Пауза">'+icon('pause')+'</button><button class="icon-button" data-next aria-label="Следующий трек">'+icon('next')+'</button></div></div><div class="overview-agents" data-overview-agents><button class="card overview-agent" data-go="codex" data-agent="codex"><span class="overview-agent-head">Codex <span data-agent-count></span></span><strong data-agent-title></strong><span data-agent-detail></span></button><button class="card overview-agent" data-go="claude" data-agent="claude"><span class="overview-agent-head">Claude <span data-agent-count></span></span><strong data-agent-title></strong><span data-agent-detail></span></button></div><div class="overview-empty" data-overview-empty hidden><p>Сейчас нет событий для выбранных модулей.</p><button class="text-button" data-settings data-overview-settings>Настроить обзор</button></div></section>';
 const primary=root.querySelector('[data-primary]');let target=null,eventId=null,timeMode=null;
 const render=()=>{
  const modules=new Set(ctx.settings().overviewModules||['clock','primary','music','codex','claude']);
  const now=Date.now(),quiet=isEvening(ctx.settings(),now),data=overviewContext({calendar:ctx.calendar.snapshot,agents:ctx.agents.snapshot,timer:ctx.timer,focus:ctx.focus,breaks:ctx.breaks,quiet},now);
  root.querySelector('[data-clock]').classList.toggle('has-seconds',ctx.settings().showSeconds);root.querySelector('[data-clock]').textContent=formatTime(new Date(now),ctx.settings().showSeconds);root.querySelector('[data-date]').textContent=formatDate(new Date(now),{weekday:'long'});
  const showPrimary=modules.has('primary')&&!!data;
  primary.hidden=!showPrimary;target=data?.target;eventId=data?.event?.id;timeMode=data?.mode;
  if(data){let label,title,detail;
   if(data.kind==='agent'){label=(data.session.provider==='codex'?'Codex':'Claude')+' · '+sessionStatus(data.session);title=data.session.title;detail='Открыть чат на панели →';}
   else if(data.kind==='timer'){label=data.label;title=countdown(data.seconds);detail='Открыть управление →';}
   else{label=data.kind==='meeting'?'Встреча начинается':'Ближайшее событие';title=data.event.title;detail=data.kind==='meeting'?meetingCountdown(data.event,now):calendarDateLabel(data.event)+' · '+(data.event.allDay?'весь день':new Date(data.event.start).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}));}
   root.querySelector('[data-label]').textContent=label;root.querySelector('[data-title]').textContent=title;root.querySelector('[data-detail]').textContent=detail;
  }
  const m=ctx.music.snapshot,showMusic=modules.has('music')&&m.connection==='connected'&&m.playback==='playing'&&!!m.track?.title;root.querySelector('[data-music]').hidden=!showMusic;root.querySelector('[data-track]').textContent=m.track?.title||'';for(const b of root.querySelectorAll('[data-music-toggle],[data-next]'))b.disabled=ctx.music.pending;
  const clock=modules.has('clock'),weather=clock;
  root.querySelector('[data-clock-module]').hidden=!clock;root.querySelector('.context-weather').hidden=!weather;
  root.querySelector('.overview-clock').hidden=!clock&&!weather;
  root.querySelector('.overview-context').hidden=!showPrimary&&!showMusic;
  let agentCount=0;
  for(const id of ['codex','claude']){
   const node=root.querySelector('[data-agent="'+id+'"]'),shown=modules.has(id)&&!quiet;node.hidden=!shown;if(!shown)continue;agentCount++;
   const info=overviewAgent(ctx.agents.snapshot[id]);node.dataset.status=info.status;
   node.querySelector('[data-agent-count]').textContent=info.count?String(info.count):'';
   node.querySelector('[data-agent-title]').textContent=info.title;node.querySelector('[data-agent-title]').title=info.title;
   node.querySelector('[data-agent-detail]').textContent=info.detail;
  }
  root.querySelector('[data-overview-agents]').hidden=!agentCount;
  const section=root.querySelector('section'),content=showPrimary||showMusic,left=clock||weather;
  section.classList.toggle('clock-only',left&&!content&&!agentCount);
  section.classList.toggle('music-only',left&&!showPrimary&&showMusic&&!agentCount);
  section.classList.toggle('overview-single-column',!left||!content);
  section.classList.toggle('has-agent-modules',agentCount>0);
  root.querySelector('[data-overview-empty]').hidden=left||content||agentCount>0;
 };
 const weather=ctx.weather.subscribe(s=>{root.querySelector('.context-weather').textContent=(s.city?.name||'Выбрать город')+(s.data?' · '+Math.round(s.data.current.temperature_2m)+'° · '+weatherLabel(s.data.current.weather_code):s.error?' · нет связи':'');});
 const stops=[weather,ctx.calendar.subscribe(render),ctx.agents.subscribe(render),ctx.music.subscribe(render),mountTicker(root,render)];
 const click=e=>{if(e.target.closest('[data-primary]')&&target){if(eventId)ctx.meetingId=eventId;if(timeMode)ctx.timeMode=timeMode;ctx.navigate(target);}if(e.target.closest('[data-music-toggle]'))ctx.music.command('toggle');if(e.target.closest('[data-next]'))ctx.music.command('next');};root.addEventListener('click',click);
 return ()=>{stops.forEach(stop=>stop());root.removeEventListener('click',click);};
}};
