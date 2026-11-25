import {request} from '../data/features.js';
import {escapeHTML as esc} from '../core/dom.js';
import {tvConnectionLabel,tvSummary,tvProgress} from '../core/tv.js';
import {icon} from '../ui/icons.js';
const hints={
 bridge_offline:'На компьютере запусти мост couch-tv (папка TV Android/couch-tv, порт 5400). Адрес моста меняется в настройках подключения.',
 not_paired:'Один раз привяжи телевизор к мосту: стоя у ТВ, запусти bridge/pair_tv.py и введи код с экрана.',
 tv_offline:'Мост работает, но телевизор не отвечает. Проверь, что он в сети, или включи его кнопкой ниже.',
 pair_required:'Введи код с компьютера в настройках панели.',
 not_configured:'В настройках хаба выбери в поле «Телевизор» компьютер, на котором работает мост couch-tv.',
 node_offline:'Хаб не достучался до компьютера с мостом телевизора. Проверь, что он включён и DeskPanel на нём запущен.',
 node_pair_required:'Хаб потерял привязку к компьютеру с телевизором. Подключи этот компьютер в настройках хаба заново.'
};
const key=(name,label,extra='')=>'<button class="button button-soft tv-key '+extra+'" data-tv-key="'+name+'" aria-label="'+label+'">'+label+'</button>';
export default {
 id:'tv',title:'ТВ',icon:'tv',accent:'blue',
 mount(root,ctx){
  root.innerHTML='<section class="tv-screen"><div class="tv-main"><article class="card tv-now"><span class="eyebrow" data-tv-name>ТЕЛЕВИЗОР</span><h1 class="tv-title" data-tv-title>—</h1><p class="muted tv-detail" data-tv-detail></p><div class="tv-progress" data-tv-progress hidden><span></span></div><div class="tv-row"><button class="button button-soft" data-tv-power>'+icon('tv')+'<span>Включить</span></button><div class="tv-volume" aria-label="Громкость ТВ"><button class="button button-soft" data-tv-volume="down" aria-label="Тише">−</button><button class="button button-soft" data-tv-volume="mute" aria-label="Без звука">'+icon('volume')+'</button><button class="button button-soft" data-tv-volume="up" aria-label="Громче">+</button></div></div></article><div class="card tv-pad" aria-label="Пульт">'+
   '<div class="tv-dpad">'+key('up','▲','pad-up')+key('left','◀','pad-left')+key('ok','OK','pad-ok')+key('right','▶','pad-right')+key('down','▼','pad-down')+'</div>'+
   '<div class="tv-keys">'+key('back','Назад')+key('home','Домой')+key('play_pause','▶︎ ❚❚')+'</div></div></div>'+
   '<div class="tv-apps" data-tv-apps></div><div data-tv-empty></div><p class="feature-feedback" data-tv-feedback role="status"></p></section>';
  const q=s=>root.querySelector(s);let state=null,busy=false,lastApps='',feedbackTimer;
  const say=m=>{q('[data-tv-feedback]').textContent=m;clearTimeout(feedbackTimer);if(m)feedbackTimer=setTimeout(()=>q('[data-tv-feedback]').textContent='',3000);};
  const send=async(body,wait=false)=>{
   if(wait){if(busy)return;busy=true;render();}
   try{await request('/api/tv',body);say(wait?'Готово':'');}
   catch(e){say(e.message==='tv_unavailable'?'Телевизор не ответил.':'Не удалось выполнить команду.');}
   finally{if(wait){busy=false;}ctx.tv.refresh(true);}
  };
  const render=()=>{
   if(!state)return;
   const ok=state.connection==='connected',offline=state.connection==='tv_offline';
   q('.tv-main').hidden=!ok&&!offline;q('[data-tv-apps]').hidden=!ok||state.power==='off';
   const empty=q('[data-tv-empty]');
   if(!ok&&!offline)empty.innerHTML='<div class="feature-empty"><h2>'+esc(tvConnectionLabel(state.connection))+'</h2><p class="muted">'+esc(hints[state.connection]||'Проверяем соединение.')+'</p><button class="button button-soft" data-settings>Настройки подключения</button></div>';
   else empty.innerHTML='';
   if(!ok&&!offline)return;
   const sum=tvSummary(ok?state:{...state,connection:'connected',power:'off'});
   q('[data-tv-name]').textContent=(state.name||'Телевизор').toUpperCase()+(state.volume?.level!=null?' · ГРОМКОСТЬ '+state.volume.level:'');
   q('[data-tv-title]').textContent=offline?'Не в сети':sum.title;
   q('[data-tv-detail]').textContent=offline?'Можно попробовать включить':sum.detail;
   const progress=ok?tvProgress(state.playing):null;q('[data-tv-progress]').hidden=progress===null;if(progress!==null)q('[data-tv-progress] span').style.width=(progress*100).toFixed(1)+'%';
   const on=ok&&state.power==='on',power=q('[data-tv-power]');
   power.querySelector('span').textContent=state.waking?'Включаем…':on?'Выключить':'Включить';power.disabled=busy||state.waking;power.classList.toggle('tv-on',on);
   for(const b of root.querySelectorAll('[data-tv-key],[data-tv-volume]'))b.disabled=!on;
   q('[data-tv-volume="mute"]').setAttribute('aria-pressed',String(!!state.volume?.muted));
   const apps=(state.apps||[]).slice(0,8).map(a=>'<button class="card tv-app" data-tv-app="'+esc(a.id)+'"'+(a.colour?' style="--app:'+esc(a.colour)+'"':'')+'>'+esc(a.name)+'</button>').join('');
   if(apps!==lastApps){q('[data-tv-apps]').innerHTML=apps;lastApps=apps;}
   for(const b of root.querySelectorAll('[data-tv-app]'))b.disabled=!on;
  };
  const click=e=>{
   const k=e.target.closest('[data-tv-key]');if(k&&!k.disabled){send({command:'key',key:k.dataset.tvKey});return;}
   const v=e.target.closest('[data-tv-volume]');if(v&&!v.disabled){send({command:'volume',action:v.dataset.tvVolume});return;}
   const a=e.target.closest('[data-tv-app]');if(a&&!a.disabled){send({command:'launch',app:a.dataset.tvApp},true);return;}
   const p=e.target.closest('[data-tv-power]');if(p&&!p.disabled){const on=state?.connection==='connected'&&state.power==='on';say(on?'Выключаем…':'Включаем… это может занять до 30 секунд.');send({command:'power',state:on?'off':'on'},true);}
  };
  root.addEventListener('click',click);
  const unsub=ctx.tv.subscribe(s=>{state=s;render();});
  return ()=>{unsub();clearTimeout(feedbackTimer);root.removeEventListener('click',click);};
 }
};
