import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {codexUsage,claudeUsage,validateUsage,unavailableUsage} from '../server/agent-usage.mjs';
import {queryCodexUsage,createCodexUsageReader} from '../server/adapters/codex-usage.mjs';
import {readCodexStatus} from '../server/adapters/codex.mjs';
import {readClaudeStatus} from '../server/adapters/claude.mjs';
import {recordClaudeUsage,previousStatusline} from '../scripts/claude-statusline.mjs';
import {mergeClaudeStatusline} from '../scripts/install-claude-hooks.mjs';
import {usageWindowView,agentUsageHTML} from '../src/core/agent-usage-view.js';
const now=1800000000000,reset=now/1000+3600;
const codexWindow=(usedPercent,windowDurationMins,resetsAt=reset)=>({usedPercent,windowDurationMins,resetsAt});
const native={rate_limits:{five_hour:{used_percentage:0,resets_at:reset},seven_day:{used_percentage:87.2,resets_at:reset+86400}}};
async function dir(t){const path=await mkdtemp(join(tmpdir(),'deskpanel-usage-'));t.after(()=>rm(path,{recursive:true,force:true,maxRetries:3,retryDelay:100}));return path;}
test('Codex maps exact window durations, including weekly primary and missing five-hour window',()=>{
 let usage=codexUsage({rateLimits:{primary:codexWindow(33,10080),secondary:null}},now);
 assert.equal(usage.windows.fiveHour,null);assert.equal(usage.windows.week.usedPercent,33);
 usage=codexUsage({rateLimits:{primary:codexWindow(10,15)},rateLimitsByLimitId:{codex:{primary:codexWindow(0,300),secondary:codexWindow(100,10080)},other:{primary:codexWindow(50,300)}}},now);
 assert.equal(usage.windows.fiveHour.usedPercent,0);assert.equal(usage.windows.week.usedPercent,100);
 assert.equal(codexUsage({rateLimits:{limitId:'other',primary:codexWindow(10,300)}},now).status,'unavailable');
 assert.equal(codexUsage({rateLimits:{primary:codexWindow(10,15)}},now).status,'unavailable');
});
test('Quota normalization rejects invalid values, preserves zero, and drops nonquota information',()=>{
 const usage=claudeUsage({...native,prompt:'PRIVATE',transcript_path:'PRIVATE',rate_limits:{...native.rate_limits,account_token:'PRIVATE'}},now);
 assert.equal(usage.windows.fiveHour.usedPercent,0);assert.equal(usage.windows.week.usedPercent,87.2);assert.ok(!JSON.stringify(usage).includes('PRIVATE'));
 for(const bad of [null,'0',-1,101,Infinity,NaN])assert.equal(claudeUsage({rate_limits:{five_hour:{used_percentage:bad}}},now).status,'unavailable');
 assert.equal(validateUsage({...usage,updatedAt:new Date(now+10000).toISOString()},now).status,'unavailable');
 assert.deepEqual(validateUsage(usage,now),usage);
});
test('Remaining quota view distinguishes fresh, stale, expired and absent data without guessing a reset',()=>{
 const usage=claudeUsage(native,now);
 assert.equal(usageWindowView(usage,'fiveHour',now).remaining,100);
 assert.equal(usageWindowView(usage,'week',now).remaining,12);
 assert.equal(usageWindowView(usage,'week',now).tone,'warning');
 assert.equal(usageWindowView(usage,'week',now+16*60000).tone,'stale');
 assert.equal(usageWindowView(usage,'fiveHour',now+3600000).remaining,null);
 assert.match(usageWindowView(usage,'fiveHour',now+3600000).note,/Ожидаем/);
 assert.equal(usageWindowView(unavailableUsage(),'fiveHour',now).remaining,null);
 assert.equal(usageWindowView({...usage,updatedAt:new Date(now+10000).toISOString()},'week',now).remaining,null);
 assert.equal((agentUsageHTML(usage,now).match(/<meter /g)||[]).length,2);
 assert.equal((agentUsageHTML(unavailableUsage(),now).match(/<meter /g)||[]).length,0);
});
test('Usage refresh is nonblocking, deduplicated, throttled and retains honest stale data on failure',async()=>{
 let clock=now,calls=0,resolveQuery;const usage=claudeUsage(native,now);
 const reader=createCodexUsageReader({now:()=>clock,interval:100,query:()=>{calls++;return new Promise(r=>resolveQuery=r);}});
 assert.equal(reader.read().status,'unavailable');reader.read();await Promise.resolve();assert.equal(calls,1);
 resolveQuery(usage);await reader.refresh();assert.deepEqual(reader.read(),usage);
 clock+=101;assert.deepEqual(reader.read(),usage);await Promise.resolve();assert.equal(calls,2);
 resolveQuery(unavailableUsage());await reader.refresh();assert.equal(reader.read().refreshFailed,true);assert.equal(reader.read().updatedAt,usage.updatedAt);
});
function fakeServer(response,seen,{silent=false}={}){
 return ()=>{
  const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.kill=()=>{child.killed=true;};let buffer='';
  child.stdin.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);seen.push(message);if(silent)continue;
   const reply=message.id===1?{id:1,result:{}}:message.id===2?{id:2,...response}:null;
   if(reply)queueMicrotask(()=>child.stdout.write(JSON.stringify(reply)+'\n'));
  }});return child;
 };
}
test('Codex RPC uses only initialize and read-only limits, ignores error bodies, and has a timeout',async()=>{
 const seen=[];const result=await queryCodexUsage({binary:'fixture',spawnProcess:fakeServer({result:{rateLimits:{primary:codexWindow(10,300)}}},seen)});
 assert.equal(result.windows.fiveHour.usedPercent,10);
 assert.deepEqual(seen.map(x=>x.method),['initialize','initialized','account/rateLimits/read']);
 const error=await queryCodexUsage({binary:'fixture',spawnProcess:fakeServer({error:{code:-1,message:'PRIVATE TOKEN'}},[])});
 assert.equal(error.status,'unavailable');assert.ok(!JSON.stringify(error).includes('PRIVATE'));
 const timeout=await queryCodexUsage({binary:'fixture',spawnProcess:fakeServer({},[],{silent:true}),timeout:10});assert.equal(timeout.reason,'timeout');
});
test('Claude collector saves allowlisted quotas and the adapter reads them without transcripts',async t=>{
 const path=await dir(t);await writeFile(join(path,'installed.json'),'{"schemaVersion":1}');
 const value=await recordClaudeUsage({...native,session_id:'PRIVATE',prompt:'PRIVATE',transcript_path:'PRIVATE'},path);
 const raw=await readFile(join(path,'usage.json'),'utf8');assert.ok(!raw.includes('PRIVATE'));
 const result=await readClaudeStatus(path);assert.deepEqual(result.usage,value);assert.equal(result.sessions.length,0);
 await writeFile(join(path,'usage.json'),'x'.repeat(5000));assert.equal((await readClaudeStatus(path)).usage.status,'unavailable');
 await recordClaudeUsage({},path);assert.equal((await readClaudeStatus(path)).usage.status,'unavailable');
});
test('Codex quota failure cannot break session statuses and disabled installation never queries quotas',async t=>{
 const path=await dir(t);let calls=0;const usageReader=()=>{calls++;throw Error('PRIVATE');};
 await readCodexStatus(path,{usageReader});assert.equal(calls,0);
 await writeFile(join(path,'installed.json'),'{"schemaVersion":1}');
 const result=await readCodexStatus(path,{metadataReader:async()=>({sessions:[],connection:'connected'}),usageReader});
 assert.equal(calls,1);assert.equal(result.connection,'connected');assert.equal(result.usage.status,'unavailable');
});
test('Claude statusLine installation preserves formatting, chains the existing command and is idempotent',async t=>{
 const config={statusLine:{type:'command',command:'old-command',padding:2},model:'example'};
 const merged=mergeClaudeStatusline(config,'"node" "C:/DeskPanel/scripts/claude-statusline.mjs"');
 assert.equal(merged.config.statusLine.padding,2);assert.equal(merged.previous.command,'old-command');assert.equal(config.statusLine.command,'old-command');
 const again=mergeClaudeStatusline(merged.config,merged.config.statusLine.command);assert.deepEqual(again.config,merged.config);assert.equal(again.previous,null);
 const path=await dir(t);await writeFile(join(path,'previous-statusline.json'),JSON.stringify({command:"printf 'existing-output'"}));
 assert.equal(await previousStatusline('{"rate_limits":{}}',path,{timeout:10000}),'existing-output');
});
