import {spawn} from 'node:child_process';
import {mkdir,open,readFile,writeFile,unlink,stat,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export async function probeServer(port){
 try{
  const response=await fetch('http://127.0.0.1:'+port+'/api/health',{signal:AbortSignal.timeout(2000),redirect:'error'});
  const data=await response.json();return response.ok&&data.ok===true&&data.app==='deskpanel'?'deskpanel':'other';
 }catch(error){return error instanceof SyntaxError?'other':'unavailable';}
}
export async function acquireLock(runtime){
 await mkdir(runtime,{recursive:true});const path=resolve(runtime,'supervisor.lock');let handle;
 for(let attempt=0;attempt<2;attempt++){
  try{handle=await open(path,'wx');break;}catch(error){
   if(error.code!=='EEXIST'||attempt)throw error;
   const pid=Number(await readFile(path,'utf8'));if(!Number.isInteger(pid)||pid<1)throw Error('Supervisor lock is incomplete; inspect it before retrying');
   try{process.kill(pid,0);throw Error('DeskPanel supervisor is already running');}catch(e){if(e.code!=='ESRCH')throw e;}
   await unlink(path);
  }
 }
 await handle.writeFile(String(process.pid));await handle.close();
 await writeFile(resolve(runtime,'supervisor.pid'),String(process.pid));
 return async()=>{if((await readFile(path,'utf8').catch(()=>''))===String(process.pid))await unlink(path);};
}
export class Supervisor{
 constructor({root,port=4317,runtime=resolve(root,'.runtime'),probe=probeServer,launch=spawn,pollMs=5000,retryMs=2000}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
  Object.assign(this,{root,port,runtime,probe,launch,pollMs,retryMs});this.child=null;this.running=false;this.busy=false;this.failures=0;this.state='starting';
 }
 record(){
  const data=JSON.stringify({supervisorPid:process.pid,serverPid:this.child?.pid||null,state:this.state,port:this.port,updatedAt:new Date().toISOString()});
  this.writing=(this.writing||Promise.resolve()).catch(()=>{}).then(async()=>{const temporary=resolve(this.runtime,'service-status.tmp');await writeFile(temporary,data);await rename(temporary,resolve(this.runtime,'service-status.json'));});
  return this.writing;
 }
 schedule(ms){clearTimeout(this.timer);if(this.running)this.timer=setTimeout(()=>this.tick(),ms);}
 async start(){await mkdir(this.runtime,{recursive:true});this.running=true;await this.tick();}
 async tick(){
  if(!this.running||this.busy)return;this.busy=true;let delay=this.pollMs;
  try{
   const health=await this.probe(this.port);if(!this.running)return;
   if(health==='deskpanel'){this.state=this.child?'running':'external';this.failures=0;}
   else if(health==='other'){this.state='port_busy';delay=15000;}
   else if(this.child){this.state='starting';}
   else{
    this.state='starting';const logfile=resolve(this.runtime,'service.log');
    if((await stat(logfile).catch(()=>null))?.size>1048576){await unlink(logfile+'.1').catch(e=>{if(e.code!=='ENOENT')throw e;});await rename(logfile,logfile+'.1');}
    const log=await open(logfile,'a');let child;
    try{
     if(!this.running)return;
     child=this.launch(process.execPath,[resolve(this.root,'server/index.mjs'),'--lan','--port',String(this.port)],{cwd:this.root,windowsHide:true,stdio:['ignore',log.fd,log.fd]});this.child=child;
     let settled=false;const exited=()=>{if(settled)return;settled=true;if(this.child===child)this.child=null;this.state='restarting';this.failures++;this.schedule(Math.min(30000,this.retryMs*2**Math.min(this.failures-1,4)));};
     child.once('exit',exited);child.once('error',exited);
     if(child.pid)await writeFile(resolve(this.runtime,'server.pid'),String(child.pid));
    }finally{await log.close();}
   }
   await this.record();
  }catch{this.state='error';this.failures++;delay=Math.min(30000,this.retryMs*2**Math.min(this.failures-1,4));await this.record().catch(()=>{});}
  finally{this.busy=false;this.schedule(delay);}
 }
 async stop(){this.running=false;clearTimeout(this.timer);const child=this.child;this.child=null;if(child){await new Promise(resolve=>{const timer=setTimeout(resolve,3000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill();});}this.state='stopped';await this.record();}
}
async function main(){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),runtime=resolve(root,'.runtime');
 const release=await acquireLock(runtime);const supervisor=new Supervisor({root,runtime});let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;try{await supervisor.stop();}finally{await release();}};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);await supervisor.start();
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message==='DeskPanel supervisor is already running'?error.message:'DeskPanel supervisor could not start');process.exitCode=1;});
