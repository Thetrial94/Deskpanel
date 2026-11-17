import {escapeHTML} from '../core/dom.js';
export function confirmAction(root,message,accept){
 if(root.querySelector('.action-confirm'))return;
 const panel=document.createElement('div');panel.className='action-confirm';panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',message);
 panel.innerHTML='<div class="card"><h2>Подтверди действие</h2><p>'+escapeHTML(message)+'</p><div><button class="button button-soft" data-cancel>Отмена</button><button class="button button-primary" data-confirm>Подтвердить</button></div></div>';
 const previous=document.activeElement,restore=()=>{panel.remove();previous?.focus();};
 panel.querySelector('[data-cancel]').addEventListener('click',restore);
 panel.querySelector('[data-confirm]').addEventListener('click',()=>{restore();accept();});
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();restore();}if(e.key==='Tab'){e.preventDefault();(document.activeElement===panel.querySelector('[data-cancel]')?panel.querySelector('[data-confirm]'):panel.querySelector('[data-cancel]')).focus();}});
 root.append(panel);panel.querySelector('[data-cancel]').focus();
}
