import {confirmAction} from '../ui/confirm.js';
import {emptyState} from '../data/features.js';
import {escapeHTML} from '../core/dom.js';
export default {
 id:'home',title:'Дом',icon:'home',accent:'gold',
 mount(root,ctx){
  root.innerHTML='<section class="home-layout"><div class="feature-heading"><div><span class="eyebrow" data-home-provider>ТВОЙ УМНЫЙ ДОМ</span><h1 class="feature-title">Твой дом.</h1></div><button class="text-button" data-settings>Подключение</button></div><div data-home-devices></div><p class="feature-feedback" data-home-feedback role="status"></p></section>';
  const body=root.querySelector('[data-home-devices]');let state=null;
  const handler=e=>{
   const button=e.target.closest('[data-home-device]');if(!button||button.disabled)return;
   const device=state?.devices.find(d=>d.id===button.dataset.homeDevice);if(!device)return;
   const on=device.on!==true;
   confirmAction(root,(on?'Включить «':'Выключить «')+device.name+'»?',()=>ctx.home.command({id:device.id,on}));
  };
  root.addEventListener('click',handler);
  const unsub=ctx.home.subscribe((s,pending,message)=>{
   state=s;root.querySelector('[data-home-feedback]').textContent=message;
   if(s.connection!=='connected'){emptyState(body,s,'умный дом');return;}
   root.querySelector('[data-home-provider]').textContent=s.provider==='ha'?'HOME ASSISTANT':'ЯНДЕКС / АЛИСА';
   if(!s.devices.length){body.innerHTML='<p class="muted">Устройств пока нет.</p>';return;}
   body.innerHTML='<div class="home-grid">'+s.devices.map(d=>'<article class="card home-device"><h2>'+escapeHTML(d.name)+'</h2><p class="muted">'+escapeHTML(d.value||(d.on===true?'Включено':d.on===false?'Выключено':'Состояние неизвестно'))+'</p>'+(d.controllable?'<button class="button button-soft" data-home-device="'+escapeHTML(d.id)+'" '+(pending?'disabled':'')+'>'+(d.on===true?'Выключить':'Включить')+'</button>':'')+'</article>').join('')+'</div>';
  });
  return ()=>{unsub();root.removeEventListener('click',handler);};
 }
};
