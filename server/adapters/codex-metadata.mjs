// Read-only metadata fallback. Select the user-facing name, never message text, previews or rollout paths.
import {questionReader} from './codex-questions.mjs';
import {stat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
const DAY=86400000,STALE=120000;
export async function readCodexMetadata(home=process.env.CODEX_HOME||join(homedir(),'.codex'),now=Date.now()){
 const paths=['state_5.sqlite','thread_history_1.sqlite'].map(name=>join(home,name));let state,history,questions;
 try{
  // Avoid creating databases when Codex is not installed or changes its storage version.
  for(const file of paths)if(!(await stat(file)).isFile())return null;
  const {DatabaseSync}=await import('node:sqlite');
  state=new DatabaseSync(paths[0],{readOnly:true});history=new DatabaseSync(paths[1],{readOnly:true});
  for(const db of [state,history]){db.exec('PRAGMA query_only=ON');db.exec('PRAGMA busy_timeout=100');}
  const rows=state.prepare('SELECT id,name,updated_at,updated_at_ms FROM threads WHERE archived=0 AND updated_at>=? ORDER BY updated_at DESC LIMIT 40').all(Math.floor((now-DAY)/1000));
  const latest=history.prepare('SELECT status,started_at,completed_at FROM thread_turns WHERE thread_id=? AND (root_turn_id IS NULL OR root_turn_id=turn_id) ORDER BY rollout_ordinal DESC LIMIT 1');
  questions=await questionReader(home,history,now);
  const sessions=[];
  for(const row of rows){
   const turn=latest.get(row.id);if(!turn)continue;
   const mapped={inProgress:'working',completed:'completed',interrupted:'interrupted',failed:'error'}[turn.status];if(!mapped)continue;
   const updated=Number(row.updated_at_ms||row.updated_at*1000),started=Number(turn.started_at)*1000,completed=Number(turn.completed_at)*1000;
   const stamp=Math.max(updated,completed||0);if(!Number.isFinite(stamp)||stamp>now+5000||now-stamp>DAY||!Number.isFinite(started))continue;
   const id=createHash('sha256').update(row.id).digest('hex');
   const title=typeof row.name==='string'?row.name.replace(/\s+/g,' ').trim().slice(0,160):'';
   sessions.push({id,title:title||'Сессия '+id.slice(0,8),status:questions?.pending(row.id)?'waiting':mapped==='working'&&now-stamp>STALE?'stale':mapped,updatedAt:new Date(stamp).toISOString(),startedAt:new Date(started||stamp).toISOString(),source:'local_metadata'});
  }
  sessions.sort((a,b)=>({waiting:2,working:1}[b.status]||0)-({waiting:2,working:1}[a.status]||0)||Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
  return {id:'codex',name:'Codex',connection:'connected',source:'local_metadata',sessions:sessions.slice(0,12),updatedAt:sessions.length?new Date(Math.max(...sessions.map(s=>Date.parse(s.updatedAt)))).toISOString():null};
 }catch{return null;}finally{try{questions?.close();}catch{}try{history?.close();}catch{}try{state?.close();}catch{}}
}
