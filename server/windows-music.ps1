# Targeted yamusic-rs 1.0.2 remote. Only this process's tray window receives commands.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class DeskPanelMusicNative {
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
 [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr hwnd);
 [DllImport("user32.dll", SetLastError=true)] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp);
}
'@
$exe = $env:DESKPANEL_MUSIC_EXE
if ([string]::IsNullOrWhiteSpace($exe)) { $exe = Join-Path $env:LOCALAPPDATA 'Programs\yamusic-rs\yamusic-rs.exe' }
$exe = [IO.Path]::GetFullPath($exe)
function Get-MusicTarget {
 if (-not [IO.File]::Exists($exe)) { return @{connection='not_installed'; handle=[IntPtr]::Zero} }
 $handle = [DeskPanelMusicNative]::FindWindow('yamusic_rs_tray', 'yamusic_rs_tray')
 if ($handle -eq [IntPtr]::Zero) {
  $running = Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($exe)) -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe }
  return @{connection=$(if ($running) {'starting'} else {'stopped'}); handle=$handle}
 }
 [uint32]$ownerId = 0
 [void][DeskPanelMusicNative]::GetWindowThreadProcessId($handle, [ref]$ownerId)
 try { $owner = Get-Process -Id $ownerId -ErrorAction Stop } catch { return @{connection='stopped'; handle=[IntPtr]::Zero} }
 # Never send global media keys or address another executable.
 if (-not [string]::Equals($owner.Path, $exe, [StringComparison]::OrdinalIgnoreCase)) {
  return @{connection='different_installation'; handle=[IntPtr]::Zero}
 }
 if ([DeskPanelMusicNative]::IsHungAppWindow($handle)) { return @{connection='unavailable'; handle=[IntPtr]::Zero} }
 return @{connection='connected'; handle=$handle}
}
while ($null -ne ($line = [Console]::ReadLine())) {
 $request = $null
 try {
  $request = $line | ConvertFrom-Json
  $action = [string]$request.action
  if ($action -notin @('status','launch','toggle','next','previous')) { throw 'invalid_command' }
  $target = Get-MusicTarget
  $accepted = $false
  $errorCode = $null
  if ($action -eq 'launch') {
   if ($target.connection -eq 'stopped') {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $exe
    $info.WorkingDirectory = [IO.Path]::GetDirectoryName($exe)
    $info.UseShellExecute = $true
    $info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    [void][Diagnostics.Process]::Start($info)
    $accepted = $true
   } elseif ($target.connection -eq 'connected') { $accepted = $true }
   else { $errorCode = $target.connection }
  } elseif ($action -ne 'status') {
   if ($target.connection -ne 'connected') { $errorCode = $target.connection }
   else {
    $key = @{toggle=1; next=2; previous=3}[$action]
    $accepted = [DeskPanelMusicNative]::PostMessage($target.handle, 0x0312, [IntPtr]$key, [IntPtr]::Zero)
    if (-not $accepted) { $errorCode = 'command_failed' }
   }
  }
  @{id=$request.id; connection=$target.connection; accepted=$accepted; error=$errorCode} | ConvertTo-Json -Compress | ForEach-Object {[Console]::WriteLine($_)}
 } catch {
  @{id=$request.id; connection='unavailable'; accepted=$false; error='bridge_error'} | ConvertTo-Json -Compress | ForEach-Object {[Console]::WriteLine($_)}
 }
}
