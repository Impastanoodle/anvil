// make-icon.js — draws Anvil's app icon (the menu bar's shaded anvil on a blue tile) and writes assets/icon.png
// (256 px) and assets/icon.ico (16..256 px, PNG-compressed entries). The anvil's facets are read from the logo in
// ../anvil/index.html (#logo: an outline group, then one filled <polygon> per facet), so the two always match.
// No packages: a tiny polygon rasterizer with 4x4 supersampling and Node's zlib for the PNG. Run: node make-icon.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// the logo's facets: { fill: [r, g, b], pts: [[x, y], ...] } in its viewBox units, painted in order
const HTML = fs.readFileSync(path.join(__dirname, '..', 'anvil', 'index.html'), 'utf8');
const LOGO = (/<div id="logo"[^>]*>([\s\S]*?)<\/div>/.exec(HTML) || [])[1] || '';
const VIEW = ((/viewBox="([^"]+)"/.exec(LOGO) || [])[1] || '').split(/\s+/).map(Number);
const EDGE_HEX = (/<g fill="(#[0-9a-f]{6})"/i.exec(LOGO) || [])[1];
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const FACETS = [];
LOGO.replace(/<polygon fill="(#[0-9a-f]{6})"[^>]*points="([^"]+)"/gi, (m, fill, pts) => {
  const n = pts.trim().split(/[\s,]+/).map(Number), p = [];
  for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]);
  FACETS.push({ fill: hex(fill), pts: p });
});
if (!FACETS.length || VIEW.length !== 4 || !EDGE_HEX) throw new Error('make-icon.js: no anvil logo (#logo svg) found in anvil/index.html');
const EDGE = hex(EDGE_HEX);
// the anvil spans 86 % of the tile's width, centred
const FIT = 0.86 / VIEW[2], OX = 0.5 - VIEW[2] * FIT / 2 - VIEW[0] * FIT, OY = 0.5 - VIEW[3] * FIT / 2 - VIEW[1] * FIT;

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function inTile(x, y) {   // rounded square, corner radius 0.2, 0.02 margin
  const m = 0.02, r = 0.2;
  if (x < m || x > 1 - m || y < m || y > 1 - m) return false;
  const cx = Math.min(Math.max(x, m + r), 1 - m - r), cy = Math.min(Math.max(y, m + r), 1 - m - r);
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}
function segDist2(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  const ex = a[0] + t * dx - x, ey = a[1] + t * dy - y;
  return ex * ex + ey * ey;
}
// the colour of one sample point, or null (transparent); edge: the outline's half width in logo units
function sample(x, y, edge) {
  if (!inTile(x, y)) return null;
  let c = [Math.round(42 - 18 * y), Math.round(84 - 34 * y), Math.round(134 - 46 * y)];   // blue tile, darker at the bottom
  const lx = (x - OX) / FIT, ly = (y - OY) / FIT;
  let hit = null;
  FACETS.forEach((f) => { if (inPoly(lx, ly, f.pts)) hit = f.fill; });
  if (hit) return hit;
  const e2 = edge * edge;
  const near = FACETS.some((f) => f.pts.some((p, i) => segDist2(lx, ly, p, f.pts[(i + 1) % f.pts.length]) <= e2));
  return near ? EDGE : c;
}
function render(size) {
  const edge = Math.max(1.5, 0.9 / size / FIT);   // about a pixel of outline at the small sizes
  const S = 4, px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = sample((pxi + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size, edge);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const o = (py * size + pxi) * 4;
      if (a) { px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); }
      px[o + 3] = Math.round(255 * a / (S * S));
    }
  }
  return px;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const px = render(size), raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(sizes) {
  const imgs = sizes.map(png), head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s; head[e + 2] = 0; head[e + 3] = 0;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6); head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
    off += imgs[i].length;
  });
  return Buffer.concat([head].concat(imgs));
}
const out = path.join(__dirname, 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), png(256));
fs.writeFileSync(path.join(out, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('wrote assets/icon.png and assets/icon.ico');
