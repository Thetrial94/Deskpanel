// Supported app-server RPC; Codex manages its own authentication. No credentials are opened here.
import {spawn} from 'node:child_process';
import {access} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {codexUsage,unavailableUsage} from '../agent-usage.mjs';
async function executable(){
 if(process.env.DESKPANEL_CODEX_BIN)return process.env.DESKPANEL_CODEX_BIN;
 if(process.platform==='win32'&&process.env.APPDATA){
  const pkg=join(process.env.APPDATA,'npm','node_modules','@openai','codex','package.json');
  const triple=process.arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
  const roots=[join(dirname(pkg),'vendor')];
  try{roots.unshift(join(dirname(createRequire(pkg).resolve('@openai/codex-win32-'+(process.arch==='arm64'?'arm64':'x64')+'/package.json')),'vendor'));}catch{}
  for(const root of roots){const binary=join(root,triple,'codex','codex.exe');try{await access(binary);return binary;}catch{}}
 }
 return process.platform==='win32'?'codex.exe':'codex';
}
export async function queryCodexUsage({binary,spawnProcess=spawn,timeout=10000}={}){
 const command=binary||await executable();
 return new Promise(resolve=>{
  let child,buffer='',done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);child?.stdin?.end();child?.kill();resolve(value);};
  const timer=setTimeout(()=>finish(unavailableUsage('timeout')),timeout);
  try{
   child=spawnProcess(command,['app-server'],{windowsHide:true,stdio:['pipe','pipe','ignore']});
   const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
   child.on('error',()=>finish(unavailableUsage('cli_unavailable')));
   child.on('close',()=>finish(unavailableUsage('source_unavailable')));
   child.stdin.on('error',()=>finish(unavailableUsage('source_unavailable')));
   child.stdout.on('data',chunk=>{
    buffer+=chunk;if(buffer.length>1048576){finish(unavailableUsage('invalid_response'));return;}
    let end;while(!done&&(end=buffer.indexOf('\n'))>=0){
     const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let message;try{message=JSON.parse(line);}catch{continue;}
     if(message.id===1){
      if(message.error){finish(unavailableUsage('source_unavailable'));return;}
      send({method:'initialized',params:{}});send({id:2,method:'account/rateLimits/read'});
     }
     if(message.id===2)finish(message.error?unavailableUsage('source_unavailable'):codexUsage(message.result));
    }
   });
   send({id:1,method:'initialize',params:{clientInfo:{name:'deskpanel',title:'DeskPanel',version:'0.1.0'}}});
  }catch{finish(unavailableUsage('cli_unavailable'));}
 });
}
// Stale-while-revalidate: a slow quota service never delays chat statuses or the other PC.
export function createCodexUsageReader({query=queryCodexUsage,now=Date.now,interval=120000}={}){
 let value=unavailableUsage('loading'),attempt=-Infinity,pending;
 const refresh=()=>{
  if(pending)return pending;
  attempt=now();pending=Promise.resolve().then(query).then(next=>{
   value=next.status==='available'?next:value.status==='available'?{...value,refreshFailed:true}:next;
  }).catch(()=>{value=value.status==='available'?{...value,refreshFailed:true}:unavailableUsage('source_unavailable');}).finally(()=>{pending=null;});return pending;
 };
 return {read(){if(now()-attempt>=interval)void refresh();return value;},refresh};
}
const reader=createCodexUsageReader();
export const readCodexUsage=()=>reader.read();
