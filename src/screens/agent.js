import { icon } from '../ui/icons.js';
import { escapeHTML } from '../core/dom.js';
export function createAgentScreen(id, name) {
  return {
    id,title:name,icon:id,accent:id === 'codex'?'mint':'peach',
    mount(root,ctx) {
      root.innerHTML = '<section class="agent-layout"><div class="agent-intro"><span class="eyebrow">ТВОЙ ИИ-НАПАРНИК</span><div class="agent-title">'+icon(id)+'<h1>'+name+'</h1></div><p class="agent-tagline">Работа в фокусе.<br><span class="muted">Даже краем глаза.</span></p><div class="connection-badge" data-connection><i></i>Не подключен</div></div><div class="agent-content"><div class="card agent-current"><div class="card-top"><span>Текущая работа</span>'+icon('link')+'</div><div data-agent-body></div></div><div class="agent-stat-grid"><div class="card"><span class="muted">Сессии</span><strong data-session-count>—</strong></div><div class="card"><span class="muted">Обновление</span><strong class="stat-small" data-agent-updated>—</strong></div></div></div></section>';
      return ctx.agents.subscribe(snapshot => {
        const state = snapshot[id], connected = state.connection === 'connected';
        root.querySelector('[data-connection]').innerHTML = '<i class="'+(connected?'connected':'')+'"></i>'+(connected?'Подключен':state.connection === 'disconnected'?'Нет связи с компьютером':'Не подключен');
        root.querySelector('[data-session-count]').textContent = connected ? state.sessions.length : '—';
        root.querySelector('[data-agent-updated]').textContent = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}) : '—';
        const body = root.querySelector('[data-agent-body]');
        if (!connected) body.innerHTML = '<div class="empty-session-mark">'+icon(id)+'</div><h2>Здесь появятся<br>твои задачи</h2><p class="muted">После подключения '+name+' покажет,<br>что делает и когда ему нужен ты.</p>';
        else if (!state.sessions.length) body.innerHTML = '<div class="empty-session-mark">'+icon('check')+'</div><h2>Нет активных сессий</h2><p class="muted">Новые задачи появятся здесь.</p>';
        else body.innerHTML = '<div class="session-list">'+state.sessions.map(s => '<article><h3>'+escapeHTML(s.title || 'Сессия')+'</h3><p>'+escapeHTML(({working:'Работает',waiting:'Ждет твоего ответа',completed:'Завершено',error:'Ошибка',idle:'Ожидает задачу'})[s.status] || 'Статус неизвестен')+'</p></article>').join('')+'</div>';
      });
    }
  };
}
