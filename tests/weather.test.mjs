import test from 'node:test';
import assert from 'node:assert/strict';
import {Weather,mapMET} from '../server/weather.mjs';
import {createAppServer} from '../server/index.mjs';
const now=Date.parse('2026-11-18T12:00:00Z');
const met=()=>({properties:{meta:{updated_at:new Date(now).toISOString()},timeseries:[0,6,24].map((h,i)=>({time:new Date(now+h*3600000).toISOString(),data:{instant:{details:{air_temperature:[-2,0,3][i],wind_speed:5,relative_humidity:80}},next_1_hours:{summary:{symbol_code:'lightsnow_day'}}}}))}});
const open=()=>({current:{temperature_2m:2,weather_code:3,wind_speed_10m:9,relative_humidity_2m:80,apparent_temperature:-1},daily:{time:['2026-11-18'],temperature_2m_max:[3],temperature_2m_min:[-1],weather_code:[3]}});
test('MET forecast maps wind units and Moscow days without inventing apparent temperature',()=>{
 const mapped=mapMET(met(),now);assert.equal(mapped.current.wind_speed_10m,18);assert.equal(mapped.current.weather_code,71);assert.equal(mapped.current.apparent_temperature,null);assert.deepEqual(mapped.daily.time,['2026-11-18','2026-11-19']);assert.equal(mapped.daily.temperature_2m_max[0],0);assert.throws(()=>mapMET(met(),now+4*86400000),/old_weather/);
});
test('server weather coalesces requests, rounds coordinates and respects cache expiry',async()=>{
 let calls=0;const w=new Weather(async(url,options)=>{calls++;assert.match(url,/lat=55.7558&lon=37.6173/);assert.match(options.headers['User-Agent'],/DeskPanel/);return Response.json(met(),{headers:{Expires:new Date(now+3600000).toUTCString(),'Last-Modified':new Date(now).toUTCString()}});});
 const [a,b]=await Promise.all([w.get('55.75580001','37.61730001',now),w.get(55.7558,37.6173,now)]);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal((await w.get(55.7558,37.6173,now+600000)).provider,'met');assert.equal(calls,1);
});
test('fallback uses Open-Meteo, then cached stale forecast with backoff and bounded lifetime',async()=>{
 let mode='fallback',calls=0;const w=new Weather(async url=>{calls++;if(mode==='offline'||url.includes('met.no'))throw Error('offline');return Response.json(open());});
 const first=await w.get(55,37,now);assert.equal(first.provider,'open-meteo');assert.equal(calls,2);mode='offline';
 const stale=await w.get(55,37,now+700000);assert.equal(stale.stale,true);assert.equal(stale.updatedAt,now);const total=calls;await w.get(55,37,now+710000);assert.equal(calls,total);
 await assert.rejects(w.get(55,37,now+7*3600000),/weather_unavailable/);
 for(const coords of [[null,37],['',37],['bad',37],[91,37],[55,181]])await assert.rejects(w.get(...coords),/invalid_coordinates/);
});
test('conditional MET response reuses prior forecast and advances retrieval time',async()=>{
 let calls=0;const w=new Weather(async(url,options)=>{if(calls++){assert.ok(options.headers['If-Modified-Since']);return new Response(null,{status:304});}return Response.json(met(),{headers:{'Last-Modified':new Date(now).toUTCString()}});});
 await w.get(55,37,now);const data=await w.get(55,37,now+700000);assert.equal(data.provider,'met');assert.equal(data.updatedAt,now+700000);assert.equal(calls,2);
});
test('weather endpoint denies writes and foreign origins and accepts no arbitrary URLs',async t=>{
 let calls=0;const server=createAppServer({weather:{get:async(a,b)=>{calls++;assert.equal(a,'55');assert.equal(b,'37');return open();},search:async()=>[]}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/api/weather?latitude=55&longitude=37',{headers:{Origin:'https://example.com'}})).status,403);assert.equal(calls,0);
 assert.equal((await fetch(base+'/api/weather',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/weather?latitude=55&longitude=37&url=https://example.com')).status,200);assert.equal(calls,1);
});
