import {Worker} from 'node:worker_threads';
export function parseCalendar(text,now=Date.now()){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./calendar-worker.mjs',import.meta.url),{workerData:{text,now},execArgv:[],stdout:true,stderr:true,resourceLimits:{maxOldGenerationSizeMb:64}});
  worker.stdout.resume();worker.stderr.resume();
  const timer=setTimeout(()=>{worker.terminate();reject(Error('calendar_timeout'));},5000);
  worker.once('message',data=>{clearTimeout(timer);worker.terminate();data.error?reject(Error(data.error)):resolve(data.events);});
  worker.once('error',()=>{clearTimeout(timer);reject(Error('invalid_calendar'));});
 });
}
export class Calendar {
 constructor(store,fetcher=fetch){this.store=store;this.fetcher=fetcher;this.cache=null;this.pending=null;}
 clear(){this.cache=null;}
 async status(){
  const config=(await this.store.get()).calendar;
  if(!config)return {connection:'not_configured',events:[]};
  if(this.cache?.url===config.url&&Date.now()-this.cache.at<300000)return this.cache.result;
  if(this.pending)return this.pending;
  this.pending=(async()=>{
   try {
    const response=await this.fetcher(config.url,{signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw Error('fetch_failed');
    const reader=response.body.getReader();let size=0;const chunks=[];
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw Error('calendar_too_large');}chunks.push(value);}
    const text=Buffer.concat(chunks).toString('utf8');if(!text.includes('BEGIN:VCALENDAR'))throw Error('invalid_calendar');
    const result={connection:'connected',events:await parseCalendar(text),updatedAt:new Date().toISOString()};
    this.cache={url:config.url,at:Date.now(),result};return result;
   }catch{return {connection:'unavailable',events:[],updatedAt:null};}
   finally{this.pending=null;}
  })();return this.pending;
 }
}
