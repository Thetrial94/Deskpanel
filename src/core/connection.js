// Read-only health checks. Commands are never queued or replayed on reconnect.
export class ServerConnection {
 constructor({fetcher=(...args)=>globalThis.fetch(...args),now=Date.now,schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id),onRecover=()=>{}}={}){
  Object.assign(this,{fetcher,now,schedule,cancel,onRecover});this.listeners=new Set();
  this.state={status:'connecting',reason:null,lastSuccess:null,failures:0};this.running=false;this.online=true;this.pending=null;this.generation=0;
 }
 subscribe(fn){this.listeners.add(fn);fn(this.state);return ()=>this.listeners.delete(fn);}
 emit(state){this.state={...this.state,...state};for(const fn of this.listeners)fn(this.state);}
 start(){if(this.running)return;this.running=true;return this.check();}
 stop(){this.running=false;this.generation++;this.cancel(this.timer);this.pending?.abort();this.pending=null;}
 setOnline(online){
  this.online=online;
  if(!online){this.generation++;this.cancel(this.timer);this.pending?.abort();this.pending=null;this.emit({status:'offline',reason:'network'});}
  else if(this.running)return this.check();
 }
 async check(){
  if(!this.running||!this.online||this.pending)return;
  this.cancel(this.timer);const controller=new AbortController(),generation=++this.generation;this.pending=controller;
  const timeout=this.schedule(()=>controller.abort(),4000);let recovered=false;
  try{
   const response=await this.fetcher('/api/health',{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('unavailable');const data=await response.json();
   if(data.ok!==true||data.app!=='deskpanel')throw Error('invalid');
   if(generation!==this.generation)return;
   recovered=this.state.status==='offline';this.emit({status:'connected',reason:null,lastSuccess:this.now(),failures:0});
  }catch{
   if(generation!==this.generation)return;
   this.emit({status:'offline',reason:'server',failures:this.state.failures+1});
  }finally{
   this.cancel(timeout);
   if(generation===this.generation){this.pending=null;if(this.running&&this.online)this.timer=this.schedule(()=>this.check(),this.state.status==='connected'?5000:Math.min(15000,2000*2**Math.min(this.state.failures-1,3)));}
  }
  if(recovered)this.onRecover();
 }
}
