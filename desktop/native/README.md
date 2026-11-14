# Native OpenCascade engine (Windows)

Anvil's OpenCascade code (`anvil/occt-kernel.js`) talks to an object called `oc`. In the browser `oc` is
opencascade.js 2.0.0-beta (OpenCascade 7.6 compiled to WebAssembly). This folder builds the same OpenCascade version,
7.6.3, as ordinary Windows DLLs and puts a Node-API addon in front of it that gives exactly the same `oc` for every
call Anvil makes, so `occt-kernel.js` runs on it unchanged. Node-API is ABI-stable: the one `occt_native.node` loads
in Node 24 and in Electron 44 (the app).

| File | What it is |
|---|---|
| `build-occt.ps1` | downloads (once) and builds OpenCascade 7.6.3: Release, shared DLLs, only modelling + STEP / IGES, no third-party libraries |
| `record-surface.js` | records every OpenCascade call Anvil makes while it runs on the WebAssembly engine |
| `api-surface.json` | that record (`recorded`) and, written by `gen.js`, the resolved list with signatures (`surface`) |
| `gen.js` | writes `src/generated/*` (the C++ bindings) from `api-surface.json` + `anvil/vendor/occt/opencascade.full.d.ts` |
| `src/runtime.h`, `src/runtime.cc`, `src/addon.cc` | hand-written core: objects, argument / result conversion, errors, `setParallel` |
| `lib/index.js` | shapes the addon into `oc` (classes, overloads, enums, `Handle_X`, `delete()`, `oc.FS`) |
| `binding.gyp`, `package.json` | node-gyp build of `occt_native.node` (node-addon-api 8.9.2) |
| `collect.js` | copies the addon, `index.js` and the 23 OpenCascade DLLs into one folder |
| `bench.js` | times both engines on every example and an 1800-hole panel, and checks they give the same parts |
| `electron-check.js` | loads the addon inside Electron and builds a part |

## Rebuild from scratch

Needs Visual Studio 2022 Build Tools with the C++ workload (brings CMake, Ninja and the Windows SDK), Node 24, Python 3
(node-gyp uses it) and the WebAssembly engine fetched once (`anvil/vendor/get-occt.ps1`; the typings and the recorder
need it). Everything built goes to `Desktop\Output\Anvil Native`.

```powershell
cd desktop\native
npm install                       # node-addon-api 8.9.2 (does not build anything)
npm run occt                      # OpenCascade 7.6.3: ~48 MB download, ~18 min with 8 jobs -> Output\Anvil Native\occt-7.6.3\install
npm run gen                       # src/generated from api-surface.json
npm run build                     # occt_native.node (node-gyp; fetches the Node headers the first time)
npm run collect                   # -> Output\Anvil Native\addon (index.js + occt_native.node + DLLs, ~40 MB)
cd ..\..
node anvil/headless/anvil.js example --all --occt --native
node anvil/headless/occt-tests.js --native
```

On a PC whose Desktop is kept in OneDrive (the home PC, 2026-11-13): build OpenCascade outside OneDrive
(`build-occt.ps1 -Root "$env:LOCALAPPDATA\AnvilBuild\occt-7.6.3"`) and set `OCCT_DIR` to its `install` folder for
`npm run build` and `npm run collect`; `Desktop\Output` itself is found by `desktop/output-dir.js`. If node-gyp says
"Could not find any Visual Studio installation", run it from Visual Studio's environment:
`cmd /c "call <BuildTools>\VC\Auxiliary\Build\vcvars64.bat && node ..\node_modules\node-gyp\bin\node-gyp.js rebuild --jobs 8"`.
After a build, `node anvil/headless/occt-tests.js --native` must give the same count as without `--native`: a lower
count means `api-surface.json` is behind occt-kernel.js (record again, below).

`OCCT_DIR` points the build and `collect.js` at another OpenCascade install; `--native <dir>` (or
`ANVIL_OCCT_NATIVE`) at another addon folder.

## When occt-kernel.js starts calling something new

The addon only has what was recorded. A new call fails with `oc.X is not a constructor` / `... is not a function`.
Record again, regenerate, rebuild (recording merges into the file, so run every suite):

```powershell
$env:ANVIL_OCCT_RECORD = "desktop\native\api-surface.json"
node anvil/headless/anvil.js example --all --occt
node anvil/headless/occt-tests.js
Remove-Item Env:ANVIL_OCCT_RECORD
cd desktop\native; npm run gen; npm run build; npm run collect
```

`gen.js` prints `problems` when a type in the typings is not what C++ has; the `ALIAS` table at its top maps those
(opencascade.js's typings name some types by the wrong typedef, e.g. `Graphic3d_ZLayerId` for an int).

## How it behaves (same as opencascade.js, except where noted)

- `new oc.gp_Pnt_3(1, 2, 3)`: `_N` constructor and method overloads are the typings' signatures; C++ picks the same
  overload from the exact argument types. Statics: `oc.BRepGProp.VolumeProperties_1(...)`.
- Enum members are objects with `.value`, one per member, so `shape.ShapeType() === oc.TopAbs_ShapeEnum.TopAbs_FACE` works.
- Results returned by value or by reference are new objects owning a copy; `Handle_X.get()` returns the most-derived class.
- `delete()` frees an object; objects never deleted are freed when JS collects them. Geometry (`Geom_*`, anything
  reference-counted) is kept alive by OpenCascade's own count, so deleting it while a `Handle` still holds it is safe.
- Numbers convert like embind: `undefined` is NaN for a double and 0 for an int.
- An OpenCascade exception becomes a JS `Error` whose message is its class and message
  (`StdFail_NotDone: BRep_API: command not done`); the WebAssembly engine throws a bare number instead.
  Access violations inside OpenCascade become errors too, instead of closing the program.
- `oc.FS.writeFile / readFile / unlink` work on a temporary folder; STEP / IGES readers and writers see those files.
- OpenCascade's messages are silent (as in headless/occt.js); `ANVIL_OCCT_LOG=1` prints them on stderr.
- Extra: `oc.setParallel(true)` (or `ANVIL_OCCT_PARALLEL=1`) uses OpenCascade's own threads for Booleans and meshing.
