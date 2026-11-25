import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tvBridgeURL } from './tv.mjs';
function secureIO(action,data){
 return new Promise((resolve,reject)=>{
  if(process.platform!=='win32'){reject(Error('windows_required'));return;}
  const child=execFile(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./windows-secrets.ps1',import.meta.url)),action],{windowsHide:true,timeout:10000,maxBuffer:65536,encoding:'utf8'},(error,stdout)=>{if(error){reject(Error('secret_store_unavailable'));return;}try{resolve(JSON.parse(stdout));}catch{reject(Error('secret_store_unavailable'));}});
  child.stdin.on('error',()=>{});child.stdin.end(data===undefined?'':JSON.stringify(data));
 });
}
export class ConnectionStore {
 constructor(){this.cached=null;this.loading=null;this.tail=Promise.resolve();}
 async get(){if(this.cached)return this.cached;if(!this.loading)this.loading=secureIO('read').then(x=>this.cached=x).finally(()=>this.loading=null);return this.loading;}
 update(fn){const job=this.tail.then(async()=>{const next=fn(structuredClone(await this.get()));await secureIO('write',next);this.cached=next;return next;});this.tail=job.catch(()=>{});return job;}
}
export function validateConfig(data){
 if(data.kind==='calendar'){
  if(data.clear===true)return {kind:'calendar',value:null};
  const url=new URL(data.url);
  const allowed=['calendar.yandex.ru','calendar.yandex.com','calendar.yandex-team.ru','cal.yandex-team.ru'];
  if(url.protocol!=='https:'||!allowed.includes(url.hostname)||url.username||url.password||url.hash||data.url.length>4096)throw Error('invalid_calendar_url');
  return {kind:'calendar',value:{url:url.href}};
 }
 if(data.kind==='home'){
  if(data.clear===true)return {kind:'home',value:null};
  if(!['yandex','ha'].includes(data.provider)||typeof data.token!=='string'||data.token.length<10||data.token.length>4096||/[\r\n]/.test(data.token))throw Error('invalid_home_config');
  let base='https://api.iot.yandex.net';
  if(data.provider==='ha'){
   const url=new URL(data.base);
   const privateHost=/^(localhost|[a-z0-9-]+\.local|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||(url.protocol==='http:'&&!privateHost))throw Error('invalid_home_url');
   base=url.origin;
  }
  return {kind:'home',value:{provider:data.provider,base,token:data.token.trim()}};
 }
 if(data.kind==='tv'){
  if(data.clear===true)return {kind:'tv',value:null};
  if(typeof data.base!=='string'||data.base.length>200)throw Error('invalid_tv_url');
  return {kind:'tv',value:{base:tvBridgeURL(data.base)}};
 }
 throw Error('invalid_config');
}
