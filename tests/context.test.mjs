import test from 'node:test';
import assert from 'node:assert/strict';
import {SmartTransitions,overviewContext,isEvening,approachingMeeting,activeTimer} from '../src/core/context.js';
import {QuickTimer} from '../src/core/timer.js';
import {normalizeSettings} from '../src/core/settings.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const now=Date.parse('2026-11-18T12:00:00Z');
const event=(delta=60000)=>({id:'meeting',title:'Встреча',start:new Date(now+delta).toISOString(),end:new Date(now+3600000).toISOString(),allDay:false});
const calendar={connection:'connected',events:[event()]};
const agents={codex:{connection:'connected',sessions:[{id:'a',title:'Агент',status:'waiting',statusSince:new Date(now-60000).toISOString()}]}};
test('overview chooses exactly one card: approaching meeting, question, timer, calendar',()=>{
 const t=new QuickTimer(memory());t.start(now);
 assert.equal(overviewContext({calendar,agents,timer:t},now).kind,'meeting');
 const later={...calendar,events:[event(600000)]};assert.equal(overviewContext({calendar:later,agents,timer:t},now).kind,'agent');
 assert.equal(overviewContext({calendar:later,agents:{},timer:t},now).kind,'timer');
 assert.equal(overviewContext({calendar:later,agents:{}},now).kind,'calendar');
 assert.equal(overviewContext({calendar,agents,quiet:true},now),null);
 assert.equal(overviewContext({calendar:{connection:'unavailable'},agents:{}},now),null);
});
test('meetings exclude all-day, ended and old starts and sort by time',()=>{
 assert.equal(approachingMeeting({connection:'connected',events:[{...event(),allDay:true},event(-180000)]},now),null);
 assert.equal(approachingMeeting({...calendar,connection:'unavailable'},now),null);
 assert.equal(approachingMeeting(calendar,now).id,'meeting');
});
test('smart transitions defer blocked events, deduplicate across reloads and hold one event',()=>{
 const storage=memory(),s=new SmartTransitions(storage),base={calendar,agents,quiet:false,enabled:true,allow:true,now};
 assert.equal(s.next({...base,blocked:true}),null);
 assert.equal(s.next({...base,blocked:false}).target,'meeting');
 assert.equal(s.next({...base,now:now+1000}),null);
 assert.equal(s.next({...base,now:now+21000}).target,'codex');
 assert.equal(new SmartTransitions(storage).next({...base,now:now+42000}),null);
 assert.equal(s.next({...base,now:now+43000,agents:{codex:{...agents.codex,sessions:[{...agents.codex.sessions[0],statusSince:new Date(now+42000).toISOString()}]}}}).target,'codex');
});
test('evening enters calm overview once, does not repeat after manual browsing and suppresses work',()=>{
 const s=new SmartTransitions(memory()),base={quiet:true,enabled:true,blocked:false,allow:true,calendar,agents,now};
 assert.equal(s.next(base).target,'overview');assert.equal(s.next({...base,now:now+30000}),null);
 assert.equal(s.next({...base,quiet:false,allow:false}),null);
 assert.equal(s.next({...base,quiet:false,enabled:false}),null);
 assert.equal(s.next(base).target,'overview');
 const cfg=normalizeSettings();assert.equal(isEvening(cfg,new Date(2026,10,18,23).getTime()),true);assert.equal(isEvening(cfg,new Date(2026,10,18,8).getTime()),false);
 assert.equal(isEvening({...cfg,eveningStart:7,eveningEnd:7},now),false);
});
test('quick timer pause, restore, completion notice, dismiss and extension survive refresh',()=>{
 const store=memory(),t=new QuickTimer(store);assert.equal(t.set(5),true);t.start(1000);t.pause(61000);assert.equal(t.seconds(),240);
 const restored=new QuickTimer(store);restored.start(100000);assert.equal(restored.tick(340000),true);assert.equal(restored.tick(340001),false);assert.equal(new QuickTimer(store).notice,true);
 restored.dismiss();assert.equal(new QuickTimer(store).notice,false);restored.extend(500000);assert.equal(restored.seconds(500000),300);assert.equal(restored.completed,false);
 for(const value of [-1,0,0.5,1441,NaN])assert.equal(restored.set(value),false);
 restored.reset();assert.equal(restored.deadline,null);
});
test('new timer screen migrates once and can be hidden; evening settings are bounded',()=>{
 const old=normalizeSettings({version:4,enabledScreens:['clock']});assert.deepEqual(old.enabledScreens,['overview','timers']);
 const saved=normalizeSettings({...old,enabledScreens:['clock'],eveningStart:50,eveningEnd:-2});assert.deepEqual(saved.enabledScreens,['overview']);assert.equal(saved.eveningStart,23);assert.equal(saved.eveningEnd,0);
});

test('legacy clocks, focus and breaks merge without duplicates or losing timer storage',()=>{
 const value=normalizeSettings({version:5,screenOrder:['clock','focus','breaks','timers','weather'],enabledScreens:['clock','focus','breaks','timers'],city:null,autoRotate:false});
 assert.deepEqual(value.enabledScreens,['overview','timers']);assert.deepEqual(value.screenOrder.slice(0,3),['overview','timers','weather']);assert.equal(value.version,6);assert.equal(value.city,null);assert.equal(value.autoRotate,false);
 assert.equal(value.screenOrder.some(id=>['clock','focus','breaks'].includes(id)),false);
});
test('overview selects the closest running timer across all three modes',()=>{
 const a={deadline:now+300000,seconds:()=>300},b={deadline:now+60000,seconds:()=>60};assert.equal(activeTimer({timer:a,focus:b},now).mode,'focus');assert.equal(overviewContext({calendar:{},agents:{},focus:b},now).label,'Фокус');
 assert.equal(activeTimer({breaks:{...b,phase:'rest'}},now).label,'Перерыв');
});
