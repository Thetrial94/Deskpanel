import { icon } from '../ui/icons.js';
import { escapeHTML, formatTime } from '../core/dom.js';
import { weatherLabel, weatherIcon } from '../data/weather.js';
export default {
  id:'weather',title:'Погода',icon:'weather',accent:'blue',
  mount(root,ctx) {
    const stop = ctx.weather.subscribe(state => {
      if (!state.city) {
        root.innerHTML = '<section class="weather-empty"><div class="weather-orb" aria-hidden="true">'+icon('sun')+'</div><span class="eyebrow">ЧТО ТАМ ЗА ОКНОМ?</span><h1>Погода рядом.</h1><p class="muted">Выбери город, и прогноз будет здесь.</p><button class="button button-primary" data-settings>'+icon('pin')+' Выбрать город</button></section>';
        return;
      }
      if (!state.data) {
        root.innerHTML = '<section class="weather-empty"><div class="weather-orb" aria-hidden="true">'+icon('weather')+'</div><span class="eyebrow">'+escapeHTML(state.city.name)+'</span><h1>'+(state.loading ? 'Смотрим за окно…' : 'Прогноз недоступен')+'</h1><p class="muted">'+(state.error || 'Получаем текущую погоду и прогноз')+'</p><button class="button button-soft" data-weather-refresh '+(state.loading?'disabled':'')+'>Обновить</button></section>';
        return;
      }
      const current = state.data.current, daily = state.data.daily;
      const days = daily.time.map((day,i) => '<div class="forecast-day"><span>'+new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(new Date(day+'T12:00:00'))+'</span>'+icon(weatherIcon(daily.weather_code[i]))+'<div><strong>'+Math.round(daily.temperature_2m_max[i])+'°</strong><span>'+Math.round(daily.temperature_2m_min[i])+'°</span></div></div>').join('');
      root.innerHTML = '<section class="weather-layout"><div class="weather-main"><div class="eyebrow">'+icon('pin')+escapeHTML(state.city.name)+'</div><div class="weather-current"><h1>'+Math.round(current.temperature_2m)+'<sup>°</sup></h1><div class="weather-large-icon">'+icon(weatherIcon(current.weather_code))+'</div></div><h2>'+weatherLabel(current.weather_code)+'</h2><p class="muted">Ощущается как '+Math.round(current.apparent_temperature)+'°</p></div><div class="weather-details"><div class="weather-metrics"><div class="card"><span class="muted">Ветер</span><strong>'+Math.round(current.wind_speed_10m)+' <small>км/ч</small></strong></div><div class="card"><span class="muted">Влажность</span><strong>'+current.relative_humidity_2m+'<small>%</small></strong></div></div><div class="card forecast"><div class="eyebrow">БЛИЖАЙШИЕ ДНИ</div><div class="forecast-row">'+days+'</div></div><div class="weather-attribution"><span>'+(state.error ? 'Нет связи · последнее обновление ' : 'Обновлено ')+formatTime(new Date(state.updatedAt))+'</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a><button class="text-button" data-weather-refresh>Обновить</button></div></div></section>';
    });
    const handler = e => { if (e.target.closest('[data-weather-refresh]')) ctx.weather.refresh(true); };
    root.addEventListener('click',handler);
    return () => { stop(); root.removeEventListener('click',handler); };
  }
};
