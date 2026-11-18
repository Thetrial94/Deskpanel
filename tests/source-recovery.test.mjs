import test from 'node:test';
import assert from 'node:assert/strict';
import {FeatureSource} from '../src/data/features.js';
import {AgentSource} from '../src/data/agents.js';
import {MusicSource} from '../src/data/music.js';
import {WeatherSource} from '../src/data/weather.js';
const cases=[
 ['calendar',()=>new FeatureSource('/api/calendar'),{connection:'connected',events:[]},s=>s.snapshot.connection==='connected'],
 ['agents',()=>new AgentSource(),{schemaVersion:1,providers:[{id:'codex',connection:'connected',sessions:[]}]},s=>s.snapshot.codex.connection==='connected'],
 ['music',()=>new MusicSource(),{schemaVersion:1,connection:'connected',playback:'paused',track:null},s=>s.snapshot.connection==='connected'],
 ['weather',()=>{const s=new WeatherSource();s.state.city={latitude:55.75,longitude:37.61};return s;},{current:{temperature_2m:2},daily:{time:[]}},s=>s.state.data?.current.temperature_2m===2]
];
for(const [name,create,data,restored] of cases)test(name+' rechecks after an old request fails, without replaying commands',async t=>{
 let failFirst,calls=0;const methods=[];
 t.mock.method(globalThis,'fetch',async(_path,options={})=>{calls++;methods.push(options.method||'GET');if(calls===1)return new Promise((_resolve,reject)=>failFirst=reject);return {ok:true,json:async()=>data};});
 const source=create(),first=source.refresh();for(let i=0;i<5;i++)source.refresh(true);
 assert.equal(calls,1);failFirst(Error('old connection'));await first;await new Promise(setImmediate);
 assert.equal(calls,2);assert.ok(restored(source));assert.deepEqual(methods,['GET','GET']);
});
