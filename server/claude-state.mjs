import {createHash} from 'node:crypto';
import {codexSnapshot,mergeCodexEvent} from './codex-state.mjs';
// Claude Code hook events. Claude has no Interrupt event: an interrupted turn ends with Stop.
export const CLAUDE_EVENTS=['SessionStart','UserPromptSubmit','PreToolUse','PermissionRequest','PostToolUse','Notification','Stop','SessionEnd'];
const hash=x=>createHash('sha256').update(x).digest('hex');
// Waiting for the user sends no further events, so keep it visible for 30 minutes (until Stop/SessionEnd or the ceiling).
const provider={id:'claude',name:'Claude',events:CLAUDE_EVENTS,staleMs:{approval:1800000,waiting:1800000}};
// Keeps only lifecycle metadata: hashed session id, project folder name, status and time.
export function claudeEvent(input,now=Date.now()){
 if(!input||!CLAUDE_EVENTS.includes(input.hook_event_name)||typeof input.session_id!=='string'||!input.session_id||input.session_id.length>200)return null;
 const event=input.hook_event_name,tool=String(input.tool_name||'');
 let status;
 if(event==='Notification'){
  const kind=String(input.notification_type||'');
  // Only notifications that mean "needs the user". idle_prompt etc. must not overwrite a finished answer.
  status=kind==='permission_prompt'?'approval':kind==='elicitation_dialog'?'waiting':null;
  if(!status)return null;
 }else status=event==='Stop'?'completed':event==='SessionEnd'?'closed':event==='SessionStart'?'idle':event==='PermissionRequest'?(tool==='AskUserQuestion'?'waiting':'approval'):event==='PreToolUse'&&tool==='AskUserQuestion'?'waiting':'working';
 const project=typeof input.cwd==='string'?input.cwd.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1).slice(0,80):'Claude';
 return {schemaVersion:1,id:hash(input.session_id),turnId:null,title:project||'Claude',event,status,updatedAt:now};
}
// Claude Code also sends a permission_prompt notification for AskUserQuestion; it must not downgrade a pending question.
export function mergeClaudeEvent(previous,next){
 if(previous?.status==='waiting'&&next.event==='Notification'&&next.status==='approval')return previous;
 return mergeCodexEvent(previous,next);
}
export const claudeSnapshot=(records,now=Date.now(),configured=true)=>codexSnapshot(records,now,configured,provider);
