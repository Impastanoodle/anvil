// dwg-writer.js — global `DWG`: an AutoCAD 2000 (AC1015) DWG writer in plain JavaScript, so Save as DWG works with no
// server (the published app, a copy run from disk). It reads the R2000 DXF Anvil already writes (Kernel's DXF writer,
// Drawing.toDXF) and encodes the same drawing as DWG, per the Open Design Alliance "Open Design Specification for .dwg
// files" (R13-R15 sections): bit codes (B, BB, BS, BL, BD, DD, RC, RS, RL, RD, MC, MS, H, TV, CMC, BE, BT), the file
// header with its section locators, the header variables, the (empty) classes section, the objects (tables, blocks,
// entities, dictionaries, layouts) with their handle streams and CRCs, the object map, the template and aux header.
//
//   DWG.fromDXF(dxfText) -> Uint8Array          (throws on an R12 DXF or an entity it cannot write)
//   DWG.parseDXF(dxfText) -> { header, tables, blocks, entities }   (the reader it uses)
//   DWG.crc16(bytes, seed, from, to), DWG.BitWriter, DWG.SENTINELS    (for the tests)
//
// Entities: LINE, ARC, CIRCLE, POINT, ELLIPSE, SPLINE (control points or fit points), LWPOLYLINE (bulges, widths),
// TEXT, MTEXT, INSERT, SOLID, HATCH (polyline / line / arc / ellipse edge paths, solid or line patterns), DIMENSION
// (rotated / aligned / diameter / radius / 3-point angular, with their *D blocks). Tables: VPORT *Active, LTYPE
// (ByBlock, ByLayer, Continuous + the DXF's dashed ones), LAYER (colour, off, frozen, locked, line type, weight),
// STYLE, VIEW / UCS (empty), APPID, DIMSTYLE, BLOCK_RECORD. Objects: the named object dictionary with ACAD_GROUP,
// ACAD_MLINESTYLE (Standard), ACAD_LAYOUT (Model, Layout1) and ACAD_PLOTSETTINGS.
// Every handle is re-numbered (fixed AutoCAD handles 1-21 for the tables and the two spaces, the rest from 0x22).
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ CRC (CRC-16, polynomial 0xA001, DWG's "crc8")
  var CRC_TABLE = (function () {
    var t = [];
    for (var i = 0; i < 256; i++) { var c = i; for (var k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xA001 : c >>> 1; t.push(c); }
    return t;
  })();
  function crc16(bytes, seed, from, to) {
    var dx = seed & 0xFFFF;
    for (var i = from || 0, n = to == null ? bytes.length : to; i < n; i++) dx = (dx >>> 8) ^ CRC_TABLE[(bytes[i] ^ dx) & 0xFF];
    return dx & 0xFFFF;
  }

  // ------------------------------------------------------------------ bit writer (MSB first within each byte)
  var F64 = new Float64Array(1), F64B = new Uint8Array(F64.buffer);
  function BitWriter() { this.buf = new Uint8Array(256); this.pos = 0; }   // pos in bits
  BitWriter.prototype._grow = function (bits) {
    var need = (this.pos + bits + 7) >> 3;
    if (need <= this.buf.length) return;
    var n = new Uint8Array(Math.max(need, this.buf.length * 2)); n.set(this.buf); this.buf = n;
  };
  BitWriter.prototype.bit = function (b) {
    this._grow(1);
    if (b) this.buf[this.pos >> 3] |= 0x80 >> (this.pos & 7);
    this.pos++;
  };
  BitWriter.prototype.bits = function (v, n) { for (var i = n - 1; i >= 0; i--) this.bit((v >>> i) & 1); };
  BitWriter.prototype.B = function (v) { this.bit(v ? 1 : 0); };
  BitWriter.prototype.BB = function (v) { this.bits(v & 3, 2); };
  BitWriter.prototype.RC = function (v) { this.bits(v & 0xFF, 8); };
  BitWriter.prototype.RS = function (v) { this.RC(v & 0xFF); this.RC((v >> 8) & 0xFF); };
  BitWriter.prototype.RL = function (v) { v = v >>> 0; this.RC(v & 0xFF); this.RC((v >>> 8) & 0xFF); this.RC((v >>> 16) & 0xFF); this.RC((v >>> 24) & 0xFF); };
  BitWriter.prototype.RD = function (d) {
    F64[0] = +d;
    // little-endian platforms (every browser and Node we run on); Float64Array bytes are then LE
    for (var i = 0; i < 8; i++) this.RC(F64B[i]);
  };
  BitWriter.prototype.BS = function (v) {
    v = v | 0;
    if (v === 0) this.BB(2);
    else if (v === 256) this.BB(3);
    else if (v > 0 && v < 256) { this.BB(1); this.RC(v); }
    else { this.BB(0); this.RS(v & 0xFFFF); }
  };
  BitWriter.prototype.BL = function (v) {
    v = v | 0;
    if (v === 0) this.BB(2);
    else if (v > 0 && v < 256) { this.BB(1); this.RC(v); }
    else { this.BB(0); this.RL(v); }
  };
  BitWriter.prototype.BD = function (d) {
    d = +d;
    if (d === 1) this.BB(1);
    else if (d === 0 && 1 / d > 0) this.BB(2);
    else { this.BB(0); this.RD(d); }
  };
  BitWriter.prototype.DD = function (d, def) { if (+d === +def) this.BB(0); else { this.BB(3); this.RD(d); } };
  BitWriter.prototype.RD2 = function (p) { this.RD(p[0]); this.RD(p[1]); };
  BitWriter.prototype.BD2 = function (p) { this.BD(p[0]); this.BD(p[1]); };
  BitWriter.prototype.BD3 = function (p) { this.BD(p[0]); this.BD(p[1]); this.BD(p[2] || 0); };
  BitWriter.prototype.DD2 = function (p, def) { this.DD(p[0], def[0]); this.DD(p[1], def[1]); };
  // H: code (4 bits), counter (4 bits), then the handle's significant bytes, most significant first
  BitWriter.prototype.H = function (code, v) {
    v = v || 0;
    var bytes = [];
    while (v > 0) { bytes.unshift(v & 0xFF); v = Math.floor(v / 256); }
    this.RC(((code & 15) << 4) | bytes.length);
    for (var i = 0; i < bytes.length; i++) this.RC(bytes[i]);
  };
  // TV (R2000): BS length (the terminating NUL included, as AutoCAD writes it), then the codepage bytes
  BitWriter.prototype.TV = function (s) {
    s = s == null ? '' : String(s);
    if (!s.length) { this.BS(0); return; }
    this.BS(s.length + 1);
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); this.RC(c < 256 ? c : 63); }
    this.RC(0);
  };
  BitWriter.prototype.CMC = function (i) { this.BS(i); };
  BitWriter.prototype.BE = function (e) {
    if (!e || (e[0] === 0 && e[1] === 0 && e[2] === 1)) this.B(1); else { this.B(0); this.BD3(e); }
  };
  BitWriter.prototype.BT = function (t) { if (!t) this.B(1); else { this.B(0); this.BD(t); } };
  BitWriter.prototype.setRL = function (bitPos, v) {   // overwrite 32 bits (an RL) at a bit position
    var save = this.pos; this.pos = bitPos;
    for (var i = 0; i < 32; i++) { var m = 0x80 >> (this.pos & 7); this.buf[this.pos >> 3] &= ~m; this.pos++; }
    this.pos = bitPos; this.RL(v); this.pos = save;
  };
  BitWriter.prototype.append = function (w) { for (var i = 0; i < w.pos; i++) this.bit((w.buf[i >> 3] >> (7 - (i & 7))) & 1); };
  BitWriter.prototype.bytes = function () { return this.buf.slice(0, (this.pos + 7) >> 3); };   // padded with 0 bits

  // byte-level helpers (outside the bit streams)
  function ByteOut() { this.a = []; }
  ByteOut.prototype.u8 = function (v) { this.a.push(v & 0xFF); };
  ByteOut.prototype.u16 = function (v) { this.u8(v); this.u8(v >> 8); };
  ByteOut.prototype.u16be = function (v) { this.u8(v >> 8); this.u8(v); };
  ByteOut.prototype.u32 = function (v) { v = v >>> 0; this.u8(v); this.u8(v >>> 8); this.u8(v >>> 16); this.u8(v >>> 24); };
  ByteOut.prototype.raw = function (b) { for (var i = 0; i < b.length; i++) this.a.push(b[i] & 0xFF); };
  ByteOut.prototype.str = function (s) { for (var i = 0; i < s.length; i++) this.a.push(s.charCodeAt(i) & 0xFF); };
  // MS: modular short (15 bits per little-endian word, 0x8000 = more words follow)
  function MS(v) { var out = []; do { var w = v & 0x7FFF; v = Math.floor(v / 32768); if (v > 0) w |= 0x8000; out.push(w & 0xFF, w >> 8); } while (v > 0); return out; }
  // MC: modular char, signed (7 bits per byte, 0x80 = more; the last byte has 6 bits and the sign 0x40)
  function MC(v) {
    var neg = v < 0, a = Math.abs(v), out = [];
    while (a >= 0x40) { out.push((a & 0x7F) | 0x80); a = Math.floor(a / 128); }
    out.push(a | (neg ? 0x40 : 0));
    return out;
  }

  var SENTINELS = {
    fileHeaderEnd: [0x95, 0xA0, 0x4E, 0x28, 0x99, 0x82, 0x1A, 0xE5, 0x5E, 0x41, 0xE0, 0x5F, 0x9D, 0x3A, 0x4D, 0x00],
    headerBegin: [0xCF, 0x7B, 0x1F, 0x23, 0xFD, 0xDE, 0x38, 0xA9, 0x5F, 0x7C, 0x68, 0xB8, 0x4E, 0x6D, 0x33, 0x5F],
    headerEnd: [0x30, 0x84, 0xE0, 0xDC, 0x02, 0x21, 0xC7, 0x56, 0xA0, 0x83, 0x97, 0x47, 0xB1, 0x92, 0xCC, 0xA0],
    classesBegin: [0x8D, 0xA1, 0xC4, 0xB8, 0xC4, 0xA9, 0xF8, 0xC5, 0xC0, 0xDC, 0xF4, 0x5F, 0xE7, 0xCF, 0xB6, 0x8A],
    classesEnd: [0x72, 0x5E, 0x3B, 0x47, 0x3B, 0x56, 0x07, 0x3A, 0x3F, 0x23, 0x0B, 0xA0, 0x18, 0x30, 0x49, 0x75],
    imageBegin: [0x1F, 0x25, 0x6D, 0x07, 0xD4, 0x36, 0x28, 0x28, 0x9D, 0x57, 0xCA, 0x3F, 0x9D, 0x44, 0x10, 0x2B],
    imageEnd: [0xE0, 0xDA, 0x92, 0xF8, 0x2B, 0xC9, 0xD7, 0xD7, 0x62, 0xA8, 0x35, 0xC0, 0x62, 0xBB, 0xEF, 0xD4],
    secondBegin: [0xD4, 0x7B, 0x21, 0xCE, 0x28, 0x93, 0x9F, 0xBF, 0x53, 0x24, 0x40, 0x09, 0x12, 0x3C, 0xAA, 0x01],
    secondEnd: [0x2B, 0x84, 0xDE, 0x31, 0xD7, 0x6C, 0x60, 0x40, 0xAC, 0xDB, 0xBF, 0xF6, 0xED, 0xC3, 0x55, 0xFE]
  };
  // the file header CRC is XOR-ed with a value that depends on the number of section locators
  var LOCATOR_XOR = { 3: 0xA598, 4: 0x8101, 5: 0x3CC4, 6: 0x8461 };

  // fixed object type numbers (ODA spec, "Object type codes")
  var T = { TEXT: 1, BLOCK: 4, ENDBLK: 5, INSERT: 7, ARC: 17, CIRCLE: 18, LINE: 19, DIM_ORDINATE: 20, DIM_LINEAR: 21,
    DIM_ALIGNED: 22, DIM_ANG3PT: 23, DIM_ANG2LN: 24, DIM_RADIUS: 25, DIM_DIAMETER: 26, POINT: 27, SOLID: 31,
    ELLIPSE: 35, SPLINE: 36, DICTIONARY: 42, MTEXT: 44, BLOCK_CONTROL: 48, BLOCK_HEADER: 49, LAYER_CONTROL: 50,
    LAYER: 51, STYLE_CONTROL: 52, STYLE: 53, LTYPE_CONTROL: 56, LTYPE: 57, VIEW_CONTROL: 60, UCS_CONTROL: 62,
    VPORT_CONTROL: 64, VPORT: 65, APPID_CONTROL: 66, APPID: 67, DIMSTYLE_CONTROL: 68, DIMSTYLE: 69, VX_CONTROL: 70,
    MLINESTYLE: 73, LWPOLYLINE: 77, HATCH: 78, LAYOUT: 82 };
  // handle reference codes
  var SOFT_OWN = 2, HARD_OWN = 3, SOFT_PTR = 4, HARD_PTR = 5;

  // ------------------------------------------------------------------ DXF reader (group code / value pairs)
  function readPairs(text) {
    var lines = String(text).split(/\r?\n/), out = [];
    for (var i = 0; i + 1 < lines.length; i += 2) {
      var c = parseInt(lines[i], 10);
      if (isNaN(c)) { if (!lines[i].trim()) { i--; continue; } throw new Error('DXF: bad group code "' + lines[i] + '" at line ' + (i + 1)); }
      out.push([c, lines[i + 1]]);
    }
    return out;
  }
  function Rec(type) { this.type = type; this.p = []; }
  Rec.prototype.get = function (c, d) { for (var i = 0; i < this.p.length; i++) if (this.p[i][0] === c) return this.p[i][1]; return d; };
  Rec.prototype.num = function (c, d) { var v = this.get(c); if (v == null) return d; v = parseFloat(v); return isFinite(v) ? v : d; };
  Rec.prototype.str = function (c, d) { var v = this.get(c); return v == null ? d : String(v).replace(/^\s+|\s+$/g, ''); };
  Rec.prototype.pt = function (c, d) { return [this.num(c, d ? d[0] : 0), this.num(c + 10, d ? d[1] : 0), this.num(c + 20, d ? d[2] || 0 : 0)]; };
  function parseDXF(text) {
    var P = readPairs(text), i = 0, out = { header: {}, tables: {}, blocks: [], entities: [] };
    function recs(stop) {   // records from i until a 0-pair whose value is in stop
      var list = [], cur = null;
      while (i < P.length) {
        var c = P[i][0], v = P[i][1];
        if (c === 0) {
          v = v.trim();
          if (stop[v]) return list;
          cur = new Rec(v); list.push(cur);
        } else if (cur) cur.p.push([c, v]);
        i++;
      }
      return list;
    }
    while (i < P.length) {
      if (P[i][0] !== 0) { i++; continue; }
      var v = P[i][1].trim();
      if (v === 'EOF') break;
      if (v !== 'SECTION') { i++; continue; }
      var name = P[i + 1] && P[i + 1][0] === 2 ? P[i + 1][1].trim() : '';
      i += 2;
      if (name === 'HEADER') {
        var key = null;
        while (i < P.length && !(P[i][0] === 0 && P[i][1].trim() === 'ENDSEC')) {
          if (P[i][0] === 9) { key = P[i][1].trim(); out.header[key] = new Rec(key); }
          else if (key) out.header[key].p.push(P[i]);
          i++;
        }
      } else if (name === 'TABLES') {
        while (i < P.length && !(P[i][0] === 0 && P[i][1].trim() === 'ENDSEC')) {
          if (P[i][0] === 0 && P[i][1].trim() === 'TABLE') {
            var tn = P[i + 1][1].trim(); i += 2;
            while (i < P.length && P[i][0] !== 0) i++;   // the table's own head (handle, count)
            out.tables[tn] = recs({ ENDTAB: 1 });
            i++;
          } else i++;
        }
      } else if (name === 'BLOCKS') {
        var all = recs({ ENDSEC: 1 }), blk = null;
        all.forEach(function (r) {
          if (r.type === 'BLOCK') { blk = { rec: r, name: r.str(2, ''), ents: [] }; out.blocks.push(blk); }
          else if (r.type === 'ENDBLK') blk = null;
          else if (blk) blk.ents.push(r);
        });
      } else if (name === 'ENTITIES') out.entities = recs({ ENDSEC: 1 });
      while (i < P.length && !(P[i][0] === 0 && P[i][1].trim() === 'ENDSEC')) i++;
      i++;
    }
    return out;
  }

  // ------------------------------------------------------------------ helpers
  var D2R = Math.PI / 180;
  var LW = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
  function lwIndex(v) {   // DXF 370 (hundredths of a mm; -1 ByLayer, -2 ByBlock, -3 Default) -> the DWG index
    if (v == null || isNaN(v) || v === -1) return 29;
    if (v === -2) return 30;
    if (v === -3 || v < 0) return 31;
    var best = 0; for (var k = 1; k < LW.length; k++) if (Math.abs(LW[k] - v) < Math.abs(LW[best] - v)) best = k;
    return best;
  }
  function upper(s) { return String(s || '').toUpperCase(); }

  // ------------------------------------------------------------------ the writer
  function fromDXF(text) {
    var dxf = parseDXF(text);
    var ver = dxf.header.$ACADVER ? dxf.header.$ACADVER.str(1, '') : '';
    if (/^AC1009$/i.test(ver) || (!ver && /\nVERTEX\r?\n/.test(text))) throw new Error('DWG is made from an R2000 DXF (AC1015); this DXF is R12. Export it as R2000 first.');
    var hv = function (name, code, d) { var r = dxf.header[name]; return r ? r.num(code, d) : d; };
    var insunits = hv('$INSUNITS', 70, 4) | 0, inch = insunits === 1 || insunits === 2, metric = !inch;
    var measurement = hv('$MEASUREMENT', 70, metric ? 1 : 0) | 0;

    // ---- handles
    var nextH = 0x22;
    function alloc() { return nextH++; }
    var H = { BLOCK_CONTROL: 1, LAYER_CONTROL: 2, STYLE_CONTROL: 3, LTYPE_CONTROL: 5, VIEW_CONTROL: 6, UCS_CONTROL: 7,
      VPORT_CONTROL: 8, APPID_CONTROL: 9, DIMSTYLE_CONTROL: 0xA, VX_CONTROL: 0xB, NOD: 0xC, GROUPS: 0xD, LAYER0: 0x10,
      STANDARD: 0x11, ACAD: 0x12, BYBLOCK: 0x14, BYLAYER: 0x15, CONTINUOUS: 0x16, PS: 0x1B, PS_BLOCK: 0x1C, PS_END: 0x1D,
      MS: 0x1F, MS_BLOCK: 0x20, MS_END: 0x21 };
    H.MLSTYLES = alloc(); H.MLSTYLE = alloc(); H.LAYOUTS = alloc(); H.PLOTSETTINGS = alloc(); H.LAYOUT_MODEL = alloc(); H.LAYOUT_PS = alloc();

    // ---- tables
    var T_ = dxf.tables;
    // line types (ByBlock / ByLayer / Continuous fixed; any other from the DXF)
    var ltypes = [], ltByName = {};
    ltByName.BYBLOCK = H.BYBLOCK; ltByName.BYLAYER = H.BYLAYER; ltByName.CONTINUOUS = H.CONTINUOUS;
    (T_.LTYPE || []).forEach(function (r) {
      var nm = r.str(2, ''), u = upper(nm);
      if (!nm || u === 'BYBLOCK' || u === 'BYLAYER' || u === 'CONTINUOUS') return;
      var dashes = []; r.p.forEach(function (q) { if (q[0] === 49) dashes.push(+q[1]); });
      var lt = { h: alloc(), name: nm, desc: r.str(3, ''), total: r.num(40, 0), dashes: dashes };
      ltypes.push(lt); ltByName[u] = lt.h;
    });
    // text styles (Standard fixed at 0x11)
    var styles = [], styleByName = {};
    var stdRec = null;
    (T_.STYLE || []).forEach(function (r) {
      var nm = r.str(2, '');
      if (!nm) return;
      if (upper(nm) === 'STANDARD' && !stdRec) { stdRec = r; return; }
      var s = { h: alloc(), name: nm, rec: r }; styles.push(s); styleByName[upper(nm)] = s.h;
    });
    styles.unshift({ h: H.STANDARD, name: 'Standard', rec: stdRec || new Rec('STYLE') });
    styleByName.STANDARD = H.STANDARD;
    // layers (0 fixed at 0x10)
    var layers = [], layerByName = {};
    var l0 = null;
    (T_.LAYER || []).forEach(function (r) {
      var nm = r.str(2, '');
      if (nm === '' || layerByName[upper(nm)]) return;
      var L = { h: nm === '0' ? H.LAYER0 : alloc(), name: nm, rec: r };
      if (nm === '0') l0 = L; else layers.push(L);
      layerByName[upper(nm)] = L.h;
    });
    if (!l0) { l0 = { h: H.LAYER0, name: '0', rec: new Rec('LAYER') }; layerByName['0'] = H.LAYER0; }
    layers.unshift(l0);
    function layerOf(name) {
      var u = upper(name == null ? '0' : name);
      if (layerByName[u]) return layerByName[u];
      var L = { h: alloc(), name: String(name), rec: new Rec('LAYER') }; layers.push(L); layerByName[u] = L.h;
      return L.h;
    }
    // dimension styles
    var dimstyles = [], dimByName = {};
    (T_.DIMSTYLE || []).forEach(function (r) { var nm = r.str(2, ''); if (!nm || dimByName[upper(nm)]) return; var d = { h: alloc(), name: nm, rec: r }; dimstyles.push(d); dimByName[upper(nm)] = d.h; });
    if (!dimByName.STANDARD) { var dsd = { h: alloc(), name: 'Standard', rec: new Rec('DIMSTYLE') }; dimstyles.unshift(dsd); dimByName.STANDARD = dsd.h; }
    // app ids
    var appids = [{ h: H.ACAD, name: 'ACAD' }];
    (T_.APPID || []).forEach(function (r) { var nm = r.str(2, ''); if (nm && upper(nm) !== 'ACAD') appids.push({ h: alloc(), name: nm }); });
    // viewport *Active
    var vpRec = null; (T_.VPORT || []).forEach(function (r) { if (!vpRec && upper(r.str(2, '')) === '*ACTIVE') vpRec = r; });
    var vport = { h: alloc(), rec: vpRec || new Rec('VPORT') };

    // ---- blocks: model space, paper space, then each named block from the DXF
    var blocks = [], blockByName = {};
    var ms = { h: H.MS, name: '*Model_Space', blockH: H.MS_BLOCK, endH: H.MS_END, ents: [], base: [0, 0, 0], flags: 0, mode: 2, layout: H.LAYOUT_MODEL };
    var ps = { h: H.PS, name: '*Paper_Space', blockH: H.PS_BLOCK, endH: H.PS_END, ents: [], base: [0, 0, 0], flags: 0, mode: 1, layout: H.LAYOUT_PS };
    blocks.push(ms, ps); blockByName['*MODEL_SPACE'] = ms; blockByName['*PAPER_SPACE'] = ps;
    dxf.blocks.forEach(function (b) {
      var u = upper(b.name);
      if (u === '*MODEL_SPACE') { ms.ents = ms.ents.concat(b.ents); return; }
      if (u === '*PAPER_SPACE') { ps.ents = ps.ents.concat(b.ents); return; }
      if (blockByName[u]) throw new Error('DXF: block "' + b.name + '" is defined twice');
      var nb = { h: alloc(), name: b.name, blockH: 0, endH: 0, ents: b.ents, base: b.rec.pt(10), flags: b.rec.num(70, 0) | 0, mode: 0, layout: 0 };
      nb.blockH = alloc(); nb.endH = alloc();
      blocks.push(nb); blockByName[u] = nb;
    });
    dxf.entities.forEach(function (e) { (e.num(67, 0) === 1 ? ps : ms).ents.push(e); });
    // entity handles, links and inserts
    var inserts = {};   // block handle -> [insert handles]
    blocks.forEach(function (b) {
      b.items = b.ents.map(function (e) { return { rec: e, h: alloc() }; });
      b.items.forEach(function (it, k) {
        it.prev = k ? b.items[k - 1].h : 0; it.next = k + 1 < b.items.length ? b.items[k + 1].h : 0;
        if (it.rec.type === 'INSERT') {
          var tb = blockByName[upper(it.rec.str(2, ''))];
          if (!tb) throw new Error('DXF: INSERT of an undefined block "' + it.rec.str(2, '') + '"');
          (inserts[tb.h] = inserts[tb.h] || []).push(it.h);
        }
      });
    });
    var handseed = nextH;

    // ---- object encoding
    var objects = [];   // { h, bytes }
    function obj(type, h, fill, isEntity) {
      var w = new BitWriter(), hs = new BitWriter();
      w.BS(type);
      var rlPos = w.pos; w.RL(0);
      w.H(0, h);
      w.BS(0);   // no extended entity data
      fill(w, hs);
      var bitsize = w.pos;
      w.setRL(rlPos, bitsize);
      w.append(hs);
      var data = w.bytes(), head = MS(data.length), all = new Uint8Array(head.length + data.length + 2);
      all.set(head, 0); all.set(data, head.length);
      var crc = crc16(all, 0xC0C1, 0, head.length + data.length);
      all[all.length - 2] = crc & 0xFF; all[all.length - 1] = crc >> 8;
      objects.push({ h: h, type: type, bytes: all });
      return all;
    }
    // non-entity object: BL reactors 0; handles: owner (soft pointer), xdictionary (none)
    function objHead(w, hs, owner) { w.BL(0); hs.H(SOFT_PTR, owner); hs.H(HARD_OWN, 0); }
    // table record: + name, 64-flag, xref index, xref dependent; handles: + xref block (null)
    function recHead(w, hs, owner, name) { objHead(w, hs, owner); w.TV(name); w.B(0); w.BS(0); w.B(0); hs.H(HARD_PTR, 0); }
    // entity common data. o: { owner (block record), mode (0 in a block, 1 paper, 2 model), prev, next, rec (DXF) }
    function entHead(w, hs, o) {
      var r = o.rec, ltn = r ? r.str(6, '') : '', ltu = upper(ltn);
      w.B(0);                          // no graphic image
      w.BB(o.mode);
      w.BL(0);                         // reactors
      w.B(0);                          // nolinks = 0: previous / next entity handles follow
      var color = r ? r.num(62, 256) : 256;
      w.CMC(color | 0);
      w.BD(r ? r.num(48, 1) : 1);
      var ltFlag = !ltn || ltu === 'BYLAYER' ? 0 : ltu === 'BYBLOCK' ? 1 : ltu === 'CONTINUOUS' ? 2 : 3;
      if (ltFlag === 3 && !ltByName[ltu]) throw new Error('DXF: line type "' + ltn + '" is not in the LTYPE table');
      w.BB(ltFlag);
      w.BB(0);                         // plot style ByLayer
      w.BS(r ? r.num(60, 0) | 0 : 0);  // invisible
      w.RC(lwIndex(r ? r.num(370, -1) : -1));
      if (o.mode === 0) hs.H(SOFT_PTR, o.owner);
      hs.H(HARD_OWN, 0);               // xdictionary
      hs.H(SOFT_PTR, o.prev || 0); hs.H(SOFT_PTR, o.next || 0);
      hs.H(HARD_PTR, r ? layerOf(r.str(8, '0')) : H.LAYER0);
      if (ltFlag === 3) hs.H(HARD_PTR, ltByName[ltu]);
    }
    function control(type, h, entries, extra) {
      obj(type, h, function (w, hs) {
        objHead(w, hs, 0);
        w.BS(entries.length);
        if (type === T.DIMSTYLE_CONTROL) w.RC(0);   // R2000: number of additional handles
        entries.forEach(function (e) { hs.H(SOFT_OWN, e); });
        (extra || []).forEach(function (e) { hs.H(HARD_OWN, e); });
      });
    }
    function dict(h, owner, items) {   // items: [[name, handle]]
      obj(T.DICTIONARY, h, function (w, hs) {
        objHead(w, hs, owner);
        w.BL(items.length); w.BS(1); w.RC(0);
        items.forEach(function (it) { w.TV(it[0]); });
        items.forEach(function (it) { hs.H(SOFT_OWN, it[1]); });
      });
    }

    // control objects
    control(T.BLOCK_CONTROL, H.BLOCK_CONTROL, blocks.filter(function (b) { return b.mode === 0; }).map(function (b) { return b.h; }), [H.MS, H.PS]);
    control(T.LAYER_CONTROL, H.LAYER_CONTROL, layers.map(function (l) { return l.h; }));
    control(T.STYLE_CONTROL, H.STYLE_CONTROL, styles.map(function (s) { return s.h; }));
    control(T.LTYPE_CONTROL, H.LTYPE_CONTROL, [H.CONTINUOUS].concat(ltypes.map(function (l) { return l.h; })), [H.BYBLOCK, H.BYLAYER]);
    control(T.VIEW_CONTROL, H.VIEW_CONTROL, []);
    control(T.UCS_CONTROL, H.UCS_CONTROL, []);
    control(T.VPORT_CONTROL, H.VPORT_CONTROL, [vport.h]);
    control(T.APPID_CONTROL, H.APPID_CONTROL, appids.map(function (a) { return a.h; }));
    control(T.DIMSTYLE_CONTROL, H.DIMSTYLE_CONTROL, dimstyles.map(function (d) { return d.h; }));
    control(T.VX_CONTROL, H.VX_CONTROL, []);
    // dictionaries
    dict(H.NOD, 0, [['ACAD_GROUP', H.GROUPS], ['ACAD_LAYOUT', H.LAYOUTS], ['ACAD_MLINESTYLE', H.MLSTYLES], ['ACAD_PLOTSETTINGS', H.PLOTSETTINGS]]);
    dict(H.GROUPS, H.NOD, []);
    dict(H.MLSTYLES, H.NOD, [['Standard', H.MLSTYLE]]);
    dict(H.LAYOUTS, H.NOD, [['Layout1', H.LAYOUT_PS], ['Model', H.LAYOUT_MODEL]]);
    dict(H.PLOTSETTINGS, H.NOD, []);
    // MLINESTYLE Standard (CMLSTYLE): two elements at ±0.5
    obj(T.MLINESTYLE, H.MLSTYLE, function (w, hs) {
      objHead(w, hs, H.MLSTYLES);
      w.TV('Standard'); w.TV(''); w.BS(0); w.CMC(256); w.BD(Math.PI / 2); w.BD(Math.PI / 2);
      w.RC(2);
      [0.5, -0.5].forEach(function (off) { w.BD(off); w.CMC(256); w.BS(32767); });   // 32767: the ByLayer line type index
    });

    // LTYPE records
    function ltypeRec(h, name, desc, total, dashes) {
      obj(T.LTYPE, h, function (w, hs) {
        recHead(w, hs, H.LTYPE_CONTROL, name);
        w.TV(desc); w.BD(total); w.RC(65); w.RC(dashes.length);
        dashes.forEach(function (d) { w.BD(d); w.BS(0); w.RD(0); w.RD(0); w.BD(1); w.BD(0); w.BS(0); hs.H(HARD_PTR, 0); });
        for (var i = 0; i < 256; i++) w.RC(0);   // R2000: the 256-byte strings area
      });
    }
    ltypeRec(H.BYBLOCK, 'ByBlock', '', 0, []);
    ltypeRec(H.BYLAYER, 'ByLayer', '', 0, []);
    ltypeRec(H.CONTINUOUS, 'Continuous', 'Solid line', 0, []);
    ltypes.forEach(function (lt) { ltypeRec(lt.h, lt.name, lt.desc, lt.total, lt.dashes); });

    // LAYER records: flags (frozen 1, frozen in new viewports 4, locked 8, plot 16, weight index << 5), colour (negative = off)
    layers.forEach(function (L) {
      obj(T.LAYER, L.h, function (w, hs) {
        var r = L.rec, f70 = r.num(70, 0) | 0, plot = r.num(290, 1) !== 0;
        recHead(w, hs, H.LAYER_CONTROL, L.name);
        var flags = (f70 & 1 ? 1 : 0) | (f70 & 2 ? 4 : 0) | (f70 & 4 ? 8 : 0) | (plot ? 16 : 0) | (lwIndex(r.num(370, -3)) << 5);
        w.BS(flags);
        var c = r.num(62, 7) | 0; if (c === 0) c = 7;
        w.CMC(c);
        hs.H(HARD_PTR, 0);   // plot style (Normal)
        var ltn = upper(r.str(6, 'Continuous'));
        hs.H(HARD_PTR, ltByName[ltn] || H.CONTINUOUS);
      });
    });

    // STYLE records
    styles.forEach(function (s) {
      obj(T.STYLE, s.h, function (w, hs) {
        var r = s.rec, f = r.num(70, 0) | 0;
        recHead(w, hs, H.STYLE_CONTROL, s.name);
        w.B(f & 1); w.B(f & 4);
        w.BD(r.num(40, 0)); w.BD(r.num(41, 1)); w.BD(r.num(50, 0) * D2R); w.RC(r.num(71, 0) | 0);
        w.BD(r.num(42, inch ? 0.2 : 2.5)); w.TV(r.str(3, 'txt')); w.TV(r.str(4, ''));
      });
    });

    // VIEW / UCS: none. APPID records
    appids.forEach(function (a) { obj(T.APPID, a.h, function (w, hs) { recHead(w, hs, H.APPID_CONTROL, a.name); w.RC(0); }); });

    // VPORT *Active
    var extMin = dxf.header.$EXTMIN ? dxf.header.$EXTMIN.pt(10) : [0, 0, 0], extMax = dxf.header.$EXTMAX ? dxf.header.$EXTMAX.pt(10) : [inch ? 12 : 420, inch ? 9 : 297, 0];
    obj(T.VPORT, vport.h, function (w, hs) {
      var r = vport.rec, vh = r.num(40, Math.max(extMax[1] - extMin[1], 1) * 1.1), ar = r.num(41, 1.5);
      recHead(w, hs, H.VPORT_CONTROL, '*Active');
      w.BD(vh); w.BD(vh * ar);
      w.RD2([r.num(12, (extMin[0] + extMax[0]) / 2), r.num(22, (extMin[1] + extMax[1]) / 2)]);
      w.BD3([r.num(17, 0), r.num(27, 0), r.num(37, 0)]); w.BD3([r.num(16, 0), r.num(26, 0), r.num(36, 1)]);
      w.BD(r.num(51, 0) * D2R); w.BD(r.num(42, 50)); w.BD(r.num(43, 0)); w.BD(r.num(44, 0));
      w.bits(r.num(71, 0) & 15, 4);   // VIEWMODE
      w.RC(0);                         // render mode
      w.RD2([r.num(10, 0), r.num(20, 0)]); w.RD2([r.num(11, 1), r.num(21, 1)]);
      w.B(0); w.BS(r.num(72, 100) | 0); w.B(1); w.BB(r.num(74, 3) | 0); w.B(0); w.RD2([r.num(15, 0), r.num(25, 0)]);
      w.B(0); w.B(0); w.BS(0); w.BD(0); w.RD2([r.num(13, 0), r.num(23, 0)]); w.RD2([r.num(14, 1), r.num(24, 1)]);
      w.B(0); w.B(1);                  // UCS at origin, UCSVP
      w.BD3([0, 0, 0]); w.BD3([1, 0, 0]); w.BD3([0, 1, 0]); w.BD(0); w.BS(0);
      hs.H(HARD_PTR, 0); hs.H(HARD_PTR, 0);   // named UCS, base UCS
    });

    // DIMSTYLE records (and the header's DIM variables from the first one)
    var DIMV = [   // [name, kind, DXF code, inch default, metric default]
      ['DIMSCALE', 'BD', 40, 1, 1], ['DIMASZ', 'BD', 41, 0.18, 2.5], ['DIMEXO', 'BD', 42, 0.0625, 0.625], ['DIMDLI', 'BD', 43, 0.38, 3.75],
      ['DIMEXE', 'BD', 44, 0.18, 1.25], ['DIMRND', 'BD', 45, 0, 0], ['DIMDLE', 'BD', 46, 0, 0], ['DIMTP', 'BD', 47, 0, 0], ['DIMTM', 'BD', 48, 0, 0],
      ['DIMTOL', 'B', 71, 0, 0], ['DIMLIM', 'B', 72, 0, 0], ['DIMTIH', 'B', 73, 1, 0], ['DIMTOH', 'B', 74, 1, 0], ['DIMSE1', 'B', 75, 0, 0], ['DIMSE2', 'B', 76, 0, 0],
      ['DIMTAD', 'BS', 77, 0, 1], ['DIMZIN', 'BS', 78, 0, 8], ['DIMAZIN', 'BS', 79, 0, 0],
      ['DIMTXT', 'BD', 140, 0.18, 2.5], ['DIMCEN', 'BD', 141, 0.09, 2.5], ['DIMTSZ', 'BD', 142, 0, 0], ['DIMALTF', 'BD', 143, 25.4, 0.0393700787],
      ['DIMLFAC', 'BD', 144, 1, 1], ['DIMTVP', 'BD', 145, 0, 0], ['DIMTFAC', 'BD', 146, 1, 1], ['DIMGAP', 'BD', 147, 0.09, 0.625], ['DIMALTRND', 'BD', 148, 0, 0],
      ['DIMALT', 'B', 170, 0, 0], ['DIMALTD', 'BS', 171, 2, 3], ['DIMTOFL', 'B', 172, 0, 1], ['DIMSAH', 'B', 173, 0, 0], ['DIMTIX', 'B', 174, 0, 0], ['DIMSOXD', 'B', 175, 0, 0],
      ['DIMCLRD', 'CMC', 176, 0, 0], ['DIMCLRE', 'CMC', 177, 0, 0], ['DIMCLRT', 'CMC', 178, 0, 0],
      ['DIMADEC', 'BS', 179, 0, 0], ['DIMDEC', 'BS', 271, 4, 2], ['DIMTDEC', 'BS', 272, 4, 2], ['DIMALTU', 'BS', 273, 2, 2], ['DIMALTTD', 'BS', 274, 2, 3],
      ['DIMAUNIT', 'BS', 275, 0, 0], ['DIMFRAC', 'BS', 276, 0, 0], ['DIMLUNIT', 'BS', 277, 2, 2], ['DIMDSEP', 'BS', 278, 46, 44], ['DIMTMOVE', 'BS', 279, 0, 0],
      ['DIMJUST', 'BS', 280, 0, 0], ['DIMSD1', 'B', 281, 0, 0], ['DIMSD2', 'B', 282, 0, 0], ['DIMTOLJ', 'BS', 283, 1, 0], ['DIMTZIN', 'BS', 284, 0, 8],
      ['DIMALTZ', 'BS', 285, 0, 0], ['DIMALTTZ', 'BS', 286, 0, 0], ['DIMUPT', 'B', 288, 0, 0], ['DIMATFIT', 'BS', 289, 3, 3]
    ];
    function dimVal(rec, d) { var v = rec ? rec.num(d[2], null) : null; return v == null ? (metric ? d[4] : d[3]) : v; }
    function dimFields(w, rec) {
      DIMV.forEach(function (d) {
        var v = dimVal(rec, d);
        if (d[1] === 'BD') w.BD(v); else if (d[1] === 'B') w.B(v); else if (d[1] === 'BS') w.BS(v | 0); else w.CMC(v | 0);
      });
    }
    dimstyles.forEach(function (ds) {
      obj(T.DIMSTYLE, ds.h, function (w, hs) {
        var r = ds.rec;
        recHead(w, hs, H.DIMSTYLE_CONTROL, ds.name);
        w.TV(r.str(3, '')); w.TV(r.str(4, ''));
        dimFields(w, r);
        w.BS(r.num(371, -2) | 0); w.BS(r.num(372, -2) | 0);
        w.B(0);
        hs.H(HARD_PTR, H.STANDARD);   // DIMTXSTY
        hs.H(HARD_PTR, 0); hs.H(HARD_PTR, 0); hs.H(HARD_PTR, 0); hs.H(HARD_PTR, 0);   // arrow blocks: closed filled
      });
    });
    var dim0 = dimstyles[0];

    // ---- LAYOUT objects (Model, Layout1): plot settings + layout data
    function layout(h, name, br, tab, pspace) {
      obj(T.LAYOUT, h, function (w, hs) {
        objHead(w, hs, H.LAYOUTS);
        // plot settings: page setup name, printer, flags, margins, paper width / height (mm), paper size, plot origin,
        // paper units (0 in, 1 mm), rotation, plot type (5 layout, 0 display), window, view name, real world / drawing
        // units, style sheet, standard scale type (16 = 1:1), scale factor, paper image origin
        w.TV(''); w.TV('None'); w.BS(pspace ? 688 : 1712);
        w.BD(6.35); w.BD(6.35); w.BD(6.35); w.BD(6.35);
        w.BD(inch ? 279.4 : 297); w.BD(inch ? 215.9 : 210); w.TV(inch ? 'Letter' : 'ISO_A4_(297.00_x_210.00_MM)');
        w.BD2([0, 0]);
        w.BS(inch ? 0 : 1); w.BS(0); w.BS(pspace ? 5 : 0);
        w.BD2([0, 0]); w.BD2([0, 0]);
        w.TV('');
        w.BD(1); w.BD(1);
        w.TV('');
        w.BS(16); w.BD(1); w.BD2([0, 0]);
        // layout
        w.TV(name); w.BS(tab); w.BS(1);                          // name, tab order, flags (PSLTSCALE)
        w.BD3([0, 0, 0]);                                        // UCS origin
        w.RD2([0, 0]); w.RD2(pspace ? [inch ? 12 : 420, inch ? 9 : 297] : [inch ? 12 : 420, inch ? 9 : 297]);   // limits
        w.BD3([0, 0, 0]); w.BD3([1, 0, 0]); w.BD3([0, 1, 0]); w.BD(0); w.BS(0);   // ins base, UCS axes, elevation, ortho type
        w.BD3(extMin); w.BD3(extMax);
        hs.H(SOFT_PTR, br);   // the layout's block record
        hs.H(SOFT_PTR, 0);    // last active viewport
        hs.H(HARD_PTR, 0); hs.H(HARD_PTR, 0);   // base UCS, named UCS
      });
    }
    layout(H.LAYOUT_MODEL, 'Model', H.MS, 0, false);
    layout(H.LAYOUT_PS, 'Layout1', H.PS, 1, true);

    // ---- blocks: BLOCK_HEADER, BLOCK, the entities, ENDBLK
    blocks.forEach(function (b) {
      var ins = inserts[b.h] || [];
      obj(T.BLOCK_HEADER, b.h, function (w, hs) {
        recHead(w, hs, H.BLOCK_CONTROL, b.name);
        w.B(b.flags & 1); w.B(b.flags & 2); w.B(0); w.B(0);   // anonymous, has attributes, xref, overlaid
        w.B(0);                                              // loaded
        w.BD3(b.base); w.TV('');
        ins.forEach(function () { w.RC(1); }); w.RC(0);
        w.TV(''); w.BL(0);                                   // description, preview size
        hs.H(HARD_OWN, b.blockH);
        hs.H(SOFT_PTR, b.items.length ? b.items[0].h : 0); hs.H(SOFT_PTR, b.items.length ? b.items[b.items.length - 1].h : 0);
        hs.H(HARD_OWN, b.endH);
        ins.forEach(function (ih) { hs.H(SOFT_PTR, ih); });
        hs.H(HARD_PTR, b.layout);
      });
      var mode = b.mode === 0 ? 0 : b.mode;
      obj(T.BLOCK, b.blockH, function (w, hs) { entHead(w, hs, { owner: b.h, mode: mode, rec: null }); w.TV(b.name); });
      b.items.forEach(function (it) { entity(it, b); });
      obj(T.ENDBLK, b.endH, function (w, hs) { entHead(w, hs, { owner: b.h, mode: mode, rec: null }); });
    });

    function entity(it, b) {
      var r = it.rec, type = r.type, o = { owner: b.h, mode: b.mode === 0 ? 0 : b.mode, prev: it.prev, next: it.next, rec: r };
      var ext = r.pt(210, [0, 0, 1]);
      function E(t, fill) { obj(t, it.h, function (w, hs) { entHead(w, hs, o); fill(w, hs); }); }
      if (type === 'LINE') E(T.LINE, function (w) {
        var a = r.pt(10), c = r.pt(11), zz = a[2] === 0 && c[2] === 0;
        w.B(zz); w.RD(a[0]); w.DD(c[0], a[0]); w.RD(a[1]); w.DD(c[1], a[1]);
        if (!zz) { w.RD(a[2]); w.DD(c[2], a[2]); }
        w.BT(r.num(39, 0)); w.BE(ext);
      });
      else if (type === 'CIRCLE') E(T.CIRCLE, function (w) { w.BD3(r.pt(10)); w.BD(r.num(40, 0)); w.BT(r.num(39, 0)); w.BE(ext); });
      else if (type === 'ARC') E(T.ARC, function (w) {
        w.BD3(r.pt(10)); w.BD(r.num(40, 0)); w.BT(r.num(39, 0)); w.BE(ext); w.BD(r.num(50, 0) * D2R); w.BD(r.num(51, 0) * D2R);
      });
      else if (type === 'POINT') E(T.POINT, function (w) { var p = r.pt(10); w.BD(p[0]); w.BD(p[1]); w.BD(p[2]); w.BT(r.num(39, 0)); w.BE(ext); w.BD(r.num(50, 0) * D2R); });
      else if (type === 'ELLIPSE') E(T.ELLIPSE, function (w) {
        w.BD3(r.pt(10)); w.BD3(r.pt(11)); w.BD3(ext); w.BD(r.num(40, 1)); w.BD(r.num(41, 0)); w.BD(r.num(42, 2 * Math.PI));
      });
      else if (type === 'SPLINE') E(T.SPLINE, function (w) {
        var f = r.num(70, 0) | 0, knots = [], weights = [], cps = [], fits = [];
        r.p.forEach(function (q, k) {
          if (q[0] === 40) knots.push(+q[1]);
          else if (q[0] === 41) weights.push(+q[1]);
          else if (q[0] === 10) cps.push([+q[1], +(r.p[k + 1] && r.p[k + 1][0] === 20 ? r.p[k + 1][1] : 0), +(r.p[k + 2] && r.p[k + 2][0] === 30 ? r.p[k + 2][1] : 0)]);
          else if (q[0] === 11) fits.push([+q[1], +(r.p[k + 1] && r.p[k + 1][0] === 21 ? r.p[k + 1][1] : 0), +(r.p[k + 2] && r.p[k + 2][0] === 31 ? r.p[k + 2][1] : 0)]);
        });
        var scen = cps.length ? 1 : 2;
        w.BL(scen); w.BL(r.num(71, 3) | 0);
        if (scen === 2) {
          w.BD(r.num(44, 1e-10)); w.BD3(r.pt(12)); w.BD3(r.pt(13)); w.BL(fits.length); fits.forEach(function (p) { w.BD3(p); });
        } else {
          var weighted = weights.length === cps.length && weights.some(function (x) { return x !== 1; });
          w.B(f & 4 ? 1 : 0); w.B(f & 1 ? 1 : 0); w.B(f & 2 ? 1 : 0);
          w.BD(r.num(42, 1e-10)); w.BD(r.num(43, 1e-10));
          w.BL(knots.length); w.BL(cps.length); w.B(weighted);
          knots.forEach(function (k) { w.BD(k); });
          cps.forEach(function (p, k) { w.BD3(p); if (weighted) w.BD(weights[k]); });
        }
      });
      else if (type === 'TEXT') E(T.TEXT, function (w, hs) {
        var p = r.pt(10), a = r.get(11) != null ? r.pt(11) : p, rot = r.num(50, 0), wf = r.num(41, 1), obl = r.num(51, 0);
        var gen = r.num(71, 0) | 0, ha = r.num(72, 0) | 0, va = r.num(73, 0) | 0, el = p[2];
        var hasAlign = r.get(11) != null && (ha || va);
        var df = (el === 0 ? 1 : 0) | (hasAlign ? 0 : 2) | (obl === 0 ? 4 : 0) | (rot === 0 ? 8 : 0) | (wf === 1 ? 16 : 0) | (gen === 0 ? 32 : 0) | (ha === 0 ? 64 : 0) | (va === 0 ? 128 : 0);
        w.RC(df);
        if (!(df & 1)) w.RD(el);
        w.RD2(p);
        if (!(df & 2)) w.DD2(a, p);
        w.BE(ext); w.BT(r.num(39, 0));
        if (!(df & 4)) w.RD(obl * D2R);
        if (!(df & 8)) w.RD(rot * D2R);
        w.RD(r.num(40, 1));
        if (!(df & 16)) w.RD(wf);
        w.TV(r.get(1, ''));
        if (!(df & 32)) w.BS(gen);
        if (!(df & 64)) w.BS(ha);
        if (!(df & 128)) w.BS(va);
        hs.H(HARD_PTR, styleByName[upper(r.str(7, 'Standard'))] || H.STANDARD);
      });
      else if (type === 'MTEXT') E(T.MTEXT, function (w, hs) {
        var txt = ''; r.p.forEach(function (q) { if (q[0] === 3) txt += q[1]; }); txt += r.get(1, '');
        var xd = r.get(11) != null ? r.pt(11) : [Math.cos(r.num(50, 0) * D2R), Math.sin(r.num(50, 0) * D2R), 0];
        w.BD3(r.pt(10)); w.BD3(ext); w.BD3(xd); w.BD(r.num(41, 0)); w.BD(r.num(40, 1)); w.BS(r.num(71, 1) | 0); w.BS(r.num(72, 1) | 0);
        w.BD(r.num(43, 0)); w.BD(r.num(42, 0)); w.TV(txt); w.BS(r.num(73, 1) | 0); w.BD(r.num(44, 1)); w.B(0);
        hs.H(HARD_PTR, styleByName[upper(r.str(7, 'Standard'))] || H.STANDARD);
      });
      else if (type === 'INSERT') E(T.INSERT, function (w, hs) {
        var sx = r.num(41, 1), sy = r.num(42, 1), sz = r.num(43, 1);
        w.BD3(r.pt(10));
        if (sx === 1 && sy === 1 && sz === 1) w.BB(3);
        else if (sx === sy && sx === sz) { w.BB(2); w.RD(sx); }
        else if (sx === 1) { w.BB(1); w.DD(sy, 1); w.DD(sz, 1); }
        else { w.BB(0); w.RD(sx); w.DD(sy, sx); w.DD(sz, sx); }
        w.BD(r.num(50, 0) * D2R); w.BD3(ext); w.B(0);
        hs.H(HARD_PTR, blockByName[upper(r.str(2, ''))].h);
      });
      else if (type === 'SOLID' || type === 'TRACE') E(T.SOLID, function (w) {
        w.BT(r.num(39, 0)); w.BD(r.num(30, 0));
        w.RD2([r.num(10, 0), r.num(20, 0)]); w.RD2([r.num(11, 0), r.num(21, 0)]); w.RD2([r.num(12, 0), r.num(22, 0)]); w.RD2([r.num(13, r.num(12, 0)), r.num(23, r.num(22, 0))]);
        w.BE(ext);
      });
      else if (type === 'LWPOLYLINE') E(T.LWPOLYLINE, function (w) {
        var pts = [], bul = [], wid = [], cw = r.get(43) != null ? r.num(43, 0) : 0, el = r.num(38, 0), th = r.num(39, 0);
        r.p.forEach(function (q, k) {
          if (q[0] === 10) { pts.push([+q[1], r.p[k + 1] && r.p[k + 1][0] === 20 ? +r.p[k + 1][1] : 0]); bul.push(0); wid.push([0, 0]); }
          else if (q[0] === 42 && pts.length) bul[pts.length - 1] = +q[1];
          else if (q[0] === 40 && pts.length) wid[pts.length - 1][0] = +q[1];
          else if (q[0] === 41 && pts.length) wid[pts.length - 1][1] = +q[1];
        });
        var hasB = bul.some(function (x) { return x !== 0; }), hasW = wid.some(function (x) { return x[0] || x[1]; });
        var extOn = !(ext[0] === 0 && ext[1] === 0 && ext[2] === 1);
        var flag = (extOn ? 1 : 0) | (th ? 2 : 0) | (cw ? 4 : 0) | (el ? 8 : 0) | (hasB ? 16 : 0) | (hasW ? 32 : 0) | ((r.num(70, 0) | 0) & 1 ? 512 : 0) | ((r.num(70, 0) | 0) & 128 ? 256 : 0);
        w.BS(flag);
        if (flag & 4) w.BD(cw);
        if (flag & 8) w.BD(el);
        if (flag & 2) w.BD(th);
        if (flag & 1) w.BD3(ext);
        w.BL(pts.length);
        if (hasB) w.BL(pts.length);
        if (hasW) w.BL(pts.length);
        pts.forEach(function (p, k) { if (k === 0) w.RD2(p); else w.DD2(p, pts[k - 1]); });
        if (hasB) bul.forEach(function (x) { w.BD(x); });
        if (hasW) wid.forEach(function (x) { w.BD(x[0]); w.BD(x[1]); });
      });
      else if (type === 'HATCH') E(T.HATCH, function (w) { hatch(w, r, ext); });
      else if (type === 'DIMENSION') {
        var kind = (r.num(70, 0) | 0) & 7;
        var dt = [T.DIM_LINEAR, T.DIM_ALIGNED, T.DIM_ANG2LN, T.DIM_DIAMETER, T.DIM_RADIUS, T.DIM_ANG3PT, T.DIM_ORDINATE][kind];
        if (!dt) throw new Error('DXF: DIMENSION type ' + kind + ' is not written to DWG');
        E(dt, function (w, hs) {
          var f70 = r.num(70, 0) | 0, tm = r.pt(11);
          w.BD3(ext); w.RD2(tm); w.BD(tm[2]);
          w.RC((f70 & 128 ? 0 : 1) | (f70 & 32 ? 2 : 0));
          w.TV(r.get(1, '')); w.BD(r.num(53, 0) * D2R); w.BD(r.num(51, 0) * D2R);
          w.BD3([1, 1, 1]); w.BD(0);
          w.BS(r.num(71, 5) | 0); w.BS(r.num(72, 1) | 0); w.BD(r.num(41, 1)); w.BD(r.num(42, 0));
          w.RD2(r.pt(12));
          if (dt === T.DIM_LINEAR || dt === T.DIM_ALIGNED) {
            w.BD3(r.pt(13)); w.BD3(r.pt(14)); w.BD3(r.pt(10)); w.BD(r.num(52, 0) * D2R);
            if (dt === T.DIM_LINEAR) w.BD(r.num(50, 0) * D2R);
          } else if (dt === T.DIM_DIAMETER) { w.BD3(r.pt(15)); w.BD3(r.pt(10)); w.BD(r.num(40, 0)); }
          else if (dt === T.DIM_RADIUS) { w.BD3(r.pt(10)); w.BD3(r.pt(15)); w.BD(r.num(40, 0)); }
          else if (dt === T.DIM_ANG3PT) { w.BD3(r.pt(10)); w.BD3(r.pt(13)); w.BD3(r.pt(14)); w.BD3(r.pt(15)); }
          else if (dt === T.DIM_ANG2LN) { w.RD2(r.pt(16)); w.BD3(r.pt(13)); w.BD3(r.pt(14)); w.BD3(r.pt(15)); w.BD3(r.pt(10)); }
          else { w.BD3(r.pt(10)); w.BD3(r.pt(13)); w.BD3(r.pt(14)); w.RC(f70 & 64 ? 1 : 0); }
          hs.H(HARD_PTR, dimByName[upper(r.str(3, 'Standard'))] || dim0.h);
          var bn = blockByName[upper(r.str(2, ''))];
          hs.H(HARD_PTR, bn ? bn.h : 0);
        });
      } else throw new Error('DWG: the ' + type + ' entity is not written by the DWG writer');
    }

    function hatch(w, r, ext) {
      var P = r.p, k = 0;
      function at(c) { return P[k] && P[k][0] === c; }
      function take(c, d) { if (at(c)) return +P[k++][1]; return d; }
      function skipTo(c) { while (k < P.length && P[k][0] !== c) k++; }
      skipTo(91);
      var paths = [], np = take(91, 0);
      for (var pi = 0; pi < np; pi++) {
        skipTo(92);
        var path = { flag: take(92, 0) | 0 };
        if (path.flag & 2) {
          path.bulges = take(72, 0) | 0; path.closed = take(73, 1) | 0; var nv = take(93, 0); path.pts = [];
          for (var vi = 0; vi < nv; vi++) { var x = take(10, 0), y = take(20, 0), b = path.bulges ? take(42, 0) : 0; path.pts.push([x, y, b]); }
        } else {
          var ne = take(93, 0); path.edges = [];
          for (var ei = 0; ei < ne; ei++) {
            var et = take(72, 1) | 0, ed = { t: et };
            if (et === 1) { ed.a = [take(10, 0), take(20, 0)]; ed.b = [take(11, 0), take(21, 0)]; }
            else if (et === 2) { ed.c = [take(10, 0), take(20, 0)]; ed.r = take(40, 0); ed.a0 = take(50, 0); ed.a1 = take(51, 0); ed.ccw = take(73, 1); }
            else if (et === 3) { ed.c = [take(10, 0), take(20, 0)]; ed.m = [take(11, 0), take(21, 0)]; ed.ratio = take(40, 1); ed.a0 = take(50, 0); ed.a1 = take(51, 0); ed.ccw = take(73, 1); }
            else throw new Error('DWG: hatch spline edges are not written by the DWG writer');
            path.edges.push(ed);
          }
        }
        path.nsrc = take(97, 0) | 0; for (var si = 0; si < path.nsrc; si++) take(330, 0);
        path.nsrc = 0;
        paths.push(path);
      }
      var style = take(75, 0) | 0, ptype = take(76, 1) | 0, solid = r.num(70, 0) | 0;
      var angle = 0, scale = 1, dbl = 0, lines = [];
      if (!solid) {
        angle = take(52, 0); scale = take(41, 1); dbl = take(77, 0) | 0; var nl = take(78, 0) | 0;
        for (var li = 0; li < nl; li++) {
          var L = { ang: take(53, 0), base: [take(43, 0), take(44, 0)], off: [take(45, 0), take(46, 0)], dashes: [] }, nd = take(79, 0) | 0;
          for (var di = 0; di < nd; di++) L.dashes.push(take(49, 0));
          lines.push(L);
        }
      }
      var pix = take(47, null);
      var seeds = [], ns = take(98, 0) | 0;
      for (var s2 = 0; s2 < ns; s2++) seeds.push([take(10, 0), take(20, 0)]);
      w.BD(r.num(30, 0)); w.BD3(ext); w.TV(r.get(2, solid ? 'SOLID' : 'USER')); w.B(solid); w.B(r.num(71, 0) | 0);
      w.BL(paths.length);
      var derived = false;
      paths.forEach(function (p) {
        w.BL(p.flag); if (p.flag & 4) derived = true;
        if (p.flag & 2) {
          w.B(p.bulges); w.B(p.closed); w.BL(p.pts.length);
          p.pts.forEach(function (q) { w.RD2(q); if (p.bulges) w.BD(q[2]); });
        } else {
          w.BL(p.edges.length);
          p.edges.forEach(function (e) {
            w.RC(e.t);
            if (e.t === 1) { w.RD2(e.a); w.RD2(e.b); }
            else if (e.t === 2) { w.RD2(e.c); w.BD(e.r); w.BD(e.a0 * D2R); w.BD(e.a1 * D2R); w.B(e.ccw); }
            else { w.RD2(e.c); w.RD2(e.m); w.BD(e.ratio); w.BD(e.a0 * D2R); w.BD(e.a1 * D2R); w.B(e.ccw); }
          });
        }
        w.BL(0);   // source boundary objects
      });
      w.BS(style); w.BS(ptype);
      if (!solid) {
        w.BD(angle * D2R); w.BD(scale); w.B(dbl); w.BS(lines.length);
        lines.forEach(function (L) {
          w.BD(L.ang * D2R); w.BD2(L.base); w.BD2(L.off); w.BS(L.dashes.length); L.dashes.forEach(function (d) { w.BD(d); });
        });
      }
      if (derived) w.BD(pix == null ? 0 : pix);
      w.BL(seeds.length); seeds.forEach(function (q) { w.RD2(q); });
    }

    // ---- header variables
    var hw = new BitWriter();
    (function header(w) {
      var ltscale = hv('$LTSCALE', 40, 1), lwdisplay = hv('$LWDISPLAY', 290, 0);
      w.BD(412148564080.0); w.BD(1); w.BD(1); w.BD(1); w.TV(''); w.TV(''); w.TV(''); w.TV('');
      w.BL(24); w.BL(0);
      w.H(HARD_PTR, 0);                                  // current viewport entity header
      // DIMASO DIMSHO PLINEGEN ORTHOMODE REGENMODE FILLMODE QTEXTMODE PSLTSCALE LIMCHECK USRTIMER SKPOLY ANGDIR SPLFRAME
      // MIRRTEXT WORLDVIEW TILEMODE PLIMCHECK VISRETAIN DISPSILH PELLIPSE
      [1, 1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0].forEach(function (b) { w.B(b); });
      w.BS(1);                                           // PROXYGRAPHICS
      w.BS(3020);                                        // TREEDEPTH
      w.BS(hv('$LUNITS', 70, 2) | 0); w.BS(inch ? 4 : 4); w.BS(0); w.BS(0);   // LUNITS LUPREC AUNITS AUPREC
      w.BS(1); w.BS(0);                                  // ATTMODE PDMODE
      w.BS(0); w.BS(0); w.BS(0); w.BS(0); w.BS(0);       // USERI1-5
      w.BS(8); w.BS(6); w.BS(6); w.BS(6); w.BS(6); w.BS(6); w.BS(6); w.BS(3); w.BS(70); w.BS(0); w.BS(64); w.BS(4); w.BS(0); w.BS(50);
      // SPLINESEGS SURFU SURFV SURFTYPE SURFTAB1 SURFTAB2 SPLINETYPE SHADEDGE SHADEDIF UNITMODE MAXACTVP ISOLINES CMLJUST TEXTQLTY
      w.BD(ltscale); w.BD(inch ? 0.2 : 2.5); w.BD(inch ? 0.05 : 1); w.BD(inch ? 0.1 : 1); w.BD(0); w.BD(0); w.BD(0); w.BD(0); w.BD(0);
      // LTSCALE TEXTSIZE TRACEWID SKETCHINC FILLETRAD THICKNESS ANGBASE PDSIZE PLINEWID
      w.BD(0); w.BD(0); w.BD(0); w.BD(0); w.BD(0);       // USERR1-5
      w.BD(0); w.BD(0); w.BD(0); w.BD(0); w.BD(0.5); w.BD(1); w.BD(1);   // CHAMFERA-D FACETRES CMLSCALE CELTSCALE
      w.TV('.');                                         // MENUNAME
      var now = new Date(), jd = Math.floor(now.getTime() / 86400000) + 2440588, msd = now.getTime() % 86400000;
      w.BL(jd); w.BL(msd); w.BL(jd); w.BL(msd);          // TDCREATE TDUPDATE
      w.BL(0); w.BL(0); w.BL(0); w.BL(0);                // TDINDWG TDUSRTIMER
      w.CMC(256);                                        // CECOLOR ByLayer
      w.H(0, handseed);                                  // HANDSEED
      w.H(HARD_PTR, H.LAYER0); w.H(HARD_PTR, H.STANDARD); w.H(HARD_PTR, H.BYLAYER); w.H(HARD_PTR, dim0.h); w.H(HARD_PTR, H.MLSTYLE);
      w.BD(0);                                           // PSVPSCALE
      var pmax = [inch ? 12 : 420, inch ? 9 : 297];
      w.BD3([0, 0, 0]); w.BD3([1e20, 1e20, 1e20]); w.BD3([-1e20, -1e20, -1e20]); w.RD2([0, 0]); w.RD2(pmax); w.BD(0);   // PINSBASE PEXTMIN PEXTMAX PLIMMIN PLIMMAX PELEVATION
      w.BD3([0, 0, 0]); w.BD3([1, 0, 0]); w.BD3([0, 1, 0]); w.H(HARD_PTR, 0); w.H(HARD_PTR, 0); w.BS(0); w.H(HARD_PTR, 0);
      for (var i = 0; i < 6; i++) w.BD3([0, 0, 0]);      // PUCSORG TOP..BACK
      w.BD3([0, 0, 0]); w.BD3(extMin); w.BD3(extMax); w.RD2([0, 0]); w.RD2(pmax); w.BD(0);   // INSBASE EXTMIN EXTMAX LIMMIN LIMMAX ELEVATION
      w.BD3([0, 0, 0]); w.BD3([1, 0, 0]); w.BD3([0, 1, 0]); w.H(HARD_PTR, 0); w.H(HARD_PTR, 0); w.BS(0); w.H(HARD_PTR, 0);
      for (i = 0; i < 6; i++) w.BD3([0, 0, 0]);
      var dr = dim0.rec;
      w.TV(dr.str(3, '')); w.TV(dr.str(4, ''));          // DIMPOST DIMAPOST
      dimFields(w, dr);
      w.H(HARD_PTR, H.STANDARD); w.H(HARD_PTR, 0); w.H(HARD_PTR, 0); w.H(HARD_PTR, 0); w.H(HARD_PTR, 0);   // DIMTXSTY DIMLDRBLK DIMBLK DIMBLK1 DIMBLK2
      w.BS(dr.num(371, -2) | 0); w.BS(dr.num(372, -2) | 0);   // DIMLWD DIMLWE
      [H.BLOCK_CONTROL, H.LAYER_CONTROL, H.STYLE_CONTROL, H.LTYPE_CONTROL, H.VIEW_CONTROL, H.UCS_CONTROL, H.VPORT_CONTROL, H.APPID_CONTROL, H.DIMSTYLE_CONTROL, H.VX_CONTROL]
        .forEach(function (h) { w.H(HARD_OWN, h); });
      w.H(HARD_PTR, H.GROUPS); w.H(HARD_PTR, H.MLSTYLES); w.H(HARD_OWN, H.NOD);
      w.BS(1); w.BS(70); w.TV(''); w.TV('');             // TSTACKALIGN TSTACKSIZE HYPERLINKBASE STYLESHEET
      w.H(HARD_PTR, H.LAYOUTS); w.H(HARD_PTR, H.PLOTSETTINGS); w.H(HARD_PTR, 0);   // dictionaries: layouts, plot settings, plot styles
      // flags: CELWEIGHT ByLayer (29), LWDISPLAY (0x200 = off), XEDIT on, EXTNAMES (0x800), PSTYLEMODE colour-dependent (0x2000)
      w.BL(29 | (lwdisplay ? 0 : 0x200) | 0x800 | 0x2000);
      w.BS(insunits); w.BS(0);                           // INSUNITS CEPSNTYPE (ByLayer)
      w.TV(guid()); w.TV(guid());                        // FINGERPRINTGUID VERSIONGUID
      w.H(HARD_PTR, H.PS); w.H(HARD_PTR, H.MS); w.H(HARD_PTR, H.BYLAYER); w.H(HARD_PTR, H.BYBLOCK); w.H(HARD_PTR, H.CONTINUOUS);
      w.BS(0); w.BS(0); w.BS(0); w.BS(0);                // unknown shorts
    })(hw);
    function guid() {
      var hex = '0123456789ABCDEF', s = '{';
      for (var i = 0; i < 32; i++) { s += hex[Math.floor(Math.random() * 16)]; if (i === 7 || i === 11 || i === 15 || i === 19) s += '-'; }
      return s + '}';
    }

    // ---- assemble the file
    var NLOC = 6, out = new ByteOut();
    var fileHeaderLen = 6 + 5 + 1 + 1 + 4 + 2 + 2 + 4 + NLOC * 9 + 2 + 16;
    var hdrData = hw.bytes(), hdrSec = new ByteOut();
    hdrSec.raw(SENTINELS.headerBegin); var hs0 = hdrSec.a.length; hdrSec.u32(hdrData.length); hdrSec.raw(hdrData);
    hdrSec.u16(crc16(hdrSec.a, 0xC0C1, hs0, hdrSec.a.length)); hdrSec.raw(SENTINELS.headerEnd);
    var clsSec = new ByteOut();
    clsSec.raw(SENTINELS.classesBegin); var cs0 = clsSec.a.length; clsSec.u32(0);
    clsSec.u16(crc16(clsSec.a, 0xC0C1, cs0, clsSec.a.length)); clsSec.raw(SENTINELS.classesEnd);
    clsSec.u32(0x0DCA);   // R2000: four bytes after the classes' end sentinel (as AutoCAD writes them)
    var hdrAt = fileHeaderLen, clsAt = hdrAt + hdrSec.a.length, objAt = clsAt + clsSec.a.length;
    // objects, in handle order
    objects.sort(function (a, b) { return a.h - b.h; });
    var objBytes = new ByteOut(), locs = [];
    objects.forEach(function (o) { locs.push([o.h, objAt + objBytes.a.length]); objBytes.raw(o.bytes); });
    // object map: pages of at most 2032 bytes (RS big-endian size, offset pairs, RS big-endian CRC); an empty last page
    var mapAt = objAt + objBytes.a.length, map = new ByteOut(), k = 0;
    while (k < locs.length) {
      var page = [0, 0], lastH = 0, lastL = 0;
      while (k < locs.length) {
        var pr = MC(locs[k][0] - lastH).concat(MC(locs[k][1] - lastL));
        if (page.length + pr.length > 2030) break;
        page = page.concat(pr); lastH = locs[k][0]; lastL = locs[k][1]; k++;
      }
      page[0] = (page.length >> 8) & 0xFF; page[1] = page.length & 0xFF;
      var pc = crc16(page, 0xC0C1);
      map.raw(page); map.u16be(pc);
    }
    var last = [0, 2], lc = crc16(last, 0xC0C1); map.raw(last); map.u16be(lc);
    // object free space (53 bytes), template (MEASUREMENT), aux header, image (none)
    var freeAt = mapAt + map.a.length, free = new ByteOut();
    free.u32(0); free.u32(objects.length); free.u32(0); free.u32(0); free.u32(objAt); free.u8(4);
    [0x32, 0, 0x64, 0, 0x200, 0, 0xFFFFFFFF, 0].forEach(function (v) { free.u32(v); });
    var tmplAt = freeAt + free.a.length, tmpl = new ByteOut(); tmpl.u16(0); tmpl.u16(measurement);
    var auxAt = tmplAt + tmpl.a.length, aux = new ByteOut();
    aux.raw([0xFF, 0x77, 0x01]); aux.u16(0x17); aux.u16(0); aux.u32(1); aux.u32(0xFFFFFFFF); aux.u16(1); aux.u16(0); aux.u32(0);
    aux.u16(0x17); aux.u16(0); aux.u16(0x17); aux.u16(0);
    [0x0005, 0x0893, 0x0005, 0x0893, 0, 1].forEach(function (v) { aux.u16(v); });
    for (var z = 0; z < 5; z++) aux.u32(0);
    aux.u32(0); aux.u32(0); aux.u32(0); aux.u32(0);       // TDCREATE TDUPDATE
    aux.u32(handseed); aux.u32(0); aux.u16(0); aux.u16(1); aux.u32(0); aux.u32(0); aux.u32(0); aux.u32(1); aux.u32(0); aux.u32(0);
    var imgAt = auxAt + aux.a.length, img = new ByteOut();
    img.raw(SENTINELS.imageBegin); img.u32(1); img.u8(0); img.raw(SENTINELS.imageEnd);
    // file header
    var fh = new ByteOut();
    fh.str('AC1015'); fh.raw([0, 0, 0, 0, 0, 0x0F, 1]); fh.u32(imgAt); fh.u8(0x17); fh.u8(0); fh.u16(30); fh.u32(NLOC);
    [[0, hdrAt, hdrSec.a.length], [1, clsAt, clsSec.a.length - 4], [2, mapAt, map.a.length], [3, freeAt, free.a.length], [4, tmplAt, tmpl.a.length], [5, auxAt, aux.a.length]]
      .forEach(function (s) { fh.u8(s[0]); fh.u32(s[1]); fh.u32(s[2]); });
    fh.u16(crc16(fh.a, 0) ^ LOCATOR_XOR[NLOC]);
    fh.raw(SENTINELS.fileHeaderEnd);
    if (fh.a.length !== fileHeaderLen) throw new Error('DWG: file header length ' + fh.a.length);
    var parts = [fh.a, hdrSec.a, clsSec.a, objBytes.a, map.a, free.a, tmpl.a, aux.a, img.a], total = 0;
    parts.forEach(function (p) { total += p.length; });
    var res = new Uint8Array(total), at = 0;
    parts.forEach(function (p) { res.set(p, at); at += p.length; });
    return res;
  }

  var DWG = { fromDXF: fromDXF, parseDXF: parseDXF, crc16: crc16, BitWriter: BitWriter, SENTINELS: SENTINELS, MC: MC, MS: MS, TYPES: T, VERSION: 'AC1015' };
  root.DWG = DWG;
  if (typeof module !== 'undefined' && module.exports) module.exports = DWG;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
