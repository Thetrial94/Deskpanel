import { icon } from '../ui/icons.js';
import { formatTime, formatDate, mountTicker, escapeHTML } from '../core/dom.js';
export default {
  id:'overview', title:'Обзор', icon:'overview', accent:'lime',
  mount(root, ctx) {
    root.innerHTML = '<div class="overview-layout"><section class="overview-time"><div class="eyebrow"><span class="tiny-star">✳</span> ХОРОШО БЫТЬ ЗДЕСЬ</div><h1 class="greeting"></h1><div class="hero-clock" data-clock></div><div class="date-line" data-date></div><div class="day-track"><span></span></div><div class="day-caption"><span>ТВОЙ ДЕНЬ</span><span data-day-percent></span></div></section><section class="overview-right"><article class="weather-peek card"><div class="card-top"><span>За окном</span>'+icon('sun')+'</div><div data-weather-peek></div></article><div class="agent-peeks"><button class="agent-peek card" data-go="codex"><span class="agent-symbol codex-color">'+icon('codex')+'</span><strong>Codex</strong><span class="agent-status" data-peek="codex">Не подключен</span>'+icon('arrow','peek-arrow')+'</button><button class="agent-peek card" data-go="claude"><span class="agent-symbol claude-color">'+icon('claude')+'</span><strong>Claude</strong><span class="agent-status" data-peek="claude">Не подключен</span>'+icon('arrow','peek-arrow')+'</button></div></section></div>';
    const stopClock = mountTicker(root, () => {
      const now = new Date(), hour = now.getHours();
      root.querySelector('.greeting').textContent = hour < 6 ? 'Тихой ночи.' : hour < 12 ? 'Доброе утро.' : hour < 18 ? 'Хорошего дня.' : 'Добрый вечер.';
      root.querySelector('[data-clock]').textContent = formatTime(now, ctx.settings().showSeconds); root.querySelector('[data-clock]').classList.toggle('with-seconds', ctx.settings().showSeconds);
      root.querySelector('[data-date]').textContent = formatDate(now,{weekday:'long'});
      const progress = (hour*60+now.getMinutes())/1440;
      root.querySelector('.day-track span').style.width = progress*100+'%';
      root.querySelector('[data-day-percent]').textContent = Math.round(progress*100)+'%';
    });
    const stopWeather = ctx.weather.subscribe(state => {
      const target = root.querySelector('[data-weather-peek]');
      if (!state.city) target.innerHTML = '<div class="peek-temperature">—°</div><button class="text-button" data-settings>Выбрать город '+icon('arrow')+'</button>';
      else if (!state.data) target.innerHTML = '<div class="peek-temperature">—°</div><div class="muted">'+escapeHTML(state.city.name)+' · '+(state.loading ? 'Загрузка' : 'Нет данных')+'</div>';
      else target.innerHTML = '<div class="peek-temperature">'+Math.round(state.data.current.temperature_2m)+'°</div><div class="muted">'+escapeHTML(state.city.name)+(state.error ? ' · данные устарели' : '')+'</div>';
    });
    const stopAgents = ctx.agents.subscribe(data => {
      for (const id of ['codex','claude']) root.querySelector('[data-peek="'+id+'"]').textContent = data[id].connection === 'not_configured' ? 'Не подключен' : data[id].connection === 'disconnected' ? 'Нет связи' : data[id].sessions.length+' сессий';
    });
    return () => { stopClock(); stopWeather(); stopAgents(); };
  }
};
