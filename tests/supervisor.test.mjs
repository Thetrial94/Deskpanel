import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {EventEmitter,once} from 'node:events';
import {Supervisor,acquireLock,probeServer} from '../scripts/supervise.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
async function runtime(){return mkdtemp(resolve(tmpdir(),'deskpanel-supervisor-'));}
async function cleanup(s,path){await s.stop();if(!resolve(path).startsWith(resolve(tmpdir())+sep)||!basename(path).startsWith('deskpanel-supervisor-'))throw Error('Unsafe test cleanup');await rm(path,{recursive:true,force:true});}
async function until(fn){for(let i=0;i<160;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Timed out waiting for supervised server');}
test('supervisor leaves an existing DeskPanel and an unrelated service alone',async t=>{
 let health='deskpanel',launches=0;const dir=await runtime(),s=new Supervisor({root,runtime:dir,probe:async()=>health,launch:()=>{launches++;throw Error();},pollMs:60000});
 t.after(()=>cleanup(s,dir));await s.start();assert.equal(s.state,'external');assert.equal(launches,0);
 health='other';await s.tick();assert.equal(s.state,'port_busy');assert.equal(launches,0);
});
test('supervisor handles spawn errors and its lock rejects duplicate supervisors',async t=>{
 const dir=await runtime(),release=await acquireLock(dir);await assert.rejects(acquireLock(dir),/already running/);await release();
 const second=await acquireLock(dir);await second();
 const s=new Supervisor({root,runtime:dir,probe:async()=> 'unavailable',launch:()=>{const child=new EventEmitter();child.kill=()=>{};process.nextTick(()=>child.emit('error',Error('spawn failed')));return child;},pollMs:60000});
 t.after(()=>cleanup(s,dir));await s.start();assert.equal(s.child,null);
});
test('real child server recovers after process loss and stop prevents another restart',async t=>{
 const dir=await runtime(),socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const s=new Supervisor({root,runtime:dir,port,pollMs:100,retryMs:50});t.after(()=>cleanup(s,dir));
 await s.start();await until(async()=>await probeServer(port)==='deskpanel');const first=s.child;assert.ok(first?.pid);
 const exited=once(first,'exit');first.kill();await exited;
 await until(async()=>s.child&&s.child.pid!==first.pid&&await probeServer(port)==='deskpanel');assert.notEqual(s.child.pid,first.pid);
 const status=JSON.parse(await readFile(resolve(dir,'service-status.json'),'utf8'));assert.equal(status.serverPid,s.child.pid);
 await s.stop();assert.equal(await probeServer(port),'unavailable');assert.equal(s.child,null);
});
test('the couch-tv bridge is supervised only when tv-bridge.json points at a real checkout',async t=>{
 const {bridgeOptions,probeBridge}=await import('../scripts/supervise.mjs');
 const {mkdir,writeFile}=await import('node:fs/promises');
 const dir=await runtime();t.after(()=>rm(dir,{recursive:true,force:true}));
 assert.equal(await bridgeOptions(dir,root),null);
 await writeFile(resolve(dir,'tv-bridge.json'),'{bad');await assert.rejects(bridgeOptions(dir,root),/not valid JSON/);
 const checkout=resolve(dir,'couch-tv');await writeFile(resolve(dir,'tv-bridge.json'),JSON.stringify({dir:checkout}));
 await assert.rejects(bridgeOptions(dir,root));
 const python=resolve(checkout,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
 await mkdir(dirname(python),{recursive:true});await mkdir(resolve(checkout,'bridge'),{recursive:true});await writeFile(python,'');await writeFile(resolve(checkout,'bridge/server.py'),'');
 const options=await bridgeOptions(dir,root),[file,args,launch]=options.command();
 assert.equal(file,python);assert.deepEqual(args,['-u',resolve(checkout,'bridge/server.py')]);
 assert.equal(launch.env.BIND_HOST,'127.0.0.1');assert.equal(launch.env.PORT,'5400');assert.equal(options.expected,'couch-tv');
 const launched=[];const s=new Supervisor({...options,probe:async()=>'unavailable',launch:(...a)=>{launched.push(a);const c=new EventEmitter();c.pid=4242;c.kill=()=>c.emit('exit');return c;},pollMs:60000});
 await s.start();await s.stop();
 assert.equal(launched[0][0],python);assert.equal(await readFile(resolve(dir,'tv-bridge.pid'),'utf8'),'4242');
 assert.equal(JSON.parse(await readFile(resolve(dir,'tv-bridge-status.json'),'utf8')).state,'stopped');
 const server=createServer((q,r)=>r.end(JSON.stringify({ok:true,tv_connected:false,adb:false,version:'1'})));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 assert.equal(await probeBridge(server.address().port),'couch-tv');
});
