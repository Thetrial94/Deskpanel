import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {sessionStatus} from '../src/core/agent-labels.js';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readCodexMetadata} from '../server/adapters/codex-metadata.mjs';
import {readCodexStatus} from '../server/adapters/codex.mjs';
import {recordEvent} from '../scripts/codex-hook.mjs';
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'deskpanel-metadata-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));return dir;}
test('metadata reader reflects live turn transitions without exposing chat content',async t=>{
 const dir=await fixture(t),now=Date.now(),s=new DatabaseSync(join(dir,'state_5.sqlite')),h=new DatabaseSync(join(dir,'thread_history_1.sqlite'));
 s.exec('CREATE TABLE threads(id TEXT,cwd TEXT,updated_at INTEGER,updated_at_ms INTEGER,archived INTEGER,title TEXT,first_user_message TEXT,name TEXT)');
 h.exec('CREATE TABLE thread_turns(thread_id TEXT,turn_id TEXT,root_turn_id TEXT,rollout_ordinal INTEGER,status TEXT,started_at INTEGER,completed_at INTEGER)');
 s.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?,?)').run('live','C:/Projects/DeskPanel',Math.floor(now/1000),now,0,'PRIVATE TITLE','PRIVATE PROMPT','Подключение Codex');
 h.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?,?)').run('live','root','root',1,'inProgress',Math.floor(now/1000),null);
 h.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?,?)').run('live','child','root',2,'completed',Math.floor(now/1000),Math.floor(now/1000));
 s.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?,?)').run('archived','C:/Hidden',Math.floor(now/1000),now,1,'PRIVATE','PRIVATE','Архив');
 h.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?,?)').run('archived','archived',null,1,'inProgress',Math.floor(now/1000),null);
 try{
  let result=await readCodexMetadata(dir,now);assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].status,'working');assert.equal(result.sessions[0].title,'Подключение Codex');assert.match(result.sessions[0].id,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.ok(!JSON.stringify(result).includes('C:/'));
  assert.equal((await readCodexMetadata(dir,now+121000)).sessions[0].status,'stale');
  h.prepare('UPDATE thread_turns SET status=?,completed_at=? WHERE turn_id=?').run('completed',Math.floor(now/1000),'root');
  result=await readCodexMetadata(dir,now);assert.equal(result.sessions[0].status,'completed');
  s.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?,?)').run('second','C:/Projects/DeskPanel',Math.floor(now/1000),now,0,'PRIVATE TITLE','PRIVATE PROMPT','Экран музыки');
  h.prepare('INSERT INTO thread_turns VALUES(?,?,?,?,?,?,?)').run('second','second',null,1,'completed',Math.floor(now/1000),Math.floor(now/1000));
  result=await readCodexMetadata(dir,now);assert.deepEqual(result.sessions.map(x=>x.title).sort(),['Подключение Codex','Экран музыки'].sort());
  const liveId=result.sessions.find(x=>x.title==='Подключение Codex').id;
  s.prepare('UPDATE threads SET name=? WHERE id=?').run('  Новое название  ','live');
  result=await readCodexMetadata(dir,now);assert.equal(result.sessions.find(x=>x.id===liveId).title,'Новое название');
  s.prepare('UPDATE threads SET name=? WHERE id=?').run('  ','second');
  result=await readCodexMetadata(dir,now);assert.match(result.sessions.find(x=>x.id!==liveId).title,/^Сессия [a-f0-9]{8}$/);
  assert.equal(s.prepare('SELECT first_user_message FROM threads WHERE id=?').get('live').first_user_message,'PRIVATE PROMPT');
 }finally{s.close();h.close();}
});
test('missing or incompatible databases stay unavailable and are not created',async t=>{
 const dir=await fixture(t);assert.equal(await readCodexMetadata(dir),null);assert.deepEqual(await readdir(dir),[]);
 const s=new DatabaseSync(join(dir,'state_5.sqlite')),h=new DatabaseSync(join(dir,'thread_history_1.sqlite'));s.close();h.close();assert.equal(await readCodexMetadata(dir),null);
});
test('metadata requires installed opt-in and fresh hook states take priority',async t=>{
 const dir=await fixture(t);let calls=0;const now=Date.now();const metadataReader=async()=>{calls++;return {id:'codex',connection:'connected',sessions:[{id:createHash('sha256').update('live').digest('hex'),title:'Подключение Codex',status:'working',source:'local_metadata',updatedAt:new Date(now).toISOString()}],updatedAt:new Date(now).toISOString()};};
 assert.equal((await readCodexStatus(dir,{metadataReader})).connection,'not_configured');assert.equal(calls,0);
 await writeFile(join(dir,'installed.json'),JSON.stringify({schemaVersion:1}));
 await recordEvent({hook_event_name:'PermissionRequest',session_id:'live',cwd:'C:/Projects/DeskPanel'},dir);
 const result=await readCodexStatus(dir,{metadataReader});assert.equal(calls,1);assert.equal(result.sessions[0].status,'approval');assert.equal(result.sessions[0].source,'hooks');assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].title,'Подключение Codex');
 const staleFile=join(dir,result.sessions[0].id+'.json');await writeFile(staleFile,JSON.stringify({schemaVersion:1,id:result.sessions[0].id,title:'DeskPanel',status:'approval',event:'PermissionRequest',updatedAt:now-121000,startedAt:now-130000}));
 const fallback=await readCodexStatus(dir,{metadataReader});assert.equal(fallback.sessions[0].source,'local_metadata');assert.equal(sessionStatus(fallback.sessions[0]),'В процессе');
});
