const short=x=>String(x||'').slice(0,160);
export function mapYandex(data){
 if(data.status!=='ok'||!Array.isArray(data.devices))throw Error('invalid_home');
 return data.devices.slice(0,100).map(d=>{
  const cap=d.capabilities?.find(c=>c.type==='devices.capabilities.on_off');
  const control=['devices.types.light','devices.types.socket','devices.types.switch'].some(t=>d.type===t||d.type?.startsWith(t+'.'));
  return {id:short(d.id),name:short(d.name),kind:short(d.type),on:typeof cap?.state?.value==='boolean'?cap.state.value:null,controllable:!!cap&&control};
 });
}
export function mapHA(data){
 if(!Array.isArray(data))throw Error('invalid_home');
 return data.filter(d=>/^(light|switch|sensor)\./.test(d.entity_id)).slice(0,100).map(d=>({
  id:short(d.entity_id),name:short(d.attributes?.friendly_name||d.entity_id),kind:d.entity_id.split('.')[0],
  on:d.state==='on'?true:d.state==='off'?false:null,
  value:d.entity_id.startsWith('sensor.')?short(d.state+' '+(d.attributes?.unit_of_measurement||'')):null,
  controllable:/^(light|switch)\./.test(d.entity_id)&&!['unavailable','unknown'].includes(d.state)
 }));
}
export class Home {
 constructor(store,fetcher=fetch){this.store=store;this.fetcher=fetcher;this.cache=null;}
 clear(){this.cache=null;}
 async api(config,path,body){
  const response=await this.fetcher(config.base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+config.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw Error('home_unavailable');
  if(Number(response.headers.get('content-length'))>1048576)throw Error('home_too_large');
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw Error('home_too_large');}chunks.push(value);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 async status(force=false){
  const config=(await this.store.get()).home;
  if(!config)return {connection:'not_configured',devices:[]};
  if(!force&&this.cache&&Date.now()-this.cache.at<10000)return this.cache.result;
  try{
   const raw=await this.api(config,config.provider==='yandex'?'/v1.0/user/info':'/api/states');
   const result={connection:'connected',provider:config.provider,devices:config.provider==='yandex'?mapYandex(raw):mapHA(raw),updatedAt:new Date().toISOString()};
   this.cache={at:Date.now(),result};return result;
  }catch{this.cache=null;return {connection:'unavailable',provider:config.provider,devices:[]};}
 }
 async command(id,on){
  if(typeof id!=='string'||typeof on!=='boolean')throw Error('invalid_command');
  const state=await this.status(true),device=state.devices.find(d=>d.id===id&&d.controllable);
  if(!device)throw Error('device_unavailable');
  const config=(await this.store.get()).home;
  if(config.provider==='yandex'){
   const result=await this.api(config,'/v1.0/devices/actions',{devices:[{id,actions:[{type:'devices.capabilities.on_off',state:{instance:'on',value:on}}]}]});
   const completed=result.devices?.find(d=>d.id===id)?.capabilities?.some(c=>c.type==='devices.capabilities.on_off'&&c.state?.action_result?.status==='DONE');
   if(result.status!=='ok'||!completed)throw Error('device_rejected');
  }else await this.api(config,'/api/services/'+id.split('.')[0]+'/'+(on?'turn_on':'turn_off'),{entity_id:id});
  this.cache=null;return {accepted:true};
 }
}
