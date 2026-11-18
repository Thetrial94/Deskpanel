param([Parameter(Mandatory=$true)][string]$MeetingUrl)
$ErrorActionPreference = 'Stop'
try { Start-Process -FilePath $MeetingUrl -ErrorAction Stop | Out-Null; exit 0 }
catch { exit 1 }
