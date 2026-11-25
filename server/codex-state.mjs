import {createHash} from 'node:crypto';
export const EVENTS=['SessionStart','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','Stop','Interrupt','SessionEnd'];
const hash=x=>createHash('sha256').update(x).digest('hex');
export function codexEvent(input,now=Date.now()){
 if(!input||!EVENTS.includes(input.hook_event_name)||typeof input.session_id!=='string'||!input.session_id||input.session_id.length>200)return null;
 const event=input.hook_event_name,turn=typeof input.turn_id==='string'?hash(input.turn_id):null;
 const tool=String(input.tool_name||'');
 const waiting=/request_user_input|elicitation/.test(tool);
 const status=event==='Stop'?'completed':event==='Interrupt'?'interrupted':event==='SessionEnd'?'closed':event==='SessionStart'?'idle':event==='PermissionRequest'?'approval':waiting?'waiting':'working';
 const project=typeof input.cwd==='string'?input.cwd.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1).slice(0,80):'Codex';
 return {schemaVersion:1,id:hash(input.session_id),turnId:turn,title:project||'Codex',event,status,updatedAt:now};
}
export function mergeCodexEvent(previous,next){
 if(!previous)return {...next,startedAt:next.updatedAt,statusSince:next.updatedAt};
 if(previous.updatedAt>next.updatedAt)return previous;
 if(next.event==='SessionStart'&&['working','approval','waiting'].includes(previous.status))return previous;
 const changedTurn=next.turnId&&previous.turnId&&next.turnId!==previous.turnId;
 return {...next,statusSince:changedTurn||previous.status!==next.status?next.updatedAt:previous.statusSince||previous.updatedAt,startedAt:changedTurn||next.event==='UserPromptSubmit'?next.updatedAt:previous.startedAt||next.updatedAt};
}
export function codexSnapshot(records,now=Date.now(),configured=true,provider={id:'codex',name:'Codex',events:EVENTS}){
 const valid=records.filter(r=>Number.isFinite(r?.updatedAt)&&Number.isFinite(r?.startedAt||r?.updatedAt)&&r?.schemaVersion===1&&/^[a-f0-9]{64}$/.test(r.id)&&provider.events.includes(r.event)&&typeof r.title==='string'&&r.updatedAt<=now+5000&&now-r.updatedAt<86400000&&['working','approval','waiting','completed','interrupted','idle','closed'].includes(r.status));
 // A pending question/permission produces no events by definition; providers may let it live longer than active work.
 const limit=r=>provider.staleMs?.[r.status]??120000,isStale=r=>['working','approval','waiting'].includes(r.status)&&now-r.updatedAt>limit(r);
 const sessions=valid.filter(r=>r.status!=='closed').map(r=>({id:r.id,title:r.title.slice(0,80),status:isStale(r)?'stale':r.status,statusSince:new Date(isStale(r)?r.updatedAt+limit(r):Number.isFinite(r.statusSince)&&r.statusSince<=r.updatedAt?r.statusSince:r.updatedAt).toISOString(),updatedAt:new Date(r.updatedAt).toISOString(),startedAt:new Date(r.startedAt||r.updatedAt).toISOString()})).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,12);
 return {id:provider.id,name:provider.name,connection:valid.length?'connected':configured?'awaiting_events':'not_configured',sessions,updatedAt:valid.length?new Date(Math.max(...valid.map(r=>r.updatedAt).filter(Number.isFinite))).toISOString():null};
}
