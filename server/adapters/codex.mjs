import {readFile,readdir,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {defaultStateDir} from '../../scripts/codex-hook.mjs';
import {readCodexMetadata} from './codex-metadata.mjs';
import {codexSnapshot} from '../codex-state.mjs';
export async function readCodexStatus(dir=defaultStateDir(),{metadataReader=readCodexMetadata}={}){
 let snapshot;let configured=false;try{configured=JSON.parse(await readFile(join(dir,'installed.json'),'utf8')).schemaVersion===1;}catch{}
 try{const names=(await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)),records=[];
  for(const name of names.slice(0,1000)){try{const file=join(dir,name),info=await stat(file);if(info.size>4096)continue;if(Date.now()-info.mtimeMs>86400000){await unlink(file);continue;}const r=JSON.parse(await readFile(file,'utf8'));if(Number.isFinite(r.updatedAt))records.push(r);}catch{}}
  snapshot=codexSnapshot(records,Date.now(),configured);
 }catch{snapshot=codexSnapshot([],Date.now(),configured);}
 snapshot.sessions=snapshot.sessions.map(session=>({...session,title:'Сессия '+session.id.slice(0,8)}));
 if(configured){
  const metadata=await metadataReader().catch(()=>null);
  if(metadata){
   const merged=new Map(metadata.sessions.map(s=>[s.id,s]));
   for(const session of snapshot.sessions){const fresh=Date.now()-Date.parse(session.updatedAt)<=120000;if(merged.get(session.id)?.status!=='waiting'&&(fresh||!merged.has(session.id)))merged.set(session.id,{...session,title:merged.get(session.id)?.title||session.title,source:'hooks'});}
   const sessions=[...merged.values()].sort((a,b)=>Number(['working','approval','waiting'].includes(b.status))-Number(['working','approval','waiting'].includes(a.status))||Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,12);
   return {...metadata,sessions,updatedAt:sessions.length?new Date(Math.max(...sessions.map(s=>Date.parse(s.updatedAt)))).toISOString():null};
  }
 }
 return snapshot;
}
