import {escapeHTML as esc} from '../core/dom.js';
import {sessionStatus,agentConnection} from '../core/agent-labels.js';
export function createAgentScreen(id,name){return {
 id,title:name,icon:id,accent:id==='codex'?'mint':'peach',
 mount(root,ctx){
  root.innerHTML='<section class="agent-dashboard"><header class="screen-heading"><h1>'+name+'</h1><span data-connection class="muted"></span></header><div data-agent-body></div></section>';
  return ctx.agents.subscribe(snapshot=>{
   const state=snapshot[id],body=root.querySelector('[data-agent-body]');
   root.querySelector('[data-connection]').textContent=agentConnection[state.connection]||'Нет связи';
   if(state.connection!=='connected'){
    const note=state.connection==='pair_required'?'Введи код с компьютера в настройках панели.':state.connection==='awaiting_events'?'Открой Codex и отправь сообщение в чат. Если статус не появится, проверь подключение на компьютере.':state.connection==='disconnected'?'Проверь компьютер и подключение к панели.':id==='codex'?'Установи мост событий Codex на компьютере.':'Интеграция Claude пока не настроена.';
    body.innerHTML='<div class="functional-empty"><h2>'+esc(agentConnection[state.connection]||'Нет связи')+'</h2><p>'+note+'</p>'+(state.connection==='pair_required'?'<button class="button button-primary" data-settings>Подключить телефон</button>':'<button class="button button-soft" data-hide-screen="'+id+'">Убрать из автосмены</button>')+'</div>';return;
   }
   if(!state.sessions.length){body.innerHTML='<div class="functional-empty"><h2>Нет активных сессий</h2><p>Новые события появятся автоматически.</p></div>';return;}
   const rank={approval:0,waiting:0,working:1,stale:2,completed:3,interrupted:4,idle:5};
   const sessions=[...state.sessions].sort((a,b)=>(rank[a.status]??6)-(rank[b.status]??6));
   body.innerHTML='<div class="agent-session-grid">'+sessions.map((s,i)=>'<article class="card agent-session '+(!i?'primary-session ':'')+'state-'+esc(s.status)+'"><span class="session-status">'+esc(sessionStatus(s))+'</span><h2>'+esc(s.title||'Сессия')+'</h2><div class="session-meta"><span>Обновлено '+(s.updatedAt?new Date(s.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'—')+'</span></div></article>').join('')+'</div>';
  });
 }
};}
