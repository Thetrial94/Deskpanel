import {calendarDateLabel} from '../core/calendar.js';
import {emptyState} from '../data/features.js';
import {escapeHTML as esc} from '../core/dom.js';
const time=d=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(d));
export default {id:'calendar',title:'Календарь',icon:'calendar',accent:'blue',mount(root,ctx){
 root.innerHTML='<section class="agenda-dashboard"><header class="screen-heading"><h1>Календарь</h1><span class="muted">Москва · 7 дней</span></header><div data-events></div></section>';
 return ctx.calendar.subscribe(s=>{
  const body=root.querySelector('[data-events]');if(s.connection!=='connected'){emptyState(body,s,'календарь');return;}
  const now=Date.now(),events=(s.events||[]).filter(e=>new Date(e.end)>now);
  if(!events.length){body.innerHTML='<div class="functional-empty"><h2>Нет ближайших событий</h2><p>На семь дней вперёд.</p></div>';return;}
  const event=(e,primary)=>{const ongoing=new Date(e.start)<=now;const mins=Math.ceil((new Date(e.start)-now)/60000);return '<article class="card agenda-event '+(primary?'agenda-primary':'')+'"><div class="agenda-when"><strong>'+esc(e.allDay?'Весь день':time(e.start))+'</strong><span>'+esc(calendarDateLabel(e))+'</span></div><div class="agenda-detail"><h2>'+esc(e.title)+'</h2><p>'+(ongoing?'Сейчас':!e.allDay&&mins<60?'Через '+mins+' мин':e.allDay?(primary?'Ближайшее событие':''):'До '+time(e.end))+'</p>'+(!e.allDay?'<button class="text-button" data-meeting="'+esc(e.id)+'">'+(e.canOpen?'Открыть встречу →':'Подробнее →')+'</button>':'')+'</div></article>';};
  body.innerHTML='<div class="agenda-grid">'+event(events[0],true)+'<div class="agenda-upcoming">'+events.slice(1).map(e=>event(e,false)).join('')+'</div></div>';
 });
}};
