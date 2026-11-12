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

## Problem reports

When Anvil freezes, crashes, or hits an error, it saves a report you can hand to Claude to find and fix the cause.
Nothing is sent anywhere: the report stays on this PC.

- **Anvil stopped responding.** If the window does not answer for 5 seconds, Anvil (its main process, which keeps
  running) looks at where the window is stuck every 5 seconds while the freeze lasts and writes the report at once. When
  the window answers again a bar under the ribbon says *"Anvil stopped responding for 18 s while Rebuild was running. A
  report was saved."* If you close or end Anvil while it is frozen, the next start says *"Anvil did not respond last time
  and was closed: a report was saved."*
- **Anvil crashed.** If the window's process crashes, Anvil saves a report and asks to reload; Anvil then offers the work
  AutoRecover kept.
- **An error Anvil carried on from**: no box, only **Report saved** in the status bar (click it for the same bar).
- **Help ▸ Report a Problem…**: write what went wrong (something wrong that did not freeze or crash), tick Include the
  model if you want, **Save report**.

The bar's buttons: **Copy for Claude** copies a short message (what happened, the report's folder, "read report.md in
that folder"): paste it into a Claude session. **Open folder** opens it in Explorer. **View report** shows it.
**Include the model** (off by default) adds the open part or assembly to the report so Claude can open it; it stays on
this PC. **Dismiss** closes the bar.

Where: `%APPDATA%\Anvil\reports` (`C:\Users\<you>\AppData\Roaming\Anvil\reports`), one folder per report,
named `<yyyy-mm-dd_hh-mm-ss>_<kind>` (`not-responding`, `crash`, `error`, `manual`); the newest 30 are kept. Tools ▸
Options ▸ *Reports* shows the folder, opens it, and has the switch for the not-responding watch.

In each folder:

| File | What |
|---|---|
| `report.md` | for Claude and for you: what happened in one sentence, when, the Anvil version, how long the freeze lasted; *Where it was stuck* (the call stacks sampled during the freeze, and whether it stayed in one place); the operation in progress; the last 200 steps (commands, tools, PropertyManagers opened / OK / cancelled, files opened and saved by kind and size, rebuilds with their time, profile and theme switches); the last 100 console errors and warnings; the state (profile, theme, engine, document type, features by type, bodies, faces, triangles, sketch entities, drawing views, window, GPU, memory, Windows version) |
| `report.json` | the same, structured (`format: "anvil-problem-report"`, `v: 1`) |
| `screenshot.png` | the window (after a freeze: when it answered again) |
| `model.anvil.json` | only when Include the model was ticked |

Privacy: file names, paths, part and document names, custom properties, note text and geometry are never written
into `report.md` / `report.json` (kinds, sizes and counts instead; the open document's names show as `<name>`). The
model goes in only by your choice.

For whoever fixes it (Claude): start from *Where it was stuck* and the last breadcrumbs. To reproduce, run Anvil from the
repository (`npm start` here, or `anvil\serve.ps1`), open `model.anvil.json` if it is there (File ▸ Open, or
`anvil.load(json)` from the console), and replay the breadcrumbs. How it works: `anvil/ui-reports.js` (the page: crumbs,
the bar, the report format, which `main.js` also loads) and `main.js` *problem reports* (heartbeat, the stack samples
through the DevTools protocol, crashes, the folder, `.session.json` for a run that ended frozen). The watch keeps a
DevTools protocol session with the debugger enabled on the window (a stuck window cannot be attached to later); turning
the not-responding switch off releases it. With DevTools open (F12) the stacks may be missing; the report says so.
Check: `node check.js reports --dev --exe <electron.exe>` (a 12 s busy loop named in the stacks, a crash, a run killed
while frozen, 30 kept; the main process's own uncaught exception and unhandled rejection, made on purpose with the test
setting `ANVIL_TEST_MAIN_ERRORS=1`; a crashed GPU process).

## Where files go

| What | Where |
|---|---|
| The program | `%LOCALAPPDATA%\Programs\Anvil` |
| Settings, recovered work, theme, window size | `%APPDATA%\Anvil` (kept through updates and uninstall) |
| Problem reports (newest 30) | `%APPDATA%\Anvil\reports` |
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
for; `node check.js occt-start --compare`: how long the WebAssembly OpenCascade engine takes to start, cold and
warm, and the old start against the new one; `node check.js reports`: problem reports (see *Problem reports*); `node check.js recent`: Recent Documents across a restart, a reopened file saved in place, a deleted one
missing, a STEP's new part saved beside it; `node check.js drop`: a part file dropped on the window keeps its real path, the title names it, Ctrl+S writes
back to it and nothing else in its folder becomes writable (a File backed by the file on disk through DevTools'
`DOM.setFileInputFiles`, then a DragEvent; a drag from Explorer itself cannot be scripted); `node check.js update-restart`: Restart to update end to end with a stand-in installer, a .cmd in a temporary
folder, never a real one: the unsaved-work question, the silent installer arguments, Anvil started again, a failed
install starting the old Anvil, and update.log; add `--dev --exe <electron.exe>` to run either on the source files) (`node check.js engines` only the OpenCascade part: Windows engine against the browser copy, Cancel, the
fall-backs and a timing table); `npm run icon` redraws the icon.
