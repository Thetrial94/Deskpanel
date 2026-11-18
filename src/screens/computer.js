import {computerPicker} from '../ui/computer-picker.js';
import {escapeHTML as esc} from '../core/dom.js';
import {emptyState} from '../data/features.js';
export default {id:'computer',title:'Компьютеры',icon:'computer',accent:'mint',mount(root,ctx){
 root.innerHTML='<section class="computer-dashboard"><header class="screen-heading"><h1 data-computer-name>Компьютеры</h1><button class="text-button" data-settings>Подключения</button></header><div class="computer-picker" data-computer-picker aria-label="Выбрать компьютер"></div><div data-stats></div></section>';
 const stopPicker=computerPicker(root.querySelector('[data-computer-picker]'),ctx.computers);
 const stop=ctx.computer.subscribe(s=>{
  const body=root.querySelector('[data-stats]');if(s.connection!=='connected'){emptyState(body,s,'компьютер');return;}
  root.querySelector('[data-computer-name]').textContent=ctx.computers.snapshot.nodes?.find(n=>n.id===ctx.computers.selected)?.name||s.name;
  const percent=Math.round(s.memory.used/s.memory.total*100),gb=n=>(n/1073741824).toFixed(1),hours=Math.floor(s.uptime/3600),days=Math.floor(hours/24);
  body.innerHTML='<div class="computer-metrics"><article class="card metric"><span>Процессор</span><strong>'+(s.cpu===null?'—':s.cpu)+'<small>%</small></strong><div class="metric-bar"><i style="width:'+(s.cpu||0)+'%"></i></div></article><article class="card metric"><span>Память</span><strong>'+percent+'<small>%</small></strong><p>'+gb(s.memory.used)+' / '+gb(s.memory.total)+' ГБ</p></article><article class="card metric uptime-metric"><span>Без перезагрузки</span><strong>'+(days?days+'<small> дн</small>':hours+'<small> ч</small>')+'</strong><p>'+(days?hours%24+' часов':'')+'</p></article></div>';
 });
 return ()=>{stop();stopPicker();};
}};
