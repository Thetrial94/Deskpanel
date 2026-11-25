# Dot-source this file in ordinary PowerShell on the computer being configured.
# Definitions only: loading the file does not change configuration.
param([ValidateRange(1024,65535)][int]$Port=4317)
$script:DeskPanelConsoleBase='http://127.0.0.1:'+ $Port
function Invoke-DeskPanelLocalApi {
 param([ValidateSet('/api/health','/api/access','/api/connections','/api/nodes','/api/agents','/api/calendar','/api/home')][string]$Path,
       [ValidateSet('Get','Post')][string]$Method='Get',[System.Collections.IDictionary]$Body)
 $taskParameters=@{Uri=$script:DeskPanelConsoleBase+$Path;Method=$Method;TimeoutSec=35;ErrorAction='Stop'}
 if($Method -eq 'Post') {
  $taskParameters.Headers=@{Origin=$script:DeskPanelConsoleBase;'X-DeskPanel'='1'}
  $taskParameters.ContentType='application/json; charset=utf-8'
  $taskParameters.Body=[Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress))
 }
 try {Invoke-RestMethod @taskParameters} catch {
  $taskStatus='unavailable'
  if($_.Exception.Response){$taskStatus=[string][int]$_.Exception.Response.StatusCode}
  throw ('DeskPanel local API failed ('+$taskStatus+'). Check the server and the supplied values; private input is not displayed.')
 }
}
function Set-DeskPanelName {
 param([Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Name)
 Invoke-DeskPanelLocalApi -Path /api/nodes -Method Post -Body @{command='configure';name=$Name} | Out-Null
 Write-Output 'DeskPanel name saved.'
}
function Set-DeskPanelCalendar {
 $taskSecret=Read-Host 'Paste the private ICS URL (hidden input)' -AsSecureString
 $taskPointer=[IntPtr]::Zero;$taskPayload=$null
 try {
  $taskPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
  $taskPayload=@{kind='calendar';url=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)}
  Invoke-DeskPanelLocalApi -Path /api/connections -Method Post -Body $taskPayload | Out-Null
  Write-Output 'Calendar configuration saved. Run Get-DeskPanelSummary to check the feed.'
 } finally {
  if($taskPayload){$taskPayload.url=$null}
  if($taskPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)}
  $taskSecret.Dispose()
 }
}
function Set-DeskPanelYandexHome {
 $taskSecret=Read-Host 'Paste the Yandex Home OAuth token (hidden input)' -AsSecureString
 $taskPointer=[IntPtr]::Zero;$taskPayload=$null
 try {
  $taskPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
  $taskPayload=@{kind='home';provider='yandex';token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)}
  Invoke-DeskPanelLocalApi -Path /api/connections -Method Post -Body $taskPayload | Out-Null
  Write-Output 'Yandex Home configuration saved. Run Get-DeskPanelSummary to verify access.'
 } finally {
  if($taskPayload){$taskPayload.token=$null}
  if($taskPointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer)}
  $taskSecret.Dispose()
 }
}
function New-DeskPanelPairCode {
 $taskResult=Invoke-DeskPanelLocalApi -Path /api/access -Method Post -Body @{command='code'}
 [pscustomobject]@{Code=$taskResult.code;ValidUntil=([DateTimeOffset]::FromUnixTimeMilliseconds([long]$taskResult.expiresAt)).LocalDateTime}
}
function Add-DeskPanelComputer {
 param([Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Name,
       [Parameter(Mandatory)][string]$NodeUrl,
       [Parameter(Mandatory)][ValidateSet('codex','claude','none')][string]$Agent)
 $taskCode=(Read-Host 'Enter the six-digit pairing code shown on that computer').Trim()
 if($taskCode -notmatch '^\d{6}$'){throw 'The pairing code must have six digits.'}
 Invoke-DeskPanelLocalApi -Path /api/nodes -Method Post -Body @{command='connect';name=$Name;url=$NodeUrl;code=$taskCode;agent=$Agent} | Out-Null
 Write-Output 'Computer paired. Existing unrelated sources are preserved.'
}
function Select-DeskPanelMusic {
 param([Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Name)
 $taskNodes=Invoke-DeskPanelLocalApi -Path /api/nodes
 $taskMatches=@($taskNodes.nodes | Where-Object {$_.name -eq $Name})
 if($taskMatches.Count -ne 1){throw 'Expected exactly one saved computer with that name. Run Get-DeskPanelComputers.'}
 Invoke-DeskPanelLocalApi -Path /api/nodes -Method Post -Body @{command='configure';bindings=@{music=$taskMatches[0].id}} | Out-Null
 Write-Output 'Music source saved. Agent sources are unchanged.'
}
function Get-DeskPanelComputers {
 $taskResult=Invoke-DeskPanelLocalApi -Path /api/nodes
 $taskResult.nodes | Select-Object id,name,url,connection
}
function Get-DeskPanelSummary {
 $taskHealth=Invoke-DeskPanelLocalApi -Path /api/health
 [pscustomobject]@{Component='Hub';State=if($taskHealth.ok -and $taskHealth.app -eq 'deskpanel'){'connected'}else{'invalid'};Count=$null;Source=$env:COMPUTERNAME}
 foreach($taskPath in @('/api/calendar','/api/home')) {
  $taskState=Invoke-DeskPanelLocalApi -Path $taskPath
  $taskCount=if($taskPath -eq '/api/calendar'){@($taskState.events | Where-Object {$_}).Count}else{@($taskState.devices | Where-Object {$_.household.name -eq 'Квартира'}).Count}
  [pscustomobject]@{Component=if($taskPath -eq '/api/calendar'){'Calendar'}else{'Yandex Home / Квартира'};State=$taskState.connection;Count=$taskCount;Source='Hub'}
 }
 $taskAgents=Invoke-DeskPanelLocalApi -Path /api/agents
 foreach($taskAgent in $taskAgents.providers) {
  [pscustomobject]@{Component=$taskAgent.id;State=$taskAgent.connection;Count=@($taskAgent.sessions).Count;Source=$taskAgent.source.name}
 }
}
