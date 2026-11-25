import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server/index.mjs';
import {Network} from '../server/network.mjs';
const unpaired={access:{authorized:async()=>false},store:{get:async()=>({}),update:async()=>{}},handle:async()=>false,computer:{metrics:()=>({})}};
test('unpaired LAN callers cannot read or drive music, locally aliased or not',async t=>{
 let used=0;const music=new Proxy({},{get:(_,name)=>name==='close'?()=>{}:()=>{used++;return {};}});
 const server=createAppServer({features:unpaired,music,network:new Network(unpaired.store)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port,headers={Origin:base,'Content-Type':'application/json','X-DeskPanel':'1'};
 assert.equal((await fetch(base+'/api/music')).status,403);
 assert.equal((await fetch(base+'/api/music/local')).status,403);
 assert.equal((await fetch(base+'/api/music',{method:'POST',headers,body:'{"command":"launch"}'})).status,403);
 assert.equal(used,0);
});
test('responses carry a restrictive Content-Security-Policy',async t=>{
 const server=createAppServer({features:unpaired,music:{close(){}},network:new Network(unpaired.store)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/');
 const csp=response.headers.get('content-security-policy');
 assert.match(csp,/default-src 'self'/);assert.match(csp,/script-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);
 assert.doesNotMatch(csp,/script-src[^;]*unsafe/);
});
