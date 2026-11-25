import test from 'node:test';
import assert from 'node:assert/strict';
import {TV,tvBridgeURL,mapNow,DEFAULT_TV_BRIDGE} from '../server/tv.mjs';
import {validateConfig} from '../server/connections.mjs';
import {tvSummary,tvProgress} from '../src/core/tv.js';
import {normalizeSettings,SCREEN_IDS} from '../src/core/settings.js';
const store=(data={})=>({async get(){return data;},async update(fn){data=fn(structuredClone(data));return data;}});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const bridge=(routes,calls=[])=>async(url,options)=>{const path=new URL(url).pathname;calls.push({url,path,method:options.method,body:options.body&&JSON.parse(options.body)});const r=routes[path];if(!r)throw Error('ECONNREFUSED');return typeof r==='function'?r(options):reply(r);};
const tvs={ok:true,default:'living-room',tvs:[{id:'living-room',name:'Living room',paired:true,connected:true}]};
const now={ok:true,tv_connected:true,power:'on',app:{id:'youtube',name:'YouTube',package:'com.google.android.youtube.tv'},volume:{level:12,max:100,muted:false,known:true},playing:{title:'Bluey',state:'playing',season:3,episode:4,position_ms:60000,duration_ms:420000,updated:'2026-11-25T10:00:00.000Z',poster:'https://x/y.jpg'}};
const apps={ok:true,apps:[{id:'youtube',name:'YouTube',colour:'#FF0000',installed:true},{id:'netflix',name:'Netflix',colour:'#E50914',installed:false},{id:'home',name:'Home'}]};
const catalogue={ok:true,apps:[{id:'netflix',installed:null},{id:'stan',installed:null},{id:'youtube',installed:null},{id:'settings',installed:true},{id:'home',installed:true}]};
test('bridge address must be a plain local HTTP origin',()=>{
 assert.equal(tvBridgeURL('http://127.0.0.1:5400'),'http://127.0.0.1:5400');
 assert.equal(tvBridgeURL('http://192.168.0.60:5400/'),'http://192.168.0.60:5400');
 for(const bad of ['https://example.com:5400','http://8.8.8.8:5400','http://user:pw@127.0.0.1:5400','http://127.0.0.1:5400/api','http://127.0.0.1:5400/?x=1','file:///c:/'])assert.throws(()=>tvBridgeURL(bad),/invalid_tv_url/);
 assert.deepEqual(validateConfig({kind:'tv',base:'http://192.168.0.60:5400'}),{kind:'tv',value:{base:'http://192.168.0.60:5400'}});
 assert.deepEqual(validateConfig({kind:'tv',clear:true}),{kind:'tv',value:null});
});
test('status maps the bridge answer and keeps only installed app tiles',async()=>{
 const calls=[],tv=new TV(store(),bridge({'/api/tvs':tvs,'/api/now':now,'/api/apps':apps},calls));
 const s=await tv.status();
 assert.equal(s.connection,'connected');assert.equal(s.power,'on');assert.equal(s.app.name,'YouTube');
 assert.equal(s.playing.title,'Bluey');assert.equal(s.playing.episode,4);assert.equal(s.volume.level,12);
 assert.ok(!JSON.stringify(s).includes('poster'));
 assert.deepEqual(s.apps.map(a=>a.id),['youtube']);
 assert.ok(calls.every(c=>c.url.startsWith(DEFAULT_TV_BRIDGE)));
});
test('status separates a stopped bridge, an unpaired TV and a TV off the network',async()=>{
 assert.equal((await new TV(store(),bridge({})).status()).connection,'bridge_offline');
 assert.equal((await new TV(store(),bridge({'/api/tvs':{...tvs,tvs:[{...tvs.tvs[0],paired:false}]},'/api/now':now})).status()).connection,'not_paired');
 assert.equal((await new TV(store(),bridge({'/api/tvs':tvs,'/api/now':()=>reply({ok:false,error:'TV not reachable'},503)})).status()).connection,'tv_offline');
 const calls=[];await new TV(store({tv:{base:'http://192.168.0.60:5400'}}),bridge({},calls)).status();
 assert.ok(calls[0].url.startsWith('http://192.168.0.60:5400/api/'));
});
test('without ADB only common apps from the catalogue are offered',async()=>{
 assert.deepEqual((await new TV(store(),bridge({'/api/apps':catalogue})).appList()).map(a=>a.id),['netflix','youtube','settings']);
});
test('commands are limited to a fixed list and known app tiles',async()=>{
 const calls=[],tv=new TV(store(),bridge({'/api/apps':apps,'/api/key':{ok:true},'/api/power':{ok:true,power:'on'},'/api/volume':{ok:true},'/api/launch':{ok:true}},calls));
 assert.deepEqual(await tv.command({command:'key',key:'ok'}),{accepted:true});
 assert.deepEqual(await tv.command({command:'power',state:'on'}),{accepted:true});
 assert.deepEqual(await tv.command({command:'volume',action:'mute'}),{accepted:true});
 assert.deepEqual(await tv.command({command:'launch',app:'youtube'}),{accepted:true});
 for(const bad of [{command:'key',key:'power'},{command:'key',key:'ok',hold:true},{command:'launch',app:'netflix'},{command:'launch',app:'https://evil.test'},{command:'volume',level:100},{command:'text',text:'x'},{command:'power',state:'reboot'}])await assert.rejects(tv.command(bad),/invalid_tv_command/);
 assert.deepEqual(calls.filter(c=>c.method==='POST').map(c=>[c.path,c.body]),[['/api/key',{key:'ok'}],['/api/power',{state:'on'}],['/api/volume',{action:'mute'}],['/api/launch',{app:'youtube'}]]);
 const failing=new TV(store(),bridge({'/api/key':()=>reply({ok:false,error:'not paired yet'},503)}));
 assert.deepEqual(await failing.command({command:'key',key:'ok'}),{accepted:false,error:'tv_unavailable'});
});
test('overview summary and progress describe what is on',()=>{
 const s={connection:'connected',...mapNow(now,tvs)};
 assert.deepEqual(tvSummary(s),{title:'Bluey',detail:'Идёт · S3:E4 · YouTube',status:'working'});
 assert.equal(tvSummary({...s,power:'off',playing:null}).title,'Выключен');
 assert.equal(tvSummary({connection:'bridge_offline'}).title,'Мост couch-tv не запущен');
 assert.equal(tvProgress(s.playing,Date.parse('2026-11-25T10:01:00.000Z')),120000/420000);
 assert.equal(tvProgress({positionMs:1}),null);
 assert.equal(mapNow({app:{id:null,name:'Tvhome',package:'com.gathin.tvhome'}},tvs).app.name,'Главный экран');
});
test('the TV screen is added once for existing settings and can be hidden',()=>{
 assert.ok(SCREEN_IDS.includes('tv'));
 assert.ok(normalizeSettings({version:6,enabledScreens:['overview','music']}).enabledScreens.includes('tv'));
 assert.deepEqual(normalizeSettings({version:7,enabledScreens:['overview','music']}).enabledScreens,['overview','music']);
});
