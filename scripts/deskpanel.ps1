param([ValidateSet('Start','Install','Uninstall','Status','Stop')][string]$Action='Status')
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskRuntime=Join-Path $taskRoot '.runtime'
$taskSupervisor=Join-Path $PSScriptRoot 'supervise.mjs'
$taskShortcut=Join-Path ([Environment]::GetFolderPath('Startup')) 'DeskPanel.lnk'
function Get-DeskPanelSupervisor {
 $taskPidFile=Join-Path $taskRuntime 'supervisor.pid'
 if(!(Test-Path -LiteralPath $taskPidFile)){return $null}
 $taskSavedPid=0
 if(![int]::TryParse((Get-Content -LiteralPath $taskPidFile -Raw).Trim(),[ref]$taskSavedPid)){return $null}
 $taskProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$taskSavedPid"
 if($taskProcess -and $taskProcess.Name -eq 'node.exe' -and $taskProcess.CommandLine.Contains($taskSupervisor)){return $taskProcess}
 return $null
}
function Start-DeskPanel {
 if(Get-DeskPanelSupervisor){Write-Output 'DeskPanel supervisor is already running.';return}
 # Windows may reuse a PID after reboot. Verify identity before clearing a stale lock.
 $taskLock=Join-Path $taskRuntime 'supervisor.lock'
 if(Test-Path -LiteralPath $taskLock){
  $taskLockPid=0
  if(![int]::TryParse((Get-Content -LiteralPath $taskLock -Raw).Trim(),[ref]$taskLockPid) -or $taskLockPid -lt 1){throw 'Supervisor lock is incomplete; retry after startup finishes.'}
  $taskLockProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$taskLockPid"
  if($taskLockProcess -and $taskLockProcess.Name -eq 'node.exe' -and $taskLockProcess.CommandLine.Contains($taskSupervisor)){Write-Output 'DeskPanel supervisor is starting.';return}
  Remove-Item -LiteralPath $taskLock
 }
 $taskNode=(Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
 if(!(Test-Path -LiteralPath (Join-Path $taskRoot 'node_modules/node-ical'))){throw 'Run npm ci --ignore-scripts in the DeskPanel folder first.'}
 New-Item -ItemType Directory -Force -Path $taskRuntime | Out-Null
 Start-Process -FilePath $taskNode -ArgumentList ('"'+$taskSupervisor+'"') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRuntime 'supervisor.log') -RedirectStandardError (Join-Path $taskRuntime 'supervisor-error.log') | Out-Null
 Write-Output 'DeskPanel supervisor started.'
}
function Get-DeskPanelShortcut {
 if(!(Test-Path -LiteralPath $taskShortcut)){return $null}
 $taskLink=(New-Object -ComObject WScript.Shell).CreateShortcut($taskShortcut)
 if(!$taskLink.Arguments.Contains($PSCommandPath)){throw 'An unrelated DeskPanel startup shortcut already exists.'}
 return $taskLink
}
switch($Action){
 'Install' {
  $null=Get-DeskPanelShortcut
  $taskShell=New-Object -ComObject WScript.Shell
  $taskLink=$taskShell.CreateShortcut($taskShortcut)
  $taskLink.TargetPath=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $taskLink.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$PSCommandPath+'" -Action Start'
  $taskLink.WorkingDirectory=$taskRoot;$taskLink.WindowStyle=7;$taskLink.Description='DeskPanel local server with automatic recovery';$taskLink.Save()
  Write-Output 'DeskPanel autostart enabled for the current Windows user.'
  Start-DeskPanel
 }
 'Uninstall' {if(Get-DeskPanelShortcut){Remove-Item -LiteralPath $taskShortcut};Write-Output 'DeskPanel autostart disabled. The running server is unchanged.'}
 'Start' {Start-DeskPanel}
 'Status' {
  $taskProcess=Get-DeskPanelSupervisor
  $taskStatusFile=Join-Path $taskRuntime 'service-status.json';$taskState=$null
  if($taskProcess -and (Test-Path -LiteralPath $taskStatusFile)){$taskState=Get-Content -LiteralPath $taskStatusFile -Raw | ConvertFrom-Json}
  [pscustomobject]@{Autostart=[bool](Get-DeskPanelShortcut);SupervisorRunning=[bool]$taskProcess;SupervisorPid=if($taskProcess){$taskProcess.ProcessId}else{$null};ServerPid=$taskState.serverPid;State=$taskState.state;UpdatedAt=$taskState.updatedAt} | Format-List
 }
 'Stop' {
  $taskProcess=Get-DeskPanelSupervisor
  if(!$taskProcess){Write-Output 'No managed DeskPanel supervisor is running.';return}
  $taskStatusFile=Join-Path $taskRuntime 'service-status.json';$taskServerPid=$null
  if(Test-Path -LiteralPath $taskStatusFile){$taskServerPid=(Get-Content -LiteralPath $taskStatusFile -Raw | ConvertFrom-Json).serverPid}
  Stop-Process -Id $taskProcess.ProcessId
  if($taskServerPid){
   $taskChild=Get-CimInstance Win32_Process -Filter "ProcessId=$taskServerPid"
   $taskEntry=Join-Path $taskRoot 'server/index.mjs'
   if($taskChild -and $taskChild.ParentProcessId -eq $taskProcess.ProcessId -and $taskChild.Name -eq 'node.exe' -and $taskChild.CommandLine.Contains($taskEntry)){Stop-Process -Id $taskChild.ProcessId}
  }
  Write-Output 'Managed DeskPanel processes stopped. Autostart setting is unchanged.'
 }
}
