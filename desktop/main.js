// main.js — Anvil as a Windows program (Electron). Runs the same static files as anvil/serve.ps1, offline, in its own
// window:
// - app://anvil/ serves the anvil/ folder (bundled in resources\anvil by the installer; ../anvil when run from the
//   repo). The scheme is privileged (standard, secure, fetch, CORS, streams), so module workers, the 48 MB
//   OpenCascade engine, IndexedDB and localStorage work, and the origin is the same in every version: settings, the
//   recovered work and the engine store survive an update (they live in %APPDATA%\Anvil).
// - app://anvil/api/dxf2dwg and api/dwg2dxf: the DWG converters of serve.ps1 (converters.js).
// - downloads (parts, DXF, DWG, STEP, PDF, SVG) open the Windows Save As dialog with the suggested name; file inputs
//   open the normal Open dialog (Chromium's own).
// - links to the web open in the user's browser; a minimal menu (Alt shows it); one instance; window size and place
//   remembered; updates from a release folder (updates.js).
// Test hooks (environment, for scripts only): ANVIL_ROOT serves another anvil folder (e.g. the repo, with its tests),
// ANVIL_USER_DATA moves the user-data folder, ANVIL_TEST_SAVE_DIR saves downloads there without a dialog,
// ANVIL_TEST_LOG appends one JSON line per event (downloads, update checks, converter runs) to that file.
'use strict';
const { app, BrowserWindow, protocol, session, shell, Menu, dialog, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const converters = require('./converters');
const updates = require('./updates');

if (process.env.ANVIL_USER_DATA) app.setPath('userData', path.resolve(process.env.ANVIL_USER_DATA));
app.setAppUserModelId('com.anvil.cad');

const ROOT = path.resolve(process.env.ANVIL_ROOT || (app.isPackaged ? path.join(process.resourcesPath, 'anvil') : path.join(__dirname, '..', 'anvil')));
const ORIGIN = 'app://anvil';
const ICON = path.join(__dirname, 'assets', 'icon.png');
const VERSION = app.getVersion();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.wasm': 'application/wasm', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.gz': 'application/gzip' };

function testLog(event, data) {
  const f = process.env.ANVIL_TEST_LOG;
  if (!f) return;
  try { fs.appendFileSync(f, JSON.stringify(Object.assign({ at: new Date().toISOString(), event }, data || {})) + '\n'); } catch (e) { /* ignore */ }
}

// ---- settings (user-editable) and state (the app's own) in the user-data folder ----------------------------------
const DEFAULT_RELEASES = path.join(app.getPath('home'), 'Desktop', 'Output', 'Anvil Releases');
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch (e) { return null; } }
function writeJson(file, obj) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(obj, null, 2)); } catch (e) { /* ignore */ } }
function settingsFile() { return path.join(app.getPath('userData'), 'settings.json'); }
function settings() {
  const s = readJson(settingsFile());
  const out = Object.assign({ updateFolder: DEFAULT_RELEASES, checkEveryHours: 2 }, s || {});
  if (!s) writeJson(settingsFile(), out);   // written once so it can be found and edited
  return out;
}
function stateFile() { return path.join(app.getPath('userData'), 'window-state.json'); }
const appState = readJson(stateFile()) || {};
function saveState() { writeJson(stateFile(), appState); }

// ---- the app:// scheme -------------------------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

function notFound(p, head) {
  return new Response(head ? null : '404 ' + p, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
async function serve(req) {
  const u = new URL(req.url);
  let p;
  try { p = decodeURIComponent(u.pathname); } catch (e) { return notFound(u.pathname, false); }
  const head = req.method === 'HEAD';
  if (u.host !== 'anvil') return notFound(p, head);
  if (p === '/api/dxf2dwg') return converters.dxf2dwg(req, ROOT, (m) => testLog('converter', { msg: m }));
  if (p === '/api/dwg2dxf') return converters.dwg2dxf(req, ROOT, (m) => testLog('converter', { msg: m }));
  if (req.method !== 'GET' && !head) return new Response(null, { status: 405 });
  if (p === '/') p = '/index.html';
  let file = path.join(ROOT, p);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return notFound(p, head);
  let st;
  try { st = await fs.promises.stat(file); if (st.isDirectory()) { file = path.join(file, 'index.html'); st = await fs.promises.stat(file); } } catch (e) { return notFound(p, head); }
  if (!st.isFile()) return notFound(p, head);
  const headers = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': String(st.size) };
  if (head) return new Response(null, { status: 200, headers });
  return new Response(await fs.promises.readFile(file), { status: 200, headers });
}

// ---- the window --------------------------------------------------------------------------------------------------
let win = null;
function onScreen(b) {
  if (!b || !(b.width > 200) || !(b.height > 150)) return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width - 50 && b.x + b.width > a.x + 50 && b.y >= a.y - 10 && b.y < a.y + a.height - 50;
  });
}
function createWindow() {
  const saved = appState.window || {};
  const opts = { width: 1440, height: 900, minWidth: 800, minHeight: 500, show: false, title: 'Anvil', icon: ICON, backgroundColor: '#f4f6f8', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, plugins: true } };
  if (onScreen(saved.bounds)) Object.assign(opts, saved.bounds);
  win = new BrowserWindow(opts);
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  // a page title of Anvil's own wins; with none, "Anvil <version>"
  win.on('page-title-updated', (e, title) => { if (!title || /^app:\/\//.test(title)) { e.preventDefault(); win.setTitle('Anvil ' + VERSION); } });
  win.on('close', () => {
    appState.window = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    saveState();
  });
  win.on('closed', () => { win = null; });
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    if (url.startsWith(ORIGIN + '/') || url === 'about:blank' || url.startsWith('blob:')) {
      return { action: 'allow', overrideBrowserWindowOptions: { icon: ICON, autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true, plugins: true } } };
    }
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (url.startsWith(ORIGIN + '/')) return;
    e.preventDefault();
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
  });
  // Anvil asks before leaving with unsaved changes (beforeunload): Electron would silently refuse to close, so ask here
  wc.on('will-prevent-unload', (e) => {
    testLog('unload-question', {});
    const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Close Anvil', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Anvil',
      message: 'Close Anvil?', detail: 'Changes you made may not be saved. Anvil keeps a recovery copy of open work.' });
    if (r === 0) e.preventDefault();
    else updater.cancelInstall();
  });
  wc.on('console-message', (e) => { if (e.level === 'error') testLog('console-error', { message: e.message, source: e.sourceId, line: e.lineNumber }); });
  wc.on('did-navigate', () => { pageLoaded = false; });
  wc.on('did-finish-load', () => { pageLoaded = true; if (updater.state.offered) sendOffer(updater.state.offered); });
  win.loadURL(ORIGIN + '/index.html');
}

// ---- downloads: the Windows Save As dialog -----------------------------------------------------------------------
function setupDownloads() {
  session.defaultSession.on('will-download', (e, item) => {
    const name = item.getFilename() || 'download';
    const testDir = process.env.ANVIL_TEST_SAVE_DIR;
    const ext = path.extname(name).slice(1).toLowerCase();
    const dir = appState.saveFolder && fs.existsSync(appState.saveFolder) ? appState.saveFolder : app.getPath('documents');
    const dialogOpts = { title: 'Save As', defaultPath: path.join(dir, name),
      filters: ext ? [{ name: ext.toUpperCase() + ' file', extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : [] };
    testLog('download-offered', { name, defaultPath: dialogOpts.defaultPath, filters: dialogOpts.filters.map((f) => f.extensions.join(',')) });
    if (testDir) item.setSavePath(path.join(testDir, name));   // a test stands in for the dialog
    else item.setSaveDialogOptions(dialogOpts);
    item.once('done', (ev, state) => {
      testLog('download-done', { name, state, path: item.getSavePath() });
      if (state === 'completed' && !testDir) { appState.saveFolder = path.dirname(item.getSavePath()); saveState(); }
    });
  });
}

// ---- menu (Anvil draws its own SolidWorks-style menus in the page; this one shows with Alt) -----------------------
function about() {
  dialog.showMessageBox(win, { type: 'info', title: 'About Anvil', buttons: ['OK'], icon: ICON, message: 'Anvil ' + VERSION,
    detail: 'Parametric CAD for sheet metal, parts, assemblies and drawings.\n\nElectron ' + process.versions.electron + ', Chromium ' + process.versions.chrome +
      '\nProgram files: ' + ROOT + '\nSettings: ' + app.getPath('userData') });
}
async function checkNow() {
  const r = await updater.check(true);
  if (r.state === 'ready') return;
  const msg = { 'up to date': 'Anvil ' + VERSION + ' is the newest version.', 'no folder': 'The update folder was not found:\n' + (r.folder || ''),
    'no release': 'No release has been put in the update folder yet.' }[r.state] || ('No update: ' + r.state + (r.message ? ' (' + r.message + ')' : ''));
  dialog.showMessageBox(win, { type: 'info', title: 'Anvil updates', buttons: ['OK'], message: msg, detail: 'Update folder: ' + settings().updateFolder + '\nSet in ' + settingsFile() });
}
function setupMenu() {
  const wc = () => win && win.webContents;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Quit', click: () => app.quit() }] },
    { label: 'View', submenu: [
      { label: 'Reload', click: () => wc() && wc().reload() },
      { label: 'Toggle Developer Tools', accelerator: 'F12', click: () => wc() && wc().toggleDevTools() },
      { type: 'separator' },
      { label: 'Actual Size', click: () => wc() && wc().setZoomLevel(0) },
      { label: 'Zoom In', click: () => wc() && wc().setZoomLevel(wc().getZoomLevel() + 0.5) },
      { label: 'Zoom Out', click: () => wc() && wc().setZoomLevel(wc().getZoomLevel() - 0.5) },
      { type: 'separator' },
      { label: 'Toggle Full Screen', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) }
    ] },
    { label: 'Help', submenu: [
      { label: 'Check for Updates', click: checkNow },
      { label: 'Open Update Settings', click: () => { settings(); shell.openPath(settingsFile()); } },
      { type: 'separator' },
      { label: 'About Anvil', click: about }
    ] }
  ]));
}

// ---- updates -----------------------------------------------------------------------------------------------------
let pageLoaded = false;   // set once the page has loaded; an offer found earlier is sent then (did-finish-load)
function sendOffer(o) { if (win && pageLoaded) win.webContents.send('anvil-desktop:update', { version: o.version, notes: o.notes, current: VERSION }); }
const updater = updates.create({ currentVersion: VERSION, settings, log: testLog, offer: (o) => sendOffer(o) });
ipcMain.on('anvil-desktop:info', (e) => { e.returnValue = { version: VERSION }; });
ipcMain.handle('anvil-desktop:check-updates', () => updater.check(true));
ipcMain.on('anvil-desktop:update-later', () => updater.later());
ipcMain.on('anvil-desktop:update-restart', async (e) => {
  try { await updater.prepareInstall(); app.quit(); }
  catch (err) { testLog('update-failed', { message: err.message }); e.sender.send('anvil-desktop:update-failed', err.message); }
});
app.on('will-quit', () => { testLog('quitting', {}); if (updater.runPendingInstall()) testLog('update-installing', {}); });

// ---- start -------------------------------------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('app', (req) => serve(req).catch((e) => new Response('500 ' + e.message, { status: 500 })));
    setupDownloads();
    setupMenu();
    createWindow();
    testLog('started', { version: VERSION, root: ROOT, userData: app.getPath('userData') });
    updater.start();
  });
  app.on('window-all-closed', () => app.quit());
}
