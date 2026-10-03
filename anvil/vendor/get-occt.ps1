# get-occt.ps1 — fetch opencascade.js 2.0.0-beta.b5ff984 (OpenCascade 7.6 in WebAssembly, LGPL-2.1, licence text in
# vendor/occt/LICENSE-opencascade.js.txt) into vendor/occt. Needed only for the OpenCascade kernel switch
# (Tools > OpenCascade kernel) and experiments/occt-lab.html; the ~60 MB of files are not committed (.gitignore).
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File anvil\vendor\get-occt.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $here 'occt'
$url = 'https://registry.npmjs.org/opencascade.js/-/opencascade.js-2.0.0-beta.b5ff984.tgz'
$wasmSha = '4b6a74398987eb3ca6bedc7d1b29d6a5af74d0613a9f3bf013a52d7d5d1b5937'
$jsSha = '8016d504d881f5f3b9f9431524dc8dadd03088588b828e2d18e096bc5fedd5ba'   # both also pinned in occt-worker.js, which refuses anything else
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('occt-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $tmp, $dest | Out-Null
try {
  $tgz = Join-Path $tmp 'occt.tgz'
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $tgz -UseBasicParsing
  tar -xzf $tgz -C $tmp
  foreach ($f in 'opencascade.full.js', 'opencascade.full.wasm', 'opencascade.full.d.ts') { Copy-Item (Join-Path $tmp "package\dist\$f") $dest -Force }
  Copy-Item (Join-Path $tmp 'package\LICENSE') (Join-Path $dest 'LICENSE-opencascade.js.txt') -Force
} finally { Remove-Item -Recurse -Force $tmp }
$wasm = Join-Path $dest 'opencascade.full.wasm'
$sha = (Get-FileHash -Algorithm SHA256 $wasm).Hash.ToLower()
if ($sha -ne $wasmSha) { throw "opencascade.full.wasm checksum mismatch: $sha" }
$jsHash = (Get-FileHash -Algorithm SHA256 (Join-Path $dest 'opencascade.full.js')).Hash.ToLower()
if ($jsHash -ne $jsSha) { throw "opencascade.full.js checksum mismatch: $jsHash" }
Write-Host "OK: $wasm ($([math]::Round((Get-Item $wasm).Length / 1MB, 1)) MB, sha256 verified)"
