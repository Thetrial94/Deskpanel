import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep,basename} from 'node:path';
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
