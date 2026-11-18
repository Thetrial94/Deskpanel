import test from 'node:test';
import assert from 'node:assert/strict';
import {overviewAgent,overviewWidget,OVERVIEW_MODULES,DEFAULT_OVERVIEW_MODULES,MAX_OVERVIEW_MODULES} from '../src/core/overview.js';
import {normalizeSettings,saveSettings,loadSettings} from '../src/core/settings.js';
test('overview defaults keep existing widgets and add both agents; custom choice survives reload',()=>{
 const settings=normalizeSettings({version:6,autoRotate:false});assert.deepEqual(settings.overviewModules,DEFAULT_OVERVIEW_MODULES);
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.equal(saveSettings(storage,{...settings,overviewModules:['claude','clock','claude','unknown']}),true);
 assert.deepEqual(loadSettings(storage).overviewModules,['clock','claude']);assert.equal(loadSettings(storage).autoRotate,false);
 assert.deepEqual(normalizeSettings({overviewModules:[]}).overviewModules,['clock']);
 assert.deepEqual(normalizeSettings({overviewModules:['weather','clock','codex']}).overviewModules,['clock','codex']);
});
test('overview counts current work and questions, excludes finished and stale sessions and ignores disconnected data',()=>{
 const sessions=['completed','working','waiting','approval','interrupted','idle','stale','error'].map(status=>({id:status,status,title:'Session '+status,updatedAt:'2026-11-18T10:00:00Z'}));
 const state=overviewAgent({connection:'connected',sessions});assert.equal(state.count,4);assert.equal(state.status,'approval');assert.match(state.detail,/1 в работе/);assert.match(state.detail,/1 ждёт ответа/);
 const single=overviewAgent({connection:'connected',sessions:[sessions[1]]});assert.equal(single.title,'Session working');assert.equal(single.count,1);
 const disconnected=overviewAgent({connection:'disconnected',sessions});assert.equal(disconnected.count,0);assert.equal(disconnected.title,'Нет связи');assert.ok(!disconnected.detail.includes('Session'));
 assert.equal(overviewAgent({connection:'connected',sessions:[sessions[0],sessions[4]]}).count,0);
 assert.equal(overviewAgent({connection:'pair_required'}).title,'Нужна привязка');
 assert.equal(overviewAgent({connection:'connected',sessions:[sessions[6]]}).title,'Нет свежих событий');
});

test('overview catalog offers more than ten modules but persists at most five in chosen order',()=>{
 assert.ok(OVERVIEW_MODULES.length>=10);
 assert.equal(new Set(OVERVIEW_MODULES.map(m=>m.id)).size,OVERVIEW_MODULES.length);
 const selected=['home','meeting','breaks','computers','services','calendar','timer'];
 assert.deepEqual(normalizeSettings({overviewModules:selected}).overviewModules,selected.slice(0,MAX_OVERVIEW_MODULES));
 assert.deepEqual(normalizeSettings({overviewModules:['focus','home']}).overviewModules,['focus','home']);
 assert.equal(OVERVIEW_MODULES.some(m=>m.id==='weather'),false);
 assert.deepEqual(normalizeSettings({overviewModules:['home','timer','clock','music']}).overviewModules,['clock','home','timer','music']);
});
test('calendar and meeting widgets distinguish all-day events from timed meetings and ignore disconnected cached events',()=>{
 const now=Date.parse('2026-11-19T09:00:00Z');
 const allDay={id:'day',title:'All day',allDay:true,start:'2026-11-19T00:00:00+03:00',end:'2026-11-21T00:00:00+03:00'};
 const meeting={id:'meeting',title:'Meeting',allDay:false,start:'2026-11-19T09:02:00Z',end:'2026-11-19T10:00:00Z'};
 const ctx={calendar:{snapshot:{connection:'connected',events:[meeting,allDay]}}};
 const day=overviewWidget('calendar',ctx,now);assert.equal(day.title,'All day');assert.match(day.detail,/весь день/);assert.equal(day.target,'calendar');
 const next=overviewWidget('meeting',ctx,now);assert.equal(next.eventId,'meeting');assert.equal(next.target,'meeting');assert.match(next.detail,/12:02.*02:00/);
 ctx.calendar.snapshot.connection='disconnected';assert.equal(overviewWidget('calendar',ctx,now).title,'Нет связи');assert.equal(overviewWidget('meeting',ctx,now).status,'offline');
});
test('timer widgets expose running, paused, ready and completed states with correct navigation',()=>{
 const ctx={timer:{duration:300,remaining:300,seconds:()=>300},focus:{duration:25,remaining:90,seconds:()=>90},breaks:{duration:()=>5,phase:'rest',due:true,seconds:()=>0}};
 assert.equal(overviewWidget('timer',ctx).detail,'Готов к запуску');
 const focus=overviewWidget('focus',ctx);assert.equal(focus.title,'01:30');assert.equal(focus.detail,'На паузе');assert.equal(focus.mode,'focus');assert.equal(focus.target,'timers');
 const rest=overviewWidget('breaks',ctx);assert.equal(rest.label,'Отдых');assert.equal(rest.detail,'Время вышло');assert.equal(rest.status,'waiting');
 ctx.timer.deadline=Date.now()+300000;assert.equal(overviewWidget('timer',ctx).status,'working');
});
test('home widget only summarizes apartment devices; computer and service widgets respect connectivity',()=>{
 const ctx={home:{snapshot:{connection:'connected',provider:'yandex',devices:[{on:true,household:{name:' Квартира '}},{on:false,household:{name:'Квартира'}},{on:true,household:{name:'Мой дом'}}]}},computers:{snapshot:{connection:'connected',nodes:[{name:'Laptop',connection:'connected'},{name:'PC',connection:'disconnected'}]}},calendar:{snapshot:{connection:'connected'}},music:{snapshot:{connection:'disconnected',track:{title:'Cached track'}}},agents:{snapshot:{codex:{connection:'connected'},claude:{connection:'disconnected'}}}};
 assert.equal(overviewWidget('home',ctx).title,'1 включено');assert.match(overviewWidget('home',ctx).detail,/2 устройств/);
 assert.equal(overviewWidget('computers',ctx).title,'1 из 2 в сети');
 assert.equal(overviewWidget('music',ctx).title,'Нет связи');
 assert.equal(overviewWidget('services',ctx).title,'3 из 5 доступны');assert.match(overviewWidget('services',ctx).detail,/Музыка, Claude/);
 ctx.computers.snapshot.connection='disconnected';assert.equal(overviewWidget('computers',ctx).title,'Нет связи');
 ctx.home.snapshot.connection='disconnected';assert.equal(overviewWidget('home',ctx).title,'Нет связи');
});
