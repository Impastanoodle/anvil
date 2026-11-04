  // --- rfHX (2026-11-04, lane drawing): bend notes that keep their bend (every flat bend carries its flange's id), the
  // Cross-Break note in the drawing's flat view, Empty View and View ▸ Hide/Show Annotations, on the engine ---
  (function () {
    group('rfHX: bend ids for dragged bend notes, Cross-Break note in the flat view, Empty View, Hide/Show Annotations');
    var HX = typeof Drawing !== 'undefined' ? Drawing : null;
    var T = 0.0598;
    var BASE = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    function rfHXFlange(pt) { return 'p.flange(1, [' + JSON.stringify(pt) + '], { position: "inside" });\n'; }
    function rfHXFlat(r) { return K.flatPattern(r.model, r.build, r.mesh); }
    function rfHXSheet(r, doc) { return HX.compute(doc, r.mesh, r.model, { build: r.build }); }
    function rfHXFlatDoc(r) {
      var doc = HX.newDrawing(r.model, { date: '2026-11-04' });
      var v = HX.addFlatView(doc, r.mesh, { model: r.model, build: r.build, x: 8, y: 5 });
      return { doc: doc, v: v };
    }
    function rfHXItems(sh, type) { return sh.annotations.filter(function (a) { return a.flat && a.type === type; }); }
    function rfHXRebuild(r) {
      var b = K.rebuild(r.model);
      assert(!Object.keys(b.errors).length, 'errors ' + JSON.stringify(b.errors));
      return { model: r.model, build: b, mesh: K.meshFromBody(b.body) };
    }

    test('rfHX: every flat-pattern bend carries "<feature id>:<n>" — edge flanges, a flange on a wall, a Sketched Bend, a Jog', function () {
      var r = build(BASE + 'p.flange(1, [[4, ' + T + ', 1], [0, ' + T + ', 1]], { position: "inside" });\n');
      noErrors(r);
      var fl = r.model.features.filter(function (f) { return f.type === 'flange'; })[0], ids = rfHXFlat(r).bends.map(function (b) { return b.id; }).sort();
      assert(JSON.stringify(ids) === JSON.stringify([fl.id + ':0', fl.id + ':1']), 'ids ' + JSON.stringify(ids));
      // a flange on the first flange's wall (its edge leaves the base plane: the drawing's own matching found no id)
      var r2 = build(BASE + rfHXFlange([4, T, 1]) + 'p.flange(0.75, [[4, ' + (1 + 2 * T) + ', 1]], { position: "inside" });\n');
      noErrors(r2);
      var f2 = r2.model.features.filter(function (f) { return f.type === 'flange'; }), b2 = rfHXFlat(r2).bends.map(function (b) { return b.id; }).sort();
      assert(JSON.stringify(b2) === JSON.stringify([f2[0].id + ':0', f2[1].id + ':0']), 'wall ' + JSON.stringify(b2));
      var r3 = build(BASE + 'p.sketch("Top", ' + T + ').line(2, 2, 2, -2).sketchedBend(90, { fixed: [1, 0, 0] });\n');
      noErrors(r3);
      var sb = r3.model.features.filter(function (f) { return f.type === 'sketchedBend'; })[0], b3 = rfHXFlat(r3).bends;
      assert(b3.length === 1 && /^\d+:\d+$/.test(b3[0].id) && b3[0].id.split(':')[0] === String(sb.id), 'sketched bend ' + JSON.stringify(b3.map(function (b) { return b.id; })));
      var r4 = build(BASE + 'p.sketch("Top", ' + T + ').line(2, 2, 2, -2).end().jog(0.5, { fixed: [1, 0, 0] });\n');
      if (!Object.keys(r4.build.errors).length) {
        var jg = r4.model.features.filter(function (f) { return f.type === 'jog'; })[0], b4 = rfHXFlat(r4).bends.map(function (b) { return b.id; });
        assert(b4.length === 2 && b4[0] !== b4[1] && b4.every(function (x) { return x && x.split(':')[0] === String(jg.id); }), 'jog ' + JSON.stringify(b4));
      }
      return ids.join(', ') + ' · wall ' + b2.join(', ') + ' · sketched ' + b3[0].id;
    });

    test('rfHX: a dragged bend note stays with its bend after an edge flange is added earlier in the tree, and through save / reload', function () {
      var r = build(BASE + rfHXFlange([4, T, 1]) + rfHXFlange([0, T, 1]));
      noErrors(r);
      var fls = r.model.features.filter(function (f) { return f.type === 'flange'; }), second = fls[1];
      var d = rfHXFlatDoc(r), sh = rfHXSheet(r, d.doc), notes = rfHXItems(sh, 'bendNote');
      assert(notes.length === 2, 'notes ' + notes.length);
      var mine = notes.filter(function (a) { return a.key === 'bend:' + second.id + ':0'; })[0];
      assert(mine, 'keys ' + notes.map(function (a) { return a.key; }));
      var a0 = mine.info.a, b0 = mine.info.b, box0 = mine.box;
      HX.flatAnnotation(d.doc, d.v.id, 'b' + mine.info.bend, { off: [0.6, 0.3] });   // the UI drags by the shown index
      assert(d.v.flatAnn[mine.key] && d.v.flatAnn[mine.key].off[0] === 0.6, 'stored ' + JSON.stringify(d.v.flatAnn));
      // a new edge flange on a third edge, moved before both flanges in the tree: the bends' order changes
      K.runScript(r.model, rfHXFlange([2, T, 0]));
      var nf = r.model.features.pop(), at = r.model.features.indexOf(fls[0]);
      r.model.features.splice(at, 0, nf);
      var r2 = rfHXRebuild(r);
      var doc2 = JSON.parse(JSON.stringify(d.doc));   // save / reload
      var sh2 = rfHXSheet(r2, doc2), notes2 = rfHXItems(sh2, 'bendNote'), fd = HX.flatData(r2.mesh, r2.model, r2.build);
      assert(notes2.length === 3, 'notes after ' + notes2.length);
      var bi = fd.bends.map(function (b) { return b.id; }).indexOf(second.id + ':0'), moved = notes2.filter(function (a) { return a.key === mine.key; })[0];
      assert(bi >= 0 && moved && moved.info.bend === bi, 'bend ' + bi + ' note ' + (moved && moved.info.bend));
      assert(Math.abs(moved.off[0] - 0.6) < 1e-12 && Math.abs(moved.off[1] - 0.3) < 1e-12, 'offset ' + moved.off);
      // it points at the same bend line (the flat grew and the new flange's relief shortened it: compare its direction)
      // and reads its note
      var L0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), L1 = Math.hypot(moved.info.b[0] - moved.info.a[0], moved.info.b[1] - moved.info.a[1]);
      var cr = ((b0[0] - a0[0]) * (moved.info.b[1] - moved.info.a[1]) - (b0[1] - a0[1]) * (moved.info.b[0] - moved.info.a[0])) / (L0 * L1);
      assert(Math.abs(cr) < 1e-9 && L1 > 0.5 * L0, 'direction ' + cr + ' length ' + L0 + ' ' + L1);
      assert(moved.text === HX.bendNoteText(fd.bends[bi], 'in'), moved.text);
      // the other notes did not take the offset
      notes2.forEach(function (a) { if (a !== moved) assert(!a.off[0] && !a.off[1], a.key + ' ' + a.off); });
      return mine.key + ' → bend ' + mine.info.bend + ' then ' + bi + '; box moved ' + (moved.box.x0 - box0.x0).toFixed(3);
    });

    test('rfHX: Cross-Break note at the crossing in the flat view — shop text, clear of its lines, in SVG and DXF, draggable, hidden with the notes', function () {
      var r = build(BASE + rfHXFlange([4, T, 1]) + 'p.crossBreak([1, ' + T + ', 0.5]);\n');
      noErrors(r);
      var xb = r.model.features.filter(function (f) { return f.type === 'crossBreak'; })[0];
      var d = rfHXFlatDoc(r), sh = rfHXSheet(r, d.doc), cb = rfHXItems(sh, 'crossBreakNote');
      assert(cb.length === 1 && cb[0].key === 'cb:' + xb.id, 'items ' + JSON.stringify(cb.map(function (a) { return a.key; })));
      var want = HX.bendNoteText({ up: cb[0].info.up, angle: 1, R: T }, 'in');
      assert(cb[0].text === want && /^(UP|DOWN) 1° R ?\.060$/.test(cb[0].text), cb[0].text + ' / ' + want);
      // the etch lines of the X on paper: the note is beside the crossing, touching none of them
      var segs = sh.prims.filter(function (p) { return p.k === 'line' && p.layer === 'ETCH'; }), b = cb[0].box, C = cb[0].info.at;
      assert(segs.length === 2, 'X lines ' + segs.length);
      segs.forEach(function (s) {
        for (var i = 0; i <= 200; i++) {
          var x = s.a[0] + (s.b[0] - s.a[0]) * i / 200, y = s.a[1] + (s.b[1] - s.a[1]) * i / 200;
          assert(!(x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1), 'note box crosses an X line at ' + x.toFixed(3) + ', ' + y.toFixed(3));
        }
      });
      var dist = Math.max(0, b.x0 - C[0], C[0] - b.x1) + Math.max(0, b.y0 - C[1], C[1] - b.y1);
      assert(dist < 0.5, 'note ' + dist.toFixed(3) + ' in from the crossing');
      var svg = HX.toSVG(sh), dxf = HX.toDXF(sh);
      assert(svg.indexOf('>' + want + '<') >= 0, 'SVG');
      assert(dxf.indexOf(want.replace('°', '%%d')) >= 0 && /BEND_NOTES/.test(dxf), 'DXF');
      HX.flatAnnotation(d.doc, d.v.id, cb[0].key, { off: [0.25, -0.5] });
      var c2 = rfHXItems(rfHXSheet(r, JSON.parse(JSON.stringify(d.doc))), 'crossBreakNote')[0];
      assert(Math.abs(c2.box.x0 - b.x0 - 0.25) < 1e-9 && Math.abs(c2.box.y0 - b.y0 + 0.5) < 1e-9, 'dragged ' + JSON.stringify(c2.box));
      d.v.bendNotes = 'none';
      assert(!rfHXItems(rfHXSheet(r, d.doc), 'crossBreakNote').length, 'bend notes off');
      return cb[0].text + ' at ' + C.map(function (x) { return x.toFixed(3); }) + ', box ' + [b.x0, b.y0].map(function (x) { return x.toFixed(3); });
    });

    test('rfHX: Empty View — no model linework, its sketch moves with it, nothing projects from it, saved', function () {
      var r = build('p.units("in");\np.box(2, 1, 0.5);');
      noErrors(r);
      var doc = HX.newDrawing(r.model, { date: '2026-11-04' });
      HX.standard3View(doc, r.mesh, 'in');
      var ev = HX.addEmptyView(doc, { x: 3, y: 3 });
      assert(ev.kind === 'empty' && ev.x === 3 && ev.y === 3, JSON.stringify(ev));
      var ln = HX.addSketchEntity(doc, { t: 'line', a: [3, 3], b: [5, 4] }, ev.id);
      var sh = HX.compute(doc, r.mesh, r.model), w = sh.views.filter(function (x) { return x.view.id === ev.id; })[0];
      assert(w && w.layer === 'EMPTY_VIEW' && !w.ortho, 'view ' + (w && w.layer));
      assert(!sh.prims.some(function (p) { return p.layer === 'EMPTY_VIEW'; }), 'model linework in the empty view');
      assert(w.box.x0 <= 3 && w.box.x1 >= 5 && w.box.y0 <= 3 && w.box.y1 >= 4, 'box ' + JSON.stringify(w.box));
      assert(!sh.dims.some(function (dm) { return dm.view === ev.id; }), 'model items in the empty view');
      ev.x += 1; ev.y -= 0.5;
      var moved = HX.sketchEntity(doc, ln.id);
      assert(moved.a[0] === 4 && moved.a[1] === 2.5 && moved.view === ev.id, 'sketch ' + JSON.stringify(moved));
      ['addProjectedView', 'addSectionView', 'addDetailView'].forEach(function (fn) {
        var threw = false;
        try { HX[fn](doc, r.mesh, ev.id, fn === 'addProjectedView' ? 'right' : { axis: 'h', at: 0, c: [0, 0], r: 0.5 }); } catch (e) { threw = /empty/.test(e.message); }
        assert(threw, fn + ' from an empty view');
      });
      var back = JSON.parse(JSON.stringify(doc)), sh2 = HX.compute(back, r.mesh, r.model);
      assert(sh2.views.some(function (x) { return x.view.kind === 'empty'; }) && HX.toDXF(sh2).length > 0, 'reload');
      return 'box ' + [w.box.x0, w.box.y0, w.box.x1, w.box.y1].map(function (x) { return x.toFixed(2); }).join(' ');
    });

    test('rfHX: Hide/Show Annotations — hidden notes, dimensions, centre marks and bend notes leave the sheet and exports, show grey while the tool runs, come back', function () {
      var r = build(BASE + rfHXFlange([4, T, 1]));
      noErrors(r);
      var d = { doc: HX.newDrawing(r.model, { date: '2026-11-04' }) };
      HX.standard3View(d.doc, r.mesh, 'in');
      d.v = HX.addFlatView(d.doc, r.mesh, { model: r.model, build: r.build, x: 14, y: 3 });
      HX.addNote(d.doc, { p: [2, 1], text: 'BREAK ALL EDGES' });
      var sh = rfHXSheet(r, d.doc), note = sh.notes[0], bn = rfHXItems(sh, 'bendNote')[0], dim = sh.dims[0];
      assert(note && bn && dim && dim.key, 'items ' + [!!note, !!bn, !!(dim && dim.key)]);
      HX.setAnnotationHidden(d.doc, { kind: 'note', id: note.id }, true);
      HX.setAnnotationHidden(d.doc, { kind: 'flat', view: d.v.id, key: bn.key }, true);
      HX.setAnnotationHidden(d.doc, { kind: 'dim', key: dim.key }, true);
      assert(HX.hiddenAnnotationCount(d.doc) === 3, 'count ' + HX.hiddenAnnotationCount(d.doc));
      var saved = JSON.parse(JSON.stringify(d.doc)), off = rfHXSheet(r, saved), svg = HX.toSVG(off), dxf = HX.toDXF(off);
      assert(svg.indexOf('BREAK ALL EDGES') < 0 && dxf.indexOf('BREAK ALL EDGES') < 0, 'note left in the exports');
      assert(svg.indexOf(bn.text.replace('°', '°')) < 0, 'bend note in the SVG');
      assert(off.dims.length === sh.dims.length - 1 && !off.dims.some(function (x) { return x.key === dim.key; }), 'dims ' + off.dims.length);
      var on = HX.compute(saved, r.mesh, r.model, { build: r.build, showHidden: true });
      var grey = on.prims.filter(function (p) { return p.color === 'hiddenAnn'; });
      assert(grey.some(function (p) { return p.text === 'BREAK ALL EDGES'; }) && grey.some(function (p) { return p.dimIx != null; }) && grey.some(function (p) { return p.layer === 'BEND_NOTES'; }), 'grey ' + grey.length);
      assert(on.dims.length === sh.dims.length && on.dims.filter(function (x) { return x.hidden; }).length === 1, 'dims while the tool runs');
      // showing them grey moves no other dimension
      off.dims.forEach(function (x) { var y = on.dims.filter(function (z) { return z.key === x.key && z.view === x.view; })[0]; assert(y && Math.abs(y.box.x0 - x.box.x0) < 1e-9 && Math.abs(y.box.y0 - x.box.y0) < 1e-9, 'moved ' + x.key); });
      assert(/#a8a8a8/.test(HX.toSVG(on)), 'grey in SVG');
      HX.setAnnotationHidden(saved, { kind: 'note', id: note.id }, false);
      HX.setAnnotationHidden(saved, { kind: 'flat', view: d.v.id, key: bn.key }, false);
      HX.setAnnotationHidden(saved, { kind: 'dim', key: dim.key }, false);
      var back = rfHXSheet(r, saved);
      assert(back.dims.length === sh.dims.length && HX.toSVG(back).indexOf('BREAK ALL EDGES') >= 0 && !saved.hiddenAnn && HX.hiddenAnnotationCount(saved) === 0, 'shown again');
      return '3 hidden, ' + grey.length + ' grey primitives while the tool runs';
    });
  })();
