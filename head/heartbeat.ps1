# Keeps HEAD.lock's heartbeat fresh while the head runs a round (CLAUDE.md step 1.1). Start hidden:
#   Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','<repo>\head\heartbeat.ps1'
# It stops by itself once HEAD.lock is deleted.
$p = Join-Path (Split-Path $PSScriptRoot -Parent) 'HEAD.lock'
while ($true) {
  Start-Sleep -Seconds 1200
  if (-not (Test-Path $p)) { break }
  $j = Get-Content $p -Raw | ConvertFrom-Json
  $j.heartbeat = (Get-Date).ToString('o')
  $j | ConvertTo-Json | Set-Content -Path $p -Encoding utf8
}
