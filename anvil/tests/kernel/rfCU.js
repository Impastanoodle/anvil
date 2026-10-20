  // --- rfCU (2026-10-20, lane CU: drawing annotations) --- stand-alone Cosmetic Thread (a 3/4 circle at the major
  // diameter, '#10-32 UNF - 2B' callout), Dowel Pin Symbol, Datum Target (point / area), Multi-jog Leader and note
  // borders / numbered lists: engine, follow-the-model, SVG / DXF / PDF.
  (function () {
    group('rfCU: cosmetic thread, dowel pin, datum target, multi-jog leader, note borders and lists');
    var CU = typeof Drawing !== 'undefined' ? Drawing : null;
    // an inch plate 4 x 2 x .25 with a #21 (.159, #10-32 tap drill) hole and a .250 dowel hole, both through
    var CU_PLATE = 'p.name("CUPlate").units("in");\np.box(4, 2, 0.25);\np.hole("Top", 1, -1, 0.159, { offset: 0.25 });\np.hole("Top", 3, -1, 0.25, { offset: 0.25 });';
    function cuDoc(code) {
      var r = build(code || CU_PLATE);
      noErrors(r);
      var doc = CU.newDrawing(r.model, { date: '2026-10-20', scale: [1, 1] });
      CU.standard3View(doc, r.mesh, 'in');
      r.doc = doc;
      r.sheet = function () { return CU.compute(doc, r.mesh, r.model); };
      r.top = doc.views.filter(function (v) { return v.role === 'top'; })[0];
      return r;
    }
    // the top view's circle of diameter dia (view model units)
    function cuCircle(r, dia) {
      var sh = r.sheet(), w = sh.views.filter(function (x) { return x.view.id === r.top.id; })[0];
      var c = w.proj.circles.visible.filter(function (q) { return Math.abs(2 * q.r - dia) < 1e-6; })[0];
      assert(c, 'circle Ø' + dia + ' in the top view');
      return { c: c.c.slice(), r: c.r, w: w };
    }
    function cuAnn(sh, id) { return sh.annotations.filter(function (a) { return a.id === id; })[0]; }

    test('rfCU: Cosmetic Thread on a #21 hole picks #10-32 UNF, draws a thin 3/4 circle at Ø.190 and the callout "#10-32 UNF - 2B THRU"; blind .375 reads "↧ .375"; it follows the hole when the part changes; SVG / DXF / PDF carry it', function () {
      var r = cuDoc(), h = cuCircle(r, 0.159);
      var an = CU.addCosmeticThread(r.doc, r.top.id, { c: h.c, r: h.r });
      assert(an.size === '#10-32 UNF' || an.size === '#10-24 UNC', 'size from the tap drill: ' + an.size);
      CU.editAnnotation(r.doc, an.id, { size: '#10-32 UNF' });
      var sh = r.sheet(), a = cuAnn(sh, an.id);
      assert(a && a.type === 'cosmeticThread' && !a.dangling, 'on the sheet');
      assert(a.info.callout === '#10-32 UNF - 2B THRU', 'callout ' + a.info.callout);
      var arc = sh.prims.filter(function (p) { return p.k === 'arc' && p.thread === '#10-32 UNF' && p.layer === 'ANNOTATIONS'; })[0];
      assert(arc && arc.style === 'thin', 'thin arc');
      nearRel(arc.r, 0.095, 1e-9, 'major radius .095 at 1:1');
      var span = ((arc.a1 - arc.a0) % 360 + 360) % 360;
      near(span, 270, 1e-9, '3/4 circle');
      assert(sh.prims.some(function (p) { return p.k === 'text' && p.text === '#10-32 UNF - 2B THRU'; }), 'callout text');
      CU.editAnnotation(r.doc, an.id, { end: 'blind', depth: 0.375 });
      sh = r.sheet();
      assert(cuAnn(sh, an.id).info.callout === '#10-32 UNF - 2B ↧ .375', 'blind ' + cuAnn(sh, an.id).info.callout);
      var bad = false; try { CU.editAnnotation(r.doc, an.id, { end: 'blind', depth: 0 }); } catch (e) { bad = /depth/.test(e.message); }
      assert(bad, 'blind needs a depth');
      bad = false; try { CU.editAnnotation(r.doc, an.id, { size: '#11-99 UNX' }); } catch (e) { bad = /thread/.test(e.message); }
      assert(bad, 'unknown size refused');
      var svg = CU.toSVG(sh), dxf = CU.toDXF(sh), pdf = CU.toPDF(sh);
      assert(svg.indexOf('#10-32 UNF - 2B') > 0 && dxf.indexOf('#10-32 UNF - 2B') > 0 && pdf.indexOf('#10-32 UNF - 2B') > 0, 'callout in SVG / DXF / PDF');
      assert(/\nARC\r?\n/.test(dxf), 'DXF ARC entity');
      // follows the model: the hole moves 0.5 to the right
      var r2 = build(CU_PLATE.replace('p.hole("Top", 1, -1, 0.159', 'p.hole("Top", 1.5, -1, 0.159'));
      noErrors(r2);
      var sh2 = CU.compute(r.doc, r2.mesh, r2.model), a2 = cuAnn(sh2, an.id), w2 = sh2.views.filter(function (x) { return x.view.id === r.top.id; })[0];
      assert(!a2.dangling, 'still attached');
      var arc2 = sh2.prims.filter(function (p) { return p.k === 'arc' && p.thread; })[0];
      near(arc2.c[0] - arc.c[0], 0.5 * w2.scale, 1e-6, 'moved with the hole');
      return a.info.callout + ' / ' + cuAnn(sh, an.id).info.callout;
    });

    test('rfCU: Dowel Pin Symbol on the Ø.250 hole: the circle, a cross and two filled quadrants on ANNOTATIONS; Delete removes it; a gone hole leaves it dangling', function () {
      var r = cuDoc(), h = cuCircle(r, 0.25);
      var an = CU.addDowelPin(r.doc, r.top.id, { c: h.c, r: h.r }), sh = r.sheet(), a = cuAnn(sh, an.id);
      assert(a && /Dowel Pin Ø\.250/.test(a.text), 'text ' + (a && a.text));
      var ps = sh.prims.filter(function (p) { return p.layer === 'ANNOTATIONS' && p.view === r.top.id; });
      assert(ps.filter(function (p) { return p.k === 'fill'; }).length === 2 && ps.some(function (p) { return p.k === 'circle' && Math.abs(p.r - 0.125) < 1e-9; }), 'two quadrants and the circle');
      var r2 = build(CU_PLATE.replace('\np.hole("Top", 3, -1, 0.25, { offset: 0.25 });', ''));
      var a2 = cuAnn(CU.compute(r.doc, r2.mesh, r2.model), an.id);
      assert(a2.dangling, 'dangling without the hole');
      assert(CU.deleteAnnotation(r.doc, an.id) && !cuAnn(r.sheet(), an.id), 'deleted');
      return a.text;
    });

    test('rfCU: Datum Target A1 (point: an X, no size) and A2 (Ø.500 area, phantom circle at the view scale, a dot); the number counts up per datum; round trip through JSON; SVG / DXF carry A1 and Ø.500', function () {
      var r = cuDoc();
      var t1 = CU.addSymbol(r.doc, { type: 'datumTarget', datum: 'A', p: [3, 6], leader: [4, 5] });
      var t2 = CU.addSymbol(r.doc, { type: 'datumTarget', datum: 'A', area: 'circle', aw: 0.5, p: [6, 6], leader: [7, 5] });
      assert(t1.num === 1 && t2.num === 2, 'numbers ' + t1.num + ' ' + t2.num);
      var bad = false; try { CU.addSymbol(r.doc, { type: 'datumTarget', area: 'rect', aw: 1, p: [1, 1], leader: [2, 2] }); } catch (e) { bad = true; }
      assert(bad, 'a rectangle needs its height');
      var sh = r.sheet(), sy = sh.symbols.filter(function (s) { return s.type === 'datumTarget'; });
      assert(sy.length === 2 && sy[0].text === 'DATUM TARGET A1' && sy[1].text === 'DATUM TARGET A2 Ø.500', 'texts ' + sy.map(function (s) { return s.text; }).join(' | '));
      var ph = sh.prims.filter(function (p) { return p.symbol === t2.id && p.k === 'circle' && p.style === 'chain'; })[0];
      assert(ph, 'phantom area circle');
      nearRel(ph.r, 0.25 * r.doc.sheet.scale[0] / r.doc.sheet.scale[1], 1e-9, 'area at the sheet scale');
      assert(sh.prims.filter(function (p) { return p.symbol === t1.id && p.k === 'line' && p.style === 'thick'; }).length === 2, 'the X');
      var doc2 = JSON.parse(JSON.stringify(r.doc)), sh2 = CU.compute(doc2, r.mesh, r.model);
      assert(sh2.symbols.filter(function (s) { return s.type === 'datumTarget'; }).length === 2, 'reloaded');
      var svg = CU.toSVG(sh), dxf = CU.toDXF(sh);
      assert(svg.indexOf('>A1<') > 0 && dxf.indexOf('Ø.500') + dxf.indexOf('%%c.500') > -2, 'SVG / DXF texts');
      return sy.map(function (s) { return s.text; }).join(' / ');
    });

    test('rfCU: Multi-jog Leader: start, two jogs, tip with an arrow / dot; attached to a note it starts at the note\'s side and follows the note; a jog moves on its own, a move of the leader carries all its points', function () {
      var r = cuDoc();
      var nt = CU.addNote(r.doc, { p: [2, 9], text: 'BREAK ALL EDGES' });
      var ld = CU.addSymbol(r.doc, { type: 'leader', p: [5, 9], jogs: [[6, 8], [6, 7]], leader: [7, 6], note: nt.id });
      var sh = r.sheet(), s = sh.symbols.filter(function (x) { return x.id === ld.id; })[0], nb = sh.notes[0].box;
      assert(s.pts && s.pts.length === 4, 'four points ' + JSON.stringify(s.pts));
      assert(s.pts[0][0] > nb.x1 && s.pts[0][0] < nb.x1 + 0.1 && s.pts[0][1] > nb.y0 && s.pts[0][1] < nb.y1, 'starts at the note\'s right side ' + JSON.stringify(s.pts[0]) + ' ' + JSON.stringify(nb));
      assert(sh.prims.filter(function (p) { return p.symbol === ld.id && p.k === 'line'; }).length === 3 && sh.prims.some(function (p) { return p.symbol === ld.id && p.k === 'fill'; }), 'three segments and the arrow');
      CU.editNote(r.doc, nt.id, { p: [1, 9] });
      var s2 = r.sheet().symbols.filter(function (x) { return x.id === ld.id; })[0];
      near(s2.pts[0][0] - s.pts[0][0], -1, 1e-6, 'follows the note');
      CU.editSymbol(r.doc, ld.id, { jog: 1, at: [6.5, 7] });
      assert(CU.findSymbol(r.doc, ld.id).jogs[1][0] === 6.5, 'jog moved');
      CU.editSymbol(r.doc, ld.id, { p: [5.5, 9] });
      var L = CU.findSymbol(r.doc, ld.id);
      assert(L.jogs[0][0] === 6.5 && L.leader[0] === 7.5, 'moved as a whole ' + JSON.stringify(L));
      CU.editSymbol(r.doc, ld.id, { end: 'dot' });
      assert(/LEADER \(3 segments/.test(CU.symbolText(L)), CU.symbolText(L));
      return CU.symbolText(L);
    });

    test('rfCU: note borders (circle, triangle, square, hexagon, flag triangle) and numbered / bulleted lists: 1. 2. markers on a hanging indent, the border round the text, SVG / DXF carry them', function () {
      var r = cuDoc();
      var nt = CU.addNote(r.doc, { p: [2, 9], text: 'DEBURR\nBREAK EDGES .010', list: 'number' });
      var sh = r.sheet(), tx = sh.prims.filter(function (p) { return p.note === nt.id && p.k === 'text'; });
      assert(tx.map(function (p) { return p.text; }).join('|') === '1.|DEBURR|2.|BREAK EDGES .010', 'numbered ' + tx.map(function (p) { return p.text; }).join('|'));
      assert(tx[1].p[0] > tx[0].p[0] && Math.abs(tx[1].p[0] - tx[3].p[0]) < 1e-9, 'hanging indent');
      CU.editNote(r.doc, nt.id, { list: 'bullet' });
      assert(r.sheet().prims.filter(function (p) { return p.note === nt.id && p.text === '•'; }).length === 2, 'bullets');
      var counts = {};
      ['circle', 'triangle', 'square', 'hexagon', 'flag'].forEach(function (b) {
        CU.editNote(r.doc, nt.id, { border: b, list: 'none' });
        var s2 = r.sheet(), ps = s2.prims.filter(function (p) { return p.note === nt.id && p.k !== 'text'; }), nb = s2.notes[0].box;
        counts[b] = ps.length;
        var tb = s2.prims.filter(function (p) { return p.note === nt.id && p.k === 'text'; });
        assert(tb.every(function (t) { return t.p[0] >= nb.x0 && t.p[1] >= nb.y0; }), b + ': text inside the box');
      });
      assert(counts.circle === 1 && counts.triangle === 3 && counts.square === 4 && counts.hexagon === 6 && counts.flag === 3, 'border lines ' + JSON.stringify(counts));
      var bad = false; try { CU.editNote(r.doc, nt.id, { border: 'star' }); } catch (e) { bad = true; }
      assert(bad, 'unknown border refused');
      CU.editNote(r.doc, nt.id, { border: 'none' });
      assert(!('border' in CU.findNote(r.doc, nt.id)), 'border removed');
      return JSON.stringify(counts);
    });

    // shop-use pass (head, 2026-10-20): a Ø.250 hole with "From the hole" read as 1/4-20 2A (its major diameter), an
    // edit back to "From the hole" did nothing, and a thread without its callout had no box (could not be clicked)
    test('rfCU: shop pass — From the hole on a Ø.250 hole is a tapped hole (5/16-18 UNC - 2B, by tap drill), never 2A; an external thread (a shaft) picks by major diameter and draws the minor; size "auto" in an edit recomputes; a thread without its callout keeps a box round its arc', function () {
      var r = cuDoc(), h = cuCircle(r, 0.25);
      var an = CU.addCosmeticThread(r.doc, r.top.id, { c: h.c, r: h.r, size: 'auto' });
      var sh = r.sheet(), a = cuAnn(sh, an.id);
      assert(an.size === '5/16-18 UNC' && a.info.callout === '5/16-18 UNC - 2B THRU' && !a.info.external, 'hole: ' + a.info.callout);
      CU.editAnnotation(r.doc, an.id, { external: true, size: 'auto' });
      sh = r.sheet(); a = cuAnn(sh, an.id);
      assert(a.info.callout === '1/4-20 UNC - 2A THRU' && a.info.external, 'shaft: ' + a.info.callout);
      var arc = sh.prims.filter(function (p) { return p.k === 'arc' && p.thread; })[0];
      nearRel(arc.r, (0.25 - 1.299 / 20) / 2, 1e-9, 'minor diameter');
      CU.editAnnotation(r.doc, an.id, { size: '#10-32 UNF' });
      assert(CU.findAnnotation(r.doc, an.id).annotation.size === '#10-32 UNF', 'chosen size');
      CU.editAnnotation(r.doc, an.id, { size: 'auto' });
      assert(CU.findAnnotation(r.doc, an.id).annotation.size === '1/4-20 UNC', 'auto again: ' + CU.findAnnotation(r.doc, an.id).annotation.size);
      CU.editAnnotation(r.doc, an.id, { callout: false });
      a = cuAnn(r.sheet(), an.id);
      assert(!a.info.callout && isFinite(a.box.x0) && a.box.x1 - a.box.x0 > 0.1, 'a box round the arc ' + JSON.stringify(a.box));
      return '5/16-18 UNC - 2B / 1/4-20 UNC - 2A';
    });
  })();
