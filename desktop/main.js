// main.js — Anvil as a Windows program (Electron). Runs the same static files as anvil/serve.ps1, offline, in its own
// window:
// - app://anvil/ serves the anvil/ folder (bundled in resources\anvil by the installer; ../anvil when run from the
//   repo). The scheme is privileged (standard, secure, fetch, CORS, streams), so module workers, the 48 MB
//   OpenCascade engine, IndexedDB and localStorage work, and the origin is the same in every version: settings, the
//   recovered work and the engine store survive an update (they live in %APPDATA%\Anvil).
// - app://anvil/api/dxf2dwg and api/dwg2dxf: the DWG converters of serve.ps1 (converters.js).
// - downloads (parts, DXF, DWG, STEP, PDF, SVG) open the Windows Save As dialog with the suggested name; file inputs
//   open the normal Open dialog (Chromium's own). File ▸ Open / Save / Save As / exports go through anvilDesktop.files
//   (preload.js): Windows' own Open / Save boxes, writes only to a path picked in one ("Open / Save dialogs" below).
// - links to the web open in the user's browser; a minimal menu (Alt shows it); one instance; window size and place
//   remembered; updates from a release folder (updates.js).
// Test hooks (environment, for scripts only): ANVIL_ROOT serves another anvil folder (e.g. the repo, with its tests),
// ANVIL_USER_DATA moves the user-data folder, ANVIL_TEST_SAVE_DIR saves downloads there without a dialog,
// ANVIL_TEST_LOG appends one JSON line per event (downloads, update checks, converter runs) to that file;
// ANVIL_TEST_OPEN_FILE answers the Open box, ANVIL_TEST_UNLOAD_ANSWERS ("cancel,close") the unsaved-work question,
// ANVIL_TEST_DIALOGS=log logs the "update not installed" box, ANVIL_TEST_VERSION plays another version,
// ANVIL_UPDATE_TEMP / ANVIL_UPDATE_SETTLE_MS move the update's temp folder / shorten the helper's wait.
// - OpenCascade: the native engine (OpenCascade 7.6.3 for Windows, desktop/native) runs in its own process
//   (occt-host.js); the page talks to it through a MessagePort and falls back to the WebAssembly worker if it cannot
//   start. ANVIL_OCCT_NATIVE names another addon folder; ANVIL_OCCT_ENGINE=wasm (or "occtEngine": "wasm" in
//   settings.json) keeps the WebAssembly engine.
'use strict';
const { app, BrowserWindow, protocol, session, shell, Menu, dialog, ipcMain, screen, utilityProcess, MessageChannelMain } = require('electron');
const fs = require('fs');
const path = require('path');
const converters = require('./converters');
const updates = require('./updates');

if (process.env.ANVIL_USER_DATA) app.setPath('userData', path.resolve(process.env.ANVIL_USER_DATA));
app.setAppUserModelId('com.anvil.cad');

const ROOT = path.resolve(process.env.ANVIL_ROOT || (app.isPackaged ? path.join(process.resourcesPath, 'anvil') : path.join(__dirname, '..', 'anvil')));
const ORIGIN = 'app://anvil';
const ICON = path.join(__dirname, 'assets', 'icon.png');
const VERSION = process.env.ANVIL_TEST_VERSION || app.getVersion();   // a test can play the next version (check.js update-restart)
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
  // an open document with a path on disk shows its file name ("bracket.anvil.json * - Anvil")
  win.on('page-title-updated', (e, title) => {
    const t = composeTitle(win.webContents, title);
    if (t) { e.preventDefault(); win.setTitle(t); return; }
    if (!title || /^app:\/\//.test(title)) { e.preventDefault(); win.setTitle('Anvil ' + VERSION); }
  });
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
  // (Restart to update asks the same question, in its own words; Cancel keeps Anvil open and the update offered)
  wc.on('will-prevent-unload', (e) => {
    const updating = !!updater.state.pendingInstaller;
    testLog('unload-question', { updating });
    const q = updating
      ? { buttons: ['Restart and update', 'Cancel'], message: 'Install Anvil ' + ((updater.state.offered || {}).version || '') + ' and restart?', detail: 'Changes you made may not be saved. Cancel, then save your work, and choose Restart to update again.' }
      : { buttons: ['Close Anvil', 'Cancel'], message: 'Close Anvil?', detail: 'Changes you made may not be saved. Anvil keeps a recovery copy of open work.' };
    const answers = process.env.ANVIL_TEST_UNLOAD_ANSWERS;   // a test stands in for the question: "cancel,close"
    let r;
    if (answers) { const list = answers.split(','); const a = list[unloadAnswered++] || list[list.length - 1]; r = a === 'close' ? 0 : 1; testLog('unload-answer', { answer: a }); }
    else r = dialog.showMessageBoxSync(win, Object.assign({ type: 'question', defaultId: 1, cancelId: 1, title: 'Anvil' }, q));
    if (r === 0) e.preventDefault();
    else if (updating) { updater.cancelInstall(); if (updater.state.offered) sendOffer(updater.state.offered); }
  });
  wc.on('console-message', (e) => { if (e.level === 'error') testLog('console-error', { message: e.message, source: e.sourceId, line: e.lineNumber }); });
  wc.on('did-navigate', () => { pageLoaded = false; docPaths.delete(wc.id); });
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

// ---- Windows' own Open / Save dialogs for the page (preload.js anvilDesktop.files) -------------------------------
// The page never names a path to write on its own: a path is writable only once the user picked it in an Open or Save
// dialog in this session (Open makes the opened document's own path writable, so Ctrl+S saves over it with no
// dialog). Writes go to a temporary file beside the target first and then replace it, so a failed write (read-only,
// locked, a network folder gone) leaves the old file as it was; the document stays open in Anvil either way.
// Test hooks: ANVIL_TEST_SAVE_DIR answers the Save dialog with that folder + the suggested name, ANVIL_TEST_OPEN_FILE
// answers the Open dialog with that file ("cancel": cancelled); both log 'dialog-save' / 'dialog-open'.
const allowedPaths = new Set();   // lower-cased full paths picked in a dialog (or dropped on the window) this session
const docPaths = new Map();       // webContents id -> the open document's path (window title)
function pathKey(p) { return path.resolve(String(p)).toLowerCase(); }
function allow(p) { allowedPaths.add(pathKey(p)); }
function lastFolder() {
  return appState.saveFolder && fs.existsSync(appState.saveFolder) ? appState.saveFolder : app.getPath('documents');
}
function rememberFolder(p) { appState.saveFolder = path.dirname(p); saveState(); }
function cleanName(n) { return String(n || 'Untitled').replace(/^.*[\\/]/, '').replace(/[<>:"|?*\x00-\x1f]+/g, '_') || 'Untitled'; }
function cleanFilters(f) {
  return (Array.isArray(f) ? f : []).slice(0, 20).map((x) => ({ name: String(x && x.name || 'Files').slice(0, 120),
    extensions: (Array.isArray(x && x.extensions) ? x.extensions : ['*']).map((e) => String(e).replace(/[^\w*]/g, '')).filter(Boolean).slice(0, 20) }))
    .filter((x) => x.extensions.length);
}
// a plain-English reason for a failed read / write
function fileError(e, p) {
  const name = path.basename(p || '');
  const why = { EACCES: name + ' is read-only, or you do not have permission to change it.', EPERM: name + ' is read-only, or you do not have permission to change it.',
    EBUSY: name + ' is open in another program. Close it there and save again.', ENOENT: 'The folder ' + path.dirname(p || '') + ' is not there (a network drive offline?).',
    ENOTDIR: 'The folder ' + path.dirname(p || '') + ' is not there.', EROFS: name + ' is on a read-only drive.', ENOSPC: 'The drive is full.',
    EEXIST: name + ' could not be replaced.' }[e && e.code];
  return { error: why || ((e && e.message) || String(e)), code: (e && e.code) || null };
}
function toBuffer(data) {
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  throw new Error('nothing to write');
}
async function writeSafely(target, data) {
  const buf = toBuffer(data);
  const tmp = target + '.anvil-' + process.pid + '-' + Date.now().toString(36) + '.tmp';
  try {
    await fs.promises.writeFile(tmp, buf);
    await fs.promises.rename(tmp, target);
  } catch (e) {
    try { await fs.promises.unlink(tmp); } catch (e2) { /* never made */ }
    throw e;
  }
  return buf.length;
}
// the page writes its own title (ui-app.js titleText: "bracket.anvil.json * - Anvil", "Draw1 - Sheet1 * - Anvil");
// a title of Anvil's own shape is shown as it is, else the document's file name with the page's "*"
function composeTitle(wc, pageTitle) {
  const t = String(pageTitle || '');
  if (/ - Anvil$/.test(t) && t.length <= 300 && !/[\x00-\x1f]/.test(t)) return t;
  const p = docPaths.get(wc.id);
  if (!p) return null;
  return path.basename(p) + (/ \*( - Anvil)?$/.test(t) ? ' *' : '') + ' - Anvil';
}
ipcMain.handle('anvil-desktop:open-dialog', async (e, o) => {
  o = o || {};
  const w = BrowserWindow.fromWebContents(e.sender) || win;
  const opts = { title: 'Open', defaultPath: lastFolder(), properties: ['openFile'], filters: cleanFilters(o.filters) };
  testLog('dialog-open', { defaultPath: opts.defaultPath, filters: opts.filters.map((f) => f.extensions.join(',')) });
  let file;
  if (process.env.ANVIL_TEST_OPEN_FILE) file = process.env.ANVIL_TEST_OPEN_FILE === 'cancel' ? null : process.env.ANVIL_TEST_OPEN_FILE;
  else { const r = await dialog.showOpenDialog(w, opts); file = r.canceled ? null : r.filePaths[0]; }
  if (!file) return null;
  try {
    const st = await fs.promises.stat(file);
    if (st.size > 1024 * 1024 * 1024) return { error: path.basename(file) + ' is larger than 1 GB.' };
    const data = await fs.promises.readFile(file);
    allow(file); rememberFolder(file);
    testLog('file-opened', { path: file, bytes: data.length });
    return { path: file, name: path.basename(file), data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  } catch (err) { return Object.assign({ path: file }, fileError(err, file)); }
});
ipcMain.handle('anvil-desktop:save-dialog', async (e, o) => {
  o = o || {};
  const w = BrowserWindow.fromWebContents(e.sender) || win;
  const doc = docPaths.get(e.sender.id);
  // near: a file this session opened (an imported STEP / DXF, a drawing): the box starts in its folder (SolidWorks
  // saves an imported file's new part beside it). Only a path already allowed counts; the folder is just the default.
  const near = o.near && allowedPaths.has(pathKey(o.near)) && fs.existsSync(path.dirname(path.resolve(String(o.near)))) ? path.dirname(path.resolve(String(o.near))) : null;
  const dir = near || (o.kind === 'document' && doc && fs.existsSync(path.dirname(doc)) ? path.dirname(doc) : lastFolder());
  const opts = { title: o.title ? String(o.title).slice(0, 80) : 'Save As', defaultPath: path.join(dir, cleanName(o.name)), filters: cleanFilters(o.filters) };
  testLog('dialog-save', { defaultPath: opts.defaultPath, filters: opts.filters.map((f) => f.extensions.join(',')), kind: o.kind || null, near: !!near });
  let file;
  if (process.env.ANVIL_TEST_SAVE_DIR) file = process.env.ANVIL_TEST_SAVE_DIR === 'cancel' ? null : path.join(process.env.ANVIL_TEST_SAVE_DIR, path.basename(opts.defaultPath));
  else { const r = await dialog.showSaveDialog(w, opts); file = r.canceled ? null : r.filePath; }
  if (!file) return null;
  allow(file); rememberFolder(file);
  return { path: file, name: path.basename(file) };
});
// a file the user dropped on the window (preload.js files.dropped, which only has a path for a real File from a drop
// or a file input): that exact file, if it is a plain file of at most 1 GB, becomes writable like one picked in the
// Open box (Ctrl+S writes back to it). Nothing else is opened up: no folder, no other name.
ipcMain.handle('anvil-desktop:dropped-file', async (e, p) => {
  if (typeof p !== 'string' || !p || !path.isAbsolute(p)) return null;
  const file = path.resolve(p);
  try {
    const st = await fs.promises.stat(file);
    if (!st.isFile() || st.size > 1024 * 1024 * 1024) return null;
  } catch (err) { return null; }
  allow(file);
  testLog('file-dropped', { path: file });
  return { path: file, name: path.basename(file) };
});
// write(path, data, { sibling }): path must have been picked in a dialog (or opened) this session; sibling writes
// a companion file of that name (an OBJ's .mtl) into the same folder
ipcMain.handle('anvil-desktop:write-file', async (e, target, data, o) => {
  o = o || {};
  if (!target || !allowedPaths.has(pathKey(target))) { testLog('write-refused', { path: String(target) }); return { error: 'Anvil can only save to a file you chose in a Save or Open box.', code: 'NOTALLOWED' }; }
  let file = path.resolve(String(target));
  if (o.sibling != null) {
    const s = String(o.sibling);
    if (!/^[^\\/:*?"<>|]+\.(mtl)$/i.test(s)) return { error: 'not a companion file name: ' + s, code: 'NOTALLOWED' };
    file = path.join(path.dirname(file), s);
  }
  try {
    const bytes = await writeSafely(file, data);
    testLog('file-written', { path: file, bytes });
    return { path: file, bytes };
  } catch (err) { const r = fileError(err, file); testLog('write-failed', { path: file, code: r.code, message: r.error }); return r; }
});
// ---- Recent Documents (File menu, File ▸ Browse Recent Documents; ui-app.js "Recent documents (rfIK)") ----------
// The last RECENT_MAX documents opened or saved, newest first, kept in recent.json in the user-data folder: paths only,
// never file contents. The page can add only a path it may already write (picked in a box, dropped, or reopened from
// this list); reopening one through recent-open makes that one path writable again, exactly as picking it in the Open
// box does. A path that is not there any more is listed as missing (a network folder that does not answer within
// 1.5 s is not called missing).
const RECENT_MAX = 10;
function recentFile() { return path.join(app.getPath('userData'), 'recent.json'); }
function recentRead() {
  const j = readJson(recentFile());
  return (j && Array.isArray(j.files) ? j.files : []).filter((f) => f && typeof f.path === 'string' && path.isAbsolute(f.path)).slice(0, RECENT_MAX);
}
function recentWrite(list) { writeJson(recentFile(), { files: list.slice(0, RECENT_MAX) }); }
function statQuick(p) {
  return Promise.race([fs.promises.stat(p).then((st) => (st.isFile() ? 'file' : 'other'), () => 'missing'), new Promise((res) => setTimeout(() => res('slow'), 1500))]);
}
async function recentList() {
  const list = recentRead();
  const states = await Promise.all(list.map((f) => statQuick(f.path)));
  return list.map((f, i) => ({ path: f.path, name: path.basename(f.path), folder: path.dirname(f.path), at: f.at || null, missing: states[i] === 'missing' || states[i] === 'other' }));
}
ipcMain.handle('anvil-desktop:recent-list', () => recentList());
ipcMain.handle('anvil-desktop:recent-add', (e, p) => {
  if (typeof p !== 'string' || !p || !allowedPaths.has(pathKey(p))) { testLog('recent-refused', { path: String(p) }); return recentList(); }
  const file = path.resolve(p), k = pathKey(file);
  recentWrite([{ path: file, at: new Date().toISOString() }].concat(recentRead().filter((f) => pathKey(f.path) !== k)));
  testLog('recent-added', { path: file });
  return recentList();
});
ipcMain.handle('anvil-desktop:recent-remove', (e, p) => {
  const k = typeof p === 'string' && p ? pathKey(p) : null;
  if (k) recentWrite(recentRead().filter((f) => pathKey(f.path) !== k));
  testLog('recent-removed', { path: String(p) });
  return recentList();
});
ipcMain.handle('anvil-desktop:recent-clear', () => { recentWrite([]); testLog('recent-cleared', {}); return []; });
// reopen one: only a path on the list; { path, name, data } as the Open box gives, or { missing: true, path, name }
ipcMain.handle('anvil-desktop:recent-open', async (e, p) => {
  const k = typeof p === 'string' && p ? pathKey(p) : null;
  const hit = k && recentRead().find((f) => pathKey(f.path) === k);
  if (!hit) return { error: 'That file is not on the Recent Documents list.', code: 'NOTALLOWED' };
  const file = path.resolve(hit.path);
  let st;
  try { st = await fs.promises.stat(file); } catch (err) { testLog('recent-missing', { path: file }); return { missing: true, path: file, name: path.basename(file) }; }
  if (!st.isFile()) return { missing: true, path: file, name: path.basename(file) };
  if (st.size > 1024 * 1024 * 1024) return { path: file, name: path.basename(file), error: path.basename(file) + ' is larger than 1 GB.' };
  try {
    const data = await fs.promises.readFile(file);
    allow(file); rememberFolder(file);
    testLog('file-opened', { path: file, bytes: data.length, via: 'recent' });
    return { path: file, name: path.basename(file), data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
  } catch (err) { return Object.assign({ path: file, name: path.basename(file) }, fileError(err, file)); }
});

// the page names its open document (null: none); only a path picked in a dialog is taken. The window title shows it.
// title: the page's title for it (ui-app.js syncDocument), which may not have reached wc.getTitle() yet
ipcMain.handle('anvil-desktop:set-document', (e, p, title) => {
  const wc = e.sender;
  if (p && allowedPaths.has(pathKey(p))) docPaths.set(wc.id, path.resolve(String(p))); else docPaths.delete(wc.id);
  const w = BrowserWindow.fromWebContents(wc);
  const pt = typeof title === 'string' && title ? title : wc.getTitle();
  if (w) w.setTitle(composeTitle(wc, pt) || (pt && !/^app:\/\//.test(pt) ? pt : 'Anvil ' + VERSION));
  testLog('document', { asked: p || null, path: docPaths.get(wc.id) || null, title: w ? w.getTitle() : null });
  return docPaths.get(wc.id) || null;
});

// ---- menu (Anvil draws its own SolidWorks-style menus in the page; this one shows with Alt) -----------------------
function about() {
  dialog.showMessageBox(win, { type: 'info', title: 'About Anvil', buttons: ['OK'], icon: ICON, message: 'Anvil ' + VERSION,
    detail: 'Parametric CAD for sheet metal, parts, assemblies and drawings.\n\nElectron ' + process.versions.electron + ', Chromium ' + process.versions.chrome +
      '\n' + occtAbout() + '\nProgram files: ' + ROOT + '\nSettings: ' + app.getPath('userData') });
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

// ---- OpenCascade for Windows in its own process (occt-host.js) ---------------------------------------------------
// One utility process per engine start (the page's startWorker); the page stops it (terminate: Cancel, a model switch)
// by killing it, so a long build never blocks the next one. The page and the process talk directly on a MessagePort.
const OCCT_ADDON = path.resolve(process.env.ANVIL_OCCT_NATIVE ||
  (app.isPackaged ? path.join(process.resourcesPath, 'occt-native') : path.join(app.getPath('home'), 'Desktop', 'Output', 'Anvil Native', 'addon')));
// shipped unpacked (asarUnpack), next to app.asar
const OCCT_HOST = path.join(__dirname, 'occt-host.js').replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
const occtHosts = new Map();   // id -> { child, wc, stopped }
const occtInfo = { state: 'not started yet', loadMs: null, message: null };
function occtNative() { return process.env.ANVIL_OCCT_ENGINE !== 'wasm' && settings().occtEngine !== 'wasm' && fs.existsSync(OCCT_HOST); }
function occtStart(wc, id) {
  const fail = (message) => { Object.assign(occtInfo, { state: 'failed', message }); testLog('occt-native-failed', { id, message }); if (!wc.isDestroyed()) wc.send('anvil-desktop:occt-exit', { id, message }); };
  let child;
  try { child = utilityProcess.fork(OCCT_HOST, ['--root', ROOT, '--addon', OCCT_ADDON], { serviceName: 'Anvil OpenCascade', stdio: 'pipe' }); }
  catch (e) { fail('the engine process did not start: ' + e.message); return; }
  const h = { child, wc, stopped: false, t0: Date.now() };
  occtHosts.set(id, h);
  const ch = new MessageChannelMain();
  child.postMessage({ type: 'port' }, [ch.port1]);
  wc.postMessage('anvil-desktop:occt-port', { id }, [ch.port2]);
  let errText = '';
  if (child.stdout) child.stdout.on('data', () => { });
  if (child.stderr) child.stderr.on('data', (d) => { errText = (errText + d).slice(-2000); });
  child.on('message', (m) => {
    if (m && m.type === 'ready') { Object.assign(occtInfo, { state: 'native', loadMs: m.loadMs, message: null }); testLog('occt-native-ready', { id, pid: child.pid, loadMs: m.loadMs, startMs: Date.now() - h.t0 }); }
    if (m && m.type === 'hostFailed') { Object.assign(occtInfo, { state: 'failed', message: m.message }); testLog('occt-native-failed', { id, message: m.message }); }
  });
  child.on('exit', (code) => {
    occtHosts.delete(id);
    testLog('occt-native-exit', { id, code, stopped: h.stopped });
    if (!h.stopped) fail('the engine process stopped (exit code ' + code + ')' + (errText.trim() ? ': ' + errText.trim().split('\n').pop() : ''));
  });
}
function occtStop(id) { const h = occtHosts.get(id); if (!h || h.stopped) return; h.stopped = true; try { h.child.kill(); } catch (e) { /* gone */ } }
function occtStopAll(wc) { for (const [id, h] of occtHosts) if (!wc || h.wc === wc) occtStop(id); }
function occtAbout() {
  if (!occtNative()) return 'OpenCascade: WebAssembly engine (the Windows engine is switched off)';
  if (occtInfo.state === 'native') return 'OpenCascade: 7.6.3 for Windows (native, loaded in ' + Math.round(occtInfo.loadMs) + ' ms)';
  if (occtInfo.state === 'failed') return 'OpenCascade: WebAssembly engine (the Windows engine did not run: ' + occtInfo.message + ')';
  return 'OpenCascade: 7.6.3 for Windows (' + occtInfo.state + ')';
}
ipcMain.on('anvil-desktop:occt-start', (e, id) => occtStart(e.sender, String(id)));
ipcMain.on('anvil-desktop:occt-stop', (e, id) => occtStop(String(id)));
app.on('web-contents-created', (e, wc) => { wc.once('destroyed', () => occtStopAll(wc)); wc.on('render-process-gone', () => occtStopAll(wc)); });
app.on('before-quit', () => occtStopAll());

// ---- updates -----------------------------------------------------------------------------------------------------
let pageLoaded = false;   // set once the page has loaded; an offer found earlier is sent then (did-finish-load)
function sendOffer(o) { if (win && pageLoaded) win.webContents.send('anvil-desktop:update', { version: o.version, notes: o.notes, current: VERSION }); }
let unloadAnswered = 0;
// relaunch: what the helper starts when the installer did not (this exe, with the arguments it was started with)
const updater = updates.create({ currentVersion: VERSION, settings, log: testLog, offer: (o) => sendOffer(o), userData: app.getPath('userData'),
  relaunch: () => ({ exe: process.execPath, args: process.argv.slice(1) }) });
// the last run handed an update to the helper: did it install? (window-state.json pendingUpdate, then cleared)
function reportLastUpdate() {
  const pending = appState.pendingUpdate;
  if (!pending) return;
  delete appState.pendingUpdate; saveState();
  const r = updater.afterRestart(pending);
  if (!r || r.ok) return;
  testLog('update-not-installed-shown', { wanted: r.to, running: VERSION });
  if (process.env.ANVIL_TEST_DIALOGS === 'log') return;   // a test reads the log instead of the box
  dialog.showMessageBox(win, { type: 'warning', title: 'Anvil update', buttons: ['OK', 'Open the update log'], defaultId: 0, cancelId: 0,
    message: 'Anvil ' + r.to + ' was not installed.',
    detail: 'You are still using Anvil ' + VERSION + '; your parts and settings are as they were. Try Restart to update again, or run "Anvil Setup ' + r.to + '.exe" from the update folder yourself.\n\nWhat happened is written in ' + r.log })
    .then((x) => { if (x.response === 1) shell.openPath(r.log); }).catch(() => {});
}
ipcMain.on('anvil-desktop:info', (e) => { e.returnValue = { version: VERSION, occtNative: occtNative() }; });
ipcMain.handle('anvil-desktop:check-updates', () => updater.check(true));
ipcMain.on('anvil-desktop:update-later', () => updater.later());
ipcMain.on('anvil-desktop:update-restart', async (e) => {
  try {
    if (!(await updater.prepareInstall())) throw new Error('there is no update ready');
    updater.log('update-quitting', {});
    app.quit();
  } catch (err) { updater.log('update-failed', { message: err.message }); e.sender.send('anvil-desktop:update-failed', err.message); }
});
app.on('will-quit', () => {
  testLog('quitting', {});
  const job = updater.runPendingInstall();
  if (job) { appState.pendingUpdate = { from: job.from, to: job.to, at: new Date().toISOString() }; saveState(); testLog('update-installing', { to: job.to }); }
});

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
    win.once('ready-to-show', reportLastUpdate);
    testLog('started', { version: VERSION, root: ROOT, userData: app.getPath('userData'), pid: process.pid });
    updater.start();
  });
  app.on('window-all-closed', () => app.quit());
}
