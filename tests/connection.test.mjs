import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerConnection} from '../src/core/connection.js';
const ok=()=>({ok:true,json:async()=>({ok:true,app:'deskpanel'})});
function harness(fetcher,onRecover=()=>{}){
 const jobs=new Map();let id=0;const monitor=new ServerConnection({fetcher,onRecover,now:()=>1234,schedule:(fn,ms)=>{jobs.set(++id,{fn,ms});return id;},cancel:id=>jobs.delete(id)});
 return {monitor,jobs};
}
test('health loss backs off, recovers once and never sends a command',async()=>{
 let available=true,recoveries=0;const calls=[];
 const {monitor,jobs}=harness(async(path,options)=>{calls.push({path,options});if(!available)throw Error();return ok();},()=>recoveries++);
 await monitor.start();assert.equal(monitor.state.status,'connected');assert.equal(recoveries,0);
 available=false;
 for(const delay of [2000,4000,8000,15000,15000]){await monitor.check();assert.equal(monitor.state.status,'offline');assert.equal([...jobs.values()][0].ms,delay);}
 available=true;await monitor.check();assert.equal(monitor.state.status,'connected');assert.equal(monitor.state.lastSuccess,1234);assert.equal(monitor.state.failures,0);assert.equal(recoveries,1);
 await monitor.check();assert.equal(recoveries,1);assert.ok(calls.every(c=>c.path==='/api/health'&&!c.options.method&&!c.options.body));monitor.stop();assert.equal(jobs.size,0);
});
test('offline aborts an in-flight probe; its late success cannot hide loss of Wi-Fi',async()=>{
 let finish,signal;const {monitor,jobs}=harness(async(_path,opts)=>{signal=opts.signal;await new Promise(resolve=>finish=resolve);return ok();});
 const pending=monitor.start();await monitor.check();monitor.setOnline(false);assert.ok(signal.aborted);finish();await pending;
 assert.equal(monitor.state.status,'offline');assert.equal(monitor.state.reason,'network');assert.equal(jobs.size,0);
 let recovered=0;monitor.onRecover=()=>recovered++;monitor.fetcher=async()=>ok();await monitor.setOnline(true);assert.equal(recovered,1);assert.equal(monitor.state.status,'connected');monitor.stop();
});
test('hanging health request times out and schedules a retry; wrong application is rejected',async()=>{
 const {monitor,jobs}=harness((_path,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')))));
 const pending=monitor.start();[...jobs.values()].find(job=>job.ms===4000).fn();await pending;assert.equal(monitor.state.status,'offline');
 monitor.fetcher=async()=>({ok:true,json:async()=>({ok:true,app:'another-app'})});await monitor.check();assert.equal(monitor.state.status,'offline');monitor.stop();
});

test('browser defaults call fetch and timers with their required global receiver',async t=>{
 t.mock.method(globalThis,'fetch',async function(){assert.equal(this,globalThis);return {ok:true,json:async()=>({ok:true,app:'deskpanel'})};});
 t.mock.method(globalThis,'setTimeout',function(){assert.equal(this,globalThis);return 1;});
 t.mock.method(globalThis,'clearTimeout',function(){assert.equal(this,globalThis);});
 const connection=new ServerConnection();await connection.start();assert.equal(connection.state.status,'connected');connection.stop();
});
