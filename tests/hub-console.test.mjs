import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createAppServer} from '../server/index.mjs';
import {Features} from '../server/features.mjs';
import {Network} from '../server/network.mjs';
const run=promisify(execFile);
// Avoid inheriting PowerShell 7 module paths when testing Windows PowerShell 5.1 from Node.
const psEnv={...process.env,PSModulePath:join(process.env.SystemRoot||'C:/Windows','System32','WindowsPowerShell','v1.0','Modules')};
test('PowerShell console configures the real API with UTF-8, hides inputs and preserves unrelated bindings',{skip:process.platform!=='win32'},async t=>{
 let data={},writes=0;const store={get:async()=>data,update:async fn=>{writes++;data=fn(structuredClone(data));return data;}};
 const features=new Features({store,computer:{metrics:()=>({connection:'connected'})}});
 features.calendar.status=async()=>({connection:data.calendar?'connected':'not_configured',events:[]});
 features.home.status=async()=>({connection:data.home?'connected':'not_configured',provider:'yandex',devices:[{household:{name:'Квартира'}}]});
 const token='a'.repeat(64);
 const network=new Network(store,{fetcher:async(url,options)=>{
  if(url.endsWith('/health'))return new Response(JSON.stringify({app:'deskpanel',ok:true,capabilities:['nodes-v1']}));
  if(url.endsWith('/access'))return new Response(JSON.stringify({paired:true}),{headers:{'Set-Cookie':'deskpanel_device='+token+'; HttpOnly; Path=/'}});
  if(url.endsWith('/computer'))return new Response(JSON.stringify({connection:'connected'}));
  if(url.endsWith('/agents/local'))return new Response(JSON.stringify({schemaVersion:1,providers:['codex','claude'].map(id=>({id,connection:'connected',sessions:[{title:'PRIVATE SESSION CONTENT'}]}))}));
  throw Error('Unexpected test URL');
 }});
 const server=createAppServer({features,network,music:{close(){}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const dir=await mkdtemp(join(tmpdir(),'deskpanel-console-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));
 const fixture=join(dir,'fixture.ps1');
 const script=String.raw`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$ErrorActionPreference='Stop'
. $args[0] -Port ([int]$args[1])
function Read-Host {
 param([string]$Prompt,[switch]$AsSecureString)
 if($Prompt -like '*ICS*'){return ConvertTo-SecureString 'https://calendar.yandex.ru/export/private-ics-fixture' -AsPlainText -Force}
 if($Prompt -like '*OAuth*'){return ConvertTo-SecureString 'fixture-home-token-private' -AsPlainText -Force}
 return '123456'
}
Set-DeskPanelName -Name 'Мини-ПК'
Set-DeskPanelCalendar
Set-DeskPanelYandexHome
Add-DeskPanelComputer -Name 'Ноутбук' -NodeUrl 'http://192.168.0.2:4317' -Agent codex
Add-DeskPanelComputer -Name 'ПК' -NodeUrl 'http://192.168.0.3:4317' -Agent claude
Select-DeskPanelMusic -Name 'ПК'
$summary=Get-DeskPanelSummary
$computers=Get-DeskPanelComputers
$code=New-DeskPanelPairCode
[pscustomobject]@{summary=$summary;computers=$computers;codeLength=([string]$code.Code).Length} | ConvertTo-Json -Depth 8 -Compress
`;
 await writeFile(fixture,'\uFEFF'+script,'utf8');
 const result=await run('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fixture,resolve('scripts/hub-console.ps1'),String(server.address().port)],{env:psEnv,windowsHide:true,timeout:45000,maxBuffer:65536,encoding:'utf8'});
 assert.equal(result.stderr,'');
 assert.ok(!/private-ics-fixture|fixture-home-token-private|PRIVATE SESSION CONTENT|aaaaaaaaaaaaaaaa/.test(result.stdout));
 const summary=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
 assert.equal(summary.codeLength,6);assert.equal(summary.summary.find(x=>x.Component==='Calendar').Count,0);
 assert.equal(summary.summary.find(x=>x.Component==='Yandex Home / Квартира').Count,1);
 assert.equal(summary.summary.find(x=>x.Component==='claude').Source,'ПК');
 assert.equal(data.network.name,'Мини-ПК');assert.equal(data.calendar.url,'https://calendar.yandex.ru/export/private-ics-fixture');assert.equal(data.home.token,'fixture-home-token-private');
 const notebook=data.network.nodes.find(n=>n.name==='Ноутбук'),pc=data.network.nodes.find(n=>n.name==='ПК');
 assert.equal(data.network.bindings.codex,notebook.id);assert.equal(data.network.bindings.claude,pc.id);assert.equal(data.network.bindings.music,pc.id);assert.equal(writes,6);
 // Dot-sourcing alone is read-only, even against a real listening server.
 const before=writes;
 const load=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',`. '${resolve('scripts/hub-console.ps1').replaceAll("'","''")}' -Port ${server.address().port}`],{env:psEnv,windowsHide:true,timeout:10000});
 assert.equal(load.stdout,'');assert.equal(writes,before);
});
test('All PowerShell blocks in the hub guide parse in Windows PowerShell 5.1 without executing',{skip:process.platform!=='win32'},async t=>{
 const doc=await readFile('docs/hub-powershell.md','utf8');const blocks=[...doc.matchAll(/```powershell\r?\n([\s\S]*?)```/g)].map(m=>m[1]);assert.ok(blocks.length>25);
 const dir=await mkdtemp(join(tmpdir(),'deskpanel-guide-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:3,retryDelay:100}));
 const file=join(dir,'blocks.json');await writeFile(file,'\uFEFF'+JSON.stringify(blocks),'utf8');
 const fixture=join(dir,'parse.ps1');await writeFile(fixture,`$ErrorActionPreference='Stop'\n$blocks=Get-Content -LiteralPath $args[0] -Raw -Encoding UTF8 | ConvertFrom-Json\n$count=0\nforeach($block in $blocks){$tokens=$null;$errors=$null;$null=[Management.Automation.Language.Parser]::ParseInput($block,[ref]$tokens,[ref]$errors);if($errors.Count){throw ($errors | ForEach-Object {$_.Message} | Out-String)};$count++}\nWrite-Output $count\n`);
 const result=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fixture,file],{env:psEnv,windowsHide:true,timeout:15000});assert.equal(Number(result.stdout.trim()),blocks.length);
});
