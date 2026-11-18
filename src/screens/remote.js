import {computerPicker} from '../ui/computer-picker.js';
import {confirmAction} from '../ui/confirm.js';
import {emptyState} from '../data/features.js';
import {icon} from '../ui/icons.js';
export default {
 id:'remote',title:'Пульт',icon:'remote',accent:'peach',
 mount(root,ctx){
  root.innerHTML='<section class="remote-dashboard"><header class="screen-heading"><h1>Пульт компьютера</h1></header><div class="computer-picker" data-computer-picker aria-label="Компьютер для пульта"></div><div data-remote></div></section>';
  const stopPicker=computerPicker(root.querySelector('[data-computer-picker]'),ctx.computers);
  const body=root.querySelector('[data-remote]');let last=null,editing=false;
  const handler=e=>{
   const button=e.target.closest('[data-action]');if(!button||button.disabled||!last)return;
   const command=button.dataset.action;
   if(command==='lock'){const target=ctx.remote.capture();confirmAction(root,'Заблокировать этот компьютер? Для возвращения потребуется вход в Windows.',()=>target.command({command:'lock',value:true}));return;}
   const value=command==='mute'?!last.audio.muted:command==='mic'?!last.mic.muted:command==='lock'?true:undefined;
   ctx.remote.command({command,value});
  };
  const change=e=>{if(e.target.matches('[data-system-volume]')){editing=false;ctx.remote.command({command:'volume',value:Number(e.target.value)});}};
  const input=e=>{if(e.target.matches('[data-system-volume]')){editing=true;body.querySelector('output').textContent=e.target.value+'%';}};
  root.addEventListener('click',handler);root.addEventListener('change',change);root.addEventListener('input',input);
  let rendered=false;
  const unsub=ctx.remote.subscribe((s,pending,message)=>{
   if(s.connection!=='connected'){last=null;rendered=false;emptyState(body,s,'пульт');return;}
   last=s;
   if(!rendered){body.innerHTML='<div class="card remote-card"><label for="system-volume">Громкость компьютера</label><div class="volume-line"><input id="system-volume" data-system-volume type="range" min="0" max="100" aria-label="Системная громкость"><output>—</output></div><div class="remote-grid"><button class="button button-soft" data-action="mute"></button><button class="button button-soft" data-action="mic"></button><button class="button button-soft" data-action="sound">'+icon('volume')+'Вывод звука</button><button class="button button-soft" data-action="lock">'+icon('lock')+'Блокировка</button></div><p class="settings-note">«Вывод звука» открывает настройки Windows на компьютере. Микрофон — устройство для звонков по умолчанию.</p><p data-command-feedback class="feature-feedback" role="status"></p></div>';rendered=true;}
   for(const b of body.querySelectorAll('button'))b.disabled=pending;
   const slider=body.querySelector('input');slider.disabled=pending||!s.audio;
   if(s.audio&&!pending&&!editing){slider.value=s.audio.volume;body.querySelector('output').textContent=s.audio.volume+'%';}
   const mute=body.querySelector('[data-action="mute"]'),mic=body.querySelector('[data-action="mic"]');
   mute.disabled=pending||!s.audio;mute.textContent=s.audio?.muted?'Включить звук':'Выключить звук';
   mic.disabled=pending||!s.mic;mic.textContent=s.mic?.muted?'Включить микрофон':'Выключить микрофон';
   body.querySelector('[data-command-feedback]').textContent=message;
  });
  return ()=>{unsub();stopPicker();root.removeEventListener('click',handler);root.removeEventListener('change',change);root.removeEventListener('input',input);};
 }
};
