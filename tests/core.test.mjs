import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSettings,loadSettings,saveSettings,SCREEN_IDS} from '../src/core/settings.js';
import {RotationClock,swipeDirection} from '../src/core/rotation.js';
import {FocusTimer} from '../src/core/focus.js';
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
test('damaged settings recover and keep one enabled screen',()=>{
 assert.deepEqual(loadSettings({getItem:()=>'{bad'}).enabledScreens,SCREEN_IDS);
 const v=normalizeSettings({screenOrder:['claude','bogus','claude'],enabledScreens:[],interval:-1,city:{name:'x',latitude:NaN,longitude:0}});
 assert.equal(v.screenOrder[0],'claude');assert.equal(v.screenOrder.length,11);
 assert.deepEqual(v.enabledScreens,['overview']);assert.equal(v.interval,5);assert.equal(v.city,null);
});
test('screen order, disabled screens and preferences survive reload',()=>{
 const storage=memory();const value=normalizeSettings({screenOrder:['focus','claude'],enabledScreens:['focus','claude'],autoRotate:false,interval:30});
 assert.equal(saveSettings(storage,value),true);assert.deepEqual(loadSettings(storage),value);
 assert.equal(saveSettings({setItem:()=>{throw Error();}},value),false);
});
test('rotation occurs once after the interval, including a suspended tab',()=>{
 const clock=new RotationClock(10000,0);assert.equal(clock.tick(9999),false);assert.equal(clock.tick(10000),true);
 assert.equal(clock.tick(10001),false);assert.equal(clock.tick(50000),true);assert.equal(clock.tick(50001),false);
});
test('interaction delays rotation by pause plus a full interval',()=>{
 const clock=new RotationClock(10000,0);clock.interact(5000,30000);
 assert.equal(clock.tick(34999),false);assert.equal(clock.tick(35000),false);assert.equal(clock.progress(35000),0);
 assert.equal(clock.tick(44999),false);assert.equal(clock.tick(45000),true);
});
test('open settings or manual pause stop rotation without a catch-up jump',()=>{
 const clock=new RotationClock(10000,0);assert.equal(clock.tick(30000,true),false);
 assert.equal(clock.tick(39999),false);assert.equal(clock.tick(40000),true);
});
test('swipes distinguish horizontal gestures from scrolling and taps',()=>{
 assert.equal(swipeDirection({x:200,y:100},{x:100,y:105}),1);
 assert.equal(swipeDirection({x:100,y:100},{x:200,y:105}),-1);
 assert.equal(swipeDirection({x:100,y:100},{x:120,y:100}),0);
 assert.equal(swipeDirection({x:100,y:100},{x:160,y:200}),0);
});
test('focus timer survives remount and refresh using a deadline',()=>{
 const storage=memory(),timer=new FocusTimer(storage);timer.start(1000);
 assert.equal(timer.seconds(61000),1440);
 const restored=new FocusTimer(storage);assert.equal(restored.seconds(61000),1440);
 restored.pause(61000);assert.equal(restored.seconds(9999999),1440);
 restored.start(100000);assert.equal(restored.seconds(160000),1380);
});
test('focus completion fires only once and resetting clears it',()=>{
 const timer=new FocusTimer(memory());timer.setDuration(15);timer.start(1000);
 assert.equal(timer.tick(901000),true);assert.equal(timer.completed,true);
 assert.equal(timer.tick(902000),false);timer.reset();assert.equal(timer.seconds(),900);assert.equal(timer.completed,false);
});
test('invalid saved focus settings cannot introduce NaN or an arbitrary duration',()=>{
 const timer=new FocusTimer({getItem:()=>JSON.stringify({duration:-20,deadline:'bad',remaining:-50})});
 assert.equal(timer.duration,25);assert.equal(timer.deadline,null);assert.equal(timer.seconds(),0);
});

test('Moscow defaults migrate old empty settings without losing preferences',()=>{
 const storage=memory();
 storage.setItem('deskpanel.settings.v1',JSON.stringify({version:1,city:null,autoRotate:false,interval:60,enabledScreens:['clock','weather']}));
 const value=loadSettings(storage);
 assert.equal(value.version,6);assert.equal(value.city.name,'Москва');
 assert.equal(value.city.latitude,55.7558);assert.equal(value.city.longitude,37.6173);
 assert.equal(value.autoRotate,false);assert.equal(value.interval,60);
 assert.deepEqual(value.enabledScreens,['overview','weather','music','computer','remote','calendar','home','timers']);
 assert.equal(loadSettings(memory()).city.name,'Москва');
});
test('an existing city and an explicit removal survive migration and reload',()=>{
 const city={name:'Казань',latitude:55.79,longitude:49.12,country:'Россия'};
 assert.deepEqual(normalizeSettings({version:1,city}).city,city);
 const storage=memory(),value=normalizeSettings();
 value.city=null;saveSettings(storage,value);
 assert.equal(loadSettings(storage).city,null);
});
test('music screen appears once in old settings and can stay hidden after saving',()=>{
 const old=normalizeSettings({version:2,city:null,enabledScreens:['clock'],screenOrder:['clock']});
 assert.equal(old.city,null);assert.deepEqual(old.enabledScreens,['overview','music','computer','remote','calendar','home','timers']);
 const storage=memory();old.enabledScreens=['clock'];saveSettings(storage,old);
 assert.deepEqual(loadSettings(storage).enabledScreens,['overview']);
 assert.equal(loadSettings(storage).city,null);
});
