import {escapeHTML as esc} from '../core/dom.js';
export function computerPicker(root,computers,{music=false,onChange=()=>{},source=null}={}){
 let state=null,busy=false,last='';
 const render=()=>{
  if(!state)return;
  const nodes=state.nodes||[],selected=music?state.bindings?.music:state.selected;
  const markup=nodes.map(n=>'<button type="button" class="computer-choice '+(n.id===selected?'selected':'')+'" data-target="'+esc(n.id)+'" aria-pressed="'+(n.id===selected)+'" '+(busy||music&&source?.pending?'disabled':'')+'><span>'+esc(n.name)+'</span><small>'+(n.connection==='connected'?'В сети':n.connection==='pair_required'?'Нужна привязка':'Нет связи')+'</small></button>').join('');
  if(last!==markup){root.innerHTML=markup||'<button class="text-button" data-settings>Подключить компьютер</button>';last=markup;}
 };
 const handler=async e=>{
  const button=e.target.closest('[data-target]');if(!button||button.disabled)return;
  if(!music){computers.select(button.dataset.target);onChange();return;}
  busy=true;render();
  try{await computers.selectMusic(button.dataset.target);onChange();}
  catch{root.setAttribute('aria-label','Не удалось выбрать компьютер для музыки');}
  finally{busy=false;render();}
 };
 root.addEventListener('click',handler);const stop=computers.subscribe(s=>{state=s;render();}),stopSource=source?.subscribe(()=>render());
 return ()=>{stop();stopSource?.();root.removeEventListener('click',handler);};
}
