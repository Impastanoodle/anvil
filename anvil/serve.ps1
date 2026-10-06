# Minimal static file server for local development (no node/python on this machine), plus one API: /api/dxf2dwg
# turns DXF text into a DWG with an external converter — the ODA File Converter when installed (ACAD2018, compliant),
# else LibreDWG's dxf2dwg from vendor/get-libredwg.ps1 (R2000, experimental writer). HEAD answers 200 with
# X-Anvil-Converter: oda | libredwg (503 when neither exists); POST with the DXF as the body answers the DWG bytes
# (application/acad, the same header, Content-Disposition attachment) or JSON { error, converter } 400 / 503.
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8765]
param([int]$Port = 8765)
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
$types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".json"="application/json"; ".wasm"="application/wasm"; ".mjs"="text/javascript; charset=utf-8"; ".png"="image/png"; ".svg"="image/svg+xml"; ".md"="text/plain; charset=utf-8"; ".gz"="application/gzip" }

# ---- DXF to DWG converter --------------------------------------------------------------------------------------
# The converter to use, ODA first: @{ name = "oda" | "libredwg"; path = exe } or $null. Looked up per request, so a
# converter installed while the server runs is picked up. $env:ANVIL_ODA_CONVERTER / $env:ANVIL_LIBREDWG override
# the default locations (the exe, or for LibreDWG its folder).
function Find-DwgConverter {
  $oda = $env:ANVIL_ODA_CONVERTER
  if (-not $oda) {
    $hit = Get-ChildItem "C:\Program Files\ODA\ODAFileConverter*\ODAFileConverter.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($hit) { $oda = $hit.FullName }
  }
  if ($oda -and (Test-Path $oda -PathType Leaf)) { return @{ name = "oda"; path = $oda } }
  $exe = $env:ANVIL_LIBREDWG
  if (-not $exe) { $exe = Join-Path $root "vendor\libredwg\dxf2dwg.exe" }
  if (Test-Path $exe -PathType Container) { $exe = Join-Path $exe "dxf2dwg.exe" }
  if (Test-Path $exe -PathType Leaf) { return @{ name = "libredwg"; path = $exe } }
  return $null
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
      return @{ error = ($conv.name + " timed out after 30 s") }
    }
    $p.WaitForExit()
    $err = $stderr.Result
    if (-not $err) { $err = $stdout.Result }
    if (-not (Test-Path $dwgFile -PathType Leaf)) {
      $msg = Get-FirstLines $err 5
      if (-not $msg) { $msg = $conv.name + " wrote no DWG (exit code " + $p.ExitCode + ")" }
      return @{ error = $msg }
    }
    $bytes = [IO.File]::ReadAllBytes($dwgFile)
    if ($bytes.Length -eq 0) { return @{ error = ($conv.name + " wrote an empty DWG") } }
    return @{ bytes = $bytes }
  } finally { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
}

function Send-Json($ctx, [int]$status, $obj) {
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  $bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $obj -Compress))
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
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
  $ctx.Response.OutputStream.Write($r.bytes, 0, $r.bytes.Length)
}

# ---- requests ----------------------------------------------------------------------------------------------------
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq "/api/dxf2dwg") {
      Invoke-DxfToDwgApi $ctx
    } else {
      if ($path -eq "/") { $path = "/index.html" }
      $file = Join-Path $root ($path -replace "/", "\")
      if ((Test-Path $file -PathType Container)) { $file = Join-Path $file "index.html" }
      if (Test-Path $file -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
        $ctx.Response.Headers.Add("Cache-Control", "no-store")
        if ($ctx.Request.HttpMethod -eq "HEAD") {
          # HEAD (ui-occt.js checks that the OpenCascade engine is installed): the size only, no body
          $ctx.Response.ContentLength64 = (Get-Item $file).Length
        } else {
          $bytes = [System.IO.File]::ReadAllBytes($file)
          $ctx.Response.ContentLength64 = $bytes.Length
          $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      } else {
        $ctx.Response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 " + $path)
        $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      }
    }
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.OutputStream.Close()
}
