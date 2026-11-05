// static-serve.js — a plain static file server for the anvil/ folder, for machines without Windows PowerShell (the
// GitHub Actions Linux runners, .github/workflows/ci.yml). Same MIME types and no-cache answers as anvil/serve.ps1, but
// no DWG converter: /api/dxf2dwg and /api/dwg2dxf answer 503 { error, converter: null }, as serve.ps1 does when
// neither the ODA File Converter nor LibreDWG is installed, so those tests take their "no converter" path.
// Usage: node anvil/headless/static-serve.js [port]   (default 8812)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 8812;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.gz': 'application/gzip' };

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); res.end(); return; }
  if (/^\/api\/(dxf2dwg|dwg2dxf)$/.test(rel)) {
    req.resume();
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'No DWG converter on this server.', converter: null }));
    return;
  }
  let file = path.join(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) { file = path.join(file, 'index.html'); try { st = fs.statSync(file); err = null; } catch (e) { err = e; } }
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-cache, no-store, must-revalidate' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, 'localhost', () => console.log('Serving ' + ROOT + ' at http://localhost:' + PORT + '/'));
