  // --- rfQC (2026-11-19, lane drawflow6: drawings driven like the user): block attributes in a drawing's DXF as ATTDEF /
  // ATTRIB (R2000), a dimension moved / copied to another view, ordinates clear of a linear stack, Bend Table placement ---
  (function () {
    group('rfQC: block attributes: R2000 with { attributes: true } (the app\'s Save as DXF / DWG) writes ATTDEF in the BLOCK and ATTRIB + SEQEND after each INSERT; R12 keeps TEXT; read back the same');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    // the rfPQ revision stamp: frame, captions REV / DATE / BY in the block, three tagged values
    function rfQCStamp() {
      var r = build('p.units("in"); p.property("Revision", "D"); p.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);');
      var doc = DW.newDrawing(r.model, { date: '2026-11-18', scale: [1, 1] });
      DW.addView(doc, 'Front', { x: 4, y: 5 });
      var ids = DW.addSketchRect(doc, [12, 1], [14, 1.75]);
      ids.push(DW.addSketchEntity(doc, { t: 'line', a: [12, 1.375], b: [14, 1.375] }).id);
      var cap = [['REV', 12.1], ['DATE', 12.6], ['BY', 13.5]].map(function (c) { return DW.addSketchEntity(doc, { t: 'text', p: [c[1], 1.5], text: c[0], h: 0.1 }).id; });
      var val = [['A', 12.1], ['11/18/26', 12.6], ['LM', 13.5]].map(function (c) { return DW.addSketchEntity(doc, { t: 'text', p: [c[1], 1.12], text: c[0], h: 0.1 }).id; });
      var attrs = {}; attrs[val[0]] = 'REV'; attrs[val[1]] = { tag: 'DATE', prompt: 'Date' }; attrs[val[2]] = 'BY';
      DW.makeBlock(doc, ids.concat(cap, val), { name: 'REV STAMP', base: [12, 1.75], attrs: attrs });
      doc.blocks['REV STAMP'].ents.forEach(function (e) { if (e.attr === 'REV') e.text = '$PRPSHEET:"Revision"'; });
      DW.insertBlock(doc, 'REV STAMP', [12, 4], null, { attrs: { REV: 'B', DATE: '11/20/26', BY: 'JD' }, rot: 90, scale: 2 });
      return { r: r, doc: doc, sheet: function () { return DW.compute(doc, r.mesh, r.model); } };
    }
    // DXF records in order: { type, sec, g: first value per code, all: [[code, value]] }
    function rfQCRecs(dxf) {
      var L = dxf.split('\n').map(function (s) { return s.trim(); }), out = [], sec = null, cur = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i], v = L[i + 1];
        if (c === '0' && v === 'SECTION') { sec = L[i + 3]; continue; }
        if (c === '0') { cur = { type: v, sec: sec, g: {}, all: [] }; out.push(cur); continue; }
        if (cur) { if (cur.g[c] == null) cur.g[c] = v; cur.all.push([c, v]); }
      }
      return out;
    }
    // the texts Anvil's DXF reader gets back, as 'value@x,y' sorted (positions to 1e-4)
    function rfQCRead(dxf) {
      var P = DxfImport.parse(dxf, {});
      return P.entities.filter(function (e) { return e.t === 'text' && e.layer === 'SKETCH'; }).map(function (e) { return e.str + '@' + [e.x, e.y].map(function (x) { return (Math.round(x * 1e4) / 1e4).toFixed(4); }).join(','); }).sort();
    }
    test('rfQC: R2000: the BLOCK holds the frame, captions and three ATTDEFs (REV default D from the link, DATE prompt Date, BY); each INSERT has 66 1, its three ATTRIBs (B / 11/20/26 / JD, A-instance D / 11/18/26 / LM) and a SEQEND; no value as loose TEXT', function () {
      var s = rfQCStamp(), sh = s.sheet(), R = rfQCRecs(DW.toDXF(sh, { version: 'R2000', attributes: true }));
      var b0 = R.filter(function (e) { return e.type === 'BLOCK' && e.g['2'] === 'REV_STAMP'; })[0], i0 = R.indexOf(b0), defs = [];
      assert(b0 && b0.g['70'] === '2', 'BLOCK flag 70 = 2 (has attributes): ' + (b0 && b0.g['70']));
      for (var i = i0 + 1; R[i].type !== 'ENDBLK'; i++) if (R[i].type === 'ATTDEF') defs.push(R[i].g['2'] + '=' + R[i].g['1'] + ':' + R[i].g['3']);
      assert(defs.join('|') === 'REV=D:REV|DATE=11/18/26:Date|BY=LM:BY', 'ATTDEFs: ' + defs.join('|'));
      var ins = R.filter(function (e) { return e.sec === 'ENTITIES' && e.type === 'INSERT'; });
      assert(ins.length === 2 && ins.every(function (e) { return e.g['66'] === '1'; }), 'two INSERTs with 66 1');
      var vals = ins.map(function (e) {
        var k = R.indexOf(e) + 1, v = [];
        for (; R[k].type === 'ATTRIB'; k++) { assert(R[k].g['330'] === e.g['5'], 'ATTRIB owned by its INSERT'); v.push(R[k].g['2'] + '=' + R[k].g['1']); }
        assert(R[k].type === 'SEQEND' && R[k].g['330'] === e.g['5'], 'SEQEND after the ATTRIBs, owned by the INSERT: ' + R[k].type);
        return v.join(' ');
      });
      assert(vals.indexOf('REV=D DATE=11/18/26 BY=LM') >= 0 && vals.indexOf('REV=B DATE=11/20/26 BY=JD') >= 0, 'values: ' + vals.join(' / '));
      var loose = R.filter(function (e) { return e.sec === 'ENTITIES' && e.type === 'TEXT'; }).map(function (e) { return e.g['1']; });
      ['LM', 'JD', '11/20/26'].forEach(function (v) { assert(loose.indexOf(v) < 0, 'no loose TEXT ' + v); });
      return vals.join(' / ');
    });
    test('rfQC: R2000 and R12 read back by Anvil\'s DXF reader give the same texts at the same places as the sheet (the turned, doubled second stamp too); both audit clean; the DWG writer takes the R2000 file', function () {
      if (typeof DxfImport === 'undefined') return 'DxfImport not loaded';
      var s = rfQCStamp(), sh = s.sheet();
      var want = sh.prims.filter(function (p) { return p.k === 'text' && p.blockIns != null; }).length;
      var a = rfQCRead(DW.toDXF(sh, { version: 'R2000', attributes: true })), b = rfQCRead(DW.toDXF(sh, { version: 'R12' }));
      var aa = a;
      var bb = b;
      assert(aa.length === want && JSON.stringify(aa) === JSON.stringify(bb), 'R2000 ' + aa.length + ' vs R12 ' + bb.length + ' (sheet ' + want + '): ' + aa.join(' ') + ' || ' + bb.join(' '));
      if (typeof DxfCheck !== 'undefined') ['R2000', 'R12'].forEach(function (v) { var au = DxfCheck.audit(DW.toDXF(sh, { version: v }), { units: 'in' }); assert(!au.errors.length, v + ' audit: ' + au.errors.slice(0, 3).join(' | ')); });
      var out = aa.length + ' block texts alike';
      if (typeof DWG !== 'undefined') { var bytes = DWG.fromDXF(DW.toDXF(sh, { version: 'R2000', attributes: true })); assert(bytes && bytes.length > 1000, 'DWG'); out += ', DWG ' + bytes.length + ' bytes'; }
      return out;
    });
  })();

  // --- rfQC 2: a dimension moved / copied to another view (Shift+drag / Ctrl+drag) ---
  (function () {
    group('rfQC: dimToView: a model item or Smart Dimension moved / copied to another view where it is true length; refused where it is not');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0747;
    var BRKT = 'p.name("PB-BRKT").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(1.5, -1.5, 0.1405).circle(4.5, -1.5, 0.1405).circle(3, -1.5, 0.25).cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n';
    test('rfQC: the Front view\'s 1.500 (flange height, a model item) moved to the Right view: a vertical 1.500 there between model points, the item suppressed; the 6.000 refused on the Right view (it runs along X), copied to the Top view; a Smart Dimension moved leaves its view; the flange made 1.75: the moved one reads 1.750', function () {
      var r = build(BRKT); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19' });
      DW.standard3View(doc, r.mesh, 'in');
      doc.modelItems = { source: 'entire', marked: true, holeLocations: true, holeCallouts: true, annotations: true, dedupe: true }; doc.autoDims = true;
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var d = sh.dims.filter(function (x) { return x.view === 1 && x.text === '1.500'; })[0];
      assert(d && d.auto, 'the Front 1.500 model item');
      var nd = DW.dimToView(doc, r.mesh, d, 3, [-4, 0.75], {});
      assert(nd.kind === 'v' && Math.abs(nd.value - 1.5) < 1e-12 && nd.refs.length === 2, 'vertical 1.500 in View3: ' + JSON.stringify(nd));
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(!sh.dims.some(function (x) { return x.view === 1 && x.text === '1.500'; }) && sh.dims.some(function (x) { return x.view === 3 && x.text === '1.500' && !x.auto; }), 'moved');
      var six = sh.dims.filter(function (x) { return x.view === 1 && x.kind === 'h' && x.text === '6.000'; })[0], err = '';
      try { DW.dimToView(doc, r.mesh, six, 3, [0, 0]); } catch (e) { err = e.message; }
      assert(/Not true length in Drawing View3/.test(err), 'refused: ' + err);
      var c6 = DW.dimToView(doc, r.mesh, six, 2, [3, 2], { copy: true });
      assert(c6.kind === 'h' && Math.abs(c6.value - 6) < 1e-12, 'copied to Top: ' + c6.value);
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      assert(sh.dims.some(function (x) { return x.view === 1 && x.text === '6.000'; }) && sh.dims.some(function (x) { return x.view === 2 && x.text === '6.000' && !x.auto; }), 'copy keeps the source');
      // a Smart Dimension (the copy on Top) moved back to Front leaves Top
      var u = sh.dims.filter(function (x) { return x.view === 2 && x.text === '6.000' && !x.auto; })[0];
      DW.dimToView(doc, r.mesh, u, 1, [3, 3], {});
      assert(!(DW.findView(doc, 2).dims || []).length && DW.findView(doc, 1).dims.length === 1, 'moved from Top to Front');
      // the part changes: the moved 1.500 follows (flange 1.5 -> 1.75)
      var r2 = build(BRKT.replace('p.flange(1.5,', 'p.flange(1.75,')); noErrors(r2);
      var sh2 = DW.compute(doc, r2.mesh, r2.model, { build: r2.build });
      var m = sh2.dims.filter(function (x) { return x.view === 3 && !x.auto && x.kind === 'v'; })[0];
      assert(m && m.text === '1.750' && !m.dangling, 'follows the part: ' + (m && m.text));
      return 'View1 1.500 -> View3; 6.000 refused on View3, copied to View2; edit -> ' + m.text;
    });
  })();

  // --- rfQC 3: Autodimension ordinates beside the Model Items of a flat (the hole locations' stack) ---
  (function () {
    group('rfQC: Autodimension ordinates on a flat with Model Items: no value on another, whichever came first');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0747;
    var BRKT = 'p.name("PB-BRKT").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(1.5, -1.5, 0.1405).circle(4.5, -1.5, 0.1405).circle(3, -1.5, 0.25).cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
      'p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer", angle: 45 });\n' +
      'p.flange(1.25, [[3, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.hem(0.375, [[3, 1.25, ' + (3 - T / 2) + ']], { gap: 0.0299 });\n';
    function over(sh) {
      var R = sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null; }).map(function (p) { return { t: p.text, d: p.dimIx, r: DW.textRect(p) }; }), o = [];
      R.forEach(function (x, i) { for (var j = i + 1; j < R.length; j++) { var y = R[j]; if (y.d !== x.d && x.r.x0 < y.r.x1 - 1e-3 && y.r.x0 < x.r.x1 - 1e-3 && x.r.y0 < y.r.y1 - 1e-3 && y.r.y0 < x.r.y1 - 1e-3) o.push(x.t + ' x ' + y.t); } });
      return o;
    }
    test('rfQC: the 14 ga bracket\'s flat (Model Items: hole locations 2.376 / 3.876 / 5.376; ordinates 0 … 8.253 to every bend line above): Model Items first or the ordinates first, bend notes or a Bend Table, overall dimensions on or off: no value on another (handed on as 2.376 on .938 / 1.011; measured clear on main)', function () {
      var r = build(BRKT), out = []; noErrors(r);
      [[true, 'notes', false], [true, 'table', true], [false, 'notes', false], [false, 'table', true]].forEach(function (c) {
        var doc = DW.newDrawing(r.model, { date: '2026-11-19' });
        if (c[2]) doc.options = { flatDims: true };
        var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, fit: true, bendNotes: c[1] });
        if (c[2]) v.flatSize = true;
        function items() { doc.modelItems = { source: 'entire', marked: true, holeLocations: true, holeCallouts: true, annotations: true, dedupe: true }; doc.autoDims = true; }
        if (c[0]) items();
        var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === v.id; })[0];
        DW.autodimension(doc, v.id, w.proj, { scale: w.scale, units: 'in', h: { scheme: 'ordinate', origin: 'left', place: 'above' }, v: null });
        if (!c[0]) items();
        sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
        var o = over(sh), n = sh.dims.filter(function (d) { return d.kind === 'h' && d.auto; }).length;
        assert(n >= 3 && sh.dims.some(function (d) { return d.kind === 'ordinate'; }), 'hole locations and ordinates: ' + n);
        assert(!o.length, (c[0] ? 'items first' : 'ordinates first') + ', ' + c[1] + ': ' + o.join(' | '));
        out.push((c[0] ? 'items' : 'ords') + '/' + c[1] + ' clear');
      });
      return out.join(', ');
    });
  })();

  // --- rfQC 4: a Bend Table with no free paper keeps off the title block, the blocks beside it and every value ---
  (function () {
    group('rfQC: Bend Table with no free paper: never on the title / tolerance / revision blocks or a dimension value; off the sheet at the right when nothing else is left');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0747, Ti = 0.0598;
    var BRKT = 'p.name("PB-BRKT").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.sketch("Top", ' + T + ').circle(1.5, -1.5, 0.1405).circle(4.5, -1.5, 0.1405).circle(3, -1.5, 0.25).cut("through", { reverse: true });\n' +
      'p.flange(1.5, [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n' +
      'p.flange(1, [[3, ' + T + ', 0]], { position: "inside", lengthRef: "outer", angle: 45 });\n' +
      'p.flange(1.25, [[3, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.hem(0.375, [[3, 1.25, ' + (3 - T / 2) + ']], { gap: 0.0299 });\n';
    var BOX = 'p.name("Box").units("in");\np.sheet(' + Ti + ', 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(1.5, [[3, ' + Ti + ', 0], [3, ' + Ti + ', 4], [0, ' + Ti + ', 2], [6, ' + Ti + ', 2]], { position: "inside", relief: "rect" });\n' +
      'p.hem(0.375, [[3, 1.6196, 0]], { gap: 0.0299 });\n';
    function meet(a, b) { return a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6; }
    function check(sh, label) {
      var bt = sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.box, label + ': a Bend Table');
      DW.tbRects(sh.size, 'in').forEach(function (b, i) { assert(!meet(bt.box, b), label + ': on title block rect ' + i + ' ' + JSON.stringify(bt.box)); });
      sh.prims.forEach(function (p) { if (p.k === 'text' && p.dimIx != null) assert(!meet(bt.box, DW.textRect(p)), label + ': on the value ' + p.text); });
      return bt;
    }
    test('rfQC: the bracket\'s flat filling ANSI B (overall dimensions, FLAT SIZE, ordinates to every bend line, a GRAIN note): the Bend Table, with no free paper, is off the UNLESS OTHERWISE SPECIFIED block (where it was put), the title block and every value; warned', function () {
      var r = build(BRKT); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19' });
      doc.options = { flatDims: true };
      var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, fit: true });
      v.flatSize = true; v.bendNotes = 'table';
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views[0];
      DW.autodimension(doc, v.id, w.proj, { scale: w.scale, units: 'in', h: { scheme: 'ordinate', origin: 'left', place: 'above' }, v: null });
      DW.addNote(doc, { p: [1, 9], text: 'GRAIN ->' });
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var bt = check(sh, 'bracket');
      assert(bt.info.noRoom && (sh.warnings || []).some(function (x) { return /Bend Table/.test(x); }), 'warned: ' + JSON.stringify(sh.warnings));
      return 'at ' + bt.box.x0.toFixed(2) + ', ' + bt.box.y0.toFixed(2) + (bt.info.offSheet ? ' (off the sheet)' : ' (inside the border)');
    });
    test('rfQC: the box\'s flat on a full ANSI A sheet at 1 : 1 (rfJB\'s case), model items on: the Bend Table meets no block and no value; where every spot inside the border would, it hangs off the sheet on the right and the warning says so', function () {
      var r = build(BOX); noErrors(r);
      var doc = DW.newDrawing(r.model, { projection: 'third', format: 'ANSI A', scale: [1, 1], options: { flatDims: true } });
      DW.standard3View(doc, r.mesh, 'in');
      doc.sheet.autoScale = false; doc.sheet.scale = [1, 1];
      DW.layout(doc, r.mesh, 'in');
      doc.autoDims = true;
      DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 5.5, y: 4.25, bendNotes: 'table' });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), bt = check(sh, 'box on A');
      assert(bt.info.noRoom, 'no room');
      var S = sh.size, b1 = 10 / 25.4;
      assert(bt.info.offSheet || (bt.box.x0 >= b1 - 1e-9 && bt.box.y0 >= b1 - 1e-9 && bt.box.x1 <= S[0] - b1 + 1e-9 && bt.box.y1 <= S[1] - b1 + 1e-9), 'inside the border unless off the sheet on purpose: ' + JSON.stringify(bt.box));
      if (bt.info.offSheet) {
        assert(bt.box.x0 > sh.size[0] - 1e-9, 'past the sheet\'s right edge: ' + bt.box.x0);
        assert(sh.warnings.some(function (x) { return /off the sheet/.test(x); }), 'said: ' + JSON.stringify(sh.warnings));
      }
      return bt.info.offSheet ? 'off the sheet at x ' + bt.box.x0.toFixed(2) : 'inside at ' + bt.box.x0.toFixed(2) + ', ' + bt.box.y0.toFixed(2);
    });
  })();

  // --- rfQC 5: job 4, part edits after release: dimensions follow or dangle, rev B, Save / Open gives the same sheet ---
  (function () {
    group('rfQC: a released bracket print after part edits (a flange 1/4 longer, the .500 hole removed, the Description changed): every value follows or dangles, rev B, Save / Open identical');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0747;
    function brkt(fl, hole, desc) {
      return 'p.name("PB-BRKT").units("in");\np.property("Description", "' + desc + '");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
        'p.sketch("Top", ' + T + ').circle(1.5, -1.5, 0.1405).circle(4.5, -1.5, 0.1405)' + (hole ? '.circle(3, -1.5, 0.25)' : '') + '.cut("through", { reverse: true });\n' +
        'p.flange(' + fl + ', [[6, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(1, [[0, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n';
    }
    test('rfQC: rev A drawing (model items, a hole callout and a Smart Dimension on the .500 hole, the Front 1.500 moved to the Right view) -> part edited: 1.500 reads 1.750 in both places, the .500 callout and its dimension dangle (drawn, flagged), DESCRIPTION follows; rev B added; drawingFile -> readDrawingFile -> the same SVG', function () {
      var r1 = build(brkt(1.5, true, 'BRACKET 14GA')); noErrors(r1);
      var doc = DW.newDrawing(r1.model, { date: '2026-11-19' });
      DW.standard3View(doc, r1.mesh, 'in');
      doc.modelItems = { source: 'entire', marked: true, holeLocations: true, holeCallouts: true, annotations: true, dedupe: true }; doc.autoDims = true;
      var top = doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      DW.insertRevisionTable(doc, {});
      DW.addRevision(doc, { description: 'RELEASED', date: '11/19/26', approved: 'LM' });
      var sh = DW.compute(doc, r1.mesh, r1.model, { build: r1.build });
      var hc = DW.addHoleCallout(doc, top.id, { c: [3, -1.5], r: 0.25, lead: [0.6, 0.6] });
      DW.addSmartDim(doc, top.id, { center: { c: [1.5, -1.5], r: 0.1405 } }, { center: { c: [3, -1.5], r: 0.25 } }, [2.25, 0.9], { lock: 'h', scale: 1 });
      var f15 = sh.dims.filter(function (x) { return x.view === 1 && x.text === '1.500'; })[0];
      DW.dimToView(doc, r1.mesh, f15, 3, [-4, 0.75], { copy: true });
      sh = DW.compute(doc, r1.mesh, r1.model, { build: r1.build });
      assert(!sh.dims.some(function (d) { return d.dangling; }) && !sh.annotations.some(function (a) { return a.dangling; }), 'rev A: nothing dangling');
      // the part changes after release
      var r2 = build(brkt(1.75, false, 'BRACKET 14GA LONG')); noErrors(r2);
      var sh2 = DW.compute(doc, r2.mesh, r2.model, { build: r2.build });
      var f = sh2.dims.filter(function (d) { return (d.view === 1 || d.view === 3) && d.kind === 'v' && /^1\.750$/.test(d.text); }).map(function (d) { return d.view + (d.auto ? 'i' : 'u'); }).sort().join(',');
      assert(f === '1i,3u', 'the flange height follows: ' + f + ' / ' + sh2.dims.filter(function (d) { return d.kind === 'v'; }).map(function (d) { return d.view + ':' + d.text; }).join(' '));
      var an = sh2.annotations.filter(function (a) { return a.id === hc.id; })[0];
      assert(an && an.dangling, 'the .500 callout dangles: ' + JSON.stringify(an && { d: an.dangling, t: an.text }));
      var ud = sh2.dims.filter(function (d) { return d.view === top.id && !d.auto && d.kind === 'h'; })[0];
      assert(ud && ud.dangling, 'its Smart Dimension dangles: ' + JSON.stringify(ud && { d: ud.dangling, t: ud.text }));
      assert(sh2.prims.some(function (p) { return p.k === 'text' && p.dimIx != null && p.color === 'dangling'; }) || sh2.dims.some(function (d) { return d.dangling; }), 'drawn as dangling');
      assert(!sh2.dims.some(function (d) { return d.auto && /Ø\.500/.test(d.text); }), 'no model item for the removed hole');
      assert(sh2.prims.some(function (p) { return p.k === 'text' && p.layer === 'SHEET' && /BRACKET 14GA LONG/.test(p.text); }), 'DESCRIPTION follows the part');
      DW.addRevision(doc, { description: 'FLANGE +.25, .500 HOLE REMOVED', date: '11/20/26', approved: 'LM' });
      sh2 = DW.compute(doc, r2.mesh, r2.model, { build: r2.build });
      assert(DW.latestRev(doc) === 'B', 'rev B: ' + DW.latestRev(doc));
      // Save / Close / Open
      var svg1 = DW.toSVG(sh2), file = JSON.stringify(DW.drawingFile(doc, r2.model, 'PB-BRKT.part'));
      var doc2 = DW.readDrawingFile(file).drawing, svg2 = DW.toSVG(DW.compute(doc2, r2.mesh, r2.model, { build: r2.build }));
      assert(svg1 === svg2, 'the same SVG after Save / Open (' + svg1.length + ' vs ' + svg2.length + ')');
      return '1.500 -> 1.750 (Front item, Right copy); .500 callout + dimension dangling; rev ' + DW.latestRev(doc) + '; SVG ' + svg1.length + ' chars identical';
    });
  })();

  // --- rfQC 6: job 5, the title block and the sheet: $PRP / $PRPSHEET fields, A -> B -> C, a second sheet of another format ---
  (function () {
    group('rfQC: title block fields linked to the part ($PRP / $PRPSHEET), the sheet taken A -> B -> C with everything inside it, a second sheet in another format');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    test('rfQC: a plate drawing on ANSI A: TITLE ($PRPSHEET:"Description") and a note $PRPSHEET:"Material" / $PRP:"DrawnBy" show the part\'s and the drawing\'s values; the sheet set to B then C (the views re-laid, a note and a flat-free sheet kept inside the border, no view on the title block); Sheet2 in ANSI D at 1:2 keeps Sheet1 at C; the title block reads the same on both', function () {
      var r = build('p.name("PLT-7").units("in"); p.property("Description", "MOUNT PLATE"); p.property("Material", "A36"); p.sketch("Front").rect(0, 0, 6, 3).circle(1, 1.5, 0.25).circle(5, 1.5, 0.25).extrude(0.25);'); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', format: 'ANSI A' });
      DW.standard3View(doc, r.mesh, 'in');
      doc.properties = { DrawnBy: 'LM' };
      DW.addNote(doc, { p: [1, 7.5], text: 'MATERIAL: $PRPSHEET:"Material" BY $PRP:"DrawnBy"' });
      function texts(sh) { return sh.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; }); }
      function inside(sh, label) {
        var S = sh.size, b = 10 / 25.4, tb = DW.tbRects(S, 'in');
        sh.views.forEach(function (w) {
          assert(w.box.x0 >= b - 1e-6 && w.box.y0 >= b - 1e-6 && w.box.x1 <= S[0] - b + 1e-6 && w.box.y1 <= S[1] - b + 1e-6, label + ': ' + w.view.name + ' inside ' + JSON.stringify(w.box));
          tb.forEach(function (q) { assert(!(w.box.x0 < q.x1 && q.x0 < w.box.x1 && w.box.y0 < q.y1 && q.y0 < w.box.y1), label + ': ' + w.view.name + ' on the title block'); });
        });
        (sh.notes || []).forEach(function (n) { assert(n.box.x1 <= S[0] - b + 1e-6 && n.box.y1 <= S[1] - b + 1e-6, label + ': note inside'); });
      }
      var sh = DW.compute(doc, r.mesh, r.model), T = texts(sh);
      assert(T.indexOf('MOUNT PLATE') >= 0 && T.indexOf('MATERIAL: A36 BY LM') >= 0 && !T.some(function (x) { return /\$PRP/.test(x); }), 'linked values: ' + T.filter(function (x) { return /PLATE|A36|PRP/.test(x); }).join(' | '));
      inside(sh, 'A');
      var out = ['A'];
      ['ANSI B', 'ANSI C'].forEach(function (fm) {
        var S0 = sh.size.slice();
        doc.sheet.format = fm;
        DW.layout(doc, r.mesh, 'in');
        DW.refitSheet(doc, r.mesh, S0, 'in');
        sh = DW.compute(doc, r.mesh, r.model);
        inside(sh, fm);
        assert(texts(sh).indexOf('MOUNT PLATE') >= 0, fm + ': title');
        out.push(fm.slice(5) + ' ' + sh.size.map(function (x) { return x.toFixed(0); }).join('x'));
      });
      DW.addSheet(doc, { format: 'ANSI D', scale: [1, 2] });
      DW.addView(doc, 'Front', { x: 10, y: 10 });
      var sh2 = DW.compute(doc, r.mesh, r.model);
      assert(Math.abs(sh2.size[0] - 34) < 1e-6 && Math.abs(sh2.size[1] - 22) < 1e-6, 'Sheet2 is D: ' + sh2.size);
      assert(texts(sh2).indexOf('MOUNT PLATE') >= 0 && texts(sh2).some(function (x) { return /2 OF 2/.test(x); }), 'Sheet2 title block: ' + texts(sh2).filter(function (x) { return /OF/.test(x); }).join(','));
      DW.activateSheet(doc, 0);
      var sh1 = DW.compute(doc, r.mesh, r.model);
      assert(Math.abs(sh1.size[0] - 22) < 1e-6 && texts(sh1).some(function (x) { return /1 OF 2/.test(x); }), 'Sheet1 still C, 1 OF 2: ' + sh1.size);
      out.push('Sheet2 D');
      return out.join(' -> ');
    });
  })();