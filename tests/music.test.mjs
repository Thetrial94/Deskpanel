import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server/index.mjs';
import {MusicBridge,normalizePlayerState} from '../server/music.mjs';
async function setup(t){
 const commands=[],values=[];
 const music={
  status:async()=>({schemaVersion:1,connection:'connected',playback:'unknown',track:null}),
  command:async (command,value)=>{commands.push(command);values.push(value);return {accepted:true,error:null};},
  close:()=>{}
 };
 const server=createAppServer({music,network:{handle:async()=>false,target:async()=>({id:'local'})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={Origin:base,'Content-Type':'application/json','X-DeskPanel':'1','Sec-Fetch-Site':'same-origin'};
 return {base,headers,commands,values};
}
test('music status is truthful and supported commands are delivered once',async t=>{
 const {base,headers,commands}=await setup(t);
 const state=await (await fetch(base+'/api/music')).json();
 assert.equal(state.playback,'unknown');assert.equal(state.track,null);
 for(const command of ['launch','toggle','next','previous']){
  const response=await fetch(base+'/api/music',{method:'POST',headers,body:JSON.stringify({command})});
  assert.equal(response.status,200);assert.equal((await response.json()).accepted,true);
 }
 assert.deepEqual(commands,['launch','toggle','next','previous']);
});
test('other sites, missing origin and forged hosts cannot control music',async t=>{
 const {base,headers,commands}=await setup(t);
 for(const override of [
  {Origin:'https://unrelated.example'},
  {Origin:'null'},
  {'X-DeskPanel':''},
  {'Content-Type':'text/plain'},
  {'Sec-Fetch-Site':'cross-site'},
  {Host:'unrelated.example',Origin:'http://unrelated.example'}
 ]){
  const response=await fetch(base+'/api/music',{method:'POST',headers:{...headers,...override},body:'{"command":"toggle"}'});
  assert.equal(response.status,403);
 }
 const missing={...headers};delete missing.Origin;
 assert.equal((await fetch(base+'/api/music',{method:'POST',headers:missing,body:'{"command":"toggle"}'})).status,403);
 assert.equal((await fetch(base+'/api/music',{method:'OPTIONS'})).status,405);
 assert.deepEqual(commands,[]);
});
test('music rejects malformed, oversized and arbitrary commands without executing',async t=>{
 const {base,headers,commands}=await setup(t);
 for(const body of ['{bad','null','{}','{"command":"shell"}','{"command":"launch","path":"calc.exe"}']){
  assert.equal((await fetch(base+'/api/music',{method:'POST',headers,body})).status,400);
 }
 assert.equal((await fetch(base+'/api/music',{method:'POST',headers,body:'x'.repeat(1025)})).status,413);
 assert.deepEqual(commands,[]);
});
test('a rejected native command does not become a successful action',async t=>{
 const music={status:async()=>({connection:'stopped'}),command:async()=>({accepted:false,error:'stopped'}),close:()=>{}};
 const server=createAppServer({music,network:{handle:async()=>false,target:async()=>({id:'local'})}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/api/music',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-DeskPanel':'1'},body:'{"command":"toggle"}'});
 assert.equal(response.status,409);assert.equal((await response.json()).accepted,false);
});
test('non-Windows bridge reports unsupported without launching any process',async()=>{
 const bridge=new MusicBridge({platform:'linux'});
 assert.equal((await bridge.status()).connection,'unsupported');
 assert.equal((await bridge.command('toggle')).accepted,false);
 await assert.rejects(bridge.command('arbitrary'),/invalid_command/);
 bridge.close();
});

test('volume accepts only whole percentages and rejects extra fields',async t=>{
 const {base,headers,commands,values}=await setup(t);
 for(const value of [-1,101,1.5,"50",null]){
  assert.equal((await fetch(base+'/api/music',{method:'POST',headers,body:JSON.stringify({command:'volume',value})})).status,400);
 }
 for(const value of [0,50,100]){
  assert.equal((await fetch(base+'/api/music',{method:'POST',headers,body:JSON.stringify({command:'volume',value})})).status,200);
 }
 assert.deepEqual(commands,['volume','volume','volume']);assert.deepEqual(values,[0,50,100]);
});
test('player snapshots must be fresh and belong to the current process',()=>{
 const good={schemaVersion:1,pid:123,updatedAt:10000,playback:'playing',volume:60,track:{title:'Track',artist:'Artist'}};
 assert.deepEqual(normalizePlayerState(good,123,11000),{enhanced:true,playback:'playing',volume:60,track:{title:'Track',artist:'Artist'},updatedAt:new Date(10000).toISOString()});
 assert.deepEqual(normalizePlayerState(good,456,11000),{});
 assert.deepEqual(normalizePlayerState(good,123,15000),{});
 assert.deepEqual(normalizePlayerState({...good,updatedAt:13000},123,11000),{});
 for(const invalid of [{volume:-1},{volume:101},{volume:'60'},{playback:'guessed'},{schemaVersion:2}]){
  assert.deepEqual(normalizePlayerState({...good,...invalid},123,11000),{});
 }
 assert.equal(normalizePlayerState({...good,playback:'paused'},123,11000).playback,'paused');
 assert.equal(normalizePlayerState({...good,track:null,playback:'idle'},123,11000).track,null);
});
