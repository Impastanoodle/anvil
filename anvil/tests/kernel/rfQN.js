  // --- rfQN (2026-11-19, lane drawflats): block attributes by default in R2000 DXF, dual values rounded as decimals,
  // a baseline stack kept on the sheet, flat-pattern drawings of the shop-flow-9 door and tray ---
  (function () {
    if (typeof Drawing === 'undefined') { group('rfQN: drawing flats'); return; }
    var DW = Drawing;
    function rfQNEnts(dxf) {
      var L = String(dxf).split('\n').map(function (s) { return s.trim(); }), out = [], sec = null, cur = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i], v = L[i + 1];
        if (c === '0' && v === 'SECTION') { sec = L[i + 3]; continue; }
        if (c === '0') { cur = { type: v, sec: sec, g: {} }; out.push(cur); continue; }
        if (cur && cur.g[c] == null) cur.g[c] = v;
      }
      return out;
    }
    function rfQNStamp() {
      var r = build('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);');
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      DW.addView(doc, 'Front', { x: 4, y: 5 });
      var ids = DW.addSketchRect(doc, [12, 1], [14, 1.75]);
      var cap = [['REV', 12.1], ['BY', 13.5]].map(function (c) { return DW.addSketchEntity(doc, { t: 'text', p: [c[1], 1.5], text: c[0], h: 0.1 }).id; });
      var val = [['A', 12.1], ['LM', 13.5]].map(function (c) { return DW.addSketchEntity(doc, { t: 'text', p: [c[1], 1.12], text: c[0], h: 0.1 }).id; });
      var attrs = {}; attrs[val[0]] = 'REV'; attrs[val[1]] = 'BY';
      DW.makeBlock(doc, ids.concat(cap, val), { name: 'STAMP', base: [12, 1], attrs: attrs });
      DW.insertBlock(doc, 'STAMP', [12, 3], null, { attrs: { REV: 'B', BY: 'JD' } });
      return DW.compute(doc, r.mesh, r.model);
    }

    group('rfQN: block attributes are the R2000 default; the DXF checker reads ATTDEF / ATTRIB');
    test('R2000 with no option: ATTDEF per tag in the BLOCK, ATTRIB values after each INSERT; { attributes: false } and R12 keep TEXT; DxfCheck audits the R2000 file clean (two attributes on one layer are not duplicates)', function () {
      var sh = rfQNStamp(), out = [];
      var e0 = rfQNEnts(DW.toDXF(sh, { version: 'R2000' }));
      var defs = e0.filter(function (e) { return e.type === 'ATTDEF'; }).map(function (e) { return e.g['2']; }).sort();
      var atts = e0.filter(function (e) { return e.type === 'ATTRIB'; }).map(function (e) { return e.g['2'] + '=' + e.g['1']; }).sort();
      assert(defs.join(',') === 'BY,REV', 'ATTDEFs ' + defs.join(','));
      assert(atts.join(',') === 'BY=JD,BY=LM,REV=A,REV=B', 'ATTRIBs ' + atts.join(','));
      out.push(atts.length + ' ATTRIB');
      [[{ version: 'R2000', attributes: false }, 'R2000 off'], [{ version: 'R12' }, 'R12']].forEach(function (o) {
        var e = rfQNEnts(DW.toDXF(sh, o[0]));
        assert(!e.some(function (x) { return x.type === 'ATTDEF' || x.type === 'ATTRIB'; }), o[1] + ': no attributes');
        var tx = e.filter(function (x) { return x.sec === 'ENTITIES' && x.type === 'TEXT'; }).map(function (x) { return x.g['1']; });
        ['A', 'LM', 'B', 'JD'].forEach(function (v) { assert(tx.indexOf(v) >= 0, o[1] + ' TEXT ' + v); });
      });
      if (typeof DxfCheck !== 'undefined') {
        var au = DxfCheck.audit(DW.toDXF(sh, { version: 'R2000' }), { units: 'in' });
        assert(!au.errors.length, 'audit: ' + au.errors.slice(0, 3).join(' | '));
        out.push('audit clean');
      }
      return out.join(', ');
    });

    group('rfQN: dual and converted values round as decimals, half away from zero (.375 in = 9.525 mm -> 9.53)');
    test('roundDec: 9.525 / .375 * 25.4 -> 9.53, 34.925 -> 34.93, 1.005 -> 1.01, 2.675 -> 2.68, -0.005 -> -0.01, 0.0049 -> 0; inchText(.0625, 3) -> .063; mm prec 2: 9.525 -> 9.53', function () {
      assert(DW.roundDec(0.375 * 25.4, 2) === 9.53, '9.525 ' + DW.roundDec(0.375 * 25.4, 2));
      assert(DW.roundDec(1.375 * 25.4, 2) === 34.93, '34.925');
      assert(DW.roundDec(1.005, 2) === 1.01 && DW.roundDec(2.675, 2) === 2.68, '1.005 / 2.675');
      assert(DW.roundDec(-0.005, 2) === -0.01 && DW.roundDec(0.0049, 2) === 0, 'signs');
      assert(DW.inchText(0.0625, 3) === '.063' && DW.inchText(-0.0625, 3) === '-.063', 'inch ' + DW.inchText(0.0625, 3));
      return 'ok';
    });
    test('a .375 x 1.375 plate with dual on: .375 [9.53] and 1.375 [34.93] on the sheet and in the R2000 / R12 DXF; slot callout .375 [9.53] X 1.375 [34.93] SLOT', function () {
      var r = build('p.units("in");\np.sketch("Front").rect(0, 0, 0.375, 1.375).extrude(0.25);'); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19' }); DW.standard3View(doc, r.mesh, 'in');
      (doc.options || (doc.options = {})).dual = true;
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), texts = sh.dims.map(function (d) { return d.text; });
      assert(texts.indexOf('.375 [9.53]') >= 0 && texts.indexOf('1.375 [34.93]') >= 0, 'dims ' + texts.join(' | '));
      ['R12', 'R2000'].forEach(function (v) { var x = DW.toDXF(sh, { version: v }); assert(x.indexOf('9.53') >= 0 && x.indexOf('9.52') < 0 && x.indexOf('34.92') < 0, v + ' DXF'); });
      var r2 = build('p.units("in");\np.sketch("Front").rect(0, 0, 10, 6).slot(2, 3, 3, 3, 0.375).circle(7, 3, 0.1875).extrude(0.25);'); noErrors(r2);
      var d2 = DW.newDrawing(r2.model, { date: '2026-11-19' }); DW.standard3View(d2, r2.mesh, 'in'); d2.autoDims = false;
      var s2 = DW.compute(d2, r2.mesh, r2.model, { build: r2.build });
      var fv = d2.views.filter(function (v) { return v.orient === 'Front'; })[0], w = s2.views.filter(function (x) { return x.view.id === fv.id; })[0];
      var ss = DW.slotsIn(w.proj)[0];
      DW.addSlotCallout(d2, fv.id, w.proj, { c: ss.ends[0].c, r: ss.ends[0].r });
      (d2.options || (d2.options = {})).dual = true;
      s2 = DW.compute(d2, r2.mesh, r2.model, { build: r2.build });
      var t2 = s2.dims.map(function (d) { return d.text; });
      assert(t2.indexOf('.375 [9.53] X 1.375 [34.93] SLOT') >= 0, 'slot ' + t2.join(' | '));
      return texts.filter(function (t) { return /9\.53|34\.93/.test(t); }).join(' / ') + '; ' + t2.join(' / ');
    });

    group('rfQN: a Baseline set with no room on either side of its view stays on the sheet (closed up, else pulled in) and the status line says so');
    function rfQNPlate() {
      return build('p.units("in");\nvar s = p.sketch("Top").rect(0, -3, 6, 3);\ns.end().extrude(0.1);\n' +
        'p.sketch("Top", 0.1).circle(1.5, -0.75, 0.14).circle(4.5, -0.75, 0.14).cut("through", { reverse: true });');
    }
    function rfQNBase(yTop, yFront) {
      var r = rfQNPlate(); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      var v = DW.addView(doc, 'Top', { x: 8, y: yTop });
      if (yFront != null) DW.addView(doc, 'Front', { x: 8, y: yFront });
      DW.addBaseline(doc, v.id, { dir: 'h', base: { a: [0, 0], b: [0, -3] }, refs: [{ kind: 'dia', c: [1.5, -0.75], r: 0.14 }, { kind: 'dia', c: [4.5, -0.75], r: 0.14 }, { a: [6, 0], b: [6, -3] }] });
      var sh = DW.compute(doc, r.mesh, r.model), ix = -1;
      sh.dims.forEach(function (d, i) { if (d.kind === 'baseline') ix = i; });
      var b = 10 / 25.4, S = sh.size, texts = sh.prims.filter(function (q) { return q.k === 'text' && q.dimIx === ix; }).map(DW.textRect);
      var lines = sh.prims.filter(function (q) { return q.dimIx === ix && q.k === 'line'; });
      var off = texts.filter(function (t) { return t.x0 < b - 1e-9 || t.y0 < b - 1e-9 || t.x1 > S[0] - b + 1e-9 || t.y1 > S[1] - b + 1e-9; }).length +
        lines.filter(function (l) { return [l.a, l.b].some(function (q) { return q[0] < b - 1e-9 || q[1] < b - 1e-9 || q[0] > S[0] - b + 1e-9 || q[1] > S[1] - b + 1e-9; }); }).length;
      var meet = 0; for (var i = 0; i < texts.length; i++) for (var j = i + 1; j < texts.length; j++) if (texts[i].x0 < texts[j].x1 && texts[j].x0 < texts[i].x1 && texts[i].y0 < texts[j].y1 && texts[j].y0 < texts[i].y1) meet++;
      return { sh: sh, d: sh.dims[ix], off: off, meet: meet, warn: (sh.warnings || []).filter(function (w) { return /Baseline set/.test(w); }) };
    }
    test('the drawflow7 case (Top view at the top of the sheet, the Front view under it): every value and line inside the border, values apart, one warning; a set with room is unchanged (8 mm, no warning)', function () {
      var a = rfQNBase(9.1, 8.2);
      assert(a.off === 0, a.off + ' pieces past the border');
      assert(a.meet === 0, a.meet + ' values on values');
      assert(a.warn.length === 1, 'warnings ' + JSON.stringify(a.sh.warnings));
      var c = rfQNBase(4, null);
      assert(c.off === 0 && !c.warn.length && Math.abs(c.d.blPos[1] - c.d.blPos[0] - 8 / 25.4) < 1e-9, 'room: ' + c.d.blPos.join(' '));
      return a.warn[0] + ' (step ' + a.d.stepNow + ' mm, pulled ' + (a.d.outerNow || 0).toFixed(2) + ' mm)';
    });

    // ---- the shop-flow-9 door (18 ga, four flanges, two closed hems, a Cross-Break, four holes) and mitred tray (14 ga)
    var T18 = 0.0478, H18 = 0.75 - T18;
    var RFQN_DOOR = 'p.name("DOOR-24").units("in");\np.material("Plain Carbon Steel");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "18" });\np.sketch("Top").rect(0, 0, 24, 36).dim(0, "h").end().baseFlange();\n' +
      'p.flange(0.75, [[12, ' + T18 + ', 0], [24, ' + T18 + ', -18], [12, ' + T18 + ', -36], [0, ' + T18 + ', -18]], { position: "inside", lengthRef: "outer", toward: [0, -1, 0], relief: "obround" });\n' +
      'p.hem(0.5, [[' + (24 - T18) + ', ' + (-H18) + ', -18], [' + T18 + ', ' + (-H18) + ', -18]], { hemType: "closed", hemPosition: "inside" });\n' +
      'p.crossBreak([12, ' + T18 + ', -18], {});\n' +
      'p.sketch("Top").circle(1, 1, 0.1405).circle(23, 1, 0.1405).end().cut("through", { both: true });\np.linearPattern({ dir: "z", reverse: true, spacing: 34, count: 2 });\n';
    var T14 = 0.0747;
    var RFQN_TRAY = 'p.name("TRAY-12").units("in");\np.material("Plain Carbon Steel");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "14" });\np.sketch("Top").rect(0, -8, 12, 8).end().baseFlange();\n' +
      'p.sketch("Right").line(0, ' + T14 + ', 0, 1.5).end();\np.miterFlange([[6, ' + T14 + ', 0], [12, ' + T14 + ', 4], [6, ' + T14 + ', 8], [0, ' + T14 + ', 4]], { miterGap: 0.01 });\n';
    function rfQNMeet(a, b) { return a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6; }
    // what a checker of the print would find: texts on texts (of different items), texts across the flats' outlines and
    // bend lines, texts past the border (the zone letters in the margin, layer SHEET, aside), bend lines without exactly
    // one note / tag, texts missing from the R2000 DXF or the PDF
    function rfQNAudit(sh) {
      var b = 10 / 25.4, S = sh.size, res = { over: [], onGeo: [], off: [], noDXF: [], noPDF: [], tags: [] };
      var T = sh.prims.filter(function (p) { return p.k === 'text' && p.text && p.layer !== 'SHEET'; }).map(function (p) { return { p: p, r: DW.textRect(p) }; });
      var geo = sh.prims.filter(function (p) { return p.k === 'line' && (p.layer === 'FLAT_PATTERN' || /^BEND_(UP|DOWN)$/.test(p.layer || '')); });
      function cross(l, r) { for (var i = 0; i <= 32; i++) { var x = l.a[0] + (l.b[0] - l.a[0]) * i / 32, y = l.a[1] + (l.b[1] - l.a[1]) * i / 32; if (x > r.x0 + 1e-6 && x < r.x1 - 1e-6 && y > r.y0 + 1e-6 && y < r.y1 - 1e-6) return true; } return false; }
      T.forEach(function (x, i) {
        var r = x.r;
        if (r.x0 < b - 1e-9 || r.y0 < b - 1e-9 || r.x1 > S[0] - b + 1e-9 || r.y1 > S[1] - b + 1e-9) res.off.push(x.p.text);
        for (var j = i + 1; j < T.length; j++) { var y = T[j].p; if (rfQNMeet(r, T[j].r) && !(x.p.dimIx != null && x.p.dimIx === y.dimIx) && !(x.p.annId != null && x.p.annId === y.annId)) res.over.push(x.p.text + ' x ' + y.text); }
        if (geo.some(function (l) { return cross(l, r); })) res.onGeo.push(x.p.text);
      });
      // bend lines and the tag / note nearest each: one each
      var bl = sh.prims.filter(function (p) { return p.k === 'line' && /^BEND_(UP|DOWN)$/.test(p.layer || ''); });
      var bn = T.filter(function (x) { return x.p.layer === 'BEND_NOTES' && (/^[A-Z]{1,2}$/.test(x.p.text) || /^(UP|DOWN) /.test(x.p.text)) && !/ 1° /.test(x.p.text); });
      var bt = (sh.annotations || []).filter(function (a) { return a.type === 'bendTable'; })[0];
      if (bt) bn = bn.filter(function (x) { return !rfQNMeet(x.r, bt.box); });
      var per = bl.map(function () { return 0; });
      bn.forEach(function (x) {
        var c = [(x.r.x0 + x.r.x1) / 2, (x.r.y0 + x.r.y1) / 2], best = -1, bd = Infinity;
        bl.forEach(function (l, i) { var dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((c[0] - l.a[0]) * dx + (c[1] - l.a[1]) * dy) / L2)), d = Math.hypot(l.a[0] + t * dx - c[0], l.a[1] + t * dy - c[1]); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) per[best]++;
      });
      res.tags = per;
      var dxf = DW.toDXF(sh, { version: 'R2000' }), L = dxf.split(/\r?\n/), g1 = [];
      for (var i = 0; i + 1 < L.length; i += 2) if (L[i].trim() === '1' || L[i].trim() === '3') g1.push(L[i + 1]);
      var pdf = DW.toPDF(sh), ps = typeof pdf === 'string' ? pdf : Array.prototype.map.call(pdf, function (ch) { return String.fromCharCode(ch); }).join('');
      var tj = [], re = /\(((?:[^()\\]|\\.)*)\) Tj/g, m;
      while ((m = re.exec(ps))) tj.push(m[1].replace(/\\([0-7]{3})/g, function (s2, o) { return String.fromCharCode(parseInt(o, 8)); }).replace(/\\(.)/g, '$1'));
      var dxfT = function (t) { return DW.plainText(t).replace(/\n/g, ' ').replace(/Ø/g, '%%c').replace(/±/g, '%%p').replace(/°/g, '%%d').replace(/×/g, 'x').replace(/[^\x20-\x7e]/g, '?'); };
      sh.prims.forEach(function (q) {
        if (q.k !== 'text' || !q.text) return;
        var pt = DW.plainText(q.text), dt = dxfT(q.text);
        if (!g1.some(function (x) { return x.indexOf(dt) >= 0; })) res.noDXF.push(q.text);
        if (!tj.some(function (x) { return x.indexOf(pt) >= 0; })) res.noPDF.push(q.text);
      });
      res.bad = res.over.concat(res.onGeo, res.off, res.noDXF.map(function (t) { return 'DXF ' + t; }), res.noPDF.map(function (t) { return 'PDF ' + t; }), per.some(function (n) { return n !== 1; }) ? ['tags per bend line ' + per.join(',')] : []);
      return res;
    }

    group('rfQN: flat-pattern drawings made like the detailer: the 18 ga door (ANSI C, Bend Table, ordinates, linked notes, D36 -> D42) and the mitred tray (three views and the flat at its own scale)');
    test('door: the flat alone on ANSI C goes to 1:4 (it stayed 1:1 off the sheet); bend notes then a Bend Table: one note / tag per bend line, a hem\'s note no longer across the blank\'s edge, no text on text or geometry, none off the sheet, every text in the R2000 DXF and the PDF; linked FLAT SIZE / MATERIAL / gauge note; D42: the ordinates follow (they dangled), the notes read 43.3429, SCALE 1 : 4 off the title block', function () {
      var r = build(RFQN_DOOR); noErrors(r);
      var m = r.model, sk = m.features[0], lp = m.features.filter(function (f) { return f.type === 'lpattern'; })[0];
      var doc = DW.newDrawing(m, { date: '2026-11-19', format: 'ANSI C' });
      doc.options = { flatDims: true };
      var v = DW.addFlatView(doc, r.mesh, { model: m, build: r.build, fit: true });
      v.flatSize = true;
      assert(Math.abs(v.scale[0] / v.scale[1] - 0.25) < 1e-12, 'scale ' + v.scale);
      var sh = DW.compute(doc, r.mesh, m, { build: r.build }), w = sh.views[0], a = rfQNAudit(sh);
      assert(!a.bad.length, 'notes: ' + a.bad.join(' | '));
      assert(a.tags.length === 6, 'six bend lines ' + a.tags.length);
      DW.autodimension(doc, v.id, w.proj, { scale: w.scale, units: 'in', h: { scheme: 'ordinate', origin: 'left', place: 'below' }, v: { scheme: 'ordinate', origin: 'bottom', place: 'left' } });
      DW.addNote(doc, { p: [1.5, 14], text: 'GRAIN ->' });
      DW.addNote(doc, { p: [1.5, 3], text: 'FLAT SIZE: $PRPSHEET:"Bounding Box Width" X $PRPSHEET:"Bounding Box Length"\nMATERIAL: $PRPSHEET:"Material"\n18 GA ($PRPSHEET:"Sheet Metal Thickness")' });
      v.bendNotes = 'table';
      sh = DW.compute(doc, r.mesh, m, { build: r.build }); a = rfQNAudit(sh);
      assert(!a.bad.length, 'table: ' + a.bad.join(' | '));
      var bt = sh.annotations.filter(function (x) { return x.type === 'bendTable'; })[0];
      assert(bt && bt.info.rows.length === 6 && !(sh.warnings || []).length, 'Bend Table of 6, no warning: ' + (sh.warnings || []).join(' / '));
      sh.views.forEach(function (x) { assert(!rfQNMeet(bt.box, x.box), 'the Bend Table on ' + x.view.name); });
      var txt = sh.prims.filter(function (q) { return q.k === 'text'; }).map(function (q) { return q.text; });
      assert(txt.indexOf('FLAT SIZE: 26.3063 X 37.3429') >= 0 && txt.indexOf('MATERIAL: Plain Carbon Steel') >= 0 && txt.indexOf('18 GA (.0478)') >= 0, 'linked note');
      m.configurations = [{ name: 'D36', values: {} }, { name: 'D42', values: {} }]; m.activeConfiguration = 'D42';
      assert(K.configureDimension(m, { sketch: sk.id, dimIndex: 0 }, 42, 'this').ok && K.configureDimension(m, { feature: lp.id, field: 's1' }, 40, 'this').ok, 'configured');
      var b2 = K.rebuild(m), me2 = K.meshFromBody(b2.body);
      sh = DW.compute(doc, me2, m, { build: b2 }); a = rfQNAudit(sh);
      assert(!a.bad.length, 'D42: ' + a.bad.join(' | '));
      assert(!sh.dims.some(function (d) { return d.dangling; }), 'dangling: ' + sh.dims.filter(function (d) { return d.dangling; }).map(function (d) { return d.text; }).join(' | '));
      var vs = sh.dims.map(function (d) { return d.text; });
      assert(vs.some(function (t) { return /, 43\.343$/.test(t); }) && vs.indexOf('43.343') >= 0, 'the length follows: ' + vs.join(' | '));
      txt = sh.prims.filter(function (q) { return q.k === 'text'; }).map(function (q) { return q.text; });
      assert(txt.indexOf('FLAT SIZE: 26.3063 X 43.3429') >= 0 && txt.indexOf('FLAT SIZE 26.306 × 43.343') >= 0, 'notes follow');
      return 'scale 1:4, 6 tags, ' + vs.join(' | ');
    });
    test('tray on ANSI C: Front / Top / Right / Isometric at 1:2 and the flat at its own 1:4 on the same sheet (SCALE 1 : 4 under it), four tags, the Bend Table clear of every view and value; no text on text or geometry, none off the sheet, the DXF / PDF texts; no holes, so no Hole Table', function () {
      var r = build(RFQN_TRAY); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', format: 'ANSI C' });
      DW.standard3View(doc, r.mesh, 'in');
      var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, fit: true, scale: '1:4' });
      v.flatSize = true; v.bendNotes = 'table';
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), a = rfQNAudit(sh);
      assert(sh.views.length === 5 && (doc.sheets ? doc.sheets.length : 1) === 1, 'one sheet, five views');
      assert(!a.bad.length, a.bad.join(' | '));
      assert(a.tags.length === 4, 'four bend lines');
      var bt = sh.annotations.filter(function (x) { return x.type === 'bendTable'; })[0];
      sh.views.forEach(function (x) { assert(!rfQNMeet(bt.box, x.box), 'the Bend Table on ' + x.view.name); });
      assert(sh.prims.some(function (q) { return q.k === 'text' && q.text === 'SCALE 1 : 4'; }), 'SCALE 1 : 4');
      assert(!(DW.viewHoles ? DW.viewHoles(sh.views[4]) : []).length, 'no holes');
      return 'Bend Table ' + JSON.stringify(bt.box);
    });
  })();
