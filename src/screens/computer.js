import {escapeHTML} from '../core/dom.js';
import {emptyState} from '../data/features.js';
export default {
 id:'computer',title:'Компьютеры',icon:'computer',accent:'mint',
 mount(root,ctx){
  root.innerHTML='<section class="device-layout"><div><span class="eyebrow">ТВОЁ РАБОЧЕЕ МЕСТО</span><h1 class="feature-title">Компьютеры</h1><div data-devices></div><p class="muted feature-note">При выборе другого компьютера откроется его панель.</p><button class="text-button" data-settings>Добавить компьютер</button></div><div data-stats></div></section>';
  root.querySelector('[data-devices]').innerHTML='<div class="device-current">Этот компьютер<span>Подключён</span></div>'+ctx.settings().devices.map(d=>'<a class="device-link" href="'+escapeHTML(d.url)+'/#computer">'+escapeHTML(d.name)+'<span>Открыть →</span></a>').join('');
  const body=root.querySelector('[data-stats]');
  return ctx.computer.subscribe(s=>{
   if(s.connection!=='connected'){emptyState(body,s,'компьютер');return;}
   const percent=Math.round(s.memory.used/s.memory.total*100),gb=n=>(n/1073741824).toFixed(1);
   const hours=Math.floor(s.uptime/3600),days=Math.floor(hours/24);
   body.innerHTML='<div class="computer-name">'+escapeHTML(s.name)+' <span class="muted">· '+escapeHTML(s.platform)+'</span></div><div class="metric-grid"><article class="card metric"><span>Процессор</span><strong>'+(s.cpu===null?'—':s.cpu)+'<small>%</small></strong><div class="metric-bar"><i style="width:'+(s.cpu||0)+'%"></i></div><p>'+s.cores+' логических ядер</p></article><article class="card metric"><span>Память</span><strong>'+percent+'<small>%</small></strong><div class="metric-bar"><i style="width:'+percent+'%"></i></div><p>'+gb(s.memory.used)+' / '+gb(s.memory.total)+' ГБ</p></article></div><div class="card uptime"><span class="muted">Без перезагрузки</span><strong>'+(days?days+' дн · ':'')+(hours%24)+' ч</strong></div>';
  });
 }
};
