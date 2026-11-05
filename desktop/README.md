# Anvil for Windows

Anvil as a normal Windows program: its own window, Start menu and desktop shortcuts, and it works with no internet.

## Install

1. Open `Desktop\Output\Anvil Releases` and double-click **Anvil Setup 0.1.0.exe** (the newest number).
2. Windows may show a blue box, "Windows protected your PC". The installer is not signed with a paid certificate, so
   Windows does not know it yet. Click **More info**, then **Run anyway**. This happens once per new installer.
3. It installs for you only (no administrator question) and opens Anvil. The shortcuts are called **Anvil**.

To remove it: Windows Settings ▸ Apps ▸ Installed apps ▸ Anvil ▸ Uninstall. Your settings stay unless you delete the
folder below.

## Updates

When a new version is put in `Desktop\Output\Anvil Releases`, Anvil notices it (when it starts, and every two hours)
and shows a small box at the bottom right: **Anvil 0.1.1 is ready — Restart to update / Later**.
**Restart to update** closes Anvil (it asks first if something is not saved; **Cancel** keeps Anvil open and the box
stays), installs the new version quietly and opens it again. If the install fails, the old Anvil opens again and says
the update was not installed; nothing you saved is touched. Every step (button pressed, installer copied and checked,
Anvil closed, installer run and its result, Anvil started again) is written to `%APPDATA%\Anvil\update.log`, so a
problem with an update can be followed afterwards. **Later** leaves it for the next start. **Help ▸ Check for Updates** checks at once (press Alt to show
the small menu bar).

Anvil only installs a file whose fingerprint matches `latest.json` in that folder, so a half-copied file is never used.

To look for updates in another folder (for example a shared folder for several PCs), use **Help ▸ Open Update Settings**
and change `updateFolder` in `settings.json`, then restart Anvil:

```json
{ "updateFolder": "C:\\Users\\Lucas\\Desktop\\Output\\Anvil Releases", "checkEveryHours": 2 }
```

## OpenCascade: which engine Anvil uses

OpenCascade is the geometry engine that builds the exact solids (true fillets, holes, bends, STEP). The Windows app
has two copies of it:

- **OpenCascade for Windows** (OpenCascade 7.6.3 built as normal Windows DLLs). This is the one it uses. It runs in a
  separate background process, uses all the PC's cores for Booleans and meshing, and builds a part several times faster
  than the browser copy. Cancel, or opening another part, ends that process at once and a fresh one starts.
- **The browser copy** (WebAssembly, the same engine the web version uses). It is only used if the Windows one cannot
  start (a file missing or damaged, or it stopped). Anvil then switches by itself for the rest of the session; nothing
  is lost and the part is built again.

How to tell which one is running:

- **Help ▸ About Anvil** (press Alt to show the menu bar) has a line *OpenCascade: 7.6.3 for Windows (native, loaded
  in … ms)*, or *OpenCascade: WebAssembly engine (…)* with the reason.
- Hover over the green **OpenCascade ✓** in the status bar: the tip ends in *[engine: OpenCascade 7.6.3 for Windows]*.
  Without that ending it is the browser copy.

To use the browser copy on purpose (for example to compare), add `"occtEngine": "wasm"` to `settings.json` (**Help ▸
Open Update Settings**) and restart Anvil; remove it to go back.

## Opening and saving files

The Windows app uses Windows' own Open and Save boxes, as SolidWorks does:

- **File ▸ Open** (Ctrl+O) shows the Open box with Anvil's file types (Anvil parts, assemblies and scripts, drawings,
  STEP, IGES, STL, OBJ, 3MF, DXF, DWG). An Anvil part or assembly remembers its file, and the window title shows its
  name. A STEP, DXF … opens as a new part: the first Save asks where to put it, starting in the STEP's folder with its
  name (bracket.step -> bracket.anvil.json), as SolidWorks does.
- **Save** (Ctrl+S) writes straight to the document's file, with no box. A new document asks once, in the Save box.
  A drawing opened from a `.drawing` file (or saved with File ▸ Save Drawing As) is written back to that file; if its
  part changed too, the part is saved as well.
- **Recent documents**: the File menu lists the last 10 documents opened or saved (parts, assemblies, drawings,
  imported STEP / DXF …), newest first, with their folders; **File ▸ Browse Recent Documents…** shows the same list.
  A click opens it (Save changes? first). A file that was moved or deleted is greyed; the dialog offers to remove it.
  The list is `recent.json` in the settings folder (paths only); a file reopened from it can be saved in place again.
- The window title is the document's file name, with `*` while there are unsaved changes (a drawing: its name and
  sheet).
- **Save As** and the exports (Export STEP, DXF / DWG, flat pattern, STL, OBJ, PDF …) show the Save box with the right
  name and type, in the last folder used.
- If a file cannot be written (read-only, open in another program, a network folder that is gone) Anvil says why and
  your work stays open and unsaved; the old file is left as it was.
- Parts saved inside Anvil before this version are still in the Task Pane's *Saved in this browser* list; open one
  there and press Ctrl+S to give it a file. After Anvil is closed, the Recent Documents list is how a file is found
  again.

## Where files go

| What | Where |
|---|---|
| The program | `%LOCALAPPDATA%\Programs\Anvil` |
| Settings, recovered work, theme, window size | `%APPDATA%\Anvil` (kept through updates and uninstall) |
| Parts, DXF, DWG, STEP, PDF you save | wherever you choose in the Save As box (it remembers the last folder) |
| New installers | `Desktop\Output\Anvil Releases` (the newest 3 are kept) |

DWG save and open use the LibreDWG converter that comes with the installer, or the free ODA File Converter when it is
installed (it is used first).

## Making a new release (for whoever builds Anvil)

In a terminal in this `desktop` folder:

```
npm install                      (once)
npm run release                  next patch version: 0.1.0 -> 0.1.1
npm run release -- --minor       next minor version: 0.1.4 -> 0.2.0
npm run release -- --notes "Bend table fix"     the text shown in the update box
```

The build needs the OpenCascade engine in `anvil\vendor\occt` (fetch it once with
`powershell -ExecutionPolicy Bypass -File anvil\vendor\get-occt.ps1`) and OpenCascade for Windows, the addon folder
`Desktop\Output\Anvil Native\addon` (built by `desktop\native`, see its README; `ANVIL_OCCT_NATIVE` names another
folder); without either the build stops and says so. The addon goes in the program's `resources\occt-native` folder,
outside the app archive, and `occt-host.js` (the process that runs it) next to the archive. LibreDWG
(`anvil\vendor\get-libredwg.ps1`) is included when it is there.

Other commands: `npm start` runs Anvil from the source files; `npm run pack` builds `dist\win-unpacked\Anvil.exe`
without an installer; `node check.js app`, `node check.js tests`, `node check.js update --folder <folder>` test a build
by script (`node check.js files`: Open, Ctrl+S in place, Save As, exports, a read-only file, with the boxes stood in
for; `node check.js recent`: Recent Documents across a restart, a reopened file saved in place, a deleted one
missing, a STEP's new part saved beside it; `node check.js drop`: a part file dropped on the window keeps its real path, the title names it, Ctrl+S writes
back to it and nothing else in its folder becomes writable (a File backed by the file on disk through DevTools'
`DOM.setFileInputFiles`, then a DragEvent; a drag from Explorer itself cannot be scripted); `node check.js update-restart`: Restart to update end to end with a stand-in installer, a .cmd in a temporary
folder, never a real one: the unsaved-work question, the silent installer arguments, Anvil started again, a failed
install starting the old Anvil, and update.log; add `--dev --exe <electron.exe>` to run either on the source files) (`node check.js engines` only the OpenCascade part: Windows engine against the browser copy, Cancel, the
fall-backs and a timing table); `npm run icon` redraws the icon.
