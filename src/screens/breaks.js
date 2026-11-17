import {mountTicker} from '../core/dom.js';
export default {
 id:'breaks',title:'Перерывы',icon:'breaks',accent:'lavender',
 mount(root,ctx){
  root.innerHTML='<section class="focus-layout"><div class="focus-copy"><span class="eyebrow">ПЕРЕРЫВЫ</span><h1 data-break-title></h1><p class="muted" data-break-tip></p><div class="break-settings"><label>Работа<select data-work>'+[25,40,50,60,90].map(n=>'<option value="'+n+'">'+n+' мин</option>').join('')+'</select></label><label>Отдых<select data-rest>'+[3,5,10,15].map(n=>'<option value="'+n+'">'+n+' мин</option>').join('')+'</select></label></div></div><div class="focus-face"><div class="timer-ring"><svg viewBox="0 0 300 300" aria-hidden="true"><circle class="ring-track" cx="150" cy="150" r="138"/><circle class="ring-progress" cx="150" cy="150" r="138"/></svg><div class="timer-center"><span class="eyebrow" data-break-phase></span><div class="timer-digits"></div><span class="muted small" data-break-count></span></div></div><div class="timer-controls"><button class="button button-primary" data-break-toggle></button><button class="button button-soft" data-break-reset>Сбросить</button></div></div></section>';
  root.querySelector('[data-work]').value=ctx.breaks.work;root.querySelector('[data-rest]').value=ctx.breaks.rest;
  const render=()=>{
   const t=ctx.breaks,seconds=t.seconds();
   root.querySelector('[data-break-title]').textContent=t.phase==='rest'?'Отдых':t.due?'Пора отдохнуть':'Рабочий интервал';
   root.querySelector('[data-break-tip]').textContent=t.phase==='rest'?'Встань и разомнись.':'';
   root.querySelector('[data-break-phase]').textContent=t.phase==='rest'?'ОТДЫХ':'РАБОТА';
   root.querySelector('.timer-digits').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
   root.querySelector('.ring-progress').style.strokeDashoffset=867*(1-seconds/(t.duration()*60));
   root.querySelector('[data-break-count]').textContent='Перерывов завершено: '+t.cycles;
   root.querySelector('[data-break-toggle]').textContent=t.deadline?'Пауза':t.due?(t.phase==='work'?'Отдохнуть':'К работе'):'Начать';
  };
  const click=e=>{if(e.target.closest('[data-break-toggle]'))ctx.breaks.deadline?ctx.breaks.pause():ctx.breaks.start();if(e.target.closest('[data-break-reset]'))ctx.breaks.reset();render();};
  const change=()=>{ctx.breaks.configure(Number(root.querySelector('[data-work]').value),Number(root.querySelector('[data-rest]').value));render();};
  root.addEventListener('click',click);root.addEventListener('change',change);const stop=mountTicker(root,render,500);
  return ()=>{stop();root.removeEventListener('click',click);root.removeEventListener('change',change);};
 }
};
