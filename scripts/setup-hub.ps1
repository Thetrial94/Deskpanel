$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
& (Join-Path $PSScriptRoot 'deskpanel.ps1') -Action Install
$taskReady=$false
for($taskAttempt=0;$taskAttempt -lt 20;$taskAttempt++) {
 try {
  $taskHealth=Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/health' -TimeoutSec 2
  if($taskHealth.ok -and $taskHealth.app -eq 'deskpanel') {$taskReady=$true;break}
 } catch {}
 Start-Sleep -Milliseconds 500
}
if(!$taskReady) { throw 'DeskPanel is not responding on port 4317' }
$taskHeaders=@{Origin='http://127.0.0.1:4317';'X-DeskPanel'='1'}
$taskBody=@{command='configure';name='Hub'} | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/nodes' -Method Post -Headers $taskHeaders -ContentType 'application/json' -Body $taskBody -TimeoutSec 10 | Out-Null
Write-Output 'Hub started. Configure calendar, home and computers at http://localhost:4317 -> Settings.'
Write-Output 'Open ONE of these addresses on the phone (same LAN):'
& node --input-type=module -e "import {networkInterfaces} from 'node:os'; for(const list of Object.values(networkInterfaces()))for(const a of list||[])if(a.family==='IPv4'&&!a.internal)console.log('http://'+a.address+':4317');"
Write-Output 'Pair the phone with this hub using a code. Set the chosen URL as Fully Start URL.'
Write-Output 'Keep the hub powered on. Launch on Boot on the phone is optional.'
