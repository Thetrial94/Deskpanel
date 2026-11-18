import {randomUUID} from 'node:crypto';
import {checkRequest,readJSON} from './http-guard.mjs';
const roles=['codex','claude','music'];
const resources=new Set(['computer','remote','music','agents','access','health']);
export function nodeURL(value){
 const u=new URL(value),ip=u.hostname.split('.').map(Number);
 const privateIP=ip.length===4&&ip.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&(ip[0]===10||ip[0]===192&&ip[1]===168||ip[0]===172&&ip[1]>=16&&ip[1]<=31);
 if(!privateIP||u.protocol!=='http:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||Number(u.port||80)<1024)throw Error('invalid_node_url');
 return u.origin;
}
export class Network {
 constructor(store,{fetcher=fetch}={}){this.store=store;this.fetcher=fetcher;}
 async config(){const n=(await this.store.get()).network||{};return {name:n.name||'Этот компьютер',nodes:n.nodes||[],bindings:{codex:'local',claude:'local',music:'local',...n.bindings}};}
 async request(node,resource,body){
  if(!resources.has(resource))throw Error('invalid_resource');
  const base=nodeURL(node.url),path={agents:'agents/local',music:'music/local'}[resource]||resource;
  const response=await this.fetcher(base+'/api/'+path,{method:body?'POST':'GET',headers:{Origin:base,...(node.token?{Cookie:'deskpanel_device='+node.token}:{}),...(body?{'Content-Type':'application/json','X-DeskPanel':'1'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(5000)});
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw Error('node_response_too_large');}chunks.push(value);}
  let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('invalid_node_response');}
  return {status:response.status,data,cookie:response.headers.get('set-cookie')};
 }
 async connect(data){
  const url=nodeURL(data.url),name=typeof data.name==='string'?data.name.trim().slice(0,60):'';
  if(!name||!/^\d{6}$/.test(data.code||'')||!['none','codex','claude'].includes(data.agent||'none'))throw Error('invalid_node');
  const health=await this.request({url},'health');
  if(health.status!==200||health.data.app!=='deskpanel'||health.data.ok!==true)throw Error('node_unavailable');
  if(!health.data.capabilities?.includes('nodes-v1'))throw Error('node_update_required');
  const result=await this.request({url},'access',{command:'pair',code:data.code});
  if(result.status!==200||result.data.paired!==true)throw Error(result.data.error==='pair_rate_limit'?'pair_rate_limit':'invalid_pair_code');
  const token=result.cookie?.match(/(?:^|;\s*)deskpanel_device=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token)throw Error('invalid_node_response');
  await this.store.update(store=>{
   const n=store.network||{},nodes=n.nodes||[],id=nodes.find(x=>x.url===url)?.id||randomUUID();
   if(nodes.length>=8&&!nodes.some(x=>x.url===url))throw Error('node_limit');
   const bindings={...n.bindings};if(data.agent&&data.agent!=='none')bindings[data.agent]=id;
   return {...store,network:{...n,nodes:[...nodes.filter(x=>x.id!==id),{id,name,url,token}],bindings}};
  });
 }
 async configure(data){
  await this.store.update(store=>{
   const n=store.network||{},nodes=n.nodes||[],ids=new Set(['local',...nodes.map(x=>x.id)]),bindings={...n.bindings};
   if(data.command==='remove'){
    if(!nodes.some(x=>x.id===data.id))throw Error('invalid_node');
    for(const role of roles)if(bindings[role]===data.id)bindings[role]=null;
    return {...store,network:{...n,nodes:nodes.filter(x=>x.id!==data.id),bindings}};
   }
   for(const [role,id] of Object.entries(data.bindings||{})){if(!roles.includes(role)||id!==null&&!ids.has(id))throw Error('invalid_binding');bindings[role]=id;}
   const name=data.name===undefined?n.name:typeof data.name==='string'?data.name.trim().slice(0,60):'';
   if(data.name!==undefined&&!name)throw Error('invalid_node');
   return {...store,network:{...n,name,bindings}};
  });
 }
 async list(computer){
  const config=await this.config();
  const nodes=await Promise.all(config.nodes.map(async node=>{
   const safe={id:node.id,name:node.name,url:node.url};
   try{const access=await this.request(node,'access');if(access.status!==200||access.data.paired!==true)return {...safe,connection:'pair_required',metrics:null};const r=await this.request(node,'computer');return {...safe,connection:r.status===403?'pair_required':r.status===200?r.data.connection:'disconnected',metrics:r.status===200?r.data:null};}
   catch{return {...safe,connection:'disconnected',metrics:null};}
  }));
  return {connection:'connected',bindings:config.bindings,nodes:[{id:'local',name:config.name,connection:'connected',metrics:computer.metrics()},...nodes]};
 }
 async target(role){const c=await this.config(),id=c.bindings[role];return id==='local'?{id:'local',name:c.name}:c.nodes.find(n=>n.id===id)||null;}
 async agents(localReader){
  const cache=new Map();
  const providers=await Promise.all(['codex','claude'].map(async id=>{
   const node=await this.target(id);
   if(!node)return {id,connection:'not_configured',sessions:[]};
   try{
    if(!cache.has(node.id))cache.set(node.id,node.id==='local'?localReader():this.request(node,'agents').then(r=>{if(r.status!==200)throw Error(r.status===403?'pair_required':'disconnected');return r.data;}));
    const data=await cache.get(node.id),provider=data.schemaVersion===1&&data.providers?.find(p=>p.id===id);
    return provider?{...provider,source:{id:node.id,name:node.name}}:{id,connection:'disconnected',sessions:[],source:{id:node.id,name:node.name}};
   }catch(error){return {id,connection:error.message==='pair_required'?'pair_required':'disconnected',sessions:[],source:{id:node.id,name:node.name}};}
  }));
  return {schemaVersion:1,providers};
 }
 async handle(path,req,send,features){
  const match=path.match(/^\/api\/nodes\/([a-zA-Z0-9-]+)\/(computer|remote|music)$/);
  if(path!=='/api/nodes'&&!match)return false;
  if(!['GET','HEAD','POST'].includes(req.method)){send(405,'{"error":"method_not_allowed"}');return true;}
  if(!checkRequest(req,req.method==='POST')){send(403,'{"error":"invalid_origin"}');return true;}
  if(!await features.access.authorized(req)){send(403,'{"error":"pair_required"}');return true;}
  try{
   if(path==='/api/nodes'){
    if(req.method==='POST'){
     const data=await readJSON(req);
     if(data.command==='connect')await this.connect(data);
     else if(['configure','remove'].includes(data.command))await this.configure(data);
     else throw Error('invalid_command');
     send(200,'{"accepted":true}');return true;
    }
    send(200,JSON.stringify(await this.list(features.computer)));return true;
   }
   const [,id,resource]=match;
   if(id==='local')return {localPath:'/api/'+resource};
   const node=(await this.config()).nodes.find(n=>n.id===id);
   if(!node){send(404,'{"error":"node_not_found"}');return true;}
   if(req.method==='POST'&&resource==='computer'){send(405,'{"error":"method_not_allowed"}');return true;}
   const body=req.method==='POST'?await readJSON(req):undefined,r=await this.request(node,resource,body);
   send(r.status,JSON.stringify(r.data));return true;
  }catch(error){
   const safe=['invalid_node_url','invalid_node','invalid_pair_code','pair_rate_limit','node_limit','invalid_binding','node_update_required'];
   send(400,JSON.stringify({error:safe.includes(error.message)?error.message:'node_unavailable'}));return true;
  }
 }
}
