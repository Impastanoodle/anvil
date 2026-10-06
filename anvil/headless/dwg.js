// headless/dwg.js — DXF text to DWG bytes for the Node runner, through an external converter: the ODA File Converter
// when it is installed (Open Design Alliance, free, writes a compliant ACAD2018 DWG; `C:\Program Files\ODA\
// ODAFileConverter*\ODAFileConverter.exe` or $ANVIL_ODA_CONVERTER), else LibreDWG's dxf2dwg (R2000; experimental
// writer; `vendor/libredwg/dxf2dwg.exe` from vendor/get-libredwg.ps1, or $ANVIL_LIBREDWG, a file or its folder).
// which() -> { name: 'oda' | 'libredwg', path } | null; convert(dxfText) -> Buffer, 30 s limit, temp files removed.
// No converter throws an error with `.code = 2` and the hint; a converter failure throws `.code = 1` with the first
// lines of its stderr and `.converter`. Anvil's DXF ends without a line end after EOF, which LibreDWG's reader rejects
// as a truncated file, so a newline is appended first. serve.ps1 does the same for the app (POST /api/dxf2dwg).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const child = require('child_process');

const VENDOR_EXE = path.resolve(__dirname, '..', 'vendor', 'libredwg', 'dxf2dwg.exe');
const ODA_DIR = 'C:\\Program Files\\ODA';
const HINT = 'Run anvil/vendor/get-libredwg.ps1, or install the free ODA File Converter';
const TIMEOUT_MS = 30000;

function isFile(p) { try { return !!p && fs.statSync(p).isFile(); } catch (e) { return false; } }
function isDir(p) { try { return !!p && fs.statSync(p).isDirectory(); } catch (e) { return false; } }

// the converter to use, ODA first: { name, path } or null
function which() {
  let oda = process.env.ANVIL_ODA_CONVERTER;
  if (!oda && isDir(ODA_DIR)) {
    const dirs = fs.readdirSync(ODA_DIR).filter((d) => /^ODAFileConverter/i.test(d)).sort().reverse();
    for (const d of dirs) { const p = path.join(ODA_DIR, d, 'ODAFileConverter.exe'); if (isFile(p)) { oda = p; break; } }
  }
  if (isFile(oda)) return { name: 'oda', path: oda };
  let exe = process.env.ANVIL_LIBREDWG || VENDOR_EXE;
  if (isDir(exe)) exe = path.join(exe, 'dxf2dwg.exe');
  if (isFile(exe)) return { name: 'libredwg', path: exe };
  return null;
}

// the first useful lines of a converter's output for an error message: ERROR lines first, else the first lines
function firstLines(text, n) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors = lines.filter((l) => /^ERROR/i.test(l));
  return (errors.length ? errors : lines).slice(0, n || 5).join('\n');
}

function convert(dxfText, converter) {
  const conv = converter || which();
  if (!conv) throw Object.assign(new Error('No DXF to DWG converter on this machine. ' + HINT), { code: 2 });
  let text = String(dxfText);
  if (!/\n$/.test(text)) text += '\r\n';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'anvil-dwg-'));
  try {
    const inDir = path.join(work, 'in'), outDir = path.join(work, 'out');
    fs.mkdirSync(inDir); fs.mkdirSync(outDir);
    const dxf = path.join(inDir, 'input.dxf'), dwg = path.join(outDir, 'input.dwg');
    fs.writeFileSync(dxf, text, 'utf8');
    // ODA: <inputFolder> <outputFolder> <version> <type> <recurse> <audit> [filter]; dxf2dwg: -y overwrite, -o output
    const args = conv.name === 'oda' ? [inDir, outDir, 'ACAD2018', 'DWG', '0', '1', '*.dxf'] : ['-y', '-o', dwg, dxf];
    const r = child.spawnSync(conv.path, args, { cwd: work, timeout: TIMEOUT_MS, windowsHide: true, encoding: 'utf8' });
    const fail = (why) => {
      const e = new Error(why || firstLines(r.stderr || r.stdout) || (conv.name + ' wrote no DWG'));
      e.code = 1; e.converter = conv.name;
      return e;
    };
    if (r.error && r.error.code === 'ETIMEDOUT') throw fail(conv.name + ' timed out after ' + TIMEOUT_MS / 1000 + ' s');
    if (r.error) throw fail(conv.name + ': ' + r.error.message);
    if (!isFile(dwg)) throw fail();
    const bytes = fs.readFileSync(dwg);
    if (!bytes.length) throw fail(conv.name + ' wrote an empty DWG');
    return bytes;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { which, convert, HINT, TIMEOUT_MS };
