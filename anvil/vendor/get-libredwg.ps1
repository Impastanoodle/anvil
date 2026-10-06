# get-libredwg.ps1 — fetch GNU LibreDWG 0.14 (GPL-3.0, licence text in vendor/libredwg/COPYING) for Windows x64 into
# vendor/libredwg: dxf2dwg.exe (the DXF to DWG fallback behind serve.ps1's /api/dxf2dwg and the Node runner's --dwg
# options when the ODA File Converter is not installed), dwg2dxf.exe and dwgread.exe (to read a DWG back), the four
# DLLs they need and README.txt. The official release zip is checked against a pinned SHA-256 before anything is
# extracted; the ~35 MB of files are not committed (.gitignore). LibreDWG's DWG writer is experimental: keep DXF for
# CAM, and prefer the free ODA File Converter (opendesign.com) for DWG files other software must open.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File anvil\vendor\get-libredwg.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $here 'libredwg'
$url = 'https://github.com/LibreDWG/libredwg/releases/download/0.14/libredwg-0.14-win64.zip'
$zipSha = '1ad7e15344d20b3426c3435b078d82fb84b35062815946b2cca9c5fc9810fea8'
$copyingUrl = 'https://raw.githubusercontent.com/LibreDWG/libredwg/0.14/COPYING'   # the zip ships README.txt but not the GPL text
$copyingSha = '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903'
$files = 'dxf2dwg.exe', 'dwg2dxf.exe', 'dwgread.exe', 'libredwg-0.dll', 'libiconv-2.dll', 'libpcre2-8-0.dll', 'libpcre2-16-0.dll', 'README.txt'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('libredwg-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $tmp, $dest | Out-Null
try {
  $zip = Join-Path $tmp 'libredwg.zip'
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  $sha = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
  if ($sha -ne $zipSha) { throw "libredwg-0.14-win64.zip checksum mismatch: $sha (expected $zipSha); nothing was extracted" }
  Write-Host "sha256 verified: $sha"
  $copying = Join-Path $tmp 'COPYING'
  Invoke-WebRequest -Uri $copyingUrl -OutFile $copying -UseBasicParsing
  $sha2 = (Get-FileHash -Algorithm SHA256 $copying).Hash.ToLower()
  if ($sha2 -ne $copyingSha) { throw "COPYING checksum mismatch: $sha2 (expected $copyingSha)" }
  $unpacked = Join-Path $tmp 'unpacked'
  New-Item -ItemType Directory -Force $unpacked | Out-Null
  tar -xf $zip -C $unpacked
  foreach ($f in $files) { Copy-Item (Join-Path $unpacked $f) $dest -Force }
  Copy-Item $copying (Join-Path $dest 'COPYING') -Force
} finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
$exe = Join-Path $dest 'dxf2dwg.exe'
$version = (& $exe --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { throw "$exe --version failed: $version" }
$mb = [math]::Round(((Get-ChildItem $dest | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "OK: $version in $dest ($mb MB, sha256 verified)"
