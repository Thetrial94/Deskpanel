import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {codexEvent,mergeCodexEvent,codexSnapshot} from '../server/codex-state.mjs';
import {recordEvent} from '../scripts/codex-hook.mjs';
import {readCodexStatus} from '../server/adapters/codex.mjs';
import {mergeHooks} from '../scripts/install-codex-hooks.mjs';
const input=(event,extra={})=>({hook_event_name:event,session_id:'fixture-session',turn_id:'turn-1',cwd:'C:\\Projects\\Demo',...extra});
test('Codex hook records only lifecycle metadata and hashes identifiers',()=>{
 const event=codexEvent(input('UserPromptSubmit',{prompt:'PRIVATE PROMPT',transcript_path:'PRIVATE PATH',tool_input:{command:'PRIVATE COMMAND'},last_assistant_message:'PRIVATE ANSWER'}),1000);
 assert.equal(event.status,'working');assert.equal(event.title,'Demo');assert.match(event.id,/^[a-f0-9]{64}$/);
 assert.ok(!JSON.stringify(event).includes('PRIVATE'));assert.ok(!JSON.stringify(event).includes('fixture-session'));
 assert.equal(codexEvent(input('Unknown')),null);
});
test('Codex statuses distinguish approval, stopped answer, interruption and stale activity',()=>{
 let state=mergeCodexEvent(null,codexEvent(input('UserPromptSubmit'),1000));
 state=mergeCodexEvent(state,codexEvent(input('PermissionRequest'),2000));assert.equal(state.status,'approval');assert.equal(state.startedAt,1000);
 assert.equal(codexSnapshot([state],123000).sessions[0].status,'stale');
 state=mergeCodexEvent(state,codexEvent(input('PostToolUse'),3000));assert.equal(state.status,'working');
 state=mergeCodexEvent(state,codexEvent(input('Stop'),4000));assert.equal(state.status,'completed');
 const old=codexEvent(input('PreToolUse'),3500);assert.deepEqual(mergeCodexEvent(state,old),state);
 state=mergeCodexEvent(state,codexEvent(input('UserPromptSubmit',{turn_id:'turn-2'}),5000));assert.equal(state.startedAt,5000);
 assert.equal(codexEvent(input('Interrupt'),6000).status,'interrupted');
 assert.equal(codexSnapshot([codexEvent(input('SessionEnd'),7000)],7001).sessions.length,0);
 assert.equal(codexSnapshot([],8000,true).connection,'awaiting_events');
});
test('hook installation merges existing commands and remains idempotent',()=>{
 const original={description:'Existing',hooks:{Stop:[{hooks:[{type:'command',command:'existing-memory-command'}]}]}};
 const merged=mergeHooks(original,'node deskpanel-hook');assert.equal(original.hooks.Stop.length,1);assert.equal(merged.hooks.Stop[0].hooks[0].command,'existing-memory-command');assert.equal(merged.description,'Existing');
 assert.deepEqual(mergeHooks(merged,'node deskpanel-hook'),merged);
 assert.ok(merged.hooks.PermissionRequest.every(group=>group.hooks.every(h=>!h.async)));
});
test('hook writes atomic state consumed by adapter; CLI outputs a neutral response',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'deskpanel-codex-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await recordEvent(input('UserPromptSubmit'),dir);await recordEvent(input('Stop'),dir);
 const result=await readCodexStatus(dir);assert.equal(result.connection,'connected');assert.equal(result.sessions[0].status,'completed');
 const names=await readdir(dir);assert.equal(names.length,1);assert.match(names[0],/^[a-f0-9]{64}\.json$/);
 assert.ok(!JSON.parse(await readFile(join(dir,names[0]),'utf8')).prompt);
 const output=execFileSync(process.execPath,[resolve('scripts/codex-hook.mjs')],{input:JSON.stringify(input('Stop',{prompt:'SECRET'})),encoding:'utf8',windowsHide:true,env:{...process.env,LOCALAPPDATA:dir}});
 assert.equal(output,'{}');
 const cliState=await readCodexStatus(join(dir,'DeskPanel','codex'));assert.equal(cliState.sessions.length,1);
});
test('expired locks recover and malformed records cannot claim a connection',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'deskpanel-lock-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const event=codexEvent(input('PreToolUse')),lock=join(dir,event.id+'.json.lock');await writeFile(lock,'');const old=new Date(Date.now()-20000);await utimes(lock,old,old);
 assert.equal(await recordEvent(input('PostToolUse'),dir),true);
 assert.equal((await readCodexStatus(dir)).sessions[0].status,'working');
 assert.equal(codexSnapshot([{updatedAt:Date.now()}]).connection,'awaiting_events');
});
