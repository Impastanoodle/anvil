# Minimal static file server for local development (no node/python on this machine).
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8765]
param([int]$Port = 8765)
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
$types = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".css"="text/css; charset=utf-8"; ".json"="application/json"; ".wasm"="application/wasm"; ".mjs"="text/javascript; charset=utf-8"; ".png"="image/png"; ".svg"="image/svg+xml"; ".md"="text/plain; charset=utf-8"; ".gz"="application/gzip" }
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
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
  } catch { $ctx.Response.StatusCode = 500 }
  $ctx.Response.OutputStream.Close()
}
