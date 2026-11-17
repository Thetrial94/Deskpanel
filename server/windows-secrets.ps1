param([ValidateSet('read','write')][string]$Action)
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Security
$folder=Join-Path $env:LOCALAPPDATA 'DeskPanel'
$file=Join-Path $folder 'connections.bin'
try {
 if ($Action -eq 'read') {
  if ([IO.File]::Exists($file)) {
   $bytes=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
   [Console]::Write([Text.Encoding]::UTF8.GetString($bytes))
  } else { [Console]::Write('{}') }
 } else {
  $text=[Console]::In.ReadToEnd()
  if ($text.Length -gt 32768) { throw 'size' }
  $null=$text|ConvertFrom-Json
  [IO.Directory]::CreateDirectory($folder)|Out-Null
  $bytes=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($text),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $temp=Join-Path $folder 'connections.tmp'
  [IO.File]::WriteAllBytes($temp,$bytes)
  Move-Item -LiteralPath $temp -Destination $file -Force
  [Console]::Write('{"ok":true}')
 }
} catch { [Console]::Error.Write('secret_store_unavailable');exit 1 }
