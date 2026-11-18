// DeskPanel: records lifecycle metadata only. Never forwards input or reads transcripts.
import {mkdir,readFile,writeFile,rename,open,unlink,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {codexEvent,mergeCodexEvent} from '../server/codex-state.mjs';
export const defaultStateDir=()=>join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'DeskPanel','codex');
export async function recordEvent(input,dir=defaultStateDir(),parse=codexEvent,merge=mergeCodexEvent){
 const next=parse(input);if(!next)return false;
 await mkdir(dir,{recursive:true});const file=join(dir,next.id+'.json'),lock=file+'.lock';let handle;
 for(let i=0;i<10;i++){try{handle=await open(lock,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;try{if(Date.now()-(await stat(lock)).mtimeMs>10000)await unlink(lock);}catch{}await new Promise(r=>setTimeout(r,25));}}
 if(!handle)return false;
 const temp=file+'.'+process.pid+'.tmp';
 try{let previous;try{previous=JSON.parse(await readFile(file,'utf8'));}catch{}
  const state=merge(previous,next);await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,file);return true;
 }finally{await handle.close();await unlink(lock).catch(()=>{});await unlink(temp).catch(()=>{});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>2097152){text='';break;}}if(text)await recordEvent(JSON.parse(text));}catch{}
 // Neutral response: no approval decisions, prompt changes or continuation requests.
 process.stdout.write('{}');
}
