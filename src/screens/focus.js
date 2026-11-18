import { icon } from '../ui/icons.js';
import { mountTicker } from '../core/dom.js';
export default {
  id:'focus',title:'Фокус',icon:'focus',accent:'lavender',
  mount(root,ctx) {
    root.innerHTML = '<section class="focus-layout"><div class="focus-copy"><h2>Фокус без отвлечений</h2><div class="duration-options">'+[15,25,45,60].map(n=>'<button data-duration="'+n+'" class="duration-button">'+n+' мин</button>').join('')+'</div></div><div class="focus-face"><div class="timer-ring"><svg viewBox="0 0 300 300" aria-hidden="true"><circle class="ring-track" cx="150" cy="150" r="138"/><circle class="ring-progress" cx="150" cy="150" r="138"/></svg><div class="timer-center"><span class="eyebrow" data-timer-state></span><div class="timer-digits"></div><span class="muted small" data-timer-caption></span></div></div><div class="timer-controls"><button class="button button-primary" data-timer-toggle></button><button class="button button-soft reset-button" data-timer-reset>Сбросить</button></div></div></section>';
    const render = () => {
      const seconds = ctx.focus.seconds(), minutes = Math.floor(seconds/60);
      root.querySelector('.timer-digits').textContent = String(minutes).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
      root.querySelector('.ring-progress').style.strokeDashoffset = 867*(1-seconds/(ctx.focus.duration*60));
      root.querySelector('[data-timer-state]').textContent = ctx.focus.completed ? 'ГОТОВО' : ctx.focus.deadline ? 'В ФОКУСЕ' : 'ФОКУС';
      root.querySelector('[data-timer-caption]').textContent = ctx.focus.completed ? 'Пора немного отдохнуть' : ctx.focus.deadline ? 'Таймер запущен' : 'Готов к запуску';
      root.querySelector('[data-timer-toggle]').innerHTML = icon(ctx.focus.deadline?'pause':'play')+(ctx.focus.deadline?'Пауза':ctx.focus.completed?'Еще раз':'Начать');
      for (const button of root.querySelectorAll('[data-duration]')) { button.classList.toggle('selected',Number(button.dataset.duration)===ctx.focus.duration); button.setAttribute('aria-pressed',String(Number(button.dataset.duration)===ctx.focus.duration)); }
    };
    const stop = mountTicker(root,render,250);
    const handler = e => {
      if (e.target.closest('[data-timer-toggle]')) { ctx.focus.deadline ? ctx.focus.pause() : ctx.focus.start(); render(); }
      if (e.target.closest('[data-timer-reset]')) { ctx.focus.reset(); render(); }
      const duration = e.target.closest('[data-duration]');
      if (duration) { ctx.focus.setDuration(Number(duration.dataset.duration)); render(); }
    };
    root.addEventListener('click',handler);
    return () => { stop(); root.removeEventListener('click',handler); };
  }
};
