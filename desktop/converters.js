// converters.js — the two DXF <-> DWG endpoints of anvil/serve.ps1, answered by the desktop app's main process with
// the same paths, methods, headers, status codes and JSON errors:
//   app://anvil/api/dxf2dwg  HEAD: 200 + X-Anvil-Converter: oda | libredwg, or 503 when neither exists;
//                            GET: { converter, path }; POST the DXF text: the DWG bytes (application/acad,
//                            Content-Disposition attachment) or JSON { error, converter } 400 / 503; else 405.
//   app://anvil/api/dwg2dxf  the way back (DWG import): POST the DWG bytes, get the DXF bytes (application/dxf) or the
//                            same JSON errors (413 over 200 MB).
// The converter: the ODA File Converter when installed (C:\Program Files\ODA\ODAFileConverter*\, or
// %ANVIL_ODA_CONVERTER%), else LibreDWG's dxf2dwg / dwg2dxf from <anvil>/vendor/libredwg (bundled with the app when
// it was there at build time) or %ANVIL_LIBREDWG%. Looked up per request, like serve.ps1.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }

function findConverter(root, tool) {
  tool = tool || 'dxf2dwg';
  let oda = process.env.ANVIL_ODA_CONVERTER;
  if (!oda) {
    const base = 'C:\\Program Files\\ODA';
    try {
      const dirs = fs.readdirSync(base).filter((d) => /^ODAFileConverter/i.test(d)).sort().reverse();
      for (const d of dirs) { const f = path.join(base, d, 'ODAFileConverter.exe'); if (isFile(f)) { oda = f; break; } }
    } catch (e) { /* no ODA folder */ }
  }
  if (oda && isFile(oda)) return { name: 'oda', path: oda };
  let exe = process.env.ANVIL_LIBREDWG || path.join(root, 'vendor', 'libredwg', tool + '.exe');
  if (isDir(exe)) exe = path.join(exe, tool + '.exe');
  else if (isFile(exe) && path.basename(exe).toLowerCase() !== tool + '.exe') exe = path.join(path.dirname(exe), tool + '.exe');
  if (isFile(exe)) return { name: 'libredwg', path: exe };
  return null;
}

// runs a converter (30 s limit) in `work` -> { timedOut, exitCode, output: stderr, else stdout }
function runConverter(conv, argv, work) {
  return new Promise((resolve) => {
    execFile(conv.path, argv, { cwd: work, timeout: 30000, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err && (err.killed || err.signal) && err.code == null) return resolve({ timedOut: true, exitCode: -1, output: '' });
      const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
      resolve({ timedOut: false, exitCode: code, output: stderr || stdout || '' });
    });
  });
}

// the first useful lines of a converter's output: its ERROR lines, else the first lines
function firstLines(text, n) {
  let lines = String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const errors = lines.filter((s) => /^ERROR/i.test(s));
  if (errors.length) lines = errors;
  return lines.slice(0, n).join('\n');
}

// one conversion in a fresh temp folder (removed afterwards): -> { bytes } or { error }
async function convert(conv, input, from, to) {
  const work = path.join(os.tmpdir(), 'anvil-dwg-' + crypto.randomUUID().replace(/-/g, ''));
  const inDir = path.join(work, 'in'), outDir = path.join(work, 'out');
  fs.mkdirSync(inDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  try {
    const inFile = path.join(inDir, 'input.' + from), outFile = path.join(outDir, 'input.' + to);
    fs.writeFileSync(inFile, input);
    // ODA: <inputFolder> <outputFolder> <version> <type DWG|DXF> <recurse 0|1> <audit 0|1> [filter]; LibreDWG: -y overwrite, -o output
    const argv = conv.name === 'oda' ? [inDir, outDir, 'ACAD2018', to.toUpperCase(), '0', '1', '*.' + from] : ['-y', '-o', outFile, inFile];
    const run = await runConverter(conv, argv, work);
    if (run.timedOut) return { error: conv.name + ' timed out after 30 s' };
    if (!isFile(outFile)) {
      let msg = firstLines(run.output, 5);
      if (!msg) msg = conv.name + ' wrote no ' + to.toUpperCase() + ' (exit code ' + run.exitCode + ')';
      return { error: msg };
    }
    const bytes = fs.readFileSync(outFile);
    if (!bytes.length) return { error: conv.name + ' wrote an empty ' + to.toUpperCase() };
    return { bytes };
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* left for the OS */ }
  }
}

function json(status, obj, headers) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers) });
}

// the shared head of both endpoints: HEAD, no converter, GET, a wrong method -> a Response, else null
function preamble(req, conv, what) {
  const headers = { 'Cache-Control': 'no-store' };
  if (conv) headers['X-Anvil-Converter'] = conv.name;
  if (req.method === 'HEAD') return new Response(null, { status: conv ? 200 : 503, headers });
  if (!conv) return json(503, { error: 'No ' + what + ' converter on this server', hint: 'Run anvil/vendor/get-libredwg.ps1, or install the free ODA File Converter' }, headers);
  if (req.method === 'GET') return json(200, { converter: conv.name, path: conv.path }, headers);
  if (req.method !== 'POST') return json(405, { error: 'Use HEAD or POST', converter: conv.name }, headers);
  return null;
}

async function dxf2dwg(req, root, log) {
  const conv = findConverter(root, 'dxf2dwg');
  const early = preamble(req, conv, 'DXF to DWG');
  if (early) return early;
  const headers = { 'Cache-Control': 'no-store', 'X-Anvil-Converter': conv.name };
  let dxf = await req.text();
  if (!dxf || !dxf.trim()) return json(400, { error: 'Empty request body: POST the DXF text', converter: conv.name }, headers);
  // Anvil's DXF ends right after EOF; LibreDWG's reader wants a line end there or reports a truncated file
  if (!dxf.endsWith('\n')) dxf += '\r\n';
  const t0 = Date.now();
  const r = await convert(conv, Buffer.from(dxf, 'utf8'), 'dxf', 'dwg');
  if (r.error) { log('dxf2dwg (' + conv.name + '): failed in ' + (Date.now() - t0) + ' ms: ' + r.error.split('\n')[0]); return json(400, { error: r.error, converter: conv.name }, headers); }
  log('dxf2dwg (' + conv.name + '): ' + dxf.length + ' chars of DXF -> ' + r.bytes.length + ' bytes of DWG in ' + (Date.now() - t0) + ' ms');
  return new Response(r.bytes, { status: 200, headers: Object.assign(headers, { 'Content-Type': 'application/acad', 'Content-Disposition': 'attachment; filename="output.dwg"', 'Content-Length': String(r.bytes.length) }) });
}

async function dwg2dxf(req, root, log) {
  const conv = findConverter(root, 'dwg2dxf');
  const early = preamble(req, conv, 'DWG to DXF');
  if (early) return early;
  const headers = { 'Cache-Control': 'no-store', 'X-Anvil-Converter': conv.name };
  const len = +(req.headers.get('content-length') || 0);
  if (len > 200 * 1024 * 1024) return json(413, { error: 'DWG larger than 200 MB', converter: conv.name }, headers);
  const dwg = Buffer.from(await req.arrayBuffer());
  if (dwg.length < 6) return json(400, { error: 'Empty request body: POST the DWG file', converter: conv.name }, headers);
  // every DWG starts with its version, "AC1012" .. "AC1032"
  if (dwg[0] !== 0x41 || dwg[1] !== 0x43) return json(400, { error: 'Not a DWG file (it does not start with an AutoCAD version tag)', converter: conv.name }, headers);
  const t0 = Date.now();
  const r = await convert(conv, dwg, 'dwg', 'dxf');
  if (r.error) { log('dwg2dxf (' + conv.name + '): failed in ' + (Date.now() - t0) + ' ms: ' + r.error.split('\n')[0]); return json(400, { error: r.error, converter: conv.name }, headers); }
  log('dwg2dxf (' + conv.name + '): ' + dwg.length + ' bytes of DWG -> ' + r.bytes.length + ' bytes of DXF in ' + (Date.now() - t0) + ' ms');
  return new Response(r.bytes, { status: 200, headers: Object.assign(headers, { 'Content-Type': 'application/dxf', 'Content-Length': String(r.bytes.length) }) });
}

module.exports = { findConverter, dxf2dwg, dwg2dxf };
