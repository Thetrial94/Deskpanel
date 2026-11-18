// Optional read-only correlation of async question calls and service reply IDs.
import {stat} from 'node:fs/promises';
import {join} from 'node:path';
const DAY=86400000;
export function questionEvent(body){
 if(typeof body!=='string'||!body.includes('tool_name="request_user_input_async"')||! /\baborted=false\b/.test(body)||! /\bexecution_started=true\b/.test(body))return null;
 const calls=[...body.matchAll(/\bcall_id="?(call_[A-Za-z0-9_-]+)/g)].map(m=>m[1]);
 const turns=[...body.matchAll(/\bturn_id="?([a-f0-9-]{36})/g)].map(m=>m[1]);
 if(!calls.length||new Set(calls).size!==1||!turns.length)return null;
 return JSON.stringify({call:calls[0],turn:turns.at(-1)});
}
export async function questionReader(home,history,now){
 let logs;
 try{
  const path=join(home,'logs_2.sqlite');if(!(await stat(path)).isFile())return null;
  const {DatabaseSync}=await import('node:sqlite');logs=new DatabaseSync(path,{readOnly:true});
  logs.exec('PRAGMA query_only=ON');logs.exec('PRAGMA busy_timeout=100');
  logs.function('deskpanel_question_event',questionEvent);
  const calls=logs.prepare(`SELECT ts,deskpanel_question_event(feedback_log_body) AS event FROM logs
   WHERE thread_id=? AND ts>=? AND ts<=? AND target='codex_core::tools::parallel'
   AND instr(feedback_log_body,'tool_name="request_user_input_async"')>0
   ORDER BY ts DESC LIMIT 64`);
  // SQLite projects just questionItemId out of the service envelope. No question or answer text leaves this query.
  const replies=history.prepare(`WITH texts AS (
   SELECT trim(json_extract(c.value,'$.text'),char(9)||char(10)||char(13)||' ') AS text FROM thread_items i,json_each(i.item_json,'$.content') c
   WHERE i.thread_id=? AND i.item_type='userMessage' AND i.created_at_ms>=? AND json_extract(c.value,'$.type')='text'
  ), bodies AS (
   SELECT substr(text,length('<send_user_message_question_reply>')+1,length(text)-length('<send_user_message_question_reply>')-length('</send_user_message_question_reply>')) AS body FROM texts
   WHERE substr(text,1,length('<send_user_message_question_reply>'))='<send_user_message_question_reply>'
    AND substr(text,-length('</send_user_message_question_reply>'))='</send_user_message_question_reply>'
  ) SELECT json_extract(a.value,'$.questionItemId') AS id
    FROM bodies,json_each(CASE WHEN json_valid(body) THEN body ELSE '[]' END) a
    WHERE a.type='object'`);
  const turnStatus=history.prepare('SELECT status FROM thread_turns WHERE thread_id=? AND turn_id=? LIMIT 1');
  return {
   pending(thread){
    try{
     const answered=new Set();
     for(const row of replies.all(thread,now-DAY)){
      try{const id=JSON.parse(row.id);if(Array.isArray(id)&&id[0]==='request_user_input_async'&&/^call_[A-Za-z0-9_-]+$/.test(id[1])&&Number.isInteger(id[2])&&id[2]>=0)answered.add(id[1]);}catch{}
     }
     for(const row of calls.all(thread,Math.floor((now-DAY)/1000),Math.floor((now+5000)/1000))){
      if(!row.event)continue;const event=JSON.parse(row.event);
      if(answered.has(event.call))continue;
      const turn=turnStatus.get(thread,event.turn);
      if(turn&&['inProgress','completed'].includes(turn.status))return true;
     }
     return false;
    }catch{return false;}
   },close(){logs.close();}
  };
 }catch{try{logs?.close();}catch{}return null;}
}
