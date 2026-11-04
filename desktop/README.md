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
**Restart to update** closes Anvil (it asks first if something is not saved), installs the new version quietly and
opens it again. **Later** leaves it for the next start. **Help ▸ Check for Updates** checks at once (press Alt to show
the small menu bar).

Anvil only installs a file whose fingerprint matches `latest.json` in that folder, so a half-copied file is never used.

To look for updates in another folder (for example a shared folder for several PCs), use **Help ▸ Open Update Settings**
and change `updateFolder` in `settings.json`, then restart Anvil:

```json
{ "updateFolder": "C:\\Users\\Lucas\\Desktop\\Output\\Anvil Releases", "checkEveryHours": 2 }
```

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
`powershell -ExecutionPolicy Bypass -File anvil\vendor\get-occt.ps1`); without it the build stops and says so.
LibreDWG (`anvil\vendor\get-libredwg.ps1`) is included when it is there.

Other commands: `npm start` runs Anvil from the source files; `npm run pack` builds `dist\win-unpacked\Anvil.exe`
without an installer; `node check.js app`, `node check.js tests`, `node check.js update --folder <folder>` test a build
by script; `npm run icon` redraws the icon.
