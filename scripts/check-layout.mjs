// Synthetic browser QA: no real accounts, tokens, playback, or computer commands.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createAppServer} from '../server/index.mjs';
import {Features} from '../server/features.mjs';
import {Network} from '../server/network.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let scenario={connection:'connected',playback:'playing',long:false,many:false,quota:'fresh'};
let data={network:{name:'Ноутбук',nodes:[{id:'demo-pc',name:'Стационарный ПК',url:'http://192.168.0.200:4317'}],bindings:{music:'local'}}};
const store={get:async()=>data,update:async fn=>(data=fn(structuredClone(data)))};
const metrics=()=>({connection:scenario.connection,name:'Демонстрационный компьютер',cpu:23,memory:{used:12*1073741824,total:32*1073741824},uptime:186000});
const remote=()=>({connection:scenario.connection,audio:{volume:35,muted:false},mic:{muted:true}});
const features=new Features({store,computer:{metrics,run:async()=>remote()}});
const events=()=>[{id:'day',title:'Обучение · два дня',allDay:true,start:new Date(Date.now()-3600000).toISOString(),end:new Date(Date.now()+86400000).toISOString()},...Array.from({length:scenario.many?9:2},(_,i)=>({id:'event'+i,title:scenario.long?'Планирование развития продукта и обсуждение задач следующей недели':'Встреча команды '+(i+1),allDay:false,start:new Date(Date.now()+120000+i*3600000).toISOString(),end:new Date(Date.now()+3600000+i*3600000).toISOString(),canOpen:true}))];
features.calendar.status=async()=>({connection:scenario.connection,events:events()});
features.home.status=async()=>({connection:scenario.connection,provider:'yandex',devices:Array.from({length:scenario.many?12:4},(_,i)=>({id:'device'+i,name:scenario.long?'Настольная лампа рабочего места '+i:['Настольная лампа','Розетка монитора','Температура','Подсветка кухни'][i%4],kind:i%4===2?'devices.types.sensor':'devices.types.light',on:i%2===0,controllable:i%4!==2,value:i%4===2?'23 °C':null,household:{id:'flat',name:'Квартира'},room:{id:'room'+Math.floor(i/3),name:i<3?'Кабинет':'Кухня'}}))});
let volume=40;
const music={status:async()=>({schemaVersion:1,connection:scenario.connection,enhanced:true,playback:scenario.playback,volume,track:{title:scenario.long?'Очень длинное название музыкальной композиции с дополнительной версией и приглашёнными исполнителями':'Ночной город',artist:scenario.long?'Демонстрационная группа · Концертная запись в большом зале':'Демонстрационный исполнитель'}}),command:async(command,value)=>{if(command==='toggle')scenario.playback=scenario.playback==='playing'?'paused':'playing';if(command==='volume')volume=value;return {accepted:true,error:null};},close(){}};
const agentReader=async()=>({schemaVersion:1,providers:['codex','claude'].map(id=>({id,connection:scenario.connection,usage:scenario.quota==='missing'?null:{status:'available',updatedAt:new Date(Date.now()-(scenario.quota==='stale'?3600000:0)).toISOString(),windows:{fiveHour:{usedPercent:id==='codex'?25:95,resetsAt:new Date(Date.now()+(scenario.quota==='expired'?-1000:3600000)).toISOString()},week:{usedPercent:id==='codex'?60:30,resetsAt:new Date(Date.now()+86400000).toISOString()}}},sessions:Array.from({length:scenario.many?7:2},(_,i)=>({id:id+i,title:scenario.long?'Переработка модульной панели и проверка всех экранов в разных ориентациях':'Задача '+(i+1)+' · '+id,status:i===0?'working':i===1?'completed':i===2?'waiting':'completed',updatedAt:new Date().toISOString(),statusSince:new Date(Date.now()-360000).toISOString()}))}))});
const weather={get:async()=>{if(scenario.connection!=='connected')throw Error('offline');return {provider:'met',current:{temperature_2m:3,weather_code:3,relative_humidity_2m:78,wind_speed_10m:12},daily:{time:Array.from({length:5},(_,i)=>new Date(Date.now()+i*86400000).toISOString().slice(0,10)),weather_code:[3,2,3,3,1],temperature_2m_max:[4,3,2,1,3],temperature_2m_min:[1,0,-1,-2,0]},updatedAt:Date.now()};},search:async()=>[]};
const network=new Network(store);
network.request=async(node,resource)=>({status:200,data:resource==='access'?{paired:true}:resource==='computer'?metrics():resource==='remote'?remote():resource==='agents'?await agentReader():await music.status()});
const server=createAppServer({features,music,agentReader,weather,network});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,profile=resolve('.runtime/design-browser-'+Date.now());await mkdir(profile,{recursive:true});
const candidates=[process.env.DESKPANEL_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean);
let browser;for(const path of candidates){try{await access(path);browser=path;break;}catch{}}
if(!browser){await new Promise(r=>server.close(r));throw Error('Chromium/Edge not found. Set DESKPANEL_BROWSER to its executable.');}
const edge=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const out=resolve('.runtime/design-'+(process.argv[2]||'audit'));await mkdir(out,{recursive:true});
let ws;
try{
 let port;
 for(let i=0;i<100;i++){try{port=Number((await readFile(profile+'/DevToolsActivePort','utf8')).split('\n')[0]);break;}catch{await delay(100);}}
 assert.ok(port,'Edge debugging not ready');
 const pages=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();const page=pages.find(p=>p.type==='page');assert.ok(page);
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await call('Page.enable');await call('Runtime.enable');await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await call('Emulation.setDeviceMetricsOverride',{width:1122,height:504,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:base});await delay(1500);
 await evaluate(`localStorage.setItem('deskpanel.settings.v1',JSON.stringify({version:6,autoRotate:false,smartTransitions:false,eveningMode:false}));`);await call('Page.reload');await delay(1500);
 const waitFor=async(expression,message)=>{const until=Date.now()+5000;while(Date.now()<until){if(await evaluate(expression))return;await delay(100);}throw Error(message);};
 const results=[];
 const views=[['overview','overview'],['weather','weather'],['music','music'],['codex','codex'],['claude','claude'],['timer','timers'],['focus','timers'],['breaks','timers'],['services','services'],['computer','computer'],['remote','remote'],['calendar','calendar'],['home','home'],['meeting','meeting']];
 async function visit(name,id){
  await waitFor(`document.querySelector('[data-screen="${id==='meeting'?'overview':id}"]')!==null`,'Navigation did not load: '+id);
  if(id==='meeting')await evaluate(`document.querySelector('.brand').click();document.querySelector('[data-primary]').click()`);
  else await evaluate(`document.querySelector('[data-screen="${id}"]').click()`);
  await delay(220);
  if(['timer','focus','breaks'].includes(name))await evaluate(`document.querySelector('[data-mode="${name}"]').click()`);
  await delay(120);
 }
 async function capture(name,viewport){
  const stats=await evaluate(`(()=>{const s=document.querySelector('#stage'),r=s.getBoundingClientRect();return {screen:location.hash,scrollY:s.scrollHeight>s.clientHeight+1,stageHeight:s.clientHeight,contentHeight:s.scrollHeight,pageOverflow:document.documentElement.scrollWidth>innerWidth,overflowX:s.scrollWidth>s.clientWidth+1,empty:!s.textContent.trim(),smallButtons:[...s.querySelectorAll('button')].filter(n=>n.getClientRects().length&&n.getBoundingClientRect().height<36).length,clippedOverview:[...s.querySelectorAll('[data-overview-module-card]')].filter(n=>[...n.children].some(c=>c.getBoundingClientRect().bottom>n.getBoundingClientRect().bottom+1)).map(n=>n.dataset.overviewModuleCard)};})()`);
  results.push({name,viewport,...stats});
  const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/'+viewport+'-'+name+'.png',Buffer.from(shot.data,'base64'));
 }
 for(const [viewport,width,height] of [['landscape',1122,504],['portrait',412,892],['compact',800,360],['small-portrait',360,640]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const [name,id] of views){await visit(name,id);await capture(name,viewport);
   if(['codex','claude'].includes(id)){
    assert.equal(await evaluate(`document.querySelectorAll('[data-quota]').length`),2);
    assert.equal(await evaluate(`document.querySelector('[data-quota="fiveHour"] meter').value`),id==='codex'?75:5);
   }}
 }
 // Edge cases use only synthetic data and never operate a real machine.
 for(const [state,change] of [['paused',{playback:'paused'}],['long',{long:true}],['many',{many:true}],['offline',{connection:'disconnected'}],['stopped',{connection:'stopped'}]]){
  Object.assign(scenario,change);await call('Page.reload');await delay(500);
  for(const [viewport,width,height] of [['landscape',1122,504],['portrait',412,892],['compact',800,360],['small-portrait',360,640]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const [name,id] of views.filter(([n])=>['music','overview',...(state==='many'?['codex','calendar','home']:[]),...(state==='offline'?['weather','claude','computer','remote','calendar','home','services']:[])].includes(n))){await visit(name,id);await capture(state+'-'+name,viewport);}
  }
 }
 // Missing, stale and reset windows must remain explicit at every size.
 Object.assign(scenario,{connection:'connected',long:false,many:false});
 for(const quota of ['missing','stale','expired']){
  scenario.quota=quota;await call('Page.reload');await delay(500);
  for(const [viewport,width,height] of [['landscape',1122,504],['portrait',412,892],['compact',800,360],['small-portrait',360,640]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   for(const id of ['codex','claude']){
    await visit(id,id);await capture(quota+'-'+id,viewport);
    assert.equal(await evaluate(`document.querySelector('[data-quota="fiveHour"] .quota-note').textContent`),quota==='missing'?'Нет данных':quota==='stale'?'Данные устарели':'Ожидаем обновление');
   }
  }
 }
 scenario.quota='fresh';
 // Functional checks exercise rendered controls against synthetic adapters.
 Object.assign(scenario,{connection:'connected',playback:'playing',long:false,many:false});
 await call('Page.reload');await delay(500);await visit('music','music');
 await evaluate(`document.querySelector('[data-command="toggle"]').click()`);await delay(900);
 assert.equal(await evaluate(`document.querySelector('[data-command="toggle"]').getAttribute('aria-pressed')`),'false');
 await evaluate(`const slider=document.querySelector('#music-volume');slider.value='75';slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}))`);await delay(900);
 assert.equal(volume,75);assert.equal(await evaluate(`document.querySelector('[data-volume-output]').textContent`),'75%');
 await call('Emulation.setDeviceMetricsOverride',{width:800,height:360,deviceScaleFactor:1,mobile:false});await capture('command-feedback-music','compact');
 await evaluate(`document.querySelector('[data-music-picker] [data-target="demo-pc"]').click()`);await delay(400);
 assert.equal(data.network.bindings.music,'demo-pc');
 await visit('focus','timers');await evaluate(`document.querySelector('[data-timer-toggle]').click()`);assert.equal(await evaluate(`document.querySelector('[data-timer-toggle]').textContent.includes('Пауза')`),true);await evaluate(`document.querySelector('[data-timer-toggle]').click()`);
 const anchors=[];for(const name of ['timer','focus','breaks']){await visit(name,'timers');anchors.push(await evaluate(`document.querySelector('.timer-controls').getBoundingClientRect().top`));}assert.ok(Math.max(...anchors)-Math.min(...anchors)<1,'Timer controls jumped between modes');
 await call('Emulation.setDeviceMetricsOverride',{width:412,height:892,deviceScaleFactor:1,mobile:false});
 await evaluate(`document.querySelector('#settings-open').click();document.querySelector('[data-settings-jump="screen-order-settings"]').click()`);await delay(450);
 assert.equal(await evaluate(`document.querySelector('#settings-dialog').scrollWidth<=document.querySelector('#settings-dialog').clientWidth`),true);
 await evaluate(`document.querySelector('[data-move="music"][data-delta="-1"]').click()`);
 assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('deskpanel.settings.v1')).screenOrder.slice(0,3)`),['overview','music','weather']);
 async function dragScreen(id,target,after,touch=false){
  await evaluate(`document.querySelector('[data-drag-screen="${id}"]').scrollIntoView({block:'center'})`);await delay(100);
  const points=await evaluate(`(()=>{const a=document.querySelector('[data-drag-screen="${id}"]').getBoundingClientRect(),b=document.querySelector('[data-screen-order-id="${target}"]').getBoundingClientRect();return {x:a.x+a.width/2,y:a.y+a.height/2,end:${after?'b.bottom-4':'b.top+4'}}})()`);
  const point=y=>({x:points.x,y,id:1});
  if(touch){await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(points.y)]});}
  else await call('Input.dispatchMouseEvent',{type:'mousePressed',x:points.x,y:points.y,button:'left',clickCount:1});
  for(let i=1;i<=8;i++){const y=points.y+(points.end-points.y)*i/8;if(touch)await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(y)]});else await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:points.x,y,button:'left',buttons:1});await delay(25);}
  await delay(60);
  if(touch){await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await call('Emulation.setTouchEmulationEnabled',{enabled:false});}
  else await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:points.x,y:points.end,button:'left',clickCount:1});
  await delay(100);
 }
 await dragScreen('music','overview',false);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('deskpanel.settings.v1')).screenOrder[0]`),'music');
 await dragScreen('music','weather',true,true);
 assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('deskpanel.settings.v1')).screenOrder.slice(0,3)`),['overview','weather','music']);
 await evaluate(`document.querySelector('[data-drag-screen="music"]').focus()`);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp'});
 assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('deskpanel.settings.v1')).screenOrder.slice(0,3)`),['overview','music','weather']);
 const order=await evaluate(`JSON.parse(localStorage.getItem('deskpanel.settings.v1')).screenOrder`);
 const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/portrait-screen-order.png',Buffer.from(shot.data,'base64'));
 await evaluate(`document.querySelector('#settings-close').click()`);await call('Page.reload');await delay(600);
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-screen]')].map(n=>n.dataset.screen)`),order);
 assert.deepEqual(await evaluate(`(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)})()`),[],'Duplicate IDs');
 // A completed timer must open the real modal, and both actions must work.
 await evaluate(`localStorage.setItem('deskpanel.timer.v1',JSON.stringify({duration:60,remaining:1,deadline:Date.now()-1}))`);await call('Page.reload');await waitFor(`document.querySelector('#timer-notice')?.open===true`,'Timer completion notice did not open');
 assert.equal(await evaluate(`document.querySelector('#timer-notice') instanceof HTMLDialogElement&&document.querySelector('#timer-notice').open`),true);
 await evaluate(`document.querySelector('#timer-dismiss').click()`);assert.equal(await evaluate(`document.querySelector('#timer-notice').open`),false);
 await evaluate(`localStorage.setItem('deskpanel.timer.v1',JSON.stringify({duration:60,remaining:0,completed:true,notice:true}))`);await call('Page.reload');await waitFor(`document.querySelector('#timer-notice')?.open===true`,'Timer completion notice did not open');
 assert.equal(await evaluate(`(()=>{const r=document.querySelector('#timer-notice').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`),true);
 const noticeShot=await call('Page.captureScreenshot',{format:'png'});await writeFile(out+'/portrait-timer-complete.png',Buffer.from(noticeShot.data,'base64'));
 await evaluate(`document.querySelector('#timer-extend').click()`);assert.equal(await evaluate(`document.querySelector('#timer-notice').open`),false);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('deskpanel.timer.v1')).deadline>Date.now()`),true);
 const fixed=new Set(['#overview','#music','#weather','#timers','#services','#computer','#remote','#meeting']);
 const failures=results.filter(x=>x.pageOverflow||x.overflowX||x.empty||x.smallButtons||x.clippedOverview.length||fixed.has(x.screen)&&x.scrollY);
 await writeFile(out+'/audit.json',JSON.stringify({results,errors,failures},null,2));
 console.log(JSON.stringify({out,total:results.length,failures,errors,interactions:'playback, volume, device selection, timer anchors and completion modal, arrow/mouse/touch/keyboard reordering and persistence passed'},null,2));
 assert.deepEqual(failures,[]);assert.deepEqual(errors,[]);await Promise.race([call('Browser.close'),delay(1000)]);
}finally{ws?.close();edge.kill();server.closeAllConnections();await new Promise(r=>server.close(r));}
