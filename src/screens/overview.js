import {OVERVIEW_MODULES,DEFAULT_OVERVIEW_MODULES,overviewWidget} from '../core/overview.js';
import {formatTime,formatDate,mountTicker} from '../core/dom.js';
import {isEvening} from '../core/context.js';
import {weatherLabel} from '../data/weather.js';
import {icon} from '../ui/icons.js';
const workModules=new Set(['primary','codex','claude','calendar','meeting','focus']);
export default {id:'overview',title:'Обзор',icon:'overview',accent:'lime',mount(root,ctx){
 const ids=ctx.settings().overviewModules||DEFAULT_OVERVIEW_MODULES,widgets=new Map(),nodes=new Map();
 const catalog=new Map(OVERVIEW_MODULES.map(m=>[m.id,m]));
 root.innerHTML='<section class="overview-board">'+ids.map(id=>{
  if(id==='clock')return '<div class="overview-clock overview-module module-clock" data-overview-module-card="clock"><div class="context-time" data-clock></div><button class="context-weather text-button" data-go="weather"></button><div class="context-date" data-date></div><button class="text-button overview-evening-note" data-settings data-overview-settings data-evening-note hidden></button></div>';
  if(id==='music')return '<article class="card overview-module module-music" data-overview-module-card="music" data-music><button class="overview-music-link" data-open-module="music"><span class="module-label">Музыка</span><strong class="module-value"></strong><span class="module-detail"></span></button><div class="overview-music-controls"><button class="icon-button" data-previous aria-label="Предыдущий трек">'+icon('previous')+'</button><button class="icon-button" data-music-toggle aria-label="Воспроизведение / пауза"></button><button class="icon-button" data-next aria-label="Следующий трек">'+icon('next')+'</button></div></article>';
  return '<button class="card overview-module module-'+id+'" data-overview-module-card="'+id+'" data-open-module="'+id+'" '+(['codex','claude'].includes(id)?'data-agent="'+id+'"':'')+' '+(id==='primary'?'data-primary':'')+'><span class="module-label">'+catalog.get(id).title+'<span data-count></span></span><strong class="module-value" '+(['codex','claude'].includes(id)?'data-agent-title':'')+'></strong><span class="module-detail"></span></button>';
 }).join('')+'<div class="overview-empty" data-overview-empty hidden><p>Вечерний режим скрывает выбранные рабочие блоки.</p><button class="text-button" data-settings data-overview-settings>Настроить обзор</button></div></section>';
 for(const id of ids)nodes.set(id,root.querySelector('[data-overview-module-card="'+id+'"]'));
 const render=()=>{
  const now=Date.now(),quiet=isEvening(ctx.settings(),now);let visible=0;
  for(const id of ids){
   const node=nodes.get(id);node.hidden=quiet&&workModules.has(id);if(node.hidden)continue;visible++;
   if(id==='clock'){
    const w=ctx.weather.state;node.querySelector('[data-clock]').textContent=formatTime(new Date(now),ctx.settings().showSeconds);node.querySelector('[data-clock]').classList.toggle('has-seconds',ctx.settings().showSeconds);node.querySelector('[data-date]').textContent=formatDate(new Date(now),{weekday:'long'});
    node.querySelector('.context-weather').textContent=(w.city?.name||'Выбрать город')+(w.data?' · '+Math.round(w.data.current.temperature_2m)+'° · '+weatherLabel(w.data.current.weather_code):w.error?' · нет связи':'');continue;
   }
   const widget=overviewWidget(id,ctx,now);widgets.set(id,widget);node.dataset.status=widget.status||'idle';
   node.querySelector('.module-value').textContent=widget.title;node.querySelector('.module-value').title=widget.title;
   node.querySelector('.module-detail').textContent=widget.detail||'';
   if(id!=='music'){node.querySelector('.module-label').firstChild.textContent=widget.label||catalog.get(id).title;node.querySelector('[data-count]').textContent=widget.count?String(widget.count):'';}
   else{const snapshot=ctx.music.snapshot;node.querySelector('.module-label').textContent=snapshot.connection==='connected'?widget.detail:'Музыка';node.querySelector('.module-detail').textContent=snapshot.connection==='connected'?(snapshot.track?.artist||''):widget.detail;const playing=snapshot.playback==='playing',toggle=node.querySelector('[data-music-toggle]');toggle.innerHTML=icon(playing?'pause':'play');toggle.setAttribute('aria-label',playing?'Пауза':'Играть');toggle.setAttribute('aria-pressed',String(playing));for(const button of node.querySelectorAll('.overview-music-controls button'))button.disabled=ctx.music.pending||ctx.music.snapshot.connection!=='connected';}
  }
  // Say what evening mode hid, otherwise the chosen blocks look lost.
  const hidden=ids.filter(id=>nodes.get(id).hidden),note=root.querySelector('[data-evening-note]');
  if(note){note.hidden=!hidden.length||!visible;if(!note.hidden){const text='Вечерний режим до '+String(ctx.settings().eveningEnd).padStart(2,'0')+':00 скрыл: '+hidden.map(id=>catalog.get(id)?.title||id).join(', ');if(note.textContent!==text)note.textContent=text;}}
  const shown=ids.filter(id=>!nodes.get(id).hidden),board=root.querySelector('section');board.dataset.count=visible;board.classList.toggle('with-clock',ids.includes('clock'));board.classList.toggle('span-clock',ids.includes('clock')&&visible>=3&&visible%2===1);
  for(const id of ids)nodes.get(id).classList.toggle('module-wide',!ids.includes('clock')&&visible%2===1&&id===shown.at(-1));
  root.querySelector('[data-overview-empty]').hidden=visible>0;
 };
 const sources=new Set();
 for(const id of ids){
  if(id==='clock')sources.add(ctx.weather);
  if(['primary','calendar','meeting','services'].includes(id))sources.add(ctx.calendar);
  if(['primary','codex','claude','services'].includes(id))sources.add(ctx.agents);
  if(['music','services'].includes(id))sources.add(ctx.music);
  if(['home','services'].includes(id))sources.add(ctx.home);
  if(id==='tv')sources.add(ctx.tv);
  if(id==='computers')sources.add(ctx.computers);
 }
 const stops=[...sources].map(source=>source.subscribe(render));stops.push(mountTicker(root,render));
 const click=e=>{
  const open=e.target.closest('[data-open-module]');if(open){const widget=widgets.get(open.dataset.openModule);if(widget){if(widget.eventId)ctx.meetingId=widget.eventId;if(widget.mode)ctx.timeMode=widget.mode;ctx.navigate(widget.target);}}
  if(e.target.closest('[data-previous]'))ctx.music.command('previous');if(e.target.closest('[data-music-toggle]'))ctx.music.command('toggle');if(e.target.closest('[data-next]'))ctx.music.command('next');
 };
 root.addEventListener('click',click);return ()=>{stops.forEach(stop=>stop());root.removeEventListener('click',click);};
}};
