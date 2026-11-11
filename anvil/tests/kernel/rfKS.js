  // --- rfKS (2026-11-11, lane dxfaudit, test-reports/2026-11-11-dxf-dwg-audit.md) --- the DXF / DWG audit. Export: the
  // flats of seven sheet parts (L bracket, U channel with holes and a slot across its bends, a 4-flange tray with rect
  // reliefs and Circular corner reliefs, a hem + jog, a Lofted-Bend square-to-round, a 200-hole perforated panel, a
  // formed part) written R12 / R2000 with every DXF/DWG Output option, read back by DxfCheck.audit (the DXF reference's
  // checks: sections, EOF, header units and extents, layer and line-type tables, handles, R12 entity set, z = 0, zero
  // length, duplicates, chord-faceted arcs, bend lines CENTER) and the R2000 ones through Anvil's DWG writer and back
  // through its own DXF reader. Import: twelve customer-style DXF files written by hand (R12 POLYLINE bulges, LWPOLYLINE
  // bulges, SPLINE by fit points / control points / rational, ELLIPSE arcs, nested BLOCK / INSERT with rotation, mirror and
  // MINSERT arrays, frozen and off layers, mm and unitless, duplicate lines and a .002 gap, a self-touching outline,
  // extrusion 0, 0, -1, MTEXT / DIMENSION, CRLF and no EOF) through DxfImport.prepare: areas analytic, loops closed.
  (function () {
    group('rfKS: DXF / DWG audit: laser flats every CAM reads, customer DXF that imports clean');
    if (typeof DxfImport === 'undefined' || typeof DxfCheck === 'undefined' || !DxfCheck.audit) { test('rfKS: DxfImport and DxfCheck.audit are loaded', function () { fail('missing'); }); return; }
    var DI = DxfImport, T = 0.0598, I = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.44);\n';
    var BASE = I + 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var perf = 'p.sketch("Top", ' + T + ')';
    for (var pi = 0; pi < 20; pi++) for (var pj = 0; pj < 10; pj++) perf += '.circle(' + (0.6 + pi * 0.5).toFixed(2) + ', ' + (-0.6 - pj * 0.5).toFixed(2) + ', 0.09)';
    perf += '.cut("through", { reverse: true });\n';
    var PARTS = {
      'L bracket': I + 'p.sketch("Top").rect(0, -2, 3, 2).end().baseFlange();\np.flange(1.5, [[3, ' + T + ', 1]], { lengthRef: "outer" });\np.hole("Top", 1, -1, 0.25, { offset: ' + T + ' });\n',
      'U channel, holes across the bends': 'p.units("in");\np.sheet(0.06, 0.25, 0.44);\np.sketch("Top").rect(0, -4, 2, 4).end().baseFlange();\n' +
        'p.flange(2, [[0, 0.06, 2], [2, 0.06, 2]], { position: "inside" });\np.unfold([1, 0.06, 2], null);\n' +
        'p.sketch("Top").circle(-0.2, -1, 0.15).circle(2.2, -3, 0.15).slot(-0.4, -2, 0.1, -2, 0.2).end().extrude(1, { cut: true, through: true, both: true });\np.fold(null);\n',
      'tray with reliefs': BASE + [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "inside", lengthRef: "outer", relief: "rect" });\n'; }).join('') +
        'p.cornerRelief([[4, ' + T + ', 3], [0, ' + T + ', 0]], 0.25, { reliefType: "circular" });\n',
      'hem and jog': BASE + 'p.hem(0.5, [[0, ' + T + ', 1.5]], { gap: 0.04 });\np.jog(0.5, 1, [[4, ' + T + ', 1.5]]);\n',
      'Lofted-Bend square to round': 'p.units("in");\np.sheet(0.0747, 0.0747, 0.5);\n' +
        'var a = p.sketch("Top").polyline([[0, -3], [3, -3], [3, 3], [-3, 3], [-3, -3], [-0.001, -3]], false).id();\n' +
        'var b = p.sketch("Top", 4).arc(0, 0, 2, 270.03, 360).arc(0, 0, 2, 0, 90).arc(0, 0, 2, 90, 180).arc(0, 0, 2, 180, 270).id();\np.loftedBend([a, b]);\n',
      'perforated panel, 200 holes': I + 'p.sketch("Top").rect(0, -6, 11, 6).end().baseFlange();\n' + perf,
      'formed (dimple, louver, flange)': BASE + 'p.formingTool("dimple", [1, ' + T + ', 1]);\np.formingTool("louver", [3, ' + T + ', 1.5]);\np.flange(1, [[4, ' + T + ', 1.5]], { lengthRef: "outer" });\n'
    };
    var OPTS = [['default', {}], ['entities', { style: 'entities' }], ['no bend lines', { bendLines: false }], ['no notes', { notes: false }],
      ['boundary box', { boundaryBox: true }], ['bend layers split', { bendLayers: 'split' }], ['relief layer', { reliefLayer: true }], ['hidden edges', { hiddenEdges: true }],
      ['everything', { boundaryBox: true, bendLayers: 'split', reliefLayer: true, hiddenEdges: true, style: 'entities' }]];
    var rfKSflats = {};
    function rfKSflat(name) {
      if (!rfKSflats[name]) { var t = build(PARTS[name]); noErrors(t); rfKSflats[name] = { t: t, flat: K.flatPattern(t.model, t.build, t.mesh) }; }
      return rfKSflats[name];
    }
    // entity signatures of a parsed DXF (type, layer, geometry to 1e-9), sorted
    function rfKSsigs(text) {
      return DxfCheck.parse(text).entities.map(function (e) {
        return JSON.stringify([e.type, e.layer, e.a, e.b, e.c, e.r, e.a0, e.a1, e.pts, e.bulges, e.text], function (k, v) { return typeof v === 'number' ? +v.toFixed(9) : v; });
      }).sort();
    }

    Object.keys(PARTS).forEach(function (name) {
      test('rfKS: ' + name + ': the flat as DXF R12 and R2000 with each DXF/DWG Output option passes the reference audit (one closed chain per loop, units, extents = the blank, layer / line-type tables, handles, R12 entity set, z = 0, no zero-length or duplicate entity, arcs as arcs, bend lines CENTER and never on a cut layer)', function () {
        var f = rfKSflat(name), fl = f.flat, units = f.t.model.units === 'in' ? 'in' : 'mm', bad = [], n = 0;
        ['R12', 'R2000'].forEach(function (ver) {
          OPTS.forEach(function (o) {
            var text = K.exportDXFFlat(fl, units, Object.assign({ version: ver }, o[1]));
            var a = DxfCheck.audit(text, { units: units, layers: ['OUTLINE', 'HOLES', 'RELIEF'], bendLtype: o[1].bendLines === false ? null : 'CENTER', extents: 'exact' });
            n++;
            if (!a.ok) bad.push(ver + ' ' + o[0] + ': ' + a.errors.slice(0, 3).join('; '));
            var closed = a.check.loops.filter(function (l) { return (l.layer === 'OUTLINE' || l.layer === 'HOLES') && l.closed; }).length;
            var rel = a.check.loops.filter(function (l) { return l.layer === 'RELIEF'; }).length;
            if (!rel && closed !== fl.loops.length) bad.push(ver + ' ' + o[0] + ': ' + closed + ' closed loops for ' + fl.loops.length);
          });
        });
        assert(!bad.length, bad.slice(0, 4).join(' | '));
        return n + ' files, ' + fl.loops.length + ' loops, ' + fl.bends.length + ' bends';
      });
    });

    test('rfKS: every R2000 flat DXF of the seven parts goes through Anvil\'s DWG writer (AC1015) and its entities come back from the DWG\'s own DXF reader unchanged (types, layers, geometry to 1e-9); bend layers keep CENTER', function () {
      var n = 0;
      Object.keys(PARTS).forEach(function (name) {
        var f = rfKSflat(name), units = f.t.model.units === 'in' ? 'in' : 'mm';
        [{}, { style: 'entities', bendLayers: 'split', boundaryBox: true, reliefLayer: true, hiddenEdges: true }].forEach(function (o) {
          var text = K.exportDXFFlat(f.flat, units, Object.assign({ version: 'R2000' }, o)), bytes = DWG.fromDXF(text);
          assert(bytes.length > 1000 && String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, 0, 6)) === 'AC1015', name + ': DWG header');
          var p = DWG.parseDXF(text);
          assert(p.entities.length === DxfCheck.parse(text).entities.length, name + ': the DWG writer reads ' + p.entities.length + ' entities');
          var lt = (p.tables.LAYER || []).filter(function (r) { return /^BEND/.test(r.str(2, '')); }).map(function (r) { return r.str(6, ''); });
          assert(lt.length && lt.every(function (x) { return x === 'CENTER'; }), name + ': bend layers line type ' + lt);
          n++;
        });
      });
      return n + ' DWG files';
    });

    test('rfKS: the bend layers carry AutoCAD\'s CENTER line type (0.75 / 0.125 / 0.125 / 0.125 in; 19.05 / 3.175 mm), defined once in LTYPE; the cut layers stay CONTINUOUS; no bend lines: BEND stays CONTINUOUS', function () {
      var f = rfKSflat('L bracket'), r12 = K.exportDXFFlat(f.flat, 'in', {}), mm = K.exportDXFFlat(f.flat, 'mm', { version: 'R2000' });
      assert(/\n0\nLTYPE\n2\nCENTER\n70\n0\n3\n[^\n]*\n72\n65\n73\n4\n40\n1\.125\n49\n0\.75\n49\n-0\.125\n49\n0\.125\n49\n-0\.125\n/.test(r12), 'R12 CENTER record');
      assert(/\n2\nBEND\n70\n0\n62\n3\n6\nCENTER\n/.test(r12) && /\n2\nOUTLINE\n70\n0\n62\n7\n6\nCONTINUOUS\n/.test(r12), 'R12 layers');
      assert(/\n2\nCENTER\n70\n0\n3\n[^\n]*\n72\n65\n73\n4\n40\n28\.575\n49\n19\.05\n74\n0\n49\n-3\.175\n/.test(mm), 'R2000 mm CENTER record');
      var nb = K.exportDXFFlat(f.flat, 'in', { bendLines: false });
      assert(/\n2\nBEND\n70\n0\n62\n3\n6\nCONTINUOUS\n/.test(nb) && !/CENTER/.test(nb), 'no bend lines: no CENTER');
    });

    test('rfKS: DxfCheck.audit catches what a strict importer rejects: R2000 entities and subclass markers in an R12 file, a layer missing from the table, a line type missing from LTYPE, duplicate handles, z off 0, a zero-length LINE, an arc as chords, extents that miss the geometry, no EOF', function () {
      var f = rfKSflat('L bracket'), r12 = K.exportDXFFlat(f.flat, 'in', {}), r2 = K.exportDXFFlat(f.flat, 'in', { version: 'R2000' });
      assert(DxfCheck.audit(r12, { units: 'in' }).ok && DxfCheck.audit(r2, { units: 'in' }).ok, 'clean files pass');
      function errs(t, o) { return DxfCheck.audit(t, Object.assign({ units: 'in' }, o)).errors.join(' | '); }
      var ent = '0\nENTITIES\n';
      var cases = [
        [r12.replace('2\nENTITIES\n', '2\nENTITIES\n0\nLWPOLYLINE\n8\nETCH2\n90\n2\n70\n0\n10\n0\n20\n0\n10\n1\n20\n0\n'), /LWPOLYLINE \(R2000 only\) in an R12 file/],
        [r12.replace('2\nENTITIES\n', '2\nENTITIES\n0\nLINE\n100\nAcDbEntity\n8\nNOTES\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n'), /group code 100/],
        [r12.replace('2\nENTITIES\n', '2\nENTITIES\n0\nLINE\n8\nSTRAY\n10\n0\n20\n0\n30\n0\n11\n1\n21\n0\n31\n0\n'), /layer STRAY, which the LAYER table does not have/],
        [r12.replace('6\nCENTER\n', '6\nPHANTOM\n'), /line type PHANTOM, not in the LTYPE table/],
        [r2.replace(/\n5\n31\n/, '\n5\n30\n'), /duplicate handles/],
        [r12.replace('2\nENTITIES\n', '2\nENTITIES\n0\nLINE\n8\nNOTES\n10\n0\n20\n0\n30\n0.5\n11\n1\n21\n0\n31\n0\n'), /off z = 0/],
        [r12.replace('2\nENTITIES\n', '2\nENTITIES\n0\nLINE\n8\nNOTES\n10\n0\n20\n0\n30\n0\n11\n0\n21\n0\n31\n0\n'), /zero-length LINE/],
        [r12.replace(/\n9\n\$EXTMAX\n10\n[^\n]+\n/, '\n9\n$EXTMAX\n10\n1\n'), /do not hold the geometry/],
        [r12.replace(/\n0\nEOF$/, ''), /does not end with 0 \/ EOF/]
      ];
      // a circle of R 1 written as 16 equal chords on HOLES (a closed chain, so only the facet check speaks)
      var ch = '';
      for (var k = 0; k < 16; k++) { var a0 = k * Math.PI / 8, a1 = (k + 1) * Math.PI / 8; ch += '0\nLINE\n8\nHOLES\n10\n' + (2 + Math.cos(a0)) + '\n20\n' + (1 + Math.sin(a0)) + '\n30\n0\n11\n' + (2 + Math.cos(a1)) + '\n21\n' + (1 + Math.sin(a1)) + '\n31\n0\n'; }
      cases.push([r12.replace('2\nENTITIES\n', '2\nENTITIES\n' + ch), /an arc written as chords/]);
      cases.forEach(function (c, i) { var e = errs(c[0]); assert(c[1].test(e), 'case ' + i + ' ' + c[1] + ': ' + e); });
      assert(DxfCheck.audit(cases[cases.length - 1][0], { units: 'in', facets: true }).errors.every(function (e) { return !/chords/.test(e); }), 'facets: true allows chords');
      return ent.length && cases.length + ' cases';
    });

    // ------------------------------------------------------------------ import: twelve customer-style files
    function rfKSfile(o, eol) {
      var L = [];
      function sec(name, body) { if (!body) return; L.push('0', 'SECTION', '2', name); Array.prototype.push.apply(L, body); L.push('0', 'ENDSEC'); }
      sec('HEADER', o.header);
      sec('TABLES', o.tables);
      sec('BLOCKS', o.blocks);
      sec('ENTITIES', o.entities);
      if (!o.noEof) L.push('0', 'EOF');
      return L.join(eol || '\n') + (o.noEof ? '' : eol || '\n');
    }
    function rfKSlayers(list) {   // [[name, colour, flags]]
      var out = ['0', 'TABLE', '2', 'LTYPE', '70', '1', '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0', '0', 'ENDTAB',
        '0', 'TABLE', '2', 'LAYER', '70', String(list.length)];
      list.forEach(function (l) { out.push('0', 'LAYER', '2', l[0], '70', String(l[2] || 0), '62', String(l[1]), '6', 'CONTINUOUS'); });
      return out.concat(['0', 'ENDTAB']);
    }
    function hdr(ins, ver) { return ['9', '$ACADVER', '1', ver || 'AC1009'].concat(ins == null ? [] : ['9', '$INSUNITS', '70', String(ins)]); }
    function LN(ly, a, b, x) { return ['0', 'LINE', '8', ly, '10', String(a[0]), '20', String(a[1]), '30', '0', '11', String(b[0]), '21', String(b[1]), '31', '0'].concat(x || []); }
    function RECT(ly, x0, y0, x1, y1) { return [].concat(LN(ly, [x0, y0], [x1, y0]), LN(ly, [x1, y0], [x1, y1]), LN(ly, [x1, y1], [x0, y1]), LN(ly, [x0, y1], [x0, y0])); }
    // the closed regions of imported entities: area (outer − holes), loop count, open chains, from Kernel.sketchProfile;
    // a chord on a circle or arc (loop.seg) gets its circular segment back, so arcs count exactly
    function rfKSloopArea(l, curves) {
      var A = K.signedArea(l.pts), s = A < 0 ? -1 : 1, a = Math.abs(A), n = l.pts.length;
      (l.seg || []).forEach(function (ci, i) {
        if (ci < 0 || !curves[ci]) return;
        var c = curves[ci].c, r = curves[ci].r, p = l.pts[i], q = l.pts[(i + 1) % n], h = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2;
        if (!(h > 0) || !(r > 0)) return;
        var th = 2 * Math.asin(Math.min(1, h / r)), seg = r * r / 2 * (th - Math.sin(th));
        var cr = (q[0] - p[0]) * (c[1] - p[1]) - (q[1] - p[1]) * (c[0] - p[0]);
        a += cr * s > 0 ? seg : -seg;
      });
      return a;
    }
    function rfKSregions(ents) {
      var pr = K.sketchProfile({ entities: ents.filter(function (e) { return e.t !== 'text' && e.t !== 'point'; }) }), area = 0;
      pr.loops.forEach(function (l) { area += (l.hole ? -1 : 1) * rfKSloopArea(l, pr.curves || []); });
      return { area: area, loops: pr.loops.length, warnings: pr.warnings || [], cross: pr.loops.some(function (l) { return l.cross; }) };
    }
    function rfKSimport(text, pu, o) {
      var p = DI.parse(text), r = DI.prepare(p, Object.assign({ partUnits: pu || 'in' }, o || {}));
      var iss = DI.check(r.entities.filter(function (e) { return e.t !== 'text' && e.t !== 'point'; }), pu === 'mm' ? 0.01 : 0.0005);
      return { parsed: p, ents: r.entities, report: r.report, reg: rfKSregions(r.entities), issues: iss };
    }
    function opens(iss) { return (iss || []).filter(function (i) { return /open|gap/i.test(i.kind || i.type || ''); }).length; }
    var Q = Math.tan(Math.PI / 4);   // bulge of a half circle = 1
    var FILES = {
      '01 R12 POLYLINE / VERTEX with bulges (obround 4 × 2, ends R1)': {
        text: rfKSfile({ header: hdr(1), tables: rfKSlayers([['CUT', 7]]), entities: ['0', 'POLYLINE', '8', 'CUT', '66', '1', '10', '0', '20', '0', '30', '0', '70', '1',
          '0', 'VERTEX', '8', 'CUT', '10', '1', '20', '0', '30', '0', '0', 'VERTEX', '8', 'CUT', '10', '3', '20', '0', '30', '0', '42', String(Q),
          '0', 'VERTEX', '8', 'CUT', '10', '3', '20', '2', '30', '0', '0', 'VERTEX', '8', 'CUT', '10', '1', '20', '2', '30', '0', '42', String(Q), '0', 'SEQEND', '8', 'CUT'] }),
        area: 4 + Math.PI, loops: 1 },
      // a 3 × 2 rectangle whose left side bulges in by a half circle R .5 (bulge −1 from (0, 1.5) to (0, .5))
      '02 LWPOLYLINE with a concave bulge (3 × 2 less a R .5 half disc)': {
        text: rfKSfile({ header: hdr(1, 'AC1015'), tables: rfKSlayers([['0', 7]]), entities: ['0', 'LWPOLYLINE', '8', '0', '90', '6', '70', '1',
          '10', '0', '20', '0', '10', '3', '20', '0', '10', '3', '20', '2', '10', '0', '20', '2', '10', '0', '20', '1.5', '42', String(-Q), '10', '0', '20', '0.5'] }),
        area: 6 - Math.PI / 8, loops: 1 },
      '03 SPLINE by fit points only, with end tangents, closing a rectangle': {
        text: rfKSfile({ header: hdr(1, 'AC1015'), tables: rfKSlayers([['0', 7]]), entities: [].concat(LN('0', [3, 1], [3, 0]), LN('0', [3, 0], [0, 0]), LN('0', [0, 0], [0, 1]),
          ['0', 'SPLINE', '8', '0', '70', '8', '71', '3', '72', '0', '73', '0', '74', '3', '12', '1', '22', '0', '32', '0', '13', '1', '23', '0', '33', '0', '11', '0', '21', '1', '31', '0', '11', '1.5', '21', '1', '31', '0', '11', '3', '21', '1', '31', '0']) }),
        area: 3, loops: 1, splines: 1 },
      '04 SPLINE by control points (cubic Bezier, area 2.25 over its chord) and a rational quarter circle': {
        text: rfKSfile({ header: hdr(1, 'AC1015'), tables: rfKSlayers([['0', 7]]), entities: [].concat(LN('0', [3, 0], [0, 0]),
          ['0', 'SPLINE', '8', '0', '70', '8', '71', '3', '72', '8', '73', '4', '74', '0', '40', '0', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1', '40', '1',
            '10', '0', '20', '0', '30', '0', '10', '1', '20', '1.5', '30', '0', '10', '2', '20', '1.5', '30', '0', '10', '3', '20', '0', '30', '0'],
          LN('0', [10, 0], [11, 0]), LN('0', [10, 1], [10, 0]),
          ['0', 'SPLINE', '8', '0', '70', '12', '71', '2', '72', '6', '73', '3', '74', '0', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1',
            '10', '11', '20', '0', '30', '0', '41', '1', '10', '11', '20', '1', '30', '0', '41', String(Math.SQRT1_2), '10', '10', '20', '1', '30', '0', '41', '1']) }),
        area: 2.25 + Math.PI / 4, areaTol: 2e-4, loops: 2 },
      '05 ELLIPSE: a full one turned 30° (2 × 1 radii) and a half one closed by a LINE': {
        text: rfKSfile({ header: hdr(1, 'AC1015'), tables: rfKSlayers([['0', 7]]), entities: [].concat(
          ['0', 'ELLIPSE', '8', '0', '10', '0', '20', '0', '30', '0', '11', String(2 * Math.cos(Math.PI / 6)), '21', String(2 * Math.sin(Math.PI / 6)), '31', '0', '210', '0', '220', '0', '230', '1', '40', '0.5', '41', '0', '42', String(2 * Math.PI)],
          ['0', 'ELLIPSE', '8', '0', '10', '10', '20', '0', '30', '0', '11', '2', '21', '0', '31', '0', '40', '0.5', '41', '0', '42', String(Math.PI)], LN('0', [8, 0], [12, 0])) }),
        area: 2 * Math.PI + Math.PI, areaTol: 1e-5, loops: 2 },
      '06 nested BLOCK / INSERT: rotation, scale, mirror (negative X scale), MINSERT array 3 × 2': {
        text: rfKSfile({ header: hdr(1), tables: rfKSlayers([['CUT', 7]]),
          blocks: [].concat(['0', 'BLOCK', '8', '0', '2', 'SQ', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'SQ'], RECT('0', 0, 0, 1, 1),
            ['0', 'ARC', '8', '0', '10', '0.5', '20', '0.5', '30', '0', '40', '0.25', '50', '0', '51', '180'], LN('0', [0.25, 0.5], [0.75, 0.5]), ['0', 'ENDBLK', '8', '0'],
            ['0', 'BLOCK', '8', '0', '2', 'NEST', '70', '0', '10', '0', '20', '0', '30', '0', '3', 'NEST', '0', 'INSERT', '8', '0', '2', 'SQ', '10', '2', '20', '0', '30', '0', '41', '2', '42', '2', '50', '0', '0', 'ENDBLK', '8', '0']),
          entities: ['0', 'INSERT', '8', 'CUT', '2', 'NEST', '10', '10', '20', '0', '30', '0', '50', '90',
            '0', 'INSERT', '8', 'CUT', '2', 'SQ', '10', '0', '20', '0', '30', '0', '41', '-1', '42', '1',
            '0', 'INSERT', '8', 'CUT', '2', 'SQ', '10', '0', '20', '10', '30', '0', '70', '3', '71', '2', '44', '2', '45', '2'] }),
        // NEST: one 2 × 2 square with a R .5 half disc hole; the mirrored square and 6 array squares: 1 − π/32 each
        area: (4 - Math.PI / 8) + 7 * (1 - Math.PI / 32), loops: 16, blocks: false },
      '07 frozen and off layers (a title block and a dimension layer) left out': {
        text: rfKSfile({ header: hdr(1), tables: rfKSlayers([['CUT', 7], ['TITLE', 7, 1], ['DIMS', -3]]), entities: [].concat(RECT('CUT', 0, 0, 2, 1), RECT('TITLE', -5, -5, 10, 10), LN('DIMS', [0, -1], [2, -1])) }),
        area: 2, loops: 1, layers: 1 },
      '08 millimetres ($INSUNITS 4) into an inch part, and unitless ($INSUNITS 0) taking the part\'s units': {
        text: rfKSfile({ header: hdr(4), tables: rfKSlayers([['0', 7]]), entities: RECT('0', 0, 0, 50.8, 25.4) }),
        area: 2, loops: 1 },
      '09 duplicate and overlapping LINEs, a .002 in gap at a corner (Close gaps up to .0025)': {
        text: rfKSfile({ header: hdr(1), tables: rfKSlayers([['0', 7]]), entities: [].concat(LN('0', [0, 0], [3, 0]), LN('0', [0, 0], [3, 0]), LN('0', [1, 0], [2, 0]), LN('0', [3, 0], [3, 2]), LN('0', [3, 2], [0, 2]), LN('0', [0, 2], [0, 0.002])) }),
        opts: { gap: 0.0025 }, area: 6, loops: 1 },
      '10 a self-touching outline (two squares meeting at one corner)': {
        text: rfKSfile({ header: hdr(1), tables: rfKSlayers([['0', 7]]), entities: [].concat(LN('0', [0, 0], [1, 0]), LN('0', [1, 0], [1, 1]), LN('0', [1, 1], [2, 1]), LN('0', [2, 1], [2, 2]), LN('0', [2, 2], [1, 2]), LN('0', [1, 2], [1, 1]), LN('0', [1, 1], [0, 1]), LN('0', [0, 1], [0, 0])) }),
        area: 2 },
      '11 extrusion 0, 0, -1: a mirrored ARC, CIRCLE and bulged LWPOLYLINE': {
        // OCS X = -WCS X: the ARC (centre 1, 0, R1, 0–180°) is the upper half circle about (-1, 0); the CIRCLE at OCS (3, 0)
        // sits at (-3, 0) (R .25, inside nothing); the LWPOLYLINE square 5..6 has a bulge −1 (clockwise) on its OCS bottom
        // edge, a half circle R .5 bowed into the square, and lands at x −6..−5
        text: rfKSfile({ header: hdr(1, 'AC1015'), tables: rfKSlayers([['0', 7]]), entities: [].concat(
          ['0', 'ARC', '8', '0', '10', '1', '20', '0', '30', '0', '40', '1', '210', '0', '220', '0', '230', '-1', '50', '0', '51', '180'], LN('0', [-2, 0], [0, 0]),
          ['0', 'CIRCLE', '8', '0', '10', '3', '20', '0', '30', '0', '40', '0.25', '210', '0', '220', '0', '230', '-1'],
          ['0', 'LWPOLYLINE', '8', '0', '90', '4', '70', '1', '210', '0', '220', '0', '230', '-1', '10', '5', '20', '0', '42', '-1', '10', '6', '20', '0', '10', '6', '20', '1', '10', '5', '20', '1']) }),
        area: Math.PI / 2 + Math.PI / 16 + (1 - Math.PI / 8), loops: 3, check: function (ents) {
          var b = ents.filter(function (e) { return e.t === 'arc' && Math.abs(e.r - 0.5) < 1e-9; })[0];
          near(b.cx, -5.5, 1e-12, 'bulge arc centre x'); near(Math.sin((b.a0 + b.a1) / 2 * Math.PI / 180), 1, 1e-9, 'bulge arc bows up, into the square');
          var c = ents.filter(function (e) { return e.t === 'circle'; })[0];
          near(c.cx, -3, 1e-12, 'circle x mirrored'); near(c.cy, 0, 1e-12, 'circle y');
          var arcs = ents.filter(function (e) { return e.t === 'arc' && Math.abs(e.r - 1) < 1e-9 && e.cx < 0; });
          assert(arcs.length === 1, 'the ARC about (-1, 0)');
          var mid = (arcs[0].a0 + arcs[0].a1) / 2;
          near(Math.sin(mid * Math.PI / 180), 1, 1e-9, 'the ARC is the upper half');
        } },
      '12 MTEXT, TEXT and DIMENSION (with its *D block) beside a 2 × 1 plate: the DIMENSION adds nothing': {
        text: rfKSfile({ header: hdr(1, 'AC1015'), tables: rfKSlayers([['0', 7], ['DIM', 2]]),
          blocks: [].concat(['0', 'BLOCK', '8', '0', '2', '*D1', '70', '1', '10', '0', '20', '0', '30', '0', '3', '*D1'], LN('DIM', [0, -0.5], [2, -0.5]), ['0', 'ENDBLK', '8', '0']),
          entities: [].concat(RECT('0', 0, 0, 2, 1), ['0', 'DIMENSION', '8', 'DIM', '2', '*D1', '10', '0', '20', '-0.5', '30', '0', '70', '0', '1', '2.000'],
            ['0', 'MTEXT', '8', '0', '10', '0', '20', '2', '30', '0', '40', '0.125', '1', 'PART 7\\PREV A'], ['0', 'TEXT', '8', '0', '10', '0', '20', '3', '30', '0', '40', '0.125', '1', 'QTY 4'])
        }), area: 2, loops: 1, texts: 2 }
    };

    Object.keys(FILES).forEach(function (name) {
      test('rfKS: import ' + name + ': DxfImport.prepare gives the right geometry (area analytic) and closed profiles closed', function () {
        var F = FILES[name], r = rfKSimport(F.text, 'in', F.opts || {});
        assert(!r.reg.cross, 'no self-crossing loop');
        if (F.loops != null) assert(r.reg.loops === F.loops, 'loops ' + r.reg.loops + ', expected ' + F.loops + ' ' + JSON.stringify(r.ents).slice(0, 600));
        if (F.area != null) near(r.reg.area, F.area, F.areaTol || 1e-6, 'area');
        if (F.layers != null) assert(r.parsed.layers.length >= F.layers && r.ents.every(function (e) { return e.layer == null || e.layer === 'CUT'; }), 'only CUT comes in: ' + JSON.stringify(r.parsed.layers));
        if (F.texts != null) assert(r.ents.filter(function (e) { return e.t === 'text'; }).length === F.texts && r.parsed.skipped.DIMENSION === 1, 'texts / skipped ' + JSON.stringify(r.parsed.skipped));
        if (F.splines != null) assert(r.ents.filter(function (e) { return e.t === 'spline'; }).length === F.splines, 'splines');
        if (F.check) F.check(r.ents);
        return 'area ' + r.reg.area.toFixed(6) + ', ' + r.reg.loops + ' loop(s), ' + r.ents.length + ' entities';
      });
    });

    test('rfKS: import variants: the same plate with CRLF line ends, and with no 0 / EOF (nor the last ENDSEC); a unitless file takes the part\'s units (mm part: 50.8 × 25.4 stays mm, area 1290.32)', function () {
      var base = { header: hdr(1), tables: rfKSlayers([['0', 7]]), entities: RECT('0', 0, 0, 2, 1) };
      var crlf = rfKSimport(rfKSfile(base, '\r\n'), 'in');
      near(crlf.reg.area, 2, 1e-12, 'CRLF area');
      var noEof = rfKSfile(Object.assign({ noEof: true }, base)).replace(/\n0\nENDSEC$/, '');
      var ne = rfKSimport(noEof, 'in');
      near(ne.reg.area, 2, 1e-12, 'no EOF area');
      var unitless = rfKSfile({ header: hdr(0), tables: rfKSlayers([['0', 7]]), entities: RECT('0', 0, 0, 50.8, 25.4) });
      var p = DI.parse(unitless);
      assert(p.units == null, 'unitless: ' + p.units);
      near(rfKSimport(unitless, 'mm').reg.area, 50.8 * 25.4, 1e-9, 'mm part');
      near(rfKSimport(unitless, 'in').reg.area, 50.8 * 25.4, 1e-9, 'inch part: taken as inches');
    });

    test('rfKS: import 07: a frozen layer and an off layer are listed (frozen / off) but left out by default, as AutoCAD shows the file; opts.layers { TITLE: true } brings one in', function () {
      var F = FILES['07 frozen and off layers (a title block and a dimension layer) left out'], p = DI.parse(F.text);
      var t = p.layers.filter(function (l) { return l.name === 'TITLE'; })[0], d = p.layers.filter(function (l) { return l.name === 'DIMS'; })[0];
      assert(t && t.frozen && !t.off && d && d.off && !d.frozen, JSON.stringify(p.layers));
      var on = DI.prepare(p, { partUnits: 'in', layers: { TITLE: true } });
      near(rfKSregions(on.entities).area, 15 * 15 - 2, 1e-9, 'TITLE on: the title frame round the plate');
    });

    test('rfKS: import 09: the duplicate and overlapping LINEs merge (four lines left); the .002 in gap stays open at SolidWorks\' default Close gaps up to .001 and Check Sketch names it with its size; .0025 closes it (one end moves .002, reported)', function () {
      var F = FILES['09 duplicate and overlapping LINEs, a .002 in gap at a corner (Close gaps up to .0025)'], d = rfKSimport(F.text, 'in');
      assert(d.ents.filter(function (e) { return e.t === 'line'; }).length === 4 && d.report.merged >= 2, 'default: duplicates merged ' + JSON.stringify(d.report));
      assert(d.reg.loops === 0 && d.report.gaps === 0, 'default: the gap stays open');
      var g = DI.check(d.ents, 0.01).filter(function (i) { return i.type === 'gap'; });
      assert(g.length === 1 && Math.abs(g[0].size - 0.002) < 1e-12, 'check names the gap: ' + JSON.stringify(g));
      var r = rfKSimport(F.text, 'in', F.opts);
      assert(r.report && r.report.gaps === 1 && r.report.maxMove <= 0.002 + 1e-12, 'report ' + JSON.stringify(r.report));
    });
  })();
