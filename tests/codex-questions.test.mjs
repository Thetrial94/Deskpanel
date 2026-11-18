import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readCodexMetadata} from '../server/adapters/codex-metadata.mjs';
import {readCodexStatus} from '../server/adapters/codex.mjs';
import {recordEvent} from '../scripts/codex-hook.mjs';
import {questionEvent} from '../server/adapters/codex-questions.mjs';
const turn='00000000-0000-0000-0000-000000000001';
const event=(call,extra='')=>`tool_name="request_user_input_async" call_id=${call} turn_id=${turn} aborted=false execution_started=true ${extra}`;
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'deskpanel-questions-')),now=Date.now();
 const state=new DatabaseSync(join(dir,'state_5.sqlite')),history=new DatabaseSync(join(dir,'thread_history_1.sqlite')),logs=new DatabaseSync(join(dir,'logs_2.sqlite'));
 t.after(async()=>{state.close();history.close();logs.close();await rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100});});
 state.exec('CREATE TABLE threads(id TEXT,name TEXT,updated_at INTEGER,updated_at_ms INTEGER,archived INTEGER)');
 state.prepare('INSERT INTO threads VALUES(?,?,?,?,0)').run('live','Тестовая сессия',Math.floor(now/1000),now);
 history.exec('CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,root_turn_id TEXT,rollout_ordinal INTEGER,status TEXT,started_at INTEGER,completed_at INTEGER); CREATE TABLE thread_items(thread_id TEXT,item_type TEXT,created_at_ms INTEGER,item_json TEXT)');
 history.prepare('INSERT INTO thread_turns VALUES(?,?,NULL,1,?,?,?)').run('live',turn,'completed',Math.floor(now/1000),Math.floor(now/1000));
 logs.exec('CREATE TABLE logs(thread_id TEXT,ts INTEGER,target TEXT,feedback_log_body TEXT)');
 const call=(id,body=event(id),stamp=now)=>logs.prepare('INSERT INTO logs VALUES(?,?,?,?)').run('live',Math.floor(stamp/1000),'codex_core::tools::parallel',body);
 const message=text=>history.prepare('INSERT INTO thread_items VALUES(?,?,?,?)').run('live','userMessage',now,JSON.stringify({content:[{type:'text',text}]}));
 const answer=id=>message('<send_user_message_question_reply>\r\n'+JSON.stringify([{questionItemId:JSON.stringify(['request_user_input_async',id,0]),question:'PRIVATE QUESTION',answer:'PRIVATE ANSWER'}])+'\n</send_user_message_question_reply>\r\n');
 const read=async(time=now)=>readCodexMetadata(dir,time);
 return {dir,now,history,logs,call,message,answer,read};
}
test('async question persists after completed turn and clears only for matching service reply',async t=>{
 const f=await fixture(t);f.call('call_one');
 assert.equal((await f.read()).sessions[0].status,'waiting');
 const later=await f.read(f.now+121000);assert.equal(later.sessions[0].status,'waiting');assert.equal(later.sessions[0].statusSince,new Date(Math.floor(f.now/1000)*1000).toISOString());
 f.message('PRIVATE ordinary reply');f.answer('call_other');
 assert.equal((await f.read()).sessions[0].status,'waiting');
 f.call('call_two');f.answer('call_one');
 assert.equal((await f.read()).sessions[0].status,'waiting');
 f.answer('call_two');const result=await f.read();assert.equal(result.sessions[0].status,'completed');
 assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('call_'));
});
test('invalid, aborted, unstarted, expired and interrupted requests do not wait',async t=>{
 const f=await fixture(t);
 f.call('call_bad','bad');f.call('call_abort',event('call_abort').replace('aborted=false','aborted=true'));
 f.call('call_unstarted',event('call_unstarted').replace('execution_started=true','execution_started=false'));
 f.call('call_old',event('call_old'),f.now-86401000);
 assert.equal((await f.read()).sessions[0].status,'completed');
 f.call('call_good');f.message('<send_user_message_question_reply>not json</send_user_message_question_reply>');
 assert.equal((await f.read()).sessions[0].status,'waiting');
 for(const status of ['interrupted','failed']){f.history.prepare('UPDATE thread_turns SET status=?').run(status);assert.notEqual((await f.read()).sessions[0].status,'waiting');}
});
test('optional question schema failure keeps basic status available',async t=>{
 const f=await fixture(t);f.call('call_one');f.history.exec('DROP TABLE thread_items');
 assert.equal((await f.read()).sessions[0].status,'completed');
});
test('fresh routine hook cannot erase a known unanswered question',async t=>{
 const f=await fixture(t);f.call('call_one');await writeFile(join(f.dir,'installed.json'),'{"schemaVersion":1}');
 await recordEvent({hook_event_name:'UserPromptSubmit',session_id:'live'},f.dir);
 const result=await readCodexStatus(f.dir,{metadataReader:()=>f.read()});assert.equal(result.sessions[0].status,'waiting');
});
test('technical parser rejects ambiguous calls',()=>{
 assert.equal(questionEvent(event('call_one','call_id=call_two')),null);
 assert.equal(JSON.parse(questionEvent(event('call_one','call_id=call_one'))).call,'call_one');
});

test('fresh permission request takes attention priority over an unanswered async question',async t=>{
 const f=await fixture(t);f.call('call_one');await writeFile(join(f.dir,'installed.json'),'{"schemaVersion":1}');
 await recordEvent({hook_event_name:'PermissionRequest',session_id:'live'},f.dir);
 assert.equal((await readCodexStatus(f.dir,{metadataReader:()=>f.read()})).sessions[0].status,'approval');
 await recordEvent({hook_event_name:'PostToolUse',session_id:'live'},f.dir);
 assert.equal((await readCodexStatus(f.dir,{metadataReader:()=>f.read()})).sessions[0].status,'waiting');
});
