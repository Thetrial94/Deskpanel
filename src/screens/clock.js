import { formatTime, formatDate, mountTicker } from '../core/dom.js';
export default {
  id:'clock',title:'Часы',icon:'clock',accent:'lime',
  mount(root,ctx) {
    root.innerHTML = '<section class="clock-layout"><span class="eyebrow">У ВСЕГО СВОЕ ВРЕМЯ</span><h1 class="giant-clock" aria-label="Текущее время"></h1><div class="clock-date"></div><div class="clock-line"><span></span><span class="small muted">сейчас — хороший момент</span><span></span></div></section>';
    return mountTicker(root, () => {
      root.querySelector('.giant-clock').textContent = formatTime(new Date(),ctx.settings().showSeconds); root.querySelector('.giant-clock').classList.toggle('with-seconds',ctx.settings().showSeconds);
      root.querySelector('.clock-date').textContent = formatDate(new Date(),{weekday:'long',year:'numeric'});
    });
  }
};
