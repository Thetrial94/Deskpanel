import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
export const MUSIC_COMMANDS = new Set(['launch','toggle','next','previous']);
const CONNECTIONS = new Set(['connected','starting','stopped','not_installed','different_installation','unavailable','unsupported']);
export class MusicBridge {
  constructor({platform=process.platform}={}) { this.platform=platform; this.worker=null; this.pending=new Map(); this.sequence=0; this.closed=false; }
  start() {
    if(this.worker) return;
    const executable=join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const worker=spawn(executable,['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./windows-music.ps1',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    this.worker=worker;
    const lines=createInterface({input:worker.stdout});
    const fail=()=>{
      if(this.worker!==worker)return;
      this.worker=null;
      for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('bridge_unavailable'));}
      this.pending.clear();lines.close();
    };
    worker.on('error',fail);worker.on('exit',fail);worker.stdin.on('error',fail);
    lines.on('line',line=>{
      try {
        const data=JSON.parse(line), entry=this.pending.get(data.id);
        if(!entry)return;
        clearTimeout(entry.timer);this.pending.delete(data.id);
        if(!CONNECTIONS.has(data.connection))entry.reject(new Error('invalid_response'));
        else entry.resolve(data);
      } catch { /* Ignore non-protocol output; a bounded timeout fails the request. */ }
    });
  }
  async request(action) {
    if(action!=='status'&&!MUSIC_COMMANDS.has(action))throw new Error('invalid_command');
    if(this.platform!=='win32')return {connection:'unsupported',accepted:false,error:action==='status'?null:'unsupported'};
    if(this.closed)throw new Error('bridge_closed');
    if(this.pending.size>=8)throw new Error('bridge_busy');
    this.start();
    return new Promise((resolve,reject)=>{
      const id=++this.sequence;
      const timer=setTimeout(()=>{
        // A timed-out toggle must never be replayed; discard the whole worker.
        const worker=this.worker;
        this.worker=null;
        for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(new Error('bridge_timeout'));}
        this.pending.clear();worker?.stdin.destroy();worker?.stdout.destroy();worker?.kill();
      },10000);
      this.pending.set(id,{resolve,reject,timer});
      this.worker.stdin.write(JSON.stringify({id,action})+'\n');
    });
  }
  async status() {
    try {
      const value=await this.request('status');
      return {schemaVersion:1,app:'yamusic-rs',connection:value.connection,playback:'unknown',track:null,updatedAt:new Date().toISOString()};
    } catch { return {schemaVersion:1,app:'yamusic-rs',connection:'unavailable',playback:'unknown',track:null,updatedAt:null}; }
  }
  async command(action) { const result=await this.request(action); return {accepted:result.accepted===true,error:result.error||null}; }
  close() {
    this.closed=true;
    for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(new Error('bridge_closed'));}
    this.pending.clear();this.worker?.stdin.destroy();this.worker?.stdout.destroy();this.worker?.kill();this.worker=null;
  }
}
