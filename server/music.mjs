import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
export const MUSIC_COMMANDS = new Set(['launch','toggle','next','previous','volume']);
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
  async request(action,value) {
    if(action!=='status'&&!MUSIC_COMMANDS.has(action))throw new Error('invalid_command');
    if(action==='volume'&&(!Number.isInteger(value)||value<0||value>100))throw new Error('invalid_volume');
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
      this.worker.stdin.write(JSON.stringify({id,action,value})+'\n');
    });
  }
  async status() {
    let value;
    try { value=await this.request('status'); }
    catch { value={connection:'unavailable'}; }
    const base={schemaVersion:1,app:'yamusic-rs',connection:value.connection,enhanced:false,playback:'unknown',track:null,volume:null,updatedAt:new Date().toISOString()};
    if(value.connection!=='connected'||!process.env.LOCALAPPDATA)return base;
    try {
      const file=join(process.env.LOCALAPPDATA,'DeskPanel','music-state.json');
      if((await stat(file)).size>8192)return base;
      return {...base,...normalizePlayerState(JSON.parse(await readFile(file,'utf8')),value.pid)};
    } catch { return base; }
  }
  async command(action,value) {
    if(action==='volume'){
      if(!Number.isInteger(value)||value<0||value>100)throw new Error('invalid_volume');
      if(!(await this.status()).enhanced)return {accepted:false,error:'state_unavailable'};
    }
    const result=await this.request(action,value);
    return {accepted:result.accepted===true,error:result.error||null};
  }
  close() {
    this.closed=true;
    for(const entry of this.pending.values()){clearTimeout(entry.timer);entry.reject(new Error('bridge_closed'));}
    this.pending.clear();this.worker?.stdin.destroy();this.worker?.stdout.destroy();this.worker?.kill();this.worker=null;
  }
}

// Accept only a fresh snapshot from the exact process that owns the tray window.
export function normalizePlayerState(data,pid,now=Date.now()){
  if(!data||data.schemaVersion!==1||!Number.isInteger(pid)||data.pid!==pid||
     !Number.isFinite(data.updatedAt)||now-data.updatedAt>4000||data.updatedAt>now+1000||
     !['playing','paused','idle','loading'].includes(data.playback)||
     !Number.isInteger(data.volume)||data.volume<0||data.volume>100)return {};
  return {
    enhanced:true,playback:data.playback,volume:data.volume,
    track:data.track&&typeof data.track.title==='string'&&typeof data.track.artist==='string'
      ?{title:data.track.title.slice(0,300),artist:data.track.artist.slice(0,300)}:null,
    updatedAt:new Date(data.updatedAt).toISOString()
  };
}
