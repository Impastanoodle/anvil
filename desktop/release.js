// release.js — builds a new Anvil installer and puts it where the installed apps look for updates.
//   npm run release                         next patch version (0.1.3 -> 0.1.4)
//   npm run release -- --minor              next minor version (0.1.3 -> 0.2.0)
//   npm run release -- --notes "What changed"   the text shown in the update prompt (default: the last commit's subject)
//   npm run release -- --version 1.0.0      an exact version;  --out <folder>  another release folder (default
//                                           %USERPROFILE%\Desktop\Output\Anvil Releases);  --keep 3  installers kept
// The version: the first release (no latest.json in the folder yet) uses package.json's version as it is; after that,
// the newest released version bumped. package.json (and package-lock.json) get the new version.
// Then: stage.js (fails with a clear message when the OpenCascade engine is missing), electron-builder NSIS, the
// installer "Anvil Setup <version>.exe" copied into the folder, latest.json { version, file, sha256, date, notes }
// written next to it, and only the newest installers kept.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] != null ? args[i + 1] : def; }
function fail(msg) { console.error('\nrelease.js: ' + msg + '\n'); process.exit(1); }
const OUT = path.resolve(opt('out', path.join(os.homedir(), 'Desktop', 'Output', 'Anvil Releases')));
const KEEP = Math.max(1, +opt('keep', 3) || 3);
const PKG = path.join(__dirname, 'package.json'), LOCK = path.join(__dirname, 'package-lock.json');

function parse(v) { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim()); return m ? [+m[1], +m[2], +m[3]] : null; }
function cmp(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
function bump(v, minor) { return minor ? [v[0], v[1] + 1, 0] : [v[0], v[1], v[2] + 1]; }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function setVersion(file, v, lock) {
  if (!fs.existsSync(file)) return;
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  j.version = v;
  if (lock && j.packages && j.packages['']) j.packages[''].version = v;
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
}

// ---- the version
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const oldVersion = pkg.version;
const latestFile = path.join(OUT, 'latest.json');
let latest = null;
try { latest = JSON.parse(fs.readFileSync(latestFile, 'utf8')); } catch (e) { latest = null; }
let version;
if (opt('version')) {
  if (!parse(opt('version'))) fail('--version must look like 1.2.3');
  version = opt('version');
} else {
  const cur = parse(pkg.version), rel = latest && parse(latest.version);
  if (!cur) fail('package.json has no x.y.z version');
  if (!rel) version = (args.includes('--minor') ? bump(cur, true) : cur).join('.');
  else if (cmp(cur, rel) > 0) version = cur.join('.');   // package.json was set ahead by hand
  else version = bump(rel, args.includes('--minor')).join('.');
}
if (latest && parse(latest.version) && cmp(parse(version), parse(latest.version)) <= 0) fail('version ' + version + ' is not newer than the released ' + latest.version);

let notes = opt('notes');
if (!notes) {
  const g = spawnSync('git', ['log', '-1', '--format=%s'], { cwd: __dirname, encoding: 'utf8' });
  notes = (g.status === 0 && g.stdout.trim()) || 'Anvil ' + version;
}
console.log('release.js: Anvil ' + version + ' (was ' + oldVersion + ') -> ' + OUT);

// ---- build
setVersion(PKG, version);
setVersion(LOCK, version, true);
function restore(msg) { setVersion(PKG, oldVersion); setVersion(LOCK, oldVersion, true); fail(msg); }
const stage = spawnSync(process.execPath, [path.join(__dirname, 'stage.js')], { cwd: __dirname, stdio: 'inherit' });
if (stage.status !== 0) restore('staging failed (see above); package.json is back at ' + oldVersion);
const cli = path.join(__dirname, 'node_modules', 'electron-builder', 'cli.js');
if (!fs.existsSync(cli)) restore('electron-builder is not installed: run "npm install" in desktop\\ first');
const build = spawnSync(process.execPath, [cli, '--win', 'nsis'], { cwd: __dirname, stdio: 'inherit' });
const name = 'Anvil Setup ' + version + '.exe', built = path.join(__dirname, 'dist', name);
if (build.status !== 0 || !fs.existsSync(built)) restore('the installer build failed (see above); package.json is back at ' + oldVersion);

// ---- publish to the release folder
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(built, path.join(OUT, name));
const hash = sha256(path.join(OUT, name));
if (hash !== sha256(built)) fail('the copied installer does not match the built one');
const info = { version, file: name, sha256: hash, date: new Date().toISOString(), notes, size: fs.statSync(built).size };
fs.writeFileSync(latestFile + '.tmp', JSON.stringify(info, null, 2) + '\n');
fs.renameSync(latestFile + '.tmp', latestFile);   // written last and whole, so an app never reads half a file

// ---- keep the newest installers
const installers = fs.readdirSync(OUT).map((f) => ({ f, v: parse((/^Anvil Setup (\d+\.\d+\.\d+)\.exe$/.exec(f) || [])[1]) })).filter((x) => x.v)
  .sort((a, b) => cmp(b.v, a.v));
installers.slice(KEEP).forEach((x) => { fs.unlinkSync(path.join(OUT, x.f)); console.log('release.js: removed the old ' + x.f); });
console.log('release.js: done. ' + name + ' (' + (info.size / 1048576).toFixed(1) + ' MB, sha256 ' + hash.slice(0, 12) + '…) and latest.json are in ' + OUT);
