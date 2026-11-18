import quick from './timers.js';
import focus from './focus.js';
import breaks from './breaks.js';
import {countdown,activeTimer} from '../core/context.js';
const modes={timer:{label:'Таймер',view:quick},focus:{label:'Фокус',view:focus},breaks:{label:'Перерывы',view:breaks}};
export default {id:'timers',title:'Таймеры',icon:'focus',accent:'lavender',mount(root,ctx){
 root.innerHTML='<section class="time-dashboard"><header class="time-heading"><h1>Таймеры</h1><div class="time-tabs" role="tablist" aria-label="Режим отсчёта">'+Object.entries(modes).map(([id,m])=>'<button class="time-tab" id="time-tab-'+id+'" data-mode="'+id+'" role="tab" aria-controls="time-mode-panel"><span>'+m.label+'</span><small data-mode-state="'+id+'"></small></button>').join('')+'</div></header><div id="time-mode-panel" class="time-mode-body" role="tabpanel"></div></section>';
 const panel=root.querySelector('.time-mode-body');let cleanup=()=>{},mounted=null;
 if(!modes[ctx.timeMode]){let stored;try{stored=localStorage.getItem('deskpanel.time.mode');}catch{}ctx.timeMode=modes[stored]?stored:activeTimer(ctx)?.mode||'timer';}
 const mount=()=>{if(!modes[ctx.timeMode])ctx.timeMode='timer';if(mounted===ctx.timeMode)return;cleanup();mounted=ctx.timeMode;panel.innerHTML='';cleanup=modes[mounted].view.mount(panel,ctx)||(()=>{});panel.setAttribute('aria-labelledby','time-tab-'+mounted);for(const b of root.querySelectorAll('[data-mode]')){const on=b.dataset.mode===mounted;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;b.classList.toggle('selected',on);}try{localStorage.setItem('deskpanel.time.mode',mounted);}catch{}};
 const click=e=>{const b=e.target.closest('[data-mode]');if(b){ctx.timeMode=b.dataset.mode;mount();}};
 const keyboard=e=>{const b=e.target.closest('[data-mode]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const ids=Object.keys(modes),i=ids.indexOf(b.dataset.mode);ctx.timeMode=ids[e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3];mount();root.querySelector('[data-mode="'+ctx.timeMode+'"]').focus();};
 const tick=()=>{mount();for(const [id,t] of [['timer',ctx.timer],['focus',ctx.focus],['breaks',ctx.breaks]]){const state=t.deadline?countdown(t.seconds()):t.due||t.completed?'Готово':'';root.querySelector('[data-mode-state="'+id+'"]').textContent=state;root.querySelector('[data-mode="'+id+'"]').classList.toggle('running',!!t.deadline);}};
 root.addEventListener('click',click);root.addEventListener('keydown',keyboard);tick();const interval=setInterval(tick,500);
 return ()=>{clearInterval(interval);cleanup();root.removeEventListener('click',click);root.removeEventListener('keydown',keyboard);};
}};
