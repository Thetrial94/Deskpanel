import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionGroups,agentSummary,statusAge,attentionNotice,sortSessions} from '../src/core/agent-view.js';
const session=(status,id=status)=>({id,status,title:'Чат '+id,updatedAt:'2026-11-18T10:00:00Z'});
test('attention precedes work and recent sessions without mutating the source',()=>{
 const sessions=['completed','working','waiting','stale','approval','error','interrupted'].map(s=>session(s));
 const groups=sessionGroups(sessions);assert.deepEqual(groups.map(g=>g.id),['current','other','recent']);
 assert.deepEqual(groups[0].sessions.map(s=>s.status),['approval','waiting','error','working']);assert.equal(sessions[0].status,'completed');
 assert.equal(sortSessions(sessions)[0].status,'approval');
 assert.equal(agentSummary([session('working'),session('working','two'),session('waiting')]),'2 в работе · 1 ждёт ответа');
});
test('duration requires known transition time and never uses a refresh as a transition',()=>{
 const now=Date.parse('2026-11-18T12:00:00Z');
 assert.equal(statusAge(session('working'),now),'');
 assert.equal(statusAge({...session('waiting'),statusSince:new Date(now-125000).toISOString()},now),'2 мин');
 assert.equal(statusAge({...session('completed'),statusSince:new Date(now-3660000).toISOString()},now),'1 ч 1 мин назад');
 assert.equal(statusAge({...session('working'),statusSince:new Date(now+5000).toISOString()},now),'');
});
test('notice shows approvals, routes to the right provider and clears on disconnect',()=>{
 const snapshot={codex:{connection:'connected',sessions:[session('waiting'),session('approval')]},claude:{connection:'connected',sessions:[session('waiting')]}};
 assert.match(attentionNotice(snapshot).label,/Codex ждёт разрешения/);
 snapshot.codex.sessions=[];assert.equal(attentionNotice(snapshot).provider,'claude');
 snapshot.claude.connection='disconnected';assert.equal(attentionNotice(snapshot),null);
});

test('one and two current chats share one group regardless of working or waiting state',()=>{
 const one=sessionGroups([session('working'),session('completed')]);assert.equal(one[0].sessions.length,1);
 const two=sessionGroups([session('working'),session('waiting'),session('completed')]);assert.equal(two[0].id,'current');assert.deepEqual(two[0].sessions.map(s=>s.status),['waiting','working']);assert.equal(two[1].id,'recent');
});
