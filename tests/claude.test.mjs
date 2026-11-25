import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {claudeEvent,claudeSnapshot,mergeClaudeEvent} from '../server/claude-state.mjs';
import {mergeCodexEvent} from '../server/codex-state.mjs';
import {recordClaudeEvent} from '../scripts/claude-hook.mjs';
import {readClaudeStatus} from '../server/adapters/claude.mjs';
import {mergeClaudeHooks} from '../scripts/install-claude-hooks.mjs';
const input=(event,extra={})=>({hook_event_name:event,session_id:'claude-fixture',cwd:'C:\\Projects\\Demo',...extra});
test('Claude hook keeps only lifecycle metadata and hashes the session id',()=>{
 const event=claudeEvent(input('UserPromptSubmit',{prompt:'PRIVATE PROMPT',transcript_path:'PRIVATE PATH',tool_input:{command:'PRIVATE COMMAND'}}),1000);
 assert.equal(event.status,'working');assert.equal(event.title,'Demo');assert.match(event.id,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(event).includes('PRIVATE'));assert.ok(!JSON.stringify(event).includes('claude-fixture'));
 assert.equal(claudeEvent(input('Interrupt')),null);assert.equal(claudeEvent({hook_event_name:'Stop'}),null);
});
test('Claude statuses: work, question, permission, completion and stale',()=>{
 let state=mergeCodexEvent(null,claudeEvent(input('UserPromptSubmit'),1000));
 state=mergeCodexEvent(state,claudeEvent(input('PreToolUse',{tool_name:'AskUserQuestion'}),2000));assert.equal(state.status,'waiting');
 state=mergeCodexEvent(state,claudeEvent(input('PermissionRequest',{tool_name:'AskUserQuestion'}),2500));assert.equal(state.status,'waiting');
 state=mergeClaudeEvent(state,claudeEvent(input('Notification',{notification_type:'permission_prompt'}),2700));assert.equal(state.status,'waiting');
 state=mergeCodexEvent(state,claudeEvent(input('PostToolUse',{tool_name:'AskUserQuestion'}),3000));assert.equal(state.status,'working');
 assert.equal(claudeEvent(input('PermissionRequest',{tool_name:'Bash'}),1).status,'approval');
 state=mergeCodexEvent(state,claudeEvent(input('Notification',{notification_type:'permission_prompt'}),4000));assert.equal(state.status,'approval');assert.equal(state.startedAt,1000);
 assert.equal(claudeSnapshot([state],130000).sessions[0].status,'approval');
 assert.equal(claudeSnapshot([state],4000+1800001).sessions[0].status,'stale');
 const working=mergeCodexEvent(null,claudeEvent(input('PreToolUse'),1000));assert.equal(claudeSnapshot([working],130000).sessions[0].status,'stale');
 state=mergeCodexEvent(state,claudeEvent(input('Stop'),5000));assert.equal(state.status,'completed');
 assert.equal(claudeEvent(input('Notification',{notification_type:'idle_prompt'})),null);
 assert.equal(claudeSnapshot([claudeEvent(input('SessionEnd'),6000)],6001).sessions.length,0);
 assert.equal(claudeSnapshot([],7000,true).connection,'awaiting_events');assert.equal(claudeSnapshot([],7000,false).connection,'not_configured');
 assert.equal(claudeSnapshot([state],5001).id,'claude');
});
test('Claude hook installation preserves other settings and is idempotent',()=>{
 const original={model:'x',hooks:{Stop:[{hooks:[{type:'command',command:'existing'}]}]}};
 const merged=mergeClaudeHooks(original,'"node" "deskpanel"');assert.equal(original.hooks.Stop.length,1);assert.equal(merged.model,'x');assert.equal(merged.hooks.Stop[0].hooks[0].command,'existing');
 assert.deepEqual(mergeClaudeHooks(merged,'"node" "deskpanel"'),merged);
 assert.ok(merged.hooks.Notification&&merged.hooks.PermissionRequest);assert.ok(!('Interrupt' in merged.hooks));
});
test('Claude hook writes state read by the adapter; CLI replies neutrally',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'deskpanel-claude-test-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));
 await recordClaudeEvent(input('UserPromptSubmit'),dir);await recordClaudeEvent(input('Stop'),dir);
 const result=await readClaudeStatus(dir);assert.equal(result.id,'claude');assert.equal(result.connection,'connected');assert.equal(result.sessions[0].status,'completed');
 assert.equal((await readdir(dir)).length,1);
 const out=execFileSync(process.execPath,[resolve('scripts/claude-hook.mjs')],{input:JSON.stringify(input('Stop',{prompt:'PRIVATE'})),encoding:'utf8',env:{...process.env,LOCALAPPDATA:dir}});
 assert.equal(out,'{}');
});
test('Claude adapter reports not_configured without a marker',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'deskpanel-claude-empty-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const result=await readClaudeStatus(dir);assert.equal(result.connection,'not_configured');assert.deepEqual(result.sessions,[]);
});
