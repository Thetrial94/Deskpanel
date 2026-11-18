import test from 'node:test';
import assert from 'node:assert/strict';
import {ComputerSources} from '../src/data/computers.js';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
test('switching computer keeps services and music independent and ignores the old computer response',async t=>{
 t.mock.method(globalThis,'setInterval',()=>1);t.mock.method(globalThis,'clearInterval',()=>{});
 const oldDocument=globalThis.document;globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
 let oldReply;const requests=[];
 t.mock.method(globalThis,'fetch',async(path,options={})=>{
  requests.push({path,method:options.method||'GET'});
  if(path==='/api/nodes')return {ok:true,json:async()=>({connection:'connected',nodes:[{id:'local'},{id:'pc'}],bindings:{music:'local'}})};
  if(path==='/api/nodes/local/remote'&&(!options.method||options.method==='GET'))return new Promise(resolve=>oldReply=()=>resolve({ok:true,json:async()=>({connection:'connected',name:'old'})}));
  return {ok:true,json:async()=>({connection:'connected',name:'PC',accepted:true})};
 });
 const computers=new ComputerSources(memory()),remote=computers.source('remote');const received=[];
 const stop=remote.subscribe(s=>received.push(s.name));t.after(()=>{stop();globalThis.document=oldDocument;});await new Promise(setImmediate);
 computers.select('pc');await new Promise(setImmediate);oldReply();await new Promise(setImmediate);
 assert.equal(remote.snapshot.name,'PC');assert.ok(!received.includes('old'));assert.equal(computers.target('music'),'local');
 await remote.command({command:'mute',value:true});assert.equal(requests.find(r=>r.method==='POST').path,'/api/nodes/pc/remote');
 assert.ok(requests.every(r=>!['/api/calendar','/api/home'].includes(r.path)));
});
