import test from 'node:test';
import assert from 'node:assert/strict';
import {Network,nodeURL} from '../server/network.mjs';
import {Features} from '../server/features.mjs';
import {createAppServer} from '../server/index.mjs';
const memory=(data={})=>({async get(){return data;},async update(fn){data=fn(structuredClone(data));return data;}});
const token='a'.repeat(64);
const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});
const providers=(codex='connected',claude='connected')=>({schemaVersion:1,providers:[{id:'codex',connection:codex,usage:{windows:{week:{usedPercent:33}}},sessions:[{id:'laptop-session'}]},{id:'claude',connection:claude,usage:{windows:{fiveHour:{usedPercent:90}}},sessions:[{id:'pc-session'}]}]});
const config=()=>({network:{name:'Хаб',nodes:[{id:'laptop',name:'Ноутбук',url:'http://192.168.0.2:4317',token},{id:'pc',name:'ПК',url:'http://192.168.0.3:4317',token}],bindings:{codex:'laptop',claude:'pc',music:'pc'}}});
test('node addresses reject Internet, credentials, loopback, paths and privileged ports',()=>{
 assert.equal(nodeURL('http://192.168.0.2:4317/'),'http://192.168.0.2:4317');
 for(const url of ['http://127.0.0.1:4317','http://8.8.8.8:4317','http://169.254.169.254:4317','https://192.168.0.2:4317','http://user:pass@192.168.0.2:4317','http://192.168.0.2:80','http://192.168.0.2:4317/api','http://192.168.0.2:4317?token=x'])assert.throws(()=>nodeURL(url));
});
test('both agent sources work together; either missing machine only disconnects its own provider',async()=>{
 const store=memory(config());let down=null;const paths=[];
 const network=new Network(store,{fetcher:async(url,options)=>{paths.push(url);assert.equal(options.redirect,'error');assert.equal(options.headers.Cookie,'deskpanel_device='+token);if(down&&url.includes(down))throw Error('offline');return reply(providers());}});
 let data=await network.agents(async()=>{throw Error('hub has no agents');});
 assert.deepEqual(data.providers.map(p=>p.connection),['connected','connected']);assert.equal(data.providers[0].source.name,'Ноутбук');assert.equal(data.providers[1].source.name,'ПК');
 assert.equal(data.providers[0].usage.windows.week.usedPercent,33);assert.equal(data.providers[1].usage.windows.fiveHour.usedPercent,90);assert.equal(data.providers[1].usage.windows.week,undefined);
 down='192.168.0.2';data=await network.agents(async()=>providers());assert.deepEqual(data.providers.map(p=>p.connection),['disconnected','connected']);assert.deepEqual(data.providers[0].sessions,[]);assert.equal(data.providers[0].usage,undefined);assert.equal(data.providers[1].usage.windows.fiveHour.usedPercent,90);
 down='192.168.0.3';data=await network.agents(async()=>providers());assert.deepEqual(data.providers.map(p=>p.connection),['connected','disconnected']);
 assert.ok(paths.every(p=>p.endsWith('/api/agents/local')));
});
test('pairing saves a separate credential, exposes no credential and removal never redirects its roles',async()=>{
 const store=memory(),seen=[];const network=new Network(store,{fetcher:async(url,options)=>{seen.push({url,options});if(url.endsWith('/health'))return reply({ok:true,app:'deskpanel',capabilities:['nodes-v1']});return reply({paired:true},200,{'Set-Cookie':'deskpanel_device='+token+'; HttpOnly; SameSite=Strict; Path=/'});}});
 await network.connect({name:'ПК',url:'http://192.168.0.3:4317',code:'123456',agent:'claude'});
 const saved=await store.get(),id=saved.network.nodes[0].id;
 assert.equal(saved.network.nodes[0].token,token);assert.equal(saved.network.bindings.claude,id);
 const list=await network.list({metrics:()=>({connection:'connected'})});assert.ok(!JSON.stringify(list).includes(token));assert.equal(seen[1].options.headers.Origin,'http://192.168.0.3:4317');
 await network.configure({command:'remove',id});assert.equal(await network.target('claude'),null);assert.equal((await network.target('codex')).id,'local');
});
test('failed pairing leaves existing connections untouched',async()=>{
 const store=memory(config()),before=structuredClone(await store.get());
 const network=new Network(store,{fetcher:async url=>reply(url.endsWith('health')?{ok:true,app:'deskpanel',capabilities:['nodes-v1']}:{error:'invalid_pair_code'},url.endsWith('health')?200:400)});
 await assert.rejects(network.connect({name:'Other',url:'http://192.168.0.4:4317',code:'123456',agent:'codex'}),/invalid_pair_code/);
 assert.deepEqual(await store.get(),before);
});
test('hub keeps calendar and home local, directs commands once and explicit local music bypasses music binding',async t=>{
 const store=memory(config()),calls=[];const computer={metrics:()=>({connection:'connected'}),run:async()=>({connection:'connected'})};
 const features=new Features({store,computer});features.calendar.status=async()=>({connection:'connected',events:[]});features.home.status=async()=>({connection:'connected',devices:[]});
 let down=false;
 const network=new Network(store,{fetcher:async(url,options)=>{calls.push({url,method:options.method});if(down)throw Error('offline');return reply(options.method==='POST'?{accepted:true}:{schemaVersion:1,connection:'connected'});}});
 let localMusic=0;const music={status:async()=>{localMusic++;return {schemaVersion:1,connection:'connected'};},close(){}};
 const server=createAppServer({features,network,music,agentReader:async()=>providers()});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,headers={Origin:base,'Content-Type':'application/json','X-DeskPanel':'1'};
 const command={method:'POST',headers,body:JSON.stringify({command:'toggle'})};
 assert.equal((await fetch(base+'/api/music',command)).status,200);assert.equal(calls.at(-1).url,'http://192.168.0.3:4317/api/music/local');
 assert.equal((await fetch(base+'/api/nodes/local/music')).status,200);assert.equal(localMusic,1);
 down=true;assert.equal((await fetch(base+'/api/nodes/pc/remote',{...command,body:JSON.stringify({command:'lock',value:true})})).status,400);
 assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/remote')).length,1);
 for(const resource of ['calendar','home'])assert.equal((await (await fetch(base+'/api/'+resource)).json()).connection,'connected');
 assert.equal((await fetch(base+'/api/nodes/pc/remote',{...command,headers:{...headers,Origin:'https://evil.test'}})).status,403);
 assert.equal((await fetch(base+'/api/agents/local')).status,200);
});
test('unpaired callers cannot list, modify or use nodes, including local aliases',async()=>{
 const store=memory(config()),network=new Network(store);let calls=0;
 const req={method:'GET',headers:{host:'127.0.0.1:4317'},socket:{remoteAddress:'192.168.0.9'}};
 const features={access:{authorized:async()=>false},computer:{metrics(){calls++;}}};
 for(const path of ['/api/nodes','/api/nodes/local/computer','/api/nodes/pc/remote']){let status;assert.equal(await network.handle(path,req,s=>status=s,features),true);assert.equal(status,403);}
 assert.equal(calls,0);
});
test('the hub forwards the TV screen to the computer that runs the bridge',async t=>{
 const data={...config()};data.network.bindings.tv='pc';
 const store=memory(data),calls=[];let down=false,status=200;
 const features=new Features({store,computer:{metrics:()=>({}),run:async()=>({})}});
 features.tv.status=async()=>{throw Error('the hub must not use its own bridge');};
 const network=new Network(store,{fetcher:async(url,options)=>{calls.push({url,method:options.method,body:options.body,cookie:options.headers.Cookie});if(down)throw Error('offline');return reply(options.method==='POST'?{accepted:true}:{connection:'connected',power:'on',apps:[]},status);}});
 const server=createAppServer({features,network,music:{close(){}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,headers={Origin:base,'Content-Type':'application/json','X-DeskPanel':'1'};
 assert.equal((await (await fetch(base+'/api/tv')).json()).connection,'connected');
 assert.equal(calls.at(-1).url,'http://192.168.0.3:4317/api/tv/local');assert.equal(calls.at(-1).cookie,'deskpanel_device='+token);
 assert.equal((await fetch(base+'/api/tv',{method:'POST',headers,body:JSON.stringify({command:'key',key:'ok'})})).status,200);
 assert.deepEqual(JSON.parse(calls.at(-1).body),{command:'key',key:'ok'});
 assert.equal((await fetch(base+'/api/tv',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:'{}'})).status,403);
 status=403;assert.equal((await (await fetch(base+'/api/tv')).json()).connection,'node_pair_required');
 down=true;assert.equal((await (await fetch(base+'/api/tv')).json()).connection,'node_offline');
 assert.equal((await fetch(base+'/api/tv',{method:'POST',headers,body:JSON.stringify({command:'key',key:'ok'})})).status,409);
 await store.update(s=>({...s,network:{...s.network,bindings:{...s.network.bindings,tv:null}}}));
 assert.equal((await (await fetch(base+'/api/tv')).json()).connection,'not_configured');
 await store.update(s=>({...s,network:{...s.network,bindings:{...s.network.bindings,tv:'local'}}}));
 features.tv.status=async()=>({connection:'bridge_offline',apps:[]});
 assert.equal((await (await fetch(base+'/api/tv')).json()).connection,'bridge_offline');
 assert.equal((await (await fetch(base+'/api/tv/local')).json()).connection,'bridge_offline');
});
