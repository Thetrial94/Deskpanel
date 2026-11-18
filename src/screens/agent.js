import {escapeHTML as esc} from '../core/dom.js';
import {sessionStatus,agentConnection} from '../core/agent-labels.js';
import {agentUsageHTML} from '../core/agent-usage-view.js';
import {sessionGroups,agentSummary,statusAge} from '../core/agent-view.js';
export function createAgentScreen(id,name){return {
 id,title:name,icon:id,accent:id==='codex'?'mint':'peach',
 mount(root,ctx){
  root.innerHTML='<section class="agent-dashboard"><header class="screen-heading"><h1>'+name+'</h1><span data-connection class="muted"></span></header><div class="agent-quotas" data-agent-usage aria-label="Лимиты аккаунта"></div><p class="agent-summary" data-summary></p><div data-agent-body></div></section>';
  let current=[],usage;
  const refreshUsage=()=>{root.querySelector('[data-agent-usage]').innerHTML=agentUsageHTML(usage);};
  const refreshAges=()=>root.querySelectorAll('[data-session-age]').forEach(node=>{const s=current.find(s=>s.id===node.dataset.sessionAge);if(s)node.textContent=statusAge(s);});
  const unsubscribe=ctx.agents.subscribe(snapshot=>{
   const state=snapshot[id],body=root.querySelector('[data-agent-body]');current=state.sessions;usage=['connected','awaiting_events'].includes(state.connection)?state.usage:null;refreshUsage();
   root.querySelector('[data-connection]').textContent=(state.source?.name?state.source.name+' · ':'')+(agentConnection[state.connection]||'Нет связи');
   root.querySelector('[data-summary]').textContent=state.connection==='connected'?agentSummary(current):'';
   if(state.connection!=='connected'){
    const note=state.connection==='pair_required'?'Введи код с компьютера в настройках панели.':state.connection==='awaiting_events'?'Открой '+name+' и отправь сообщение в чат. Если статус не появится, проверь подключение на компьютере.':state.connection==='disconnected'?'Проверь компьютер и подключение к панели.':'Установи мост событий '+name+' на компьютере.';
    body.innerHTML='<div class="functional-empty"><h2>'+esc(agentConnection[state.connection]||'Нет связи')+'</h2><p>'+note+'</p>'+(state.connection==='pair_required'?'<button class="button button-primary" data-settings>Подключить телефон</button>':'<button class="button button-soft" data-hide-screen="'+id+'">Убрать из автосмены</button>')+'</div>';return;
   }
   if(!current.length){body.innerHTML='<div class="functional-empty"><h2>Нет активных сессий</h2><p>Новые события появятся автоматически.</p></div>';return;}
   body.innerHTML=sessionGroups(current).map(group=>'<section class="agent-group group-'+group.id+'"><h2 class="agent-group-title">'+group.title+' <span>'+group.sessions.length+'</span></h2><div class="agent-session-grid">'+group.sessions.map(s=>'<article class="card agent-session state-'+esc(s.status)+'"><div class="session-status-line"><span class="session-status">'+esc(sessionStatus(s))+'</span><span class="session-age" data-session-age="'+esc(s.id)+'">'+esc(statusAge(s))+'</span></div><h3 title="'+esc(s.title||'Сессия')+'">'+esc(s.title||'Сессия')+'</h3></article>').join('')+'</div></section>').join('');
  });
  const timer=setInterval(()=>{refreshAges();refreshUsage();},10000);
  return ()=>{clearInterval(timer);unsubscribe();};
 }
};}
