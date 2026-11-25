// Television through the couch-tv bridge (github.com/Seagey/couch-tv, bridge/API.md).
// The bridge is the only thing that talks to the TV; DeskPanel forwards a fixed set of commands.
export const DEFAULT_TV_BRIDGE='http://127.0.0.1:5400';
export const TV_KEYS=Object.freeze(['up','down','left','right','ok','back','home','play_pause','next','previous','rewind','fast_forward','input','settings','captions']);
export const COMMON_APPS=Object.freeze(['youtube','netflix','spotify','twitch','moonlight','settings']);
const short=(x,n=120)=>typeof x==='string'?x.slice(0,n):null;
const num=x=>Number.isFinite(x)?x:null;
export function tvBridgeURL(value){
 const u=new URL(value);
 const privateHost=/^(localhost|[a-z0-9-]+\.local|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(u.hostname);
 if(u.protocol!=='http:'||!privateHost||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('invalid_tv_url');
 return u.origin;
}
export function mapNow(now,tvs){
 const tv=tvs?.tvs?.find(t=>t.id===tvs.default)||tvs?.tvs?.[0]||null;
 const playing=now?.playing&&typeof now.playing==='object'?{title:short(now.playing.title),service:short(now.playing.service,40),state:['playing','paused','buffering','stopped'].includes(now.playing.state)?now.playing.state:null,season:num(now.playing.season),episode:num(now.playing.episode),positionMs:num(now.playing.position_ms),durationMs:num(now.playing.duration_ms),updated:short(now.playing.updated,40)}:null;
 const v=now?.volume;
 return {
  name:short(tv?.name,60)||'Телевизор',
  power:['on','off'].includes(now?.power)?now.power:'unknown',
  waking:now?.waking===true,
  app:now?.app?(now.app.id==='home'||/launcher|tvhome|\.home$/i.test(now.app.package||'')?{id:'home',name:'Главный экран'}:{id:short(now.app.id,40),name:short(now.app.name,60)||short(now.app.package,80)}):null,
  volume:v&&v.known===true?{level:num(v.level),max:num(v.max),muted:v.muted===true}:v?{level:null,max:null,muted:v.muted===true}:null,
  playing:playing?.title||playing?.state?playing:null
 };
}
export class TV {
 constructor(store,fetcher=fetch){this.store=store;this.fetcher=fetcher;this.cache=null;this.apps=null;}
 clear(){this.cache=null;this.apps=null;}
 async base(){return (await this.store.get()).tv?.base||DEFAULT_TV_BRIDGE;}
 async api(path,body){
  const response=await this.fetcher((await this.base())+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(body?35000:4000),redirect:'error'});
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw Error('tv_too_large');}chunks.push(value);}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('tv_unavailable');}
  return {status:response.status,data};
 }
 async appList(){
  if(this.apps&&Date.now()-this.apps.at<300000)return this.apps.list;
  const r=await this.api('/api/apps');
  const all=(Array.isArray(r.data?.apps)?r.data.apps:[]).filter(a=>typeof a.id==='string'&&a.id!=='home');
  // Without ADB the bridge cannot tell what is installed and lists its whole catalogue; keep the common apps then.
  const known=all.some(a=>a.installed===true&&a.id!=='settings');
  const list=all.filter(a=>known?a.installed===true:a.installed!==false&&COMMON_APPS.includes(a.id)).slice(0,24).map(a=>({id:short(a.id,40),name:short(a.name,40)||a.id,colour:/^#[0-9a-f]{6}$/i.test(a.colour||'')?a.colour:null}));
  this.apps={at:Date.now(),list};return list;
 }
 async status(force=false){
  if(!force&&this.cache&&Date.now()-this.cache.at<1500)return this.cache.result;
  let result;
  try{
   const [tvs,now]=await Promise.all([this.api('/api/tvs'),this.api('/api/now')]);
   const tv=tvs.data?.tvs?.find(t=>t.id===tvs.data.default)||tvs.data?.tvs?.[0];
   if(tv&&tv.paired===false)result={connection:'not_paired',name:short(tv.name,60)||'Телевизор',apps:[]};
   else if(now.status!==200||now.data?.tv_connected===false)result={connection:'tv_offline',...mapNow(now.data,tvs.data),apps:[]};
   else{let apps=[];try{apps=await this.appList();}catch{}result={connection:'connected',...mapNow(now.data,tvs.data),apps,updatedAt:new Date().toISOString()};}
  }catch{result={connection:'bridge_offline',apps:[]};}
  this.cache={at:Date.now(),result};return result;
 }
 async command(data){
  const keys=Object.keys(data||{});
  const allowed=(...k)=>keys.every(x=>['command',...k].includes(x));
  let path,body;
  if(data?.command==='key'&&allowed('key')&&TV_KEYS.includes(data.key)){path='/api/key';body={key:data.key};}
  else if(data?.command==='power'&&allowed('state')&&['on','off','toggle'].includes(data.state)){path='/api/power';body={state:data.state};}
  else if(data?.command==='volume'&&allowed('action')&&['up','down','mute'].includes(data.action)){path='/api/volume';body={action:data.action};}
  else if(data?.command==='launch'&&allowed('app')&&typeof data.app==='string'){
   const list=await this.appList().catch(()=>[]);
   if(!list.some(a=>a.id===data.app))throw Error('invalid_tv_command');
   path='/api/launch';body={app:data.app};
  }else throw Error('invalid_tv_command');
  let r;try{r=await this.api(path,body);}catch{return {accepted:false,error:'tv_unavailable'};}
  this.cache=null;
  return r.status===200&&r.data?.ok===true?{accepted:true}:{accepted:false,error:r.status===503?'tv_unavailable':'tv_rejected'};
 }
}
