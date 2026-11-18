import {sortSessions,agentSummary} from './agent-view.js';
import {sessionStatus} from './agent-labels.js';
export const OVERVIEW_MODULES=Object.freeze([
 {id:'clock',title:'Часы и погода',description:'Время, дата, город и температура'},
 {id:'primary',title:'Главное',description:'Ближайшее событие, таймер или вопрос агента'},
 {id:'music',title:'Музыка',description:'Текущий трек и управление, когда музыка играет'},
 {id:'codex',title:'Codex',description:'Активные сессии и их состояния'},
 {id:'claude',title:'Claude',description:'Активные сессии и их состояния'}
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
