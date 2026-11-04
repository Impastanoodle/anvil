// make-icon.js — draws Anvil's app icon (an anvil on a blue tile, with a spark) and writes assets/icon.png (256 px)
// and assets/icon.ico (16..256 px, PNG-compressed entries). No packages: a tiny polygon rasterizer with 4x4
// supersampling and Node's zlib for the PNG. Run: node make-icon.js
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// shapes in a 0..1 square; later shapes paint over earlier ones
const ANVIL = [
  [0.08, 0.33], [0.14, 0.31], [0.22, 0.295], [0.30, 0.285], [0.36, 0.28], [0.90, 0.28], [0.90, 0.42], [0.72, 0.42],
  [0.66, 0.50], [0.66, 0.62], [0.80, 0.70], [0.82, 0.79], [0.24, 0.79], [0.26, 0.70], [0.42, 0.62], [0.42, 0.50],
  [0.34, 0.44], [0.26, 0.405], [0.18, 0.375], [0.12, 0.355]
];
const FACE = [[0.36, 0.28], [0.90, 0.28], [0.90, 0.315], [0.36, 0.315], [0.30, 0.30]];
const BASE = [[0.26, 0.74], [0.80, 0.74], [0.82, 0.79], [0.24, 0.79]];
function star(cx, cy, r) {
  const p = [];
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.28 : r; p.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  return p;
}
const SPARK = star(0.78, 0.16, 0.085), SPARK2 = star(0.64, 0.12, 0.045);

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
// the colour of one sample point, or null (transparent)
function sample(x, y) {
  if (!inTile(x, y)) return null;
  let c = [Math.round(42 - 18 * y), Math.round(84 - 34 * y), Math.round(134 - 46 * y)];   // blue tile, darker at the bottom
  if (inPoly(x, y, ANVIL)) c = [214, 220, 228];
  if (inPoly(x, y, BASE)) c = [168, 176, 188];
  if (inPoly(x, y, FACE)) c = [250, 251, 253];
  if (inPoly(x, y, SPARK) || inPoly(x, y, SPARK2)) c = [255, 160, 40];
  return c;
}
function render(size) {
  const S = 4, px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const c = sample((pxi + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
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
