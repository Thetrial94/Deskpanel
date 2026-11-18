import {confirmAction} from '../ui/confirm.js';
import {emptyState} from '../data/features.js';
import {escapeHTML as esc} from '../core/dom.js';
import {homeRooms,deviceType,deviceState} from '../core/home.js';
import {icon} from '../ui/icons.js';
let selectedRoom='all';
export default {
 id:'home',title:'Дом',icon:'home',accent:'gold',
 mount(root,ctx){
  root.innerHTML='<section class="home-layout structured-home"><div class="feature-heading"><div><span class="eyebrow" data-home-provider>ТВОЙ УМНЫЙ ДОМ</span><h1 class="feature-title">Умный дом</h1><p class="muted home-summary" data-home-summary></p></div><button class="text-button" data-settings>Подключение</button></div><nav class="room-tabs" aria-label="Комнаты" data-rooms></nav><div data-home-devices></div><p class="feature-feedback" data-home-feedback role="status"></p></section>';
  const body=root.querySelector('[data-home-devices]'),tabs=root.querySelector('[data-rooms]');let state=null,pending=false,lastMarkup='';
  const expanded=new Set();
  const render=()=>{
   if(!state)return;
   if(state.connection!=='connected'){tabs.innerHTML='';emptyState(body,state,'умный дом');lastMarkup='';return;}
   root.querySelector('[data-home-provider]').textContent=state.provider==='ha'?'HOME ASSISTANT':'ЯНДЕКС / АЛИСА';
   const devices=state.provider==='yandex'?state.devices.filter(d=>d.household?.name?.trim().toLocaleLowerCase('ru')==='квартира'):state.devices;
   const rooms=homeRooms(devices),houses=new Set(devices.map(d=>d.household?.id||''));
   if(selectedRoom!=='all'&&!rooms.some(r=>r.id===selectedRoom))selectedRoom='all';
   root.querySelector('[data-home-summary]').textContent='Комнат: '+rooms.length+' · устройств: '+devices.length+' · включено '+devices.filter(d=>d.on===true).length;
   const tabMarkup=[{id:'all',name:'Все комнаты'},...rooms].map(r=>'<button class="room-tab '+(selectedRoom===r.id?'selected':'')+'" data-room="'+esc(r.id)+'" aria-pressed="'+(selectedRoom===r.id)+'">'+esc(r.name)+(r.id!=='all'&&houses.size>1?' <small>'+esc(r.house)+'</small>':'')+'</button>').join('');if(tabs.innerHTML!==tabMarkup)tabs.innerHTML=tabMarkup;
   const card=d=>'<article class="card home-device '+(d.on===true?'device-on':'')+'"><div class="home-device-top"><span>'+esc(deviceType(d))+'</span>'+icon(d.controllable?'sun':'services')+'</div><h3>'+esc(d.name)+'</h3><p class="muted">'+esc(deviceState(d))+'</p>'+(d.controllable?'<button class="button button-soft" data-home-device="'+esc(d.id)+'" '+(pending?'disabled':'')+'>'+ (d.on===true?'Выключить':'Включить')+'</button>':'<span class="read-only-device">'+(d.kind?.includes('button')?'Последнее событие':'Только просмотр')+'</span>')+'</article>';
   const markup=rooms.filter(r=>selectedRoom==='all'||r.id===selectedRoom).map(r=>{
    const controls=r.devices.filter(d=>d.controllable),other=r.devices.filter(d=>!d.controllable);
    return '<section class="home-room"><header><div><span class="eyebrow">'+esc(houses.size>1?r.house:'КОМНАТА')+'</span><h2>'+esc(r.name)+'</h2></div><span class="muted">Устройств: '+r.devices.length+'</span></header>'+(controls.length?'<div class="home-grid">'+controls.map(card).join('')+'</div>':'')+(other.length?'<details class="home-other" data-details="'+esc(r.id)+'" '+(expanded.has(r.id)||!controls.length?'open':'')+'><summary>Датчики и другие устройства <span>'+other.length+'</span></summary><div class="home-grid">'+other.map(card).join('')+'</div></details>':'')+'</section>';
   }).join('')||'<p class="muted">Устройств пока нет.</p>';
   if(markup!==lastMarkup){body.innerHTML=markup;lastMarkup=markup;}
  };
  const handler=e=>{
   const room=e.target.closest('[data-room]');if(room){selectedRoom=room.dataset.room;render();root.scrollTop=0;return;}
   const button=e.target.closest('[data-home-device]');if(!button||button.disabled)return;
   const device=state?.devices.find(d=>d.id===button.dataset.homeDevice);if(!device)return;
   const on=device.on!==true;
   confirmAction(root,(on?'Включить «':'Выключить «')+device.name+'»?',()=>ctx.home.command({id:device.id,on}));
  };
  const toggle=e=>{const id=e.target.dataset.details;if(!id)return;e.target.open?expanded.add(id):expanded.delete(id);};
  root.addEventListener('click',handler);root.addEventListener('toggle',toggle,true);
  const unsub=ctx.home.subscribe((s,busy,message)=>{state=s;pending=busy;root.querySelector('[data-home-feedback]').textContent=message;render();});
  return ()=>{unsub();root.removeEventListener('click',handler);root.removeEventListener('toggle',toggle,true);};
 }
};
