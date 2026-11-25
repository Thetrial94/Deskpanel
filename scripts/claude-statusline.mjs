// Receives native statusLine JSON, saves only quota percentages/reset times, discards everything else.
import {mkdir,writeFile,rename,readFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {claudeUsage} from '../server/agent-usage.mjs';
import {defaultClaudeStateDir} from './claude-hook.mjs';
export async function recordClaudeUsage(input,dir=defaultClaudeStateDir()){
 const value=claudeUsage(input),file=join(dir,'usage.json'),temp=file+'.'+randomUUID()+'.tmp';
 await mkdir(dir,{recursive:true});await writeFile(temp,JSON.stringify(value)+'\n',{mode:0o600});await rename(temp,file);return value;
}
export async function previousStatusline(input,dir=defaultClaudeStateDir(),{timeout=4000}={}){
 let previous;try{previous=JSON.parse(await readFile(join(dir,'previous-statusline.json'),'utf8'));}catch{return null;}
 if(typeof previous?.command!=='string'||!previous.command)return null;
 // Same shell as Claude Code on Windows; command comes from existing local settings, never stdin.
 let shell=process.platform==='win32'?process.env.CLAUDE_CODE_GIT_BASH_PATH||'C:/Program Files/Git/bin/bash.exe':'/bin/sh';
 try{await access(shell);}catch{return null;}
 return new Promise(resolve=>{
  let output='',done=false;const finish=(success=false)=>{if(done)return;done=true;clearTimeout(timer);child.kill();resolve(success?output:null);};
  const child=spawn(shell,['-c',previous.command],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  const timer=setTimeout(finish,timeout);
  child.on('error',()=>finish());child.on('close',code=>finish(code===0));child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536)finish();});child.stdin.end(input);
 });
}
export function statuslineText(usage){
 return [['fiveHour','5ч'],['week','Неделя']].map(([key,label])=>{const w=usage.windows[key];return label+': '+(w?Math.floor(100-w.usedPercent)+'% осталось':'нет данных');}).join(' · ');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>2097152)throw Error('input_size');}
  const usage=await recordClaudeUsage(JSON.parse(text));const previous=await previousStatusline(text);
  process.stdout.write(previous??statuslineText(usage));
 }catch{} // Never break Claude's interactive prompt or print incoming JSON.
}
