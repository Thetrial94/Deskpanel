import os from 'node:os';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const total=()=>os.cpus().reduce((a,c)=>({idle:a.idle+c.times.idle,total:a.total+Object.values(c.times).reduce((x,y)=>x+y,0)}),{idle:0,total:0});
export class Computer {
 constructor(){this.sample=total();this.sampleAt=Date.now();this.cpu=null;this.pending=null;this.last=null;}
 metrics(){
  const now=Date.now(),sample=total(),delta=sample.total-this.sample.total;
  if(now-this.sampleAt>=500&&delta>0){this.cpu=Math.max(0,Math.min(100,Math.round((1-(sample.idle-this.sample.idle)/delta)*100)));this.sample=sample;this.sampleAt=now;}
  return {schemaVersion:1,connection:'connected',name:os.hostname(),platform:os.platform(),cpu:this.cpu,cores:os.cpus().length,memory:{used:os.totalmem()-os.freemem(),total:os.totalmem()},uptime:Math.floor(os.uptime()),updatedAt:new Date().toISOString()};
 }
 async run(command='status',value){
  if(!['status','volume','mute','mic','lock','sound'].includes(command))throw Error('invalid_command');
  if(command==='volume'&&(!Number.isInteger(value)||value<0||value>100))throw Error('invalid_volume');
  if(['mute','mic'].includes(command)&&typeof value!=='boolean')throw Error('invalid_value');
  if(command==='lock'&&value!==true)throw Error('confirmation_required');
  if(process.platform!=='win32')return {connection:'unsupported',accepted:false,audio:null,mic:null};
  if(command==='status'&&this.last&&Date.now()-this.last.time<2500)return this.last.value;
  if(this.pending){if(command==='status')return this.pending;throw Error('busy');}
  this.pending=new Promise(resolve=>{
   const args=['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./windows-remote.ps1',import.meta.url)),command];
   if(value!==undefined)args.push(String(value));
   execFile(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),args,{windowsHide:true,timeout:10000,maxBuffer:8192,encoding:'utf8'},(error,out)=>{
    try{if(error)throw error;const result=JSON.parse(out);this.last={time:Date.now(),value:result};resolve(result);}
    catch{this.last=null;resolve({connection:'unavailable',accepted:false,audio:null,mic:null});}
   });
  });
  try{return await this.pending;}finally{this.pending=null;}
 }
}
