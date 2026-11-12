  // --- rfCX (2026-10-20, lane CX: drawing views) --- Removed Section with the mouse (View Layout ▸ Removed Section: an
  // edge, the opposite edge, a click anywhere on the sheet), one undo step, following the part when it changes, Esc.
  var CX_ANGLE = 'p.name("CXAngle").units("in");\np.sketch("Front").polyline([[0,0],[1.5,0],[1.5,0.125],[0.125,0.125],[0.125,1.5],[0,1.5]], true).extrude(4);';
  async function rfCXDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(CX_ANGLE); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    UI.drawing.fit(); await wait(20);
    return anvil.drawing.summary();
  }
  function rfCXMouse(type, p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    svg.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: q.x, clientY: q.y, detail: 1 }));
  }
  function rfCXClick(p) { rfCXMouse('mousemove', p); rfCXMouse('mousedown', p); rfCXMouse('mouseup', p); }
  function rfCXWin(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfCXArea(w) { var a = 0; w.content.caps.forEach(function (c) { c.loops.forEach(function (l) { var s = 0; for (var i = 0, j = l.length - 1; i < l.length; j = i++) s += (l[j][0] + l[i][0]) * (l[j][1] - l[i][1]); a += Math.abs(s / 2); }); }); return a; }
  function rfCXButton(label) {
    var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
    var b = find();
    if (!b) { var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === 'View Layout'; })[0]; if (tab) { tab.click(); b = find(); } }
    assert(b, 'ribbon button ' + label);
    return b;
  }
  function rfCXFree(w, h) {
    var st = UI.drawing.state, S = st.sheet.size, boxes = st.sheet.views.map(function (x) { return x.box; }), g = S[0] / 60;
    for (var y = S[1] - g - h; y > S[1] * 0.2; y -= g / 4) for (var x = g; x + w < S[0] - g; x += g / 4) {
      if (boxes.every(function (b) { return x + w < b.x0 - g || x > b.x1 + g || y + h < b.y0 - 2 * g || y > b.y1 + g; })) return [x + w / 2, y + h / 2];
    }
    return null;
  }
  function rfCXSelect(val) { var el = pmField('Scale'); if (!el || el.tagName !== 'SELECT' || !Array.prototype.some.call(el.options, function (o) { return o.value === val; })) return false; el.value = val; el.dispatchEvent(new W.Event('change', { bubbles: true })); return true; }
  async function rfCXUntil(ok) { var t0 = Date.now(); while (!ok() && Date.now() - t0 < 4000) await wait(40); }

  step('rfCX: View Layout ▸ Removed Section — click the Top view\'s left edge, its right edge, then a free spot: the angle\'s L cross-section alone (.359375 sq in, hatched, SECTION A-A), the cutting line on the Top view, one undo step; Ctrl+Z takes it off, Ctrl+Y puts it back; in the SVG and DXF', async function () {
    var errs0 = errors.length, s = await rfCXDrawing(), top = s.views.filter(function (v) { return v.orient === 'Top'; })[0];
    rfCXButton('Removed Section').click(); await wait(20);
    assert(UI.drawing.state.tool === 'rmsec' && UI.pmSpec() && UI.pmTitle() === 'Removed Section', 'tool and PM: ' + UI.drawing.state.tool + ' / ' + (UI.pmSpec() && UI.pmTitle()));
    var w = rfCXWin(top.id), ym = (w.box.y0 + w.box.y1) / 2, n0 = UI.App.undo.length, nv = anvil.drawing.summary().views.length;
    rfCXClick([w.box.x0, ym]); await wait(10);
    assert(UI.drawing.state.pending && UI.drawing.state.pending.parent === top.id, 'first edge picked on the Top view');
    rfCXClick([w.box.x1, ym + 0.05]); await wait(10);
    var P = UI.drawing.state.pending;
    assert(P && P.b && Math.abs(P.a[1] - P.b[1]) < 1e-12 && Math.abs(Math.abs(P.b[0] - P.a[0]) - 1.5) < 1e-6, 'square to the first, edge to edge: ' + JSON.stringify(P && [P.a, P.b]));
    var spot = rfCXFree(2, 2);
    assert(spot, 'a free spot');
    rfCXMouse('mousemove', spot); await wait(10);
    assert(UI.drawing.state.preview && UI.drawing.state.preview.ghost, 'the section\'s box follows the pointer');
    rfCXClick(spot);
    await idle(); await UI.drawing.ready(); await wait(30);
    var s2 = anvil.drawing.summary(), v = s2.views[s2.views.length - 1];
    assert(s2.views.length === nv + 1 && v.kind === 'section' && !UI.drawing.state.tool && !UI.pmSpec(), 'one view added, tool and PM closed');
    var dv = anvil.drawing.doc().views.filter(function (x) { return x.id === v.id; })[0];
    assert(dv.section.removed && dv.align == null && Math.abs(dv.x - spot[0]) < 0.05 && Math.abs(dv.y - spot[1]) < 0.05, 'removed, at the click ' + JSON.stringify(dv));
    var wv = rfCXWin(v.id);
    assert(Math.abs(rfCXArea(wv) - 0.359375) < 1e-9 && wv.hatch > 5 && wv.proj.stats.visibleLines === 6, 'the L face ' + rfCXArea(wv) + ' / ' + wv.hatch + ' / ' + wv.proj.stats.visibleLines);
    assert(UI.App.undo.length === n0 + 1, 'one undo step ' + (UI.App.undo.length - n0));
    var svg = D.querySelector('#drawing-sheet svg').outerHTML;
    assert(svg.indexOf('SECTION ' + dv.label + '-' + dv.label) > 0 && anvil.drawing.dxf().indexOf('SECTION_' + dv.label) > 0, 'in the SVG and DXF');
    assert(D.querySelector('#tree [data-view="' + v.id + '"]') || D.querySelector('[data-view="' + v.id + '"]'), 'a tree row');
    UI.undoCommand(); await idle(); await UI.drawing.ready(); await wait(30);
    assert(anvil.drawing.summary().views.length === nv, 'Ctrl+Z takes it off');
    UI.redoCommand(); await idle(); await UI.drawing.ready(); await wait(30);
    assert(anvil.drawing.summary().views.length === nv + 1 && rfCXWin(v.id), 'Ctrl+Y puts it back');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return dv.name;
  });

  step('rfCX: Use parent scale — the Top view set to 1:2 in its PropertyManager draws the removed section at 1:2 too (SCALE 1 : 2); the section\'s PropertyManager shows Use parent scale and no Partial section box; a custom 1:1 there stays when the Top view goes back', async function () {
    var errs0 = errors.length, doc = anvil.drawing.doc(), v = doc.views.filter(function (x) { return x.section && x.section.removed; })[0];
    var top = doc.views.filter(function (x) { return x.id === v.parent; })[0];
    async function props(id) {
      var w = rfCXWin(id), c = [(w.box.x0 + w.box.x1) / 2, (w.box.y0 + w.box.y1) / 2];
      UI.drawing.state.sel = { kind: 'view', id: id };
      UI.drawing.viewProperties(id); await wait(30);
      assert(UI.pmSpec(), 'view properties of ' + w.view.name);
    }
    await props(top.id);
    assert(rfCXSelect('1:2'), 'scale field');
    D.querySelector('#pm .pm-ok').click();
    await idle(); await UI.drawing.ready(); await wait(30);
    doc = anvil.drawing.doc(); v = doc.views.filter(function (x) { return x.id === v.id; })[0];
    var w = rfCXWin(v.id), t = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === w.layer; }).map(function (p) { return p.text; });
    assert(JSON.stringify(v.scale) === '[1,2]' && Math.abs(w.scale - 0.5) < 1e-12 && t.indexOf('SCALE 1 : 2') >= 0, 'follows the Top view: ' + JSON.stringify(v.scale) + ' ' + t.join('|'));
    await props(v.id);
    assert(UI.pmSpec().values.scale === 'parent' && !pmField('Partial section'), 'Use parent scale, no Partial section box');
    assert(rfCXSelect('1:1'), 'custom 1:1');
    D.querySelector('#pm .pm-ok').click();
    await idle(); await UI.drawing.ready(); await wait(30);
    await props(top.id);
    rfCXSelect('sheet');
    D.querySelector('#pm .pm-ok').click();
    await idle(); await UI.drawing.ready(); await wait(30);
    v = anvil.drawing.doc().views.filter(function (x) { return x.id === v.id; })[0];
    assert(JSON.stringify(v.scale) === '[1,1]' && !v.section.parentScale, 'the custom scale stays: ' + JSON.stringify(v));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ok';
  });
  step('rfCX: the removed section follows the part — the angle made .25 thick re-cuts (.6875 sq in) and Undo brings .125 back; Esc ends the tool half-way with its PropertyManager', async function () {
    var errs0 = errors.length, v = anvil.drawing.doc().views.filter(function (x) { return x.section && x.section.removed; })[0];
    assert(v, 'the removed section from the step before');
    var sk = UI.App.model.features.filter(function (f) { return f.type === 'sketch'; })[0], ent = sk.entities.filter(function (e) { return e.t === 'polyline'; })[0];
    assert(ent && ent.pts, 'the angle\'s polyline');
    UI.pushUndo();
    ent.pts = ent.pts.map(function (q) { return q.map(function (x) { return Math.abs(x - 0.125) < 1e-9 ? 0.25 : x; }); });
    await UI.rebuild(); await idle(); await rfCXUntil(function () { var w = rfCXWin(v.id); return w && !w.pending && Math.abs(rfCXArea(w) - 0.6875) < 1e-9; });
    assert(Math.abs(rfCXArea(rfCXWin(v.id)) - 0.6875) < 1e-9, 'thicker: ' + rfCXArea(rfCXWin(v.id)));
    UI.undoCommand(); await idle(); await rfCXUntil(function () { var w = rfCXWin(v.id); return w && !w.pending && Math.abs(rfCXArea(w) - 0.359375) < 1e-9; });
    assert(Math.abs(rfCXArea(rfCXWin(v.id)) - 0.359375) < 1e-9, 'undone: ' + rfCXArea(rfCXWin(v.id)));
    // Esc after the first edge: the tool and its PM end, nothing added
    var top = anvil.drawing.summary().views.filter(function (x) { return x.orient === 'Top'; })[0], w = rfCXWin(top.id), nv = anvil.drawing.summary().views.length;
    rfCXButton('Removed Section').click(); await wait(20);
    rfCXClick([w.box.x0, (w.box.y0 + w.box.y1) / 2]); await wait(10);
    key('Escape'); await idle();
    assert(!UI.drawing.state.tool && !UI.pmSpec() && anvil.drawing.summary().views.length === nv, 'Esc ends it: ' + UI.drawing.state.tool);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return 'ok';
  });

  step('rfCX2: an offset and an aligned section are cut in drawing-worker.js (the cut part comes back as a structured copy, not built on the main thread), drawn the same as the synchronous engine', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("CX2Plate").units("mm");\np.box(120, 80, 10);\np.hole("Top", 30, -20, 10, { offset: 10 });\np.hole("Top", 90, -60, 10, { offset: 10 });'); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await UI.drawing.ready();
    var top = anvil.drawing.summary().views.filter(function (v) { return v.orient === 'Top'; })[0];
    // (auto-inserted centre marks need every view's content at once: Drawing.autoInsert works it out on the main thread)
    anvil.drawing.options({ autoCenterMarks: false, autoCenterlines: false }); await idle();
    anvil.drawing.sectionView(top.id, { axis: 'h', at: -20, type: 'offset', jogs: [{ t: 60, at: -60 }] });
    anvil.drawing.sectionView(top.id, { axis: 'v', at: 30, type: 'aligned', c: -40, side: 1, angle: 30 });
    await idle(); await UI.drawing.ready(); await wait(30);
    // (a script call settles the sheet on the main thread; the part rebuilt, the drawing redraws as the app does: lazily,
    // the cuts sent to the worker)
    var m0 = UI.App.mesh;
    UI.pushUndo(); UI.App.model.features.forEach(function (f) { if (f.type === 'hole' || f.hole) { if (f.d) f.d = 11; if (f.diameter) f.diameter = 11; } });
    await UI.rebuild({ fresh: true }); await idle();   // (rfMG) fresh: a rebuild that leaves the solids alone keeps the mesh, and this step wants the drawing to redraw from a new one
    assert(UI.App.mesh !== m0, 'a new mesh');
    var t0 = Date.now(), filed = [], basePut = W.Drawing.putSection;
    // (every path cut the drawing files through putSection: 'worker' when it came back from drawing-worker.js as a
    // structured copy, 'here' when the main thread worked the job out after a worker failure)
    W.Drawing.putSection = function (m, sec, fr, di, ta, r) {
      if (sec && sec.path) { var f0 = r && r.section && r.section.mesh && r.section.mesh.faces[0], pg = f0 && f0.polys && f0.polys[0]; filed.push(pg && !(pg instanceof W.CSG.Polygon) ? 'worker' : 'here'); }
      return basePut.apply(this, arguments);
    };
    function pathCuts() { var c = UI.App.mesh._drawingSections || {}; return Object.keys(c).filter(function (k) { return k.indexOf('P|') === 0; }).length; }
    try { while (Date.now() - t0 < 6000 && pathCuts() < 2) await wait(40); } finally { W.Drawing.putSection = basePut; }
    await UI.drawing.ready(); await wait(30);
    var doc = anvil.drawing.doc(), typed = doc.views.filter(function (v) { return v.section && v.section.type; });
    assert(typed.length === 2, 'two typed sections');
    var cache = UI.App.mesh._drawingSections || {}, keys = Object.keys(cache).filter(function (k) { return k.indexOf('P|') === 0; });
    assert(keys.length === 2, 'two path cuts filed: ' + keys.length + ' of ' + Object.keys(cache).map(function (k) { return k.slice(0, 12); }).join(' ') + ' · waited ' + (Date.now() - t0) + ' ms · views ' + UI.drawing.state.sheet.views.map(function (w) { return w.view.id + (w.pending ? 'p' : '') + ':' + w.hatch; }).join(' '));
    assert(filed.length === 2, 'both cuts came as jobs (not inside the sheet\'s compute): ' + filed.join(', '));
    var sheet = UI.drawing.state.sheet, sync = W.Drawing.compute(JSON.parse(JSON.stringify(doc)), W.Kernel.meshFromBody(W.Kernel.rebuild(JSON.parse(JSON.stringify(UI.App.model))).body), UI.App.model);
    typed.forEach(function (v) {
      var a = sheet.views.filter(function (w) { return w.view.id === v.id; })[0], b = sync.views.filter(function (w) { return w.view.id === v.id; })[0];
      assert(a && !a.pending && a.hatch === b.hatch && a.proj.lines.visible.length === b.proj.lines.visible.length, v.name + ': ' + (a && a.hatch) + ' / ' + b.hatch + ' hatch, ' + (a && a.proj.lines.visible.length) + ' / ' + b.proj.lines.visible.length + ' lines');
    });
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    anvil.drawing.close(); await idle();
    return typed.map(function (v) { return v.section.type; }).join(', ') + ' cut by ' + filed.join(', ');
  });
