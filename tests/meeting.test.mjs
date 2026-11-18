import test from 'node:test';
import assert from 'node:assert/strict';
import {findMeetingURL,safeMeetingURL} from '../server/meeting-link.mjs';
import {openMeeting} from '../server/open-meeting.mjs';
import {Calendar,parseCalendar} from '../server/calendar.mjs';
import {Features} from '../server/features.mjs';
import {createAppServer} from '../server/index.mjs';
test('meeting links accept known HTTPS providers and reject arbitrary launch targets',()=>{
 assert.equal(findMeetingURL({description:'Ссылка: <a href="https://telemost.yandex.ru/j/123">Встреча</a>'}),'https://telemost.yandex.ru/j/123');
 assert.equal(findMeetingURL({url:'https://example.com',location:'https://company.zoom.us/j/123?pwd=test'}),'https://company.zoom.us/j/123?pwd=test');
 for(const value of ['file:///C:/test','javascript:alert(1)','https://telemost.yandex.ru.evil.test/j/123','https://user:pass@zoom.us/j/123','http://zoom.us/j/123','https://zoom.us:444/j/123','https://zoom.us/'])assert.equal(safeMeetingURL(value),null);
});
test('native opener passes a single validated URL argument without a command shell',async()=>{
 let called=false;const result=await openMeeting('https://meet.google.com/abc-defg-hij',{platform:'win32',execute:(binary,args,options,cb)=>{called=true;assert.equal(args.at(-1),'https://meet.google.com/abc-defg-hij');assert.equal(options.windowsHide,true);assert.ok(args.includes('-File'));cb(null);}});assert.equal(called,true);assert.equal(result.accepted,true);
 await assert.rejects(openMeeting('https://example.com/test'),/invalid_meeting/);assert.equal((await openMeeting('https://zoom.us/j/123',{platform:'linux'})).accepted,false);
});
test('calendar exposes only canOpen, executes only known event IDs and protects the action',async t=>{
 const start=new Date(Date.now()+60000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),end=new Date(Date.now()+3600000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const text=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tests//EN','BEGIN:VEVENT','UID:meeting','DTSTART:'+start,'DTEND:'+end,'SUMMARY:Meeting','URL:https://telemost.yandex.ru/j/123','END:VEVENT','END:VCALENDAR'].join('\r\n');
 const parsed=await parseCalendar(text);assert.equal(parsed[0].joinURL,'https://telemost.yandex.ru/j/123');
 const store={get:async()=>({calendar:{url:'https://calendar.yandex.ru/test'}})},calendar=new Calendar(store,async()=>new Response(text));const state=await calendar.status();assert.equal(state.events[0].canOpen,true);assert.ok(!JSON.stringify(state).includes('telemost.yandex.ru'));
 let calls=0;await assert.rejects(calendar.open('bad',async()=>{calls++;}),/invalid_meeting/);assert.equal(calls,0);
 const features=new Features({store,meetingOpener:async url=>{calls++;assert.equal(url,'https://telemost.yandex.ru/j/123');return {accepted:true};}});features.calendar=calendar;
 const server=createAppServer({features});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port,headers={Origin:base,'X-DeskPanel':'1','Content-Type':'application/json'},body=JSON.stringify({command:'open',id:state.events[0].id});
 assert.equal((await fetch(base+'/api/calendar',{method:'POST',headers:{...headers,Origin:'https://example.com'},body})).status,403);
 assert.equal((await fetch(base+'/api/calendar',{method:'POST',headers,body:JSON.stringify({command:'open',id:'bad',url:'https://zoom.us/j/123'})})).status,400);
 features.access.authorized=async()=>false;assert.equal((await fetch(base+'/api/calendar',{method:'POST',headers,body})).status,403);features.access.authorized=async()=>true;
 assert.equal((await fetch(base+'/api/calendar',{method:'POST',headers,body})).status,200);assert.equal(calls,1);
 assert.equal((await fetch(base+'/api/calendar',{method:'POST',headers,body})).status,400);assert.equal(calls,1);
});
