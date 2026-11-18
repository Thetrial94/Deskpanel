import test from 'node:test';
import assert from 'node:assert/strict';
import {overviewAgent,OVERVIEW_MODULES} from '../src/core/overview.js';
import {normalizeSettings,saveSettings,loadSettings} from '../src/core/settings.js';
test('overview defaults keep existing widgets and add both agents; custom choice survives reload',()=>{
 const settings=normalizeSettings({version:6,autoRotate:false});assert.deepEqual(settings.overviewModules,OVERVIEW_MODULES.map(m=>m.id));
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.equal(saveSettings(storage,{...settings,overviewModules:['claude','clock','claude','unknown']}),true);
 assert.deepEqual(loadSettings(storage).overviewModules,['claude','clock']);assert.equal(loadSettings(storage).autoRotate,false);
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
