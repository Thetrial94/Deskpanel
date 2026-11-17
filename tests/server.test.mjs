import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAppServer} from '../server/index.mjs';
test('server exposes only public assets and read-only, unconfigured adapters',async t=>{
 const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/')).status,200);
 assert.match(await (await fetch(base+'/src/app.js')).text(),/RotationClock/);
 const data=await (await fetch(base+'/api/agents')).json();
 assert.equal(data.schemaVersion,1);assert.deepEqual(data.providers.map(p=>p.id),['codex','claude']);
 for(const p of data.providers){assert.equal(p.connection,'not_configured');assert.deepEqual(p.sessions,[]);assert.equal(p.updatedAt,null);}
 for(const path of ['/server/index.mjs','/package.json','/.git/config','/README.md','/api/unknown']) assert.equal((await fetch(base+path)).status,404,path);
 assert.equal((await fetch(base+'/api/agents',{method:'POST'})).status,405);
 const head=await fetch(base+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 const malformed=await new Promise(resolve=>{http.get(base+'/%xx',res=>{res.resume();resolve(res.statusCode);});});
 assert.equal(malformed,400);
});
