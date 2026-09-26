# get-occt.ps1 — fetch opencascade.js 2.0.0-beta.b5ff984 (OpenCascade 7.6 in WebAssembly, LGPL-2.1) into
# experiments/occt/v2 for occt-lab.html. The package is ~60 MB, so it is not committed (see .gitignore).
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File anvil\experiments\get-occt.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $here 'occt\v2'
$url = 'https://registry.npmjs.org/opencascade.js/-/opencascade.js-2.0.0-beta.b5ff984.tgz'
$wasmSha = '4b6a74398987eb3ca6bedc7d1b29d6a5af74d0613a9f3bf013a52d7d5d1b5937'
New-Item -ItemType Directory -Force $dest | Out-Null
$tgz = Join-Path $dest 'occt.tgz'
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $tgz -UseBasicParsing
tar -xzf $tgz -C $dest
Remove-Item $tgz
$wasm = Join-Path $dest 'package\dist\opencascade.full.wasm'
$sha = (Get-FileHash -Algorithm SHA256 $wasm).Hash.ToLower()
if ($sha -ne $wasmSha) { throw "opencascade.full.wasm checksum mismatch: $sha" }
Write-Host "OK: $wasm ($([math]::Round((Get-Item $wasm).Length / 1MB, 1)) MB, sha256 verified)"
