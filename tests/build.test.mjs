import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Build} from '../server/build.mjs';
import {BuildWatcher} from '../src/core/build.js';
import {createAppServer} from '../server/index.mjs';
test('build id changes when a client file changes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'deskpanel-build-'));
 try{
  await mkdir(join(dir,'src'));await writeFile(join(dir,'index.html'),'a');await writeFile(join(dir,'src','app.js'),'1');
  const build=new Build(dir,0),first=await build.id();
  assert.match(first,/^[0-9a-f]{16}$/);assert.equal(await build.id(),first);
  await writeFile(join(dir,'src','app.js'),'22');
  assert.notEqual(await build.id(),first);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('the page reloads only after the new build is seen twice and it is safe',async()=>{
 let build='a',reloads=0,safe=true;
 const w=new BuildWatcher({fetcher:async()=>new Response(JSON.stringify({build})),reload:()=>reloads++,canReload:()=>safe});
 await w.check();await w.check();assert.equal(reloads,0);
 build='b';await w.check();assert.equal(reloads,0);
 safe=false;await w.check();assert.equal(reloads,0);
 safe=true;await w.check();assert.equal(reloads,1);
 const down=new BuildWatcher({fetcher:async()=>{throw Error('offline');},reload:()=>reloads++});
 await down.check();await down.check();assert.equal(reloads,1);
});
test('build endpoint is public and read-only',async()=>{
 const server=createAppServer({build:{id:async()=>'0123456789abcdef'}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  assert.deepEqual(await (await fetch(base+'/api/build')).json(),{build:'0123456789abcdef'});
  assert.equal((await fetch(base+'/api/build',{method:'POST'})).status,405);
 }finally{server.close();}
});
