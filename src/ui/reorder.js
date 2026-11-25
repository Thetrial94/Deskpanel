// Pointer capture keeps touch reordering separate from ordinary settings scrolling.
export function setupScreenReorder(root,onMove){
 let drag=null,frame=null;
 const rows=()=>[...root.querySelectorAll('[data-screen-order-id]')];
 const clearMarks=()=>rows().forEach(n=>n.classList.remove('drop-before','drop-after'));
 function update(){
  if(!drag?.moved)return;
  const box=drag.scroller?.getBoundingClientRect();
  if(box){const delta=drag.y<box.top+40?-8:drag.y>box.bottom-40?8:0;if(delta)drag.scroller.scrollTop+=delta;}
  const others=rows().filter(n=>n!==drag.row);
  const index=others.findIndex(n=>drag.y<n.getBoundingClientRect().top+n.getBoundingClientRect().height/2);
  drag.to=index<0?others.length:index;
  clearMarks();
  if(index<0)others.at(-1)?.classList.add('drop-after');else others[index].classList.add('drop-before');
  frame=requestAnimationFrame(update);
 }
 function finish(commit){
  if(!drag)return;
  const saved=drag;drag=null;cancelAnimationFrame(frame);clearMarks();saved.row.classList.remove('is-dragging');saved.handle.setAttribute('aria-pressed','false');
  if(saved.handle.hasPointerCapture(saved.pointer))saved.handle.releasePointerCapture(saved.pointer);
  if(commit&&saved.moved)onMove(saved.id,saved.to);
 }
 const down=e=>{
  const handle=e.target.closest('[data-drag-screen]');if(!handle||e.button>0||e.isPrimary===false)return;
  finish(false);const row=handle.closest('[data-screen-order-id]');
  drag={id:handle.dataset.dragScreen,row,handle,pointer:e.pointerId,start:e.clientY,y:e.clientY,to:rows().indexOf(row),moved:false,scroller:root.closest('.settings-body')};
  handle.setPointerCapture(e.pointerId);handle.setAttribute('aria-pressed','true');e.preventDefault();
 };
 const move=e=>{if(!drag||drag.pointer!==e.pointerId)return;drag.y=e.clientY;if(!drag.moved&&Math.abs(e.clientY-drag.start)>6){drag.moved=true;drag.row.classList.add('is-dragging');update();}e.preventDefault();};
 const up=e=>{if(drag?.pointer===e.pointerId)finish(true);};
 const cancel=()=>finish(false);
 const key=e=>{
  if(e.key==='Escape'&&drag){e.preventDefault();e.stopPropagation();finish(false);return;}
  const handle=e.target.closest('[data-drag-screen]');if(!handle||!['ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();const index=rows().findIndex(n=>n.dataset.screenOrderId===handle.dataset.dragScreen);onMove(handle.dataset.dragScreen,index+(e.key==='ArrowUp'?-1:1));
 };
 root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);root.addEventListener('lostpointercapture',cancel);root.addEventListener('keydown',key);
 root.closest('dialog')?.addEventListener('close',cancel);
 return ()=>{finish(false);root.removeEventListener('pointerdown',down);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',cancel);root.removeEventListener('lostpointercapture',cancel);root.removeEventListener('keydown',key);root.closest('dialog')?.removeEventListener('close',cancel);};
}
