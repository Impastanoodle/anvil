# Minimal static file server for local development (no node/python on this machine), plus two APIs: /api/dxf2dwg
# turns DXF text into a DWG with an external converter — the ODA File Converter when installed (ACAD2018, compliant),
# else LibreDWG's dxf2dwg from vendor/get-libredwg.ps1 (R2000, experimental writer). HEAD answers 200 with
# X-Anvil-Converter: oda | libredwg (503 when neither exists); POST with the DXF as the body answers the DWG bytes
# (application/acad, the same header, Content-Disposition attachment) or JSON { error, converter } 400 / 503.
# /api/dwg2dxf is the way back (DWG import): POST the DWG bytes, get the DXF bytes (application/dxf) or the same JSON
# errors, through the ODA File Converter or LibreDWG's dwg2dxf.
# Requests are served several at once (a runspace pool, see the end) and no client may hold one for long: every
# response body is written with a deadline (5 s plus half a second per MB) and the response is aborted when the
# client stops reading; HTTP.sys's own timeouts (idle
# connection, header wait, request body, minimum send rate) are set too where the platform has them.
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8765]
param([int]$Port = 8765)
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $tm = $listener.TimeoutManager
  $tm.IdleConnection = [TimeSpan]::FromSeconds(30)
  $tm.HeaderWait = [TimeSpan]::FromSeconds(15)
  $tm.EntityBody = [TimeSpan]::FromSeconds(30)
  $tm.DrainEntityBody = [TimeSpan]::FromSeconds(10)
  $tm.MinSendBytesPerSecond = 65536
} catch { Write-Host "HttpListener timeouts not available here: $($_.Exception.Message)" }
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
$types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".json"="application/json"; ".wasm"="application/wasm"; ".mjs"="text/javascript; charset=utf-8"; ".png"="image/png"; ".svg"="image/svg+xml"; ".md"="text/plain; charset=utf-8"; ".gz"="application/gzip" }

# ---- DXF <-> DWG converters ------------------------------------------------------------------------------------
# The converter to use, ODA first: @{ name = "oda" | "libredwg"; path = exe } or $null. $tool is LibreDWG's program:
# "dxf2dwg" (Save As DWG, the default) or "dwg2dxf" (DWG import); the ODA File Converter does both. Looked up per
# request, so a converter installed while the server runs is picked up. $env:ANVIL_ODA_CONVERTER / $env:ANVIL_LIBREDWG
# override the default locations (the exe, or for LibreDWG its folder; given one LibreDWG exe, its sibling is used).
function Find-DwgConverter([string]$tool = "dxf2dwg") {
  $oda = $env:ANVIL_ODA_CONVERTER
  if (-not $oda) {
    $hit = Get-ChildItem "C:\Program Files\ODA\ODAFileConverter*\ODAFileConverter.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($hit) { $oda = $hit.FullName }
  }
  if ($oda -and (Test-Path $oda -PathType Leaf)) { return @{ name = "oda"; path = $oda } }
  $exe = $env:ANVIL_LIBREDWG
  if (-not $exe) { $exe = Join-Path $root "vendor\libredwg\$tool.exe" }
  if (Test-Path $exe -PathType Container) { $exe = Join-Path $exe "$tool.exe" }
  elseif ((Test-Path $exe -PathType Leaf) -and ([IO.Path]::GetFileName($exe) -ne "$tool.exe")) { $exe = Join-Path (Split-Path $exe -Parent) "$tool.exe" }
  if (Test-Path $exe -PathType Leaf) { return @{ name = "libredwg"; path = $exe } }
  return $null
}

# Runs a converter (30 s limit) in $work: -> @{ timedOut; exitCode; output = stderr, else stdout }
function Invoke-Converter($conv, [string[]]$argv, [string]$work) {
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $conv.path
  $psi.Arguments = (($argv | ForEach-Object { '"' + $_ + '"' }) -join " ")
  $psi.WorkingDirectory = $work
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $p = [Diagnostics.Process]::Start($psi)
  $stdout = $p.StandardOutput.ReadToEndAsync()
  $stderr = $p.StandardError.ReadToEndAsync()
  if (-not $p.WaitForExit(30000)) {
    try { $p.Kill() } catch { }
    return @{ timedOut = $true; exitCode = -1; output = "" }
  }
  $p.WaitForExit()
  $err = $stderr.Result
  if (-not $err) { $err = $stdout.Result }
  return @{ timedOut = $false; exitCode = $p.ExitCode; output = $err }
}

# The first useful lines of a converter's output: its ERROR lines, else the first lines
function Get-FirstLines([string]$text, [int]$n) {
  $lines = @($text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $errors = @($lines | Where-Object { $_ -match "^ERROR" })
  if ($errors.Count) { $lines = $errors }
  return (@($lines | Select-Object -First $n) -join "`n")
}

# Runs the converter on the DXF text in a fresh temp folder (removed afterwards, 30 s limit).
# Returns @{ bytes = [byte[]] } or @{ error = "..." }.
function Convert-DxfToDwg($conv, [string]$dxf) {
  $work = Join-Path ([IO.Path]::GetTempPath()) ("anvil-dwg-" + [guid]::NewGuid().ToString("N"))
  $inDir = Join-Path $work "in"
  $outDir = Join-Path $work "out"
  New-Item -ItemType Directory -Force $inDir, $outDir | Out-Null
  try {
    # Anvil's DXF ends right after EOF; LibreDWG's reader wants a line end there or reports a truncated file
    if (-not $dxf.EndsWith("`n")) { $dxf += "`r`n" }
    $dxfFile = Join-Path $inDir "input.dxf"
    $dwgFile = Join-Path $outDir "input.dwg"
    [IO.File]::WriteAllText($dxfFile, $dxf, (New-Object Text.UTF8Encoding $false))
    # ODA: <inputFolder> <outputFolder> <version> <type DWG|DXF> <recurse 0|1> <audit 0|1> [filter]; dxf2dwg: -y overwrite, -o output
    if ($conv.name -eq "oda") { $argv = @($inDir, $outDir, "ACAD2018", "DWG", "0", "1", "*.dxf") } else { $argv = @("-y", "-o", $dwgFile, $dxfFile) }
    $run = Invoke-Converter $conv $argv $work
    if ($run.timedOut) { return @{ error = ($conv.name + " timed out after 30 s") } }
    if (-not (Test-Path $dwgFile -PathType Leaf)) {
      $msg = Get-FirstLines $run.output 5
      if (-not $msg) { $msg = $conv.name + " wrote no DWG (exit code " + $run.exitCode + ")" }
      return @{ error = $msg }
    }
    $bytes = [IO.File]::ReadAllBytes($dwgFile)
    if ($bytes.Length -eq 0) { return @{ error = ($conv.name + " wrote an empty DWG") } }
    return @{ bytes = $bytes }
  } finally { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
}

# DWG import: the DWG bytes to DXF bytes (as the converter wrote them; the browser decodes them by $ACADVER) in a
# fresh temp folder (removed afterwards, 30 s limit). Returns @{ bytes = [byte[]] } or @{ error = "..." }.
function Convert-DwgToDxf($conv, [byte[]]$dwg) {
  $work = Join-Path ([IO.Path]::GetTempPath()) ("anvil-dwg-" + [guid]::NewGuid().ToString("N"))
  $inDir = Join-Path $work "in"
  $outDir = Join-Path $work "out"
  New-Item -ItemType Directory -Force $inDir, $outDir | Out-Null
  try {
    $dwgFile = Join-Path $inDir "input.dwg"
    $dxfFile = Join-Path $outDir "input.dxf"
    [IO.File]::WriteAllBytes($dwgFile, $dwg)
    # ODA: <inputFolder> <outputFolder> <version> <type DWG|DXF> <recurse 0|1> <audit 0|1> [filter]; dwg2dxf: -y overwrite, -o output
    if ($conv.name -eq "oda") { $argv = @($inDir, $outDir, "ACAD2018", "DXF", "0", "1", "*.dwg") } else { $argv = @("-y", "-o", $dxfFile, $dwgFile) }
    $run = Invoke-Converter $conv $argv $work
    if ($run.timedOut) { return @{ error = ($conv.name + " timed out after 30 s") } }
    if (-not (Test-Path $dxfFile -PathType Leaf)) {
      $msg = Get-FirstLines $run.output 5
      if (-not $msg) { $msg = $conv.name + " wrote no DXF (exit code " + $run.exitCode + ")" }
      return @{ error = $msg }
    }
    $bytes = [IO.File]::ReadAllBytes($dxfFile)
    if ($bytes.Length -eq 0) { return @{ error = ($conv.name + " wrote an empty DXF") } }
    return @{ bytes = $bytes }
  } finally { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
}

# Writes a response body with a deadline: a client that stops reading (a GET whose body is never drained) would
# otherwise block this single-threaded server forever. On a timeout the response is aborted (the connection reset).
function Write-Body($ctx, [byte[]]$bytes) {
  $ms = 5000 + [int]($bytes.Length / 2000)
  $task = $ctx.Response.OutputStream.WriteAsync($bytes, 0, $bytes.Length)
  $done = $false
  try { $done = $task.Wait($ms) } catch { $done = $false }
  if (-not $done) {
    Write-Host ("write timed out after $ms ms (" + $bytes.Length + " bytes to " + $ctx.Request.RemoteEndPoint + " " + $ctx.Request.Url.AbsolutePath + "): response aborted")
    try { $ctx.Response.Abort() } catch { }
    throw "write timeout"
  }
}

function Send-Json($ctx, [int]$status, $obj) {
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  $bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $obj -Compress))
  $ctx.Response.ContentLength64 = $bytes.Length
  Write-Body $ctx $bytes
}

function Invoke-DxfToDwgApi($ctx) {
  $method = $ctx.Request.HttpMethod
  $conv = Find-DwgConverter
  $ctx.Response.Headers.Add("Cache-Control", "no-store")
  if ($conv) { $ctx.Response.Headers.Add("X-Anvil-Converter", $conv.name) }
  if ($method -eq "HEAD") {
    if ($conv) { $ctx.Response.StatusCode = 200 } else { $ctx.Response.StatusCode = 503 }
    $ctx.Response.ContentLength64 = 0
    return
  }
  if (-not $conv) {
    Send-Json $ctx 503 @{ error = "No DXF to DWG converter on this server"; hint = "Run anvil/vendor/get-libredwg.ps1, or install the free ODA File Converter" }
    return
  }
  if ($method -eq "GET") { Send-Json $ctx 200 @{ converter = $conv.name; path = $conv.path }; return }
  if ($method -ne "POST") { Send-Json $ctx 405 @{ error = "Use HEAD or POST"; converter = $conv.name }; return }
  $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
  $dxf = $reader.ReadToEnd()
  $reader.Close()
  if (-not $dxf -or -not $dxf.Trim()) { Send-Json $ctx 400 @{ error = "Empty request body: POST the DXF text"; converter = $conv.name }; return }
  $t0 = Get-Date
  $r = Convert-DxfToDwg $conv $dxf
  $ms = [int]((Get-Date) - $t0).TotalMilliseconds
  if ($r.error) {
    Write-Host ("dxf2dwg (" + $conv.name + "): failed in $ms ms: " + ($r.error -split "`n")[0])
    Send-Json $ctx 400 @{ error = $r.error; converter = $conv.name }
    return
  }
  Write-Host ("dxf2dwg (" + $conv.name + "): " + $dxf.Length + " chars of DXF -> " + $r.bytes.Length + " bytes of DWG in $ms ms")
  $ctx.Response.StatusCode = 200
  $ctx.Response.ContentType = "application/acad"
  $ctx.Response.Headers.Add("Content-Disposition", 'attachment; filename="output.dwg"')
  $ctx.Response.ContentLength64 = $r.bytes.Length
  Write-Body $ctx $r.bytes
}

# POST api/dwg2dxf with the DWG bytes as the body: the DXF bytes (application/dxf, X-Anvil-Converter) or JSON
# { error, converter } 400 / 413 / 503; HEAD / GET as for api/dxf2dwg. File ▸ Open and Insert DXF / DWG use it.
function Invoke-DwgToDxfApi($ctx) {
  $method = $ctx.Request.HttpMethod
  $conv = Find-DwgConverter "dwg2dxf"
  $ctx.Response.Headers.Add("Cache-Control", "no-store")
  if ($conv) { $ctx.Response.Headers.Add("X-Anvil-Converter", $conv.name) }
  if ($method -eq "HEAD") {
    if ($conv) { $ctx.Response.StatusCode = 200 } else { $ctx.Response.StatusCode = 503 }
    $ctx.Response.ContentLength64 = 0
    return
  }
  if (-not $conv) {
    Send-Json $ctx 503 @{ error = "No DWG to DXF converter on this server"; hint = "Run anvil/vendor/get-libredwg.ps1, or install the free ODA File Converter" }
    return
  }
  if ($method -eq "GET") { Send-Json $ctx 200 @{ converter = $conv.name; path = $conv.path }; return }
  if ($method -ne "POST") { Send-Json $ctx 405 @{ error = "Use HEAD or POST"; converter = $conv.name }; return }
  if ($ctx.Request.ContentLength64 -gt 200MB) { Send-Json $ctx 413 @{ error = "DWG larger than 200 MB"; converter = $conv.name }; return }
  $ms0 = New-Object IO.MemoryStream
  $ctx.Request.InputStream.CopyTo($ms0)
  $dwg = $ms0.ToArray()
  $ms0.Dispose()
  if ($dwg.Length -lt 6) { Send-Json $ctx 400 @{ error = "Empty request body: POST the DWG file"; converter = $conv.name }; return }
  # every DWG starts with its version, "AC1012" .. "AC1032"
  if ($dwg[0] -ne 0x41 -or $dwg[1] -ne 0x43) { Send-Json $ctx 400 @{ error = "Not a DWG file (it does not start with an AutoCAD version tag)"; converter = $conv.name }; return }
  $t0 = Get-Date
  $r = Convert-DwgToDxf $conv $dwg
  $ms = [int]((Get-Date) - $t0).TotalMilliseconds
  if ($r.error) {
    Write-Host ("dwg2dxf (" + $conv.name + "): failed in $ms ms: " + ($r.error -split "`n")[0])
    Send-Json $ctx 400 @{ error = $r.error; converter = $conv.name }
    return
  }
  Write-Host ("dwg2dxf (" + $conv.name + "): " + $dwg.Length + " bytes of DWG -> " + $r.bytes.Length + " bytes of DXF in $ms ms")
  $ctx.Response.StatusCode = 200
  $ctx.Response.ContentType = "application/dxf"
  $ctx.Response.ContentLength64 = $r.bytes.Length
  Write-Body $ctx $r.bytes
}

# ---- requests ----------------------------------------------------------------------------------------------------
# One request: a static file (GET / HEAD) or one of the two APIs. Runs in a pool runspace (below).
function Invoke-Request($ctx) {
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    $head = $ctx.Request.HttpMethod -eq "HEAD"
    if ($path -eq "/api/dxf2dwg") {
      Invoke-DxfToDwgApi $ctx
    } elseif ($path -eq "/api/dwg2dxf") {
      Invoke-DwgToDxfApi $ctx
    } else {
      if ($path -eq "/") { $path = "/index.html" }
      $file = Join-Path $root ($path -replace "/", "\")
      if ((Test-Path $file -PathType Container)) { $file = Join-Path $file "index.html" }
      if (Test-Path $file -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        $ctx.Response.Headers.Add("Cache-Control", "no-store")
        if ($head) {
          # HEAD (ui-occt.js checks that the OpenCascade engine is installed): the size only, no body
          $ctx.Response.ContentLength64 = (Get-Item $file).Length
        } else {
          $bytes = [System.IO.File]::ReadAllBytes($file)
          $ctx.Response.ContentLength64 = $bytes.Length
          Write-Body $ctx $bytes
        }
      } else {
        $ctx.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 " + $path)
        # (rfDR) a HEAD gets the status only: writing a body to it threw, and the 404 went out as a 500
        if ($head) { $ctx.Response.ContentLength64 = 0 } else { $ctx.Response.ContentLength64 = $msg.Length; Write-Body $ctx $msg }
      }
    }
  } catch { try { $ctx.Response.StatusCode = 500 } catch { } }
  # an aborted response (write timeout, client gone) throws here; the server goes on to the next request
  try { $ctx.Response.OutputStream.Close() } catch { }
}

# (rfDR) Requests are served by a pool of runspaces, several at once. The server used to answer one request at a
# time, so one response the client was slow to read (the 50 MB OpenCascade engine while it compiles, a GET whose body
# is never read, a 30 s DWG conversion) held every other request behind it until Write-Body's deadline (35 s for the
# engine): the drawing worker's importScripts waited that long, and in headless test runs the worker failed to start
# (worker onerror) and the views were worked out on the main thread. Measured on serve.ps1 with a client that never
# reads a 60 MB file: six script GETs behind it took 35.1 s before, a few ms now. Without a pool (an old PowerShell)
# it serves inline, one at a time, as before.
$names = "Find-DwgConverter", "Invoke-Converter", "Get-FirstLines", "Convert-DxfToDwg", "Convert-DwgToDxf", "Write-Body", "Send-Json", "Invoke-DxfToDwgApi", "Invoke-DwgToDxfApi", "Invoke-Request"
$pool = $null
try {
  $iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
  foreach ($n in $names) { $iss.Commands.Add((New-Object System.Management.Automation.Runspaces.SessionStateFunctionEntry $n, (Get-Command $n -CommandType Function).Definition)) }
  $iss.Variables.Add((New-Object System.Management.Automation.Runspaces.SessionStateVariableEntry "root", $root, ""))
  $iss.Variables.Add((New-Object System.Management.Automation.Runspaces.SessionStateVariableEntry "types", $types, ""))
  $pool = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspacePool(2, 16, $iss, $Host)
  $pool.Open()
} catch { Write-Host "Serving one request at a time (no runspace pool: $($_.Exception.Message))"; $pool = $null }
$busy = New-Object System.Collections.ArrayList
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  if (-not $pool) { Invoke-Request $ctx; continue }
  # the finished requests' PowerShell objects are disposed of first
  for ($i = $busy.Count - 1; $i -ge 0; $i--) {
    $job = $busy[$i]
    if ($job.handle.IsCompleted) { try { $job.ps.EndInvoke($job.handle) | Out-Null } catch { }; $job.ps.Dispose(); $busy.RemoveAt($i) }
  }
  $ps = [PowerShell]::Create()
  $ps.RunspacePool = $pool
  [void]$ps.AddCommand("Invoke-Request").AddArgument($ctx)
  [void]$busy.Add(@{ ps = $ps; handle = $ps.BeginInvoke() })
}
