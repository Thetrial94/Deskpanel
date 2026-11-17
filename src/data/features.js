export async function request(path,body){
 const response=await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-DeskPanel':'1'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
 const result=await response.json();
 if(!response.ok)throw Error(result.error||'request_failed');
 return result;
}
export class FeatureSource {
 constructor(path,interval=5000){this.path=path;this.interval=interval;this.snapshot={connection:'loading'};this.listeners=new Set();this.pending=false;this.refreshing=false;this.message='';this.visible=()=>{if(!document.hidden)this.refresh();};}
 emit(){for(const fn of this.listeners)fn(this.snapshot,this.pending,this.message);}
 subscribe(fn){
  this.listeners.add(fn);fn(this.snapshot,this.pending,this.message);
  if(this.listeners.size===1){this.refresh();this.timer=setInterval(()=>{if(!document.hidden)this.refresh();},this.interval);document.addEventListener('visibilitychange',this.visible);}
  return ()=>{this.listeners.delete(fn);if(!this.listeners.size){clearInterval(this.timer);document.removeEventListener('visibilitychange',this.visible);}};
 }
 async refresh(force=false){
  if(this.refreshing||(this.pending&&!force))return;
  this.refreshing=true;
  try{this.snapshot=await request(this.path);}
  catch(e){this.snapshot={connection:e.message==='pair_required'?'pair_required':'unavailable'};}
  finally{this.refreshing=false;this.emit();}
 }
 async command(data){
  if(this.pending)return;this.pending=true;this.message='Выполняем…';this.emit();
  try{await request(this.path,data);this.message='Готово';await this.refresh(true);}
  catch{this.message='Не удалось выполнить. Проверь подключение перед повтором.';}
  finally{this.pending=false;this.emit();}
 }
}
export function emptyState(root,state,noun){
 const pair=state.connection==='pair_required',loading=state.connection==='loading',missing=state.connection==='not_configured';
 root.innerHTML='<div class="feature-empty"><h2>'+(pair?'Подключи телефон':loading?'Загружаем…':missing?'Подключи '+noun:'Нет связи')+'</h2><p class="muted">'+(pair?'Введи код с компьютера в настройках панели.':missing?'Подключение настраивается на компьютере.':loading?'Получаем актуальные данные.':'Проверяем соединение. Данные появятся после восстановления связи.')+'</p><button class="button button-soft" data-settings>Настройки подключения</button></div>';
}
