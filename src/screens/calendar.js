import {emptyState} from '../data/features.js';
import {escapeHTML} from '../core/dom.js';
export default {
 id:'calendar',title:'Календарь',icon:'calendar',accent:'blue',
 mount(root,ctx){
  root.innerHTML='<section class="calendar-layout"><div><span class="eyebrow">ЯНДЕКС TEAM</span><h1 class="feature-title">Ближайшие<br>события.</h1><p class="muted">Твой календарь на семь дней.</p><p class="feature-note muted">Время событий — Москва</p></div><div data-events></div></section>';
  const body=root.querySelector('[data-events]');
  return ctx.calendar.subscribe(s=>{
   if(s.connection!=='connected'){emptyState(body,s,'календарь');return;}
   const now=Date.now(),events=(s.events||[]).filter(e=>new Date(e.end)>now);
   if(!events.length){body.innerHTML='<div class="card feature-empty"><h2>Свободное время</h2><p class="muted">В ближайшие семь дней событий нет.</p></div>';return;}
   const date=d=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',timeZone:'Europe/Moscow'}).format(new Date(d));
   const time=d=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(d));
   body.innerHTML='<div class="event-list">'+events.slice(0,8).map((e,i)=>'<article class="card event '+(!i?'event-next':'')+'"><div class="event-time">'+escapeHTML(e.allDay?'Весь день':time(e.start))+'<span>'+date(e.start)+'</span></div><div><h2>'+escapeHTML(e.title)+'</h2><p class="muted">'+(new Date(e.start)<=now?'Уже идёт':e.allDay?'На весь день':'До '+time(e.end))+'</p></div></article>').join('')+'</div>';
  });
 }
};
