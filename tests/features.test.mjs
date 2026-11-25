import {execFileSync} from 'node:child_process';
import {calendarDateLabel} from '../src/core/calendar.js';
import {homeRooms,deviceState} from '../src/core/home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DeviceAccess} from '../server/access.mjs';
import {validateConfig} from '../server/connections.mjs';
import {Features} from '../server/features.mjs';
import {createAppServer} from '../server/index.mjs';
import {parseCalendar,Calendar,fetchCalendar} from '../server/calendar.mjs';
import {Home,mapHA,mapYandex} from '../server/home.mjs';
import {Computer} from '../server/computer.mjs';
import {BreakTimer} from '../src/core/breaks.js';
import {normalizeSettings} from '../src/core/settings.js';
const store=(data={})=>({async get(){return data;},async update(fn){data=fn(structuredClone(data));return data;}});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const req=(token='',host='192.168.0.1:4317',address='192.168.0.2')=>({headers:{host,cookie:'deskpanel_device='+token},socket:{remoteAddress:address}});
test('pairing uses expiring single-use codes, hashed credentials and rate limiting',async()=>{
 const s=store(),a=new DeviceAccess(s);
 assert.equal(await a.authorized(req()),false);
 assert.equal(await a.authorized(req('','localhost:4317','127.0.0.1')),true);
 const code=a.issue().code,token=await a.pair(code,'phone');
 assert.equal(await a.authorized(req(token)),true);
 assert.ok(!(JSON.stringify(await s.get())).includes(token));
 await assert.rejects(a.pair(code,'phone'),/invalid_pair_code/);
 (await s.get()).devices[0].expires=0;assert.equal(await a.authorized(req(token)),false);
 a.issue();a.code.expires=0;await assert.rejects(a.pair(a.code.value,'other'),/invalid_pair_code/);
 for(let i=0;i<5;i++)await assert.rejects(a.pair('bad','blocked'),/invalid_pair_code/);
 await assert.rejects(a.pair(a.issue().code,'blocked'),/pair_rate_limit/);
});
test('configuration validates destinations and never accepts credentials in URLs',()=>{
 assert.equal(validateConfig({kind:'calendar',url:'https://calendar.yandex-team.ru/export?key=sample'}).kind,'calendar');
 for(const url of ['http://calendar.yandex.ru/x','https://example.com/x','https://user:pass@calendar.yandex.ru/x','https://calendar.yandex.ru.evil.test/'])assert.throws(()=>validateConfig({kind:'calendar',url}));
 for(const base of ['http://example.com','https://user:pass@ha.example.com','https://ha.example.com/?token=x'])assert.throws(()=>validateConfig({kind:'home',provider:'ha',base,token:'test-token-123'}));
 assert.equal(validateConfig({kind:'home',provider:'ha',base:'http://192.168.0.2:8123',token:'test-token-123'}).value.base,'http://192.168.0.2:8123');
 const settings=normalizeSettings({version:5,enabledScreens:['clock'],city:null,devices:[{name:'PC',url:'http://192.168.0.2:4317/'},{name:'bad',url:'javascript:alert(1)'},{name:'bad2',url:'http://user:pass@example.com'}]});
 assert.deepEqual(settings.enabledScreens,['overview']);assert.equal(settings.city,null);assert.deepEqual(settings.devices,[{name:'PC',url:'http://192.168.0.2:4317'}]);
});
test('private APIs reject unpaired devices and cross-origin writes, paired settings reveal no secrets',async t=>{
 const s=store({calendar:{url:'https://calendar.yandex.ru/private-test'},home:{provider:'yandex',token:'test-only-secret'}}),calls=[];
 const features=new Features({store:s,computer:{metrics:()=>({connection:'connected'}),run:async(command,value)=>{calls.push({command,value});return {connection:'connected',accepted:true};}}});
 const server=createAppServer({features});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 // Simulate a LAN connection while preserving the real server request pipeline.
 const original=features.handle.bind(features);features.handle=(path,request,res,send)=>original(path,{method:request.method,headers:request.headers,socket:{remoteAddress:'192.168.0.9'},[Symbol.asyncIterator]:()=>request[Symbol.asyncIterator]()},res,send);
 const base='http://127.0.0.1:'+server.address().port,headers={Origin:base,'Content-Type':'application/json','X-DeskPanel':'1'};
 for(const path of ['calendar','home','remote','connections'])assert.equal((await fetch(base+'/api/'+path)).status,403);
 assert.equal((await fetch(base+'/api/computer')).status,403);
 const code=features.access.issue().code;
 const pairing=await fetch(base+'/api/access',{method:'POST',headers,body:JSON.stringify({command:'pair',code})});
 assert.equal(pairing.status,200);const cookie=pairing.headers.get('set-cookie').split(';')[0];
 assert.match(pairing.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 const privateHeaders={...headers,Cookie:cookie};
 assert.equal((await fetch(base+'/api/computer',{headers:privateHeaders})).status,200);
 assert.deepEqual(await (await fetch(base+'/api/connections',{headers:privateHeaders})).json(),{local:false,calendar:true,home:'yandex'});
 assert.equal((await fetch(base+'/api/connections',{method:'POST',headers:privateHeaders,body:JSON.stringify({kind:'calendar',clear:true})})).status,403);
 assert.equal((await fetch(base+'/api/remote',{method:'POST',headers:{...privateHeaders,Origin:'https://evil.test'},body:'{"command":"lock","value":true}'})).status,403);
 assert.equal((await fetch(base+'/api/remote',{method:'POST',headers:{...privateHeaders,Origin:''},body:'{"command":"lock","value":true}'})).status,403);
 assert.equal(calls.length,0);
 assert.equal((await fetch(base+'/api/remote',{method:'POST',headers:privateHeaders,body:'{"command":"volume","value":22}'})).status,200);
 assert.deepEqual(calls,[{command:'volume',value:22}]);
});
test('break intervals survive refresh, pause and finish once; rest requires explicit start',()=>{
 const m=memory(),b=new BreakTimer(m);b.configure(25,3);b.start(1000);
 const restored=new BreakTimer(m);assert.equal(restored.seconds(61000),1440);
 restored.pause(61000);assert.equal(restored.seconds(9999999),1440);restored.start(100000);
 assert.equal(restored.tick(1540000),'work');assert.equal(restored.tick(1540001),null);assert.equal(restored.phase,'work');assert.equal(restored.deadline,null);
 restored.start(1600000);assert.equal(restored.phase,'rest');assert.equal(restored.seconds(1600000),180);
 restored.tick(1780000);assert.equal(restored.cycles,0);restored.start(1800000);assert.equal(restored.cycles,1);assert.equal(restored.phase,'work');
 restored.reset();assert.equal(restored.deadline,null);assert.equal(restored.due,false);
});
const ics=events=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//DeskPanel Tests//EN\r\n'+events.join('\r\n')+'\r\nEND:VCALENDAR';
const event=lines=>'BEGIN:VEVENT\r\n'+lines.join('\r\n')+'\r\nEND:VEVENT';
test('calendar handles Moscow recurrence, EXDATE, overrides, cancellation and all-day events',async()=>{
 const text=ics([
 event(['UID:series','DTSTART;TZID=Europe/Moscow:20261117T100000','DTEND;TZID=Europe/Moscow:20261117T110000','RRULE:FREQ=DAILY;COUNT=4','EXDATE;TZID=Europe/Moscow:20261118T100000','SUMMARY:Daily']),
 event(['UID:series','RECURRENCE-ID;TZID=Europe/Moscow:20261119T100000','DTSTART;TZID=Europe/Moscow:20261119T120000','DTEND;TZID=Europe/Moscow:20261119T130000','SUMMARY:Moved']),
 event(['UID:series','RECURRENCE-ID;TZID=Europe/Moscow:20261120T100000','DTSTART;TZID=Europe/Moscow:20261120T100000','DTEND;TZID=Europe/Moscow:20261120T110000','STATUS:CANCELLED']),
 event(['UID:day','DTSTART;VALUE=DATE:20261121','DTEND;VALUE=DATE:20261122','SUMMARY:All day']),
 event(['UID:cancelled','DTSTART:20261122T100000Z','DTEND:20261122T110000Z','STATUS:CANCELLED']),
 event(['UID:past','DTSTART:20261116T100000Z','DTEND:20261116T110000Z'])]);
 const events=await parseCalendar(text,Date.parse('2026-11-17T07:30:00Z'));
 assert.equal(events.length,3);
 assert.equal(events[0].start,'2026-11-17T07:00:00.000Z');
 assert.equal(events[1].title,'Moved');assert.equal(events[1].start,'2026-11-19T09:00:00.000Z');
 assert.equal(events[2].allDay,true);
 assert.deepEqual(Object.keys(events[0]).sort(),['allDay','end','id','joinURL','start','title']);
});
test('calendar fetch failures do not appear as an empty connected agenda',async()=>{
 const s=store();const calendar=new Calendar(s,async()=>{throw Error('private url should not leak');});
 assert.equal((await calendar.status()).connection,'not_configured');
 await s.update(()=>({calendar:{url:'https://calendar.yandex.ru/test'}}));
 assert.deepEqual(await calendar.status(),{connection:'unavailable',events:[],updatedAt:null});
});
test('home controls are limited to switches and lights, sensors are read-only',()=>{
 const devices=mapYandex({status:'ok',devices:[{id:'1',name:'Lamp',type:'devices.types.light',capabilities:[{type:'devices.capabilities.on_off',state:{value:true}}]},{id:'2',name:'Lock',type:'devices.types.openable',capabilities:[{type:'devices.capabilities.on_off'}]}]});
 assert.equal(devices[0].controllable,true);assert.equal(devices[1].controllable,false);
 const ha=mapHA([{entity_id:'sensor.temp',state:'21',attributes:{unit_of_measurement:'°C'}},{entity_id:'lock.door',state:'locked'},{entity_id:'light.hall',state:'unavailable'}]);
 assert.equal(ha.length,2);assert.equal(ha[0].value,'21 °C');assert.ok(ha.every(d=>!d.controllable));
});
test('home commands verify actual provider result, reject arbitrary device IDs and hide auth errors',async()=>{
 const s=store({home:{provider:'yandex',base:'https://api.iot.yandex.net',token:'test-token'}}),calls=[];
 let fail=false;
 const home=new Home(s,async(url,options)=>{calls.push({url,body:options.body});return new Response(JSON.stringify(url.endsWith('/info')?{status:'ok',devices:[{id:'lamp',name:'Lamp',type:'devices.types.light',capabilities:[{type:'devices.capabilities.on_off',state:{value:false}}]}]}:{status:'ok',devices:[{id:'lamp',capabilities:[{type:'devices.capabilities.on_off',state:{action_result:{status:fail?'ERROR':'DONE'}}}]}]}),{status:200});});
 await assert.rejects(home.command('door',true),/device_unavailable/);
 assert.equal(calls.filter(c=>c.body).length,0);
 assert.equal((await home.command('lamp',true)).accepted,true);
 fail=true;await assert.rejects(home.command('lamp',false),/device_rejected/);
 const denied=new Home(s,async()=>new Response('secret',{status:401}));assert.deepEqual(await denied.status(),{connection:'unavailable',provider:'yandex',devices:[]});
});
test('computer commands validate values before native execution',async()=>{
 const pc=new Computer();
 for(const [command,value] of [['volume',101],['volume',1.1],['mic','false'],['lock',false],['shell','anything']])await assert.rejects(pc.run(command,value));
 const stats=pc.metrics();assert.equal(stats.connection,'connected');assert.ok(stats.memory.total>0);assert.ok(stats.memory.used<=stats.memory.total);
});
test('calendar follows the corporate export redirect and parses its response',async()=>{
 const start=new Date(Date.now()+3600000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const end=new Date(Date.now()+7200000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const calls=[],source='https://calendar.yandex-team.ru/export/ics.xml?private_token=test-only';
 const calendar=new Calendar(store({calendar:{url:source}}),async(url,options)=>{
  calls.push(url);assert.equal(options.redirect,'manual');
  if(calls.length===1)return new Response(null,{status:301,headers:{Location:'https://api.calendar.yandex-team.ru/export/ics.xml?private_token=test-only'}});
  return new Response(ics([event(['UID:redirect-test','DTSTART:'+start,'DTEND:'+end,'SUMMARY:Fixture'])]));
 });
 const result=await calendar.status();assert.equal(result.connection,'connected');assert.equal(result.events.length,1);assert.equal(calls.length,2);
 assert.ok(!JSON.stringify(result).includes('private_token'));
});
test('calendar does not forward private links to other hosts, HTTP or credential URLs',async()=>{
 for(const target of ['https://evil.test/export','http://api.calendar.yandex-team.ru/export','https://api.calendar.yandex-team.ru.evil.test/export','https://user:password@api.calendar.yandex-team.ru/export','https://api.calendar.yandex-team.ru:8443/export']){
  let calls=0;
  await assert.rejects(fetchCalendar('https://calendar.yandex-team.ru/export?private_token=test-only',async()=>{calls++;return new Response(null,{status:302,headers:{Location:target}});}),/calendar_redirect_rejected/);
  assert.equal(calls,1);
 }
});
test('calendar bounds redirect loops and does not copy private query into Location',async()=>{
 const calls=[];
 await assert.rejects(fetchCalendar('https://calendar.yandex-team.ru/export?private_token=test-only',async url=>{calls.push(url);return new Response(null,{status:307,headers:{Location:'/export'}});}),/calendar_redirect_failed/);
 assert.equal(calls.length,4);assert.equal(calls[1],'https://calendar.yandex-team.ru/export');
});

test('all-day range stays November 19-20 regardless of server timezone',()=>{
 const text=ics([event(['UID:all-day-range','DTSTART;VALUE=DATE:20261119','DTEND;VALUE=DATE:20261121','SUMMARY:Fixture'])]);
 const script="import {parseCalendar} from './server/calendar.mjs'; console.log(JSON.stringify(await parseCalendar("+JSON.stringify(text)+",Date.parse('2026-11-18T07:00:00Z'))));";
 for(const zone of ['UTC','Europe/Moscow','Asia/Tokyo','America/New_York']){
  const events=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,TZ:zone},encoding:'utf8',windowsHide:true}));
  assert.equal(events[0].start,'2026-11-18T21:00:00.000Z',zone);assert.equal(events[0].end,'2026-11-20T21:00:00.000Z',zone);
  const label=calendarDateLabel(events[0]);assert.match(label,/19/);assert.match(label,/20/);assert.doesNotMatch(label,/18|21/);
 }
});
test('home rooms preserve household identity and sensor readings',()=>{
 const devices=mapYandex({status:'ok',households:[{id:'h1',name:'House A'},{id:'h2',name:'House B'}],rooms:[{id:'r1',name:'Room',household_id:'h1',devices:['a']},{id:'r2',name:'Room',household_id:'h2',devices:['b']}],devices:[{id:'a',name:'Lamp',type:'devices.types.light',room:'r1',capabilities:[{type:'devices.capabilities.on_off',state:{value:true}}]},{id:'b',name:'Leak sensor',type:'devices.types.sensor.water_leak',room:'r2',properties:[{type:'devices.properties.event',state:{instance:'water_leak',value:'dry'}}]},{id:'c',name:'Other'}]});
 const rooms=homeRooms(devices);assert.equal(rooms.length,3);assert.notEqual(rooms[0].id,rooms[1].id);assert.equal(rooms.at(-1).name,'Без комнаты');assert.equal(deviceState(devices[1]),'Сухо');assert.equal(devices[1].controllable,false);
});
