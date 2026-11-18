  // --- rfPQ (2026-11-18, lane drawfinish: today's drawing tools finished): the Alternate Position view's box holds the
  // phantom part (model items keep off it), block insertion points and attributes (a revision stamp's REV / DATE / BY),
  // BOM cells typed on the drawing (DESCRIPTION written back to the part, other columns kept on the drawing) ---
  (function () {
    group('rfPQ: Alternate Position View: the view\'s box grows to hold the phantom part; model items and the view label keep off it');
    if (typeof Drawing === 'undefined' || typeof Assembly === 'undefined') return;
    var DW = Drawing, AS = Assembly;
    // Base 100 x 60 x 10 fixed; Block 20 x 20 x 20 held 15 mm left of the base by a Distance mate (its bottom and back
    // flush with the base's): the second position (40 mm) puts it where the Front view's left model items go
    function rfPQAsm() {
      var m = AS.newAssembly();
      var base = AS.insert(m, { script: 'p.name("Base"); p.box(100, 60, 10);' }).id, blk = AS.insert(m, { script: 'p.name("Block"); p.box(20, 20, 20);' }, { position: [-30, 2, 3] }).id;
      var dm = AS.addMate(m, 'distance', { component: blk, face: [20, 10, 10] }, { component: base, face: [0, 5, 30] }, { distance: 15 });
      AS.addMate(m, 'coincident', { component: blk, face: [10, 0, 10] }, { component: base, face: [50, 0, 30] }, { alignment: 'aligned' });
      AS.addMate(m, 'coincident', { component: blk, face: [10, 10, 0] }, { component: base, face: [50, 5, 0] }, { alignment: 'aligned' });
      var b = AS.rebuild(m), mesh = K.meshFromBody(b.body);
      return { model: m, build: b, mesh: mesh, mate: dm, blk: blk };
    }
    function rfPQBoxOf(prims) {
      var bx = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      prims.forEach(function (p) {
        var pts = p.k === 'line' ? [p.a, p.b] : p.k === 'circle' || p.k === 'arc' ? [[p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]] : p.p ? [p.p] : [];
        pts.forEach(function (q) { bx.x0 = Math.min(bx.x0, q[0]); bx.y0 = Math.min(bx.y0, q[1]); bx.x1 = Math.max(bx.x1, q[0]); bx.y1 = Math.max(bx.y1, q[1]); });
      });
      return bx;
    }
    test('rfPQ: the block 25 mm further left in phantom: the Front view\'s box reaches its left side (was the main position\'s), no model item text or dimension line on it; the box comes back when the position is deleted', function () {
      var a = rfPQAsm(), doc = DW.newDrawing(a.model, { date: '2026-11-18', scale: [1, 2] });
      doc.autoDims = true;   // (Insert Model Items: an assembly drawing has none by default)
      var fv = DW.addView(doc, 'Front', { x: 150, y: 130 });
      var sh0 = DW.compute(doc, a.mesh, a.model, { build: a.build }), b0 = sh0.views[0].box;
      DW.addAltPosition(doc, fv.id, { mates: { Distance1: 40 } }, a.model);
      var sh = DW.compute(doc, a.mesh, a.model, { build: a.build }), w = sh.views[0], bx = w.box;
      var ph = rfPQBoxOf(sh.prims.filter(function (p) { return p.altPos === 1; }));
      assert(isFinite(ph.x0), 'no phantom lines');
      near(b0.x0 - ph.x0, 12.5, 1e-6, 'the phantom 25 mm (12.5 paper) left of the old box');
      assert(bx.x0 <= ph.x0 + 1e-9 && bx.x1 >= ph.x1 - 1e-9 && bx.y0 <= ph.y0 + 1e-9 && bx.y1 >= ph.y1 - 1e-9, 'the box holds the phantom: ' + JSON.stringify(bx) + ' / ' + JSON.stringify(ph));
      near(bx.x0, ph.x0, 1e-9, 'box left = phantom left');
      near(bx.y0, b0.y0, 1e-9, 'bottom unchanged'); near(bx.y1, b0.y1, 1e-9, 'top unchanged'); near(bx.x1, b0.x1, 1e-9, 'right unchanged');
      // model items (dimensions of the view) and its label: none of their texts inside the phantom's box
      var dims = (sh.dims || []).filter(function (d) { return d.view === fv.id; });
      assert(dims.length > 0, 'model items drawn');
      var inside = dims.filter(function (d) { var t = d.tbox || d.box; return t && isFinite(t.x0) && t.x1 > ph.x0 + 1e-6 && t.x0 < ph.x1 - 1e-6 && t.y1 > ph.y0 + 1e-6 && t.y0 < ph.y1 - 1e-6; });
      assert(!inside.length, inside.length + ' model item(s) on the phantom part: ' + inside.map(function (d) { return d.text; }).join(', '));
      // ... nor their dimension lines (the block's 20 height ran its dimension line up through the phantom block; its
      // extension lines may run along the phantom's top and bottom edges, which are level with the block's)
      var across = sh.prims.filter(function (p) {
        if (p.dimIx == null || p.k !== 'line' || p.view !== fv.id) return false;
        var x0 = Math.min(p.a[0], p.b[0]), x1 = Math.max(p.a[0], p.b[0]), y0 = Math.min(p.a[1], p.b[1]), y1 = Math.max(p.a[1], p.b[1]);
        return x1 > ph.x0 + 1e-6 && x0 < ph.x1 - 1e-6 && y1 > ph.y0 + 1e-6 && y0 < ph.y1 - 1e-6;
      });
      assert(!across.length, across.length + ' dimension line(s) across the phantom part');
      DW.deleteAltPosition(doc, fv.id, 1);
      var b2 = DW.compute(doc, a.mesh, a.model, { build: a.build }).views[0].box;
      near(b2.x0, b0.x0, 1e-9, 'box back');
      return 'box left ' + b0.x0.toFixed(3) + ' -> ' + bx.x0.toFixed(3) + ', ' + dims.length + ' model items clear';
    });
  })();

  // --- rfPQ 2: block insertion point and attributes (a revision stamp: REV / DATE / BY filled in per instance) ---
  (function () {
    group('rfPQ: Blocks: the insertion point where it is picked; attributes (tagged texts) filled in per instance, a linked default ($PRPSHEET:"Revision"); DXF / DWG');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing;
    // an inch plate with Revision "D"; a 2 x .75 revision stamp on the sheet: frame, a line across, captions REV / DATE /
    // BY over three values (A, 11/18/26, LM)
    function rfPQStamp() {
      var r = build('p.units("in"); p.property("Revision", "D"); p.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);');
      var doc = DW.newDrawing(r.model, { date: '2026-11-18', scale: [1, 1] });
      DW.addView(doc, 'Front', { x: 4, y: 5 });
      var ids = DW.addSketchRect(doc, [12, 1], [14, 1.75]);
      ids.push(DW.addSketchEntity(doc, { t: 'line', a: [12, 1.375], b: [14, 1.375] }).id);
      var cap = [['REV', 12.1], ['DATE', 12.6], ['BY', 13.5]].map(function (c) { return DW.addSketchEntity(doc, { t: 'text', p: [c[1], 1.5], text: c[0], h: 0.1 }).id; });
      var val = [['A', 12.1], ['11/18/26', 12.6], ['LM', 13.5]].map(function (c) { return DW.addSketchEntity(doc, { t: 'text', p: [c[1], 1.12], text: c[0], h: 0.1 }).id; });
      return { r: r, doc: doc, ids: ids.concat(cap, val), cap: cap, val: val, sheet: function () { return DW.compute(doc, r.mesh, r.model); } };
    }
    function rfPQTexts(sh, id) { return sh.prims.filter(function (p) { return p.blockIns === id && p.k === 'text'; }).map(function (p) { return p.text; }); }
    function rfPQEnts(dxf) {
      var L = dxf.split('\n').map(function (s) { return s.trim(); }), out = [], sec = null, cur = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i], v = L[i + 1];
        if (c === '0' && v === 'SECTION') { sec = L[i + 3]; continue; }
        if (c === '0') { cur = { type: v, sec: sec, g: {} }; out.push(cur); continue; }
        if (cur && cur.g[c] == null) cur.g[c] = v;
      }
      return out;
    }
    test('rfPQ: Make Block with the insertion point picked at the stamp\'s top-left corner (not the lower-left): the instance there, the definition relative to it; three tagged texts are its attributes with their defaults', function () {
      var s = rfPQStamp();
      var attrs = {}; attrs[s.val[0]] = 'REV'; attrs[s.val[1]] = { tag: 'DATE', prompt: 'Date' }; attrs[s.val[2]] = 'by';
      var ins = DW.makeBlock(s.doc, s.ids, { name: 'REV STAMP', base: [12, 1.75], attrs: attrs });
      assert(Math.abs(ins.p[0] - 12) < 1e-12 && Math.abs(ins.p[1] - 1.75) < 1e-12, 'instance at the picked point: ' + JSON.stringify(ins.p));
      var def = DW.blockDef(s.doc, 'REV STAMP');
      assert(def.ents.some(function (e) { return e.t === 'line' && Math.abs(e.a[0]) < 1e-12 && Math.abs(e.a[1] + 0.75) < 1e-12; }), 'the bottom-left corner at (0, -.75) in the definition');
      var at = DW.blockAttributes(s.doc, 'REV STAMP');
      assert(JSON.stringify(at) === JSON.stringify([{ tag: 'REV', value: 'A', prompt: 'REV' }, { tag: 'DATE', value: '11/18/26', prompt: 'Date' }, { tag: 'BY', value: 'LM', prompt: 'BY' }]), 'attributes: ' + JSON.stringify(at));
      var sh = s.sheet(), t = rfPQTexts(sh, ins.id).sort().join(',');
      assert(t === '11/18/26,A,BY,DATE,LM,REV', 'drawn with the defaults: ' + t);
      var err = '';
      try { var a2 = {}; a2[s.val[0]] = 'R E V!'; DW.makeBlock(DW.newDrawing(s.r.model, {}), [], { attrs: a2 }); } catch (e) { err = e.message; }
      assert(/select the sketch entities/.test(err), err);
      var s2 = rfPQStamp(), bad = {}; bad[s2.val[0]] = 'REV!'; err = '';
      try { DW.makeBlock(s2.doc, s2.ids, { name: 'X', attrs: bad }); } catch (e) { err = e.message; }
      assert(/attribute tag/.test(err), 'bad tag: ' + err);
      var dup = {}; dup[s2.val[0]] = 'REV'; dup[s2.val[1]] = 'REV'; err = '';
      try { DW.makeBlock(s2.doc, s2.ids, { name: 'X', attrs: dup }); } catch (e) { err = e.message; }
      assert(/Two attributes/.test(err), 'duplicate tag: ' + err);
      var ln = {}; ln[s2.ids[0]] = 'LINE'; err = '';
      try { DW.makeBlock(s2.doc, s2.ids, { name: 'X', attrs: ln }); } catch (e) { err = e.message; }
      assert(/Only a text/.test(err), 'a line as an attribute: ' + err);
      return 'base (12, 1.75); ' + at.map(function (a) { return a.tag + '=' + a.value; }).join(' ');
    });
    test('rfPQ: two instances with their own REV / DATE / BY; one set back to its default; a default linked to the part\'s Revision shows D; Explode gives the values as plain text; an unknown tag is refused', function () {
      var s = rfPQStamp();
      var attrs = {}; attrs[s.val[0]] = 'REV'; attrs[s.val[1]] = 'DATE'; attrs[s.val[2]] = 'BY';
      var ins = DW.makeBlock(s.doc, s.ids, { name: 'REV STAMP', base: [12, 1.75], attrs: attrs });
      var b2 = DW.insertBlock(s.doc, 'REV STAMP', [12, 4], null, { attrs: { REV: 'B', date: '11/20/26', BY: 'JD' } });
      assert(JSON.stringify(b2.attrs) === JSON.stringify({ REV: 'B', DATE: '11/20/26', BY: 'JD' }), 'stored: ' + JSON.stringify(b2.attrs));
      var sh = s.sheet();
      assert(rfPQTexts(sh, b2.id).indexOf('JD') >= 0 && rfPQTexts(sh, b2.id).indexOf('B') >= 0 && rfPQTexts(sh, ins.id).indexOf('LM') >= 0, 'own values: ' + rfPQTexts(sh, b2.id).join(','));
      var tB = sh.prims.filter(function (p) { return p.blockIns === b2.id && p.text === 'B'; })[0];
      assert(tB && tB.blockAttr === 'REV' && Math.abs(tB.p[0] - 12.1) < 1e-12 && Math.abs(tB.p[1] - (4 - 0.63)) < 1e-12, 'REV value where the stamp puts it: ' + JSON.stringify(tB && tB.p));
      DW.setBlockAttributes(s.doc, b2.id, { REV: 'C', BY: null });
      var t2 = rfPQTexts(s.sheet(), b2.id);
      assert(t2.indexOf('C') >= 0 && t2.indexOf('LM') >= 0 && t2.indexOf('JD') < 0, 'REV C, BY back to LM: ' + t2.join(','));
      var err = '';
      try { DW.setBlockAttributes(s.doc, b2.id, { QTY: 1 }); } catch (e) { err = e.message; }
      assert(/no attribute QTY/.test(err), 'unknown tag: ' + err);
      try { DW.insertBlock(s.doc, 'REV STAMP', [1, 1], null, { attrs: { NOPE: 'x' } }); } catch (e) { err = e.message; }
      assert(/no attribute NOPE/.test(err), 'unknown tag on insert: ' + err);
      // a default linked to the part's Revision property
      s.doc.blocks['REV STAMP'].ents.forEach(function (e) { if (e.attr === 'REV') e.text = '$PRPSHEET:"Revision"'; });
      var t3 = rfPQTexts(s.sheet(), ins.id);
      assert(t3.indexOf('D') >= 0 && !t3.some(function (x) { return /\$PRP/.test(x); }), 'linked default shows D: ' + t3.join(','));
      assert(rfPQTexts(s.sheet(), b2.id).indexOf('C') >= 0, 'the typed value wins over the link');
      var ex = DW.explodeBlock(s.doc, b2.id), ents = ex.map(function (id) { return DW.sketchEntity(s.doc, id); });
      assert(ents.some(function (e) { return e.t === 'text' && e.text === 'C'; }) && !ents.some(function (e) { return e.attr != null; }), 'exploded: plain text C');
      return 'B / 11/20/26 / JD -> C / LM; linked D';
    });
    test('rfPQ: the sheet to DXF: the BLOCK holds the frame and captions only (8 entities); each INSERT\'s values are TEXT beside it (B, 11/20/26, JD; the linked D); R2000 and R12 audit clean; DWG written', function () {
      var s = rfPQStamp();
      var attrs = {}; attrs[s.val[0]] = 'REV'; attrs[s.val[1]] = 'DATE'; attrs[s.val[2]] = 'BY';
      DW.makeBlock(s.doc, s.ids, { name: 'REV STAMP', base: [12, 1.75], attrs: attrs });
      s.doc.blocks['REV STAMP'].ents.forEach(function (e) { if (e.attr === 'REV') e.text = '$PRPSHEET:"Revision"'; });
      DW.insertBlock(s.doc, 'REV STAMP', [12, 4], null, { attrs: { REV: 'B', DATE: '11/20/26', BY: 'JD' } });
      var sh = s.sheet(), out = [];
      ['R2000', 'R12'].forEach(function (ver) {
        var dxf = DW.toDXF(sh, { version: ver }), ents = rfPQEnts(dxf);
        var blk = ents.filter(function (e) { return e.sec === 'BLOCKS' && e.type === 'BLOCK' && e.g['2'] === 'REV_STAMP'; });
        assert(blk.length === 1, ver + ' one BLOCK');
        var i0 = ents.indexOf(blk[0]), n = 0, inBlk = [];
        for (var i = i0 + 1; i < ents.length && ents[i].type !== 'ENDBLK'; i++) if (ents[i].type === 'LINE' || ents[i].type === 'TEXT') { n++; if (ents[i].type === 'TEXT') inBlk.push(ents[i].g['1']); }
        assert(n === 8 && inBlk.sort().join(',') === 'BY,DATE,REV', ver + ' block entities: ' + n + ' ' + inBlk.join(','));
        var insE = ents.filter(function (e) { return e.sec === 'ENTITIES' && e.type === 'INSERT'; });
        assert(insE.length === 2, ver + ' INSERTs ' + insE.length);
        var vals = ents.filter(function (e) { return e.sec === 'ENTITIES' && e.type === 'TEXT'; }).map(function (e) { return e.g['1']; });
        ['D', '11/18/26', 'LM', 'B', '11/20/26', 'JD'].forEach(function (v) { assert(vals.indexOf(v) >= 0, ver + ' value ' + v + ' as TEXT: ' + vals.join('|')); });
        assert(!vals.some(function (v) { return /\$PRP/.test(v); }), ver + ' no raw link');
        assert(vals.indexOf('BY') < 0, ver + ' no loose caption (they are in the BLOCK; the title block has its own REV / DATE)');
        if (typeof DxfCheck !== 'undefined') { var au = DxfCheck.audit(dxf, { units: 'in' }); assert(!au.errors.length, ver + ' audit: ' + au.errors.slice(0, 3).join(' | ')); }
        out.push(ver + ' ok');
      });
      if (typeof DWG !== 'undefined') { var bytes = DWG.fromDXF(DW.toDXF(sh, { version: 'R2000' })); assert(bytes && bytes.length > 1000, 'DWG'); out.push('DWG ' + bytes.length + ' bytes'); }
      return out.join(', ');
    });
  })();

  // --- rfPQ 4: Hole Table tags on a big flat ---
  (function () {
    group('rfPQ: Hole Table tags on a 48 x 24 flat: a letter per size, smallest first (A, B, C), numbered within a size by X LOC then Y LOC (A1, A2 …), whatever order the holes were made in');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, T = 0.0598;
    test('rfPQ: seven holes of three sizes made out of order: Ø.250 A1; Ø.281 B1-B4 by X then Y (two at the same X: the lower first); Ø.500 C1-C2; X / Y LOC from the blank corner', function () {
      var H = [[40, 20, 0.281], [30, 3, 0.5], [6, 20, 0.281], [44, 6, 0.25], [6, 3, 0.281], [12, 18, 0.5], [24, 12, 0.281]];
      var code = 'p.name("PQ flat").units("in");\np.sheet(' + T + ', 0.06, 0.44);\np.sketch("Top").rect(0, -24, 48, 24).end().baseFlange();\n' +
        H.map(function (h) { return 'p.hole("Top", ' + h[0] + ', ' + (-h[1]) + ', ' + h[2] + ', { offset: ' + T + ' });'; }).join('\n');
      var r = build(code);
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-18' });
      var v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build, scale: '1:8' });
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), w = sh.views.filter(function (x) { return x.view.id === v.id; })[0];
      assert(w && w.flat, 'flat view');
      var b = w.proj.bounds;
      DW.addHoleTable(doc, v.id, { origin: { p: [b.umin, b.vmin] }, all: true });
      var rows = DW.compute(doc, r.mesh, r.model, { build: r.build }).holeTables[0].rows;
      assert(rows.length === 7, 'seven holes: ' + rows.length);
      var tags = rows.map(function (x) { return x.tag; }).join(',');
      assert(tags === 'A1,B1,B2,B3,B4,C1,C2', 'tags in order: ' + tags);
      var sizes = rows.map(function (x) { return x.size; });
      assert(/^Ø\.250/.test(sizes[0]) && /^Ø\.281/.test(sizes[1]) && /^Ø\.500/.test(sizes[5]), 'smallest size first: ' + sizes.join(' / '));
      for (var i = 1; i < rows.length; i++) if (rows[i].tag[0] === rows[i - 1].tag[0]) assert(rows[i].x > rows[i - 1].x + 1e-6 || (Math.abs(rows[i].x - rows[i - 1].x) < 1e-6 && rows[i].y > rows[i - 1].y), rows[i - 1].tag + ' / ' + rows[i].tag + ' not by X then Y');
      assert(Math.abs(rows[1].x - rows[2].x) < 1e-6 && rows[1].y < rows[2].y, 'B1 / B2 at one X: the lower first');
      rows.forEach(function (x) { assert(x.x >= 0 && x.y >= 0 && x.x <= 48 + 1e-6 && x.y <= 24 + 1e-6, x.tag + ' LOC ' + x.xText + ', ' + x.yText); });
      return rows.map(function (x) { return x.tag + ' ' + x.xText + ',' + x.yText; }).join(' | ');
    });
  })();

  // --- rfPQ 3: BOM cells typed on the drawing ---
  (function () {
    group('rfPQ: drawing BOM cells: DESCRIPTION written back to the part (embedded copies, a Design Library part in the assembly, a part drawing), other cells kept on the drawing; balloons keep their rows');
    if (typeof Drawing === 'undefined' || typeof Assembly === 'undefined' || typeof Materials === 'undefined') return;
    var DW = Drawing, AS = Assembly;
    function rfPQPart(name, props) {
      var m = K.newModel(); K.runScript(m, 'p.name(' + JSON.stringify(name) + '); p.box(10, 10, 2);');
      if (props) m.properties = { custom: props };
      return JSON.parse(JSON.stringify(m));
    }
    function rfPQBom() {
      var m = AS.newAssembly('Bom');
      var br = rfPQPart('Bracket', [{ name: 'Description', type: 'Text', value: 'Bracket, 10 ga' }]);
      AS.insert(m, { model: br }, { fixed: true });
      AS.insert(m, { model: br }, { position: [20, 0, 0] });
      AS.insert(m, { example: 'Hex nut' }, { position: [40, 0, 0] });
      var b = AS.rebuild(m), mesh = K.meshFromBody(b.body);
      var doc = DW.newDrawing(m, { date: '2026-11-18' });
      DW.standard3View(doc, mesh, 'mm');
      doc.bom = { show: true };
      DW.autoBalloon(doc, m, doc.views[0].id);
      return { m: m, b: b, mesh: mesh, doc: doc, sheet: function () { return DW.compute(doc, mesh, m, { build: b }); } };
    }
    function rfPQCol(sh, title) { return sh.bom.columns.map(function (c) { return c.title; }).indexOf(title); }
    test('rfPQ: BOM cell under a paper point: header row 0, rows 1-2, the DESCRIPTION column; outside none', function () {
      var a = rfPQBom(), sh = a.sheet(), bb = sh.bom.box, dc = rfPQCol(sh, 'DESCRIPTION');
      assert(sh.bom.rows.length === 2 && dc >= 0, 'two rows, a DESCRIPTION column');
      var mid = function (c, r) { return [(bb.cols[c] + bb.cols[c + 1]) / 2, bb.y1 - (r + 0.5) * bb.rowH]; };
      var c1 = DW.bomCellAt(a.doc, 'mm', mid(dc, 1)), c0 = DW.bomCellAt(a.doc, 'mm', mid(0, 0));
      assert(c1 && c1.r === 1 && c1.c === dc && c1.id === 'description', 'row 1 description: ' + JSON.stringify(c1));
      assert(c0 && c0.r === 0 && c0.id === 'item', 'header: ' + JSON.stringify(c0));
      assert(!DW.bomCellAt(a.doc, 'mm', [bb.x0 - 1, bb.y1 - 1]), 'outside');
      near(c1.rect.y1 - c1.rect.y0, bb.rowH, 1e-9, 'cell height');
      return 'ok';
    });
    test('rfPQ: DESCRIPTION typed for the embedded Bracket goes into both copies\' Description (assembly BOM sees it); the Hex nut\'s is kept in the assembly (Assembly.bomOverride); balloons still find their rows; empty clears', function () {
      var a = rfPQBom(), sh0 = a.sheet(), n0 = sh0.balloons.length, k0 = sh0.bom.rows[0].key;
      assert(n0 === 2, 'two balloons: ' + n0);
      var r = DW.setBomCell(a.doc, a.m, 1, 'description', 'BRACKET, 10 GA CRS', { mesh: a.mesh, build: a.b });
      assert(r.where === 'part', 'where: ' + JSON.stringify(r));
      a.m.components.slice(0, 2).forEach(function (c, i) { assert(Materials.sheetProperty(c.source.model, 'Description') === 'BRACKET, 10 GA CRS', 'copy ' + i); });
      assert(AS.bom(a.m, null, { type: 'top' })[0].description === 'BRACKET, 10 GA CRS', 'the assembly BOM shows it');
      var sh = a.sheet(), dc = rfPQCol(sh, 'DESCRIPTION');
      assert(sh.bom.cells[0][dc] === 'BRACKET, 10 GA CRS', 'the drawing BOM: ' + sh.bom.cells[0][dc]);
      assert(sh.bom.rows[0].key !== k0 && sh.balloons.length === 2 && sh.balloons.some(function (b) { return String(b.item) === '1'; }), 'balloons follow the new key: ' + sh.balloons.map(function (b) { return b.item; }).join(','));
      var r2 = DW.setBomCell(a.doc, a.m, 2, 'description', 'HEX NUT 1/4-20', { mesh: a.mesh, build: a.b });
      assert(r2.where === 'assembly' && AS.bomOverride(a.m, sh.bom.rows[1].key) === 'HEX NUT 1/4-20', 'Design Library part: ' + JSON.stringify(r2));
      assert(a.sheet().bom.cells[1][dc] === 'HEX NUT 1/4-20', 'shown');
      DW.setBomCell(a.doc, a.m, 2, 'description', '', { mesh: a.mesh, build: a.b });
      assert(!a.m.bomDescriptions && a.sheet().bom.cells[1][dc] !== 'HEX NUT 1/4-20', 'cleared');
      assert(!a.doc.bom.overrides, 'nothing kept on the drawing');
      return 'part x2, assembly, cleared';
    });
    test('rfPQ: ITEM NO., PART NUMBER, QTY. and a property column typed on the drawing are kept there (bom.overrides): the table, the balloons\' numbers and the DXF show them; the part is untouched; empty goes back to the linked value', function () {
      var a = rfPQBom();
      a.doc.bom.columns = ['item', 'partNumber', 'description', 'qty', { type: 'property', prop: 'Vendor' }].map(function (c) { return typeof c === 'string' ? { type: c } : c; });
      DW.setBomCell(a.doc, a.m, 1, 'item', '10');
      DW.setBomCell(a.doc, a.m, 1, 'partNumber', 'BR-1001');
      DW.setBomCell(a.doc, a.m, 2, 'qty', '8');
      DW.setBomCell(a.doc, a.m, 2, 'prop:Vendor', 'FASTENAL');
      var sh = a.sheet(), C = function (t) { return rfPQCol(sh, t); };
      assert(String(sh.bom.cells[0][C('ITEM NO.')]) === '10' && sh.bom.cells[0][C('PART NUMBER')] === 'BR-1001' && String(sh.bom.cells[1][C('QTY.')]) === '8' && sh.bom.cells[1][C('VENDOR')] === 'FASTENAL', 'cells: ' + JSON.stringify(sh.bom.cells));
      assert(sh.balloons.some(function (b) { return String(b.item) === '10'; }), 'balloon 10: ' + sh.balloons.map(function (b) { return b.item; }).join(','));
      assert(Materials.sheetProperty(a.m.components[0].source.model, 'Part Number') !== 'BR-1001', 'the part is untouched');
      assert(/\nBR-1001\r?\n/.test(DW.toDXF(sh)) && /\nFASTENAL\r?\n/.test(DW.toDXF(sh)), 'DXF');
      var t = '';
      try { DW.setBomCell(a.doc, a.m, 9, 'item', '1'); } catch (e) { t = e.message; }
      assert(/No BOM row/.test(t), t);
      try { DW.setBomCell(a.doc, a.m, 1, 'weight', '1'); } catch (e) { t = e.message; }
      assert(/No BOM column/.test(t), t);
      DW.setBomCell(a.doc, a.m, 1, 'item', ''); DW.setBomCell(a.doc, a.m, 1, 'partNumber', ''); DW.setBomCell(a.doc, a.m, 2, 'qty', ''); DW.setBomCell(a.doc, a.m, 2, 'prop:Vendor', '');
      var sh2 = a.sheet();
      assert(String(sh2.bom.cells[0][C('ITEM NO.')]) === '1' && String(sh2.bom.cells[1][C('QTY.')]) === '1' && !a.doc.bom.overrides, 'back: ' + JSON.stringify(sh2.bom.cells));
      return JSON.stringify(sh.bom.cells);
    });
    test('rfPQ: a part drawing\'s BOM: DESCRIPTION typed goes into the part\'s Description property (the title block TITLE follows it)', function () {
      var r = build('p.name("Plate"); p.box(40, 20, 3);'), doc = DW.newDrawing(r.model, { date: '2026-11-18' });
      DW.standard3View(doc, r.mesh, 'mm');
      doc.bom = { show: true };
      var out = DW.setBomCell(doc, r.model, 1, 'description', 'PLATE 3 MM A36', { mesh: r.mesh });
      assert(out.where === 'part' && Materials.sheetProperty(r.model, 'Description') === 'PLATE 3 MM A36', JSON.stringify(out));
      var sh = DW.compute(doc, r.mesh, r.model), dc = rfPQCol(sh, 'DESCRIPTION');
      assert(sh.bom.cells[0][dc] === 'PLATE 3 MM A36', 'BOM: ' + sh.bom.cells[0][dc]);
      assert(DW.titleBlock(doc, r.model).title === 'PLATE 3 MM A36', 'TITLE: ' + DW.titleBlock(doc, r.model).title);
      return 'ok';
    });
  })();
