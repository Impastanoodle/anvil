  // --- rfOM (2026-11-18, lane exportaudit, test-reports/2026-11-18-export-audit.md) --- the export audit's fixes as a
  // user meets them: DXF/DWG Import (File > Open of a DXF: UI.importDXFText, the PM, ✓) of a flat written with a
  // Boundary box round filleted corners and of a tray whose outline has a .0007 step beside a relief (both came in
  // with no closed outline), a fit spline with zero tangents; Flat to DXF's extents header; Save As DWG of a customer
  // DXF with block attributes and an off layer (UI.dxfToDwg). Kernel side: tests/kernel/rfOM.js. Self-contained.
  (function () {
    function rfOMflat(code) {
      var K = UI.K, m = K.newModel('rfOMsrc'); K.runScript(m, code);
      var b = K.rebuild(m), me = K.meshFromBody(b.body), f = K.flatPattern(m, b, me);
      return { flat: f, area: K.sheetCutList(m, b, me, f).values['Bounding Box Area-Blank'] };
    }
    function rfOMarea(f) {
      // the closed loops of the sketch: outer − holes, arcs exact (signedArea of the chord polygon + each arc's segment)
      var K = UI.K, pr = K.sketchProfile({ entities: f.entities.filter(function (e) { return e.layer === 'OUTLINE' || e.layer === 'HOLES'; }) }), area = 0;
      pr.loops.forEach(function (l) {
        var A = K.signedArea(l.pts), s = A < 0 ? -1 : 1, a = Math.abs(A), n = l.pts.length;
        (l.seg || []).forEach(function (ci, i) {
          var cv = (pr.curves || [])[ci]; if (ci < 0 || !cv) return;
          var p = l.pts[i], q = l.pts[(i + 1) % n], h = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2;
          if (!(h > 0) || !(cv.r > 0)) return;
          var th = 2 * Math.asin(Math.min(1, h / cv.r)), sg = cv.r * cv.r / 2 * (th - Math.sin(th));
          var cr = (q[0] - p[0]) * (cv.c[1] - p[1]) - (q[1] - p[1]) * (cv.c[0] - p[0]);
          a += cr * s > 0 ? sg : -sg;
        });
        area += (l.hole ? -1 : 1) * a;
      });
      return { area: area, loops: pr.loops.length, open: pr.loops.filter(function (l) { return l.open; }).length };
    }
    async function rfOMimport(name, text) {
      var m = UI.K.newModel(name); m.units = 'in'; await anvil.load(m); await idle();
      UI.importDXFText(text, { name: name + '.dxf' }); await idle();
      assert(UI.pmTitle() === 'DXF/DWG Import', 'PM ' + UI.pmTitle());
      D.querySelector('#pm .pm-ok').click(); await idle();
      return UI.activeSketchFeature();
    }
    var BREAK = 'p.units("in");\np.sheet(0.1345, 0.2018, 0.5);\np.sketch("Top").rect(0, -5.8288, 6.9285, 5.8288).end().baseFlange();\np.breakCorner(0.3654, [], { kind: "fillet", faces: [[3.4642, 0.1345, 2.9144]] });\np.flange(0.8, [[3.4642, 0.1345, 0]], { position: "inside", lengthRef: "outer", relief: "rect" });\n';

    step('rfOM: DXF/DWG Import of a flat written with a Boundary box round R.365 filleted corners: ✓ gives one closed outline of the blank\'s area (the import merged the BOUNDARY lines with the outline\'s edges: no closed loop), BOUNDARY keeps its 4 lines', async function () {
      var errs0 = errors.length, F = rfOMflat(BREAK);
      var f = await rfOMimport('rfOMbox', UI.K.exportDXFFlat(F.flat, 'in', { version: 'R2000', boundaryBox: true }));
      var r = rfOMarea(f);
      assert(r.loops === 1 && !r.open && Math.abs(r.area - F.area) < 1e-9 * F.area, 'outline: ' + JSON.stringify(r) + ' vs ' + F.area);
      assert(f.entities.filter(function (e) { return e.layer === 'BOUNDARY'; }).length === 4, 'BOUNDARY lines');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfOM: DXF/DWG Import of a tray whose outline has a .0007 step beside a relief notch (under Close gaps up to .001): ✓ gives the closed outline (it came in with a branch and an overlap)', async function () {
      var errs0 = errors.length;
      var F = rfOMflat('p.units("in");\np.sheet(0.0747, 0.0374, 0.33);\np.sketch("Top").rect(0, -2.0117, 3.5532, 2.0117).end().baseFlange();\n' +
        'p.flange(0.9417, [[1.7766,0.0747,0]], { position: "inside", lengthRef: "outer", relief: "rect" });\np.flange(0.9417, [[3.5532,0.0747,1.0058]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
        'p.flange(0.9417, [[1.7766,0.0747,2.0117]], { position: "inside", lengthRef: "outer", relief: "rect" });\np.flange(0.9417, [[0,0.0747,1.0058]], { position: "inside", lengthRef: "outer", relief: "rect" });\n' +
        'p.cornerRelief([[3.4038, 0.0747, 1.8623], [0.1494, 0.0747, 0.1494]], 0.2, { reliefType: "rect" });\n');
      var f = await rfOMimport('rfOMstep', UI.K.exportDXFFlat(F.flat, 'in', { version: 'R2000' })), r = rfOMarea(f);
      assert(r.loops === F.flat.loops.length && !r.open && Math.abs(r.area - F.area) < 1e-9 * F.area, 'outline: ' + JSON.stringify(r) + ' vs ' + F.area);
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    });

    step('rfOM: DXF/DWG Import of a fit spline with zero start / end tangents (as LibreDWG writes it): one spline through its 5 points with no tangent set', async function () {
      var t = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES',
        '0', 'SPLINE', '8', '0', '70', '8', '71', '3', '72', '0', '73', '0', '74', '5', '12', '0', '22', '0', '32', '0', '13', '0', '23', '0', '33', '0'];
      [[0, 0], [1, 1], [2, 0], [3, 1], [4, 0]].forEach(function (q) { t.push('11', String(q[0]), '21', String(q[1]), '31', '0'); });
      var f = await rfOMimport('rfOMspline', t.concat(['0', 'ENDSEC', '0', 'EOF']).join('\r\n') + '\r\n');
      var sp = f.entities.filter(function (e) { return e.t === 'spline'; });
      assert(sp.length === 1 && sp[0].pts.length === 5 && !(sp[0].tans && sp[0].tans.some(Boolean)), 'spline: ' + JSON.stringify(sp).slice(0, 300));
    });

    step('rfOM: DXF/DWG Output of the filleted flat: $EXTMIN / $EXTMAX are the blank (0, 0) .. its size (they were .25 past it), R12 and R2000', async function () {
      var m = UI.K.newModel('rfOMext'); UI.K.runScript(m, BREAK); await anvil.load(m); await idle();
      var F = rfOMflat(BREAK);
      ['R12', 'R2000'].forEach(function (v) {
        var d = anvil.dxfOutput({ export: 'sheet', version: v }), h = W.DxfCheck ? W.DxfCheck.parse(d).header : null;
        var mn = /\$EXTMIN\r?\n\s*10\r?\n([^\r\n]+)\r?\n\s*20\r?\n([^\r\n]+)/.exec(d), mx = /\$EXTMAX\r?\n\s*10\r?\n([^\r\n]+)\r?\n\s*20\r?\n([^\r\n]+)/.exec(d);
        assert(mn && mx && Math.abs(+mn[1]) < 1e-9 && Math.abs(+mn[2]) < 1e-9 && Math.abs(+mx[1] - F.flat.size[0]) < 1e-9 && Math.abs(+mx[2] - F.flat.size[1]) < 1e-9, v + ' extents ' + (mn && mn.slice(1)) + ' / ' + (mx && mx.slice(1)) + ' vs ' + F.flat.size);
      });
    });

    step('rfOM: Save As DWG of a customer DXF with a block attribute (PN = 123-A) and an off layer: the DWG is written in the page (it was refused: "the ATTRIB entity is not written") with ATTDEF, ATTRIB and SEQEND objects', async function () {
      var d = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '2', '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'Continuous', '0', 'LAYER', '2', 'DIMS', '70', '0', '62', '-3', '6', 'Continuous', '0', 'ENDTAB', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'TAG', '70', '2', '10', '0', '20', '0', '30', '0', '3', 'TAG',
        '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '30', '0', '40', '0.5',
        '0', 'ATTDEF', '8', '0', '10', '0.6', '20', '0', '30', '0', '40', '0.1', '1', '', '3', 'Part number', '2', 'PN', '70', '0',
        '0', 'ENDBLK', '8', '0', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'ENTITIES', '0', 'INSERT', '8', '0', '66', '1', '2', 'TAG', '10', '2', '20', '2', '30', '0',
        '0', 'ATTRIB', '8', '0', '10', '2.6', '20', '2', '30', '0', '40', '0.1', '1', '123-A', '2', 'PN', '70', '0',
        '0', 'SEQEND', '8', '0', '0', 'LINE', '8', 'DIMS', '10', '0', '20', '-1', '30', '0', '11', '2', '21', '-1', '31', '0', '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
      var buf = await UI.dxfToDwg(d), b = new W.Uint8Array(buf);
      assert(String.fromCharCode.apply(null, Array.prototype.slice.call(b, 0, 6)) === 'AC1015', 'AC1015');
      // the object types present: ATTDEF 3, ATTRIB 2, SEQEND 6 (object map, section 2)
      function u32(i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
      var nsec = u32(21), at = 0;
      for (var i = 0; i < nsec; i++) if (b[25 + 9 * i] === 2) at = u32(26 + 9 * i);
      var st = at, types = {};
      function mc() { var v = 0, sh = 1, x; for (;;) { x = b[st++]; if (x & 0x80) { v += (x & 0x7F) * sh; sh *= 128; } else { v += (x & 0x3F) * sh; return x & 0x40 ? -v : v; } } }
      var locs = [];
      for (;;) { var p0 = st, size = (b[st] << 8) | b[st + 1], o = 0; st += 2; while (st < p0 + size) { mc(); o += mc(); locs.push(o); } st += 2; if (size <= 2) break; }
      locs.forEach(function (q) {
        var w = b[q] | (b[q + 1] << 8); q += w & 0x8000 ? 4 : 2;
        var bit = q * 8, rd = function (n) { var v = 0; for (var k = 0; k < n; k++, bit++) v = v * 2 + ((b[bit >> 3] >> (7 - (bit & 7))) & 1); return v; };
        var c = rd(2), t = c === 0 ? (function () { var lo = rd(8), hi = rd(8); return lo | (hi << 8); })() : c === 1 ? rd(8) : c === 2 ? 0 : 256;
        types[t] = (types[t] || 0) + 1;
      });
      assert(types[3] === 1 && types[2] === 1 && types[6] === 1 && types[7] === 1, 'object types ' + JSON.stringify(types));
      return (b.length / 1024).toFixed(1) + ' KB';
    });
  })();
  // --- end rfOM ---
