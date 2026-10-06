# launch-anvil.ps1 — open Anvil like a desktop app: starts the local server (serve.ps1, hidden) if it is not already
# running on port 8812, then opens http://localhost:8812/ in its own window (Edge or Chrome app mode; the default
# browser otherwise). The Desktop shortcut "Anvil" runs this. The server keeps running in the background; it uses
# almost nothing and the next launch reuses it.
# Bring the clone up to date first (fast-forward only, 15 s cap) so the window always shows the latest main;
# offline or on a dirty tree it just carries on with what is on disk. Skip with -NoPull.
param([switch]$NoPull)
$repo = Split-Path $PSScriptRoot -Parent
if (-not $NoPull -and (Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $repo '.git'))) {
  $pull = Start-Process git -ArgumentList '-C', "`"$repo`"", 'pull', '--ff-only', '--quiet', 'origin', 'main' -WindowStyle Hidden -PassThru
  if (-not $pull.WaitForExit(15000)) { try { $pull.Kill() } catch { } }
}
$port = 8812
$url = "http://localhost:$port/"
function Test-Up { try { (Invoke-WebRequest "$url" -UseBasicParsing -Method Head -TimeoutSec 2).StatusCode -eq 200 } catch { $false } }
if (-not (Test-Up)) {
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'serve.ps1'), '-Port', $port
  for ($i = 0; $i -lt 40 -and -not (Test-Up); $i++) { Start-Sleep -Milliseconds 250 }
}
$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path $_) }
if ($browsers) { Start-Process $browsers[0] -ArgumentList "--app=$url", '--window-size=1600,1000' }
else { Start-Process $url }
