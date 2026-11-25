import {agentConnection} from '../core/agent-labels.js';
import {escapeHTML as esc} from '../core/dom.js';
const labels={connected:'Работает',not_configured:'Не подключён',loading:'Проверка…',unavailable:'Нет связи',disconnected:'Нет связи',pair_required:'Нужна привязка',stopped:'Плеер закрыт',awaiting_events:'Ждём событие',bridge_offline:'Мост не запущен',not_paired:'Не привязан',tv_offline:'ТВ не в сети'};
export default {id:'services',title:'Сервисы',icon:'services',accent:'blue',mount(root,ctx){
 root.innerHTML='<section class="service-dashboard"><header class="screen-heading"><h1>Подключения</h1><button class="text-button" data-settings>Настроить</button></header><div class="service-grid" data-services></div></section>';
 const entries=new Map([['computer',{name:'Компьютер'}],['calendar',{name:'Календарь'}],['home',{name:'Умный дом'}],['tv',{name:'Телевизор'}],['music',{name:'Музыка'}],['codex',{name:'Codex'}],['claude',{name:'Claude'}]]);
 const render=()=>{root.querySelector('[data-services]').innerHTML=[...entries].map(([id,s])=>'<button class="card service-item" data-go="'+id+'"><span>'+esc(s.name)+'</span><strong class="'+(s.connection==='connected'?'service-ok':'')+'">'+esc(labels[s.connection]||agentConnection[s.connection]||'Проверка…')+'</strong></button>').join('');};
 const stops=['computer','calendar','home','tv','music'].map(id=>ctx[id].subscribe(s=>{Object.assign(entries.get(id),s);render();}));
 stops.push(ctx.agents.subscribe(s=>{for(const id of ['codex','claude'])Object.assign(entries.get(id),s[id]);render();}));render();
 return ()=>stops.forEach(stop=>stop());
}};
