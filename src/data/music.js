export class MusicSource {
  constructor() {
    this.snapshot={schemaVersion:1,connection:'loading',playback:'unknown',track:null};
    this.listeners=new Set();this.pending=false;this.refreshing=false;this.message='';
    this.onVisible=()=>{if(!document.hidden)this.refresh();};
  }
  emit() { for(const fn of this.listeners)fn(this.snapshot,this.pending,this.message); }
  subscribe(fn) {
    this.listeners.add(fn);fn(this.snapshot,this.pending,this.message);
    if(this.listeners.size===1){
      this.refresh();this.timer=setInterval(()=>{if(!document.hidden)this.refresh();},1000);
      document.addEventListener('visibilitychange',this.onVisible);
    }
    return ()=>{
      this.listeners.delete(fn);
      if(!this.listeners.size){clearInterval(this.timer);document.removeEventListener('visibilitychange',this.onVisible);}
    };
  }
  async refresh(force=false) {
    if(this.refreshing||this.pending){this.refreshQueued=this.refreshQueued||force;return;}
    this.refreshing=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch('/api/music',{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw Error();
      const data=await response.json();
      if(data.schemaVersion!==1||!['connected','starting','stopped','not_installed','different_installation','unavailable','unsupported'].includes(data.connection))throw Error();
      this.snapshot=data;
    } catch { this.snapshot={connection:'disconnected',playback:'unknown',track:null}; }
    finally {clearTimeout(timer);this.refreshing=false;this.emit();if(this.refreshQueued){this.refreshQueued=false;this.refresh(true);}}
  }
  async command(command,value) {
    if(this.pending)return;
    this.pending=true;this.message='Отправляем команду…';this.emit();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch('/api/music',{method:'POST',headers:{'Content-Type':'application/json','X-DeskPanel':'1'},body:JSON.stringify({command,value}),signal:controller.signal});
      const data=await response.json();
      if(!response.ok||!data.accepted)throw Error('rejected');
      this.message=command==='launch'?'Запускаем плеер на компьютере…':'Команда отправлена плееру';
    } catch(error) {
      this.message=error.message==='rejected'?'Команда не выполнена. Проверь плеер на компьютере.':'Не удалось подтвердить команду. Проверь плеер перед повторным нажатием.';
    } finally {clearTimeout(timer);await new Promise(resolve=>setTimeout(resolve,650));this.pending=false;await this.refresh();this.emit();}
  }
}
