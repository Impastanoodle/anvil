# build-occt.ps1 — builds OpenCascade 7.6.3 for Windows (Release, shared DLLs) for the native engine (occt_native.node).
# Only the toolkits Anvil's occt-kernel.js reaches: FoundationClasses, ModelingData, ModelingAlgorithms and the STEP /
# IGES readers and writers of DataExchange (TKXSBase, TKSTEP*, TKIGES). No Visualization, Draw, ApplicationFramework and
# no third-party libraries (FreeType, Tcl/Tk, TBB, FreeImage ...). Needs Visual Studio 2022 Build Tools (C++ workload,
# which brings CMake and Ninja). Everything lands under -Root:
#   <Root>\download\OCCT-V7_6_3.tar.gz   the source archive from github.com/Open-Cascade-SAS/OCCT (tag V7_6_3)
#   <Root>\src                          the unpacked source
#   <Root>\build                        CMake / Ninja build tree
#   <Root>\install                      headers (inc), import libraries (win64\vc14\lib) and DLLs (win64\vc14\bin)
# -Jobs: parallel compile jobs (8 keeps the PC usable). -Step configure|build|install|all.
param(
  [string]$Root = "$env:USERPROFILE\Desktop\Output\Anvil Native\occt-7.6.3",
  [int]$Jobs = 8,
  [string]$Step = 'all'
)
$ErrorActionPreference = 'Stop'
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1
if (-not $vs) { throw 'Visual Studio 2022 Build Tools with the C++ workload are not installed.' }
$vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
$cmakeDir = Join-Path $vs 'Common7\IDE\CommonExtensions\Microsoft\CMake'
$cmake = Join-Path $cmakeDir 'CMake\bin\cmake.exe'
$ninja = Join-Path $cmakeDir 'Ninja\ninja.exe'

$archive = Join-Path $Root 'download\OCCT-V7_6_3.tar.gz'
$src = Join-Path $Root 'src'; $bld = Join-Path $Root 'build'; $inst = Join-Path $Root 'install'
if (-not (Test-Path (Join-Path $src 'CMakeLists.txt'))) {
  if (-not (Test-Path $archive)) {
    New-Item -ItemType Directory -Force (Split-Path $archive) | Out-Null
    curl.exe -L -sS -o $archive https://github.com/Open-Cascade-SAS/OCCT/archive/refs/tags/V7_6_3.tar.gz
  }
  New-Item -ItemType Directory -Force $src | Out-Null
  tar -xzf $archive -C $src --strip-components=1
}
New-Item -ItemType Directory -Force $bld | Out-Null

function InVs([string]$cmd) {
  # run a command inside the x64 MSVC environment
  cmd /c "call `"$vcvars`" >nul && $cmd"
  if ($LASTEXITCODE -ne 0) { throw "failed ($LASTEXITCODE): $cmd" }
}

if ($Step -eq 'all' -or $Step -eq 'configure') {
  $opts = @(
    '-G Ninja', "-DCMAKE_MAKE_PROGRAM=`"$ninja`"", '-DCMAKE_BUILD_TYPE=Release',
    "-DINSTALL_DIR=`"$inst`"", '-DBUILD_LIBRARY_TYPE=Shared',
    '-DBUILD_MODULE_FoundationClasses=ON', '-DBUILD_MODULE_ModelingData=ON', '-DBUILD_MODULE_ModelingAlgorithms=ON',
    '-DBUILD_MODULE_Visualization=OFF', '-DBUILD_MODULE_ApplicationFramework=OFF', '-DBUILD_MODULE_DataExchange=OFF',
    '-DBUILD_MODULE_Draw=OFF', '-DBUILD_ADDITIONAL_TOOLKITS="TKXSBase;TKSTEPBase;TKSTEPAttr;TKSTEP209;TKSTEP;TKIGES"',
    '-DUSE_FREETYPE=OFF', '-DUSE_TK=OFF', '-DUSE_TBB=OFF', '-DUSE_FREEIMAGE=OFF', '-DUSE_OPENGL=OFF', '-DUSE_GLES2=OFF',
    '-DUSE_D3D=OFF', '-DUSE_VTK=OFF', '-DUSE_RAPIDJSON=OFF', '-DUSE_DRACO=OFF', '-DUSE_FFMPEG=OFF', '-DUSE_OPENVR=OFF',
    # keep OpenCascade's own range / not-done checks in Release: a bad call throws a Standard_Failure (a JS Error)
    # instead of reading past an array, which in a native process would crash Anvil
    '-DBUILD_RELEASE_DISABLE_EXCEPTIONS=OFF',
    '-DBUILD_DOC_Overview=OFF', '-DBUILD_SAMPLES_QT=OFF', '-DBUILD_Inspector=OFF', '-DBUILD_ENABLE_FPE_SIGNAL_HANDLER=OFF'
  ) -join ' '
  InVs "`"$cmake`" -S `"$src`" -B `"$bld`" $opts"
}
if ($Step -eq 'all' -or $Step -eq 'build') { InVs "`"$cmake`" --build `"$bld`" --parallel $Jobs" }
if ($Step -eq 'all' -or $Step -eq 'install') { InVs "`"$cmake`" --install `"$bld`"" }
Write-Host "OpenCascade 7.6.3 installed in $inst"
