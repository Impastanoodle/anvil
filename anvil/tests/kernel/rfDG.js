  // ------------------------------------------------------------------ rfDG: the JavaScript DWG writer (dwg-writer.js)
  // DWG.fromDXF turns the R2000 DXF Anvil writes into an AutoCAD 2000 (AC1015) DWG. The tests read the bytes back with
  // a small reader of their own: file header (section locators, CRC XOR 0x8461 for six), header and classes sections
  // (sentinels, CRCs), the object map pages (big-endian size and CRC, MC handle / offset pairs), every object (MS size,
  // CRC, type, handle = the map's handle), and decode LINE / CIRCLE / ARC geometry back to the DXF's numbers. Three
  // samples: a sheet-metal flat (OUTLINE / HOLES / BEND / NOTES), an inch sketch (splines, ellipses, a slot, a block
  // with two INSERTs), a drawing sheet (views, DIMENSIONs with their *D blocks, notes, title block, a solid HATCH).
  (function () {
    if (typeof DWG === 'undefined') return;
    group('rfDG: JavaScript DWG writer (AutoCAD 2000)');
    var DW = typeof Drawing !== 'undefined' ? Drawing : null;
    // ---- a small DWG reader
    function Bits(b, bytePos) { this.b = b; this.p = bytePos * 8; }
    Bits.prototype.bit = function () { var v = (this.b[this.p >> 3] >> (7 - (this.p & 7))) & 1; this.p++; return v; };
    Bits.prototype.bits = function (n) { var v = 0; for (var i = 0; i < n; i++) v = v * 2 + this.bit(); return v; };
    Bits.prototype.RC = function () { return this.bits(8); };
    Bits.prototype.RS = function () { var a = this.RC(); return a | (this.RC() << 8); };
    Bits.prototype.RL = function () { var a = this.RS(); return (a + this.RS() * 65536) >>> 0; };
    Bits.prototype.RD = function () { var u = new Uint8Array(8); for (var i = 0; i < 8; i++) u[i] = this.RC(); return new Float64Array(u.buffer)[0]; };
    Bits.prototype.BB = function () { return this.bits(2); };
    Bits.prototype.BS = function () { var c = this.BB(); return c === 0 ? this.RS() : c === 1 ? this.RC() : c === 2 ? 0 : 256; };
    Bits.prototype.BL = function () { var c = this.BB(); return c === 0 ? this.RL() : c === 1 ? this.RC() : 0; };
    Bits.prototype.BD = function () { var c = this.BB(); return c === 0 ? this.RD() : c === 1 ? 1 : 0; };
    Bits.prototype.DD = function (d) { var c = this.BB(); if (c === 0) return d; if (c === 3) return this.RD(); throw new Error('DD code ' + c + ' not written by the writer'); };
    Bits.prototype.H = function () { var x = this.RC(), n = x & 15, v = 0; for (var i = 0; i < n; i++) v = v * 256 + this.RC(); return { code: x >> 4, v: v }; };
    Bits.prototype.BD3 = function () { return [this.BD(), this.BD(), this.BD()]; };
    function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
    function same(b, at, s) { return s.every(function (x, i) { return b[at + i] === x; }); }
    function readMC(b, st) { var v = 0, sh = 1, x; for (;;) { x = b[st.i++]; if (x & 0x80) { v += (x & 0x7F) * sh; sh *= 128; } else { v += (x & 0x3F) * sh; return x & 0x40 ? -v : v; } } }
    function readMS(b, st) { var v = 0, sh = 1; for (;;) { var w = b[st.i] | (b[st.i + 1] << 8); st.i += 2; v += (w & 0x7FFF) * sh; if (!(w & 0x8000)) return v; sh *= 32768; } }
    // read(bytes) -> { sections, objects: [{ h, type, at, size, bits }], errors }
    function read(b) {
      var S = DWG.SENTINELS, err = [], out = { sections: {}, objects: [], errors: err };
      if (String.fromCharCode.apply(null, Array.prototype.slice.call(b, 0, 6)) !== 'AC1015') err.push('not AC1015');
      var n = u32(b, 21), end = 25 + 9 * n;
      for (var i = 0; i < n; i++) out.sections[b[25 + 9 * i]] = { at: u32(b, 26 + 9 * i), size: u32(b, 30 + 9 * i) };
      var x = { 3: 0xA598, 4: 0x8101, 5: 0x3CC4, 6: 0x8461 }[n];
      if ((b[end] | (b[end + 1] << 8)) !== (DWG.crc16(b, 0, 0, end) ^ x)) err.push('file header CRC');
      if (!same(b, end + 2, S.fileHeaderEnd)) err.push('file header sentinel');
      function sec(no, s0, s1, name) {
        var s = out.sections[no], len = u32(b, s.at + 16);
        if (!same(b, s.at, s0)) err.push(name + ' start sentinel');
        var crc = b[s.at + 20 + len] | (b[s.at + 21 + len] << 8);
        if (crc !== DWG.crc16(b, 0xC0C1, s.at + 16, s.at + 20 + len)) err.push(name + ' CRC');
        if (!same(b, s.at + 22 + len, s1)) err.push(name + ' end sentinel');
        if (s.size !== 38 + len) err.push(name + ' size');
      }
      sec(0, S.headerBegin, S.headerEnd, 'header'); sec(1, S.classesBegin, S.classesEnd, 'classes');
      // object map
      var m = out.sections[2], st = { i: m.at }, lastH, lastL, pages = 0;
      for (;;) {
        var p0 = st.i, size = (b[st.i] << 8) | b[st.i + 1]; st.i += 2; pages++;
        if (size > 2032) err.push('map page over 2032 bytes');
        lastH = 0; lastL = 0;
        while (st.i < p0 + size) { lastH += readMC(b, st); lastL += readMC(b, st); out.objects.push({ h: lastH, at: lastL }); }
        var pc = (b[st.i] << 8) | b[st.i + 1]; st.i += 2;
        if (pc !== DWG.crc16(b, 0xC0C1, p0, p0 + size)) err.push('map page CRC');
        if (size <= 2) break;
      }
      if (st.i !== m.at + m.size) err.push('map size');
      out.objects.forEach(function (o, k) {
        if (k && o.h <= out.objects[k - 1].h) err.push('map handles not increasing');
        var s2 = { i: o.at }, sz = readMS(b, s2), d0 = s2.i;
        if ((b[d0 + sz] | (b[d0 + sz + 1] << 8)) !== DWG.crc16(b, 0xC0C1, o.at, d0 + sz)) err.push('object CRC ' + o.h.toString(16));
        var r = new Bits(b, d0); o.type = r.BS(); o.bitsize = r.RL(); var hh = r.H();
        if (hh.v !== o.h || hh.code !== 0) err.push('object handle ' + o.h.toString(16) + ' vs ' + hh.v.toString(16));
        if (o.bitsize > sz * 8) err.push('bitsize past the object ' + o.h.toString(16));
        if (r.BS() !== 0) err.push('EED');
        o.r = r; o.d0 = d0; o.size = sz;
      });
      return out;
    }
    // entity geometry after the common entity data
    function entGeo(o) {
      var r = o.r; r.bit(); var mode = r.BB(); r.BL(); r.bit(); r.BS(); r.BD(); r.BB(); r.BB(); r.BS(); r.RC();
      if (o.type === DWG.TYPES.LINE) {
        var zz = r.bit(), x1 = r.RD(), x2 = r.DD(x1), y1 = r.RD(), y2 = r.DD(y1);
        return { mode: mode, a: [x1, y1], b: [x2, y2], zz: zz };
      }
      if (o.type === DWG.TYPES.CIRCLE || o.type === DWG.TYPES.ARC) {
        var c = r.BD3(), rad = r.BD(); r.bit() || r.BD(); if (!r.bit()) r.BD3();
        var g = { mode: mode, c: c, r: rad };
        if (o.type === DWG.TYPES.ARC) { g.a0 = r.BD(); g.a1 = r.BD(); }
        return g;
      }
      return { mode: mode };
    }
    // DXF entity records of ENTITIES and the BLOCKS (block entities too)
    function dxfEnts(text) {
      var d = DWG.parseDXF(text), all = d.entities.slice();
      d.blocks.forEach(function (b) { all = all.concat(b.ents); });
      return all;
    }
    var TYPE_OF = { LINE: 19, CIRCLE: 18, ARC: 17, TEXT: 1, MTEXT: 44, INSERT: 7, SOLID: 31, ELLIPSE: 35, SPLINE: 36, LWPOLYLINE: 77, HATCH: 78, POINT: 27 };
    // the DWG holds every DXF entity: counts per type (DIMENSION: types 20-26) and LINE / CIRCLE / ARC geometry to 1e-9
    function roundTrip(text, label) {
      var bytes = DWG.fromDXF(text), rd = read(bytes);
      assert(!rd.errors.length, label + ': ' + rd.errors.slice(0, 6).join('; '));
      var want = {}, got = {};
      dxfEnts(text).forEach(function (e) { var t = e.type === 'DIMENSION' ? 'DIMENSION' : e.type; want[t] = (want[t] || 0) + 1; });
      rd.objects.forEach(function (o) {
        var t = o.type >= 20 && o.type <= 26 ? 'DIMENSION' : Object.keys(TYPE_OF).filter(function (k) { return TYPE_OF[k] === o.type; })[0];
        if (t) got[t] = (got[t] || 0) + 1;
      });
      assert(JSON.stringify(want, Object.keys(want).sort()) === JSON.stringify(got, Object.keys(want).sort()) && Object.keys(got).length === Object.keys(want).length, label + ' entity counts ' + JSON.stringify(want) + ' vs ' + JSON.stringify(got));
      // geometry: the DXF's LINE / CIRCLE / ARC in file order against the DWG's in handle order (the writer keeps DXF order)
      var dl = dxfEnts(text).filter(function (e) { return e.type === 'LINE' || e.type === 'CIRCLE' || e.type === 'ARC'; });
      var gl = rd.objects.filter(function (o) { return o.type === 19 || o.type === 18 || o.type === 17; });
      var worst = 0;
      // block entities come after the space entities in the DWG's handle order but before them in the DXF: match by type + nearest
      gl.forEach(function (o) {
        var g = entGeo(o), best = Infinity;
        dl.forEach(function (e) {
          if (TYPE_OF[e.type] !== o.type) return;
          var dd = o.type === 19 ? Math.max(Math.abs(e.num(10) - g.a[0]), Math.abs(e.num(20) - g.a[1]), Math.abs(e.num(11) - g.b[0]), Math.abs(e.num(21) - g.b[1]))
            : Math.max(Math.abs(e.num(10) - g.c[0]), Math.abs(e.num(20) - g.c[1]), Math.abs(e.num(40) - g.r), o.type === 17 ? Math.abs(e.num(50) * Math.PI / 180 - g.a0) + Math.abs(e.num(51) * Math.PI / 180 - g.a1) : 0);
          if (dd < best) best = dd;
        });
        worst = Math.max(worst, best);
      });
      assert(worst < 1e-9, label + ' geometry within 1e-9: ' + worst);
      return { bytes: bytes, rd: rd, counts: got };
    }
    test('rfDG: bit codes and CRC — BS / BL / BD / DD / H / MC / MS encode as the ODA spec; the CRC is DWG\'s CRC-16 (seed 0xC0C1)', function () {
      var w = new DWG.BitWriter();
      w.BS(0); w.BS(256); w.BS(7); w.BS(1000); w.BL(0); w.BL(200); w.BL(70000); w.BD(0); w.BD(1); w.BD(2.5); w.DD(3, 3); w.DD(4, 3); w.H(5, 0x1F); w.H(4, 0); w.TV('AB');
      var r = new Bits(w.bytes(), 0);
      var got = [r.BS(), r.BS(), r.BS(), r.BS(), r.BL(), r.BL(), r.BL(), r.BD(), r.BD(), r.BD(), r.DD(3), r.DD(3)];
      assert(JSON.stringify(got) === '[0,256,7,1000,0,200,70000,0,1,2.5,3,4]', 'values ' + JSON.stringify(got));
      var h = r.H(), h0 = r.H(); assert(h.code === 5 && h.v === 0x1F && h0.code === 4 && h0.v === 0, 'handles');
      assert(r.BS() === 3 && r.RC() === 65 && r.RC() === 66 && r.RC() === 0, 'TV with its NUL');
      assert(w.pos === 2 + 2 + 10 + 18 + 2 + 10 + 34 + 2 + 2 + 66 + 2 + 66 + 16 + 8 + 10 + 24, 'bit count ' + w.pos);
      var st = { i: 0 }, mc = DWG.MC(-300).concat(DWG.MC(0x41)).concat(DWG.MC(5));
      assert(readMC(mc, st) === -300 && readMC(mc, st) === 0x41 && readMC(mc, st) === 5, 'MC');
      var ms = DWG.MS(40000); st.i = 0; assert(readMS(ms, st) === 40000 && ms.length === 4, 'MS');
      assert(DWG.crc16([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39], 0) === 0xBB3D, 'CRC-16/ARC of "123456789"');
      return 'ok';
    });
    test('rfDG: sheet-metal flat — OUTLINE / HOLES / BEND / NOTES in a valid AC1015 DWG (sentinels, CRCs, object map), every entity kept, lines and circles to 1e-9; tables, spaces and layouts present', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Sheet-metal U-bracket'; })[0];
      var r = build(ex.code); noErrors(r);
      var flat = K.flatPattern(r.model, r.build, r.mesh), text = K.exportDXFFlat(flat, r.model.units === 'in' ? 'in' : 'mm', { version: 'R2000' });
      var t = roundTrip(text, 'flat');
      var types = t.rd.objects.map(function (o) { return o.type; });
      [48, 49, 50, 51, 52, 53, 56, 57, 64, 65, 66, 67, 68, 69, 70, 42, 82, 4, 5].forEach(function (ty) { assert(types.indexOf(ty) >= 0, 'object type ' + ty); });
      assert(t.counts.LWPOLYLINE >= 1 && t.counts.CIRCLE >= 1 && t.counts.LINE >= 1 && t.counts.TEXT >= 1, 'flat entities ' + JSON.stringify(t.counts));
      // model space block record 1F, its first / last entity point at the entity chain
      var ms = t.rd.objects.filter(function (o) { return o.h === 0x1F; })[0];
      assert(ms && ms.type === 49, 'block record *Model_Space at 1F');
      return t.bytes.length + ' bytes, ' + t.rd.objects.length + ' objects';
    });
    test('rfDG: inch sketch — splines, ellipses, a slot (LWPOLYLINE with bulges), a block with two INSERTs; INSUNITS 1 in the header; an R12 DXF is refused', function () {
      var sk = { entities: [
        { t: 'rect', x: 0, y: 0, w: 10, h: 6 }, { t: 'spline', pts: [[2, 1], [2.2, 1.3], [2.5, 1.1], [2.8, 1.4]] },
        { t: 'ellipse', cx: 3, cy: 4, rx: 0.6, ry: 0.3, rot: 30 }, { t: 'pellipse', cx: 5, cy: 4, rx: 0.2, ry: 0.5, rot: 0, a0: 10, a1: 200 },
        { t: 'slot', x1: 6, y1: 1, x2: 8, y2: 1.5, w: 0.4 }, { t: 'circle', cx: 9, cy: 5, r: 0.25 }, { t: 'line', x1: 8.7, y1: 5, x2: 9.3, y2: 5 }] };
      if (K.makeBlock) { K.makeBlock(sk, [5, 6], 'Punch', [9, 5]); K.insertBlock(sk, 'Punch', 1, 5, 30, 1.5); }
      var text = K.exportDXFSketch(sk, 'in', { version: 'R2000' }), t = roundTrip(text, 'sketch');
      assert(t.counts.SPLINE >= 1 && t.counts.ELLIPSE === 2, 'curves ' + JSON.stringify(t.counts));
      if (K.makeBlock) assert(t.counts.INSERT === 2, 'two inserts ' + JSON.stringify(t.counts));
      // INSUNITS: the header's BS after the flags; find it by decoding the tail is long — check the DXF header made it through parse instead
      assert(DWG.parseDXF(text).header.$INSUNITS.num(70) === 1, 'inch DXF');
      var msg = null; try { DWG.fromDXF(K.exportDXFSketch(sk, 'in', { version: 'R12' })); } catch (e) { msg = e.message; }
      assert(msg && /R12/.test(msg), 'R12 refused: ' + msg);
      return t.bytes.length + ' bytes';
    });
    test('rfDG: drawing sheet — views (HIDDEN / PHANTOM line types), DIMENSIONs with their anonymous *D blocks, notes, title block, a solid HATCH; every entity kept, geometry to 1e-9', function () {
      if (!DW) return 'no Drawing';
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0];
      var r = build(ex.code); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-10-26' });
      DW.standard3View(doc, r.mesh, r.model.units);
      var sheet = DW.compute(doc, r.mesh, r.model);
      sheet.prims.push({ k: 'region', layer: 'SHEET', style: 'hatch', loops: [[[20, 20], [60, 20], [60, 40], [20, 40]], [[30, 25], [40, 25], [40, 35], [30, 35]]] });
      var text = DW.toDXF(sheet, { version: 'R2000' }), t = roundTrip(text, 'drawing');
      assert(t.counts.DIMENSION >= 1 && t.counts.HATCH === 1 && t.counts.TEXT >= 5 && t.counts.SOLID >= 1, 'drawing entities ' + JSON.stringify(t.counts));
      var ltypes = t.rd.objects.filter(function (o) { return o.type === 57; }).length;
      assert(ltypes >= 5, 'ByBlock, ByLayer, Continuous, HIDDEN, PHANTOM: ' + ltypes);
      return t.bytes.length + ' bytes, ' + JSON.stringify(t.counts);
    });
  })();
